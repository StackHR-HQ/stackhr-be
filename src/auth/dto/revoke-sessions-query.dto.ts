import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional } from 'class-validator';

const VALID_BOOLEAN_INPUTS = ['true', 'false', '1', '0', true, false] as const;

export class RevokeSessionsQueryDto {
  @IsOptional()
  @IsIn(VALID_BOOLEAN_INPUTS, {
    message: 'excludeCurrent must be a boolean (true, false, 1, or 0)',
  })
  @Transform(({ value }) => {
    if (value === 'true' || value === '1' || value === true) return true;
    if (value === 'false' || value === '0' || value === false) return false;
    return value;
  })
  @IsBoolean()
  excludeCurrent?: boolean;
}
