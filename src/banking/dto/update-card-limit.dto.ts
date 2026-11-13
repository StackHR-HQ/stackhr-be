import { IsEnum, IsInt, IsOptional, Min } from 'class-validator';

export class UpdateCardLimitDto {
  @IsInt()
  @Min(100)
  spendingLimitKobo!: number;

  @IsOptional()
  @IsEnum(['DAILY', 'WEEKLY', 'MONTHLY'])
  spendingInterval?: 'DAILY' | 'WEEKLY' | 'MONTHLY';
}
