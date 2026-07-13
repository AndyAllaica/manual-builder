import { ConfigService } from '@nestjs/config';
import { OneDriveAssetStorageService } from './onedrive-asset-storage.service';
import { OneDriveFileService } from './onedrive-file.service';

describe('OneDriveAssetStorageService', () => {
  it('persiste una URL estable del backend y no la URL temporal de OneDrive', async () => {
    const oneDriveFileService = {
      uploadFile: jest.fn(async (input: { fileName: string; storagePath: string }) => ({
        fileName: input.fileName,
        storagePath: input.storagePath,
        publicUrl: 'https://sharepoint.example/download?tempauth=temporary',
      })),
      deleteFile: jest.fn(),
    } as unknown as OneDriveFileService;
    const configService = new ConfigService({
      APP_PUBLIC_URL: 'https://manuales.example.edu.ec',
      MAX_ASSET_SIZE_MB: '12',
      ONEDRIVE_ROOT_PATH: 'MANUAL_BUILDER',
    });
    const service = new OneDriveAssetStorageService(configService, oneDriveFileService);

    const asset = await service.saveCaptureAsset({
      sessionId: '5d3cc84d-f88f-4da3-8c23-e0a3be62fa34',
      kind: 'original',
      dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nWQAAAAASUVORK5CYII=',
    });

    expect(asset.provider).toBe('onedrive-business');
    expect(asset.storagePath).toMatch(/^MANUAL_BUILDER\/captures\//);
    expect(asset.publicUrl).toContain('https://manuales.example.edu.ec/api/v1/assets/onedrive/content?path=');
    expect(asset.publicUrl).not.toContain('tempauth');
  });
});
