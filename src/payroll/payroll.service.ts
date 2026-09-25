import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../database/prisma.service';
import { ApprovalsService } from '../approvals/approvals.service';
import { ComplianceService } from '../compliance/compliance.service';
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

    const run = await this.prisma.payrollRun.create({
      data: {
        id: randomUUID(),
        organizationId: orgId,
        periodMonth: dto.periodMonth,
        periodYear: dto.periodYear,
        title,
        status: 'DRAFT',
      },
    });

    return {
      message: 'Payroll run created in DRAFT state',
      payrollRun: run,
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
      where: { organizationId: orgId },
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

    const nextStatus = dto.confirmed
      ? 'FUNDING_CHECK_PASSED'
      : 'FUNDING_SHORTFALL';

    const updatedRun = await this.prisma.payrollRun.update({
      where: { id: runId },
      data: { status: nextStatus },
    });

    return {
      message: dto.confirmed
        ? 'Funding check passed successfully. Ready for payment execution.'
        : 'Funding shortfall recorded. Payment execution blocked until resolved.',
      payrollRun: updatedRun,
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
              select: { id: true, fullName: true, email: true },
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

    return {
      message: 'Payment execution recorded and bank transfer file exported',
      payrollRun: updatedRun,
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

    return {
      message: 'Payroll run successfully reconciled',
      payrollRun: updatedRun,
    };
  }

  async getRuns(user: AuthenticatedUser) {
    const orgId = this.checkOrgContext(user);

    const runs = await this.prisma.payrollRun.findMany({
      where: { organizationId: orgId },
      orderBy: [{ periodYear: 'desc' }, { periodMonth: 'desc' }],
    });

    return { payrollRuns: runs };
  }

  async getRunById(user: AuthenticatedUser, runId: string) {
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
                department: true,
              },
            },
          },
        },
        payslips: true,
      },
    });

    if (!run) {
      throw new NotFoundException(`Payroll run ${runId} not found`);
    }

    return { payrollRun: run };
  }
}
