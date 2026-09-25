import { IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateInvitationDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsOptional()
  role?: string = 'EMPLOYEE';

  @IsString()
  @IsOptional()
  department?: string;

  @IsString()
  @IsOptional()
  jobTitle?: string;
}
