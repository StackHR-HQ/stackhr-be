import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional } from 'class-validator';

export class ToggleCardFreezeDto {
  @Transform(({ value, obj }: { value: unknown; obj: Record<string, any> }) => {
    if (typeof value === 'string') return value.toUpperCase();
    if (typeof obj?.freeze === 'boolean') {
      return obj.freeze ? 'FREEZE' : 'UNFREEZE';
    }
    return value;
  })
  @IsOptional()
  @IsEnum(['FREEZE', 'UNFREEZE'])
  action?: 'FREEZE' | 'UNFREEZE';

  @IsOptional()
  @IsBoolean()
  freeze?: boolean;
}
