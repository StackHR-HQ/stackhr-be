import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @IsString()
  @IsNotEmpty({ message: 'Token is required' })
  token!: string;

  @IsString()
  @MinLength(12, { message: 'Password must be between 12 and 128 characters' })
  @MaxLength(128, { message: 'Password must be between 12 and 128 characters' })
  password!: string;

  @IsString()
  @IsNotEmpty({ message: 'Confirm password is required' })
  confirmPassword!: string;
}
