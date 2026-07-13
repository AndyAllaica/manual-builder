import { type AssetStorageProvider } from '../domain/manual-builder.types';

export const ASSET_STORAGE_SERVICE = 'ASSET_STORAGE_SERVICE';

export interface SaveCaptureAssetInput {
  sessionId: string;
  kind: 'original' | 'context';
  dataUrl: string;
}

export interface StoredAssetMetadata {
  provider: AssetStorageProvider;
  mimeType: string;
  fileName: string;
  storagePath: string;
  publicUrl: string;
  sizeBytes: number;
}

export interface AssetStorageService {
  saveCaptureAsset(input: SaveCaptureAssetInput): Promise<StoredAssetMetadata>;
  deleteStoredAsset(storagePath: string): Promise<void>;
}
