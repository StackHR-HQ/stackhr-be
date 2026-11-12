import { Test, TestingModule } from '@nestjs/testing';
import { ComplianceService } from './compliance.service';
import { PrismaService } from '../database/prisma.service';
import { USER_ROLES, USER_TYPES } from '../auth/auth.constants';
import type { AuthenticatedUser } from '../auth/auth.types';

describe('ComplianceService', () => {
  let service: ComplianceService;
  let prisma: PrismaService;

  const mockTaxRuleSet = {
    id: 'TRS-NTA-2026',
    country: 'NG',
    name: 'Nigeria Tax Act 2025/2026 (NTA)',
    effectiveFrom: new Date('2026-01-01'),
    effectiveTo: null,
    isDefault: true,
    rentReliefPercentage: 0.2,
    rentReliefCap: 500000,
    pensionEmployeeRate: 0.08,
    pensionEmployerRate: 0.1,
    pensionBasisFields: 'BASIC,HOUSING,TRANSPORT',
    nhfRate: 0.025,
    nhfBasisField: 'BASIC',
    taxFreeThreshold: 800000,
    taxRules: [
      {
        id: 'TR-1',
        bandOrder: 1,
        bandName: 'First ₦800k',
        lowerLimit: 0,
        upperLimit: 800000,
        taxRate: 0.0,
      },
      {
        id: 'TR-2',
        bandOrder: 2,
        bandName: 'Next ₦2.2m',
        lowerLimit: 800000,
        upperLimit: 3000000,
        taxRate: 0.15,
      },
      {
        id: 'TR-3',
        bandOrder: 3,
        bandName: 'Next ₦9.0m',
        lowerLimit: 3000000,
        upperLimit: 12000000,
        taxRate: 0.18,
      },
      {
        id: 'TR-4',
        bandOrder: 4,
        bandName: 'Next ₦13.0m',
        lowerLimit: 12000000,
        upperLimit: 25000000,
        taxRate: 0.21,
      },
      {
        id: 'TR-5',
        bandOrder: 5,
        bandName: 'Next ₦25.0m',
        lowerLimit: 25000000,
        upperLimit: 50000000,
        taxRate: 0.23,
      },
      {
        id: 'TR-6',
        bandOrder: 6,
        bandName: 'Above ₦50.0m',
        lowerLimit: 50000000,
        upperLimit: null,
        taxRate: 0.25,
      },
    ],
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ComplianceService,
        {
          provide: PrismaService,
          useValue: {
            taxRuleSet: {
              findFirst: jest.fn().mockResolvedValue(mockTaxRuleSet),
              findMany: jest.fn().mockResolvedValue([mockTaxRuleSet]),
              findUnique: jest.fn().mockResolvedValue(mockTaxRuleSet),
              create: jest.fn().mockResolvedValue(mockTaxRuleSet),
              update: jest.fn().mockResolvedValue(mockTaxRuleSet),
            },
            taxRule: {
              deleteMany: jest.fn().mockResolvedValue({ count: 6 }),
              createMany: jest.fn().mockResolvedValue({ count: 6 }),
            },
            employee: {
              findMany: jest.fn(),
            },
            $transaction: jest.fn((cb) => cb(prisma)),
          },
        },
      ],
    }).compile();

    service = module.get<ComplianceService>(ComplianceService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('calculatePayrollDeductions', () => {
    it('should correctly calculate NTA 2026 progressive PAYE, pension, and zero rent relief default', async () => {
      const result = await service.calculatePayrollDeductions({
        basicSalary: 500000, // Monthly
        housingAllowance: 300000,
        transportAllowance: 200000,
        otherAllowances: 0,
        declaredRent: 0, // Default 0
        nhfOptIn: false,
        periodDate: new Date('2026-02-01'),
      });

      // Gross Monthly: 500k + 300k + 200k = 1,000,000 (12m annual)
      expect(result.grossSalaryMonthly).toEqual(1000000);
      expect(result.annualBreakdown.annualGross).toEqual(12000000);

      // Pension 8%: 8% of 12m = 960,000 annual (80,000 monthly)
      expect(result.annualBreakdown.annualEmployeePension).toEqual(960000);
      expect(result.pensionDeductionMonthly).toEqual(80000);

      // Employer Pension 10%: 10% of 12m = 1,200,000 annual (100,000 monthly)
      expect(result.annualBreakdown.annualEmployerPension).toEqual(1200000);
      expect(result.employerPensionDeductionMonthly).toEqual(1000000 / 10);

      // Rent relief default: 0
      expect(result.annualBreakdown.annualRentRelief).toEqual(0);
      expect(result.rentReliefAppliedMonthly).toEqual(0);

      // Chargeable income: 12m - 960k = 11,040,000
      expect(result.annualBreakdown.annualChargeableIncome).toEqual(11040000);

      // PAYE Progressive calculation:
      // Band 1 (800k @ 0%): 0
      // Band 2 (2.2m @ 15%): 330,000
      // Band 3 (8.04m @ 18%): 1,447,200
      // Total PAYE: 1,777,200 annual -> 148,100 monthly
      expect(result.annualBreakdown.annualPayeTax).toEqual(1777200);
      expect(result.taxDeductionMonthly).toEqual(148100);
    });

    it('should apply capped Rent Relief when employee declares rent paid', async () => {
      const result = await service.calculatePayrollDeductions({
        basicSalary: 500000,
        housingAllowance: 300000,
        transportAllowance: 200000,
        otherAllowances: 0,
        declaredRent: 4000000, // 4m rent declared -> 20% is 800k, capped at 500k
        nhfOptIn: false,
      });

      expect(result.annualBreakdown.annualRentRelief).toEqual(500000);
    });

    it('should calculate NHF when opt-in is enabled', async () => {
      const result = await service.calculatePayrollDeductions({
        basicSalary: 500000, // Monthly Basic
        housingAllowance: 300000,
        transportAllowance: 200000,
        otherAllowances: 0,
        nhfOptIn: true, // 2.5% of basic (500,000 * 0.025 = 12,500)
      });

      expect(result.nhfDeductionMonthly).toEqual(12500);
    });
  });

  describe('seedNta2026RuleSet', () => {
    it('should return existing rule set if already seeded', async () => {
      const result = await service.seedNta2026RuleSet();
      expect(result).toEqual(mockTaxRuleSet);
    });
  });

  describe('createRuleSet band validation', () => {
    it('should reject non-contiguous bands', async () => {
      await expect(
        service.createRuleSet({
          name: 'Invalid Contiguity',
          effectiveFrom: '2026-01-01',
          taxRules: [
            {
              bandOrder: 1,
              bandName: 'Band 1',
              lowerLimit: 0,
              upperLimit: 800000,
              taxRate: 0,
            },
            {
              bandOrder: 2,
              bandName: 'Band 2',
              lowerLimit: 1000000, // Gap!
              upperLimit: null,
              taxRate: 0.15,
            },
          ],
        }),
      ).rejects.toThrow(
        'Tax bands must be contiguous without gaps or overlaps',
      );
    });

    it('should reject null upper limit on non-highest band', async () => {
      await expect(
        service.createRuleSet({
          name: 'Null on intermediate band',
          effectiveFrom: '2026-01-01',
          taxRules: [
            {
              bandOrder: 1,
              bandName: 'Band 1',
              lowerLimit: 0,
              upperLimit: null,
              taxRate: 0,
            },
            {
              bandOrder: 2,
              bandName: 'Band 2',
              lowerLimit: 800000,
              upperLimit: 2000000,
              taxRate: 0.15,
            },
          ],
        }),
      ).rejects.toThrow('Only the highest tax band');
    });

    it('should accept valid contiguous bands with null upper limit only on the last band', async () => {
      const result = await service.createRuleSet({
        name: 'Valid Bands',
        effectiveFrom: '2026-01-01',
        taxRules: [
          {
            bandOrder: 1,
            bandName: 'Band 1',
            lowerLimit: 0,
            upperLimit: 800000,
            taxRate: 0,
          },
          {
            bandOrder: 2,
            bandName: 'Band 2',
            lowerLimit: 800000,
            upperLimit: null,
            taxRate: 0.15,
          },
        ],
      });
      expect(result).toBeDefined();
    });
    it('should clamp pension rates to statutory minimums (8% employee, 10% employer)', async () => {
      // Pass sub-statutory overrides (e.g. 0.05 and 0.06)
      const result = await service.calculatePayrollDeductions({
        basicSalary: 600000,
        housingAllowance: 200000,
        transportAllowance: 100000,
        otherAllowances: 100000,
        pensionEmployeeRateOverride: 0.05, // Below 8% statutory minimum
        pensionEmployerRateOverride: 0.06, // Below 10% statutory minimum
      });

      // Annual pension basis: (600k + 200k + 100k) * 12 = 10,800,000
      // Clamped employee pension: 10,800,000 * 0.08 / 12 = 72,000
      // Clamped employer pension: 10,800,000 * 0.10 / 12 = 90,000
      expect(result.pensionDeductionMonthly).toBe(72000);
      expect(result.employerPensionDeductionMonthly).toBe(90000);
    });

    it('should allow pension rates higher than statutory minimums', async () => {
      const result = await service.calculatePayrollDeductions({
        basicSalary: 600000,
        housingAllowance: 200000,
        transportAllowance: 100000,
        otherAllowances: 100000,
        pensionEmployeeRateOverride: 0.1, // 10% (> 8%)
        pensionEmployerRateOverride: 0.15, // 15% (> 10%)
      });

      // Annual pension basis = 10,800,000
      // Employee pension: 10,800,000 * 0.10 / 12 = 90,000
      // Employer pension: 10,800,000 * 0.15 / 12 = 135,000
      expect(result.pensionDeductionMonthly).toBe(90000);
      expect(result.employerPensionDeductionMonthly).toBe(135000);
    });
  });

  describe('pension rate validation on rule sets', () => {
    it('rejects createRuleSet when pensionEmployeeRate is below 0.08', async () => {
      await expect(
        service.createRuleSet({
          name: 'Invalid Pension Rule Set',
          effectiveFrom: '2026-01-01',
          pensionEmployeeRate: 0.05,
          taxRules: [
            {
              bandOrder: 1,
              bandName: 'First 800k',
              lowerLimit: 0,
              upperLimit: null,
              taxRate: 0.0,
            },
          ],
        }),
      ).rejects.toThrow(
        'Employee pension rate cannot be less than statutory minimum of 8% (0.08)',
      );
    });

    it('rejects createRuleSet when pensionEmployerRate is below 0.10', async () => {
      await expect(
        service.createRuleSet({
          name: 'Invalid Pension Rule Set',
          effectiveFrom: '2026-01-01',
          pensionEmployerRate: 0.08,
          taxRules: [
            {
              bandOrder: 1,
              bandName: 'First 800k',
              lowerLimit: 0,
              upperLimit: null,
              taxRate: 0.0,
            },
          ],
        }),
      ).rejects.toThrow(
        'Employer pension rate cannot be less than statutory minimum of 10% (0.10)',
      );
    });

    it('rejects updateRuleSet when pensionEmployeeRate is below 0.08', async () => {
      (prisma.taxRuleSet.findUnique as jest.Mock).mockResolvedValue({
        id: 'TRS-1',
      });
      await expect(
        service.updateRuleSet('TRS-1', {
          pensionEmployeeRate: 0.04,
        }),
      ).rejects.toThrow(
        'Employee pension rate cannot be less than statutory minimum of 8% (0.08)',
      );
    });

    it('rejects updateRuleSet when pensionEmployerRate is below 0.10', async () => {
      (prisma.taxRuleSet.findUnique as jest.Mock).mockResolvedValue({
        id: 'TRS-1',
      });
      await expect(
        service.updateRuleSet('TRS-1', {
          pensionEmployerRate: 0.09,
        }),
      ).rejects.toThrow(
        'Employer pension rate cannot be less than statutory minimum of 10% (0.10)',
      );
    });
  });

  describe('getAlerts', () => {
    it('should return compliance alerts for organization', async () => {
      (prisma.employee.findMany as jest.Mock)
        .mockResolvedValueOnce([{ id: 'emp-1', fullName: 'No TIN' }])
        .mockResolvedValueOnce([{ id: 'emp-2', fullName: 'No RSA' }])
        .mockResolvedValueOnce([{ id: 'emp-3', fullName: 'No PFA' }]);

      const mockUser: AuthenticatedUser = {
        id: 'u-1',
        name: 'Admin User',
        email: 'admin@acme.com',
        userType: USER_TYPES.BUSINESS,
        role: USER_ROLES.BUSINESS_OWNER,
        organizationId: 'org-123',
      };

      const result = await service.getAlerts(mockUser);

      expect(result.alerts).toHaveLength(4); // MISSING_TAX_ID, MISSING_PENSION_RSA, MISSING_PFA_CODE, UPCOMING_STATUTORY_DEADLINE
      expect(result.alerts[0].count).toBe(1);
      expect(result.alerts[1].count).toBe(1);
      expect(result.alerts[2].count).toBe(1);
    });

    it('should exclude alerts when count is 0', async () => {
      (prisma.employee.findMany as jest.Mock)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const mockUser: AuthenticatedUser = {
        id: 'u-1',
        name: 'Admin User',
        email: 'admin@acme.com',
        userType: USER_TYPES.BUSINESS,
        role: USER_ROLES.BUSINESS_OWNER,
        organizationId: 'org-123',
      };

      const result = await service.getAlerts(mockUser);

      expect(result.alerts).toHaveLength(1);
      expect(result.alerts[0].type).toBe('UPCOMING_STATUTORY_DEADLINE');
    });
  });
});
