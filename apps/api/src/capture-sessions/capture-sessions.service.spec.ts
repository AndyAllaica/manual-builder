import { CaptureSessionsService } from './capture-sessions.service';
import { ManualBuilderRepository } from '../data/manual-builder.repository';
import { type AssetStorageService, type StoredAssetMetadata } from '../storage/asset-storage.types';

describe('CaptureSessionsService', () => {
  it('stores original and context assets when both images are provided', async () => {
    const originalAsset = createStoredAsset('original');
    const contextAsset = createStoredAsset('context');
    const repository = {
      ensureUserCanEditWorkspace: jest.fn().mockResolvedValue(undefined),
      getWorkspaceIdByCaptureSessionId: jest.fn().mockResolvedValue('workspace-id'),
      createCapture: jest.fn().mockResolvedValue({
        id: 'capture-id',
        originalAssetId: 'original-asset-id',
        contextAssetId: 'context-asset-id',
      }),
      findAssetById: jest.fn()
        .mockResolvedValueOnce({ id: 'original-asset-id', ...originalAsset })
        .mockResolvedValueOnce({ id: 'context-asset-id', ...contextAsset }),
    };
    const storage = {
      getProvider: jest.fn().mockReturnValue('onedrive-business'),
      saveCaptureAsset: jest.fn()
        .mockResolvedValueOnce(originalAsset)
        .mockResolvedValueOnce(contextAsset),
      deleteStoredAsset: jest.fn().mockResolvedValue(undefined),
    };
    const service = new CaptureSessionsService(
      repository as unknown as ManualBuilderRepository,
      storage as unknown as AssetStorageService,
    );

    const result = await service.createCapture(
      { id: 'user-id', username: 'tester', displayName: 'Tester' },
      'session-id',
      {
        selector: '#save',
        pageTitle: 'Pagina de prueba',
        pageUrl: 'https://example.test',
        selectedElementTag: 'button',
        textSnippet: 'Guardar',
        title: 'Guardar cambios',
        description: '',
        framing: 'full',
        selectionRect: { x: 120, y: 80, width: 240, height: 48 },
        viewport: { width: 1440, height: 900, devicePixelRatio: 1.25 },
        captureTarget: 'element',
        originalImageDataUrl: 'data:image/jpeg;base64,b3JpZ2luYWw=',
        contextImageDataUrl: 'data:image/webp;base64,Y29udGV4dA==',
      },
    );

    expect(storage.saveCaptureAsset).toHaveBeenNthCalledWith(1, {
      sessionId: 'session-id',
      kind: 'original',
      dataUrl: 'data:image/jpeg;base64,b3JpZ2luYWw=',
    });
    expect(storage.saveCaptureAsset).toHaveBeenNthCalledWith(2, {
      sessionId: 'session-id',
      kind: 'context',
      dataUrl: 'data:image/webp;base64,Y29udGV4dA==',
    });
    expect(repository.createCapture).toHaveBeenCalledWith(
      'session-id',
      expect.objectContaining({
        selectionRect: { x: 120, y: 80, width: 240, height: 48 },
        viewport: { width: 1440, height: 900, devicePixelRatio: 1.25 },
        captureTarget: 'element',
        originalAsset,
        contextAsset,
      }),
    );
    expect(result.contextAsset).toEqual(expect.objectContaining({ id: 'context-asset-id' }));
  });
});

function createStoredAsset(kind: 'original' | 'context'): StoredAssetMetadata {
  return {
    provider: 'onedrive-business',
    mimeType: kind === 'original' ? 'image/jpeg' : 'image/webp',
    fileName: `${kind}.img`,
    storagePath: `MANUAL_BUILDER/captures/session-id/${kind}.img`,
    publicUrl: `http://localhost:3001/api/v1/assets/onedrive/content?path=${kind}`,
    sizeBytes: 8,
  };
}
