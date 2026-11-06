import { Test, TestingModule } from '@nestjs/testing';
import { StackhrAdminController } from './stackhr-admin.controller';
import { StackhrAdminService } from './stackhr-admin.service';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { OutboxService } from '../common/outbox/outbox.service';

describe('StackhrAdminController', () => {
  let controller: StackhrAdminController;
  let mockOutboxService: {
    getDeadLetterEvents: jest.Mock;
    getDlqCount: jest.Mock;
    replayDeadLetterEvent: jest.Mock;
  };
  let mockAdminService: {
    getDashboard: jest.Mock;
    listBusinesses: jest.Mock;
    getSystemHealth: jest.Mock;
  };

  beforeEach(async () => {
    mockOutboxService = {
      getDeadLetterEvents: jest.fn().mockResolvedValue([
        {
          id: 'dlq-1',
          eventType: 'approval.decided',
          failureReason: 'Timeout',
        },
      ]),
      getDlqCount: jest.fn().mockResolvedValue(1),
      replayDeadLetterEvent: jest.fn().mockResolvedValue({ id: 'replayed-1' }),
    };

    mockAdminService = {
      getDashboard: jest
        .fn()
        .mockResolvedValue({ metrics: { totalBusinesses: 3 } }),
      listBusinesses: jest.fn().mockResolvedValue({ total: 3, businesses: [] }),
      getSystemHealth: jest.fn().mockResolvedValue({ status: 'healthy' }),
    };

    const builder = Test.createTestingModule({
      controllers: [StackhrAdminController],
      providers: [
        {
          provide: OutboxService,
          useValue: mockOutboxService,
        },
        {
          provide: StackhrAdminService,
          useValue: mockAdminService,
        },
      ],
    });

    builder.overrideGuard(AuthGuard).useValue({});
    builder.overrideGuard(RolesGuard).useValue({});
    const module: TestingModule = await builder.compile();

    controller = module.get<StackhrAdminController>(StackhrAdminController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should list dead letter events', async () => {
    const result = await controller.getDeadLetterEvents('org-1', '20');
    expect(result.total).toBe(1);
    expect(result.events).toHaveLength(1);
    expect(mockOutboxService.getDeadLetterEvents).toHaveBeenCalledWith(
      'org-1',
      20,
    );
  });

  it('should replay a dead letter event', async () => {
    const result = await controller.replayDeadLetterEvent('dlq-1');
    expect(result.replayedEventId).toBe('replayed-1');
    expect(mockOutboxService.replayDeadLetterEvent).toHaveBeenCalledWith(
      'dlq-1',
    );
  });

  it('delegates dashboard, businesses, and system health to StackhrAdminService', async () => {
    await expect(controller.getDashboard()).resolves.toEqual({
      metrics: { totalBusinesses: 3 },
    });
    await expect(
      controller.listBusinesses('active', 'acme', '1', '20'),
    ).resolves.toEqual({
      total: 3,
      businesses: [],
    });
    await expect(controller.getSystemHealth()).resolves.toEqual({
      status: 'healthy',
    });
  });
});
