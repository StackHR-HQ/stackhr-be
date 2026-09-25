import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Min,
} from 'class-validator';

export class CreateExpenseDto {
  @IsString()
  @IsNotEmpty()
  category: string;

  @IsInt()
  @Min(1)
  amount: number;

  @IsString()
  @IsOptional()
  currency?: string = 'NGN';

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  @IsUrl()
  receiptUrl?: string;
}
