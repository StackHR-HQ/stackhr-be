import { IsEmail, IsNotEmpty, IsString } from 'class-validator';
import { Transform } from 'class-transformer';

export class JoinWaitlistDto {
  @IsString()
  @IsNotEmpty({ message: 'Name is required' })
  @Transform(({ value, obj }) => {
    const raw = value ?? obj?.fullName ?? obj?.Name;
    return typeof raw === 'string' ? raw.trim() : '';
  })
  name: string;

  @IsString()
  @IsNotEmpty({ message: 'Position is required' })
  @Transform(({ value, obj }) => {
    const raw = value ?? obj?.jobTitle ?? obj?.Position;
    return typeof raw === 'string' ? raw.trim() : '';
  })
  position: string;

  @IsString()
  @IsNotEmpty({ message: 'Business Name is required' })
  @Transform(({ value, obj }) => {
    const raw =
      value ?? obj?.companyName ?? obj?.['Business Name'] ?? obj?.business_name;
    return typeof raw === 'string' ? raw.trim() : '';
  })
  businessName: string;

  @IsEmail({}, { message: 'A valid Business Email is required' })
  @IsNotEmpty({ message: 'Business Email is required' })
  @Transform(({ value, obj }) => {
    const raw =
      value ?? obj?.email ?? obj?.['Business Email'] ?? obj?.business_email;
    return typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  })
  businessEmail: string;
}
