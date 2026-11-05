import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateTeamDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsString()
  departmentId?: string | null;

  @IsOptional()
  @IsString()
  leadEmployeeId?: string | null;

  @IsOptional()
  @IsString()
  headEmployeeId?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(1000)
  @IsString({ each: true })
  memberIds?: string[];
}

export class UpdateTeamDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value,
  )
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name?: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsString()
  departmentId?: string | null;

  @IsOptional()
  @IsString()
  leadEmployeeId?: string | null;

  @IsOptional()
  @IsString()
  headEmployeeId?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(1000)
  @IsString({ each: true })
  memberIds?: string[];
}
