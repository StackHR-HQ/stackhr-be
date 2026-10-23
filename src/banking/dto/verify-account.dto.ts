import { IsNotEmpty, IsString, Matches } from 'class-validator';
import { Transform } from 'class-transformer';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class VerifyAccountDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  bankCode: string;

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{10}$/, {
    message: 'accountNumber must be a 10-digit Nigerian NUBAN',
  })
  accountNumber: string;
}
