import { Test, TestingModule } from '@nestjs/testing';
import {
  ConflictException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { IdempotencyService } from './idempotency.service';
import { PrismaService } from '../../database/prisma.service';

describe('IdempotencyService', () => {
  let service: IdempotencyService;
  let mockPrisma: {
    idempotencyKey: {
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
  };

  beforeEach(async () => {
    mockPrisma = {
      idempotencyKey: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IdempotencyService,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
      ],
    }).compile();

    service = module.get<IdempotencyService>(IdempotencyService);
  });

  it('should acquire lease for a new idempotency key', async () => {
    mockPrisma.idempotencyKey.findUnique.mockResolvedValue(null);
    mockPrisma.idempotencyKey.create.mockResolvedValue({
      id: 'idem-rec-1',
      organizationId: 'org-1',
      key: 'key-123',
      status: 'IN_PROGRESS',
    });

    const result = await service.acquireKey({
      organizationId: 'org-1',
      userId: 'user-1',
      key: 'key-123',
      endpoint: 'POST /v1/api/payroll/runs/run-1/execute',
      body: { totalNet: 50000 },
    });

    expect(result).toEqual({
      isReplay: false,
      recordId: 'idem-rec-1',
    });
    expect(mockPrisma.idempotencyKey.create).toHaveBeenCalled();
  });

  it('should throw ConflictException if a request is already IN_PROGRESS with active lease', async () => {
    const futureLock = new Date(Date.now() + 60000);
    mockPrisma.idempotencyKey.findUnique.mockResolvedValue({
      id: 'idem-rec-2',
      organizationId: 'org-1',
      key: 'key-123',
      status: 'IN_PROGRESS',
      lockedUntil: futureLock,
    });

    await expect(
      service.acquireKey({
        organizationId: 'org-1',
        userId: 'user-1',
        key: 'key-123',
        endpoint: 'POST /v1/api/payroll/runs/run-1/execute',
        body: { totalNet: 50000 },
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('should reclaim lease if an IN_PROGRESS request lock has expired', async () => {
    const expiredLock = new Date(Date.now() - 10000);
    mockPrisma.idempotencyKey.findUnique.mockResolvedValue({
      id: 'idem-rec-3',
      organizationId: 'org-1',
      key: 'key-expired',
      status: 'IN_PROGRESS',
      lockedUntil: expiredLock,
    });
    mockPrisma.idempotencyKey.update.mockResolvedValue({});

    const result = await service.acquireKey({
      organizationId: 'org-1',
      userId: 'user-1',
      key: 'key-expired',
      endpoint: 'POST /v1/api/payroll/runs/run-1/execute',
      body: { totalNet: 50000 },
    });

    expect(result).toEqual({
      isReplay: false,
      recordId: 'idem-rec-3',
    });
    expect(mockPrisma.idempotencyKey.update).toHaveBeenCalled();
  });

  it('should return cached response if key is COMPLETED and request payload matches', async () => {
    const payload = { totalNet: 50000 };
    const hash = service.hashPayload(payload);

    mockPrisma.idempotencyKey.findUnique.mockResolvedValue({
      id: 'idem-rec-4',
      organizationId: 'org-1',
      key: 'key-replay',
      status: 'COMPLETED',
      requestHash: hash,
      statusCode: 200,
      responseBody: { success: true, message: 'Executed' },
    });

    const result = await service.acquireKey({
      organizationId: 'org-1',
      userId: 'user-1',
      key: 'key-replay',
      endpoint: 'POST /v1/api/payroll/runs/run-1/execute',
      body: payload,
    });

    expect(result).toEqual({
      isReplay: true,
      recordId: 'idem-rec-4',
      statusCode: 200,
      responseBody: { success: true, message: 'Executed' },
    });
  });

  it('should throw UnprocessableEntityException if key is COMPLETED but request payload differs', async () => {
    const originalHash = service.hashPayload({ totalNet: 50000 });

    mockPrisma.idempotencyKey.findUnique.mockResolvedValue({
      id: 'idem-rec-5',
      organizationId: 'org-1',
      key: 'key-mismatch',
      status: 'COMPLETED',
      requestHash: originalHash,
      statusCode: 200,
      responseBody: { success: true },
    });

    await expect(
      service.acquireKey({
        organizationId: 'org-1',
        userId: 'user-1',
        key: 'key-mismatch',
        endpoint: 'POST /v1/api/payroll/runs/run-1/execute',
        body: { totalNet: 999999 }, // completely different amount!
      }),
    ).rejects.toThrow(UnprocessableEntityException);
  });

  it('should allow retry if previous execution status was FAILED', async () => {
    mockPrisma.idempotencyKey.findUnique.mockResolvedValue({
      id: 'idem-rec-6',
      organizationId: 'org-1',
      key: 'key-failed',
      status: 'FAILED',
    });
    mockPrisma.idempotencyKey.update.mockResolvedValue({});

    const result = await service.acquireKey({
      organizationId: 'org-1',
      userId: 'user-1',
      key: 'key-failed',
      endpoint: 'POST /v1/api/payroll/runs/run-1/execute',
      body: { totalNet: 50000 },
    });

    expect(result).toEqual({
      isReplay: false,
      recordId: 'idem-rec-6',
    });
    expect(mockPrisma.idempotencyKey.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'idem-rec-6' },
        data: expect.objectContaining({ status: 'IN_PROGRESS' }),
      }),
    );
  });

  it('should update key status to COMPLETED on completeKey', async () => {
    mockPrisma.idempotencyKey.update.mockResolvedValue({});

    await service.completeKey('rec-1', 201, { data: 'ok' });

    expect(mockPrisma.idempotencyKey.update).toHaveBeenCalledWith({
      where: { id: 'rec-1' },
      data: {
        status: 'COMPLETED',
        statusCode: 201,
        responseBody: { data: 'ok' },
      },
    });
  });

  it('should update key status to FAILED on failKey', async () => {
    mockPrisma.idempotencyKey.update.mockResolvedValue({});

    await service.failKey('rec-2');

    expect(mockPrisma.idempotencyKey.update).toHaveBeenCalledWith({
      where: { id: 'rec-2' },
      data: {
        status: 'FAILED',
      },
    });
  });
});
