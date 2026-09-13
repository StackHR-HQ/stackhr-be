import { IsOptional, IsString } from 'class-validator';

export class ReassignManagerDto {
  @IsString()
  @IsOptional()
  managerId?: string | null;
}
