import {
  IsString,
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
import { TaxRuleBandDto } from './create-tax-rule-set.dto';

export class UpdateTaxRuleSetDto {
  @IsString()
  @IsOptional()
  country?: string;

  @IsString()
  @IsOptional()
  name?: string;

  @IsDateString()
  @IsOptional()
  effectiveFrom?: string;

  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsDateString()
  effectiveTo?: string | null;

  @IsBoolean()
  @IsOptional()
  isDefault?: boolean;

  @IsNumber()
  @IsOptional()
  rentReliefPercentage?: number;

  @IsNumber()
  @IsOptional()
  rentReliefCap?: number;

  @IsNumber({}, { message: 'pensionEmployeeRate must be a valid number' })
  @IsOptional()
  @Min(0.08, {
    message:
      'Employee pension rate cannot be less than statutory minimum of 8% (0.08)',
  })
  pensionEmployeeRate?: number;

  @IsNumber({}, { message: 'pensionEmployerRate must be a valid number' })
  @IsOptional()
  @Min(0.1, {
    message:
      'Employer pension rate cannot be less than statutory minimum of 10% (0.10)',
  })
  pensionEmployerRate?: number;

  @IsString()
  @IsOptional()
  pensionBasisFields?: string;

  @IsNumber()
  @IsOptional()
  nhfRate?: number;

  @IsString()
  @IsOptional()
  nhfBasisField?: string;

  @IsNumber()
  @IsOptional()
  taxFreeThreshold?: number;

  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => TaxRuleBandDto)
  taxRules?: TaxRuleBandDto[];
}
