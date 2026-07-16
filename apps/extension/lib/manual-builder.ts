export interface SelectionRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ViewportData {
  width: number;
  height: number;
  devicePixelRatio: number;
}

export interface SelectedElementData {
  tagName: string;
  id: string | null;
  text: string | null;
  ariaLabel?: string | null;
  elementTitle?: string | null;
  inputType?: string | null;
  selector: string;
  url: string;
  pageTitle: string;
  rect: SelectionRect;
  viewport: ViewportData;
}

export type BackendSyncStatus = 'idle' | 'synced' | 'error';
export type BackendStorageProvider = 'local' | 'onedrive-business';

export interface BackendSyncSettings {
  enabled: boolean;
  apiBaseUrl: string;
  authToken: string | null;
  userId: string | null;
  username: string;
  displayName: string;
  startedBy: string;
  workspaceId: string;
  systemId: string;
  moduleId: string;
  actionId: string;
  manualId: string;
  sessionId: string | null;
  sessionActionId: string | null;
  workspaceName: string | null;
  storageProvider: BackendStorageProvider | null;
  lastValidatedAt: string | null;
  lastError: string | null;
}

export interface ManualStepGuide {
  title?: string;
  summary?: string;
  actions?: string[];
  expectedResult?: string;
  detailCaption?: string;
}

export interface ManualStepHierarchy {
  systemName: string;
  moduleName: string;
  actionName: string;
  manualTitle: string;
}

export interface ImageRedactionRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type CaptureTarget = 'element' | 'viewport';

export interface CapturedSelectionRecord {
  id: string;
  createdAt: string;
  imageDataUrl: string;
  selectedElement: SelectedElementData;
  contextRegion: SelectionRect;
  redactionRegions: ImageRedactionRegion[];
  captureTarget: CaptureTarget;
  tabId: number | null;
  windowId: number | null;
  remoteSessionId: string | null;
  remoteCaptureId: string | null;
  remoteManualId: string | null;
  remoteSyncStatus: BackendSyncStatus;
  remoteSyncError: string | null;
}

export type ImageAssetFormat = 'jpeg' | 'png' | 'webp';

export interface ManualStep {
  id: string;
  order: number;
  title: string;
  description: string;
  selector: string;
  url: string;
  pageTitle: string;
  imageOriginalDataUrl: string;
  imageOriginalFormat: ImageAssetFormat;
  imageContextDataUrl: string;
  imageContextFormat: ImageAssetFormat;
  selectedElement: SelectedElementData;
  contextRegion: SelectionRect;
  createdAt: string;
  updatedAt?: string;
  annotationBaked?: boolean;
  guide?: ManualStepGuide;
  hierarchy?: ManualStepHierarchy;
  remoteManualId?: string | null;
  remoteCaptureId?: string | null;
  remoteStepId?: string | null;
  remoteSyncStatus?: BackendSyncStatus;
  remoteSyncError?: string | null;
}

export interface ManualDraft {
  title: string;
  author: string;
  description: string;
  createdAt: string;
  steps: ManualStep[];
  lastUpdatedAt: string | null;
}

export type CapturePanelStatus = 'idle' | 'capturing' | 'ready' | 'error';
export type CaptureMode = 'review' | 'capture-only';

export type ReviewSurface = 'sidepanel' | 'sidebar' | 'tab';

export interface CapturePanelState {
  status: CapturePanelStatus;
  captures: CapturedSelectionRecord[];
  pendingSelection: SelectedElementData | null;
  lastError: string | null;
  lastUpdatedAt: string | null;
  reviewSurface: ReviewSurface;
  reviewTabId: number | null;
  captureMode: CaptureMode;
}

export interface SelectionCapturedMessage {
  type: typeof MESSAGE_TYPE_SELECTION_CAPTURED;
  payload: SelectedElementData;
}

export interface SelectionCapturedResponse {
  accepted: true;
  keepSelecting: boolean;
  replayAction: boolean;
}

export interface GetCaptureModeMessage {
  type: typeof MESSAGE_TYPE_GET_CAPTURE_MODE;
}

export interface CaptureModeResponse {
  captureMode: CaptureMode;
}

export interface ClearCapturesMessage {
  type: typeof MESSAGE_TYPE_CLEAR_CAPTURES;
}

export interface CaptureViewportRequestMessage {
  type: typeof MESSAGE_TYPE_CAPTURE_VIEWPORT_REQUEST;
}

export const MESSAGE_TYPE_SELECTION_CAPTURED = 'manual-builder/selection-captured';
export const MESSAGE_TYPE_GET_CAPTURE_MODE = 'manual-builder/get-capture-mode';
export const MESSAGE_TYPE_CLEAR_CAPTURES = 'manual-builder/clear-captures';
export const MESSAGE_TYPE_CAPTURE_VIEWPORT_REQUEST = 'manual-builder/capture-viewport-request';
export const PANEL_STATE_STORAGE_KEY = 'manualBuilderPanelState';
export const MANUAL_DRAFT_STORAGE_KEY = 'manualBuilderDraft';
export const BACKEND_SYNC_SETTINGS_STORAGE_KEY = 'manualBuilderBackendSyncSettings';
export const MAX_CAPTURE_HISTORY = 100;
export const CAPTURE_IMAGE_FORMAT = 'jpeg';
export const CAPTURE_IMAGE_QUALITY = 95;
export const CONTEXT_MIN_WIDTH = 320;
export const CONTEXT_MIN_HEIGHT = 220;
export const MAX_STEP_TITLE_LENGTH = 80;
export const MAX_STEP_DESCRIPTION_LENGTH = 600;
export const MAX_STEP_EXPECTED_RESULT_LENGTH = 600;
export const MAX_MANUAL_TITLE_LENGTH = 120;
export const MAX_MANUAL_AUTHOR_LENGTH = 80;
export const MAX_MANUAL_DESCRIPTION_LENGTH = 500;

export function createEmptyPanelState(): CapturePanelState {
  return {
    status: 'idle',
    captures: [],
    pendingSelection: null,
    lastError: null,
    lastUpdatedAt: null,
    reviewSurface: 'tab',
    reviewTabId: null,
    captureMode: 'review',
  };
}

export function createEmptyBackendSyncSettings(): BackendSyncSettings {
  return {
    enabled: false,
    apiBaseUrl: 'http://localhost:3001',
    authToken: null,
    userId: null,
    username: '',
    displayName: '',
    startedBy: '',
    workspaceId: '',
    systemId: '',
    moduleId: '',
    actionId: '',
    manualId: '',
    sessionId: null,
    sessionActionId: null,
    workspaceName: null,
    storageProvider: null,
    lastValidatedAt: null,
    lastError: null,
  };
}

export function createEmptyManualDraft(): ManualDraft {
  return {
    title: 'Manual de usuario',
    author: '',
    description: '',
    createdAt: new Date().toISOString(),
    steps: [],
    lastUpdatedAt: null,
  };
}

export function createCapturedSelectionRecord(
  selectedElement: SelectedElementData,
  imageDataUrl: string,
  tabId: number | null,
  windowId: number | null,
  captureTarget: CaptureTarget = 'element',
): CapturedSelectionRecord {
  return {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    imageDataUrl,
    selectedElement,
    contextRegion: buildContextRegion(selectedElement),
    redactionRegions: [],
    captureTarget,
    tabId,
    windowId,
    remoteSessionId: null,
    remoteCaptureId: null,
    remoteManualId: null,
    remoteSyncStatus: 'idle',
    remoteSyncError: null,
  };
}

export function createManualStep(input: {
  capture: CapturedSelectionRecord;
  order: number;
  title: string;
  description: string;
  imageContextDataUrl: string;
  imageContextFormat: ImageAssetFormat;
}): ManualStep {
  const { capture, order, title, description, imageContextDataUrl, imageContextFormat } = input;

  return {
    id: crypto.randomUUID(),
    order,
    title: sanitizeStepTitle(title) || 'Elemento seleccionado',
    description: sanitizeStepDescription(description),
    selector: capture.selectedElement.selector,
    url: capture.selectedElement.url,
    pageTitle: capture.selectedElement.pageTitle,
    imageOriginalDataUrl: capture.imageDataUrl,
    imageOriginalFormat: detectImageFormatFromDataUrl(capture.imageDataUrl),
    imageContextDataUrl,
    imageContextFormat,
    selectedElement: capture.selectedElement,
    contextRegion: capture.contextRegion,
    createdAt: new Date().toISOString(),
    annotationBaked: capture.captureTarget === 'viewport',
    remoteManualId: capture.remoteManualId,
    remoteCaptureId: capture.remoteCaptureId,
    remoteSyncStatus: capture.remoteSyncStatus,
    remoteSyncError: capture.remoteSyncError,
  };
}

export function normalizePanelState(state: CapturePanelState): CapturePanelState {
  return {
    status: state.status,
    captures: trimCapturesForStorage(state.captures.map(normalizeCapturedSelectionRecord)),
    pendingSelection: state.pendingSelection,
    lastError: state.lastError,
    lastUpdatedAt: state.lastUpdatedAt,
    reviewSurface: state.reviewSurface,
    reviewTabId: state.reviewTabId,
    captureMode: state.captureMode === 'capture-only' ? 'capture-only' : 'review',
  };
}

export function normalizeManualDraft(draft: ManualDraft): ManualDraft {
  const defaultDraft = createEmptyManualDraft();

  return {
    title: sanitizeManualTitle(draft.title) || defaultDraft.title,
    author: sanitizeManualAuthor(draft.author),
    description: sanitizeManualDescription(draft.description),
    createdAt: typeof draft.createdAt === 'string' && draft.createdAt.length > 0
      ? draft.createdAt
      : defaultDraft.createdAt,
    steps: resequenceManualSteps(draft.steps.map(normalizeManualStep)),
    lastUpdatedAt: draft.lastUpdatedAt,
  };
}

export function normalizeBackendSyncSettings(
  settings: Partial<BackendSyncSettings>,
): BackendSyncSettings {
  const defaults = createEmptyBackendSyncSettings();
  const authToken = normalizeNullableString(settings.authToken);

  return {
    enabled: authToken !== null,
    apiBaseUrl: normalizeNullableString(settings.apiBaseUrl) ?? defaults.apiBaseUrl,
    authToken,
    userId: normalizeNullableString(settings.userId),
    username: normalizeNullableString(settings.username) ?? '',
    displayName: normalizeNullableString(settings.displayName) ?? '',
    startedBy: normalizeNullableString(settings.startedBy) ?? '',
    workspaceId: normalizeNullableString(settings.workspaceId) ?? '',
    systemId: normalizeNullableString(settings.systemId) ?? '',
    moduleId: normalizeNullableString(settings.moduleId) ?? '',
    actionId: normalizeNullableString(settings.actionId) ?? '',
    manualId: normalizeNullableString(settings.manualId) ?? '',
    sessionId: normalizeNullableString(settings.sessionId),
    sessionActionId: normalizeNullableString(settings.sessionActionId),
    workspaceName: normalizeNullableString(settings.workspaceName),
    storageProvider: normalizeBackendStorageProvider(settings.storageProvider),
    lastValidatedAt: normalizeNullableString(settings.lastValidatedAt),
    lastError: normalizeNullableString(settings.lastError),
  };
}

function normalizeBackendStorageProvider(value: unknown): BackendStorageProvider | null {
  return value === 'local' || value === 'onedrive-business' ? value : null;
}

export function resequenceManualSteps(steps: ManualStep[]): ManualStep[] {
  return steps.map((step, index) => ({
    ...step,
    order: index + 1,
    title: sanitizeStepTitle(step.title) || buildFallbackStepTitle(step),
  }));
}

export function trimCapturesForStorage(captures: CapturedSelectionRecord[]): CapturedSelectionRecord[] {
  return captures.slice(0, MAX_CAPTURE_HISTORY);
}

export function buildContextRegion(selectedElement: SelectedElementData): SelectionRect {
  const { rect, viewport } = selectedElement;
  const horizontalPadding = Math.max(80, rect.width * 0.24);
  const topPadding = Math.max(110, rect.height * 0.55);
  const bottomPadding = Math.max(80, rect.height * 0.35);

  let region = clampRegionToViewport({
    x: rect.x - horizontalPadding,
    y: rect.y - topPadding,
    width: rect.width + horizontalPadding * 2,
    height: rect.height + topPadding + bottomPadding,
  }, viewport);

  region = ensureMinimumRegionSize(region, viewport, CONTEXT_MIN_WIDTH, CONTEXT_MIN_HEIGHT);
  return normalizeRect(region);
}

export function detectImageFormatFromDataUrl(dataUrl: string): ImageAssetFormat {
  if (dataUrl.startsWith('data:image/webp')) {
    return 'webp';
  }

  if (dataUrl.startsWith('data:image/png')) {
    return 'png';
  }

  return 'jpeg';
}

export function getImageExtension(format: ImageAssetFormat): string {
  switch (format) {
    case 'png':
      return 'png';
    case 'webp':
      return 'webp';
    default:
      return 'jpg';
  }
}

export function buildStepTitleSuggestion(capture: CapturedSelectionRecord): string {
  if (capture.captureTarget === 'viewport') {
    return sanitizeStepTitle(`Captura de pantalla - ${capture.selectedElement.pageTitle}`)
      || 'Captura de pantalla';
  }

  const candidate =
    clampText(capture.selectedElement.text, 56) ??
    clampText(capture.selectedElement.id, 32) ??
    clampText(capture.selectedElement.pageTitle, 48) ??
    capture.selectedElement.tagName;

  return sanitizeStepTitle(candidate) || 'Elemento seleccionado';
}

export function sanitizeStepTitle(value: string): string {
  return clampText(stripStepNumberPrefix(value), MAX_STEP_TITLE_LENGTH) ?? '';
}

export function stripStepNumberPrefix(value: string): string {
  return value
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(?:paso\s+\d+\s*:\s*)+/i, '')
    .trim();
}

export function sanitizeStepDescription(value: string): string {
  return clampMultilineText(value, MAX_STEP_DESCRIPTION_LENGTH) ?? '';
}

export function sanitizeStepExpectedResult(value: string): string {
  return clampText(value, MAX_STEP_EXPECTED_RESULT_LENGTH) ?? '';
}

export function sanitizeManualTitle(value: string): string {
  return clampText(value, MAX_MANUAL_TITLE_LENGTH) ?? '';
}

export function sanitizeManualAuthor(value: string): string {
  return clampText(value, MAX_MANUAL_AUTHOR_LENGTH) ?? '';
}

export function sanitizeManualDescription(value: string): string {
  return clampMultilineText(value, MAX_MANUAL_DESCRIPTION_LENGTH) ?? '';
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

export function isGetCaptureModeMessage(value: unknown): value is GetCaptureModeMessage {
  return isRecord(value) && value.type === MESSAGE_TYPE_GET_CAPTURE_MODE;
}

export function isCaptureViewportRequestMessage(value: unknown): value is CaptureViewportRequestMessage {
  return isRecord(value) && value.type === MESSAGE_TYPE_CAPTURE_VIEWPORT_REQUEST;
}

function buildFallbackStepTitle(step: ManualStep): string {
  for (const candidate of [step.selectedElement.text, step.pageTitle, step.selectedElement.tagName]) {
    if (candidate === null) {
      continue;
    }

    const title = sanitizeStepTitle(candidate);
    if (title.length > 0) {
      return title;
    }
  }

  return 'Elemento seleccionado';
}

function normalizeCapturedSelectionRecord(capture: CapturedSelectionRecord): CapturedSelectionRecord {
  return {
    ...capture,
    captureTarget: capture.captureTarget === 'viewport' ? 'viewport' : 'element',
    redactionRegions: normalizeImageRedactionRegions(capture.redactionRegions),
    remoteSessionId: normalizeNullableString(capture.remoteSessionId),
    remoteCaptureId: normalizeNullableString(capture.remoteCaptureId),
    remoteManualId: normalizeNullableString(capture.remoteManualId),
    remoteSyncStatus: capture.remoteSyncStatus ?? 'idle',
    remoteSyncError: normalizeNullableString(capture.remoteSyncError),
  };
}

function normalizeImageRedactionRegions(value: unknown): ImageRedactionRegion[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((region): ImageRedactionRegion[] => {
    if (typeof region !== 'object' || region === null) {
      return [];
    }

    const candidate = region as Partial<ImageRedactionRegion>;
    if (
      !Number.isFinite(candidate.x) ||
      !Number.isFinite(candidate.y) ||
      !Number.isFinite(candidate.width) ||
      !Number.isFinite(candidate.height)
    ) {
      return [];
    }

    const x = clamp(candidate.x as number, 0, 1);
    const y = clamp(candidate.y as number, 0, 1);
    const width = clamp(candidate.width as number, 0, 1 - x);
    const height = clamp(candidate.height as number, 0, 1 - y);

    return width >= 0.002 && height >= 0.002
      ? [{ x, y, width, height }]
      : [];
  });
}

function normalizeManualStep(step: ManualStep): ManualStep {
  const normalizedGuide = normalizeManualStepGuide(step.guide);

  return {
    ...step,
    ...(normalizedGuide === undefined ? {} : { guide: normalizedGuide }),
    annotationBaked: step.annotationBaked === true,
    remoteManualId: normalizeNullableString(step.remoteManualId),
    remoteCaptureId: normalizeNullableString(step.remoteCaptureId),
    remoteStepId: normalizeNullableString(step.remoteStepId),
    remoteSyncStatus: step.remoteSyncStatus ?? 'idle',
    remoteSyncError: normalizeNullableString(step.remoteSyncError),
  };
}

function normalizeManualStepGuide(guide: ManualStepGuide | undefined): ManualStepGuide | undefined {
  if (guide === undefined) {
    return undefined;
  }

  return {
    ...guide,
    expectedResult: sanitizeStepExpectedResult(guide.expectedResult ?? ''),
  };
}

function normalizeRect(rect: SelectionRect): SelectionRect {
  return {
    x: Math.max(0, Math.round(rect.x)),
    y: Math.max(0, Math.round(rect.y)),
    width: Math.max(1, Math.round(rect.width)),
    height: Math.max(1, Math.round(rect.height)),
  };
}

function clampRegionToViewport(region: SelectionRect, viewport: ViewportData): SelectionRect {
  const x = clamp(region.x, 0, viewport.width);
  const y = clamp(region.y, 0, viewport.height);
  const right = clamp(region.x + region.width, 0, viewport.width);
  const bottom = clamp(region.y + region.height, 0, viewport.height);

  return {
    x,
    y,
    width: Math.max(1, right - x),
    height: Math.max(1, bottom - y),
  };
}

function ensureMinimumRegionSize(
  region: SelectionRect,
  viewport: ViewportData,
  minimumWidth: number,
  minimumHeight: number,
): SelectionRect {
  let nextRegion = { ...region };

  if (nextRegion.width < minimumWidth) {
    const missingWidth = minimumWidth - nextRegion.width;
    nextRegion = expandRegionHorizontally(nextRegion, viewport.width, missingWidth);
  }

  if (nextRegion.height < minimumHeight) {
    const missingHeight = minimumHeight - nextRegion.height;
    nextRegion = expandRegionVertically(nextRegion, viewport.height, missingHeight);
  }

  return clampRegionToViewport(nextRegion, viewport);
}

function expandRegionHorizontally(region: SelectionRect, viewportWidth: number, missingWidth: number): SelectionRect {
  const leftExtra = missingWidth / 2;

  return {
    ...region,
    x: Math.max(0, region.x - leftExtra),
    width: Math.min(viewportWidth, region.width + missingWidth),
  };
}

function expandRegionVertically(region: SelectionRect, viewportHeight: number, missingHeight: number): SelectionRect {
  const topExtra = missingHeight * 0.6;
  const bottomExtra = missingHeight - topExtra;
  const y = Math.max(0, region.y - topExtra);
  const bottom = Math.min(viewportHeight, region.y + region.height + bottomExtra);

  return {
    ...region,
    y,
    height: Math.max(1, bottom - y),
  };
}

function clampText(value: string | null, maxLength: number): string | null {
  if (value === null) {
    return null;
  }

  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length === 0) {
    return null;
  }

  return normalized.slice(0, maxLength);
}

function clampMultilineText(value: string | null, maxLength: number): string | null {
  if (value === null) {
    return null;
  }

  const normalized = value
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[\t ]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return normalized.length > 0 ? normalized.slice(0, maxLength).trimEnd() : null;
}

export function isSelectedElementData(value: unknown): value is SelectedElementData {
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

function isRectLike(value: unknown): value is SelectionRect {
  return (
    isRecord(value) &&
    isNumber(value.x) &&
    isNumber(value.y) &&
    isNumber(value.width) &&
    isNumber(value.height)
  );
}

function isViewportLike(value: unknown): value is ViewportData {
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

function normalizeNullableString(value: string | null | undefined): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}
