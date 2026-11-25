import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AuditService } from './audit.service';
import { PrismaService } from '../database/prisma.service';
import { USER_ROLES, USER_TYPES } from '../auth/auth.constants';
import type { AuthenticatedUser } from '../auth/auth.types';

describe('AuditService', () => {
  let service: AuditService;
  let prismaMock: {
    auditLog: { create: jest.Mock; findMany: jest.Mock; count: jest.Mock };
    user: { findMany: jest.Mock };
  };

  beforeEach(async () => {
    prismaMock = {
      auditLog: {
        create: jest.fn().mockResolvedValue({ id: 'audit-123' }),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      user: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditService,
        {
          provide: PrismaService,
          useValue: prismaMock,
        },
      ],
    }).compile();

    service = module.get<AuditService>(AuditService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should redact sensitive fields in payload sanitization', () => {
    const rawPayload = {
      email: 'user@example.com',
      password: 'SecretPassword123!',
      confirmPassword: 'SecretPassword123!',
      code: '123456',
      token: 'bearer-token-abc',
      nested: {
        secret: 'api-secret-key',
        safe: 'allowed-value',
      },
    };

    const sanitized = service.sanitizePayload(rawPayload);

    expect(sanitized.email).toBe('user@example.com');
    expect(sanitized.password).toBe('[REDACTED]');
    expect(sanitized.confirmPassword).toBe('[REDACTED]');
    expect(sanitized.code).toBe('[REDACTED]');
    expect(sanitized.token).toBe('[REDACTED]');
    expect((sanitized.nested as any).secret).toBe('[REDACTED]');
    expect((sanitized.nested as any).safe).toBe('allowed-value');
  });

  it('should log audit record to database', async () => {
    await service.log({
      organizationId: 'org-123',
      actorId: 'usr-123',
      action: 'POST /v1/api/onboarding/employees',
      resource: 'employees',
      resourceId: 'emp-123',
      payload: { fullName: 'John Doe', password: 'secretpassword' },
    });

    expect(prismaMock.auditLog.create).toHaveBeenCalledTimes(1);
    const createdData = prismaMock.auditLog.create.mock.calls[0][0].data;
    expect(createdData.action).toBe('POST /v1/api/onboarding/employees');
    expect(createdData.resource).toBe('employees');
    expect(createdData.payload).toContain('[REDACTED]');
  });

  describe('listForOrganization', () => {
    const adminUser: AuthenticatedUser = {
      id: 'admin-1',
      name: 'Admin User',
      email: 'admin@acme.com',
      userType: USER_TYPES.BUSINESS,
      role: USER_ROLES.BUSINESS_ADMIN,
      organizationId: 'org-1',
    };

    it('rejects callers without an active business organization', async () => {
      await expect(
        service.listForOrganization({ ...adminUser, organizationId: null }, {}),
      ).rejects.toThrow(ForbiddenException);
    });

    it('returns paginated logs with batched actor metadata and parsed payload', async () => {
      prismaMock.auditLog.findMany.mockResolvedValue([
        {
          id: 'log-1',
          organizationId: 'org-1',
          actorId: 'admin-1',
          action: 'PATCH /organizations/current',
          resource: 'organizations',
          resourceId: 'org-1',
          payload: JSON.stringify({ address: '12 Broad St' }),
          ipAddress: '127.0.0.1',
          userAgent: 'Mozilla/5.0',
          createdAt: new Date('2026-11-25T00:00:00Z'),
        },
      ]);
      prismaMock.auditLog.count.mockResolvedValue(1);
      prismaMock.user.findMany.mockResolvedValue([
        { id: 'admin-1', name: 'Admin User', email: 'admin@acme.com' },
      ]);

      const result = await service.listForOrganization(adminUser, {
        page: 1,
        limit: 10,
      });

      expect(result.meta).toEqual({
        total: 1,
        page: 1,
        limit: 10,
        totalPages: 1,
      });
      expect(result.data[0].actor).toEqual({
        id: 'admin-1',
        name: 'Admin User',
        email: 'admin@acme.com',
      });
      expect(result.data[0].payload).toEqual({ address: '12 Broad St' });
    });
  });
});
