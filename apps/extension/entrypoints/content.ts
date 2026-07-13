import { defineContentScript } from '#imports';
import {
  MESSAGE_TYPE_GET_CAPTURE_MODE,
  MESSAGE_TYPE_CAPTURE_VIEWPORT_REQUEST,
  MESSAGE_TYPE_SELECTION_CAPTURED,
  isCaptureViewportRequestMessage,
  type CaptureMode,
  type CaptureModeResponse,
  type SelectedElementData,
  type SelectionCapturedResponse,
} from '../lib/manual-builder';

interface SelectorController {
  destroy: () => void;
}

declare global {
  interface Window {
    __manualBuilderSelectorController__?: SelectorController;
  }
}

const LOADED_MESSAGE = '[Manual Builder] Extensión cargada. Presiona ALT + S para seleccionar.';
const CONSOLE_GROUP_LABEL = '[Manual Builder] Elemento seleccionado';
const ACTIVE_MESSAGE = 'Selector activo | Clic para seleccionar | ALT + SHIFT + M captura la pantalla | ESC cancela';
const OVERLAY_ID = 'manual-builder-selector-overlay';
const BANNER_ID = 'manual-builder-selector-banner';
const ROOT_ATTRIBUTE = 'data-manual-builder-selector-initialized';
const OWNED_ATTRIBUTE = 'data-manual-builder-owned';
const GLOBAL_CONTROLLER_KEY = '__manualBuilderSelectorController__' as const;
const MAX_TEXT_LENGTH = 300;
const MAX_SELECTOR_DEPTH = 5;
const BANNER_VISIBLE_MS = 2800;

export default defineContentScript({
  matches: ['http://*/*', 'https://*/*'],
  runAt: 'document_idle',
  main() {
    window[GLOBAL_CONTROLLER_KEY]?.destroy();

    const controller = createSelectorController(window, document);
    window[GLOBAL_CONTROLLER_KEY] = controller;

    console.log(LOADED_MESSAGE);
  },
});

function createSelectorController(win: Window, doc: Document): SelectorController {
  let selectionModeEnabled = false;
  let hoveredElement: HTMLElement | null = null;
  let selectedElement: HTMLElement | null = null;
  let overlayElement: HTMLDivElement | null = null;
  let bannerElement: HTMLDivElement | null = null;
  let captureMode: CaptureMode = 'review';
  let captureSubmissionInFlight = false;
  let captureModeSyncInFlight: Promise<void> | null = null;
  let bannerHideTimer: number | null = null;
  let captureUiSuppressed = false;
  let captureUiReleaseTimer: number | null = null;

  const mutationObserver = new MutationObserver(() => {
    hoveredElement = isUsableElement(hoveredElement) ? hoveredElement : null;
    selectedElement = isUsableElement(selectedElement) ? selectedElement : null;

    if (selectionModeEnabled) {
      refreshOverlayForCurrentTarget();
      return;
    }

    if (selectedElement !== null) {
      updateOverlay(selectedElement);
      return;
    }

    hideOverlay();
  });

  const handleKeyDown = (event: KeyboardEvent): void => {
    if (event.repeat) {
      return;
    }

    if (event.altKey && !event.shiftKey && event.key.toLowerCase() === 's') {
      event.preventDefault();
      event.stopPropagation();

      if (selectionModeEnabled) {
        cancelSelectionMode();
      } else {
        void activateSelectionModeWithFreshMode();
      }
      return;
    }

    if (event.key === 'Escape' && selectionModeEnabled) {
      event.preventDefault();
      event.stopPropagation();
      cancelSelectionMode();
    }
  };

  const handleMouseMove = (event: MouseEvent): void => {
    if (!selectionModeEnabled) {
      return;
    }

    hoveredElement = resolveSelectableElement(doc, event.clientX, event.clientY);
    refreshOverlayForCurrentTarget();
  };

  const handleClickCapture = (event: MouseEvent): void => {
    if (!event.isTrusted || !selectionModeEnabled) {
      return;
    }

    if (captureMode === 'capture-only') {
      if (captureSubmissionInFlight) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      const targetElement = resolveSelectableElement(doc, event.clientX, event.clientY);
      if (targetElement === null) {
        return;
      }

      selectedElement = targetElement;
      hoveredElement = targetElement;
      updateOverlay(targetElement);

      const selectedData = buildSelectedElementData(targetElement, win, doc);
      captureSubmissionInFlight = true;
      void submitSelectedElement(selectedData)
        .then((response) => {
          if ((response.replayAction || captureMode === 'capture-only') && isUsableElement(targetElement)) {
            targetElement.click();
          }
        })
        .finally(() => {
          captureSubmissionInFlight = false;
        });
      return;
    }

    const targetElement = resolveSelectableElement(doc, event.clientX, event.clientY);
    if (targetElement === null) {
      cancelSelectionMode();
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    selectedElement = targetElement;
    hoveredElement = targetElement;
    updateOverlay(targetElement);
    deactivateSelectionMode({ preserveSelection: true });

    const selectedData = buildSelectedElementData(targetElement, win, doc);
    void submitSelectedElement(selectedData);
  };

  const handleViewportChange = (): void => {
    refreshOverlayForCurrentTarget();
  };

  const handleRuntimeMessage = (message: unknown): SelectedElementData | undefined => {
    if (!isCaptureViewportRequestMessage(message)) {
      return undefined;
    }

    if (selectionModeEnabled) {
      cancelSelectionMode();
    }
    suppressCaptureUi(1200);
    return buildViewportSelectionData(win, doc);
  };

  ensureUiElements();
  doc.documentElement.setAttribute(ROOT_ATTRIBUTE, 'true');
  void syncCaptureMode();

  doc.addEventListener('keydown', handleKeyDown, true);
  doc.addEventListener('mousemove', handleMouseMove, true);
  doc.addEventListener('click', handleClickCapture, true);
  browser.runtime.onMessage.addListener(handleRuntimeMessage);
  win.addEventListener('scroll', handleViewportChange, true);
  win.addEventListener('resize', handleViewportChange);

  mutationObserver.observe(doc.documentElement, {
    childList: true,
    subtree: true,
  });

  return {
    destroy: () => {
      selectionModeEnabled = false;
      hoveredElement = null;
      selectedElement = null;

      doc.removeEventListener('keydown', handleKeyDown, true);
      doc.removeEventListener('mousemove', handleMouseMove, true);
      doc.removeEventListener('click', handleClickCapture, true);
      browser.runtime.onMessage.removeListener(handleRuntimeMessage);
      win.removeEventListener('scroll', handleViewportChange, true);
      win.removeEventListener('resize', handleViewportChange);

      mutationObserver.disconnect();
      releaseCaptureUi();
      hideBanner();
      hideOverlay();

      overlayElement?.remove();
      bannerElement?.remove();
      overlayElement = null;
      bannerElement = null;

      doc.documentElement.removeAttribute(ROOT_ATTRIBUTE);
      delete win[GLOBAL_CONTROLLER_KEY];
    },
  };

  async function activateSelectionModeWithFreshMode(): Promise<void> {
    await syncCaptureMode();
    activateSelectionMode();
  }

  function activateSelectionMode(): void {
    ensureUiElements();

    selectionModeEnabled = true;
    hoveredElement = null;
    selectedElement = null;

    showBanner();
    hideOverlay();
  }

  function deactivateSelectionMode(options: { preserveSelection: boolean }): void {
    selectionModeEnabled = false;
    hoveredElement = null;
    hideBanner();

    if (options.preserveSelection && isUsableElement(selectedElement)) {
      updateOverlay(selectedElement);
      return;
    }

    selectedElement = null;
    hideOverlay();
  }

  function cancelSelectionMode(): void {
    selectedElement = null;
    deactivateSelectionMode({ preserveSelection: false });
  }

  function ensureUiElements(): void {
    overlayElement = ensureOverlayElement(doc, overlayElement);
    bannerElement = ensureBannerElement(doc, bannerElement);
  }

  function showBanner(): void {
    ensureUiElements();
    if (bannerElement === null || captureUiSuppressed) {
      return;
    }

    bannerElement.textContent = ACTIVE_MESSAGE;
    bannerElement.style.display = 'block';
    if (bannerHideTimer !== null) {
      win.clearTimeout(bannerHideTimer);
    }
    bannerHideTimer = win.setTimeout(() => {
      bannerHideTimer = null;
      if (bannerElement !== null) {
        bannerElement.style.display = 'none';
      }
    }, BANNER_VISIBLE_MS);
  }

  function hideBanner(): void {
    if (bannerHideTimer !== null) {
      win.clearTimeout(bannerHideTimer);
      bannerHideTimer = null;
    }

    if (bannerElement === null) {
      return;
    }

    bannerElement.style.display = 'none';
  }

  function updateOverlay(element: HTMLElement): void {
    ensureUiElements();
    if (overlayElement === null || captureUiSuppressed) {
      hideOverlay();
      return;
    }

    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      overlayElement.style.display = 'none';
      return;
    }

    overlayElement.style.display = 'block';
    overlayElement.style.left = `${rect.left}px`;
    overlayElement.style.top = `${rect.top}px`;
    overlayElement.style.width = `${rect.width}px`;
    overlayElement.style.height = `${rect.height}px`;
  }

  function hideOverlay(): void {
    if (overlayElement === null) {
      return;
    }

    overlayElement.style.display = 'none';
  }

  function refreshOverlayForCurrentTarget(): void {
    if (captureUiSuppressed) {
      hideOverlay();
      return;
    }

    const activeElement = selectionModeEnabled ? hoveredElement : selectedElement;

    if (!isUsableElement(activeElement)) {
      if (!selectionModeEnabled) {
        selectedElement = null;
      }
      hideOverlay();
      return;
    }

    updateOverlay(activeElement);
  }

  async function submitSelectedElement(data: SelectedElementData): Promise<SelectionCapturedResponse> {
    logSelectedElement(data);
    suppressCaptureUi();

    try {
      const response = await notifySelectionCaptured(data);
      if (!response.keepSelecting) {
        return response;
      }

      win.setTimeout(() => {
        if (selectionModeEnabled) {
          return;
        }

        activateSelectionMode();
      }, 180);

      return response;
    } finally {
      releaseCaptureUi();
    }
  }

  function suppressCaptureUi(autoReleaseMs?: number): void {
    captureUiSuppressed = true;
    if (captureUiReleaseTimer !== null) {
      win.clearTimeout(captureUiReleaseTimer);
      captureUiReleaseTimer = null;
    }
    hideBanner();
    hideOverlay();

    if (autoReleaseMs !== undefined) {
      captureUiReleaseTimer = win.setTimeout(releaseCaptureUi, autoReleaseMs);
    }
  }

  function releaseCaptureUi(): void {
    if (captureUiReleaseTimer !== null) {
      win.clearTimeout(captureUiReleaseTimer);
      captureUiReleaseTimer = null;
    }
    captureUiSuppressed = false;
    if (selectionModeEnabled) {
      refreshOverlayForCurrentTarget();
    }
  }

  async function syncCaptureMode(): Promise<void> {
    if (captureModeSyncInFlight !== null) {
      return captureModeSyncInFlight;
    }

    captureModeSyncInFlight = requestCaptureMode()
      .then((nextMode) => {
        captureMode = nextMode;
      })
      .catch((error: unknown) => {
        console.warn('[Manual Builder] No se pudo obtener el modo de captura actual.', error);
      })
      .finally(() => {
        captureModeSyncInFlight = null;
      });

    return captureModeSyncInFlight;
  }

  async function requestCaptureMode(): Promise<CaptureMode> {
    const response = await browser.runtime.sendMessage({
      type: MESSAGE_TYPE_GET_CAPTURE_MODE,
    });

    if (isCaptureModeResponse(response)) {
      return response.captureMode;
    }

    return captureMode;
  }
}

function ensureOverlayElement(
  doc: Document,
  currentElement: HTMLDivElement | null,
): HTMLDivElement {
  if (currentElement !== null && currentElement.isConnected) {
    return currentElement;
  }

  const existingOverlay = doc.getElementById(OVERLAY_ID);
  if (existingOverlay instanceof HTMLDivElement) {
    return existingOverlay;
  }

  const overlay = doc.createElement('div');
  overlay.id = OVERLAY_ID;
  overlay.setAttribute(OWNED_ATTRIBUTE, 'true');
  overlay.style.position = 'fixed';
  overlay.style.pointerEvents = 'none';
  overlay.style.border = '3px solid #e53935';
  overlay.style.background = 'rgba(229, 57, 53, 0.08)';
  overlay.style.boxSizing = 'border-box';
  overlay.style.zIndex = '2147483646';
  overlay.style.borderRadius = '4px';
  overlay.style.display = 'none';
  overlay.style.left = '0';
  overlay.style.top = '0';
  overlay.style.width = '0';
  overlay.style.height = '0';

  doc.documentElement.appendChild(overlay);
  return overlay;
}

function ensureBannerElement(
  doc: Document,
  currentElement: HTMLDivElement | null,
): HTMLDivElement {
  if (currentElement !== null && currentElement.isConnected) {
    return currentElement;
  }

  const existingBanner = doc.getElementById(BANNER_ID);
  if (existingBanner instanceof HTMLDivElement) {
    return existingBanner;
  }

  const banner = doc.createElement('div');
  banner.id = BANNER_ID;
  banner.setAttribute(OWNED_ATTRIBUTE, 'true');
  banner.style.position = 'fixed';
  banner.style.top = '16px';
  banner.style.left = '50%';
  banner.style.transform = 'translateX(-50%)';
  banner.style.padding = '10px 16px';
  banner.style.borderRadius = '999px';
  banner.style.background = 'rgba(15, 23, 42, 0.94)';
  banner.style.color = '#ffffff';
  banner.style.fontFamily = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  banner.style.fontSize = '13px';
  banner.style.fontWeight = '600';
  banner.style.lineHeight = '1.4';
  banner.style.zIndex = '2147483647';
  banner.style.pointerEvents = 'none';
  banner.style.userSelect = 'none';
  banner.style.boxShadow = '0 8px 24px rgba(15, 23, 42, 0.28)';
  banner.style.display = 'none';
  banner.style.maxWidth = 'calc(100vw - 32px)';
  banner.style.textAlign = 'center';

  doc.documentElement.appendChild(banner);
  return banner;
}

function resolveSelectableElement(
  doc: Document,
  clientX: number,
  clientY: number,
): HTMLElement | null {
  const rawElement = doc.elementFromPoint(clientX, clientY);
  return findUsableElement(rawElement);
}

function findUsableElement(element: Element | null): HTMLElement | null {
  let current = element;

  while (current !== null) {
    if (
      current instanceof HTMLElement &&
      !isRootContainerElement(current) &&
      !isOwnedElement(current) &&
      hasRenderableRect(current)
    ) {
      return current;
    }

    current = current.parentElement;
  }

  return null;
}

function isUsableElement(element: HTMLElement | null): element is HTMLElement {
  return (
    element !== null &&
    element.isConnected &&
    !isRootContainerElement(element) &&
    !isOwnedElement(element) &&
    hasRenderableRect(element)
  );
}

function isOwnedElement(element: Element): boolean {
  return element.hasAttribute(OWNED_ATTRIBUTE) || element.closest(`[${OWNED_ATTRIBUTE}="true"]`) !== null;
}

function isRootContainerElement(element: HTMLElement): boolean {
  return element === element.ownerDocument.body || element === element.ownerDocument.documentElement;
}

function hasRenderableRect(element: Element): boolean {
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function buildSelectedElementData(
  element: HTMLElement,
  win: Window,
  doc: Document,
): SelectedElementData {
  const rect = element.getBoundingClientRect();

  return {
    tagName: element.tagName.toLowerCase(),
    id: normalizeOptionalString(element.id),
    text: extractElementText(element),
    ariaLabel: normalizeOptionalString(element.getAttribute('aria-label') ?? ''),
    elementTitle: normalizeOptionalString(element.getAttribute('title') ?? ''),
    inputType: element instanceof HTMLInputElement
      ? normalizeOptionalString(element.type)
      : null,
    selector: buildStableSelector(element),
    url: win.location.href,
    pageTitle: doc.title,
    rect: {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
    },
    viewport: {
      width: win.innerWidth,
      height: win.innerHeight,
      devicePixelRatio: win.devicePixelRatio,
    },
  };
}

function buildViewportSelectionData(win: Window, doc: Document): SelectedElementData {
  return {
    tagName: 'html',
    id: null,
    text: null,
    selector: 'html',
    url: win.location.href,
    pageTitle: doc.title,
    rect: {
      x: 0,
      y: 0,
      width: win.innerWidth,
      height: win.innerHeight,
    },
    viewport: {
      width: win.innerWidth,
      height: win.innerHeight,
      devicePixelRatio: win.devicePixelRatio,
    },
  };
}

function extractElementText(element: HTMLElement): string | null {
  const rawText = normalizeWhitespace(element.innerText) || normalizeWhitespace(element.textContent);
  if (rawText === null) {
    return null;
  }

  return rawText.slice(0, MAX_TEXT_LENGTH);
}

function normalizeWhitespace(value: string | null): string | null {
  if (value === null) {
    return null;
  }

  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeOptionalString(value: string): string | null {
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function buildStableSelector(element: HTMLElement): string {
  const normalizedId = normalizeOptionalString(element.id);
  if (normalizedId !== null) {
    return `#${CSS.escape(normalizedId)}`;
  }

  const dataTestId = normalizeWhitespace(element.getAttribute('data-testid'));
  if (dataTestId !== null) {
    return `[data-testid="${CSS.escape(dataTestId)}"]`;
  }

  const name = normalizeWhitespace(element.getAttribute('name'));
  if (name !== null) {
    return `${element.tagName.toLowerCase()}[name="${CSS.escape(name)}"]`;
  }

  const ariaLabel = normalizeWhitespace(element.getAttribute('aria-label'));
  if (ariaLabel !== null) {
    return `${element.tagName.toLowerCase()}[aria-label="${CSS.escape(ariaLabel)}"]`;
  }

  return buildStructuralSelector(element);
}

function buildStructuralSelector(element: HTMLElement): string {
  const segments: string[] = [];
  const stopElement = element.ownerDocument.body;
  let current: HTMLElement | null = element;

  while (current !== null && segments.length < MAX_SELECTOR_DEPTH) {
    if (current === stopElement) {
      break;
    }

    segments.unshift(buildStructuralSegment(current));
    current = current.parentElement;
  }

  if (segments.length === 0) {
    return element.tagName.toLowerCase();
  }

  return segments.join(' > ');
}

function buildStructuralSegment(element: HTMLElement): string {
  const tagName = element.tagName.toLowerCase();
  const parent = element.parentElement;

  if (parent === null) {
    return tagName;
  }

  const siblingsWithSameTag = Array.from(parent.children).filter(
    (child) => child.tagName.toLowerCase() === tagName,
  );

  if (siblingsWithSameTag.length <= 1) {
    return tagName;
  }

  const position = siblingsWithSameTag.indexOf(element) + 1;
  return `${tagName}:nth-of-type(${position})`;
}

function logSelectedElement(data: SelectedElementData): void {
  console.group(CONSOLE_GROUP_LABEL);
  console.log(data);
  console.groupEnd();
}

async function notifySelectionCaptured(data: SelectedElementData): Promise<SelectionCapturedResponse> {
  try {
    const response = await browser.runtime.sendMessage({
      type: MESSAGE_TYPE_SELECTION_CAPTURED,
      payload: data,
    });

    if (isSelectionCapturedResponse(response)) {
      return response;
    }

    return {
      accepted: true,
      keepSelecting: false,
      replayAction: false,
    };
  } catch (error) {
    console.error('[Manual Builder] No se pudo enviar la seleccion al service worker.', error);
    return {
      accepted: true,
      keepSelecting: false,
      replayAction: false,
    };
  }
}

function isSelectionCapturedResponse(value: unknown): value is SelectionCapturedResponse {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as {
    accepted?: unknown;
    keepSelecting?: unknown;
    replayAction?: unknown;
  };

  return (
    candidate.accepted === true &&
    typeof candidate.keepSelecting === 'boolean' &&
    typeof candidate.replayAction === 'boolean'
  );
}

function isCaptureModeResponse(value: unknown): value is CaptureModeResponse {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as {
    captureMode?: unknown;
  };

  return candidate.captureMode === 'review' || candidate.captureMode === 'capture-only';
}
