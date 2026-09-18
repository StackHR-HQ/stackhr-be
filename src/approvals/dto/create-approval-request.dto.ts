import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export const APPROVAL_TYPES = [
  'LEAVE',
  'EXPENSE',
  'REIMBURSEMENT',
  'SALARY_ADVANCE',
  'PAYROLL',
] as const;

export class CreateApprovalRequestDto {
  @IsString()
  @IsIn(APPROVAL_TYPES, {
    message:
      'type must be one of: LEAVE, EXPENSE, REIMBURSEMENT, SALARY_ADVANCE, PAYROLL',
  })
  type!: string;

  @IsString()
  @IsNotEmpty({ message: 'subjectTable is required' })
  subjectTable!: string;

  @IsString()
  @IsNotEmpty({ message: 'subjectId is required' })
  subjectId!: string;

  @IsOptional()
  @IsInt({ message: 'amountSnapshot must be a positive whole number' })
  @Min(1)
  amountSnapshot?: number;

  @IsOptional()
  @IsString()
  metadata?: string;
}
