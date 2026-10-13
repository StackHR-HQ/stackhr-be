import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdatePensionConfigDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  penCentralEmployerCode: string;
}

export class PensionScheduleQueryDto {
  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  periodYear?: string;
}
