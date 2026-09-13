import { IsBoolean, IsNotEmpty } from 'class-validator';

export class UpdateChecklistTaskDto {
  @IsBoolean()
  @IsNotEmpty()
  completed: boolean;
}
