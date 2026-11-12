import {
  IsOptional,
  IsString,
  IsNumber,
  Min,
  ValidateIf,
} from 'class-validator';

export class UpdateOrganizationDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  industry?: string;

  @IsOptional()
  @IsString()
  companySize?: string;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsString()
  payrollFrequency?: string;

  @IsOptional()
  @IsNumber()
  payDate?: number;

  @IsOptional()
  @IsString()
  taxId?: string;

  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsNumber({}, { message: 'Employee pension rate must be a valid number' })
  @Min(0.08, {
    message:
      'Employee pension rate cannot be less than statutory minimum of 8% (0.08)',
  })
  pensionEmployeeRateOverride?: number | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsNumber({}, { message: 'Employer pension rate must be a valid number' })
  @Min(0.1, {
    message:
      'Employer pension rate cannot be less than statutory minimum of 10% (0.10)',
  })
  pensionEmployerRateOverride?: number | null;

  @IsOptional()
  @IsString({
    message:
      'Pension basis must be a string containing components (e.g. BASIC,HOUSING,TRANSPORT)',
  })
  pensionBasisOverride?: string | null;

  @IsOptional()
  @IsString()
  penCentralEmployerCode?: string | null;
}

