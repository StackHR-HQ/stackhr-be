import { Test, TestingModule } from '@nestjs/testing';
import { StackhrAdminService } from './stackhr-admin.service';
import { PrismaService } from '../database/prisma.service';
import { OutboxService } from '../common/outbox/outbox.service';
import { ResilientHttpClient } from '../common/resilience/resilient-client';
import type { AuthenticatedUser } from '../auth/auth.types';

describe('StackhrAdminService', () => {
  let service: StackhrAdminService;
  let prismaMock: any;
  let outboxMock: any;

  const adminUser: AuthenticatedUser = {
    id: 'sys-admin-1',
    name: 'Platform Admin',
    email: 'admin@stackhr.app',
    userType: 'STACKHR_ADMIN',
    role: 'STACKHR_ADMIN',
    organizationId: null,
  };

  beforeEach(async () => {
    prismaMock = {
      $queryRaw: jest.fn().mockResolvedValue([{ 1: 1 }]),
      organization: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'org-1',
            name: 'Acme Corp',
            slug: 'acme-corp',
            industry: 'Technology',
            companySize: '11-50',
            currency: 'NGN',
            payrollFrequency: 'MONTHLY',
            taxId: 'TIN-123',
            penCentralEmployerCode: 'PR0000126311',
            metadata: null,
            owner: { id: 'u-1', name: 'Owner', email: 'owner@acme.com' },
            depositAccount: {
              accountNumber: '9912345678',
              bankName: 'PROVIDUS BANK',
              balanceKobo: 1500000000n,
              status: 'ACTIVE',
            },
            documents: [],
            _count: { employees: 5, payrollRuns: 2, departments: 2 },
            createdAt: new Date('2026-09-01T10:00:00.000Z'),
            updatedAt: new Date('2026-09-01T10:00:00.000Z'),
          },
        ]),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      employee: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'emp-1',
            employeeNumber: 'ACM-EMP-0001',
            fullName: 'Ada Okafor',
            email: 'ada@acme.com',
            jobTitle: 'Software Engineer',
            department: 'Engineering',
            employmentType: 'FULL_TIME',
            status: 'ACTIVE',
            salaryAmount: 500000,
            annualSalaryMinor: 600000000n,
            organizationId: 'org-1',
            createdAt: new Date('2026-09-01T10:00:00.000Z'),
          },
        ]),
        findUnique: jest.fn(),
        count: jest.fn().mockResolvedValue(1),
      },
      payrollRun: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'run-1',
            organizationId: 'org-1',
            title: 'September 2026 Payroll',
            status: 'RECONCILED',
            totalGross: 2500000,
            totalNet: 2100000,
            shortfallAmount: 0,
            createdAt: new Date('2026-09-25T10:00:00.000Z'),
            updatedAt: new Date('2026-09-25T10:00:00.000Z'),
          },
        ]),
        findUnique: jest.fn(),
        count: jest.fn().mockResolvedValue(1),
      },
      waitlistEntry: {
        count: jest.fn().mockResolvedValue(42),
      },
      organizationDepositAccount: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: 'acc-1', balanceKobo: 1500000000n }]),
      },
      auditEvent: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
        create: jest.fn().mockResolvedValue({
          id: 'aud-1',
          createdAt: new Date(),
        }),
        update: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
      },
      session: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      reimbursement: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      salaryAdvance: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      corporateCard: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      deadLetterEvent: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      user: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      document: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      outboxEvent: {
        count: jest.fn().mockResolvedValue(0),
      },
      idempotencyKey: {
        count: jest.fn().mockResolvedValue(0),
      },
    };

    outboxMock = {
      getDlqCount: jest.fn().mockResolvedValue(0),
      getDeadLetterEvents: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StackhrAdminService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: OutboxService, useValue: outboxMock },
        {
          provide: ResilientHttpClient,
          useValue: { getAllCircuitStats: () => [] },
        },
      ],
    }).compile();

    service = module.get<StackhrAdminService>(StackhrAdminService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('returns platform dashboard metrics', async () => {
    const dashboard = await service.getDashboard();
    expect(dashboard.metrics.totalBusinesses).toBe(1);
    expect(dashboard.metrics.totalEmployees).toBe(1);
    expect(dashboard.metrics.totalPayrollNetMajor).toBe(2100000);
    expect(dashboard.metrics.waitlistCount).toBe(42);
  });

  it('lists and suspends/reactivates businesses', async () => {
    const list = await service.listBusinesses({ status: 'active' });
    expect(list.businesses).toHaveLength(1);
    expect(list.businesses[0].status).toBe('active');

    prismaMock.organization.findUnique.mockResolvedValue({
      id: 'org-1',
      name: 'Acme Corp',
      slug: 'acme-corp',
      industry: 'Technology',
      companySize: '11-50',
      metadata: null,
    });
    prismaMock.organization.update.mockResolvedValue({
      id: 'org-1',
      name: 'Acme Corp',
      slug: 'acme-corp',
    });

    const suspended = await service.suspendBusiness(adminUser, 'org-1', {
      reason: 'Compliance review',
    });
    expect(suspended.business.status).toBe('suspended');
    expect(prismaMock.session.updateMany).toHaveBeenCalled();
  });

  it('lists cross-business employees and payroll runs', async () => {
    const employees = await service.listEmployees({});
    expect(employees.total).toBe(1);
    expect(employees.employees[0].annualSalaryMinor).toBe(600000000);

    const runs = await service.listPayrollRuns({});
    expect(runs.total).toBe(1);
  });

  it('lists and decides KYB verification', async () => {
    const kyb = await service.listKybVerifications();
    expect(kyb.verifications).toHaveLength(1);

    prismaMock.organization.findUnique.mockResolvedValue({
      id: 'org-1',
      name: 'Acme Corp',
      metadata: null,
    });
    prismaMock.organization.update.mockResolvedValue({ id: 'org-1' });

    const decided = await service.decideKybVerification(adminUser, 'org-1', {
      decision: 'APPROVED',
      notes: 'TIN and PenCentral verified',
    });
    expect(decided.verification.kybStatus).toBe('VERIFIED');
  });

  it('returns system health overview', async () => {
    const health = await service.getSystemHealth();
    expect(health.status).toBe('healthy');
    expect(health.database.status).toBe('up');
    expect(health.backgroundJobs.dlqDepth).toBe(0);
  });
});
