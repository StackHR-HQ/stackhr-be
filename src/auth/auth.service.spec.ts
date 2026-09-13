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
