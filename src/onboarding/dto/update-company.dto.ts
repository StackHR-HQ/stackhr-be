import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class UpdateCompanyDto {
  @IsString()
  @IsNotEmpty({ message: 'companyName is required' })
  companyName!: string;

  @IsString()
  @IsNotEmpty({ message: 'industry is required' })
  industry!: string;

  @IsString()
  @IsNotEmpty({ message: 'companySize is required' })
  companySize!: string;

  @IsOptional()
  @IsString()
  @IsIn(['NGN', 'USD', 'GBP', 'EUR'], {
    message: 'currency must be one of: NGN, USD, GBP, EUR',
  })
  currency?: string;

  @IsOptional()
  @IsString()
  @IsIn(['MONTHLY', 'BIWEEKLY', 'WEEKLY'], {
    message: 'payrollFrequency must be one of: MONTHLY, BIWEEKLY, WEEKLY',
  })
  payrollFrequency?: string;

  @IsOptional()
  @IsString()
  taxId?: string;

  @IsOptional()
  @IsString()
  logo?: string;

  @IsOptional()
  @IsString()
  logoDataUrl?: string;

  @IsOptional()
  @IsString()
  name?: string;
}
