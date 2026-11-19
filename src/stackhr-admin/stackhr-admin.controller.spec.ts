import { Test, TestingModule } from '@nestjs/testing';
import { StackhrAdminController } from './stackhr-admin.controller';
import { StackhrAdminService } from './stackhr-admin.service';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import type { AuthenticatedUser } from '../auth/auth.types';
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

  it('delegates subscription and invoice management to StackhrAdminService', async () => {
    (mockAdminService as any).listSubscriptions = jest
      .fn()
      .mockResolvedValue({ total: 1, subscriptions: [] });
    (mockAdminService as any).getSubscriptionPlans = jest
      .fn()
      .mockResolvedValue({ plans: [] });
    (mockAdminService as any).getSubscriptionByOrgId = jest
      .fn()
      .mockResolvedValue({ id: 'sub-1', planCode: 'STARTER' });
    (mockAdminService as any).updateSubscription = jest
      .fn()
      .mockResolvedValue({ message: 'ok' });
    (mockAdminService as any).listInvoices = jest
      .fn()
      .mockResolvedValue({ total: 0, invoices: [] });
    (mockAdminService as any).getInvoiceById = jest
      .fn()
      .mockResolvedValue({ id: 'inv-1', status: 'OPEN' });
    (mockAdminService as any).markInvoicePaid = jest
      .fn()
      .mockResolvedValue({ message: 'paid' });
    (mockAdminService as any).voidInvoice = jest
      .fn()
      .mockResolvedValue({ message: 'voided' });

    const adminUser = {
      id: 'admin-1',
      name: 'Admin User',
      email: 'admin@stackhr.app',
      role: 'STACKHR_ADMIN',
      userType: 'STACKHR_ADMIN',
      organizationId: null,
      orgSlug: null,
      orgName: null,
    } as unknown as AuthenticatedUser;

    await expect(
      controller.listSubscriptions('ACTIVE', 'acme', '1', '10'),
    ).resolves.toEqual({
      total: 1,
      subscriptions: [],
    });
    expect((mockAdminService as any).listSubscriptions).toHaveBeenCalledWith({
      status: 'ACTIVE',
      search: 'acme',
      page: 1,
      limit: 10,
    });

    await expect(controller.getSubscriptionPlans()).resolves.toEqual({
      plans: [],
    });
    await expect(controller.getSubscriptionByOrgId('org-1')).resolves.toEqual({
      id: 'sub-1',
      planCode: 'STARTER',
    });
    await expect(
      controller.updateSubscription(adminUser, 'org-1', {
        planCode: 'STARTER',
      }),
    ).resolves.toEqual({ message: 'ok' });

    await expect(
      controller.listInvoices('org-1', 'OPEN', 'INV', '1', '10'),
    ).resolves.toEqual({
      total: 0,
      invoices: [],
    });
    await expect(controller.getInvoiceById('inv-1')).resolves.toEqual({
      id: 'inv-1',
      status: 'OPEN',
    });
    await expect(
      controller.markInvoicePaid(adminUser, 'inv-1', { notes: 'Paid' }),
    ).resolves.toEqual({
      message: 'paid',
    });
    await expect(
      controller.voidInvoice(adminUser, 'inv-1', { reason: 'Void' }),
    ).resolves.toEqual({
      message: 'voided',
    });
  });
});
