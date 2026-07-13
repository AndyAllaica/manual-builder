import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateManualStepDto {
  @IsOptional()
  @IsString()
  @MaxLength(180)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;
}
