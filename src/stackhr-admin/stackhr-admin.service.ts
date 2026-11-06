import {
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../database/prisma.service';
import { OutboxService } from '../common/outbox/outbox.service';
import { ResilientHttpClient } from '../common/resilience/resilient-client';
import type { AuthenticatedUser } from '../auth/auth.types';
import type {
  CreateAdminUserDto,
  CreateAnnouncementDto,
  CreateSupportTicketDto,
  DecideKybDto,
  ReactivateBusinessDto,
  SuspendBusinessDto,
  UpdateAdminUserDto,
  UpdateBusinessStatusDto,
  UpdateSubscriptionDto,
  UpdateSupportTicketDto,
} from './dto/stackhr-admin.dto';

export interface OrgMetadata {
  status?:
    'active' | 'trial' | 'suspended' | 'pending_verification' | 'inactive';
  suspendedReason?: string | null;
  suspendedAt?: string | null;
  reactivatedAt?: string | null;
  kybStatus?: 'PENDING' | 'VERIFIED' | 'REJECTED';
  kybReviewedAt?: string | null;
  kybReviewedBy?: string | null;
  kybNotes?: string | null;
  subscription?: {
    planId: 'STARTER' | 'GROWTH' | 'ENTERPRISE';
    planName: string;
    status: 'trial' | 'active' | 'past_due' | 'cancelled' | 'expired';
    billingCycle: 'MONTHLY' | 'ANNUAL';
    pricePerEmployeeMajor: number;
    currentPeriodEnd: string;
  };
}

const PLATFORM_PLANS = [
  {
    id: 'STARTER',
    name: 'Starter',
    pricePerEmployeeMajor: 2500,
    baseMonthlyFeeMajor: 15000,
    currency: 'NGN',
    maxEmployees: 25,
    features: ['Core HR & Directory', 'Leave & Onboarding', 'Monthly Payroll'],
  },
  {
    id: 'GROWTH',
    name: 'Growth',
    pricePerEmployeeMajor: 4500,
    baseMonthlyFeeMajor: 35000,
    currency: 'NGN',
    maxEmployees: 250,
    features: [
      'Everything in Starter',
      'Anchor BaaS Payouts & Corporate Cards',
      'PenCentral Pension Remittance',
      'Expenses, Reimbursements & Salary Advances',
    ],
  },
  {
    id: 'ENTERPRISE',
    name: 'Enterprise',
    pricePerEmployeeMajor: 7500,
    baseMonthlyFeeMajor: 100000,
    currency: 'NGN',
    maxEmployees: null,
    features: [
      'Everything in Growth',
      'Multi-Stage Approval Chains',
      'Custom Tax & Compliance Rules',
      'Dedicated Account Manager & SLA',
    ],
  },
];

function parseOrgMetadata(raw: string | null | undefined): OrgMetadata {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

function parsePositiveInt(
  value: number | string | undefined,
  fallback: number,
  max = 200,
): number {
  if (value === undefined || value === null || value === '') return fallback;
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num) || num < 1) return fallback;
  return Math.min(max, Math.floor(num));
}

function deriveBusinessStatus(
  org: {
    industry?: string | null;
    companySize?: string | null;
    taxId?: string | null;
    metadata?: string | null;
  },
  employeeCount: number,
): 'active' | 'trial' | 'suspended' | 'pending_verification' | 'inactive' {
  const meta = parseOrgMetadata(org.metadata);
  if (meta.status) return meta.status;
  if (!org.industry || !org.companySize) return 'pending_verification';
  if (employeeCount === 0) return 'trial';
  return 'active';
}

function deriveKybStatus(org: {
  taxId?: string | null;
  penCentralEmployerCode?: string | null;
  metadata?: string | null;
}): 'PENDING' | 'VERIFIED' | 'REJECTED' {
  const meta = parseOrgMetadata(org.metadata);
  if (meta.kybStatus) return meta.kybStatus;
  if (org.taxId && org.penCentralEmployerCode) return 'VERIFIED';
  return 'PENDING';
}

@Injectable()
export class StackhrAdminService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly outboxService?: OutboxService,
    @Optional() private readonly resilientClient?: ResilientHttpClient,
  ) {}

  async getDashboard() {
    const completedStatuses = ['PAID', 'RECONCILED', 'COMPLETED', 'PROCESSING'];

    const [
      organizations,
      totalEmployeesCount,
      activeEmployeesCount,
      totalPayrollRunsCount,
      payrollAggregate,
      waitlistCount,
      depositAggregate,
      recentAuditEvents,
      dlqCount,
    ] = await Promise.all([
      this.prisma.organization.findMany({
        select: {
          id: true,
          name: true,
          industry: true,
          companySize: true,
          taxId: true,
          metadata: true,
          _count: { select: { employees: true, payrollRuns: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.employee.count(),
      this.prisma.employee
        .count({ where: { status: 'ACTIVE' } })
        .catch(() => 0),
      this.prisma.payrollRun.count(),
      typeof (this.prisma.payrollRun as any).aggregate === 'function'
        ? (this.prisma.payrollRun as any).aggregate({
            where: { status: { in: completedStatuses } },
            _sum: { totalNet: true },
            _count: { _all: true },
          })
        : this.prisma.payrollRun
            .findMany({
              select: { status: true, totalNet: true },
            })
            .then((runs) => {
              const comp = runs.filter((r) =>
                completedStatuses.includes(r.status),
              );
              return {
                _count: { _all: comp.length },
                _sum: {
                  totalNet: comp.reduce((s, r) => s + (r.totalNet ?? 0), 0),
                },
              };
            }),
      this.prisma.waitlistEntry.count(),
      typeof (this.prisma.organizationDepositAccount as any).aggregate ===
      'function'
        ? (this.prisma.organizationDepositAccount as any).aggregate({
            _sum: { balanceKobo: true },
          })
        : this.prisma.organizationDepositAccount
            .findMany({ select: { balanceKobo: true } })
            .then((accs) => ({
              _sum: {
                balanceKobo: accs.reduce(
                  (s, a) => s + BigInt(a.balanceKobo ?? 0n),
                  0n,
                ),
              },
            })),
      this.prisma.auditEvent.findMany({
        take: 15,
        orderBy: { createdAt: 'desc' },
        include: {
          organization: { select: { id: true, name: true, slug: true } },
        },
      }),
      this.outboxService
        ? this.outboxService.getDlqCount().catch(() => 0)
        : Promise.resolve(0),
    ]);

    const statusCounts = {
      active: 0,
      trial: 0,
      suspended: 0,
      pending_verification: 0,
      inactive: 0,
    };

    let estimatedMonthlyRevenueMajor = 0;
    for (const org of organizations) {
      const empCount = org._count?.employees ?? 0;
      const st = deriveBusinessStatus(org, empCount);
      statusCounts[st] = (statusCounts[st] ?? 0) + 1;
      if (st === 'active') {
        const meta = parseOrgMetadata(org.metadata);
        const plan =
          PLATFORM_PLANS.find((p) => p.id === meta.subscription?.planId) ??
          PLATFORM_PLANS[1];
        estimatedMonthlyRevenueMajor +=
          plan.baseMonthlyFeeMajor + empCount * plan.pricePerEmployeeMajor;
      }
    }

    const completedPayrollRuns = payrollAggregate?._count?._all ?? 0;
    const totalPayrollNetMajor = Number(payrollAggregate?._sum?.totalNet ?? 0);
    const totalDepositBalanceKobo = Number(
      depositAggregate?._sum?.balanceKobo ?? 0n,
    );

    const alerts: Array<{
      id: string;
      severity: 'INFO' | 'WARNING' | 'CRITICAL';
      title: string;
      description: string;
    }> = [];
    if (dlqCount > 0) {
      alerts.push({
        id: 'alert-dlq',
        severity: 'WARNING',
        title: `${dlqCount} event(s) in Outbox Dead Letter Queue`,
        description:
          'Review and replay failed background events in System Health / Outbox DLQ.',
      });
    }
    if (statusCounts.pending_verification > 0) {
      alerts.push({
        id: 'alert-kyb',
        severity: 'INFO',
        title: `${statusCounts.pending_verification} business(es) pending onboarding or KYB verification`,
        description: 'Check the Compliance KYB queue to review new businesses.',
      });
    }

    return {
      metrics: {
        totalBusinesses: organizations.length,
        businessByStatus: statusCounts,
        totalEmployees: totalEmployeesCount,
        activeEmployees: activeEmployeesCount,
        totalPayrollRuns: totalPayrollRunsCount,
        completedPayrollRuns,
        totalPayrollNetMajor,
        totalDepositBalanceKobo,
        estimatedMonthlyRevenueMajor,
        waitlistCount,
        dlqDepth: dlqCount,
      },
      recentActivity: recentAuditEvents.map((ev) => ({
        id: ev.id,
        action: ev.action,
        description: ev.description,
        targetType: ev.targetType,
        targetId: ev.targetId,
        actorUserId: ev.actorUserId,
        organizationId: ev.organizationId,
        organizationName: ev.organization?.name ?? null,
        createdAt: ev.createdAt,
      })),
      alerts,
    };
  }

  async listBusinesses(filters: {
    status?: string;
    search?: string;
    page?: number;
    limit?: number;
  }) {
    const organizations = await this.prisma.organization.findMany({
      where: filters.search
        ? {
            OR: [
              { name: { contains: filters.search, mode: 'insensitive' } },
              { slug: { contains: filters.search, mode: 'insensitive' } },
              { industry: { contains: filters.search, mode: 'insensitive' } },
            ],
          }
        : undefined,
      include: {
        owner: { select: { id: true, name: true, email: true } },
        depositAccount: true,
        _count: {
          select: {
            employees: true,
            payrollRuns: true,
            departments: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const mapped = organizations.map((org) => {
      const employeeCount = org._count?.employees ?? 0;
      const status = deriveBusinessStatus(org, employeeCount);
      const kybStatus = deriveKybStatus(org);
      const meta = parseOrgMetadata(org.metadata);

      return {
        id: org.id,
        name: org.name,
        slug: org.slug,
        logo: org.logo,
        industry: org.industry,
        companySize: org.companySize,
        currency: org.currency,
        payrollFrequency: org.payrollFrequency,
        taxId: org.taxId,
        penCentralEmployerCode: org.penCentralEmployerCode,
        status,
        kybStatus,
        suspendedReason: meta.suspendedReason ?? null,
        suspendedAt: meta.suspendedAt ?? null,
        owner: org.owner ?? null,
        employeeCount,
        payrollRunCount: org._count?.payrollRuns ?? 0,
        departmentCount: org._count?.departments ?? 0,
        depositAccount: org.depositAccount
          ? {
              accountNumber: org.depositAccount.accountNumber,
              bankName: org.depositAccount.bankName,
              balanceKobo: Number(org.depositAccount.balanceKobo),
              status: org.depositAccount.status,
            }
          : null,
        createdAt: org.createdAt,
        updatedAt: org.updatedAt,
      };
    });

    const filtered = filters.status
      ? mapped.filter(
          (b) =>
            b.status.toLowerCase() ===
            filters.status!.toLowerCase().replace(/\s+/g, '_'),
        )
      : mapped;

    const page = parsePositiveInt(filters.page, 1, 10000);
    const limit = parsePositiveInt(filters.limit, 50, 200);
    const start = (page - 1) * limit;

    return {
      total: filtered.length,
      page,
      limit,
      businesses: filtered.slice(start, start + limit),
    };
  }

  async exportBusinesses(status?: string) {
    const { businesses } = await this.listBusinesses({ status, limit: 1000 });
    const header =
      'id,name,slug,status,kybStatus,industry,companySize,employeeCount,payrollRunCount,ownerEmail,createdAt';
    const rows = businesses.map((b) =>
      [
        b.id,
        `"${(b.name ?? '').replace(/"/g, '""')}"`,
        b.slug,
        b.status,
        b.kybStatus,
        `"${(b.industry ?? '').replace(/"/g, '""')}"`,
        b.companySize ?? '',
        b.employeeCount,
        b.payrollRunCount,
        b.owner?.email ?? '',
        b.createdAt.toISOString(),
      ].join(','),
    );
    return {
      csv: [header, ...rows].join('\n'),
      count: businesses.length,
      businesses,
    };
  }

  async getBusinessById(id: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id },
      include: {
        owner: { select: { id: true, name: true, email: true } },
        depositAccount: true,
        members: {
          include: {
            user: {
              select: { id: true, name: true, email: true, banned: true },
            },
          },
        },
        _count: {
          select: {
            employees: true,
            payrollRuns: true,
            departments: true,
            teams: true,
            documents: true,
            corporateCards: true,
          },
        },
      },
    });

    if (!org) {
      throw new NotFoundException(`Business "${id}" was not found`);
    }

    const [recentPayrollRuns, recentAuditEvents] = await Promise.all([
      this.prisma.payrollRun.findMany({
        where: { organizationId: id },
        take: 10,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.auditEvent.findMany({
        where: { organizationId: id },
        take: 20,
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const employeeCount = org._count?.employees ?? 0;
    const status = deriveBusinessStatus(org, employeeCount);
    const kybStatus = deriveKybStatus(org);
    const meta = parseOrgMetadata(org.metadata);

    return {
      business: {
        id: org.id,
        name: org.name,
        slug: org.slug,
        logo: org.logo,
        industry: org.industry,
        companySize: org.companySize,
        currency: org.currency,
        payrollFrequency: org.payrollFrequency,
        payDate: org.payDate,
        taxId: org.taxId,
        penCentralEmployerCode: org.penCentralEmployerCode,
        status,
        kybStatus,
        metadata: meta,
        owner: org.owner ?? null,
        counts: org._count,
        depositAccount: org.depositAccount
          ? {
              ...org.depositAccount,
              balanceKobo: Number(org.depositAccount.balanceKobo),
            }
          : null,
        members: org.members,
        recentPayrollRuns,
        recentAuditEvents,
        createdAt: org.createdAt,
        updatedAt: org.updatedAt,
      },
    };
  }

  async suspendBusiness(
    actor: AuthenticatedUser,
    id: string,
    dto: SuspendBusinessDto,
  ) {
    return this.updateBusinessStatus(actor, id, {
      status: 'suspended',
      reason: dto.reason ?? 'Suspended by platform administrator',
    });
  }

  async reactivateBusiness(
    actor: AuthenticatedUser,
    id: string,
    dto: ReactivateBusinessDto,
  ) {
    return this.updateBusinessStatus(actor, id, {
      status: 'active',
      reason: dto.note ?? 'Reactivated by platform administrator',
    });
  }

  async updateBusinessStatus(
    actor: AuthenticatedUser,
    id: string,
    dto: UpdateBusinessStatusDto,
  ) {
    const org = await this.prisma.organization.findUnique({ where: { id } });
    if (!org) {
      throw new NotFoundException(`Business "${id}" was not found`);
    }

    const meta = parseOrgMetadata(org.metadata);
    const previousStatus = deriveBusinessStatus(org, 1);
    const now = new Date().toISOString();

    const nextMeta: OrgMetadata = {
      ...meta,
      status: dto.status,
      ...(dto.status === 'suspended'
        ? {
            suspendedReason: dto.reason ?? 'Suspended by platform admin',
            suspendedAt: now,
          }
        : {}),
      ...(dto.status === 'active'
        ? {
            suspendedReason: null,
            reactivatedAt: now,
          }
        : {}),
    };

    const updated = await this.prisma.organization.update({
      where: { id },
      data: { metadata: JSON.stringify(nextMeta) },
    });

    if (dto.status === 'suspended') {
      await this.prisma.session.updateMany({
        where: { activeOrganizationId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }

    await this.prisma.auditEvent.create({
      data: {
        organizationId: id,
        actorUserId: actor.id,
        action: `business.${dto.status}`,
        targetType: 'organization',
        targetId: id,
        description: `Business "${org.name}" status changed from ${previousStatus} to ${dto.status}`,
        changes: {
          previousStatus,
          newStatus: dto.status,
          reason: dto.reason ?? null,
        },
      },
    });

    return {
      message: `Business status updated to ${dto.status}`,
      business: {
        id: updated.id,
        name: updated.name,
        slug: updated.slug,
        status: dto.status,
        metadata: nextMeta,
      },
    };
  }

  async listEmployees(filters: {
    organizationId?: string;
    status?: string;
    department?: string;
    employmentType?: string;
    search?: string;
    page?: number;
    limit?: number;
  }) {
    const where: Record<string, any> = {};
    if (filters.organizationId) where.organizationId = filters.organizationId;
    if (filters.status) where.status = filters.status.toUpperCase();
    if (filters.department) where.department = filters.department;
    if (filters.employmentType)
      where.employmentType = filters.employmentType.toUpperCase();
    if (filters.search) {
      where.OR = [
        { fullName: { contains: filters.search, mode: 'insensitive' } },
        { email: { contains: filters.search, mode: 'insensitive' } },
        { employeeNumber: { contains: filters.search, mode: 'insensitive' } },
        { jobTitle: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    const page = parsePositiveInt(filters.page, 1, 10000);
    const limit = parsePositiveInt(filters.limit, 50, 200);
    const skip = (page - 1) * limit;

    const [total, employees] = await Promise.all([
      this.prisma.employee.count({ where }),
      this.prisma.employee.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          organization: { select: { id: true, name: true, slug: true } },
          manager: { select: { id: true, fullName: true, email: true } },
        },
      }),
    ]);

    return {
      total,
      page,
      limit,
      employees: employees.map((emp) => ({
        id: emp.id,
        employeeNumber: emp.employeeNumber,
        fullName: emp.fullName,
        email: emp.email,
        phone: emp.phone,
        jobTitle: emp.jobTitle,
        department: emp.department,
        employmentType: emp.employmentType,
        status: emp.status,
        salaryAmount: emp.salaryAmount,
        annualSalaryMinor: Number(emp.annualSalaryMinor),
        currency: emp.currency ?? 'NGN',
        startDate: emp.startDate,
        organizationId: emp.organizationId,
        organization: emp.organization,
        manager: emp.manager,
        createdAt: emp.createdAt,
      })),
    };
  }

  async getEmployeeById(id: string) {
    const emp = await this.prisma.employee.findUnique({
      where: { id },
      include: {
        organization: { select: { id: true, name: true, slug: true } },
        manager: { select: { id: true, fullName: true, email: true } },
        compensationRecords: { orderBy: { effectiveFrom: 'desc' }, take: 5 },
        compensationHistories: { orderBy: { createdAt: 'desc' }, take: 10 },
        corporateCards: true,
      },
    });

    if (!emp) {
      throw new NotFoundException(`Employee "${id}" was not found`);
    }

    const safeEmployee: Record<string, any> = { ...emp };
    delete safeEmployee.invitationToken;

    return {
      employee: {
        ...safeEmployee,
        annualSalaryMinor: Number(emp.annualSalaryMinor),
        compensationHistories: emp.compensationHistories.map((h) => ({
          ...h,
          annualSalaryMinor: Number(h.annualSalaryMinor),
        })),
      },
    };
  }

  async listPayrollRuns(filters: {
    status?: string;
    organizationId?: string;
    periodYear?: number;
    periodMonth?: number;
    page?: number;
    limit?: number;
  }) {
    const where: Record<string, any> = {};
    if (filters.status) where.status = filters.status.toUpperCase();
    if (filters.organizationId) where.organizationId = filters.organizationId;
    if (filters.periodYear) where.periodYear = filters.periodYear;
    if (filters.periodMonth) where.periodMonth = filters.periodMonth;

    const page = parsePositiveInt(filters.page, 1, 10000);
    const limit = parsePositiveInt(filters.limit, 50, 200);
    const skip = (page - 1) * limit;

    const [total, runs] = await Promise.all([
      this.prisma.payrollRun.count({ where }),
      this.prisma.payrollRun.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          organization: { select: { id: true, name: true, slug: true } },
          _count: { select: { items: true, payslips: true } },
        },
      }),
    ]);

    return {
      total,
      page,
      limit,
      runs: runs.map((run) => ({
        ...run,
        employeeCount: run._count?.items ?? 0,
        payslipCount: run._count?.payslips ?? 0,
        bulkTransfer: (run as any).bulkTransferJson ?? null,
        paymentExportBatch: (run as any).paymentExportBatchJson ?? null,
      })),
    };
  }

  async getPayrollRunById(id: string) {
    const run = await this.prisma.payrollRun.findUnique({
      where: { id },
      include: {
        organization: { select: { id: true, name: true, slug: true } },
        items: {
          include: {
            employee: {
              select: {
                id: true,
                fullName: true,
                email: true,
                employeeNumber: true,
                department: true,
                bankName: true,
                accountNumber: true,
              },
            },
          },
        },
        payslips: true,
        pensionRemittanceSchedule: true,
      },
    });

    if (!run) {
      throw new NotFoundException(`Payroll run "${id}" was not found`);
    }

    return {
      run: {
        ...run,
        bulkTransfer: (run as any).bulkTransferJson ?? null,
        paymentExportBatch: (run as any).paymentExportBatchJson ?? null,
      },
    };
  }

  async listPayrollExceptions() {
    const [runsWithIssues, employeesMissingBank] = await Promise.all([
      this.prisma.payrollRun.findMany({
        where: {
          status: { in: ['AWAITING_FUNDING', 'SHORTFALL', 'FAILED'] },
        },
        include: {
          organization: { select: { id: true, name: true, slug: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.employee.findMany({
        where: {
          status: 'ACTIVE',
          OR: [{ accountNumber: null }, { bankName: null }],
        },
        take: 50,
        include: {
          organization: { select: { id: true, name: true, slug: true } },
        },
      }),
    ]);

    return {
      exceptions: [
        ...runsWithIssues.map((r) => ({
          id: `exc-run-${r.id}`,
          type: 'PAYROLL_RUN_FUNDING_OR_STATUS',
          severity: r.status === 'FAILED' ? 'HIGH' : 'MEDIUM',
          organizationId: r.organizationId,
          organizationName: r.organization?.name ?? null,
          subjectId: r.id,
          title: r.title,
          status: r.status,
          totalNet: r.totalNet,
          createdAt: r.createdAt,
        })),
        ...employeesMissingBank.map((e) => ({
          id: `exc-emp-${e.id}`,
          type: 'MISSING_BANK_DETAILS',
          severity: 'LOW',
          organizationId: e.organizationId,
          organizationName: e.organization?.name ?? null,
          subjectId: e.id,
          title: `${e.fullName} is missing bank payout details`,
          status: e.status,
          shortfallAmount: 0,
          createdAt: e.createdAt,
        })),
      ],
    };
  }

  async getFinanceOverview() {
    const [
      depositAccounts,
      executedRuns,
      paidReimbursements,
      disbursedAdvances,
      corporateCards,
      dlqEvents,
    ] = await Promise.all([
      this.prisma.organizationDepositAccount.findMany({
        include: {
          organization: { select: { id: true, name: true, slug: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.payrollRun.findMany({
        where: {
          status: { in: ['PROCESSING', 'PAID', 'RECONCILED', 'COMPLETED'] },
        },
        include: {
          organization: { select: { id: true, name: true, slug: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      this.prisma.reimbursement.findMany({
        where: { status: 'PAID' },
        include: {
          organization: { select: { id: true, name: true, slug: true } },
          employee: { select: { id: true, fullName: true, email: true } },
        },
        orderBy: { updatedAt: 'desc' },
        take: 50,
      }),
      this.prisma.salaryAdvance.findMany({
        where: { status: { in: ['DISBURSED', 'REPAID'] } },
        include: {
          organization: { select: { id: true, name: true, slug: true } },
          employee: { select: { id: true, fullName: true, email: true } },
        },
        orderBy: { updatedAt: 'desc' },
        take: 50,
      }),
      this.prisma.corporateCard.findMany({
        include: {
          organization: { select: { id: true, name: true, slug: true } },
          employee: { select: { id: true, fullName: true, email: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      this.prisma.deadLetterEvent.findMany({
        orderBy: { createdAt: 'desc' },
        take: 25,
      }),
    ]);

    const paymentBatches = executedRuns.map((run) => ({
      id: run.id,
      organizationId: run.organizationId,
      organizationName: run.organization?.name ?? null,
      title: run.title,
      periodMonth: run.periodMonth,
      periodYear: run.periodYear,
      totalNetMajor: run.totalNet,
      totalNetKobo: run.totalNet * 100,
      status: run.status,
      bulkTransfer: (run as any).bulkTransferJson ?? null,
      executedAt: run.executedAt ?? run.updatedAt,
      reconciledAt: run.reconciledAt,
    }));

    const transfers = [
      ...paidReimbursements.map((r) => ({
        id: `trf-rem-${r.id}`,
        type: 'REIMBURSEMENT',
        organizationId: r.organizationId,
        organizationName: r.organization?.name ?? null,
        beneficiaryName: r.employee?.fullName ?? null,
        amountMajor: r.amount,
        amountKobo: r.amount * 100,
        currency: r.currency,
        status: r.status,
        reference: `rem_${r.id}`,
        createdAt: r.paidAt ?? r.updatedAt,
      })),
      ...disbursedAdvances.map((a) => ({
        id: `trf-adv-${a.id}`,
        type: 'SALARY_ADVANCE',
        organizationId: a.organizationId,
        organizationName: a.organization?.name ?? null,
        beneficiaryName: a.employee?.fullName ?? null,
        amountMajor: a.amount,
        amountKobo: a.amount * 100,
        currency: 'NGN',
        status: a.status,
        reference: `adv_${a.id}`,
        createdAt: a.disbursedAt ?? a.updatedAt,
      })),
    ];

    const reconciliation = executedRuns.map((run) => ({
      runId: run.id,
      organizationId: run.organizationId,
      organizationName: run.organization?.name ?? null,
      title: run.title,
      totalNetMajor: run.totalNet,
      status: run.status,
      reconciled: run.status === 'RECONCILED',
      reconciledAt: run.reconciledAt,
    }));

    return {
      summary: {
        totalDepositAccounts: depositAccounts.length,
        totalBalanceKobo: depositAccounts.reduce(
          (s, a) => s + Number(a.balanceKobo),
          0,
        ),
        totalPaymentBatches: paymentBatches.length,
        totalSingleTransfers: transfers.length,
        totalCorporateCards: corporateCards.length,
        failedTransactionsCount: dlqEvents.length,
      },
      depositAccounts: depositAccounts.map((a) => ({
        ...a,
        balanceKobo: Number(a.balanceKobo),
      })),
      paymentBatches,
      transfers,
      transactions: [...transfers, ...paymentBatches],
      corporateCards,
      failedTransactions: dlqEvents,
      reconciliation,
    };
  }

  async listSubscriptions(filters: { status?: string; search?: string }) {
    const organizations = await this.prisma.organization.findMany({
      where: filters.search
        ? {
            OR: [
              { name: { contains: filters.search, mode: 'insensitive' } },
              { slug: { contains: filters.search, mode: 'insensitive' } },
            ],
          }
        : undefined,
      include: {
        owner: { select: { id: true, name: true, email: true } },
        _count: { select: { employees: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const subscriptions = organizations.map((org) => {
      const meta = parseOrgMetadata(org.metadata);
      const empCount = org._count?.employees ?? 0;
      const plan =
        PLATFORM_PLANS.find((p) => p.id === meta.subscription?.planId) ??
        PLATFORM_PLANS[1];
      const subStatus =
        meta.subscription?.status ?? (empCount > 0 ? 'active' : 'trial');
      const billingCycle = meta.subscription?.billingCycle ?? 'MONTHLY';
      const monthlyAmountMajor =
        plan.baseMonthlyFeeMajor + empCount * plan.pricePerEmployeeMajor;

      return {
        id: `sub_${org.id}`,
        organizationId: org.id,
        organizationName: org.name,
        organizationSlug: org.slug,
        owner: org.owner,
        planId: plan.id,
        planName: plan.name,
        status: subStatus,
        billingCycle,
        employeeSeats: empCount,
        monthlyAmountMajor,
        currency: org.currency ?? 'NGN',
        currentPeriodEnd:
          meta.subscription?.currentPeriodEnd ??
          new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        createdAt: org.createdAt,
      };
    });

    const filtered = filters.status
      ? subscriptions.filter(
          (s) => s.status.toLowerCase() === filters.status!.toLowerCase(),
        )
      : subscriptions;

    return {
      total: filtered.length,
      plans: PLATFORM_PLANS,
      subscriptions: filtered,
      invoices: filtered.map((sub) => ({
        id: `inv_${sub.organizationId}_${new Date().getUTCFullYear()}_${new Date().getUTCMonth() + 1}`,
        organizationId: sub.organizationId,
        organizationName: sub.organizationName,
        planName: sub.planName,
        amountMajor: sub.monthlyAmountMajor,
        currency: sub.currency,
        status: sub.status === 'past_due' ? 'PAST_DUE' : 'PAID',
        issuedAt: sub.createdAt,
      })),
    };
  }

  getSubscriptionPlans() {
    return { plans: PLATFORM_PLANS };
  }

  async updateSubscription(
    actor: AuthenticatedUser,
    organizationId: string,
    dto: UpdateSubscriptionDto,
  ) {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
    });
    if (!org) {
      throw new NotFoundException(`Business "${organizationId}" was not found`);
    }

    const meta = parseOrgMetadata(org.metadata);
    const plan =
      PLATFORM_PLANS.find(
        (p) => p.id === (dto.planId ?? meta.subscription?.planId ?? 'GROWTH'),
      ) ?? PLATFORM_PLANS[1];

    const nextSub = {
      planId: plan.id as 'STARTER' | 'GROWTH' | 'ENTERPRISE',
      planName: plan.name,
      status: dto.status ?? meta.subscription?.status ?? 'active',
      billingCycle:
        dto.billingCycle ?? meta.subscription?.billingCycle ?? 'MONTHLY',
      pricePerEmployeeMajor: plan.pricePerEmployeeMajor,
      currentPeriodEnd:
        meta.subscription?.currentPeriodEnd ??
        new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    };

    const nextMeta: OrgMetadata = {
      ...meta,
      subscription: nextSub,
    };

    await this.prisma.organization.update({
      where: { id: organizationId },
      data: { metadata: JSON.stringify(nextMeta) },
    });

    await this.prisma.auditEvent.create({
      data: {
        organizationId,
        actorUserId: actor.id,
        action: 'subscription.updated',
        targetType: 'organization',
        targetId: organizationId,
        description: `Subscription updated to ${nextSub.planName} (${nextSub.status})`,
        changes: nextSub,
      },
    });

    return {
      message: 'Subscription updated successfully',
      subscription: {
        organizationId,
        organizationName: org.name,
        ...nextSub,
      },
    };
  }

  async listKybVerifications(status?: string) {
    const organizations = await this.prisma.organization.findMany({
      include: {
        owner: { select: { id: true, name: true, email: true } },
        documents: {
          where: { category: { in: ['Compliance', 'Identification'] } },
        },
        depositAccount: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    const queue = organizations.map((org) => {
      const kybStatus = deriveKybStatus(org);
      const meta = parseOrgMetadata(org.metadata);

      return {
        organizationId: org.id,
        organizationName: org.name,
        organizationSlug: org.slug,
        industry: org.industry,
        companySize: org.companySize,
        taxId: org.taxId,
        penCentralEmployerCode: org.penCentralEmployerCode,
        kybStatus,
        reviewedAt: meta.kybReviewedAt ?? null,
        reviewedBy: meta.kybReviewedBy ?? null,
        notes: meta.kybNotes ?? null,
        owner: org.owner,
        hasDepositAccount: Boolean(org.depositAccount),
        verificationDocuments: org.documents.map((doc) => ({
          id: doc.id,
          name: doc.name,
          category: doc.category,
          fileName: doc.fileName,
          mimeType: doc.mimeType,
          sizeBytes: doc.sizeBytes,
          downloadUrl: `/v1/api/people/documents/${doc.id}/download`,
          createdAt: doc.createdAt,
        })),
        submittedAt: org.createdAt,
      };
    });

    const filtered = status
      ? queue.filter(
          (item) => item.kybStatus.toLowerCase() === status.toLowerCase(),
        )
      : queue;

    return {
      total: filtered.length,
      verifications: filtered,
    };
  }

  async getKybVerificationByOrgId(organizationId: string) {
    const { verifications } = await this.listKybVerifications();
    const match = verifications.find(
      (v) => v.organizationId === organizationId,
    );
    if (!match) {
      throw new NotFoundException(
        `Business "${organizationId}" was not found in KYB queue`,
      );
    }
    return { verification: match };
  }

  async decideKybVerification(
    actor: AuthenticatedUser,
    organizationId: string,
    dto: DecideKybDto,
  ) {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
    });
    if (!org) {
      throw new NotFoundException(`Business "${organizationId}" was not found`);
    }

    const meta = parseOrgMetadata(org.metadata);
    const normalizedKybStatus: 'VERIFIED' | 'REJECTED' =
      dto.decision === 'REJECTED' ? 'REJECTED' : 'VERIFIED';
    const now = new Date().toISOString();

    const nextMeta: OrgMetadata = {
      ...meta,
      kybStatus: normalizedKybStatus,
      kybReviewedAt: now,
      kybReviewedBy: actor.id,
      kybNotes: dto.notes ?? null,
      status:
        normalizedKybStatus === 'VERIFIED' &&
        meta.status === 'pending_verification'
          ? 'active'
          : meta.status,
    };

    await this.prisma.organization.update({
      where: { id: organizationId },
      data: { metadata: JSON.stringify(nextMeta) },
    });

    await this.prisma.auditEvent.create({
      data: {
        organizationId,
        actorUserId: actor.id,
        action: `kyb.${normalizedKybStatus.toLowerCase()}`,
        targetType: 'organization',
        targetId: organizationId,
        description: `KYB verification for "${org.name}" marked ${normalizedKybStatus}`,
        changes: {
          kybStatus: normalizedKybStatus,
          notes: dto.notes ?? null,
        },
      },
    });

    return {
      message: `KYB verification marked ${normalizedKybStatus}`,
      verification: {
        organizationId,
        organizationName: org.name,
        kybStatus: normalizedKybStatus,
        reviewedAt: now,
        reviewedBy: actor.id,
        notes: dto.notes ?? null,
      },
    };
  }

  async listUsers(filters: {
    userType?: string;
    role?: string;
    banned?: string;
    search?: string;
  }) {
    const where: Record<string, any> = {};
    if (filters.userType) where.userType = filters.userType.toUpperCase();
    if (filters.role) where.role = filters.role.toUpperCase();
    if (filters.banned !== undefined) {
      where.banned = filters.banned === 'true';
    }
    if (filters.search) {
      where.OR = [
        { name: { contains: filters.search, mode: 'insensitive' } },
        { email: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    const users = await this.prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        memberships: {
          include: {
            organization: { select: { id: true, name: true, slug: true } },
          },
        },
        _count: { select: { sessions: true } },
      },
    });

    return {
      total: users.length,
      users: users.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        emailVerified: u.emailVerified,
        userType: u.userType,
        role: u.role ?? u.memberships[0]?.role ?? null,
        banned: Boolean(u.banned),
        banReason: u.banReason,
        banExpires: u.banExpires,
        memberships: u.memberships,
        sessionCount: u._count?.sessions ?? 0,
        createdAt: u.createdAt,
        updatedAt: u.updatedAt,
      })),
    };
  }

  async createAdminUser(dto: CreateAdminUserDto) {
    const email = dto.email.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException(
        `A user with email "${email}" already exists`,
      );
    }

    const user = await this.prisma.user.create({
      data: {
        id: randomUUID(),
        name: dto.name.trim(),
        email,
        emailVerified: true,
        userType: 'STACKHR_ADMIN',
        role: dto.role ?? 'STACKHR_ADMIN',
      },
    });

    return {
      message: 'Platform admin user created successfully',
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        userType: user.userType,
        role: user.role,
        banned: Boolean(user.banned),
        createdAt: user.createdAt,
      },
    };
  }

  async updateUser(id: string, dto: UpdateAdminUserDto) {
    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`User "${id}" was not found`);
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.role !== undefined ? { role: dto.role } : {}),
        ...(dto.banned !== undefined ? { banned: dto.banned } : {}),
        ...(dto.banReason !== undefined ? { banReason: dto.banReason } : {}),
      },
    });

    if (dto.banned === true) {
      await this.prisma.session.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }

    return {
      message: 'User updated successfully',
      user: {
        id: updated.id,
        name: updated.name,
        email: updated.email,
        userType: updated.userType,
        role: updated.role,
        banned: Boolean(updated.banned),
        banReason: updated.banReason,
        updatedAt: updated.updatedAt,
      },
    };
  }

  getRolesAndPermissions() {
    return {
      roles: [
        {
          role: 'STACKHR_ADMIN',
          userType: 'STACKHR',
          description: 'Full platform super-administrator access',
          permissions: ['*'],
        },
        {
          role: 'STACKHR_SUPPORT',
          userType: 'STACKHR',
          description: 'Platform support and operational triage access',
          permissions: [
            'businesses:read',
            'employees:read',
            'payroll:read',
            'outbox:replay',
            'support:write',
          ],
        },
        {
          role: 'BUSINESS_OWNER',
          userType: 'BUSINESS',
          description: 'Organization owner with full tenant control',
          permissions: ['tenant:*'],
        },
        {
          role: 'BUSINESS_ADMIN',
          userType: 'BUSINESS',
          description: 'Organization administrator across HR, Payroll & Spend',
          permissions: ['people:*', 'payroll:*', 'spend:*', 'banking:*'],
        },
        {
          role: 'HR_ADMIN',
          userType: 'BUSINESS',
          description: 'HR & People administrator',
          permissions: ['people:*', 'leave:*', 'onboarding:*'],
        },
        {
          role: 'MANAGER',
          userType: 'BUSINESS',
          description: 'Team manager with approval authority',
          permissions: ['approvals:decide', 'me:*'],
        },
        {
          role: 'EMPLOYEE',
          userType: 'BUSINESS',
          description: 'Standard employee self-service access',
          permissions: ['me:*', 'spend:submit', 'leave:submit'],
        },
      ],
    };
  }

  async listSessions(limit = 50) {
    const safeLimit = parsePositiveInt(limit, 50, 200);
    const sessions = await this.prisma.session.findMany({
      take: safeLimit,
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            userType: true,
            role: true,
          },
        },
      },
    });

    return {
      total: sessions.length,
      sessions: sessions.map((s) => ({
        id: s.id,
        userId: s.userId,
        user: s.user,
        ipAddress: s.ipAddress,
        userAgent: s.userAgent,
        activeOrganizationId: s.activeOrganizationId,
        active: !s.revokedAt && s.expiresAt > new Date(),
        revokedAt: s.revokedAt,
        expiresAt: s.expiresAt,
        createdAt: s.createdAt,
      })),
    };
  }

  async revokeSession(id: string) {
    const session = await this.prisma.session.findUnique({ where: { id } });
    if (!session) {
      throw new NotFoundException(`Session "${id}" was not found`);
    }
    await this.prisma.session.update({
      where: { id },
      data: { revokedAt: new Date() },
    });
    return { message: 'Session revoked successfully', sessionId: id };
  }

  async listAuditLogs(filters: {
    organizationId?: string;
    action?: string;
    targetType?: string;
    actorUserId?: string;
    search?: string;
    limit?: number;
  }) {
    const where: Record<string, any> = {};
    if (filters.organizationId) where.organizationId = filters.organizationId;
    if (filters.action)
      where.action = { contains: filters.action, mode: 'insensitive' };
    if (filters.targetType) where.targetType = filters.targetType;
    if (filters.actorUserId) where.actorUserId = filters.actorUserId;
    if (filters.search) {
      where.OR = [
        { description: { contains: filters.search, mode: 'insensitive' } },
        { action: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    const limit = parsePositiveInt(filters.limit, 50, 200);
    const [total, events] = await Promise.all([
      this.prisma.auditEvent.count({ where }),
      this.prisma.auditEvent.findMany({
        where,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          organization: { select: { id: true, name: true, slug: true } },
        },
      }),
    ]);

    return {
      total,
      events,
    };
  }

  async getAuditLogById(id: string) {
    const event = await this.prisma.auditEvent.findUnique({
      where: { id },
      include: {
        organization: { select: { id: true, name: true, slug: true } },
      },
    });

    if (!event) {
      throw new NotFoundException(`Audit event "${id}" was not found`);
    }

    return { event };
  }

  async listSupportTickets(filters: {
    organizationId?: string;
    status?: string;
  }) {
    const events = await this.prisma.auditEvent.findMany({
      where: {
        targetType: 'support_ticket',
        ...(filters.organizationId
          ? { organizationId: filters.organizationId }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
      include: {
        organization: { select: { id: true, name: true, slug: true } },
      },
    });

    const tickets = events.map((ev) => {
      const meta = (ev.changes as Record<string, any>) ?? {};
      return {
        id: ev.id,
        organizationId: ev.organizationId,
        organizationName: ev.organization?.name ?? null,
        subject: meta.subject ?? ev.description,
        description: meta.description ?? ev.description,
        status: meta.status ?? 'OPEN',
        priority: meta.priority ?? 'MEDIUM',
        resolutionNote: meta.resolutionNote ?? null,
        createdByUserId: ev.actorUserId,
        createdAt: ev.createdAt,
      };
    });

    const filtered = filters.status
      ? tickets.filter(
          (t) => t.status.toLowerCase() === filters.status!.toLowerCase(),
        )
      : tickets;

    return {
      total: filtered.length,
      tickets: filtered,
    };
  }

  async getSupportTicketById(id: string) {
    const ev = await this.prisma.auditEvent.findUnique({
      where: { id },
      include: {
        organization: { select: { id: true, name: true, slug: true } },
      },
    });
    if (!ev || ev.targetType !== 'support_ticket') {
      throw new NotFoundException(`Support ticket "${id}" was not found`);
    }
    const meta = (ev.changes as Record<string, any>) ?? {};
    return {
      ticket: {
        id: ev.id,
        organizationId: ev.organizationId,
        organizationName: ev.organization?.name ?? null,
        subject: meta.subject ?? ev.description,
        description: meta.description ?? ev.description,
        status: meta.status ?? 'OPEN',
        priority: meta.priority ?? 'MEDIUM',
        resolutionNote: meta.resolutionNote ?? null,
        createdByUserId: ev.actorUserId,
        createdAt: ev.createdAt,
      },
    };
  }

  async createSupportTicket(
    actor: AuthenticatedUser,
    dto: CreateSupportTicketDto,
  ) {
    const org = await this.prisma.organization.findUnique({
      where: { id: dto.organizationId },
    });
    if (!org) {
      throw new NotFoundException(
        `Business "${dto.organizationId}" was not found`,
      );
    }

    const ev = await this.prisma.auditEvent.create({
      data: {
        organizationId: dto.organizationId,
        actorUserId: actor.id,
        action: 'support_ticket.created',
        targetType: 'support_ticket',
        targetId: randomUUID(),
        description: dto.subject,
        changes: {
          subject: dto.subject,
          description: dto.description,
          priority: dto.priority ?? 'MEDIUM',
          status: 'OPEN',
        },
      },
    });

    return this.getSupportTicketById(ev.id);
  }

  async updateSupportTicket(id: string, dto: UpdateSupportTicketDto) {
    const existing = await this.prisma.auditEvent.findUnique({ where: { id } });
    if (!existing || existing.targetType !== 'support_ticket') {
      throw new NotFoundException(`Support ticket "${id}" was not found`);
    }

    const currentMeta = (existing.changes as Record<string, any>) ?? {};
    const nextMeta = {
      ...currentMeta,
      ...(dto.status ? { status: dto.status } : {}),
      ...(dto.priority ? { priority: dto.priority } : {}),
      ...(dto.resolutionNote !== undefined
        ? { resolutionNote: dto.resolutionNote }
        : {}),
    };

    await this.prisma.auditEvent.update({
      where: { id },
      data: { changes: nextMeta },
    });

    return this.getSupportTicketById(id);
  }

  async listNotifications() {
    const events = await this.prisma.auditEvent.findMany({
      where: {
        OR: [
          { targetType: 'platform_announcement' },
          { action: { startsWith: 'business.' } },
          { action: { startsWith: 'kyb.' } },
        ],
      },
      take: 50,
      orderBy: { createdAt: 'desc' },
      include: {
        organization: { select: { id: true, name: true, slug: true } },
      },
    });

    return {
      total: events.length,
      notifications: events.map((ev) => ({
        id: ev.id,
        type:
          ev.targetType === 'platform_announcement' ? 'ANNOUNCEMENT' : 'SYSTEM',
        title:
          (ev.changes as Record<string, any>)?.title ??
          ev.action.replace('.', ' ').toUpperCase(),
        message: ev.description,
        severity: (ev.changes as Record<string, any>)?.severity ?? 'INFO',
        organizationId: ev.organizationId,
        organizationName: ev.organization?.name ?? null,
        createdAt: ev.createdAt,
      })),
    };
  }

  async createAnnouncement(
    actor: AuthenticatedUser,
    dto: CreateAnnouncementDto,
  ) {
    let targetOrgId = dto.targetOrganizationId;
    if (!targetOrgId) {
      const firstOrg = await this.prisma.organization.findFirst({
        select: { id: true },
      });
      if (!firstOrg) {
        return {
          message: 'Announcement broadcast recorded',
          announcement: {
            id: randomUUID(),
            title: dto.title,
            message: dto.message,
            severity: dto.severity ?? 'INFO',
            createdAt: new Date(),
          },
        };
      }
      targetOrgId = firstOrg.id;
    }

    const ev = await this.prisma.auditEvent.create({
      data: {
        organizationId: targetOrgId,
        actorUserId: actor.id,
        action: 'announcement.broadcast',
        targetType: 'platform_announcement',
        targetId: randomUUID(),
        description: dto.message,
        changes: {
          title: dto.title,
          message: dto.message,
          severity: dto.severity ?? 'INFO',
        },
      },
    });

    return {
      message: 'Announcement broadcast successfully',
      announcement: {
        id: ev.id,
        title: dto.title,
        message: dto.message,
        severity: dto.severity ?? 'INFO',
        createdAt: ev.createdAt,
      },
    };
  }

  async listDocuments(filters: {
    organizationId?: string;
    category?: string;
    scope?: string;
    search?: string;
    limit?: number;
  }) {
    const where: Record<string, any> = {};
    if (filters.organizationId) where.organizationId = filters.organizationId;
    if (filters.category) where.category = filters.category;
    if (filters.scope) where.scope = filters.scope.toUpperCase();
    if (filters.search) {
      where.OR = [
        { name: { contains: filters.search, mode: 'insensitive' } },
        { fileName: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    const limit = parsePositiveInt(filters.limit, 50, 200);
    const [total, documents] = await Promise.all([
      this.prisma.document.count({ where }),
      this.prisma.document.findMany({
        where,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          organization: { select: { id: true, name: true, slug: true } },
          employee: { select: { id: true, fullName: true, email: true } },
        },
      }),
    ]);

    return {
      total,
      documents: documents.map((doc) => ({
        ...doc,
        downloadUrl: `/v1/api/people/documents/${doc.id}/download`,
      })),
    };
  }

  async getSystemHealth() {
    const mem = process.memoryUsage();
    let dbStatus: 'up' | 'down' = 'up';
    let dbLatencyMs = 0;

    const dbStart = Date.now();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      dbLatencyMs = Date.now() - dbStart;
    } catch {
      dbStatus = 'down';
    }

    const [
      pendingOutbox,
      processingOutbox,
      failedOutbox,
      dlqCount,
      recentDlqEvents,
      idempotencyTotal,
    ] = await Promise.all([
      this.prisma.outboxEvent
        .count({ where: { status: 'PENDING' } })
        .catch(() => 0),
      this.prisma.outboxEvent
        .count({ where: { status: 'PROCESSING' } })
        .catch(() => 0),
      this.prisma.outboxEvent
        .count({ where: { status: 'FAILED' } })
        .catch(() => 0),
      this.outboxService
        ? this.outboxService.getDlqCount().catch(() => 0)
        : Promise.resolve(0),
      this.outboxService
        ? this.outboxService.getDeadLetterEvents(undefined, 20).catch(() => [])
        : Promise.resolve([]),
      this.prisma.idempotencyKey.count().catch(() => 0),
    ]);

    const circuitBreakers = this.resilientClient
      ? this.resilientClient.getAllCircuitStats()
      : [];

    return {
      status: dbStatus === 'up' && dlqCount === 0 ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      database: {
        status: dbStatus,
        responseTimeMs: dbLatencyMs,
      },
      memory: {
        heapUsedMb: Math.round((mem.heapUsed / 1024 / 1024) * 100) / 100,
        heapTotalMb: Math.round((mem.heapTotal / 1024 / 1024) * 100) / 100,
        rssMb: Math.round((mem.rss / 1024 / 1024) * 100) / 100,
      },
      backgroundJobs: {
        outboxPending: pendingOutbox,
        outboxProcessing: processingOutbox,
        outboxFailed: failedOutbox,
        dlqDepth: dlqCount,
        idempotencyKeysCount: idempotencyTotal,
      },
      circuitBreakers,
      recentFailures: recentDlqEvents,
    };
  }
}
