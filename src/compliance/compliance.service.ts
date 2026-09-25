import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { CreateTaxRuleSetDto } from './dto/create-tax-rule-set.dto';
import { UpdateTaxRuleSetDto } from './dto/update-tax-rule-set.dto';

export interface CalculateDeductionsParams {
  basicSalary: number; // Monthly in kobo/units
  housingAllowance: number;
  transportAllowance: number;
  otherAllowances: number;
  declaredRent?: number; // Annual declared rent
  nhfOptIn?: boolean;
  pensionEmployeeRateOverride?: number;
  pensionEmployerRateOverride?: number;
  pensionBasisOverride?: string;
  periodDate?: Date;
}

export interface PayrollDeductionsResult {
  grossSalaryMonthly: number;
  taxDeductionMonthly: number;
  pensionDeductionMonthly: number;
  employerPensionDeductionMonthly: number;
  nhfDeductionMonthly: number;
  rentReliefAppliedMonthly: number;
  annualBreakdown: {
    annualGross: number;
    annualEmployeePension: number;
    annualEmployerPension: number;
    annualNhf: number;
    annualRentRelief: number;
    annualChargeableIncome: number;
    annualPayeTax: number;
  };
  ruleSetId: string;
}

@Injectable()
export class ComplianceService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Resolves the tax rule set active for a given country and date.
   */
  async getEffectiveTaxRuleSet(
    country: string = 'NG',
    date: Date = new Date(),
  ) {
    const activeRuleSet = await this.prisma.taxRuleSet.findFirst({
      where: {
        country,
        effectiveFrom: { lte: date },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: date } }],
      },
      include: {
        taxRules: {
          orderBy: { bandOrder: 'asc' },
        },
      },
      orderBy: { effectiveFrom: 'desc' },
    });

    if (activeRuleSet) {
      return activeRuleSet;
    }

    // Fallback: seed NTA 2026 default rule set if none exists
    return this.seedNta2026RuleSet();
  }

  /**
   * Executes statutory calculation pipeline for an employee's compensation.
   */
  async calculatePayrollDeductions(
    params: CalculateDeductionsParams,
  ): Promise<PayrollDeductionsResult> {
    const periodDate = params.periodDate || new Date();
    const ruleSet = await this.getEffectiveTaxRuleSet('NG', periodDate);

    const monthlyBasic = params.basicSalary || 0;
    const monthlyHousing = params.housingAllowance || 0;
    const monthlyTransport = params.transportAllowance || 0;
    const monthlyOther = params.otherAllowances || 0;

    const monthlyGross =
      monthlyBasic + monthlyHousing + monthlyTransport + monthlyOther;

    // Annualized values
    const annualBasic = monthlyBasic * 12;
    const annualHousing = monthlyHousing * 12;
    const annualTransport = monthlyTransport * 12;
    const annualGross = monthlyGross * 12;

    // Pension calculation
    const pensionEmpRate =
      params.pensionEmployeeRateOverride ?? ruleSet.pensionEmployeeRate;
    const pensionEmprRate =
      params.pensionEmployerRateOverride ?? ruleSet.pensionEmployerRate;
    const pensionBasisConfig = (
      params.pensionBasisOverride || ruleSet.pensionBasisFields
    ).toUpperCase();

    let annualPensionBasis = 0;
    if (pensionBasisConfig.includes('BASIC')) annualPensionBasis += annualBasic;
    if (pensionBasisConfig.includes('HOUSING'))
      annualPensionBasis += annualHousing;
    if (pensionBasisConfig.includes('TRANSPORT'))
      annualPensionBasis += annualTransport;

    const annualEmployeePension = Math.round(
      annualPensionBasis * pensionEmpRate,
    );
    const annualEmployerPension = Math.round(
      annualPensionBasis * pensionEmprRate,
    );

    // NHF calculation
    const annualNhf = params.nhfOptIn
      ? Math.round(annualBasic * ruleSet.nhfRate)
      : 0;

    // Rent Relief calculation (replaces CRA under NTA 2026)
    const declaredRentAnnual = params.declaredRent || 0;
    const annualRentRelief =
      declaredRentAnnual > 0
        ? Math.min(
            Math.round(declaredRentAnnual * ruleSet.rentReliefPercentage),
            ruleSet.rentReliefCap,
          )
        : 0;

    // Annual Chargeable Income
    const annualChargeableIncome = Math.max(
      0,
      annualGross - annualEmployeePension - annualRentRelief,
    );

    // Progressive PAYE Tax Bands
    let annualPayeTax = 0;
    for (const rule of ruleSet.taxRules) {
      const lower = rule.lowerLimit;
      const upper = rule.upperLimit ?? Infinity;

      if (annualChargeableIncome > lower) {
        const taxableAmountInBand =
          Math.min(annualChargeableIncome, upper) - lower;
        annualPayeTax += taxableAmountInBand * rule.taxRate;
      }
    }

    annualPayeTax = Math.round(annualPayeTax);

    // Convert back to monthly (rounded to nearest integer/kobo)
    const taxDeductionMonthly = Math.round(annualPayeTax / 12);
    const pensionDeductionMonthly = Math.round(annualEmployeePension / 12);
    const employerPensionDeductionMonthly = Math.round(
      annualEmployerPension / 12,
    );
    const nhfDeductionMonthly = Math.round(annualNhf / 12);
    const rentReliefAppliedMonthly = Math.round(annualRentRelief / 12);

    return {
      grossSalaryMonthly: monthlyGross,
      taxDeductionMonthly,
      pensionDeductionMonthly,
      employerPensionDeductionMonthly,
      nhfDeductionMonthly,
      rentReliefAppliedMonthly,
      annualBreakdown: {
        annualGross,
        annualEmployeePension,
        annualEmployerPension,
        annualNhf,
        annualRentRelief,
        annualChargeableIncome,
        annualPayeTax,
      },
      ruleSetId: ruleSet.id,
    };
  }

  // --- StackHR Admin CRUD Operations ---

  async findAllRuleSets(country: string = 'NG') {
    return this.prisma.taxRuleSet.findMany({
      where: { country },
      include: {
        taxRules: {
          orderBy: { bandOrder: 'asc' },
        },
      },
      orderBy: { effectiveFrom: 'desc' },
    });
  }

  async findRuleSetById(id: string) {
    const ruleSet = await this.prisma.taxRuleSet.findUnique({
      where: { id },
      include: {
        taxRules: {
          orderBy: { bandOrder: 'asc' },
        },
      },
    });

    if (!ruleSet) {
      throw new NotFoundException(`Tax rule set with ID ${id} not found.`);
    }

    return ruleSet;
  }

  async createRuleSet(dto: CreateTaxRuleSetDto) {
    const { taxRules, ...ruleSetData } = dto;

    if (!taxRules || taxRules.length === 0) {
      throw new BadRequestException('At least one tax band rule is required.');
    }

    return this.prisma.taxRuleSet.create({
      data: {
        id: `TRS-${Date.now()}`,
        ...ruleSetData,
        effectiveFrom: new Date(ruleSetData.effectiveFrom),
        effectiveTo: ruleSetData.effectiveTo
          ? new Date(ruleSetData.effectiveTo)
          : null,
        taxRules: {
          create: taxRules.map((rule) => ({
            id: `TR-${Date.now()}-${rule.bandOrder}`,
            bandOrder: rule.bandOrder,
            bandName: rule.bandName,
            lowerLimit: rule.lowerLimit,
            upperLimit: rule.upperLimit,
            taxRate: rule.taxRate,
          })),
        },
      },
      include: {
        taxRules: {
          orderBy: { bandOrder: 'asc' },
        },
      },
    });
  }

  async updateRuleSet(id: string, dto: UpdateTaxRuleSetDto) {
    await this.findRuleSetById(id);

    const { taxRules, ...ruleSetData } = dto;

    return this.prisma.$transaction(async (tx) => {
      if (taxRules && taxRules.length > 0) {
        // Replace existing bands
        await tx.taxRule.deleteMany({ where: { taxRuleSetId: id } });
        await tx.taxRule.createMany({
          data: taxRules.map((rule) => ({
            id: `TR-${Date.now()}-${rule.bandOrder}`,
            taxRuleSetId: id,
            bandOrder: rule.bandOrder,
            bandName: rule.bandName,
            lowerLimit: rule.lowerLimit,
            upperLimit: rule.upperLimit,
            taxRate: rule.taxRate,
            createdAt: new Date(),
            updatedAt: new Date(),
          })),
        });
      }

      return tx.taxRuleSet.update({
        where: { id },
        data: {
          ...ruleSetData,
          effectiveFrom: ruleSetData.effectiveFrom
            ? new Date(ruleSetData.effectiveFrom)
            : undefined,
          effectiveTo: ruleSetData.effectiveTo
            ? new Date(ruleSetData.effectiveTo)
            : undefined,
        },
        include: {
          taxRules: {
            orderBy: { bandOrder: 'asc' },
          },
        },
      });
    });
  }

  /**
   * Seeds the default Nigeria Tax Act 2025/2026 rule set into database.
   */
  async seedNta2026RuleSet() {
    const existing = await this.prisma.taxRuleSet.findFirst({
      where: {
        name: 'Nigeria Tax Act 2025/2026 (NTA)',
      },
      include: {
        taxRules: { orderBy: { bandOrder: 'asc' } },
      },
    });

    if (existing) {
      return existing;
    }

    return this.prisma.taxRuleSet.create({
      data: {
        id: `TRS-NTA-2026`,
        country: 'NG',
        name: 'Nigeria Tax Act 2025/2026 (NTA)',
        effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
        isDefault: true,
        rentReliefPercentage: 0.2,
        rentReliefCap: 500000,
        pensionEmployeeRate: 0.08,
        pensionEmployerRate: 0.1,
        pensionBasisFields: 'BASIC,HOUSING,TRANSPORT',
        nhfRate: 0.025,
        nhfBasisField: 'BASIC',
        taxFreeThreshold: 800000,
        taxRules: {
          create: [
            {
              id: 'TR-NTA-1',
              bandOrder: 1,
              bandName: 'First ₦800,000',
              lowerLimit: 0,
              upperLimit: 800000,
              taxRate: 0.0,
            },
            {
              id: 'TR-NTA-2',
              bandOrder: 2,
              bandName: 'Next ₦2,200,000',
              lowerLimit: 800000,
              upperLimit: 3000000,
              taxRate: 0.15,
            },
            {
              id: 'TR-NTA-3',
              bandOrder: 3,
              bandName: 'Next ₦9,000,000',
              lowerLimit: 3000000,
              upperLimit: 12000000,
              taxRate: 0.18,
            },
            {
              id: 'TR-NTA-4',
              bandOrder: 4,
              bandName: 'Next ₦13,000,000',
              lowerLimit: 12000000,
              upperLimit: 25000000,
              taxRate: 0.21,
            },
            {
              id: 'TR-NTA-5',
              bandOrder: 5,
              bandName: 'Next ₦25,000,000',
              lowerLimit: 25000000,
              upperLimit: 50000000,
              taxRate: 0.23,
            },
            {
              id: 'TR-NTA-6',
              bandOrder: 6,
              bandName: 'Above ₦50,000,000',
              lowerLimit: 50000000,
              upperLimit: null,
              taxRate: 0.25,
            },
          ],
        },
      },
      include: {
        taxRules: {
          orderBy: { bandOrder: 'asc' },
        },
      },
    });
  }
}
