import {
  IsString,
  IsDateString,
  IsOptional,
  IsBoolean,
  IsNumber,
  IsArray,
  ValidateNested,
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

  @IsDateString()
  @IsOptional()
  effectiveTo?: string;

  @IsBoolean()
  @IsOptional()
  isDefault?: boolean;

  @IsNumber()
  @IsOptional()
  rentReliefPercentage?: number;

  @IsNumber()
  @IsOptional()
  rentReliefCap?: number;

  @IsNumber()
  @IsOptional()
  pensionEmployeeRate?: number;

  @IsNumber()
  @IsOptional()
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
