import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CreateActionDto {
  @IsUUID()
  moduleId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  key?: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;
}
