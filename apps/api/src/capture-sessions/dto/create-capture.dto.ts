import { IsEnum, IsOptional, IsString, IsUrl, MaxLength, Matches } from 'class-validator';
import { type ManualImageFraming } from '../../domain/manual-builder.types';

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

  @Matches(/^data:image\/[a-z0-9.+-]+;base64,/i)
  originalImageDataUrl!: string;

  @IsOptional()
  @Matches(/^data:image\/[a-z0-9.+-]+;base64,/i)
  contextImageDataUrl?: string | null;
}
