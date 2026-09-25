import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { APPROVAL_TYPES } from './create-approval-request.dto';

export class ApprovalQueryDto {
  @IsOptional()
  @IsString()
  @IsIn(['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'])
  status?: string;

  @IsOptional()
  @IsString()
  @IsIn(APPROVAL_TYPES)
  type?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
