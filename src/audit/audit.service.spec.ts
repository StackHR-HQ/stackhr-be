import { Test, TestingModule } from '@nestjs/testing';
import { AuditService } from './audit.service';
import { PrismaService } from '../database/prisma.service';

describe('AuditService', () => {
  let service: AuditService;
  let prismaMock: { auditLog: { create: jest.Mock } };

  beforeEach(async () => {
    prismaMock = {
      auditLog: {
        create: jest.fn().mockResolvedValue({ id: 'audit-123' }),
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
});
