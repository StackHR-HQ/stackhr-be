/* eslint-disable @typescript-eslint/unbound-method */
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { PensionService } from './pension.service';
import { PrismaService } from '../database/prisma.service';
import { PenCentralClient } from './pencentral.client';
import { AuthenticatedUser } from '../auth/auth.types';
import { USER_ROLES, USER_TYPES } from '../auth/auth.constants';
import { NIGERIAN_PFAS, PENSION_SCHEDULE_STATUS } from './pension.constants';

describe('PensionService', () => {
  let service: PensionService;
  let prisma: jest.Mocked<PrismaService>;
  let penCentralClient: jest.Mocked<PenCentralClient>;

  const mockUser: AuthenticatedUser = {
    id: 'user-1',
    name: 'HR Admin',
    email: 'admin@acme.com',
    userType: USER_TYPES.BUSINESS,
    role: USER_ROLES.HR_ADMIN,
    organizationId: 'org-123',
  };

  beforeEach(() => {
    prisma = {
      organization: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      payrollRun: {
        findFirst: jest.fn(),
      },
      pensionRemittanceSchedule: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
    } as any;

    penCentralClient = {
      validateSchedule: jest.fn(),
      getValidationStatus: jest.fn(),
      getValidationErrors: jest.fn(),
      submitSchedule: jest.fn(),
      initiatePayment: jest.fn(),
      getPaymentStatus: jest.fn(),
      getReceipt: jest.fn(),
      getDisbursements: jest.fn(),
      getDashboard: jest.fn(),
      getComplianceReport: jest.fn(),
    } as any;

    service = new PensionService(prisma, penCentralClient);
  });

  describe('getRegisteredPfas', () => {
    it('returns the list of Nigerian PFAs', () => {
      const res = service.getRegisteredPfas();
      expect(res.pfas).toEqual(NIGERIAN_PFAS);
      expect(res.pfas.length).toBeGreaterThan(10);
    });
  });

  describe('Employer Config', () => {
    it('updates employer penCentral code', async () => {
      (prisma.organization.update as jest.Mock).mockResolvedValue({
        id: 'org-123',
        penCentralEmployerCode: 'EMP-001',
      });

      const res = await service.updateEmployerConfig(mockUser, {
        penCentralEmployerCode: 'EMP-001',
      });

      expect(res.penCentralEmployerCode).toBe('EMP-001');
      expect(prisma.organization.update).toHaveBeenCalledWith({
        where: { id: 'org-123' },
        data: { penCentralEmployerCode: 'EMP-001' },
      });
    });

    it('gets employer config', async () => {
      (prisma.organization.findUnique as jest.Mock).mockResolvedValue({
        id: 'org-123',
        name: 'Acme Corp',
        penCentralEmployerCode: 'EMP-001',
      });

      const res = await service.getEmployerConfig(mockUser);
      expect(res.penCentralEmployerCode).toBe('EMP-001');
    });
  });

  describe('createScheduleFromPayroll', () => {
    it('throws error when employer code is missing on org', async () => {
      (prisma.organization.findUnique as jest.Mock).mockResolvedValue({
        id: 'org-123',
        penCentralEmployerCode: null,
      });

      await expect(
        service.createScheduleFromPayroll(mockUser, 'run-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws error when payroll run is not found', async () => {
      (prisma.organization.findUnique as jest.Mock).mockResolvedValue({
        id: 'org-123',
        penCentralEmployerCode: 'EMP-001',
      });
      (prisma.payrollRun.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(
        service.createScheduleFromPayroll(mockUser, 'run-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws conflict error if schedule already exists for run', async () => {
      (prisma.organization.findUnique as jest.Mock).mockResolvedValue({
        id: 'org-123',
        penCentralEmployerCode: 'EMP-001',
      });
      (prisma.payrollRun.findFirst as jest.Mock).mockResolvedValue({
        id: 'run-1',
        status: 'EXECUTED',
        pensionRemittanceSchedule: { id: 'sch-existing' },
      });

      await expect(
        service.createScheduleFromPayroll(mockUser, 'run-1'),
      ).rejects.toThrow(ConflictException);
    });

    it('throws error if an employee has invalid RSA or missing PFA', async () => {
      (prisma.organization.findUnique as jest.Mock).mockResolvedValue({
        id: 'org-123',
        penCentralEmployerCode: 'EMP-001',
      });
      (prisma.payrollRun.findFirst as jest.Mock).mockResolvedValue({
        id: 'run-1',
        status: 'EXECUTED',
        periodMonth: 9,
        periodYear: 2026,
        items: [
          {
            pensionDeduction: 5000,
            employerPensionDeduction: 5000,
            employee: {
              id: 'emp-1',
              fullName: 'Invalid Staff',
              pensionRsaNumber: 'INVALID_RSA',
              pfaCode: null,
            },
          },
        ],
      });

      await expect(
        service.createScheduleFromPayroll(mockUser, 'run-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('successfully creates draft schedule for valid run and employees', async () => {
      (prisma.organization.findUnique as jest.Mock).mockResolvedValue({
        id: 'org-123',
        penCentralEmployerCode: 'EMP-001',
      });
      (prisma.payrollRun.findFirst as jest.Mock).mockResolvedValue({
        id: 'run-1',
        status: 'EXECUTED',
        periodMonth: 9,
        periodYear: 2026,
        items: [
          {
            pensionDeduction: 8000,
            employerPensionDeduction: 10000,
            employee: {
              id: 'emp-1',
              fullName: 'Ada Okafor',
              pensionRsaNumber: 'PEN100234567890',
              pfaCode: '001',
              employeeNumber: 'EMP-001',
            },
          },
        ],
      });

      (prisma.pensionRemittanceSchedule.create as jest.Mock).mockResolvedValue({
        id: 'sch-1',
        organizationId: 'org-123',
        payrollRunId: 'run-1',
        periodMonth: 'September',
        periodYear: 2026,
        totalAmount: 18000,
        status: PENSION_SCHEDULE_STATUS.DRAFT,
      });

      const res = await service.createScheduleFromPayroll(mockUser, 'run-1');

      expect(res.schedule.id).toBe('sch-1');
      expect(prisma.pensionRemittanceSchedule.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            employerCode: 'EMP-001',
            periodMonth: 'September',
            totalAmount: 18000,
            status: 'DRAFT',
          }),
        }),
      );
    });
  });

  describe('validateSchedule', () => {
    it('dispatches validation to PenCentral and updates status', async () => {
      (
        prisma.pensionRemittanceSchedule.findFirst as jest.Mock
      ).mockResolvedValue({
        id: 'sch-1',
        status: 'DRAFT',
        periodYear: 2026,
        periodMonth: 'September',
        employerCode: 'EMP-001',
        payrollRun: {
          items: [
            {
              pensionDeduction: 5000,
              employerPensionDeduction: 5000,
              employee: {
                id: 'emp-1',
                fullName: 'Ada Okafor',
                pensionRsaNumber: 'PEN100234567890',
                pfaCode: '001',
                employeeNumber: 'EMP-001',
              },
            },
          ],
        },
      });

      penCentralClient.validateSchedule.mockResolvedValue({
        validation_id: 'val-123',
        status: 'success',
        employer_code: 'EMP-001',
        total_rows: 1,
        valid_rows: 1,
        invalid_rows: 0,
        pending_rows: 0,
        declared_total: '10000.00',
        computed_total: '10000.00',
        created_at: '2026-09-01T10:00:00Z',
        completed_at: null,
      });

      (prisma.pensionRemittanceSchedule.update as jest.Mock).mockResolvedValue({
        id: 'sch-1',
        status: 'VALIDATED',
        penCentralValidationId: 'val-123',
      });

      const res = await service.validateSchedule(mockUser, 'sch-1');

      expect(res.schedule.status).toBe('VALIDATED');
      expect(penCentralClient.validateSchedule).toHaveBeenCalledWith(
        expect.objectContaining({
          employer_code: 'EMP-001',
          rows: expect.arrayContaining([
            expect.objectContaining({
              rsa_pin: 'PEN100234567890',
              pfa_code: '001',
              declared_total: '10000.00',
            }),
          ]),
        }),
      );
    });
  });

  describe('submitSchedule & payment', () => {
    it('submits validated schedule to PenCentral', async () => {
      (
        prisma.pensionRemittanceSchedule.findFirst as jest.Mock
      ).mockResolvedValue({
        id: 'sch-1',
        status: 'VALIDATED',
        penCentralValidationId: 'val-123',
      });

      penCentralClient.submitSchedule.mockResolvedValue({
        schedule_id: 'sch-pc-1',
        status: 'submitted',
        payment_status: 'not_started',
        employer_code: 'EMP001',
        validation_id: 'val-123',
        no_of_rows: 1,
        no_of_pfas: 1,
        total_employee_contribution: '5000.00',
        total_employer_contribution: '5000.00',
        total_employee_voluntary: '0.00',
        total_employer_voluntary: '0.00',
        total_other_contribution: '0.00',
        total_contribution: '10000.00',
        created_at: '2026-09-01T10:00:00Z',
      });

      (prisma.pensionRemittanceSchedule.update as jest.Mock).mockResolvedValue({
        id: 'sch-1',
        status: 'SUBMITTED',
        penCentralScheduleId: 'sch-pc-1',
      });

      const res = await service.submitSchedule(mockUser, 'sch-1');
      expect(res.schedule.status).toBe('SUBMITTED');
    });

    it('initiates virtual account payment for submitted schedule', async () => {
      (
        prisma.pensionRemittanceSchedule.findFirst as jest.Mock
      ).mockResolvedValue({
        id: 'sch-1',
        status: 'SUBMITTED',
        penCentralScheduleId: 'sch-pc-1',
      });

      penCentralClient.initiatePayment.mockResolvedValue({
        payment_id: 'pay-1',
        schedule_id: 'sch-pc-1',
        status: 'pending',
        provider: 'monnify',
        contribution_amount: '10000.00',
        fee_amount: '0.00',
        total_amount: '10000.00',
        currency: 'NGN',
        account_number: '9990001234',
        account_name: 'PenCentral Collection',
        bank_name: 'Moniepoint MFB',
        expires_at: '2026-09-08T10:00:00Z',
        created_at: '2026-09-01T10:00:00Z',
      });

      (prisma.pensionRemittanceSchedule.update as jest.Mock).mockResolvedValue({
        id: 'sch-1',
        status: 'PAYMENT_PENDING',
        virtualAccountNumber: '9990001234',
      });

      const res = await service.initiatePayment(mockUser, 'sch-1');
      expect(res.schedule.status).toBe('PAYMENT_PENDING');
      expect(res.paymentDetails.account_number).toBe('9990001234');
    });

    it('syncPaymentStatus retrieves receipt when payment succeeded', async () => {
      (
        prisma.pensionRemittanceSchedule.findFirst as jest.Mock
      ).mockResolvedValue({
        id: 'sch-1',
        paymentId: 'pay-1',
        status: 'PAYMENT_PENDING',
      });

      penCentralClient.getPaymentStatus.mockResolvedValue({
        payment_id: 'pay-1',
        schedule_id: 'sch-pc-1',
        status: 'succeeded',
        provider: 'monnify',
        contribution_amount: '10000.00',
        fee_amount: '0.00',
        total_amount: '10000.00',
        currency: 'NGN',
        account_number: '9990001234',
        account_name: 'PenCentral Collection',
        bank_name: 'Moniepoint MFB',
        expires_at: '2026-09-08T10:00:00Z',
        created_at: '2026-09-01T10:00:00Z',
      });

      penCentralClient.getReceipt.mockResolvedValue({
        receipt_id: 'rcp-1',
        payment_id: 'pay-1',
        schedule_id: 'sch-pc-1',
        partner_id: 'partner-1',
        status: 'issued',
        issued_at: '2026-09-01T10:30:00Z',
        created_at: '2026-09-01T10:30:00Z',
      });

      (prisma.pensionRemittanceSchedule.update as jest.Mock).mockResolvedValue({
        id: 'sch-1',
        status: 'PAID',
        receiptId: 'rcp-1',
      });

      const res = await service.syncPaymentStatus(mockUser, 'sch-1');
      expect(res.schedule.status).toBe('PAID');
      expect(penCentralClient.getReceipt).toHaveBeenCalledWith('pay-1');
    });
  });

  describe('Reports & Dashboard', () => {
    it('fetches dashboard for configured organization', async () => {
      (prisma.organization.findUnique as jest.Mock).mockResolvedValue({
        id: 'org-123',
        penCentralEmployerCode: 'EMP-001',
      });

      penCentralClient.getDashboard.mockResolvedValue({
        employer_code: 'EMP-001',
        schedule_count: 5,
        unsubmitted_count: 1,
        submitted_count: 4,
        cancelled_count: 0,
        total_remittance: '500000.00',
      });

      const res = await service.getDashboard(mockUser);
      expect(res.schedule_count).toBe(5);
    });
  });
});
