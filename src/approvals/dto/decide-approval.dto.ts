import { IsIn, IsOptional, IsString } from 'class-validator';

export class DecideApprovalDto {
  @IsString()
  @IsIn(['APPROVED', 'REJECTED'], {
    message: 'status must be APPROVED or REJECTED',
  })
  status!: 'APPROVED' | 'REJECTED';

  @IsOptional()
  @IsString()
  rejectionReason?: string;
}
