import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { PenCentralClient } from './pencentral.client';
import {
  NIGERIAN_PFAS,
  PENSION_SCHEDULE_STATUS,
  RSA_PIN_REGEX,
} from './pension.constants';
import {
  PenCentralScheduleRow,
  PenCentralValidationRequest,
} from './pencentral.types';
import {
  AttachEmployerDto,
  PensionScheduleQueryDto,
  UpdatePensionConfigDto,
  ValidateEmployerCodeDto,
} from './dto/pension.dto';

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

@Injectable()
export class PensionService {
  private readonly logger = new Logger(PensionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly penCentralClient: PenCentralClient,
  ) {}

  private checkOrgContext(user: AuthenticatedUser): string {
    if (!user.organizationId) {
      throw new BadRequestException(
        'An active organization context is required',
      );
    }
    return user.organizationId;
  }

  getRegisteredPfas() {
    return { pfas: NIGERIAN_PFAS };
  }

  /**
   * Phase 0 — Employer Onboarding
   * Step 1: Validate Employer Code (Read-Only)
   */
  async validateEmployerCode(
    user: AuthenticatedUser,
    dto: ValidateEmployerCodeDto,
  ) {
    this.checkOrgContext(user);
    const employerCode = dto.getCode();

    const result = await this.penCentralClient.validateEmployer(employerCode);

    return {
      validationId: result.validation_id,
      validation_id: result.validation_id,
      employerCode: result.employer_code,
      employer_code: result.employer_code,
      employerName: result.employer_name,
      employer_name: result.employer_name,
      valid: result.valid,
      expiresAt: result.expires_at,
      expires_at: result.expires_at,
    };
  }

  /**
   * Phase 0 — Employer Onboarding
   * Step 2: Attach the Confirmed Employer via validation_id
   */
  async attachEmployer(user: AuthenticatedUser, dto: AttachEmployerDto) {
    const orgId = this.checkOrgContext(user);
    const validationId = dto.getValidationId();

    const result = await this.penCentralClient.attachEmployer(validationId);

    await this.prisma.organization.update({
      where: { id: orgId },
      data: {
        penCentralEmployerCode: result.employer_code,
      },
    });

    return {
      message: 'Employer attached successfully',
      grantId: result.id,
      id: result.id,
      employerCode: result.employer_code,
      employer_code: result.employer_code,
      employerName: result.employer_name,
      employer_name: result.employer_name,
      status: result.status,
      attachedAt: result.attached_at,
      attached_at: result.attached_at,
    };
  }

  /**
   * Phase 0 — Employer Onboarding
   * Step 3: Get Attachment Status of current Organization
   */
  async getEmployerStatus(user: AuthenticatedUser) {
    const orgId = this.checkOrgContext(user);
    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      select: { id: true, name: true, penCentralEmployerCode: true },
    });

    if (!org) {
      throw new NotFoundException('Organization not found');
    }

    if (!org.penCentralEmployerCode) {
      return {
        isAttached: false,
        employerCode: null,
        employer_code: null,
        employerName: null,
        employer_name: null,
        grant: null,
      };
    }

    try {
      const attached = await this.penCentralClient.listAttachedEmployers();
      const grant = attached?.find(
        (g) =>
          g.employer_code.toUpperCase() ===
          org.penCentralEmployerCode?.toUpperCase(),
      );

      if (grant && grant.status === 'active') {
        return {
          isAttached: true,
          employerCode: grant.employer_code,
          employer_code: grant.employer_code,
          employerName: grant.employer_name,
          employer_name: grant.employer_name,
          grant: {
            id: grant.id,
            status: grant.status,
            attachedAt: grant.attached_at,
            attached_at: grant.attached_at,
          },
        };
      }

      return {
        isAttached: false,
        employerCode: org.penCentralEmployerCode,
        employer_code: org.penCentralEmployerCode,
        employerName: null,
        employer_name: null,
        grant: null,
        warning:
          'Employer code is configured in StackHR but is not currently attached in PenCentral partner portal.',
      };
    } catch (err: any) {
      this.logger.warn(
        `Failed to query PenCentral attached employers for org ${orgId}: ${err.message}`,
      );
      return {
        isAttached: true,
        employerCode: org.penCentralEmployerCode,
        employer_code: org.penCentralEmployerCode,
        employerName: org.name,
        employer_name: org.name,
        grant: null,
        degraded: true,
        warning:
          'Could not verify live attachment with PenCentral; local configuration retained.',
      };
    }
  }

  /**
   * Phase 0 — Employer Onboarding
   * Step 4: Revoke Employer Access
   */
  async revokeEmployer(user: AuthenticatedUser) {
    const orgId = this.checkOrgContext(user);
    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      select: { id: true, penCentralEmployerCode: true },
    });

    if (!org) {
      throw new NotFoundException('Organization not found');
    }

    if (org.penCentralEmployerCode) {
      try {
        await this.penCentralClient.revokeEmployer(org.penCentralEmployerCode);
      } catch (err: any) {
        this.logger.warn(
          `PenCentral revoke call returned error for ${org.penCentralEmployerCode}: ${err.message}`,
        );
      }

      await this.prisma.organization.update({
        where: { id: orgId },
        data: {
          penCentralEmployerCode: null,
        },
      });
    }

    return {
      message: 'Employer access revoked successfully',
    };
  }

  async updateEmployerConfig(
    user: AuthenticatedUser,
    dto: UpdatePensionConfigDto,
  ) {
    const orgId = this.checkOrgContext(user);

    const org = await this.prisma.organization.update({
      where: { id: orgId },
      data: {
        penCentralEmployerCode: dto.penCentralEmployerCode.trim(),
      },
    });

    return {
      message: 'PenCentral employer code updated successfully',
      penCentralEmployerCode: org.penCentralEmployerCode,
    };
  }

  async getEmployerConfig(user: AuthenticatedUser) {
    const orgId = this.checkOrgContext(user);
    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      select: { id: true, name: true, penCentralEmployerCode: true },
    });

    if (!org) {
      throw new NotFoundException('Organization not found');
    }

    let isAttached = false;
    let employerName = org.name;

    if (org.penCentralEmployerCode) {
      try {
        const attached = await this.penCentralClient.listAttachedEmployers();
        const grant = attached?.find(
          (g) =>
            g.employer_code.toUpperCase() ===
            org.penCentralEmployerCode?.toUpperCase(),
        );
        if (grant && grant.status === 'active') {
          isAttached = true;
          employerName = grant.employer_name;
        }
      } catch {
        // Fallback gracefully without throwing
      }
    }

    return {
      ...org,
      isAttached,
      employerName,
    };
  }

  /**
   * Step 1: Create a Draft Remittance Schedule from an approved/executed PayrollRun
   */
  async createScheduleFromPayroll(
    user: AuthenticatedUser,
    payrollRunId: string,
  ) {
    const orgId = this.checkOrgContext(user);

    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
    });

    if (!org) {
      throw new NotFoundException('Organization not found');
    }

    if (!org.penCentralEmployerCode) {
      throw new BadRequestException(
        'PenCentral employer code is not configured for this organization. Set penCentralEmployerCode first.',
      );
    }

    const payrollRun = await this.prisma.payrollRun.findFirst({
      where: { id: payrollRunId, organizationId: orgId },
      include: {
        items: {
          include: {
            employee: true,
          },
        },
        pensionRemittanceSchedule: true,
      },
    });

    if (!payrollRun) {
      throw new NotFoundException(`Payroll run ${payrollRunId} not found`);
    }

    if (payrollRun.pensionRemittanceSchedule) {
      throw new ConflictException(
        `A pension remittance schedule already exists for payroll run ${payrollRunId}`,
      );
    }

    // Must be at least APPROVED or EXECUTED
    const eligibleStatuses = [
      'APPROVED',
      'FUNDING_CHECK_PASSED',
      'EXECUTED',
      'RECONCILED',
    ];
    if (!eligibleStatuses.includes(payrollRun.status)) {
      throw new BadRequestException(
        `Payroll run must be APPROVED or EXECUTED before creating pension remittance. Current status: ${payrollRun.status}`,
      );
    }

    // Filter items with pension contributions
    const pensionItems = payrollRun.items.filter(
      (item: any) =>
        item.pensionDeduction > 0 || item.employerPensionDeduction > 0,
    );

    if (pensionItems.length === 0) {
      throw new BadRequestException(
        'No employees with pension contributions found in this payroll run',
      );
    }

    // Pre-flight check on employees for RSA numbers and PFA codes
    const missingDetails: Array<{
      employeeId: string;
      fullName: string;
      missing: string[];
    }> = [];

    for (const item of pensionItems) {
      const emp = item.employee;
      const missing: string[] = [];
      const rsa = emp.pensionRsaNumber?.trim();
      const pfa = emp.pfaCode?.trim();

      if (!rsa) {
        missing.push('pensionRsaNumber');
      } else if (!RSA_PIN_REGEX.test(rsa)) {
        missing.push('invalid pensionRsaNumber (must be 15 chars PEN/TPEN)');
      }

      if (!pfa) {
        missing.push('pfaCode');
      }

      if (missing.length > 0) {
        missingDetails.push({
          employeeId: emp.id,
          fullName: emp.fullName,
          missing,
        });
      }
    }

    if (missingDetails.length > 0) {
      throw new BadRequestException({
        message:
          'Cannot create pension remittance schedule: Some employees have missing or invalid pension details',
        invalidEmployees: missingDetails,
      });
    }

    const monthIndex = payrollRun.periodMonth - 1;
    const monthName =
      MONTH_NAMES[monthIndex] ?? `Month-${payrollRun.periodMonth}`;

    let totalEmpPension = 0;
    let totalEmprPension = 0;

    for (const item of pensionItems) {
      totalEmpPension += item.pensionDeduction;
      totalEmprPension += item.employerPensionDeduction;
    }

    const totalAmount = totalEmpPension + totalEmprPension;

    const schedule = await this.prisma.pensionRemittanceSchedule.create({
      data: {
        organizationId: orgId,
        payrollRunId: payrollRun.id,
        periodMonth: monthName,
        periodYear: payrollRun.periodYear,
        employerCode: org.penCentralEmployerCode,
        totalEmployeePension: totalEmpPension,
        totalEmployerPension: totalEmprPension,
        totalAmount,
        employeeCount: pensionItems.length,
        status: PENSION_SCHEDULE_STATUS.DRAFT,
      },
    });

    return {
      message: 'Draft pension remittance schedule created successfully',
      schedule,
    };
  }

  /**
   * Step 2 & 3: Validate Schedule with PenCentral
   */
  async validateSchedule(user: AuthenticatedUser, scheduleId: string) {
    const orgId = this.checkOrgContext(user);

    const schedule = await this.prisma.pensionRemittanceSchedule.findFirst({
      where: { id: scheduleId, organizationId: orgId },
      include: {
        payrollRun: {
          include: {
            items: {
              include: { employee: true },
            },
          },
        },
      },
    });

    if (!schedule) {
      throw new NotFoundException(
        `Remittance schedule ${scheduleId} not found`,
      );
    }

    if (
      schedule.status !== PENSION_SCHEDULE_STATUS.DRAFT &&
      schedule.status !== PENSION_SCHEDULE_STATUS.VALIDATION_FAILED
    ) {
      throw new BadRequestException(
        `Only DRAFT or VALIDATION_FAILED schedules can be validated. Current status: ${schedule.status}`,
      );
    }

    // Build PenCentral rows
    const pensionItems = schedule.payrollRun.items.filter(
      (item: any) =>
        item.pensionDeduction > 0 || item.employerPensionDeduction > 0,
    );

    const rows: PenCentralScheduleRow[] = pensionItems.map((item: any) => {
      const emp = item.employee;
      const firstName =
        emp.firstName?.trim() || emp.fullName.split(' ')[0] || 'Employee';
      const lastName =
        emp.lastName?.trim() ||
        emp.fullName.split(' ').slice(1).join(' ') ||
        'Staff';

      const empContrib = Number(item.pensionDeduction).toFixed(2);
      const emprContrib = Number(item.employerPensionDeduction).toFixed(2);
      const rowTotal = (
        Number(item.pensionDeduction) + Number(item.employerPensionDeduction)
      ).toFixed(2);

      return {
        rsa_pin: emp.pensionRsaNumber!.trim().toUpperCase(),
        pfa_code: emp.pfaCode!.trim(),
        first_name: firstName,
        last_name: lastName,
        staff_id: emp.employeeNumber?.trim() || emp.id,
        payment_year: schedule.periodYear,
        payment_month: schedule.periodMonth,
        employee_contribution: empContrib,
        employer_contribution: emprContrib,
        employee_voluntary_contribution: '0.00',
        employer_voluntary_contribution: '0.00',
        other_contribution: '0.00',
        declared_total: rowTotal,
        contribution_type: 'MAN',
      };
    });

    const payload: PenCentralValidationRequest = {
      employer_code: schedule.employerCode,
      rows,
    };

    const validationRes = await this.penCentralClient.validateSchedule(payload);

    let nextStatus: string = PENSION_SCHEDULE_STATUS.VALIDATING;
    let errorsJson: string | null = null;

    if (validationRes.status === 'success') {
      nextStatus = PENSION_SCHEDULE_STATUS.VALIDATED;
    } else if (validationRes.status === 'failed') {
      nextStatus = PENSION_SCHEDULE_STATUS.VALIDATION_FAILED;
      try {
        const errorDetails = await this.penCentralClient.getValidationErrors(
          validationRes.validation_id,
        );
        errorsJson = JSON.stringify(errorDetails.errors);
      } catch (err: any) {
        this.logger.warn(
          `Could not retrieve validation error details: ${err.message}`,
        );
      }
    }

    const updated = await this.prisma.pensionRemittanceSchedule.update({
      where: { id: scheduleId },
      data: {
        penCentralValidationId: validationRes.validation_id,
        status: nextStatus,
        validationErrorsJson: errorsJson,
      },
    });

    return {
      message: `Schedule validation dispatched. PenCentral status: ${validationRes.status}`,
      schedule: updated,
      penCentralResponse: validationRes,
    };
  }

  /**
   * Check async validation status
   */
  async checkValidationStatus(user: AuthenticatedUser, scheduleId: string) {
    const orgId = this.checkOrgContext(user);

    const schedule = await this.prisma.pensionRemittanceSchedule.findFirst({
      where: { id: scheduleId, organizationId: orgId },
    });

    if (!schedule) {
      throw new NotFoundException(
        `Remittance schedule ${scheduleId} not found`,
      );
    }

    if (!schedule.penCentralValidationId) {
      throw new BadRequestException(
        'Schedule has not been sent for validation yet',
      );
    }

    const res = await this.penCentralClient.getValidationStatus(
      schedule.penCentralValidationId,
    );

    let nextStatus = schedule.status;
    let errorsJson = schedule.validationErrorsJson;

    if (res.status === 'success') {
      nextStatus = PENSION_SCHEDULE_STATUS.VALIDATED;
      errorsJson = null;
    } else if (res.status === 'failed') {
      nextStatus = PENSION_SCHEDULE_STATUS.VALIDATION_FAILED;
      const errorDetails = await this.penCentralClient.getValidationErrors(
        schedule.penCentralValidationId,
      );
      errorsJson = JSON.stringify(errorDetails.errors);
    }

    const updated = await this.prisma.pensionRemittanceSchedule.update({
      where: { id: scheduleId },
      data: {
        status: nextStatus,
        validationErrorsJson: errorsJson,
      },
    });

    return {
      schedule: updated,
      penCentralStatus: res.status,
      details: res,
    };
  }

  /**
   * Step 5: Submit the Validated Schedule
   */
  async submitSchedule(user: AuthenticatedUser, scheduleId: string) {
    const orgId = this.checkOrgContext(user);

    const schedule = await this.prisma.pensionRemittanceSchedule.findFirst({
      where: { id: scheduleId, organizationId: orgId },
    });

    if (!schedule) {
      throw new NotFoundException(
        `Remittance schedule ${scheduleId} not found`,
      );
    }

    if (schedule.status !== PENSION_SCHEDULE_STATUS.VALIDATED) {
      throw new BadRequestException(
        `Schedule must be VALIDATED before submission. Current status: ${schedule.status}`,
      );
    }

    const submitRes = await this.penCentralClient.submitSchedule(
      schedule.penCentralValidationId!,
    );

    const updated = await this.prisma.pensionRemittanceSchedule.update({
      where: { id: scheduleId },
      data: {
        penCentralScheduleId: submitRes.schedule_id,
        status: PENSION_SCHEDULE_STATUS.SUBMITTED,
        submittedAt: new Date(),
      },
    });

    return {
      message: 'Schedule successfully submitted to PenCentral',
      schedule: updated,
      submitResult: submitRes,
    };
  }

  /**
   * Step 7: Initiate Virtual Account Payment
   */
  async initiatePayment(user: AuthenticatedUser, scheduleId: string) {
    const orgId = this.checkOrgContext(user);

    const schedule = await this.prisma.pensionRemittanceSchedule.findFirst({
      where: { id: scheduleId, organizationId: orgId },
    });

    if (!schedule) {
      throw new NotFoundException(
        `Remittance schedule ${scheduleId} not found`,
      );
    }

    if (
      schedule.status !== PENSION_SCHEDULE_STATUS.SUBMITTED &&
      schedule.status !== PENSION_SCHEDULE_STATUS.PAYMENT_PENDING
    ) {
      throw new BadRequestException(
        `Schedule must be SUBMITTED to initiate payment. Current status: ${schedule.status}`,
      );
    }

    if (!schedule.penCentralScheduleId) {
      throw new BadRequestException(
        'Schedule does not have a PenCentral schedule ID',
      );
    }

    const paymentRes = await this.penCentralClient.initiatePayment(
      schedule.penCentralScheduleId,
    );

    const updated = await this.prisma.pensionRemittanceSchedule.update({
      where: { id: scheduleId },
      data: {
        paymentId: paymentRes.payment_id,
        paymentProvider: paymentRes.provider,
        virtualAccountNumber: paymentRes.account_number,
        virtualAccountBank: paymentRes.bank_name,
        virtualAccountName: paymentRes.account_name,
        paymentExpiresAt: paymentRes.expires_at
          ? new Date(paymentRes.expires_at)
          : null,
        status: PENSION_SCHEDULE_STATUS.PAYMENT_PENDING,
      },
    });

    return {
      message:
        'Virtual account generated successfully for pension remittance payment',
      schedule: updated,
      paymentDetails: paymentRes,
    };
  }

  /**
   * Step 8 & 9: Sync Payment Status & Retrieve Official Receipt
   */
  async syncPaymentStatus(user: AuthenticatedUser, scheduleId: string) {
    const orgId = this.checkOrgContext(user);

    const schedule = await this.prisma.pensionRemittanceSchedule.findFirst({
      where: { id: scheduleId, organizationId: orgId },
    });

    if (!schedule) {
      throw new NotFoundException(
        `Remittance schedule ${scheduleId} not found`,
      );
    }

    if (!schedule.paymentId) {
      throw new BadRequestException(
        'No payment has been initiated for this schedule',
      );
    }

    const paymentStatus = await this.penCentralClient.getPaymentStatus(
      schedule.paymentId,
    );

    let nextStatus = schedule.status;
    let paidAt = schedule.paidAt;
    let receiptId = schedule.receiptId;
    let receiptJson = schedule.receiptJson;

    if (paymentStatus.status === 'succeeded') {
      nextStatus = PENSION_SCHEDULE_STATUS.PAID;
      paidAt = new Date();

      try {
        const receipt = await this.penCentralClient.getReceipt(
          schedule.paymentId,
        );
        receiptId = receipt.receipt_id;
        receiptJson = JSON.stringify(receipt);
      } catch (err: any) {
        this.logger.warn(`Could not retrieve receipt: ${err.message}`);
      }
    } else if (
      paymentStatus.status === 'failed' ||
      paymentStatus.status === 'expired'
    ) {
      nextStatus = PENSION_SCHEDULE_STATUS.FAILED;
    }

    const updated = await this.prisma.pensionRemittanceSchedule.update({
      where: { id: scheduleId },
      data: {
        status: nextStatus,
        paidAt,
        receiptId,
        receiptJson,
      },
    });

    return {
      message: `Payment status synced: ${paymentStatus.status}`,
      schedule: updated,
      paymentStatus,
    };
  }

  /**
   * Step 10: Sync PFA Disbursements
   */
  async syncDisbursements(user: AuthenticatedUser, scheduleId: string) {
    const orgId = this.checkOrgContext(user);

    const schedule = await this.prisma.pensionRemittanceSchedule.findFirst({
      where: { id: scheduleId, organizationId: orgId },
    });

    if (!schedule) {
      throw new NotFoundException(
        `Remittance schedule ${scheduleId} not found`,
      );
    }

    if (!schedule.penCentralScheduleId) {
      throw new BadRequestException(
        'Schedule does not have a PenCentral schedule ID',
      );
    }

    const disbursements = await this.penCentralClient.getDisbursements(
      schedule.penCentralScheduleId,
    );

    let nextStatus = schedule.status;
    if (disbursements.status === 'completed') {
      nextStatus = PENSION_SCHEDULE_STATUS.DISBURSED;
    }

    const updated = await this.prisma.pensionRemittanceSchedule.update({
      where: { id: scheduleId },
      data: {
        disbursementStatus: disbursements.status,
        disbursementJson: JSON.stringify(disbursements.pfas),
        status: nextStatus,
      },
    });

    return {
      message: `Disbursements status: ${disbursements.status}`,
      schedule: updated,
      disbursements,
    };
  }

  async getSchedule(user: AuthenticatedUser, scheduleId: string) {
    const orgId = this.checkOrgContext(user);

    const schedule = await this.prisma.pensionRemittanceSchedule.findFirst({
      where: { id: scheduleId, organizationId: orgId },
      include: {
        payrollRun: {
          select: {
            id: true,
            title: true,
            periodMonth: true,
            periodYear: true,
            status: true,
          },
        },
      },
    });

    if (!schedule) {
      throw new NotFoundException(
        `Remittance schedule ${scheduleId} not found`,
      );
    }

    return schedule;
  }

  async listSchedules(user: AuthenticatedUser, query: PensionScheduleQueryDto) {
    const orgId = this.checkOrgContext(user);

    const where: any = { organizationId: orgId };
    if (query.status) {
      where.status = query.status;
    }
    if (query.periodYear) {
      where.periodYear = parseInt(query.periodYear, 10);
    }

    const schedules = await this.prisma.pensionRemittanceSchedule.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        payrollRun: {
          select: {
            id: true,
            title: true,
            periodMonth: true,
            periodYear: true,
          },
        },
      },
    });

    return { schedules };
  }

  async getDashboard(user: AuthenticatedUser) {
    const orgId = this.checkOrgContext(user);
    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
    });

    if (!org?.penCentralEmployerCode) {
      throw new BadRequestException(
        'PenCentral employer code is not configured for this organization',
      );
    }

    const dashboard = await this.penCentralClient.getDashboard(
      org.penCentralEmployerCode,
    );

    return dashboard;
  }

  async getComplianceReport(user: AuthenticatedUser) {
    const orgId = this.checkOrgContext(user);
    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
    });

    if (!org?.penCentralEmployerCode) {
      throw new BadRequestException(
        'PenCentral employer code is not configured for this organization',
      );
    }

    const report = await this.penCentralClient.getComplianceReport(
      org.penCentralEmployerCode,
    );

    return report;
  }
}
