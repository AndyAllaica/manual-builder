import { PANEL_STATE_STORAGE_KEY, createEmptyPanelState, type CapturePanelState } from './manual-builder';

type PanelStateStorageShape = {
  [PANEL_STATE_STORAGE_KEY]?: CapturePanelState;
};

export async function loadPanelState(): Promise<CapturePanelState> {
  const result = await browser.storage.session.get<PanelStateStorageShape>(PANEL_STATE_STORAGE_KEY);
  return result[PANEL_STATE_STORAGE_KEY] ?? createEmptyPanelState();
}

export async function savePanelState(state: CapturePanelState): Promise<void> {
  await browser.storage.session.set<PanelStateStorageShape>({
    [PANEL_STATE_STORAGE_KEY]: state,
  });
}

export async function resetPanelState(): Promise<void> {
  await savePanelState(createEmptyPanelState());
}
