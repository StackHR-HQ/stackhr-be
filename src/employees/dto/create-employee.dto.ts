import {
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreateEmployeeDto {
  @IsString()
  @IsNotEmpty()
  fullName: string;

  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty()
  department: string;

  @IsString()
  @IsNotEmpty()
  jobTitle: string;

  @IsString()
  @IsNotEmpty()
  employmentType: string;

  @IsInt()
  @Min(0)
  salaryAmount: number;

  @IsString()
  @IsNotEmpty()
  startDate: string;

  @IsString()
  @IsOptional()
  managerId?: string;

  @IsInt()
  @Min(0)
  @IsOptional()
  declaredRent?: number;

  @IsOptional()
  nhfOptIn?: boolean;
}
