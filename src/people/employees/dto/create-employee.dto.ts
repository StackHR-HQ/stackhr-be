import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
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

export const EMPLOYMENT_TYPES = [
  'FULL_TIME',
  'PART_TIME',
  'CONTRACT',
  'INTERN',
] as const;
export const PAY_FREQUENCIES = ['MONTHLY', 'BIWEEKLY', 'WEEKLY'] as const;

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class EmployeePersonalDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  firstName: string;

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  lastName: string;

  @Transform(trim)
  @IsEmail()
  @MaxLength(254)
  workEmail: string;

  @IsOptional()
  @Matches(/^\+[1-9]\d{6,14}$/, {
    message: 'phone must be in international format, e.g. +2348012345678',
  })
  phone?: string;
}

export class EmployeeEmploymentDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  jobTitle: string;

  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @IsOptional()
  @IsUUID()
  managerId?: string;

  @IsIn(EMPLOYMENT_TYPES)
  employmentType: string;

  /** YYYY-MM-DD */
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'startDate must be YYYY-MM-DD' })
  @IsISO8601({ strict: true })
  startDate: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(150)
  workLocation?: string;
}

export class EmployeeCompensationDto {
  /** Annual salary in integer minor units of `currency`. */
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  annualSalaryMinor: number;

  @Matches(/^[A-Z]{3}$/, { message: 'currency must be an ISO 4217 code' })
  currency: string;

  @IsIn(PAY_FREQUENCIES)
  payFrequency: string;
}

export class CreateEmployeeDto {
  @ValidateNested()
  @Type(() => EmployeePersonalDto)
  personal: EmployeePersonalDto;

  @ValidateNested()
  @Type(() => EmployeeEmploymentDto)
  employment: EmployeeEmploymentDto;

  @ValidateNested()
  @Type(() => EmployeeCompensationDto)
  compensation: EmployeeCompensationDto;

  @IsOptional()
  @IsBoolean()
  sendInvitation?: boolean;
}
