/**
 * Unit tests for the in-memory session cache added to AuthService.
 *
 * These tests focus purely on cache behaviour:
 *   - cache HIT → no DB call, returns cached AuthenticatedUser
 *   - cache MISS → DB called, result stored, returned
 *   - expired entry → treated as a miss, DB queried again
 *   - logout → entry evicted, subsequent validate hits DB
 *
 * The full integration path (DB query shape, toAuthenticatedUser mapping) is
 * covered by existing auth integration tests; this file stays focused.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { PrismaService } from '../database/prisma.service';
import { EmailService } from '../notifications/email.service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal valid session row returned from Prisma. */
function makeSessionRow(overrides: Partial<Record<string, unknown>> = {}) {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  return {
    id: 'sess-1',
    token: 'hashed-token-abc',
    userId: 'user-1',
    activeOrganizationId: 'org-1',
    expiresAt,
    revokedAt: null,
    ipAddress: null,
    userAgent: null,
    createdAt: now,
    updatedAt: now,
    user: {
      id: 'user-1',
      name: 'Test User',
      email: 'test@example.com',
      userType: 'BUSINESS',
      role: 'BUSINESS_OWNER',
      banned: false,
      memberships: [
        {
          organizationId: 'org-1',
          role: 'BUSINESS_OWNER',
          organization: { name: 'Acme Corp', slug: 'acme-corp' },
        },
      ],
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('AuthService — session cache', () => {
  let service: AuthService;
  let prismaMock: {
    session: {
      findUnique: jest.Mock;
      updateMany: jest.Mock;
    };
  };

  beforeEach(async () => {
    prismaMock = {
      session: {
        findUnique: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prismaMock },
        {
          provide: EmailService,
          useValue: { send: jest.fn().mockResolvedValue({ id: 'msg-1' }) },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  // -------------------------------------------------------------------------

  it('queries the DB on the first validateSession call (cache miss)', async () => {
    prismaMock.session.findUnique.mockResolvedValue(makeSessionRow());

    const user = await service.validateSession('raw-token');

    expect(prismaMock.session.findUnique).toHaveBeenCalledTimes(1);
    expect(user).not.toBeNull();
    expect(user?.id).toBe('user-1');
  });

  it('returns the cached result on the second call without hitting the DB', async () => {
    prismaMock.session.findUnique.mockResolvedValue(makeSessionRow());

    // First call — populates cache
    await service.validateSession('raw-token');
    // Second call — must be served from cache
    const user = await service.validateSession('raw-token');

    expect(prismaMock.session.findUnique).toHaveBeenCalledTimes(1);
    expect(user).not.toBeNull();
    expect(user?.id).toBe('user-1');
  });

  it('evicts the cache entry on logout so the next request hits the DB', async () => {
    prismaMock.session.findUnique.mockResolvedValue(makeSessionRow());

    // Warm the cache
    await service.validateSession('raw-token');
    expect(prismaMock.session.findUnique).toHaveBeenCalledTimes(1);

    // Log out — should evict the cache entry
    await service.logout('raw-token');
    expect(prismaMock.session.updateMany).toHaveBeenCalledTimes(1);

    // Next validateSession must go to the DB again
    prismaMock.session.findUnique.mockResolvedValue(null);
    const user = await service.validateSession('raw-token');

    expect(prismaMock.session.findUnique).toHaveBeenCalledTimes(2);
    expect(user).toBeNull();
  });

  it('returns null for a revoked session and does not cache the result', async () => {
    prismaMock.session.findUnique.mockResolvedValue(
      makeSessionRow({ revokedAt: new Date() }),
    );

    const first = await service.validateSession('raw-token');
    const second = await service.validateSession('raw-token');

    expect(first).toBeNull();
    expect(second).toBeNull();
    // Both calls hit the DB — revoked sessions must not be cached
    expect(prismaMock.session.findUnique).toHaveBeenCalledTimes(2);
  });

  it('treats an expired cache entry as a miss and queries the DB again', async () => {
    // Session expires in 5 seconds from now
    const expiresAt = new Date(Date.now() + 5_000);
    prismaMock.session.findUnique.mockResolvedValue(
      makeSessionRow({ expiresAt }),
    );

    jest.useFakeTimers();

    // First call — populates cache
    await service.validateSession('raw-token');
    expect(prismaMock.session.findUnique).toHaveBeenCalledTimes(1);

    // Advance clock past the TTL
    jest.advanceTimersByTime(6_000);

    // Second call — cache entry is expired, must hit DB again
    await service.validateSession('raw-token');
    expect(prismaMock.session.findUnique).toHaveBeenCalledTimes(2);

    jest.useRealTimers();
  });

  it('does not cache the result for a banned user', async () => {
    prismaMock.session.findUnique.mockResolvedValue(
      makeSessionRow({ user: { ...makeSessionRow().user, banned: true } }),
    );

    const first = await service.validateSession('raw-token');
    const second = await service.validateSession('raw-token');

    expect(first).toBeNull();
    expect(second).toBeNull();
    expect(prismaMock.session.findUnique).toHaveBeenCalledTimes(2);
  });

  it('does not cache the result when the active org is not in the user memberships', async () => {
    prismaMock.session.findUnique.mockResolvedValue(
      makeSessionRow({
        activeOrganizationId: 'org-OTHER',
        // membership only covers org-1, not org-OTHER
      }),
    );

    const first = await service.validateSession('raw-token');
    const second = await service.validateSession('raw-token');

    expect(first).toBeNull();
    expect(second).toBeNull();
    expect(prismaMock.session.findUnique).toHaveBeenCalledTimes(2);
  });
});
