import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

/** The invitation, not the request, decides which email the account uses. */
export class AcceptInvitationDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  token: string;

  /** A new password, or the current one when the email already has an account. */
  @IsString()
  @MinLength(12)
  @MaxLength(128)
  password: string;
}
