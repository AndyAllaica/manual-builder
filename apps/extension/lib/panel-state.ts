import {
  PANEL_STATE_STORAGE_KEY,
  createEmptyPanelState,
  normalizePanelState,
  type CapturePanelState,
} from './manual-builder';
import { loadPendingCaptureImage, replacePendingCaptureImages } from './pending-capture-image-store';

type PanelStateStorageShape = {
  [PANEL_STATE_STORAGE_KEY]?: CapturePanelState;
};

export async function loadPanelState(): Promise<CapturePanelState> {
  const result = await browser.storage.session.get<PanelStateStorageShape>(PANEL_STATE_STORAGE_KEY);
  const storedState = normalizePanelState(result[PANEL_STATE_STORAGE_KEY] ?? createEmptyPanelState());
  const captures = await Promise.all(storedState.captures.map(async (capture) => ({
    ...capture,
    imageDataUrl: await loadPendingCaptureImage(capture.id) ?? capture.imageDataUrl,
  })));

  return normalizePanelState({
    ...storedState,
    captures: captures.filter((capture) => capture.imageDataUrl.length > 0),
  });
}

export async function savePanelState(state: CapturePanelState): Promise<void> {
  const normalizedState = normalizePanelState(state);
  await replacePendingCaptureImages(normalizedState.captures);
  await browser.storage.session.set<PanelStateStorageShape>({
    [PANEL_STATE_STORAGE_KEY]: {
      ...normalizedState,
      captures: normalizedState.captures.map((capture) => ({
        ...capture,
        imageDataUrl: '',
      })),
    },
  });
}

export async function resetPanelState(): Promise<void> {
  await savePanelState(createEmptyPanelState());
}
