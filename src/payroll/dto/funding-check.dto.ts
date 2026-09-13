import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class FundingCheckDto {
  @IsBoolean({ message: 'confirmed must be a boolean' })
  @IsNotEmpty({ message: 'confirmed is required' })
  confirmed!: boolean;

  @IsOptional()
  @IsString({ message: 'notes must be a string' })
  notes?: string;
}
