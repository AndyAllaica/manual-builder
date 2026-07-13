import { Injectable, PayloadTooLargeException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { posix as pathPosix } from 'node:path';
import { type AssetStorageService, type SaveCaptureAssetInput, type StoredAssetMetadata } from './asset-storage.types';
import { extensionFromMimeType, parseImageDataUrl } from './image-data-url';
import { OneDriveFileService } from './onedrive-file.service';

@Injectable()
export class OneDriveAssetStorageService implements AssetStorageService {
  constructor(
    private readonly configService: ConfigService,
    private readonly oneDriveFileService: OneDriveFileService,
  ) {}

  getProvider() {
    return 'onedrive-business' as const;
  }

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
    const storagePath = this.buildStoragePath(input.sessionId, fileName);
    const uploadedFile = await this.oneDriveFileService.uploadFile({
      buffer: parsedDataUrl.buffer,
      mimeType: parsedDataUrl.mimeType,
      fileName,
      storagePath,
    });
    const finalStoragePath = uploadedFile.storagePath || storagePath;
    const finalFileName = uploadedFile.fileName ?? fileName;
    const finalPublicUrl = this.buildPublicAssetUrl(finalStoragePath);

    return {
      provider: 'onedrive-business',
      mimeType: parsedDataUrl.mimeType,
      fileName: finalFileName,
      storagePath: finalStoragePath,
      publicUrl: finalPublicUrl,
      sizeBytes: parsedDataUrl.sizeBytes,
    };
  }

  async deleteStoredAsset(storagePath: string): Promise<void> {
    await this.oneDriveFileService.deleteFile(storagePath);
  }

  private buildStoragePath(sessionId: string, fileName: string): string {
    return pathPosix.join(
      this.getRootPath(),
      'captures',
      sessionId,
      fileName,
    );
  }

  private getRootPath(): string {
    return (this.configService.get<string>('ONEDRIVE_ROOT_PATH') ?? 'MANUAL_BUILDER')
      .replace(/\\/g, '/')
      .replace(/\/{2,}/g, '/')
      .replace(/^\/+|\/+$/g, '')
      || 'MANUAL_BUILDER';
  }

  private getMaxAssetSizeBytes(): number {
    const maxSizeMb = Number.parseInt(this.configService.get<string>('MAX_ASSET_SIZE_MB', '16'), 10);
    const sanitizedValue = Number.isFinite(maxSizeMb) && maxSizeMb > 0 ? maxSizeMb : 16;
    return sanitizedValue * 1024 * 1024;
  }

  private buildPublicAssetUrl(storagePath: string): string {
    const configuredUrl = this.configService.get<string>('APP_PUBLIC_URL');
    const publicUrl = configuredUrl !== undefined && configuredUrl.trim().length > 0
      ? configuredUrl.trim().replace(/\/+$/, '')
      : `http://localhost:${this.configService.get<string>('PORT', '3001')}`;

    return `${publicUrl}/api/v1/assets/onedrive/content?path=${encodeURIComponent(storagePath)}`;
  }
}
