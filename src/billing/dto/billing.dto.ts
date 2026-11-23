import { Transform } from 'class-transformer';
import {
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import type { BillingCycle } from '../domain/pricing';

const BILLING_CYCLES: BillingCycle[] = ['MONTHLY', 'ANNUAL'];
const upper = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;

export class SubscribeDto {
  @Transform(upper)
  @IsString()
  @MaxLength(32)
  @Matches(/^[A-Z_]+$/)
  planCode!: string;

  @Transform(upper)
  @IsIn(BILLING_CYCLES)
  billingCycle!: BillingCycle;
}

export class ChangePlanDto {
  @Transform(upper)
  @IsString()
  @MaxLength(32)
  @Matches(/^[A-Z_]+$/)
  planCode!: string;

  @IsOptional()
  @Transform(upper)
  @IsIn(BILLING_CYCLES)
  billingCycle?: BillingCycle;
}
