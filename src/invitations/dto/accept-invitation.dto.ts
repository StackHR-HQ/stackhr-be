import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class AcceptInvitationDto {
  @IsString()
  @IsNotEmpty()
  fullName: string;

  @IsString()
  @MinLength(8)
  @IsNotEmpty()
  password: string;
}
