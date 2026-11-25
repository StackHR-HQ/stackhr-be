import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';

export class RevokeSessionsQueryDto {
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  excludeCurrent?: boolean;
}
