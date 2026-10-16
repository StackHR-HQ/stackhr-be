import { Transform } from 'class-transformer';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { BadRequestException } from '@nestjs/common';

export class UpdatePensionConfigDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  penCentralEmployerCode: string;
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
