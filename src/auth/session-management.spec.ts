import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { createHash } from 'node:crypto';
import { AuthService } from './auth.service';
import { PrismaService } from '../database/prisma.service';
import { EmailService } from '../notifications/email.service';

describe('AuthService session management', () => {
  let service: AuthService;
  let prismaMock: any;

  const hashToken = (token: string) =>
    createHash('sha256').update(token).digest('hex');

  beforeEach(async () => {
    prismaMock = {
      session: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: EmailService, useValue: {} },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('lists active sessions and flags the current session without leaking tokens', async () => {
    const currentRaw = 'raw-token-1';
    prismaMock.session.findMany.mockResolvedValue([
      {
        id: 'sess-1',
        token: hashToken(currentRaw),
        ipAddress: '10.0.0.1',
        userAgent: 'Chrome',
        activeOrganizationId: 'org-1',
        createdAt: new Date(),
        updatedAt: new Date(),
        expiresAt: new Date(Date.now() + 60_000),
      },
      {
        id: 'sess-2',
        token: hashToken('other-token'),
        ipAddress: '10.0.0.2',
        userAgent: 'Safari',
        activeOrganizationId: 'org-1',
        createdAt: new Date(),
        updatedAt: new Date(),
        expiresAt: new Date(Date.now() + 60_000),
      },
    ]);

    const sessions = await service.listUserSessions('user-1', currentRaw);
    expect(sessions).toHaveLength(2);
    expect(sessions[0].isCurrent).toBe(true);
    expect(sessions[1].isCurrent).toBe(false);
    expect((sessions[0] as any).token).toBeUndefined();
  });

  it('throws NotFoundException when revoking a session not owned by user', async () => {
    prismaMock.session.findFirst.mockResolvedValue(null);

    await expect(
      service.revokeUserSession('user-1', 'sess-other'),
    ).rejects.toThrow(NotFoundException);
  });

  it('revokes all other sessions when excludeCurrent is true', async () => {
    const currentRaw = 'raw-token-1';
    prismaMock.session.updateMany.mockResolvedValue({ count: 2 });

    const res = await service.revokeAllUserSessions('user-1', {
      excludeCurrent: true,
      currentToken: currentRaw,
    });

    expect(res).toEqual({ success: true, revokedCount: 2 });
    expect(prismaMock.session.updateMany).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        revokedAt: null,
        token: { not: hashToken(currentRaw) },
      },
      data: { revokedAt: expect.any(Date) },
    });
  });
});
