import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateMeOnboardingItemDto {
  @IsOptional()
  @IsBoolean()
  completed?: boolean;
}
