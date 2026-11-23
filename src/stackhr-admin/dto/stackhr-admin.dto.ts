import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { USER_ROLES } from '../../auth/auth.constants';

export class SuspendBusinessDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class ReactivateBusinessDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class UpdateBusinessStatusDto {
  @IsEnum(['active', 'trial', 'suspended', 'pending_verification', 'inactive'])
  status!:
    'active' | 'trial' | 'suspended' | 'pending_verification' | 'inactive';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class UpdateSubscriptionDto {
  @IsOptional()
  @IsString()
  planCode?: string;

  /** Backward-compatible alias for planCode */
  @IsOptional()
  @IsString()
  planId?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsEnum(['MONTHLY', 'ANNUAL'])
  billingCycle?: 'MONTHLY' | 'ANNUAL';

  @IsOptional()
  @IsBoolean()
  cancelAtPeriodEnd?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  extendGraceDays?: number;

  @IsOptional()
  @IsBoolean()
  customTerms?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  includedEmployees?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  baseFeeKobo?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  overageRateKobo?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  maxOverageEmployees?: number;
}

export class MarkInvoicePaidDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class VoidInvoiceDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class DecideKybDto {
  @IsEnum(['APPROVED', 'REJECTED', 'VERIFIED'])
  decision!: 'APPROVED' | 'REJECTED' | 'VERIFIED';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class KybActionDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class CreateAdminUserDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @IsEmail()
  @IsNotEmpty()
  email!: string;

  @IsOptional()
  @IsEnum(['STACKHR_ADMIN', 'STACKHR_SUPPORT'])
  role?: 'STACKHR_ADMIN' | 'STACKHR_SUPPORT';
}

export class UpdateAdminUserDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsIn([USER_ROLES.STACKHR_ADMIN, USER_ROLES.STACKHR_SUPPORT], {
    message: 'role must be either STACKHR_ADMIN or STACKHR_SUPPORT',
  })
  role?: string;

  @IsOptional()
  @IsBoolean()
  banned?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  banReason?: string;
}

export class CreateAnnouncementDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  message!: string;

  @IsOptional()
  @IsEnum(['INFO', 'WARNING', 'CRITICAL', 'MAINTENANCE'])
  severity?: 'INFO' | 'WARNING' | 'CRITICAL' | 'MAINTENANCE';

  @IsOptional()
  @IsString()
  targetOrganizationId?: string;
}

export class CreateSupportTicketDto {
  @IsString()
  @IsNotEmpty()
  organizationId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  subject!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  description!: string;

  @IsOptional()
  @IsEnum(['LOW', 'MEDIUM', 'HIGH', 'URGENT'])
  priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
}

export class UpdateSupportTicketDto {
  @IsOptional()
  @IsEnum(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'])
  status?: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';

  @IsOptional()
  @IsEnum(['LOW', 'MEDIUM', 'HIGH', 'URGENT'])
  priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  resolutionNote?: string;
}
