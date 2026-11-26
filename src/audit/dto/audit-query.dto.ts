import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export const AUDIT_SOURCES = ['events', 'requests'] as const;
export type AuditSource = (typeof AUDIT_SOURCES)[number];

export class AuditQueryDto {
  @IsOptional()
  @IsIn(AUDIT_SOURCES, {
    message: `source must be one of: ${AUDIT_SOURCES.join(', ')}`,
  })
  source?: AuditSource;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsString()
  action?: string;

  @IsOptional()
  @IsString()
  resource?: string;

  @IsOptional()
  @IsString()
  actorId?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}
