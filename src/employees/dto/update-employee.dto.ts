import { IsEmail, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class UpdateEmployeeDto {
  @IsString()
  @IsOptional()
  fullName?: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  department?: string;

  @IsString()
  @IsOptional()
  jobTitle?: string;

  @IsString()
  @IsOptional()
  employmentType?: string;

  @IsInt()
  @Min(0)
  @IsOptional()
  salaryAmount?: number;

  @IsString()
  @IsOptional()
  startDate?: string;

  @IsString()
  @IsOptional()
  managerId?: string;

  @IsString()
  @IsOptional()
  status?: string;

  @IsInt()
  @Min(0)
  @IsOptional()
  declaredRent?: number;

  @IsOptional()
  nhfOptIn?: boolean;
}
