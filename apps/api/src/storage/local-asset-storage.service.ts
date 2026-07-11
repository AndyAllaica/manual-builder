import { BadRequestException, Injectable, PayloadTooLargeException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, extname, resolve } from 'node:path';
import { posix as pathPosix } from 'node:path';
import { type AssetStorageProvider } from '../domain/manual-builder.types';

export interface StoredAssetMetadata {
  provider: AssetStorageProvider;
  mimeType: string;
  fileName: string;
  storagePath: string;
  publicUrl: string;
  sizeBytes: number;
}

@Injectable()
export class LocalAssetStorageService {
  constructor(private readonly configService: ConfigService) {}

  async saveCaptureAsset(input: {
    sessionId: string;
    kind: 'original' | 'context';
    dataUrl: string;
  }): Promise<StoredAssetMetadata> {
    const parsedDataUrl = parseImageDataUrl(input.dataUrl);
    const maxSizeBytes = this.getMaxAssetSizeBytes();

    if (parsedDataUrl.sizeBytes > maxSizeBytes) {
      throw new PayloadTooLargeException(
        `La imagen ${input.kind} supera el tamano maximo permitido de ${Math.round(maxSizeBytes / 1024 / 1024)} MB.`,
      );
    }

    const extension = extensionFromMimeType(parsedDataUrl.mimeType);
    const fileName = `${input.kind}-${Date.now()}-${randomUUID()}.${extension}`;
    const relativePath = pathPosix.join('captures', input.sessionId, fileName);
    const absolutePath = this.resolveAbsolutePath(relativePath);

    await mkdir(dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, parsedDataUrl.buffer);

    return {
      provider: 'local',
      mimeType: parsedDataUrl.mimeType,
      fileName,
      storagePath: relativePath,
      publicUrl: `${this.getAppPublicUrl()}/uploads/${relativePath}`,
      sizeBytes: parsedDataUrl.sizeBytes,
    };
  }

  async deleteStoredAsset(storagePath: string): Promise<void> {
    await rm(this.resolveAbsolutePath(storagePath), { force: true });
  }

  getStorageRoot(): string {
    const configuredRoot = this.configService.get<string>('STORAGE_ROOT', 'storage').trim();
    return resolve(__dirname, '..', '..', configuredRoot);
  }

  private resolveAbsolutePath(storagePath: string): string {
    return resolve(this.getStorageRoot(), ...storagePath.split('/'));
  }

  private getAppPublicUrl(): string {
    const configuredUrl = this.configService.get<string>('APP_PUBLIC_URL');
    if (configuredUrl !== undefined && configuredUrl.trim().length > 0) {
      return configuredUrl.replace(/\/+$/, '');
    }

    const port = this.configService.get<string>('PORT', '3001');
    return `http://localhost:${port}`;
  }

  private getMaxAssetSizeBytes(): number {
    const maxSizeMb = Number.parseInt(this.configService.get<string>('MAX_ASSET_SIZE_MB', '12'), 10);
    const sanitizedValue = Number.isFinite(maxSizeMb) && maxSizeMb > 0 ? maxSizeMb : 12;
    return sanitizedValue * 1024 * 1024;
  }
}

function parseImageDataUrl(dataUrl: string): {
  mimeType: string;
  buffer: Buffer;
  sizeBytes: number;
} {
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

function extensionFromMimeType(mimeType: string): string {
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
