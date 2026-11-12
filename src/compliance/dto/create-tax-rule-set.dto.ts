import {
  IsString,
  IsNotEmpty,
  IsDateString,
  IsOptional,
  IsBoolean,
  IsNumber,
  IsArray,
  ValidateIf,
  ValidateNested,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class TaxRuleBandDto {
  @IsNumber()
  @Min(1)
  bandOrder: number;

  @IsString()
  @IsNotEmpty()
  bandName: string;

  @IsNumber()
  @Min(0)
  lowerLimit: number;

  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsNumber()
  upperLimit?: number | null;

  @IsNumber()
  @Min(0)
  taxRate: number; // e.g. 0.15 for 15%
}

export class CreateTaxRuleSetDto {
  @IsString()
  @IsOptional()
  country?: string = 'NG';

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsDateString()
  effectiveFrom: string;

  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsDateString()
  effectiveTo?: string | null;

  @IsBoolean()
  @IsOptional()
  isDefault?: boolean = true;

  @IsNumber()
  @IsOptional()
  rentReliefPercentage?: number = 0.2;

  @IsNumber()
  @IsOptional()
  rentReliefCap?: number = 500000;

  @IsNumber({}, { message: 'pensionEmployeeRate must be a valid number' })
  @IsOptional()
  @Min(0.08, {
    message:
      'Employee pension rate cannot be less than statutory minimum of 8% (0.08)',
  })
  pensionEmployeeRate?: number = 0.08;

  @IsNumber({}, { message: 'pensionEmployerRate must be a valid number' })
  @IsOptional()
  @Min(0.1, {
    message:
      'Employer pension rate cannot be less than statutory minimum of 10% (0.10)',
  })
  pensionEmployerRate?: number = 0.1;

  @IsString()
  @IsOptional()
  pensionBasisFields?: string = 'BASIC,HOUSING,TRANSPORT';

  @IsNumber()
  @IsOptional()
  nhfRate?: number = 0.025;

  @IsString()
  @IsOptional()
  nhfBasisField?: string = 'BASIC';

  @IsNumber()
  @IsOptional()
  taxFreeThreshold?: number = 800000;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TaxRuleBandDto)
  taxRules: TaxRuleBandDto[];
}
