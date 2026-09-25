import {
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

export class SetCompensationDto {
  @IsUUID('4', { message: 'employeeId must be a valid UUID' })
  @IsNotEmpty({ message: 'employeeId is required' })
  employeeId!: string;

  @IsInt({
    message:
      'basicSalary must be an integer (in minor currency units e.g. kobo)',
  })
  @Min(0, { message: 'basicSalary cannot be negative' })
  basicSalary!: number;

  @IsOptional()
  @IsInt({ message: 'housingAllowance must be an integer' })
  @Min(0, { message: 'housingAllowance cannot be negative' })
  housingAllowance?: number;

  @IsOptional()
  @IsInt({ message: 'transportAllowance must be an integer' })
  @Min(0, { message: 'transportAllowance cannot be negative' })
  transportAllowance?: number;

  @IsOptional()
  @IsInt({ message: 'otherAllowances must be an integer' })
  @Min(0, { message: 'otherAllowances cannot be negative' })
  otherAllowances?: number;

  @IsOptional()
  @IsDateString(
    {},
    { message: 'effectiveFrom must be a valid ISO date string' },
  )
  effectiveFrom?: string;

  @IsOptional()
  @IsString({ message: 'currency must be a string' })
  currency?: string;

  @IsOptional()
  @IsString({ message: 'paymentFrequency must be a string' })
  paymentFrequency?: string;
}
