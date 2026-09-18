import { BadRequestException, ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PayrollService } from './payroll.service';
import { PrismaService } from '../database/prisma.service';
import { ApprovalsService } from '../approvals/approvals.service';
import { ComplianceService } from '../compliance/compliance.service';
import { USER_ROLES, USER_TYPES } from '../auth/auth.constants';
import type { AuthenticatedUser } from '../auth/auth.types';

describe('PayrollService', () => {
  let service: PayrollService;
  let prismaMock: any;
  let approvalsServiceMock: {
    submitRequest: jest.Mock;
  };
  let complianceServiceMock: {
    calculatePayrollDeductions: jest.Mock;
  };

  const mockAdminUser: AuthenticatedUser = {
    id: 'user-admin-1',
    name: 'Admin User',
    email: 'admin@acme.com',
    userType: USER_TYPES.BUSINESS,
    role: USER_ROLES.BUSINESS_ADMIN,
    organizationId: 'org-123',
  };

  beforeEach(async () => {
    prismaMock = {
      organization: {
        findUnique: jest.fn().mockResolvedValue({ id: 'org-123' }),
      },
      employee: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
      },
      compensationRecord: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        findMany: jest.fn(),
      },
      payrollRun: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      payrollItem: {
        deleteMany: jest.fn(),
        createMany: jest.fn(),
      },
    };

    approvalsServiceMock = {
      submitRequest: jest.fn(),
    };

    complianceServiceMock = {
      calculatePayrollDeductions: jest.fn().mockResolvedValue({
        grossSalaryMonthly: 1000000,
        taxDeductionMonthly: 148100,
        pensionDeductionMonthly: 80000,
        employerPensionDeductionMonthly: 100000,
        nhfDeductionMonthly: 0,
        rentReliefAppliedMonthly: 0,
        annualBreakdown: {},
        ruleSetId: 'TRS-123',
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PayrollService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: ApprovalsService, useValue: approvalsServiceMock },
        { provide: ComplianceService, useValue: complianceServiceMock },
      ],
    }).compile();

    service = module.get<PayrollService>(PayrollService);
  });

  describe('setCompensation', () => {
    it('should create new compensation record and close out existing active record', async () => {
      prismaMock.employee.findFirst.mockResolvedValue({ id: 'emp-100' });
      prismaMock.compensationRecord.findFirst.mockResolvedValue({
        id: 'comp-old',
        effectiveTo: null,
      });
      prismaMock.compensationRecord.update.mockResolvedValue({
        id: 'comp-old',
        effectiveTo: new Date(),
      });
      prismaMock.compensationRecord.create.mockResolvedValue({
        id: 'comp-new',
        employeeId: 'emp-100',
        basicSalary: 300000,
        effectiveTo: null,
      });

      const result = await service.setCompensation(mockAdminUser, {
        employeeId: 'emp-100',
        basicSalary: 300000,
        housingAllowance: 100000,
        transportAllowance: 50000,
      });

      expect(prismaMock.compensationRecord.update).toHaveBeenCalledWith({
        where: { id: 'comp-old' },
        data: { effectiveTo: expect.any(Date) },
      });
      expect(result.compensationRecord.id).toBe('comp-new');
    });
  });

  describe('createRun', () => {
    it('should create a DRAFT payroll run', async () => {
      prismaMock.payrollRun.findFirst.mockResolvedValue(null);
      prismaMock.payrollRun.create.mockResolvedValue({
        id: 'run-1',
        periodMonth: 9,
        periodYear: 2026,
        status: 'DRAFT',
      });

      const result = await service.createRun(mockAdminUser, {
        periodMonth: 9,
        periodYear: 2026,
      });

      expect(result.payrollRun.status).toBe('DRAFT');
    });

    it('should throw ConflictException if run already exists for period', async () => {
      prismaMock.payrollRun.findFirst.mockResolvedValue({ id: 'run-existing' });

      await expect(
        service.createRun(mockAdminUser, { periodMonth: 9, periodYear: 2026 }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('calculateRun', () => {
    it('should compute gross, pension, and net for employees and set status to CALCULATED', async () => {
      prismaMock.payrollRun.findFirst.mockResolvedValue({
        id: 'run-1',
        status: 'DRAFT',
      });
      prismaMock.employee.findMany.mockResolvedValue([
        {
          id: 'emp-1',
          salaryAmount: 300000,
          compensationRecords: [
            {
              basicSalary: 300000,
              housingAllowance: 100000,
              transportAllowance: 50000,
              otherAllowances: 0,
            },
          ],
        },
      ]);
      prismaMock.payrollItem.deleteMany.mockResolvedValue({});
      prismaMock.payrollItem.createMany.mockResolvedValue({});
      prismaMock.payrollRun.update.mockResolvedValue({
        id: 'run-1',
        status: 'CALCULATED',
        totalGross: 450000,
        totalNet: 414000,
      });

      const result = await service.calculateRun(mockAdminUser, 'run-1');

      expect(prismaMock.payrollItem.deleteMany).toHaveBeenCalledWith({
        where: { payrollRunId: 'run-1' },
      });
      expect(prismaMock.payrollItem.createMany).toHaveBeenCalled();
      expect(result.payrollRun.status).toBe('CALCULATED');
    });

    it('should throw BadRequestException if run is locked', async () => {
      prismaMock.payrollRun.findFirst.mockResolvedValue({
        id: 'run-1',
        status: 'PENDING_APPROVAL',
      });

      await expect(
        service.calculateRun(mockAdminUser, 'run-1'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('submitRunForApproval', () => {
    it('should route run to Approvals Engine and transition to PENDING_APPROVAL', async () => {
      prismaMock.payrollRun.findFirst.mockResolvedValue({
        id: 'run-1',
        status: 'CALCULATED',
        totalNet: 414000,
      });
      approvalsServiceMock.submitRequest.mockResolvedValue({
        approvalRequest: { id: 'appr-run-1', status: 'PENDING' },
      });
      prismaMock.payrollRun.update.mockResolvedValue({
        id: 'run-1',
        status: 'PENDING_APPROVAL',
      });

      const result = await service.submitRunForApproval(mockAdminUser, 'run-1');

      expect(approvalsServiceMock.submitRequest).toHaveBeenCalledWith(
        mockAdminUser,
        expect.objectContaining({
          type: 'PAYROLL',
          subjectTable: 'payroll_run',
          subjectId: 'run-1',
          amountSnapshot: 414000,
        }),
      );
      expect(result.payrollRun.status).toBe('PENDING_APPROVAL');
    });
  });

  describe('fundingCheck', () => {
    it('should update state to FUNDING_CHECK_PASSED when confirmed is true', async () => {
      prismaMock.payrollRun.findFirst.mockResolvedValue({
        id: 'run-1',
        status: 'APPROVED',
      });
      prismaMock.payrollRun.update.mockResolvedValue({
        id: 'run-1',
        status: 'FUNDING_CHECK_PASSED',
      });

      const result = await service.fundingCheck(mockAdminUser, 'run-1', {
        confirmed: true,
      });

      expect(result.payrollRun.status).toBe('FUNDING_CHECK_PASSED');
    });

    it('should update state to FUNDING_SHORTFALL when confirmed is false', async () => {
      prismaMock.payrollRun.findFirst.mockResolvedValue({
        id: 'run-1',
        status: 'APPROVED',
      });
      prismaMock.payrollRun.update.mockResolvedValue({
        id: 'run-1',
        status: 'FUNDING_SHORTFALL',
      });

      const result = await service.fundingCheck(mockAdminUser, 'run-1', {
        confirmed: false,
      });

      expect(result.payrollRun.status).toBe('FUNDING_SHORTFALL');
    });
  });

  describe('executePayment', () => {
    it('should transition status to EXECUTED and return export batch', async () => {
      prismaMock.payrollRun.findFirst.mockResolvedValue({
        id: 'run-1',
        status: 'FUNDING_CHECK_PASSED',
        totalNet: 414000,
        items: [
          {
            employeeId: 'emp-1',
            netSalary: 414000,
            employee: { fullName: 'John Doe' },
          },
        ],
      });
      prismaMock.payrollRun.update.mockResolvedValue({
        id: 'run-1',
        status: 'EXECUTED',
        executedAt: new Date(),
      });

      const result = await service.executePayment(mockAdminUser, 'run-1');

      expect(result.payrollRun.status).toBe('EXECUTED');
      expect(result.paymentExportBatch.employeeTransfers).toHaveLength(1);
    });
  });

  describe('reconcileRun', () => {
    it('should transition status to RECONCILED', async () => {
      prismaMock.payrollRun.findFirst.mockResolvedValue({
        id: 'run-1',
        status: 'EXECUTED',
      });
      prismaMock.payrollRun.update.mockResolvedValue({
        id: 'run-1',
        status: 'RECONCILED',
        reconciledAt: new Date(),
      });

      const result = await service.reconcileRun(mockAdminUser, 'run-1');

      expect(result.payrollRun.status).toBe('RECONCILED');
    });
  });
});
