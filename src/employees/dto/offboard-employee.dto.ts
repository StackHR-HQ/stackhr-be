import { IsOptional, IsString } from 'class-validator';

export class OffboardEmployeeDto {
  @IsString()
  @IsOptional()
  offboardDate?: string;

  @IsString()
  @IsOptional()
  reason?: string;
}
