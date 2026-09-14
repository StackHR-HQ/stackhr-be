import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { PAY_FREQUENCIES } from './create-employee.dto';

const trimString = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class UpdateEmployeeEmploymentDto {
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  jobTitle?: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(150)
  workLocation?: string;

  /** `null` removes the employee's manager. */
  @IsOptional()
  @IsUUID()
  managerId?: string | null;
}

/** A compensation change is always a complete, dated entry in the history. */
export class UpdateEmployeeCompensationDto {
  /** Annual salary in integer minor units of `currency`. */
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  annualSalaryMinor: number;

  @Matches(/^[A-Z]{3}$/, { message: 'currency must be an ISO 4217 code' })
  currency: string;

  @IsIn(PAY_FREQUENCIES)
  payFrequency: string;

  /** YYYY-MM-DD */
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'effectiveDate must be YYYY-MM-DD',
  })
  @IsISO8601({ strict: true })
  effectiveDate: string;
}

/** PATCH accepts only the top-level sections being changed. */
export class UpdateEmployeeDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateEmployeeEmploymentDto)
  employment?: UpdateEmployeeEmploymentDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateEmployeeCompensationDto)
  compensation?: UpdateEmployeeCompensationDto;
}
