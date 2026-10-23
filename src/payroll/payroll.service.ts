import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../database/prisma.service';
import { ApprovalsService } from '../approvals/approvals.service';
import { ComplianceService } from '../compliance/compliance.service';
import { BankingService } from '../banking/banking.service';
import type {
  BankItem,
  BulkTransferItem,
} from '../banking/anchor/anchor.types';
import type { AuthenticatedUser } from '../auth/auth.types';
import { SetCompensationDto } from './dto/set-compensation.dto';
import { CreatePayrollRunDto } from './dto/create-payroll-run.dto';
import { FundingCheckDto } from './dto/funding-check.dto';

@Injectable()
export class PayrollService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly approvalsService: ApprovalsService,
    private readonly complianceService: ComplianceService,
    @Optional() private readonly bankingService?: BankingService,
  ) {}

  private checkOrgContext(user: AuthenticatedUser): string {
    if (!user.organizationId) {
      throw new BadRequestException(
        'An active organization context is required',
      );
    }
    return user.organizationId;
  }

  async setCompensation(user: AuthenticatedUser, dto: SetCompensationDto) {
    const orgId = this.checkOrgContext(user);

    const employee = await this.prisma.employee.findFirst({
      where: { id: dto.employeeId, organizationId: orgId },
    });

    if (!employee) {
      throw new NotFoundException(
        `Employee with ID ${dto.employeeId} not found in this organization`,
      );
    }

    const effectiveFromDate = dto.effectiveFrom
      ? new Date(dto.effectiveFrom)
      : new Date();

    const currentActive = await this.prisma.compensationRecord.findFirst({
      where: {
        employeeId: dto.employeeId,
        organizationId: orgId,
        effectiveTo: null,
      },
    });

    if (currentActive) {
      await this.prisma.compensationRecord.update({
        where: { id: currentActive.id },
        data: { effectiveTo: effectiveFromDate },
      });
    }

    const newRecord = await this.prisma.compensationRecord.create({
      data: {
        id: randomUUID(),
        organizationId: orgId,
        employeeId: dto.employeeId,
        effectiveFrom: effectiveFromDate,
        effectiveTo: null,
        basicSalary: dto.basicSalary,
        housingAllowance: dto.housingAllowance ?? 0,
        transportAllowance: dto.transportAllowance ?? 0,
        otherAllowances: dto.otherAllowances ?? 0,
        currency: dto.currency ?? 'NGN',
        paymentFrequency: dto.paymentFrequency ?? 'MONTHLY',
      },
    });

    return {
      message: 'Compensation record set successfully',
      compensationRecord: newRecord,
    };
  }

  async getCompensationHistory(user: AuthenticatedUser, employeeId: string) {
    const orgId = this.checkOrgContext(user);

    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, organizationId: orgId },
    });

    if (!employee) {
      throw new NotFoundException(
        `Employee with ID ${employeeId} not found in this organization`,
      );
    }

    const history = await this.prisma.compensationRecord.findMany({
      where: {
        employeeId,
        organizationId: orgId,
      },
      orderBy: { effectiveFrom: 'desc' },
    });

    return { history };
  }

  private formatPayrollRun<
    T extends { periodYear: number; periodMonth: number },
  >(run: T, payDay?: number): T & { payDate: string };
  private formatPayrollRun<
    T extends { periodYear: number; periodMonth: number },
  >(run: T | null, payDay?: number): (T & { payDate: string }) | null;
  private formatPayrollRun<
    T extends { periodYear: number; periodMonth: number },
  >(run: T | null, payDay = 25) {
    if (!run) return null;
    const day = Math.min(Math.max(1, payDay), 28);
    const payDate = new Date(Date.UTC(run.periodYear, run.periodMonth - 1, day))
      .toISOString()
      .split('T')[0];
    return {
      ...run,
      payDate,
      currency: 'NGN',
      payrollEngineVersion: '2026.1',
      taxRuleSetId: 'TRS-NTA-2026',
    };
  }

  async createRun(user: AuthenticatedUser, dto: CreatePayrollRunDto) {
    const orgId = this.checkOrgContext(user);

    const existing = await this.prisma.payrollRun.findFirst({
      where: {
        organizationId: orgId,
        periodMonth: dto.periodMonth,
        periodYear: dto.periodYear,
      },
    });

    if (existing) {
      throw new ConflictException(
        `A payroll run already exists for period ${dto.periodMonth}/${dto.periodYear}`,
      );
    }

    const title =
      dto.title ??
      `Payroll Run ${new Date(dto.periodYear, dto.periodMonth - 1).toLocaleString('default', { month: 'long' })} ${dto.periodYear}`;

    const [run, org] = await Promise.all([
      this.prisma.payrollRun.create({
        data: {
          id: randomUUID(),
          organizationId: orgId,
          periodMonth: dto.periodMonth,
          periodYear: dto.periodYear,
          title,
          status: 'DRAFT',
        },
      }),
      this.prisma.organization.findUnique({
        where: { id: orgId },
        select: { payDate: true },
      }),
    ]);

    const payDay = org?.payDate ?? 25;

    if (this.prisma.auditEvent) {
      await this.prisma.auditEvent
        .create({
          data: {
            organizationId: orgId,
            actorUserId: user.id,
            action: 'payroll_run.created',
            targetType: 'payroll_run',
            targetId: run.id,
            description: `Created payroll run "${title}" in DRAFT state`,
            changes: {
              periodMonth: dto.periodMonth,
              periodYear: dto.periodYear,
              title,
            },
          },
        })
        .catch(() => undefined);
    }

    return {
      message: 'Payroll run created in DRAFT state',
      payrollRun: {
        ...this.formatPayrollRun(run, payDay),
        createdBy: user.name || user.email || 'Admin',
      },
    };
  }

  async calculateRun(user: AuthenticatedUser, runId: string) {
    const orgId = this.checkOrgContext(user);

    const run = await this.prisma.payrollRun.findFirst({
      where: { id: runId, organizationId: orgId },
    });

    if (!run) {
      throw new NotFoundException(`Payroll run ${runId} not found`);
    }

    if (run.status !== 'DRAFT' && run.status !== 'CALCULATED') {
      throw new BadRequestException(
        `Cannot recalculate payroll run in state ${run.status}. Edits are locked once submitted.`,
      );
    }

    // Delete existing calculated line items for recalculation
    await this.prisma.payrollItem.deleteMany({
      where: { payrollRunId: runId },
    });

    // Fetch organization overrides & active employees
    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
    });

    const periodDate = new Date(run.periodYear, run.periodMonth - 1, 1);

    const employees = await this.prisma.employee.findMany({
      where: { organizationId: orgId, status: 'ACTIVE' },
      include: {
        compensationRecords: {
          where: { effectiveTo: null },
          take: 1,
        },
      },
    });

    let totalGross = 0;
    let totalTax = 0;
    let totalPension = 0;
    let totalNet = 0;

    const itemsData: any[] = [];
    for (const emp of employees) {
      const comp = emp.compensationRecords[0];
      const basicSalary = comp ? comp.basicSalary : emp.salaryAmount;
      const housingAllowance = comp ? comp.housingAllowance : 0;
      const transportAllowance = comp ? comp.transportAllowance : 0;
      const otherAllowances = comp ? comp.otherAllowances : 0;

      const deductions =
        await this.complianceService.calculatePayrollDeductions({
          basicSalary,
          housingAllowance,
          transportAllowance,
          otherAllowances,
          declaredRent: (emp as any).declaredRent || 0,
          nhfOptIn: (emp as any).nhfOptIn || false,
          pensionEmployeeRateOverride:
            org?.pensionEmployeeRateOverride ?? undefined,
          pensionEmployerRateOverride:
            org?.pensionEmployerRateOverride ?? undefined,
          pensionBasisOverride: org?.pensionBasisOverride ?? undefined,
          periodDate,
        });

      const grossSalary = deductions.grossSalaryMonthly;
      const taxDeduction = deductions.taxDeductionMonthly;
      const pensionDeduction = deductions.pensionDeductionMonthly;
      const employerPensionDeduction =
        deductions.employerPensionDeductionMonthly;
      const nhfDeduction = deductions.nhfDeductionMonthly;
      const rentReliefApplied = deductions.rentReliefAppliedMonthly;

      const otherDeductions = nhfDeduction;
      const netSalary =
        grossSalary - (pensionDeduction + taxDeduction + otherDeductions);

      totalGross += grossSalary;
      totalPension += pensionDeduction;
      totalTax += taxDeduction;
      totalNet += netSalary;

      itemsData.push({
        id: randomUUID(),
        organizationId: orgId,
        payrollRunId: runId,
        employeeId: emp.id,
        basicSalary,
        housingAllowance,
        transportAllowance,
        otherAllowances,
        grossSalary,
        taxDeduction,
        pensionDeduction,
        employerPensionDeduction,
        nhfDeduction,
        rentReliefApplied,
        otherDeductions,
        netSalary,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

    await this.prisma.payrollItem.createMany({
      data: itemsData,
    });

    const updatedRun = await this.prisma.payrollRun.update({
      where: { id: runId },
      data: {
        status: 'CALCULATED',
        totalGross,
        totalTax,
        totalPension,
        totalNet,
      },
      include: { items: true },
    });

    if (this.prisma.auditEvent) {
      await this.prisma.auditEvent
        .create({
          data: {
            organizationId: orgId,
            actorUserId: user.id,
            action: 'payroll_run.calculated',
            targetType: 'payroll_run',
            targetId: run.id,
            description: `Calculated payroll run "${run.title}" for ${itemsData.length} employees`,
            changes: {
              status: 'CALCULATED',
              totalGross,
              totalTax,
              totalPension,
              totalNet,
              employeeCount: itemsData.length,
            },
          },
        })
        .catch(() => undefined);
    }

    return {
      message: `Payroll run calculated successfully for ${itemsData.length} employees`,
      payrollRun: updatedRun,
    };
  }

  async submitRunForApproval(user: AuthenticatedUser, runId: string) {
    const orgId = this.checkOrgContext(user);

    const run = await this.prisma.payrollRun.findFirst({
      where: { id: runId, organizationId: orgId },
    });

    if (!run) {
      throw new NotFoundException(`Payroll run ${runId} not found`);
    }

    if (run.status !== 'CALCULATED') {
      throw new BadRequestException(
        `Payroll run must be in CALCULATED state before submitting for approval. Current state: ${run.status}`,
      );
    }

    // Submit to generic Approvals Engine (ADR-003)
    const approvalResult = await this.approvalsService.submitRequest(user, {
      type: 'PAYROLL',
      subjectTable: 'payroll_run',
      subjectId: run.id,
      amountSnapshot: run.totalNet,
    });

    const updatedRun = await this.prisma.payrollRun.update({
      where: { id: runId },
      data: { status: 'PENDING_APPROVAL' },
    });

    if (this.prisma.auditEvent) {
      await this.prisma.auditEvent
        .create({
          data: {
            organizationId: orgId,
            actorUserId: user.id,
            action: 'payroll_run.submitted',
            targetType: 'payroll_run',
            targetId: run.id,
            description: `Submitted payroll run "${run.title}" for approval`,
            changes: {
              status: 'PENDING_APPROVAL',
              approvalRequestId: approvalResult.approvalRequest.id,
              amountSnapshot: run.totalNet,
            },
          },
        })
        .catch(() => undefined);
    }

    return {
      message: 'Payroll run submitted for approval and locked from edits',
      payrollRun: updatedRun,
      approvalRequest: approvalResult.approvalRequest,
    };
  }

  async fundingCheck(
    user: AuthenticatedUser,
    runId: string,
    dto: FundingCheckDto,
  ) {
    const orgId = this.checkOrgContext(user);

    const run = await this.prisma.payrollRun.findFirst({
      where: { id: runId, organizationId: orgId },
    });

    if (!run) {
      throw new NotFoundException(`Payroll run ${runId} not found`);
    }

    if (run.status !== 'APPROVED' && run.status !== 'FUNDING_SHORTFALL') {
      throw new BadRequestException(
        `Funding check can only be attested when run is APPROVED or in FUNDING_SHORTFALL. Current state: ${run.status}`,
      );
    }

    const depositAccount = await this.prisma.organizationDepositAccount
      ?.findUnique({
        where: { organizationId: orgId },
      })
      .catch(() => null);

    const requiredKobo = BigInt(Math.round((run.totalNet || 0) * 100));
    const availableKobo = depositAccount
      ? depositAccount.balanceKobo
      : BigInt(0);
    const isSufficient = depositAccount ? availableKobo >= requiredKobo : false;

    const nextStatus = dto.confirmed
      ? 'FUNDING_CHECK_PASSED'
      : 'FUNDING_SHORTFALL';

    const updatedRun = await this.prisma.payrollRun.update({
      where: { id: runId },
      data: { status: nextStatus },
    });

    if (this.prisma.auditEvent) {
      await this.prisma.auditEvent
        .create({
          data: {
            organizationId: orgId,
            actorUserId: user.id,
            action: 'payroll_run.funding_checked',
            targetType: 'payroll_run',
            targetId: run.id,
            description: dto.confirmed
              ? `Funding check passed for payroll run "${run.title}"`
              : `Funding shortfall recorded for payroll run "${run.title}"`,
            changes: {
              status: nextStatus,
              confirmed: dto.confirmed,
              notes: dto.notes ?? null,
              fundingDetails: depositAccount
                ? {
                    accountNumber: depositAccount.accountNumber,
                    availableBalanceKobo: Number(availableKobo),
                    requiredKobo: Number(requiredKobo),
                    isSufficient,
                  }
                : null,
            },
          },
        })
        .catch(() => undefined);
    }

    return {
      message: dto.confirmed
        ? 'Funding check passed successfully. Ready for payment execution.'
        : 'Funding shortfall recorded. Payment execution blocked until resolved.',
      payrollRun: updatedRun,
      fundingDetails: depositAccount
        ? {
            accountNumber: depositAccount.accountNumber,
            bankName: depositAccount.bankName,
            availableBalanceKobo: Number(availableKobo),
            requiredKobo: Number(requiredKobo),
            isSufficient,
            shortfallKobo: isSufficient
              ? 0
              : Number(requiredKobo - availableKobo),
          }
        : null,
    };
  }

  async executePayment(user: AuthenticatedUser, runId: string) {
    const orgId = this.checkOrgContext(user);

    const run = await this.prisma.payrollRun.findFirst({
      where: { id: runId, organizationId: orgId },
      include: {
        items: {
          include: {
            employee: {
              select: {
                id: true,
                fullName: true,
                email: true,
                bankName: true,
                accountNumber: true,
                accountName: true,
              },
            },
          },
        },
      },
    });

    if (!run) {
      throw new NotFoundException(`Payroll run ${runId} not found`);
    }

    if (run.status !== 'FUNDING_CHECK_PASSED') {
      throw new BadRequestException(
        `Payment execution requires status FUNDING_CHECK_PASSED. Current state: ${run.status}`,
      );
    }

    let bulkTransfer: any = null;
    if (this.bankingService) {
      const supportedBanks: BankItem[] = await this.bankingService
        .getBanks()
        .catch(() => [] as BankItem[]);
      const transfers: BulkTransferItem[] = run.items.map((item: any) => {
        const emp = item.employee;
        const matchedBank = supportedBanks.find(
          (b) =>
            b.name.toLowerCase() === emp?.bankName?.toLowerCase() ||
            b.nipCode === emp?.bankName,
        );
        const bankCode = matchedBank?.nipCode ?? '000014';
        const accountNumber = emp?.accountNumber ?? '0123456789';
        const accountName = emp?.accountName ?? emp?.fullName ?? 'Employee';

        return {
          amountKobo: Math.round((item.netSalary || 0) * 100),
          currency: 'NGN',
          reference: `pyr_${run.id}_${item.employeeId}_1`,
          destination: {
            accountNumber,
            bankCode,
            accountName,
          },
          narration: `${run.title} Salary`,
        };
      });

      bulkTransfer = await this.bankingService
        .executePayrollTransfers(orgId, run.id, transfers)
        .catch(() => null);
    }

    const executedAt = new Date();
    const updatedRun = await this.prisma.payrollRun.update({
      where: { id: runId },
      data: {
        status: 'EXECUTED',
        executedAt,
      },
    });

    // Generate bank transfer payout file export payload (ADR-004)
    const paymentExportBatch = {
      runId: run.id,
      organizationId: orgId,
      executedAt,
      totalPayoutNet: run.totalNet,
      employeeTransfers: run.items.map((item: any) => ({
        employeeId: item.employeeId,
        employeeName: item.employee?.fullName,
        amount: item.netSalary,
        currency: 'NGN',
      })),
    };

    if (this.prisma.auditEvent) {
      await this.prisma.auditEvent
        .create({
          data: {
            organizationId: orgId,
            actorUserId: user.id,
            action: 'payroll_run.executed',
            targetType: 'payroll_run',
            targetId: run.id,
            description: `Payment execution recorded for payroll run "${run.title}"`,
            changes: {
              status: 'EXECUTED',
              executedAt: executedAt.toISOString(),
              totalPayoutNet: run.totalNet,
              employeeCount: run.items.length,
              bulkTransferId: bulkTransfer?.id ?? null,
            },
          },
        })
        .catch(() => undefined);
    }

    return {
      message: bulkTransfer
        ? 'Payment execution recorded and automated bulk transfer initiated via Anchor BaaS'
        : 'Payment execution recorded and bank transfer file exported',
      payrollRun: updatedRun,
      bulkTransfer,
      paymentExportBatch,
    };
  }

  async reconcileRun(user: AuthenticatedUser, runId: string) {
    const orgId = this.checkOrgContext(user);

    const run = await this.prisma.payrollRun.findFirst({
      where: { id: runId, organizationId: orgId },
    });

    if (!run) {
      throw new NotFoundException(`Payroll run ${runId} not found`);
    }

    if (run.status !== 'EXECUTED') {
      throw new BadRequestException(
        `Payroll run must be in EXECUTED state before reconciling. Current state: ${run.status}`,
      );
    }

    const reconciledAt = new Date();
    const updatedRun = await this.prisma.payrollRun.update({
      where: { id: runId },
      data: {
        status: 'RECONCILED',
        reconciledAt,
      },
    });

    if (this.prisma.auditEvent) {
      await this.prisma.auditEvent
        .create({
          data: {
            organizationId: orgId,
            actorUserId: user.id,
            action: 'payroll_run.reconciled',
            targetType: 'payroll_run',
            targetId: run.id,
            description: `Payroll run "${run.title}" successfully reconciled`,
            changes: {
              status: 'RECONCILED',
              reconciledAt: reconciledAt.toISOString(),
            },
          },
        })
        .catch(() => undefined);
    }

    return {
      message: 'Payroll run successfully reconciled',
      payrollRun: updatedRun,
    };
  }

  async getRuns(user: AuthenticatedUser) {
    const orgId = this.checkOrgContext(user);

    const [runs, org] = await Promise.all([
      this.prisma.payrollRun.findMany({
        where: { organizationId: orgId },
        include: {
          items: {
            select: {
              id: true,
              grossSalary: true,
              taxDeduction: true,
              pensionDeduction: true,
              employerPensionDeduction: true,
              nhfDeduction: true,
              otherDeductions: true,
              netSalary: true,
            },
          },
        },
        orderBy: [{ periodYear: 'desc' }, { periodMonth: 'desc' }],
      }),
      this.prisma.organization.findUnique({
        where: { id: orgId },
        select: { payDate: true },
      }),
    ]);

    const payDay = org?.payDate ?? 25;

    const runIds = runs.map((r) => r.id);
    const creationEvents =
      runIds.length > 0 && this.prisma.auditEvent
        ? await this.prisma.auditEvent.findMany({
            where: {
              organizationId: orgId,
              targetType: 'payroll_run',
              targetId: { in: runIds },
              action: 'payroll_run.created',
            },
          })
        : [];
    const actorUserIds = [...new Set(creationEvents.map((e) => e.actorUserId))];
    const users =
      actorUserIds.length > 0
        ? await this.prisma.user.findMany({
            where: { id: { in: actorUserIds } },
            select: { id: true, name: true, email: true },
          })
        : [];
    const userMap = new Map(users.map((u) => [u.id, u.name || u.email]));
    const creatorByRunId = new Map(
      creationEvents.map((e) => [
        e.targetId,
        userMap.get(e.actorUserId) || e.actorUserId,
      ]),
    );

    return {
      payrollRuns: runs.map((r) => {
        const items = (r as any).items ?? [];
        const employeeCount = items.length;
        const totalNhf = items.reduce(
          (sum: number, it: any) => sum + (it.nhfDeduction || 0),
          0,
        );
        const totalEmployerPension = items.reduce(
          (sum: number, it: any) => sum + (it.employerPensionDeduction || 0),
          0,
        );
        const totalOtherDeductions = items.reduce(
          (sum: number, it: any) => sum + (it.otherDeductions || 0),
          0,
        );

        return {
          ...this.formatPayrollRun(r, payDay),
          employeeCount,
          totalNhf,
          totalEmployerPension,
          totalOtherDeductions,
          createdBy:
            creatorByRunId.get(r.id) ?? user.name ?? user.email ?? 'Admin',
        };
      }),
    };
  }

  async getRunById(user: AuthenticatedUser, runId: string) {
    const orgId = this.checkOrgContext(user);

    const [run, org, approval, auditEvents] = await Promise.all([
      this.prisma.payrollRun.findFirst({
        where: { id: runId, organizationId: orgId },
        include: {
          items: {
            include: {
              employee: {
                select: {
                  id: true,
                  fullName: true,
                  email: true,
                  department: true,
                  jobTitle: true,
                },
              },
            },
          },
          payslips: true,
        },
      }),
      this.prisma.organization.findUnique({
        where: { id: orgId },
        select: { payDate: true },
      }),
      this.prisma.approvalRequest
        ? this.prisma.approvalRequest.findFirst({
            where: {
              organizationId: orgId,
              subjectTable: 'payroll_run',
              subjectId: runId,
            },
            orderBy: { submittedAt: 'desc' },
            select: { rejectionReason: true },
          })
        : Promise.resolve(null),
      this.prisma.auditEvent
        ? this.prisma.auditEvent.findMany({
            where: {
              organizationId: orgId,
              targetType: 'payroll_run',
              targetId: runId,
            },
            orderBy: { createdAt: 'desc' },
          })
        : Promise.resolve([] as any[]),
    ]);

    if (!run) {
      throw new NotFoundException(`Payroll run ${runId} not found`);
    }

    const actorIds = [...new Set(auditEvents.map((e) => e.actorUserId))];
    const actorUsers =
      actorIds.length > 0
        ? await this.prisma.user.findMany({
            where: { id: { in: actorIds } },
            select: { id: true, name: true, email: true },
          })
        : [];
    const actorMap = new Map<string, any>(actorUsers.map((u) => [u.id, u]));

    const auditTrail = auditEvents.map((e) => ({
      id: e.id,
      action: e.action,
      description: e.description,
      createdAt: e.createdAt,
      actor: actorMap.get(e.actorUserId as string) ?? {
        id: e.actorUserId,
        name: 'User',
        email: '',
      },
    }));

    const creationEvent = auditEvents.find(
      (e) => e.action === 'payroll_run.created',
    );
    const creatorUser = creationEvent
      ? actorMap.get(String(creationEvent.actorUserId))
      : null;
    const createdBy =
      creatorUser?.name ||
      creatorUser?.email ||
      user.name ||
      user.email ||
      'Admin';

    let complianceWarnings: any[] = [];
    if (run.status === 'DRAFT' || run.status === 'CALCULATED') {
      try {
        const alertData = await this.complianceService.getAlerts(user);
        complianceWarnings = alertData.alerts.filter(
          (a: any) => a.type !== 'UPCOMING_STATUTORY_DEADLINE',
        );
      } catch {
        complianceWarnings = [];
      }
    }

    const payDay = org?.payDate ?? 25;
    const formatted = this.formatPayrollRun(run, payDay);

    return {
      payrollRun: {
        ...formatted,
        createdBy,
        rejectionReason: approval?.rejectionReason ?? null,
        complianceWarnings,
        auditTrail,
      },
    };
  }

  async getRunAuditEvents(user: AuthenticatedUser, runId: string) {
    const orgId = this.checkOrgContext(user);

    const run = await this.prisma.payrollRun.findFirst({
      where: { id: runId, organizationId: orgId },
      select: { id: true, title: true },
    });

    if (!run) {
      throw new NotFoundException(`Payroll run ${runId} not found`);
    }

    const auditEvents = this.prisma.auditEvent
      ? await this.prisma.auditEvent.findMany({
          where: {
            organizationId: orgId,
            targetType: 'payroll_run',
            targetId: runId,
          },
          orderBy: { createdAt: 'desc' },
        })
      : [];

    const actorIds = [...new Set(auditEvents.map((e) => e.actorUserId))];
    const actorUsers =
      actorIds.length > 0
        ? await this.prisma.user.findMany({
            where: { id: { in: actorIds } },
            select: { id: true, name: true, email: true },
          })
        : [];
    const actorMap = new Map<string, any>(actorUsers.map((u) => [u.id, u]));

    const events = auditEvents.map((e) => ({
      id: e.id,
      action: e.action,
      description: e.description,
      createdAt: e.createdAt,
      actor: actorMap.get(e.actorUserId) ?? {
        id: e.actorUserId,
        name: 'User',
        email: '',
      },
    }));

    return { auditEvents: events };
  }

  async getAllCompensations(user: AuthenticatedUser) {
    const orgId = this.checkOrgContext(user);

    const [employees, records] = await Promise.all([
      this.prisma.employee.findMany({
        where: { organizationId: orgId },
        select: {
          id: true,
          fullName: true,
          email: true,
          jobTitle: true,
          department: true,
          status: true,
          annualSalaryMinor: true,
          currency: true,
          payFrequency: true,
          startDate: true,
        },
        orderBy: [{ fullName: 'asc' }],
      }),
      this.prisma.compensationRecord.findMany({
        where: {
          organizationId: orgId,
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: new Date() } }],
        },
        orderBy: { effectiveFrom: 'desc' },
      }),
    ]);

    const compRecordByEmp = new Map<string, (typeof records)[number]>();
    for (const rec of records) {
      if (!compRecordByEmp.has(rec.employeeId)) {
        compRecordByEmp.set(rec.employeeId, rec);
      }
    }

    const compensations = employees.map((emp) => {
      const rec = compRecordByEmp.get(emp.id);
      const basicSalary = rec
        ? rec.basicSalary
        : Math.trunc(Number(emp.annualSalaryMinor) / 1200);
      const housingAllowance = rec?.housingAllowance ?? 0;
      const transportAllowance = rec?.transportAllowance ?? 0;
      const otherAllowances = rec?.otherAllowances ?? 0;
      const grossMonthlySalary =
        basicSalary + housingAllowance + transportAllowance + otherAllowances;

      return {
        employeeId: emp.id,
        fullName: emp.fullName,
        email: emp.email,
        jobTitle: emp.jobTitle,
        department: emp.department,
        status: emp.status,
        annualSalaryMinor: Number(emp.annualSalaryMinor),
        currency: emp.currency ?? 'NGN',
        paymentFrequency:
          rec?.paymentFrequency ?? emp.payFrequency ?? 'MONTHLY',
        basicSalary,
        housingAllowance,
        transportAllowance,
        otherAllowances,
        grossMonthlySalary,
        effectiveFrom: rec?.effectiveFrom ?? emp.startDate ?? null,
      };
    });

    return { compensations };
  }

  async getPayslips(
    user: AuthenticatedUser,
    filter?: { payrollRunId?: string; employeeId?: string },
  ) {
    const orgId = this.checkOrgContext(user);

    const where: Record<string, any> = { organizationId: orgId };
    if (filter?.payrollRunId) where.payrollRunId = filter.payrollRunId;
    if (filter?.employeeId) where.employeeId = filter.employeeId;

    const payslips = await this.prisma.payslip.findMany({
      where,
      include: {
        employee: {
          select: {
            id: true,
            fullName: true,
            email: true,
            department: true,
            jobTitle: true,
          },
        },
        payrollRun: {
          select: {
            id: true,
            periodMonth: true,
            periodYear: true,
            title: true,
            status: true,
          },
        },
      },
      orderBy: [
        { periodYear: 'desc' },
        { periodMonth: 'desc' },
        { generatedAt: 'desc' },
      ],
    });

    return { payslips };
  }
}
