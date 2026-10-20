import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreateLeaveTypeDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsInt()
  @Min(1)
  @IsOptional()
  daysPerYear?: number;

  @IsInt()
  @Min(1)
  @IsOptional()
  defaultDays?: number;

  @IsBoolean()
  @IsOptional()
  paid?: boolean = true;

  @IsBoolean()
  @IsOptional()
  requiresApproval?: boolean = true;
}
