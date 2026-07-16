import { Type } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  Matches,
  Min,
  ValidateNested,
} from 'class-validator';
import { type CaptureTarget, type ManualImageFraming } from '../../domain/manual-builder.types';

class CaptureSelectionRectDto {
  @IsNumber()
  x!: number;

  @IsNumber()
  y!: number;

  @IsNumber()
  @Min(0.01)
  width!: number;

  @IsNumber()
  @Min(0.01)
  height!: number;
}

class CaptureViewportDto {
  @IsNumber()
  @Min(0.01)
  width!: number;

  @IsNumber()
  @Min(0.01)
  height!: number;

  @IsNumber()
  @Min(0.01)
  devicePixelRatio!: number;
}

export class CreateCaptureDto {
  @IsString()
  @MaxLength(500)
  selector!: string;

  @IsString()
  @MaxLength(255)
  pageTitle!: string;

  @IsUrl({ require_tld: false })
  @MaxLength(500)
  pageUrl!: string;

  @IsString()
  @MaxLength(50)
  selectedElementTag!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  textSnippet?: string | null;

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
  @ValidateNested()
  @Type(() => CaptureSelectionRectDto)
  selectionRect?: CaptureSelectionRectDto | null;

  @IsOptional()
  @ValidateNested()
  @Type(() => CaptureViewportDto)
  viewport?: CaptureViewportDto | null;

  @IsOptional()
  @IsIn(['element', 'viewport'])
  captureTarget?: CaptureTarget;

  @Matches(/^data:image\/[a-z0-9.+-]+;base64,/i)
  originalImageDataUrl!: string;

  @IsOptional()
  @Matches(/^data:image\/[a-z0-9.+-]+;base64,/i)
  contextImageDataUrl?: string | null;
}
