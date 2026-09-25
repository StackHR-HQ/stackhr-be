import { Test, TestingModule } from '@nestjs/testing';
import { ComplianceService } from './compliance.service';
import { PrismaService } from '../database/prisma.service';

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
});
