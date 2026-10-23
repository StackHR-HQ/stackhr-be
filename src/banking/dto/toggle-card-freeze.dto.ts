import { IsEnum } from 'class-validator';

export class ToggleCardFreezeDto {
  @IsEnum(['FREEZE', 'UNFREEZE'])
  action!: 'FREEZE' | 'UNFREEZE';
}
