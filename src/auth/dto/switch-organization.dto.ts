import { IsNotEmpty, IsString } from 'class-validator';

export class SwitchOrganizationDto {
  @IsString()
  @IsNotEmpty({ message: 'organizationId is required' })
  organizationId!: string;
}
