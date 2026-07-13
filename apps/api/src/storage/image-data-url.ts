import { BadRequestException } from '@nestjs/common';
import { extname } from 'node:path';

export interface ParsedImageDataUrl {
  mimeType: string;
  buffer: Buffer;
  sizeBytes: number;
}

export function parseImageDataUrl(dataUrl: string): ParsedImageDataUrl {
  const matchResult = /^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i.exec(dataUrl.trim());
  if (matchResult === null) {
    throw new BadRequestException('La imagen enviada no tiene un data URL valido.');
  }

  const [, mimeType, base64Payload] = matchResult;
  const normalizedMimeType = mimeType.toLowerCase();

  if (!SUPPORTED_IMAGE_MIME_TYPES.has(normalizedMimeType)) {
    throw new BadRequestException(`Tipo de imagen no soportado: ${normalizedMimeType}`);
  }

  const buffer = Buffer.from(base64Payload, 'base64');
  if (buffer.byteLength === 0) {
    throw new BadRequestException('La imagen enviada esta vacia.');
  }

  return {
    mimeType: normalizedMimeType,
    buffer,
    sizeBytes: buffer.byteLength,
  };
}

export function extensionFromMimeType(mimeType: string): string {
  switch (mimeType) {
    case 'image/jpeg':
      return 'jpg';
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    case 'image/avif':
      return 'avif';
    default:
      return extname(mimeType).replace('.', '') || 'bin';
  }
}

const SUPPORTED_IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
]);
