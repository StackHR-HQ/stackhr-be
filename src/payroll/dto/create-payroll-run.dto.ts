import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class CreatePayrollRunDto {
  @IsInt({ message: 'periodMonth must be an integer between 1 and 12' })
  @Min(1, { message: 'periodMonth must be at least 1' })
  @Max(12, { message: 'periodMonth cannot exceed 12' })
  @IsNotEmpty({ message: 'periodMonth is required' })
  periodMonth!: number;

  @IsInt({ message: 'periodYear must be a valid 4-digit year' })
  @Min(2020, { message: 'periodYear must be 2020 or later' })
  @Max(2100, { message: 'periodYear is invalid' })
  @IsNotEmpty({ message: 'periodYear is required' })
  periodYear!: number;

  @IsOptional()
  @IsString({ message: 'title must be a string' })
  title?: string;
}
