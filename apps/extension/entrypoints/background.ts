import {
  CAPTURE_IMAGE_FORMAT,
  CAPTURE_IMAGE_QUALITY,
  createCapturedSelectionRecord,
  isClearCapturesMessage,
  isSelectionCapturedMessage,
  trimCapturesForStorage,
  type SelectedElementData,
} from '../lib/manual-builder';
import { loadPanelState, resetPanelState, savePanelState } from '../lib/panel-state';

const SIDE_PANEL_PATH = 'sidepanel.html';
const CAPTURE_ERROR_PREFIX = '[Manual Builder] No se pudo generar la captura';

let captureQueue: Promise<void> = Promise.resolve();

export default defineBackground({
  type: 'module',
  main() {
    void configureSidePanelBehavior();
    void recoverPendingState();

    browser.runtime.onInstalled.addListener(() => {
      void configureSidePanelBehavior();
    });

    browser.runtime.onMessage.addListener((message, sender) => {
      if (isSelectionCapturedMessage(message)) {
        enqueueCaptureTask(() => processSelection(message.payload, sender));
        return;
      }

      if (isClearCapturesMessage(message)) {
        enqueueCaptureTask(async () => {
          await resetPanelState();
        });
      }
    });
  },
});

function enqueueCaptureTask(task: () => Promise<void>): void {
  captureQueue = captureQueue
    .catch(() => undefined)
    .then(task)
    .catch((error: unknown) => {
      console.error(CAPTURE_ERROR_PREFIX, error);
    });
}

async function configureSidePanelBehavior(): Promise<void> {
  const sidePanelApi = browser.sidePanel;
  if (sidePanelApi === undefined) {
    return;
  }

  try {
    await sidePanelApi.setPanelBehavior({
      openPanelOnActionClick: true,
    });
  } catch (error) {
    console.warn('[Manual Builder] No se pudo configurar la apertura del side panel.', error);
  }
}

async function recoverPendingState(): Promise<void> {
  const currentState = await loadPanelState();
  if (currentState.status !== 'capturing') {
    return;
  }

  await savePanelState({
    ...currentState,
    status: currentState.captures.length > 0 ? 'ready' : 'idle',
    pendingSelection: null,
    lastError: 'La extensión se reinició mientras se estaba capturando la pestaña visible.',
    lastUpdatedAt: new Date().toISOString(),
  });
}

async function processSelection(
  selectedElement: SelectedElementData,
  sender: Browser.runtime.MessageSender,
): Promise<void> {
  const currentState = await loadPanelState();
  const startedAt = new Date().toISOString();

  await savePanelState({
    ...currentState,
    status: 'capturing',
    pendingSelection: selectedElement,
    lastError: null,
    lastUpdatedAt: startedAt,
  });

  await openSidePanel(sender);

  try {
    const imageDataUrl = await captureVisibleTab(sender);
    const captureRecord = createCapturedSelectionRecord(
      selectedElement,
      imageDataUrl,
      sender.tab?.id ?? null,
      sender.tab?.windowId ?? null,
    );

    const nextCaptures = trimCapturesForStorage([captureRecord, ...currentState.captures]);

    await savePanelState({
      status: 'ready',
      captures: nextCaptures,
      pendingSelection: null,
      lastError: null,
      lastUpdatedAt: captureRecord.createdAt,
    });
  } catch (error) {
    await savePanelState({
      ...currentState,
      status: 'error',
      pendingSelection: null,
      lastError: getErrorMessage(error),
      lastUpdatedAt: new Date().toISOString(),
    });
  }
}

async function openSidePanel(sender: Browser.runtime.MessageSender): Promise<void> {
  const sidePanelApi = browser.sidePanel;
  const windowId = sender.tab?.windowId;

  if (sidePanelApi === undefined || windowId === undefined) {
    return;
  }

  try {
    await sidePanelApi.setOptions({
      enabled: true,
      path: SIDE_PANEL_PATH,
    });
    await sidePanelApi.open({ windowId });
  } catch (error) {
    console.warn('[Manual Builder] No se pudo abrir el side panel automáticamente.', error);
  }
}

async function captureVisibleTab(sender: Browser.runtime.MessageSender): Promise<string> {
  const windowId = sender.tab?.windowId;
  if (windowId === undefined) {
    throw new Error('No se pudo determinar la ventana activa para capturar la pestaña.');
  }

  return browser.tabs.captureVisibleTab(windowId, {
    format: CAPTURE_IMAGE_FORMAT,
    quality: CAPTURE_IMAGE_QUALITY,
  });
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return 'Se produjo un error desconocido al capturar la pestaña visible.';
}
