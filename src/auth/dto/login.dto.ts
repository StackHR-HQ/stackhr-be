import {
  IsEmail,
  IsNotEmpty,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class LoginDto {
  @IsEmail({}, { message: 'A valid email is required' })
  @IsNotEmpty()
  email!: string;

  @IsString()
  @MinLength(12, { message: 'Password must be between 12 and 128 characters' })
  @MaxLength(128, { message: 'Password must be between 12 and 128 characters' })
  password!: string;
}
