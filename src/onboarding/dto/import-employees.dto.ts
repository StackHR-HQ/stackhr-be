import { IsNotEmpty, IsString } from 'class-validator';

export class ImportEmployeesDto {
  @IsString()
  @IsNotEmpty({ message: 'csv is required' })
  csv!: string;
}
