export interface SelectedElementData {
  tagName: string;
  id: string | null;
  text: string | null;
  selector: string;
  url: string;
  pageTitle: string;
  rect: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  viewport: {
    width: number;
    height: number;
    devicePixelRatio: number;
  };
}

export interface CapturedSelectionRecord {
  id: string;
  createdAt: string;
  imageDataUrl: string;
  selectedElement: SelectedElementData;
  tabId: number | null;
  windowId: number | null;
}

export type CapturePanelStatus = 'idle' | 'capturing' | 'ready' | 'error';

export interface CapturePanelState {
  status: CapturePanelStatus;
  captures: CapturedSelectionRecord[];
  pendingSelection: SelectedElementData | null;
  lastError: string | null;
  lastUpdatedAt: string | null;
}

export interface SelectionCapturedMessage {
  type: typeof MESSAGE_TYPE_SELECTION_CAPTURED;
  payload: SelectedElementData;
}

export interface ClearCapturesMessage {
  type: typeof MESSAGE_TYPE_CLEAR_CAPTURES;
}

export const MESSAGE_TYPE_SELECTION_CAPTURED = 'manual-builder/selection-captured';
export const MESSAGE_TYPE_CLEAR_CAPTURES = 'manual-builder/clear-captures';
export const PANEL_STATE_STORAGE_KEY = 'manualBuilderPanelState';
export const MAX_CAPTURE_HISTORY = 3;
export const MAX_CAPTURE_STORAGE_BYTES = 7_000_000;
export const CAPTURE_IMAGE_FORMAT = 'jpeg';
export const CAPTURE_IMAGE_QUALITY = 85;

export function createEmptyPanelState(): CapturePanelState {
  return {
    status: 'idle',
    captures: [],
    pendingSelection: null,
    lastError: null,
    lastUpdatedAt: null,
  };
}

export function createCapturedSelectionRecord(
  selectedElement: SelectedElementData,
  imageDataUrl: string,
  tabId: number | null,
  windowId: number | null,
): CapturedSelectionRecord {
  return {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    imageDataUrl,
    selectedElement,
    tabId,
    windowId,
  };
}

export function trimCapturesForStorage(captures: CapturedSelectionRecord[]): CapturedSelectionRecord[] {
  const trimmedByCount = captures.slice(0, MAX_CAPTURE_HISTORY);
  const acceptedCaptures: CapturedSelectionRecord[] = [];
  let usedBytes = 0;

  for (const capture of trimmedByCount) {
    const estimatedBytes = estimateDataUrlSize(capture.imageDataUrl);
    const fitsBudget = acceptedCaptures.length === 0 || usedBytes + estimatedBytes <= MAX_CAPTURE_STORAGE_BYTES;

    if (!fitsBudget) {
      break;
    }

    acceptedCaptures.push(capture);
    usedBytes += estimatedBytes;
  }

  return acceptedCaptures;
}

export function isSelectionCapturedMessage(value: unknown): value is SelectionCapturedMessage {
  return (
    isRecord(value) &&
    value.type === MESSAGE_TYPE_SELECTION_CAPTURED &&
    isSelectedElementData(value.payload)
  );
}

export function isClearCapturesMessage(value: unknown): value is ClearCapturesMessage {
  return isRecord(value) && value.type === MESSAGE_TYPE_CLEAR_CAPTURES;
}

function estimateDataUrlSize(dataUrl: string): number {
  return Math.ceil((dataUrl.length * 3) / 4);
}

function isSelectedElementData(value: unknown): value is SelectedElementData {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.tagName === 'string' &&
    isNullableString(value.id) &&
    isNullableString(value.text) &&
    typeof value.selector === 'string' &&
    typeof value.url === 'string' &&
    typeof value.pageTitle === 'string' &&
    isRectLike(value.rect) &&
    isViewportLike(value.viewport)
  );
}

function isRectLike(value: unknown): boolean {
  return (
    isRecord(value) &&
    isNumber(value.x) &&
    isNumber(value.y) &&
    isNumber(value.width) &&
    isNumber(value.height)
  );
}

function isViewportLike(value: unknown): boolean {
  return (
    isRecord(value) &&
    isNumber(value.width) &&
    isNumber(value.height) &&
    isNumber(value.devicePixelRatio)
  );
}

function isNullableString(value: unknown): value is string | null {
  return typeof value === 'string' || value === null;
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
