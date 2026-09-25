import {
  IsString,
  IsNotEmpty,
  IsDateString,
  IsOptional,
  IsBoolean,
  IsNumber,
  IsArray,
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

  @IsNumber()
  @IsOptional()
  upperLimit?: number;

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

  @IsDateString()
  @IsOptional()
  effectiveTo?: string;

  @IsBoolean()
  @IsOptional()
  isDefault?: boolean = true;

  @IsNumber()
  @IsOptional()
  rentReliefPercentage?: number = 0.2;

  @IsNumber()
  @IsOptional()
  rentReliefCap?: number = 500000;

  @IsNumber()
  @IsOptional()
  pensionEmployeeRate?: number = 0.08;

  @IsNumber()
  @IsOptional()
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
