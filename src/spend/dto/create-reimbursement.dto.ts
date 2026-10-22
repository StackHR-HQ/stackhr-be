import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

export class CreateReimbursementDto {
  @IsString()
  @IsOptional()
  expenseId?: string;

  @IsInt()
  @Min(1)
  amount: number;

  @IsString()
  @IsOptional()
  currency?: string = 'NGN';

  @IsString()
  @IsNotEmpty()
  description: string;
}
