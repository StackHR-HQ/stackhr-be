import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class CreateSalaryAdvanceDto {
  @IsInt()
  @Min(1000)
  amount: number;

  @IsInt()
  @Min(1)
  repaymentMonths: number = 1;

  @IsString()
  @IsOptional()
  reason?: string;
}
