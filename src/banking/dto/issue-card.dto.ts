import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class IssueCardDto {
  @IsString()
  @IsNotEmpty()
  employeeId!: string;

  @IsInt()
  @Min(100)
  spendingLimitKobo!: number;

  @IsOptional()
  @IsEnum(['DAILY', 'WEEKLY', 'MONTHLY'])
  spendingInterval?: 'DAILY' | 'WEEKLY' | 'MONTHLY';

  @IsOptional()
  @IsEnum(['MASTERCARD', 'VERVE', 'VISA'])
  brand?: 'MASTERCARD' | 'VERVE' | 'VISA';
}
