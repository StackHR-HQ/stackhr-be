import {
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
} from 'class-validator';

export class SendWaitlistLaunchEmailDto {
  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;

  @IsOptional()
  @IsEmail()
  testEmail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  testName?: string;

  @IsOptional()
  @IsUrl({ require_tld: false })
  signupUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  subject?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  customMessage?: string;
}
