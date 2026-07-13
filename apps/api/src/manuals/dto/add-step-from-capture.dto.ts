import { IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { type ManualImageFraming } from '../../domain/manual-builder.types';

export class AddStepFromCaptureDto {
  @IsUUID()
  captureId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(600)
  expectedResult?: string;

  @IsOptional()
  @IsEnum(['context', 'full'])
  framing?: ManualImageFraming;
}
