import { IsBoolean, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class UpdateLeaveTypeDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsInt()
  @Min(1)
  @IsOptional()
  daysPerYear?: number;

  @IsBoolean()
  @IsOptional()
  paid?: boolean;

  @IsBoolean()
  @IsOptional()
  requiresApproval?: boolean;
}
