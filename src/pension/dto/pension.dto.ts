import { Transform } from 'class-transformer';
import {
  IsOptional,
  IsString,
  IsNumber,
  Min,
  ValidateIf,
  Matches,
  MaxLength,
} from 'class-validator';
import { BadRequestException } from '@nestjs/common';

export class UpdatePensionConfigDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  penCentralEmployerCode?: string;

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
}

export class UpdatePensionRatesDto {
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
}

export class ValidateEmployerCodeDto {
  @IsOptional()
  @IsString()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @Matches(/^PR\d{8,12}$/i, {
    message: 'Employer code must follow PenCom format (e.g. PR0000126311)',
  })
  employerCode?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @Matches(/^PR\d{8,12}$/i, {
    message: 'Employer code must follow PenCom format (e.g. PR0000126311)',
  })
  employer_code?: string;

  getCode(): string {
    const code = this.employerCode || this.employer_code;
    if (!code) {
      throw new BadRequestException('employerCode is required');
    }
    return code;
  }
}

export class AttachEmployerDto {
  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  validationId?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  validation_id?: string;

  getValidationId(): string {
    const id = this.validationId || this.validation_id;
    if (!id) {
      throw new BadRequestException('validationId is required');
    }
    return id;
  }
}

export class PensionScheduleQueryDto {
  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  periodYear?: string;
}
