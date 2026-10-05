import {
  IsDateString,
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

/**
 * Fields an employee is allowed to update on their own profile via PATCH /me/profile.
 *
 * Admin-only fields (jobTitle, department, status, startDate, annualSalaryMinor,
 * employmentType, organizationId) are intentionally absent — the global whitelist
 * ValidationPipe will strip any non-declared fields.
 *
 * Sensitive fields (accountNumber, tin, pensionRsaNumber) must be routed through
 * the KeyProvider encryption utility once it is fully wired into this flow.
 */
export class UpdateMeProfileDto {
  // ── Personal information ─────────────────────────────────────────────────
  @IsOptional()
  @IsString()
  @MaxLength(100)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  lastName?: string;

  @IsOptional()
  @IsEmail()
  personalEmail?: string;

  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  gender?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  maritalStatus?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  nationality?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  avatarUrl?: string;

  // ── Emergency contact ────────────────────────────────────────────────────
  @IsOptional()
  @IsString()
  @MaxLength(150)
  emergencyContactName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  emergencyContactRelationship?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  emergencyContactPhone?: string;

  // ── Bank account details (sensitive — must be encrypted at rest) ─────────
  @IsOptional()
  @IsString()
  @MaxLength(100)
  bankName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  accountNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  accountName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4)
  bankAccountLast4?: string;

  // ── Tax / pension (sensitive — must be encrypted at rest) ────────────────
  @IsOptional()
  @IsString()
  @MaxLength(20)
  tin?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  pensionProvider?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  pensionRsaNumber?: string;
}
