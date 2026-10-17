import { Test, TestingModule } from '@nestjs/testing';
import { OutboxService } from './outbox.service';
import { PrismaService } from '../../database/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { NotFoundException } from '@nestjs/common';

describe('OutboxService', () => {
  let service: OutboxService;
  let mockPrisma: {
    outboxEvent: {
      create: jest.Mock;
      findMany: jest.Mock;
      update: jest.Mock;
    };
    deadLetterEvent: {
      create: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
      delete: jest.Mock;
    };
  };
  let mockEventEmitter: {
    emitAsync: jest.Mock;
  };

  beforeEach(async () => {
    mockPrisma = {
      outboxEvent: {
        create: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
      deadLetterEvent: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        delete: jest.fn(),
      },
    };

    mockEventEmitter = {
      emitAsync: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OutboxService,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
        {
          provide: EventEmitter2,
          useValue: mockEventEmitter,
        },
      ],
    }).compile();

    service = module.get<OutboxService>(OutboxService);
  });

  it('should create an outbox event with status PENDING', async () => {
    mockPrisma.outboxEvent.create.mockResolvedValue({
      id: 'outbox-1',
      status: 'PENDING',
    });

    const result = await service.createEvent({
      organizationId: 'org-1',
      eventType: 'approval.decided',
      aggregateType: 'ApprovalRequest',
      aggregateId: 'appr-123',
      payload: { status: 'APPROVED' },
    });

    expect(result.id).toBe('outbox-1');
    expect(mockPrisma.outboxEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organizationId: 'org-1',
          eventType: 'approval.decided',
          status: 'PENDING',
        }),
      }),
    );
  });

  it('should process pending events successfully and mark PROCESSED', async () => {
    const mockEvent = {
      id: 'event-success-1',
      organizationId: 'org-1',
      eventType: 'approval.decided',
      payload: { id: 'appr-1' },
      retryCount: 0,
      maxRetries: 5,
    };

    mockPrisma.outboxEvent.findMany.mockResolvedValue([mockEvent]);
    mockPrisma.outboxEvent.update.mockResolvedValue({});
    mockEventEmitter.emitAsync.mockResolvedValue([]);

    const result = await service.processPending(10);

    expect(result.processedCount).toBe(1);
    expect(result.failedCount).toBe(0);
    expect(mockEventEmitter.emitAsync).toHaveBeenCalledWith(
      'approval.decided',
      { id: 'appr-1' },
    );
    expect(mockPrisma.outboxEvent.update).toHaveBeenCalledWith({
      where: { id: 'event-success-1' },
      data: expect.objectContaining({
        status: 'PROCESSED',
      }),
    });
  });

  it('should schedule retry with backoff when an event fails but retry count is below max', async () => {
    const mockEvent = {
      id: 'event-retry-1',
      organizationId: 'org-1',
      eventType: 'approval.decided',
      payload: { id: 'appr-2' },
      retryCount: 1,
      maxRetries: 5,
    };

    mockPrisma.outboxEvent.findMany.mockResolvedValue([mockEvent]);
    mockPrisma.outboxEvent.update.mockResolvedValue({});
    mockEventEmitter.emitAsync.mockRejectedValue(new Error('SendByte timeout'));

    const result = await service.processPending(10);

    expect(result.failedCount).toBe(1);
    expect(result.deadLetterCount).toBe(0);
    expect(mockPrisma.outboxEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'event-retry-1' },
        data: expect.objectContaining({
          status: 'PENDING',
          retryCount: 2,
          lastError: 'SendByte timeout',
        }),
      }),
    );
  });

  it('should move event to Dead Letter Queue (DLQ) when retry count hits maxRetries', async () => {
    const mockEvent = {
      id: 'event-dlq-1',
      organizationId: 'org-1',
      eventType: 'approval.decided',
      aggregateType: 'ApprovalRequest',
      aggregateId: 'appr-3',
      payload: { id: 'appr-3' },
      retryCount: 4,
      maxRetries: 5, // Next failure will hit 5
    };

    mockPrisma.outboxEvent.findMany.mockResolvedValue([mockEvent]);
    mockPrisma.outboxEvent.update.mockResolvedValue({});
    mockPrisma.deadLetterEvent.create.mockResolvedValue({});
    mockEventEmitter.emitAsync.mockRejectedValue(
      new Error('Fatal schema error'),
    );

    const result = await service.processPending(10);

    expect(result.failedCount).toBe(1);
    expect(result.deadLetterCount).toBe(1);
    expect(mockPrisma.deadLetterEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          originalId: 'event-dlq-1',
          failureReason: 'Fatal schema error',
          retryCount: 5,
        }),
      }),
    );
    expect(mockPrisma.outboxEvent.update).toHaveBeenCalledWith({
      where: { id: 'event-dlq-1' },
      data: expect.objectContaining({
        status: 'FAILED',
        retryCount: 5,
      }),
    });
  });

  it('should replay a dead letter event back into the outbox', async () => {
    mockPrisma.deadLetterEvent.findUnique.mockResolvedValue({
      id: 'dlq-123',
      organizationId: 'org-1',
      eventType: 'approval.decided',
      aggregateType: 'ApprovalRequest',
      aggregateId: 'appr-999',
      payload: { test: true },
    });
    mockPrisma.outboxEvent.create.mockResolvedValue({
      id: 'replayed-outbox-1',
      status: 'PENDING',
    });
    mockPrisma.deadLetterEvent.delete.mockResolvedValue({});

    const result = await service.replayDeadLetterEvent('dlq-123');

    expect(result.id).toBe('replayed-outbox-1');
    expect(mockPrisma.outboxEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'PENDING',
          retryCount: 0,
        }),
      }),
    );
    expect(mockPrisma.deadLetterEvent.delete).toHaveBeenCalledWith({
      where: { id: 'dlq-123' },
    });
  });

  it('should throw NotFoundException when attempting to replay non-existent DLQ event', async () => {
    mockPrisma.deadLetterEvent.findUnique.mockResolvedValue(null);

    await expect(
      service.replayDeadLetterEvent('invalid-dlq-id'),
    ).rejects.toThrow(NotFoundException);
  });
});
