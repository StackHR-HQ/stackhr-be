import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  createHash,
  randomBytes,
  randomUUID,
  scrypt,
  timingSafeEqual,
} from 'node:crypto';
import * as argon2 from 'argon2';
import { PrismaService } from '../database/prisma.service';
import { EmailService } from '../notifications/email.service';
import {
  SESSION_COOKIE_NAME,
  SESSION_DURATION_MS,
  USER_ROLES,
  USER_TYPES,
  type UserRole,
  type UserType,
} from './auth.constants';
import type { AuthenticatedUser } from './auth.types';
import {
  passwordResetEmail,
  verificationEmail,
} from '../notifications/email-templates';
import type { ForgotPasswordDto } from './dto/forgot-password.dto';
import type { ResetPasswordDto } from './dto/reset-password.dto';
import type { ChangePasswordDto } from './dto/change-password.dto';

interface SignupBusinessInput {
  email: string;
  password: string;
  confirmPassword: string;
  companyName: string;
  organizationSlug?: string;
}

interface LoginInput {
  email: string;
  password: string;
  orgSlug?: string;
}

interface SessionOptions {
  ipAddress?: string;
  userAgent?: string;
}

interface UserRecord {
  id: string;
  name: string;
  email: string;
  userType: string;
  role: string | null;
  memberships: Array<{
    organizationId: string;
    role: string;
    organization: { name: string; slug: string };
  }>;
}

interface SessionCacheEntry {
  user: AuthenticatedUser;
  expiresAt: number; // Date.now() ms
}

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly sessionCache = new Map<string, SessionCacheEntry>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.ensureConfiguredAdmin();
  }

  /** What the accept page shows before the employee sets or confirms a password. */
  async previewInvitation(token: string) {
    const invitation = await this.findPendingInvitation(token);
    const existingUser = await this.prisma.user.findUnique({
      where: { email: invitation.email },
    });

    return {
      employeeName: invitation.employee.fullName,
      email: invitation.email,
      organizationName: invitation.organization.name,
      expiresAt: invitation.expiresAt,
      hasAccount: Boolean(existingUser),
    };
  }

  /**
   * Grants an invited employee access to the self-service portal: a verified
   * EMPLOYEE membership in the inviting organization, linked to their employee
   * record, which moves to ONBOARDING until onboarding is completed.
   */
  async acceptEmployeeInvitation(
    input: { token: string; password: string },
    options: SessionOptions,
  ) {
    const invitation = await this.findPendingInvitation(input.token);
    const password = this.validatePassword(input.password);
    const existingUser = await this.prisma.user.findUnique({
      where: { email: invitation.email },
    });

    // Emails are unique across StackHR, so an existing account is linked
    // rather than duplicated, and only after its own password is confirmed.
    if (
      existingUser &&
      (existingUser.banned ||
        !existingUser.passwordHash ||
        !(await this.verifyPassword(password, existingUser.passwordHash)))
    ) {
      throw new UnauthorizedException('Invalid email or password');
    }
    const passwordHash = existingUser
      ? null
      : await this.hashPassword(password);

    const user = await this.prisma.$transaction(async (transaction) => {
      const created =
        existingUser ??
        (await transaction.user.create({
          data: {
            id: randomUUID(),
            name: invitation.employee.fullName,
            email: invitation.email,
            passwordHash,
            // The emailed link proves ownership of the address.
            emailVerified: true,
            userType: USER_TYPES.BUSINESS,
            role: USER_ROLES.EMPLOYEE,
          },
        }));
      // Membership first: the database refuses an employee link without it.
      const membership = await transaction.member.findFirst({
        where: {
          organizationId: invitation.organizationId,
          userId: created.id,
        },
      });
      if (!membership) {
        await transaction.member.create({
          data: {
            id: randomUUID(),
            organizationId: invitation.organizationId,
            userId: created.id,
            role: USER_ROLES.EMPLOYEE,
            createdAt: new Date(),
          },
        });
      }
      await transaction.employee.update({
        where: {
          id: invitation.employee.id,
          organizationId: invitation.organizationId,
        },
        data: { userId: created.id, status: 'ONBOARDING' },
      });
      await transaction.invitation.update({
        where: { id: invitation.id },
        data: { status: 'accepted' },
      });
      return created;
    });

    const authenticatedUser = this.toAuthenticatedUser(
      {
        ...user,
        memberships: [
          {
            organizationId: invitation.organizationId,
            role: USER_ROLES.EMPLOYEE,
            organization: invitation.organization,
          },
        ],
      },
      invitation.organizationId,
    );
    const token = await this.createSession(
      user.id,
      options,
      invitation.organizationId,
    );
    return { user: authenticatedUser, token };
  }

  /**
   * Unknown, used and expired links are indistinguishable to the caller so a
   * token cannot be probed for its state.
   */
  private async findPendingInvitation(token: string) {
    const invitation =
      typeof token === 'string' && token
        ? await this.prisma.invitation.findUnique({
            where: { tokenHash: this.hashToken(token) },
            include: {
              employee: { select: { id: true, fullName: true } },
              organization: { select: { name: true, slug: true } },
            },
          })
        : null;
    if (
      !invitation?.employee ||
      invitation.status !== 'pending' ||
      invitation.expiresAt.getTime() <= Date.now()
    ) {
      throw new NotFoundException(
        'This invitation link is invalid or has expired',
      );
    }
    return { ...invitation, employee: invitation.employee };
  }

  async signupBusiness(input: SignupBusinessInput): Promise<{
    email: string;
    expiresAt: Date;
    devCode?: string;
  }> {
    const email = this.normalizeEmail(input.email);
    const password = this.validatePassword(input.password);
    if (password !== input.confirmPassword) {
      throw new BadRequestException('Passwords do not match');
    }

    const organizationName = this.requiredString(
      input.companyName,
      'companyName',
    );
    const slug = this.slugify(input.organizationSlug || organizationName);

    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });
    if (existingUser) {
      throw new ConflictException('An account with this email already exists');
    }

    const existingOrganization = await this.prisma.organization.findUnique({
      where: { slug },
    });
    if (existingOrganization) {
      throw new ConflictException(
        'An organization with this slug already exists',
      );
    }

    const passwordHash = await this.hashPassword(password);
    const userId = randomUUID();
    const organizationId = randomUUID();

    await this.prisma.$transaction(async (transaction) => {
      await transaction.user.create({
        data: {
          id: userId,
          name: organizationName,
          email,
          passwordHash,
          userType: USER_TYPES.BUSINESS,
          role: USER_ROLES.BUSINESS_OWNER,
        },
      });

      await transaction.organization.create({
        data: {
          id: organizationId,
          name: organizationName,
          slug,
          ownerId: userId,
          createdAt: new Date(),
        },
      });

      await transaction.member.create({
        data: {
          id: randomUUID(),
          organizationId,
          userId,
          role: USER_ROLES.BUSINESS_OWNER,
          createdAt: new Date(),
        },
      });
    });

    return this.issueEmailVerification(email);
  }

  async verifyBusinessEmail(
    emailInput: string,
    codeInput: string,
    options: SessionOptions,
  ) {
    const email = this.normalizeEmail(emailInput);
    const code = this.validateVerificationCode(codeInput);
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: {
        memberships: {
          select: {
            organizationId: true,
            role: true,
            organization: { select: { name: true, slug: true } },
          },
        },
      },
    });

    if (!user || user.userType !== USER_TYPES.BUSINESS) {
      throw new BadRequestException('The verification request is invalid');
    }

    if (user.emailVerified) {
      throw new BadRequestException('This email is already verified');
    }

    const verification = await this.prisma.verification.findFirst({
      where: { identifier: email, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });

    if (
      !verification ||
      !this.matchesVerificationCode(email, code, verification.value)
    ) {
      throw new BadRequestException(
        'The verification code is invalid or expired',
      );
    }

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: user.id },
        data: { emailVerified: true },
      }),
      this.prisma.verification.delete({ where: { id: verification.id } }),
    ]);

    const authenticatedUser = this.toAuthenticatedUser(user);
    const token = await this.createSession(
      user.id,
      options,
      authenticatedUser.organizationId,
    );

    return {
      user: { ...authenticatedUser },
      token,
      onboarding: {
        organizationId: authenticatedUser.organizationId,
        nextStep: 'COMPANY_INFO',
      },
    };
  }

  async resendBusinessVerification(emailInput: string) {
    const email = this.normalizeEmail(emailInput);
    const user = await this.prisma.user.findUnique({ where: { email } });

    if (!user || user.userType !== USER_TYPES.BUSINESS || user.emailVerified) {
      return { accepted: true, email };
    }

    const verification = await this.issueEmailVerification(email);
    return { accepted: true, ...verification };
  }

  async loginBusiness(input: LoginInput, options: SessionOptions) {
    return this.login(input, USER_TYPES.BUSINESS, options);
  }

  async loginStackhrAdmin(input: LoginInput, options: SessionOptions) {
    return this.login(input, USER_TYPES.STACKHR_ADMIN, options);
  }

  async forgotPassword(emailInput: ForgotPasswordDto) {
    const email = this.normalizeEmail(emailInput.email);
    const genericResponse = {
      success: true,
      message:
        'If an account exists with this email, a password reset link has been sent.',
    };

    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      return genericResponse;
    }

    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = this.hashToken(rawToken);
    const identifier = `password-reset:${email}`;
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    await this.prisma.verification.deleteMany({
      where: { identifier },
    });

    await this.prisma.verification.create({
      data: {
        id: randomUUID(),
        identifier,
        value: tokenHash,
        expiresAt,
      },
    });

    const resetUrl = `${process.env.STACKHR_APP_URL || 'https://app.stackhr.app'}/reset-password?token=${rawToken}`;

    const apiKey = process.env.SENDBYTE_API_KEY ?? process.env.SENDBYTE_KEY;
    if (apiKey) {
      await this.emailService.send({
        to: email,
        ...passwordResetEmail(resetUrl),
        idempotencyKey: `password-reset:${email}:${expiresAt.getTime()}`,
      });
    }

    return genericResponse;
  }

  async verifyResetToken(rawToken: string) {
    if (!rawToken || typeof rawToken !== 'string') {
      throw new BadRequestException('A valid reset token is required');
    }

    const tokenHash = this.hashToken(rawToken);
    const verification = await this.prisma.verification.findFirst({
      where: {
        value: tokenHash,
        expiresAt: { gt: new Date() },
      },
    });

    if (
      !verification ||
      !verification.identifier.startsWith('password-reset:')
    ) {
      throw new BadRequestException('Invalid or expired password reset link');
    }

    const email = verification.identifier.slice('password-reset:'.length);
    return { valid: true, email };
  }

  async resetPassword(input: ResetPasswordDto) {
    const password = this.validatePassword(input.password);
    if (password !== input.confirmPassword) {
      throw new BadRequestException('Passwords do not match');
    }

    if (!input.token || typeof input.token !== 'string') {
      throw new BadRequestException('A valid reset token is required');
    }

    const tokenHash = this.hashToken(input.token);
    const verification = await this.prisma.verification.findFirst({
      where: {
        value: tokenHash,
        expiresAt: { gt: new Date() },
      },
    });

    if (
      !verification ||
      !verification.identifier.startsWith('password-reset:')
    ) {
      throw new BadRequestException('Invalid or expired password reset link');
    }

    const email = verification.identifier.slice('password-reset:'.length);
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new BadRequestException('User account no longer exists');
    }

    const passwordHash = await this.hashPassword(password);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash },
    });

    await this.prisma.session.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    this.evictUserSessions(user.id);

    await this.prisma.verification.delete({ where: { id: verification.id } });

    return {
      success: true,
      message:
        'Password has been reset successfully. Please log in with your new password.',
    };
  }

  async changePassword(userId: string, input: ChangePasswordDto) {
    const newPassword = this.validatePassword(input.newPassword);
    if (newPassword !== input.confirmPassword) {
      throw new BadRequestException('Passwords do not match');
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('Invalid user or password not set');
    }

    const isCurrentValid = await this.verifyPassword(
      input.currentPassword,
      user.passwordHash,
    );
    if (!isCurrentValid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    const newPasswordHash = await this.hashPassword(newPassword);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: newPasswordHash },
    });

    await this.prisma.session.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    this.evictUserSessions(user.id);

    return {
      success: true,
      message: 'Password changed successfully. Please log in again.',
    };
  }

  async logout(token: string): Promise<void> {
    const tokenHash = this.hashToken(token);
    await this.prisma.session.updateMany({
      where: { token: tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    this.evictSession(tokenHash);
  }

  async validateSession(token: string): Promise<AuthenticatedUser | null> {
    const tokenHash = this.hashToken(token);

    // --- Cache read ---
    const cached = this.getCachedSession(tokenHash);
    if (cached !== undefined) {
      return cached;
    }

    // --- Cache miss: query Postgres ---
    const session = await this.prisma.session.findUnique({
      where: { token: tokenHash },
      include: {
        user: {
          include: {
            memberships: {
              select: {
                organizationId: true,
                role: true,
                organization: { select: { name: true, slug: true } },
              },
            },
          },
        },
      },
    });

    if (
      !session ||
      session.revokedAt ||
      session.expiresAt <= new Date() ||
      session.user.banned
    ) {
      return null;
    }

    if (
      session.activeOrganizationId &&
      !session.user.memberships.some(
        (member) => member.organizationId === session.activeOrganizationId,
      )
    )
      return null;

    const user = this.toAuthenticatedUser(
      session.user,
      session.activeOrganizationId,
    );

    // --- Cache write: TTL = remaining session lifetime ---
    this.setCachedSession(tokenHash, user, session.expiresAt);

    return user;
  }

  getTokenFromRequest(request: Request): string | null {
    const authorization = request.header('authorization');
    if (authorization?.startsWith('Bearer ')) {
      return authorization.slice('Bearer '.length).trim() || null;
    }

    const cookieHeader = request.header('cookie');
    if (!cookieHeader) {
      return null;
    }

    const cookie = cookieHeader.split(';').find((entry) => {
      return entry.trim().startsWith(`${SESSION_COOKIE_NAME}=`);
    });

    return cookie?.trim().slice(SESSION_COOKIE_NAME.length + 1) || null;
  }

  private cookieOptions(): {
    sameSite: 'None' | 'Lax' | 'Strict';
    secure: boolean;
  } {
    const isProd = process.env.NODE_ENV === 'production';
    const raw = (process.env.COOKIE_SAMESITE ?? (isProd ? 'None' : 'Lax'))
      .trim()
      .toLowerCase();

    const sameSite =
      raw === 'none' ? 'None' : raw === 'strict' ? 'Strict' : 'Lax';

    const secure =
      process.env.COOKIE_SECURE === 'true' || sameSite === 'None' || isProd;

    return { sameSite, secure };
  }

  private buildCookie(value: string, maxAgeSeconds: number): string {
    const { sameSite, secure } = this.cookieOptions();
    const parts = [
      `${SESSION_COOKIE_NAME}=${value}`,
      'HttpOnly',
      'Path=/v1/api',
      `Max-Age=${maxAgeSeconds}`,
      `SameSite=${sameSite}`,
    ];
    if (secure) parts.push('Secure');
    return parts.join('; ');
  }

  setSessionCookie(response: Response, token: string): void {
    response.append(
      'Set-Cookie',
      this.buildCookie(token, Math.floor(SESSION_DURATION_MS / 1000)),
    );
  }

  clearSessionCookie(response: Response): void {
    response.append('Set-Cookie', this.buildCookie('', 0));
  }

  async ensureConfiguredAdmin(): Promise<void> {
    const email = process.env.STACKHR_ADMIN_EMAIL;
    const password = process.env.STACKHR_ADMIN_PASSWORD;
    const name = process.env.STACKHR_ADMIN_NAME ?? 'StackHR Admin';

    if (!email || !password) {
      return;
    }

    const normalizedEmail = this.normalizeEmail(email);
    const existing = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (existing) {
      if (existing.userType !== USER_TYPES.STACKHR_ADMIN) {
        throw new ConflictException(
          'STACKHR_ADMIN_EMAIL belongs to a non-platform account',
        );
      }
      return;
    }

    await this.prisma.user.create({
      data: {
        id: randomUUID(),
        name,
        email: normalizedEmail,
        passwordHash: await this.hashPassword(this.validatePassword(password)),
        userType: USER_TYPES.STACKHR_ADMIN,
        role: USER_ROLES.STACKHR_ADMIN,
      },
    });
  }

  private async login(
    input: LoginInput,
    userType: UserType,
    options: SessionOptions,
  ) {
    const email = this.normalizeEmail(input.email);
    const password = this.validatePassword(input.password);
    const user = await this.prisma.user.findFirst({
      where: { email, userType },
      include: {
        memberships: {
          select: {
            organizationId: true,
            role: true,
            organization: { select: { name: true, slug: true } },
          },
        },
      },
    });

    if (!user?.passwordHash) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const isPasswordValid = await this.verifyPassword(
      password,
      user.passwordHash,
    );
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (!user.passwordHash.startsWith('$argon2')) {
      const newHash = await this.hashPassword(password);
      await this.prisma.user
        .update({
          where: { id: user.id },
          data: { passwordHash: newHash },
        })
        .catch(() => null);
    }

    if (user.banned) {
      throw new UnauthorizedException('This account is not available');
    }

    if (userType === USER_TYPES.BUSINESS && !user.emailVerified) {
      throw new UnauthorizedException(
        'Please verify your email before signing in',
      );
    }

    const membership =
      input.orgSlug === undefined
        ? user.memberships[0]
        : user.memberships.find(
            (member) =>
              member.organization.slug === input.orgSlug?.trim().toLowerCase(),
          );
    if (userType === USER_TYPES.BUSINESS && !membership) {
      throw new UnauthorizedException('Invalid workspace, email or password');
    }
    const authenticatedUser = this.toAuthenticatedUser(
      user,
      membership?.organizationId,
    );
    const token = await this.createSession(
      user.id,
      options,
      authenticatedUser.organizationId,
    );
    return { user: authenticatedUser, token };
  }

  private async createSession(
    userId: string,
    options: SessionOptions,
    organizationId: string | null,
  ): Promise<string> {
    const token = randomBytes(32).toString('base64url');

    await this.prisma.session.create({
      data: {
        id: randomUUID(),
        token: this.hashToken(token),
        userId,
        activeOrganizationId: organizationId,
        expiresAt: new Date(Date.now() + SESSION_DURATION_MS),
        ipAddress: options.ipAddress,
        userAgent: options.userAgent,
      },
    });

    return token;
  }

  private async issueEmailVerification(email: string) {
    const code = this.generateVerificationCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await this.prisma.verification.deleteMany({
      where: { identifier: email },
    });
    await this.prisma.verification.create({
      data: {
        id: randomUUID(),
        identifier: email,
        value: this.hashVerificationCode(email, code),
        expiresAt,
      },
    });

    const apiKey = process.env.SENDBYTE_API_KEY ?? process.env.SENDBYTE_KEY;
    if (apiKey) {
      await this.emailService.send({
        to: email,
        ...verificationEmail(code),
        idempotencyKey: `business-signup-verification:${email}:${expiresAt.getTime()}`,
      });
      return { email, expiresAt };
    }

    if (process.env.NODE_ENV === 'production') {
      throw new BadRequestException('Email verification is not configured');
    }

    return { email, expiresAt, devCode: code };
  }

  private generateVerificationCode(): string {
    return String(Math.floor(100000 + Math.random() * 900000));
  }

  private validateVerificationCode(value: string): string {
    if (!/^\d{6}$/.test(value)) {
      throw new BadRequestException('Verification code must be 6 digits');
    }
    return value;
  }

  private hashVerificationCode(email: string, code: string): string {
    return createHash('sha256')
      .update(
        `${email}:${code}:${process.env.AUTH_SECRET ?? 'development-only-secret'}`,
      )
      .digest('hex');
  }

  private matchesVerificationCode(
    email: string,
    code: string,
    digest: string,
  ): boolean {
    return timingSafeEqual(
      Buffer.from(this.hashVerificationCode(email, code), 'hex'),
      Buffer.from(digest, 'hex'),
    );
  }

  toFrontendUser(user: AuthenticatedUser) {
    const businessRoles: Partial<Record<UserRole, string>> = {
      BUSINESS_OWNER: 'admin',
      BUSINESS_ADMIN: 'admin',
      HR_ADMIN: 'admin',
      MANAGER: 'manager',
      EMPLOYEE: 'employee',
    };
    const role =
      user.userType === USER_TYPES.STACKHR_ADMIN
        ? user.role
        : (businessRoles[user.role] ?? 'employee');
    return {
      ...user,
      role,
      backendRole: user.role,
      orgSlug: user.orgSlug ?? null,
      orgName: user.orgName ?? null,
    };
  }

  private toAuthenticatedUser(
    user: UserRecord,
    organizationId?: string | null,
  ): AuthenticatedUser {
    const member = organizationId
      ? user.memberships.find(
          (entry) => entry.organizationId === organizationId,
        )
      : user.memberships[0];
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      userType: user.userType as UserType,
      role: (member?.role ?? user.role ?? USER_ROLES.EMPLOYEE) as UserRole,
      organizationId: member?.organizationId ?? null,
      orgSlug: member?.organization.slug ?? null,
      orgName: member?.organization.name ?? null,
    };
  }

  private async hashPassword(password: string): Promise<string> {
    return argon2.hash(password, { type: argon2.argon2id });
  }

  private async verifyPassword(
    password: string,
    storedHash: string,
  ): Promise<boolean> {
    if (storedHash.startsWith('$argon2')) {
      try {
        return await argon2.verify(storedHash, password);
      } catch {
        return false;
      }
    }

    const [algorithm, n, r, p, encodedSalt, encodedHash] =
      storedHash.split('$');
    if (
      algorithm !== 'scrypt' ||
      !n ||
      !r ||
      !p ||
      !encodedSalt ||
      !encodedHash
    ) {
      return false;
    }

    const expected = Buffer.from(encodedHash, 'base64url');
    const actual = await this.deriveKey(
      password,
      Buffer.from(encodedSalt, 'base64url'),
      expected.length,
      { N: Number(n), r: Number(r), p: Number(p) },
    );

    return (
      actual.length === expected.length && timingSafeEqual(actual, expected)
    );
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  // ---------------------------------------------------------------------------
  // Session cache helpers — to be replaced later with Redis calls when
  // moving to a shared cache (e.g. ioredis + @nestjs/cache-manager).
  // ---------------------------------------------------------------------------

  /** Returns the cached AuthenticatedUser, or undefined on miss/expiry. */
  private getCachedSession(tokenHash: string): AuthenticatedUser | undefined {
    const entry = this.sessionCache.get(tokenHash);
    if (!entry) return undefined;
    if (Date.now() >= entry.expiresAt) {
      this.sessionCache.delete(tokenHash);
      return undefined;
    }
    return entry.user;
  }

  /** Writes a cache entry whose TTL matches the session's DB expiry. */
  private setCachedSession(
    tokenHash: string,
    user: AuthenticatedUser,
    sessionExpiresAt: Date,
  ): void {
    this.sessionCache.set(tokenHash, {
      user,
      expiresAt: sessionExpiresAt.getTime(),
    });
  }

  /** Removes a single entry — call on logout or organisation switch. */
  private evictSession(tokenHash: string): void {
    this.sessionCache.delete(tokenHash);
  }

  /** Removes all cached session entries for a specific user ID. */
  private evictUserSessions(userId: string): void {
    for (const [tokenHash, entry] of this.sessionCache.entries()) {
      if (entry.user.id === userId) {
        this.sessionCache.delete(tokenHash);
      }
    }
  }

  private deriveKey(
    password: string,
    salt: Buffer,
    keyLength: number,
    options: { N: number; r: number; p: number },
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      scrypt(password, salt, keyLength, options, (error, derivedKey) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(derivedKey);
      });
    });
  }

  private normalizeEmail(value: string): string {
    const email = this.requiredString(value, 'email').toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      throw new BadRequestException('A valid email is required');
    }
    return email;
  }

  private validatePassword(value: string): string {
    if (typeof value !== 'string' || value.length < 12 || value.length > 128) {
      throw new BadRequestException(
        'Password must be between 12 and 128 characters',
      );
    }
    return value;
  }

  private requiredString(value: string, field: string): string {
    if (typeof value !== 'string' || !value.trim()) {
      throw new BadRequestException(`${field} is required`);
    }
    return value.trim();
  }

  private slugify(value: string): string {
    const slug = value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80);

    if (!slug) {
      throw new BadRequestException(
        'organizationSlug must contain letters or numbers',
      );
    }
    return slug;
  }
}
