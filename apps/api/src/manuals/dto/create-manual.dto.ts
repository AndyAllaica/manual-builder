import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CreateManualDto {
  @IsUUID()
  actionId!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(180)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  createdBy!: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  versionLabel?: string;
}
