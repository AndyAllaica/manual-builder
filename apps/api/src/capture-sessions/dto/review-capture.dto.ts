import { IsEnum, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { type CaptureReviewStatus, type ManualImageFraming } from '../../domain/manual-builder.types';

export class ReviewCaptureDto {
  @IsEnum(['pending', 'approved', 'discarded'])
  status!: CaptureReviewStatus;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @IsOptional()
  @IsEnum(['context', 'full'])
  framing?: ManualImageFraming;

  @IsOptional()
  @Matches(/^data:image\/[a-z0-9.+-]+;base64,/i)
  contextImageDataUrl?: string | null;
}
