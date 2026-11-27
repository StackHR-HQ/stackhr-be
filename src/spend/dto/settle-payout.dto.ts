import { IsBoolean, IsOptional } from 'class-validator';

export class SettlePayoutDto {
  @IsOptional()
  @IsBoolean()
  manualSettlement?: boolean;
}
