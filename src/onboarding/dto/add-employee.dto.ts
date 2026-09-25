import {
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class AddEmployeeDto {
  @IsString()
  @IsNotEmpty({ message: 'fullName is required' })
  fullName!: string;

  @IsEmail({}, { message: 'A valid employee email is required' })
  @IsNotEmpty()
  email!: string;

  @IsString()
  @IsNotEmpty({ message: 'department is required' })
  department!: string;

  @IsString()
  @IsNotEmpty({ message: 'jobTitle is required' })
  jobTitle!: string;

  @IsString()
  @IsNotEmpty({ message: 'employmentType is required' })
  employmentType!: string;

  @IsInt({ message: 'salary must be a positive whole number' })
  @Min(1, { message: 'salary must be a positive whole number' })
  salary!: number;

  @IsString()
  @IsNotEmpty({ message: 'startDate must be a valid date' })
  startDate!: string;

  @IsOptional()
  @IsString()
  id?: string;

  @IsOptional()
  @IsString()
  managerId?: string;

  @IsOptional()
  @IsString()
  managerName?: string;

  @IsOptional()
  @IsString()
  manager?: string;

  @IsOptional()
  @IsString()
  managerEmail?: string;
}
