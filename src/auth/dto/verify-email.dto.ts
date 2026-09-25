import { IsEmail, IsNotEmpty, IsString, Matches } from 'class-validator';

export class VerifyEmailDto {
  @IsEmail({}, { message: 'A valid email is required' })
  @IsNotEmpty()
  email!: string;

  @IsString()
  @Matches(/^\d{6}$/, { message: 'Verification code must be 6 digits' })
  code!: string;
}
