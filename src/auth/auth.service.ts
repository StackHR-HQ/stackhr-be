import {
  BadRequestException,
  ConflictException,
  Injectable,
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
import { PrismaService } from '../database/prisma.service';
import {
  SESSION_COOKIE_NAME,
  SESSION_DURATION_MS,
  USER_ROLES,
  USER_TYPES,
  type UserRole,
  type UserType,
} from './auth.constants';
import type { AuthenticatedUser } from './auth.types';

interface RegisterBusinessInput {
  name: string;
  email: string;
  password: string;
  organizationName: string;
  organizationSlug?: string;
}

interface LoginInput {
  email: string;
  password: string;
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
  memberships: Array<{ organizationId: string }>;
}

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  async registerBusiness(input: RegisterBusinessInput, options: SessionOptions) {
    const name = this.requiredString(input.name, 'name');
    const email = this.normalizeEmail(input.email);
    const password = this.validatePassword(input.password);
    const organizationName = this.requiredString(
      input.organizationName,
      'organizationName',
    );
    const slug = this.slugify(input.organizationSlug || organizationName);

    const existingUser = await this.prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      throw new ConflictException('An account with this email already exists');
    }

    const existingOrganization = await this.prisma.organization.findUnique({
      where: { slug },
    });
    if (existingOrganization) {
      throw new ConflictException('An organization with this slug already exists');
    }

    const passwordHash = await this.hashPassword(password);
    const userId = randomUUID();
    const organizationId = randomUUID();

    await this.prisma.$transaction(async (transaction) => {
      await transaction.user.create({
        data: {
          id: userId,
          name,
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

    const user = this.toAuthenticatedUser({
      id: userId,
      name,
      email,
      userType: USER_TYPES.BUSINESS,
      role: USER_ROLES.BUSINESS_OWNER,
      memberships: [{ organizationId }],
    });
    const token = await this.createSession(user.id, options);

    return { user, token };
  }

  async loginBusiness(input: LoginInput, options: SessionOptions) {
    return this.login(input, USER_TYPES.BUSINESS, options);
  }

  async loginStackhrAdmin(input: LoginInput, options: SessionOptions) {
    return this.login(input, USER_TYPES.STACKHR_ADMIN, options);
  }

  async logout(token: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { token: this.hashToken(token), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async validateSession(token: string): Promise<AuthenticatedUser | null> {
    const session = await this.prisma.session.findUnique({
      where: { token: this.hashToken(token) },
      include: {
        user: {
          include: { memberships: { select: { organizationId: true } } },
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

    return this.toAuthenticatedUser(session.user);
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

  setSessionCookie(response: Response, token: string): void {
    const attributes = [
      `${SESSION_COOKIE_NAME}=${token}`,
      'HttpOnly',
      'Path=/v1/api',
      `Max-Age=${Math.floor(SESSION_DURATION_MS / 1000)}`,
      'SameSite=Lax',
    ];

    if (process.env.NODE_ENV === 'production') {
      attributes.push('Secure');
    }

    response.setHeader('Set-Cookie', attributes.join('; '));
  }

  clearSessionCookie(response: Response): void {
    response.setHeader(
      'Set-Cookie',
      `${SESSION_COOKIE_NAME}=; HttpOnly; Path=/v1/api; Max-Age=0; SameSite=Lax`,
    );
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
      include: { memberships: { select: { organizationId: true } } },
    });

    if (!user?.passwordHash || !(await this.verifyPassword(password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (user.banned) {
      throw new UnauthorizedException('This account is not available');
    }

    const token = await this.createSession(user.id, options);
    return { user: this.toAuthenticatedUser(user), token };
  }

  private async createSession(userId: string, options: SessionOptions): Promise<string> {
    const token = randomBytes(32).toString('base64url');

    await this.prisma.session.create({
      data: {
        id: randomUUID(),
        token: this.hashToken(token),
        userId,
        expiresAt: new Date(Date.now() + SESSION_DURATION_MS),
        ipAddress: options.ipAddress,
        userAgent: options.userAgent,
      },
    });

    return token;
  }

  private toAuthenticatedUser(user: UserRecord): AuthenticatedUser {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      userType: user.userType as UserType,
      role: (user.role ?? USER_ROLES.EMPLOYEE) as UserRole,
      organizationId: user.memberships[0]?.organizationId ?? null,
    };
  }

  private async hashPassword(password: string): Promise<string> {
    const salt = randomBytes(16);
    const derivedKey = await this.deriveKey(password, salt, 64, {
      N: 16384,
      r: 8,
      p: 1,
    });

    return [
      'scrypt',
      '16384',
      '8',
      '1',
      salt.toString('base64url'),
      derivedKey.toString('base64url'),
    ].join('$');
  }

  private async verifyPassword(password: string, storedHash: string): Promise<boolean> {
    const [, algorithm, n, r, p, encodedSalt, encodedHash] = storedHash.split('$');
    if (algorithm !== 'scrypt' || !n || !r || !p || !encodedSalt || !encodedHash) {
      return false;
    }

    const expected = Buffer.from(encodedHash, 'base64url');
    const actual = await this.deriveKey(
      password,
      Buffer.from(encodedSalt, 'base64url'),
      expected.length,
      { N: Number(n), r: Number(r), p: Number(p) },
    );

    return actual.length === expected.length && timingSafeEqual(actual, expected);
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
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
        resolve(derivedKey as Buffer);
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
      throw new BadRequestException('organizationSlug must contain letters or numbers');
    }
    return slug;
  }
}
