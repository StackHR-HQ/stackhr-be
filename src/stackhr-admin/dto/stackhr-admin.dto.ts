import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

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
  @IsEnum(['STARTER', 'GROWTH', 'ENTERPRISE'])
  planId?: 'STARTER' | 'GROWTH' | 'ENTERPRISE';

  @IsOptional()
  @IsEnum(['trial', 'active', 'past_due', 'cancelled', 'expired'])
  status?: 'trial' | 'active' | 'past_due' | 'cancelled' | 'expired';

  @IsOptional()
  @IsEnum(['MONTHLY', 'ANNUAL'])
  billingCycle?: 'MONTHLY' | 'ANNUAL';
}

export class DecideKybDto {
  @IsEnum(['APPROVED', 'REJECTED', 'VERIFIED'])
  decision!: 'APPROVED' | 'REJECTED' | 'VERIFIED';

  @IsOptional()
  @IsString()
  @MaxLength(1000)
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
  @IsString()
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
