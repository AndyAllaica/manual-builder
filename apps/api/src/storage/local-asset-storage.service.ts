import { Injectable, PayloadTooLargeException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { posix as pathPosix } from 'node:path';
import { extensionFromMimeType, parseImageDataUrl } from './image-data-url';
import { type AssetStorageService, type SaveCaptureAssetInput, type StoredAssetMetadata } from './asset-storage.types';

@Injectable()
export class LocalAssetStorageService implements AssetStorageService {
  constructor(private readonly configService: ConfigService) {}

  async saveCaptureAsset(input: SaveCaptureAssetInput): Promise<StoredAssetMetadata> {
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
