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

const PHONE_PATTERN = /^\+[1-9]\d{6,14}$/;
const PHONE_MESSAGE = 'must be in international format, e.g. +2348012345678';

export class EmergencyContactDto {
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name: string;

  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  relationship: string;

  @Matches(PHONE_PATTERN, { message: `phone ${PHONE_MESSAGE}` })
  phone: string;
}

export class UpdateEmployeePersonalDto {
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  firstName?: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  lastName?: string;

  @IsOptional()
  @Matches(PHONE_PATTERN, { message: `phone ${PHONE_MESSAGE}` })
  phone?: string;

  /** YYYY-MM-DD */
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'dateOfBirth must be YYYY-MM-DD' })
  @IsISO8601({ strict: true })
  dateOfBirth?: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(50)
  gender?: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(50)
  maritalStatus?: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(100)
  nationality?: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(500)
  address?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => EmergencyContactDto)
  emergencyContact?: EmergencyContactDto;
}

/**
 * Display metadata only. Full account numbers are never accepted here; they
 * go through the encrypted self-service payment-details flow.
 */
export class UpdateEmployeePaymentDto {
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  bankName: string;

  @Matches(/^\d{4}$/, { message: 'accountLast4 must be exactly 4 digits' })
  accountLast4: string;
}

/** PATCH accepts only the top-level sections being changed. */
export class UpdateEmployeeDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateEmployeePaymentDto)
  payment?: UpdateEmployeePaymentDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateEmployeePersonalDto)
  personal?: UpdateEmployeePersonalDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateEmployeeEmploymentDto)
  employment?: UpdateEmployeeEmploymentDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateEmployeeCompensationDto)
  compensation?: UpdateEmployeeCompensationDto;
}
