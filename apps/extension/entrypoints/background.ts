import {
  CAPTURE_IMAGE_FORMAT,
  CAPTURE_IMAGE_QUALITY,
  createCapturedSelectionRecord,
  isClearCapturesMessage,
  isGetCaptureModeMessage,
  isSelectionCapturedMessage,
  trimCapturesForStorage,
  type CapturePanelState,
  type ReviewSurface,
  type SelectedElementData,
  type SelectionCapturedResponse,
} from '../lib/manual-builder';
import { loadPanelState, savePanelState } from '../lib/panel-state';

const SIDE_PANEL_PATH = 'sidepanel.html';
const REVIEW_PAGE_PATH = '/sidepanel.html' as const;
const CAPTURE_ERROR_PREFIX = '[Manual Builder] No se pudo generar la captura';

interface SidePanelApi {
  setPanelBehavior(options: { openPanelOnActionClick: boolean }): Promise<void>;
  setOptions(options: { enabled?: boolean; path?: string }): Promise<void>;
  open(options: { tabId?: number; windowId?: number }): Promise<void>;
}

interface SidebarActionApi {
  open(): Promise<void>;
}

interface ReviewTarget {
  reviewSurface: ReviewSurface;
  reviewTabId: number | null;
}

type BrowserWithOptionalPanels = typeof browser & {
  sidePanel?: SidePanelApi;
  sidebarAction?: SidebarActionApi;
};

let captureQueue: Promise<void> = Promise.resolve();

export default defineBackground({
  type: 'module',
  main() {
    void configureSidePanelBehavior();
    void recoverPendingState();

    browser.runtime.onInstalled.addListener(() => {
      void configureSidePanelBehavior();
      void recoverPendingState();
    });

    browser.action.onClicked.addListener((tab) => {
      void handleActionClick(tab);
    });

    browser.runtime.onMessage.addListener((message, sender) => {
      if (isSelectionCapturedMessage(message)) {
        return enqueueCaptureTask(() => processSelection(message.payload, sender));
      }

      if (isGetCaptureModeMessage(message)) {
        return loadPanelState().then((state) => ({
          captureMode: state.captureMode,
        }));
      }

      if (isClearCapturesMessage(message)) {
        return enqueueCaptureTask(async () => {
          const currentState = await loadPanelState();

          await savePanelState({
            ...currentState,
            status: 'idle',
            captures: [],
            pendingSelection: null,
            lastError: null,
            lastUpdatedAt: new Date().toISOString(),
          });
        });
      }

      return undefined;
    });
  },
});

function enqueueCaptureTask<TResult>(task: () => Promise<TResult>): Promise<TResult> {
  const taskResult = captureQueue
    .catch(() => undefined)
    .then(task);

  captureQueue = taskResult
    .then(() => undefined)
    .catch((error: unknown) => {
      console.error(CAPTURE_ERROR_PREFIX, error);
    });

  return taskResult;
}

async function configureSidePanelBehavior(): Promise<void> {
  const sidePanelApi = getSidePanelApi();
  if (sidePanelApi === undefined) {
    return;
  }

  try {
    await sidePanelApi.setPanelBehavior({
      openPanelOnActionClick: true,
    });
  } catch (error) {
    console.warn('[Manual Builder] No se pudo configurar la apertura del panel lateral.', error);
  }
}

async function recoverPendingState(): Promise<void> {
  const currentState = await loadPanelState();
  const sanitizedReviewTarget = await sanitizeReviewTarget(currentState);

  if (currentState.status !== 'capturing' && reviewTargetsEqual(currentState, sanitizedReviewTarget)) {
    return;
  }

  if (currentState.status !== 'capturing') {
    await savePanelState({
      ...currentState,
      reviewSurface: sanitizedReviewTarget.reviewSurface,
      reviewTabId: sanitizedReviewTarget.reviewTabId,
    });
    return;
  }

  await savePanelState({
    ...currentState,
    status: currentState.captures.length > 0 ? 'ready' : 'idle',
    pendingSelection: null,
    lastError: 'La extension se reinicio mientras se estaba capturando la pestana visible.',
    lastUpdatedAt: new Date().toISOString(),
    reviewSurface: sanitizedReviewTarget.reviewSurface,
    reviewTabId: sanitizedReviewTarget.reviewTabId,
  });
}

async function processSelection(
  selectedElement: SelectedElementData,
  sender: Browser.runtime.MessageSender,
): Promise<SelectionCapturedResponse> {
  const currentState = await loadPanelState();
  const keepSelecting = currentState.captureMode === 'capture-only';
  const initialReviewTarget = keepSelecting
    ? await sanitizeReviewTarget(currentState)
    : getAutomaticReviewTarget(currentState);
  const startedAt = new Date().toISOString();

  await savePanelState({
    ...currentState,
    status: 'capturing',
    pendingSelection: selectedElement,
    lastError: null,
    lastUpdatedAt: startedAt,
    reviewSurface: initialReviewTarget.reviewSurface,
    reviewTabId: initialReviewTarget.reviewTabId,
  });

  let activeReviewTarget = initialReviewTarget;

  try {
    const imageDataUrl = await captureVisibleTab(sender);
    const localCaptureRecord = createCapturedSelectionRecord(
      selectedElement,
      imageDataUrl,
      sender.tab?.id ?? null,
      sender.tab?.windowId ?? null,
    );
    activeReviewTarget = keepSelecting
      ? initialReviewTarget
      : await openReviewSurfaceForSelection(sender, initialReviewTarget);
    const captureRecord = localCaptureRecord;
    const nextCaptures = trimCapturesForStorage([captureRecord, ...currentState.captures]);

    await savePanelState({
      status: 'ready',
      captures: nextCaptures,
      pendingSelection: null,
      lastError: null,
      lastUpdatedAt: captureRecord.createdAt,
      reviewSurface: activeReviewTarget.reviewSurface,
      reviewTabId: activeReviewTarget.reviewTabId,
      captureMode: currentState.captureMode,
    });

    return {
      accepted: true,
      keepSelecting,
      replayAction: keepSelecting,
    };
  } catch (error) {
    await savePanelState({
      ...currentState,
      status: 'error',
      pendingSelection: null,
      lastError: getErrorMessage(error),
      lastUpdatedAt: new Date().toISOString(),
      reviewSurface: activeReviewTarget.reviewSurface,
      reviewTabId: activeReviewTarget.reviewTabId,
    });

    throw error;
  }
}

async function handleActionClick(tab: Browser.tabs.Tab): Promise<void> {
  if (getSidePanelApi() !== undefined) {
    return;
  }

  const currentState = await loadPanelState();
  const sidebarActionApi = getSidebarActionApi();

  if (sidebarActionApi !== undefined) {
    try {
      await sidebarActionApi.open();
      await savePanelState({
        ...currentState,
        reviewSurface: 'sidebar',
        reviewTabId: null,
      });
      return;
    } catch (error) {
      console.warn('[Manual Builder] No se pudo abrir la barra lateral. Se abrira una pestana.', error);
    }
  }

  const reviewTarget = await openOrFocusReviewTab(
    currentState.reviewSurface === 'tab' ? currentState.reviewTabId : null,
    tab.windowId,
  );

  await savePanelState({
    ...currentState,
    reviewSurface: reviewTarget.reviewSurface,
    reviewTabId: reviewTarget.reviewTabId,
  });
}

function getAutomaticReviewTarget(currentState: CapturePanelState): ReviewTarget {
  if (getSidePanelApi() !== undefined) {
    return {
      reviewSurface: 'sidepanel',
      reviewTabId: null,
    };
  }

  if (currentState.reviewSurface === 'sidebar' && getSidebarActionApi() !== undefined) {
    return {
      reviewSurface: 'sidebar',
      reviewTabId: null,
    };
  }

  return {
    reviewSurface: 'tab',
    reviewTabId: currentState.reviewSurface === 'tab' ? currentState.reviewTabId : null,
  };
}

async function openReviewSurfaceForSelection(
  sender: Browser.runtime.MessageSender,
  reviewTarget: ReviewTarget,
): Promise<ReviewTarget> {
  switch (reviewTarget.reviewSurface) {
    case 'sidepanel':
      await openSidePanel(sender);
      return {
        reviewSurface: 'sidepanel',
        reviewTabId: null,
      };
    case 'sidebar':
      return {
        reviewSurface: 'sidebar',
        reviewTabId: null,
      };
    default:
      return openOrFocusReviewTab(reviewTarget.reviewTabId, sender.tab?.windowId);
  }
}

async function sanitizeReviewTarget(currentState: CapturePanelState): Promise<ReviewTarget> {
  switch (currentState.reviewSurface) {
    case 'sidepanel':
      if (getSidePanelApi() !== undefined) {
        return {
          reviewSurface: 'sidepanel',
          reviewTabId: null,
        };
      }

      return validateReviewTabTarget(currentState.reviewTabId);
    case 'sidebar':
      if (getSidebarActionApi() !== undefined) {
        return {
          reviewSurface: 'sidebar',
          reviewTabId: null,
        };
      }

      return validateReviewTabTarget(currentState.reviewTabId);
    default:
      return validateReviewTabTarget(currentState.reviewTabId);
  }
}

async function validateReviewTabTarget(reviewTabId: number | null): Promise<ReviewTarget> {
  if (reviewTabId === null) {
    return {
      reviewSurface: 'tab',
      reviewTabId: null,
    };
  }

  try {
    const tab = await browser.tabs.get(reviewTabId);
    if (tab.url === getReviewPageUrl()) {
      return {
        reviewSurface: 'tab',
        reviewTabId,
      };
    }
  } catch {
    return {
      reviewSurface: 'tab',
      reviewTabId: null,
    };
  }

  return {
    reviewSurface: 'tab',
    reviewTabId: null,
  };
}

async function openSidePanel(sender: Browser.runtime.MessageSender): Promise<void> {
  const sidePanelApi = getSidePanelApi();
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
    console.warn('[Manual Builder] No se pudo abrir el panel lateral automaticamente.', error);
  }
}

async function openOrFocusReviewTab(
  reviewTabId: number | null,
  windowId: number | undefined,
): Promise<ReviewTarget> {
  const resolvedTab = await resolveExistingReviewTab(reviewTabId);
  if (resolvedTab !== null) {
    return {
      reviewSurface: 'tab',
      reviewTabId: resolvedTab,
    };
  }

  const matchedTab = await findReviewTabByUrl();
  if (matchedTab !== null) {
    await focusTab(matchedTab);
    return {
      reviewSurface: 'tab',
      reviewTabId: matchedTab.id ?? null,
    };
  }

  const createdTab = await browser.tabs.create({
    active: true,
    url: getReviewPageUrl(),
    ...(windowId !== undefined ? { windowId } : {}),
  });

  return {
    reviewSurface: 'tab',
    reviewTabId: createdTab.id ?? null,
  };
}

async function resolveExistingReviewTab(reviewTabId: number | null): Promise<number | null> {
  if (reviewTabId === null) {
    return null;
  }

  try {
    const tab = await browser.tabs.get(reviewTabId);
    if (tab.url !== getReviewPageUrl()) {
      return null;
    }

    await focusTab(tab);
    return tab.id ?? reviewTabId;
  } catch {
    return null;
  }
}

async function findReviewTabByUrl(): Promise<Browser.tabs.Tab | null> {
  try {
    const matches = await browser.tabs.query({
      url: getReviewPageUrl(),
    });
    return matches[0] ?? null;
  } catch {
    return null;
  }
}

async function focusTab(tab: Browser.tabs.Tab): Promise<void> {
  if (tab.id !== undefined) {
    await browser.tabs.update(tab.id, { active: true });
  }

  if (tab.windowId !== undefined) {
    try {
      await browser.windows.update(tab.windowId, { focused: true });
    } catch {
      return;
    }
  }
}

async function captureVisibleTab(sender: Browser.runtime.MessageSender): Promise<string> {
  const windowId = sender.tab?.windowId;
  if (windowId === undefined) {
    throw new Error('No se pudo determinar la ventana activa para capturar la pestana.');
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

  return 'Se produjo un error desconocido al capturar la pestana visible.';
}

function getSidePanelApi(): SidePanelApi | undefined {
  return (browser as BrowserWithOptionalPanels).sidePanel;
}

function getSidebarActionApi(): SidebarActionApi | undefined {
  return (browser as BrowserWithOptionalPanels).sidebarAction;
}

function getReviewPageUrl(): string {
  return browser.runtime.getURL(REVIEW_PAGE_PATH);
}

function reviewTargetsEqual(
  currentState: CapturePanelState,
  reviewTarget: ReviewTarget,
): boolean {
  return (
    currentState.reviewSurface === reviewTarget.reviewSurface &&
    currentState.reviewTabId === reviewTarget.reviewTabId
  );
}
