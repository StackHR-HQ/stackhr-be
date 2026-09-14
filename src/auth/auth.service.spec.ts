import { createHash, scryptSync } from 'node:crypto';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { PrismaService } from '../database/prisma.service';
import { EmailService } from '../notifications/email.service';
import type { Request, Response } from 'express';
import { PATH_METADATA } from '@nestjs/common/constants';

const password = 'correct horse battery staple';
const salt = Buffer.from('test-password-salt');
const passwordHash = [
  'scrypt',
  '16384',
  '8',
  '1',
  salt.toString('base64url'),
  scryptSync(password, salt, 64).toString('base64url'),
].join('$');

function setup() {
  const user = {
    id: 'user',
    name: 'Owner',
    email: 'owner@acme.com',
    passwordHash,
    userType: 'BUSINESS',
    role: 'BUSINESS_OWNER',
    emailVerified: true,
    banned: false,
    memberships: [
      {
        organizationId: 'org-a',
        role: 'BUSINESS_OWNER',
        organization: { name: 'Acme', slug: 'acme' },
      },
      {
        organizationId: 'org-b',
        role: 'MANAGER',
        organization: { name: 'Beta', slug: 'beta' },
      },
    ],
  };
  const prisma = {
    user: { findFirst: jest.fn().mockResolvedValue(user) },
    session: { create: jest.fn(), findUnique: jest.fn() },
  };
  const service = new AuthService(
    prisma as unknown as PrismaService,
    {} as EmailService,
  );
  return { user, prisma, service };
}

describe('employee invitations', () => {
  const inviteToken = 'raw-invitation-token';
  const inviteTokenHash = createHash('sha256')
    .update(inviteToken)
    .digest('hex');

  function invitationSetup(overrides: Record<string, unknown> = {}) {
    const invitation = {
      id: 'invitation',
      organizationId: 'org-a',
      employeeId: 'emp-ada',
      email: 'ada@acme.com',
      status: 'pending',
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      employee: { id: 'emp-ada', fullName: 'Ada Okafor' },
      organization: { name: 'Acme', slug: 'acme' },
      ...overrides,
    };
    const prisma = {
      // Only the stored hash finds the invitation; the raw token never does.
      invitation: {
        findUnique: jest.fn(({ where }: { where: { tokenHash: string } }) =>
          Promise.resolve(
            where.tokenHash === inviteTokenHash ? invitation : null,
          ),
        ),
        update: jest.fn(),
      },
      user: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn(({ data }: { data: Record<string, unknown> }) =>
          Promise.resolve({ id: 'user-ada', ...data }),
        ),
      },
      member: {
        create: jest.fn(),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      employee: { update: jest.fn() },
      session: { create: jest.fn() },
      $transaction: jest.fn(),
    };
    // Writes inside the transaction use the same delegates, so assertions see them.
    prisma.$transaction.mockImplementation(
      (work: (tx: typeof prisma) => unknown) => work(prisma),
    );
    const service = new AuthService(
      prisma as unknown as PrismaService,
      {} as EmailService,
    );
    return { invitation, prisma, service };
  }

  describe('acceptEmployeeInvitation', () => {
    it('rejects an existing account with the wrong password and grants nothing', async () => {
      const { prisma, service } = invitationSetup();
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-existing',
        name: 'Ada Okafor',
        email: 'ada@acme.com',
        passwordHash,
        userType: 'BUSINESS',
        role: 'BUSINESS_OWNER',
        emailVerified: true,
        banned: false,
      });

      await expect(
        service.acceptEmployeeInvitation(
          { token: inviteToken, password: 'wrong password long enough' },
          {},
        ),
      ).rejects.toMatchObject({ status: 401 });
      expect(prisma.member.create).not.toHaveBeenCalled();
      expect(prisma.employee.update).not.toHaveBeenCalled();
      expect(prisma.invitation.update).not.toHaveBeenCalled();
      expect(prisma.session.create).not.toHaveBeenCalled();
    });

    it('links an existing StackHR account after its password is confirmed', async () => {
      const { prisma, service } = invitationSetup();
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-existing',
        name: 'Ada Okafor',
        email: 'ada@acme.com',
        passwordHash,
        userType: 'BUSINESS',
        role: 'BUSINESS_OWNER',
        emailVerified: true,
        banned: false,
      });

      const result = await service.acceptEmployeeInvitation(
        { token: inviteToken, password },
        {},
      );

      expect(prisma.user.create).not.toHaveBeenCalled();
      expect(result.user).toMatchObject({
        id: 'user-existing',
        role: 'EMPLOYEE',
        organizationId: 'org-a',
      });
      expect(prisma.member.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          organizationId: 'org-a',
          userId: 'user-existing',
          role: 'EMPLOYEE',
        }) as unknown,
      });
      expect(prisma.employee.update).toHaveBeenCalledWith({
        where: { id: 'emp-ada', organizationId: 'org-a' },
        data: { userId: 'user-existing', status: 'ONBOARDING' },
      });
      expect(prisma.session.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user-existing',
          activeOrganizationId: 'org-a',
        }) as unknown,
      });
    });

    it('creates a verified employee account, links the employee and starts onboarding', async () => {
      const { prisma, service } = invitationSetup();

      const result = await service.acceptEmployeeInvitation(
        { token: inviteToken, password },
        {},
      );

      expect(result.user).toMatchObject({
        email: 'ada@acme.com',
        role: 'EMPLOYEE',
        organizationId: 'org-a',
        orgSlug: 'acme',
      });
      expect(typeof result.token).toBe('string');
      expect(prisma.user.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          email: 'ada@acme.com',
          name: 'Ada Okafor',
          emailVerified: true,
          role: 'EMPLOYEE',
          passwordHash: expect.stringMatching(/^scrypt\$/) as unknown,
        }) as unknown,
      });
      expect(prisma.member.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          organizationId: 'org-a',
          userId: 'user-ada',
          role: 'EMPLOYEE',
        }) as unknown,
      });
      expect(prisma.employee.update).toHaveBeenCalledWith({
        where: { id: 'emp-ada', organizationId: 'org-a' },
        data: { userId: 'user-ada', status: 'ONBOARDING' },
      });
      expect(prisma.invitation.update).toHaveBeenCalledWith({
        where: { id: 'invitation' },
        data: { status: 'accepted' },
      });
      expect(prisma.session.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user-ada',
          activeOrganizationId: 'org-a',
        }) as unknown,
      });
    });
  });

  describe('previewInvitation', () => {
    it.each([
      ['unknown', 'some-other-token', {}],
      ['already accepted', inviteToken, { status: 'accepted' }],
      ['expired', inviteToken, { expiresAt: new Date(Date.now() - 1000) }],
    ])('returns 404 for an %s invitation', async (_label, token, overrides) => {
      const { service } = invitationSetup(overrides);

      await expect(service.previewInvitation(token)).rejects.toMatchObject({
        status: 404,
      });
    });

    it('describes a pending invitation for the accept page', async () => {
      const { invitation, service } = invitationSetup();

      await expect(service.previewInvitation(inviteToken)).resolves.toEqual({
        employeeName: 'Ada Okafor',
        email: 'ada@acme.com',
        organizationName: 'Acme',
        expiresAt: invitation.expiresAt,
        hasAccount: false,
      });
    });
  });
});

describe('frontend authentication contract', () => {
  it('verifies a stored scrypt hash and returns the selected workspace and token with a cookie', async () => {
    const { service, prisma } = setup();
    const setHeader = jest.fn();
    const result = await new AuthController(service).loginBusiness(
      { email: 'owner@acme.com', password, orgSlug: 'beta' },
      { get: () => undefined } as unknown as Request,
      { setHeader } as unknown as Response,
    );
    expect(result).toMatchObject({
      user: {
        orgSlug: 'beta',
        orgName: 'Beta',
        role: 'manager',
        backendRole: 'MANAGER',
      },
      token: expect.any(String) as unknown,
    });
    expect(setHeader).toHaveBeenCalledWith(
      'Set-Cookie',
      expect.stringContaining(`stackhr_session=${result.token}; HttpOnly`),
    );
    expect(prisma.session.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        activeOrganizationId: 'org-b',
        token: expect.not.stringMatching(result.token) as unknown,
      }) as unknown,
    });
  });

  it('returns a frontend session on email verification and the same user shape from me', async () => {
    const { service, user } = setup();
    const verification = {
      user: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ ...user, emailVerified: false }),
        update: jest.fn(),
      },
      verification: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'verification',
          value: createHash('sha256')
            .update(
              `${user.email}:123456:${process.env.AUTH_SECRET ?? 'development-only-secret'}`,
            )
            .digest('hex'),
        }),
        delete: jest.fn(),
      },
      $transaction: jest.fn(),
      session: { create: jest.fn() },
    };
    const verifier = new AuthService(
      verification as unknown as PrismaService,
      {} as EmailService,
    );
    const controller = new AuthController(verifier);
    const result = await controller.verifyBusinessEmail(
      { email: user.email, code: '123456' },
      { get: () => undefined } as unknown as Request,
      { setHeader: jest.fn() } as unknown as Response,
    );
    expect(typeof result.token).toBe('string');
    expect(result.user).toMatchObject({
      orgSlug: 'acme',
      orgName: 'Acme',
      role: 'admin',
    });
    const login = await service.loginBusiness(
      { email: user.email, password },
      {},
    );
    expect(
      controller.getCurrentUser({ user: login.user } as Request).user,
    ).toEqual(result.user);
  });

  it('registers both signup and the legacy register route', () => {
    expect(
      Reflect.getMetadata(
        PATH_METADATA,
        Object.getOwnPropertyDescriptor(
          AuthController.prototype,
          'signupBusiness',
        )!.value as object,
      ),
    ).toEqual(['business/register', 'business/signup']);
  });

  it('rejects another workspace without creating a session', async () => {
    const { service, prisma } = setup();
    await expect(
      service.loginBusiness(
        { email: 'owner@acme.com', password, orgSlug: 'other' },
        {},
      ),
    ).rejects.toThrow('Invalid workspace');
    expect(prisma.session.create).not.toHaveBeenCalled();
  });

  it.each(['wrong password long enough', 'correct horse battery staplf'])(
    'rejects an incorrect password',
    async (invalid) => {
      const { service, prisma } = setup();
      await expect(
        service.loginBusiness(
          { email: 'owner@acme.com', password: invalid },
          {},
        ),
      ).rejects.toThrow('Invalid email or password');
      expect(prisma.session.create).not.toHaveBeenCalled();
    },
  );

  it('keeps email-only login and maps owners to admin', async () => {
    const { service } = setup();
    const { user } = await service.loginBusiness(
      { email: 'owner@acme.com', password },
      {},
    );
    expect(service.toFrontendUser(user)).toMatchObject({
      role: 'admin',
      orgSlug: 'acme',
    });
  });

  it('retains the selected workspace on subsequent authenticated requests and rejects removed memberships', async () => {
    const { service, prisma, user } = setup();
    prisma.session.findUnique.mockResolvedValue({
      user,
      activeOrganizationId: 'org-b',
      expiresAt: new Date(Date.now() + 60000),
      revokedAt: null,
    });
    expect(await service.validateSession('token')).toMatchObject({
      organizationId: 'org-b',
      role: 'MANAGER',
    });
    user.memberships.pop();
    expect(await service.validateSession('token')).toBeNull();
  });

  it('does not allow unverified users to sign in', async () => {
    const { service, user, prisma } = setup();
    user.emailVerified = false;
    await expect(
      service.loginBusiness({ email: user.email, password }, {}),
    ).rejects.toThrow('verify your email');
    expect(prisma.session.create).not.toHaveBeenCalled();
  });
});
