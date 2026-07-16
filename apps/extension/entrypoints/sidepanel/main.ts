import {
  BACKEND_SYNC_SETTINGS_STORAGE_KEY,
  MANUAL_DRAFT_STORAGE_KEY,
  MESSAGE_TYPE_CLEAR_CAPTURES,
  MESSAGE_TYPE_CAPTURE_VIEWPORT_REQUEST,
  PANEL_STATE_STORAGE_KEY,
  buildStepTitleSuggestion,
  createEmptyBackendSyncSettings,
  createEmptyManualDraft,
  createEmptyPanelState,
  createManualStep,
  detectImageFormatFromDataUrl,
  getImageExtension,
  sanitizeManualAuthor,
  sanitizeManualDescription,
  sanitizeManualTitle,
  sanitizeStepDescription,
  sanitizeStepExpectedResult,
  sanitizeStepTitle,
  type BackendSyncSettings,
  type CapturePanelState,
  type CapturedSelectionRecord,
  type ImageAssetFormat,
  type ImageRedactionRegion,
  type ManualDraft,
  type ManualStep,
  type ReviewSurface,
  type SelectedElementData,
  type SelectionRect,
} from '../../lib/manual-builder';
import { loadBackendSyncSettings, saveBackendSyncSettings } from '../../lib/backend-sync-state';
import {
  buildRemoteCapturePayload,
  createManualBuilderApiClient,
  type RemoteAuthResponse,
  type RemoteActionSummary,
  type RemoteAssetRecord,
  type RemoteManualDetail,
  type RemoteManualSummary,
  type RemoteManualStepWithAsset,
  type RemoteWorkspaceMemberRole,
  type RemoteWorkspaceRecord,
  type RemoteSystemModuleSummary,
  type RemoteSystemSummary,
  type RemoteSystemTree,
  type WorkspaceOverview,
} from '../../lib/manual-builder-api';
import type { ManualSystemStructure } from '../../lib/pdf/manual-pdf.types';
import { loadPanelState, savePanelState } from '../../lib/panel-state';
import { loadManualDraft, resetManualDraft, saveManualDraft } from '../../lib/manual-step-state';
import './style.css';

type PreviewMode = 'context' | 'full';
type StepDropPosition = 'before' | 'after';

interface ImageScale {
  x: number;
  y: number;
}

interface PixelRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface NormalizedPoint {
  x: number;
  y: number;
}

interface GeneratedImageAsset {
  dataUrl: string;
  format: ImageAssetFormat;
}

interface ExportedManualDocument {
  exportedAt: string;
  generatedBy: 'Manual Builder';
  version: 1;
  title: string;
  author: string;
  description: string;
  createdAt: string;
  lastUpdatedAt: string | null;
  stepCount: number;
  steps: ManualStep[];
}

interface ManualDraftSeed {
  title?: string | null;
  author?: string | null;
  description?: string | null;
  createdAt?: string | null;
}

interface SystemPdfExportDocument extends ManualDraft {
  structure: ManualSystemStructure;
}

type SystemExportState = 'idle' | 'working' | 'completed' | 'error';

const MANUAL_PAGE_PATH = '/manual.html' as const;
const DEFAULT_REMOTE_FRAMING = 'context' as const;
const STORED_IMAGE_QUALITY = 0.95;
const CONTEXT_IMAGE_QUALITY = 0.94;

let currentState: CapturePanelState = createEmptyPanelState();
let currentDraft: ManualDraft = createEmptyManualDraft();
let currentBackendSettings: BackendSyncSettings = createEmptyBackendSyncSettings();
let selectedCaptureId: string | null = null;
let selectedStepId: string | null = null;
let draggedStepId: string | null = null;
let stepDragJustFinished = false;
let previewRenderToken = 0;
let panelBusy = false;
let redactionModeEnabled = false;
let redactionDragStart: NormalizedPoint | null = null;
let redactionDraft: ImageRedactionRegion | null = null;
let redactionDraftCaptureId: string | null = null;
let stepFormStepId: string | null = null;
let stepFormTitle = '';
let stepFormDescription = '';
let stepFormExpectedResult = '';
let stepFormDirty = false;
let manualTitleDraft = '';
let manualAuthorDraft = '';
let manualDescriptionDraft = '';
let manualMetaDirty = false;
let backendApiBaseUrlDraft = '';
let backendAuthTokenDraft: string | null = null;
let backendUserIdDraft: string | null = null;
let backendUsernameDraft = '';
let backendDisplayNameDraft = '';
let backendPasswordDraft = '';
let backendStartedByDraft = '';
let backendWorkspaceIdDraft = '';
let backendSystemIdDraft = '';
let backendModuleIdDraft = '';
let backendActionIdDraft = '';
let backendManualIdDraft = '';
let backendStorageProviderDraft: BackendSyncSettings['storageProvider'] = null;
let backendSettingsDirty = false;
let backendCatalog: WorkspaceOverview | null = null;
let backendWorkspaces: RemoteWorkspaceRecord[] = [];
let backendManuals: RemoteManualSummary[] = [];
let newWorkspaceNameDraft = '';
let newSystemNameDraft = '';
let newModuleNameDraft = '';
let newActionNameDraft = '';
let collaboratorUsernameDraft = '';
let collaboratorRoleDraft: RemoteWorkspaceMemberRole = 'editor';
let systemExportState: SystemExportState = 'idle';
let systemExportMessage = '';

const captureImageCache = new Map<string, Promise<HTMLImageElement>>();

const statusBadge = queryElement<HTMLSpanElement>('status-badge');
const captureViewportButton = queryElement<HTMLButtonElement>('capture-viewport-button');
const toggleCaptureModeButton = queryElement<HTMLButtonElement>('toggle-capture-mode-button');
const clearCapturesButton = queryElement<HTMLButtonElement>('clear-captures-button');
const summaryTitle = queryElement<HTMLParagraphElement>('summary-title');
const summaryText = queryElement<HTMLParagraphElement>('summary-text');
const backendConnectionBadge = queryElement<HTMLSpanElement>('backend-connection-badge');
const backendApiUrlInput = queryElement<HTMLInputElement>('backend-api-url-input');
const backendUsernameInput = queryElement<HTMLInputElement>('backend-username-input');
const backendPasswordInput = queryElement<HTMLInputElement>('backend-password-input');
const backendWorkspaceSelect = queryElement<HTMLSelectElement>('backend-workspace-select');
const backendSystemSelect = queryElement<HTMLSelectElement>('backend-system-select');
const backendModuleSelect = queryElement<HTMLSelectElement>('backend-module-select');
const backendActionSelect = queryElement<HTMLSelectElement>('backend-action-select');
const backendManualSelect = queryElement<HTMLSelectElement>('backend-manual-select');
const newWorkspaceNameInput = queryElement<HTMLInputElement>('new-workspace-name-input');
const newSystemNameInput = queryElement<HTMLInputElement>('new-system-name-input');
const newModuleNameInput = queryElement<HTMLInputElement>('new-module-name-input');
const newActionNameInput = queryElement<HTMLInputElement>('new-action-name-input');
const createSystemButton = queryElement<HTMLButtonElement>('create-system-button');
const createWorkspaceButton = queryElement<HTMLButtonElement>('create-workspace-button');
const createModuleButton = queryElement<HTMLButtonElement>('create-module-button');
const createActionButton = queryElement<HTMLButtonElement>('create-action-button');
const collaboratorUsernameInput = queryElement<HTMLInputElement>('collaborator-username-input');
const collaboratorRoleSelect = queryElement<HTMLSelectElement>('collaborator-role-select');
const addCollaboratorButton = queryElement<HTMLButtonElement>('add-collaborator-button');
const backendSyncStatusText = queryElement<HTMLParagraphElement>('backend-sync-status-text');
const backendLoginButton = queryElement<HTMLButtonElement>('backend-login-button');
const backendRegisterButton = queryElement<HTMLButtonElement>('backend-register-button');
const createRemoteManualButton = queryElement<HTMLButtonElement>('create-remote-manual-button');
const loadRemoteManualButton = queryElement<HTMLButtonElement>('load-remote-manual-button');
const exportSystemPdfButton = queryElement<HTMLButtonElement>('export-system-pdf-button');
const systemExportStatus = queryElement<HTMLParagraphElement>('system-export-status');
const pendingSection = queryElement<HTMLElement>('pending-section');
const pendingSelector = queryElement<HTMLParagraphElement>('pending-selector');
const errorSection = queryElement<HTMLElement>('error-section');
const errorText = queryElement<HTMLParagraphElement>('error-text');
const previewSection = queryElement<HTMLElement>('preview-section');
const reviewEmptySection = queryElement<HTMLElement>('review-empty-section');
const captureCanvas = queryElement<HTMLCanvasElement>('capture-canvas');
const toggleRedactionButton = queryElement<HTMLButtonElement>('toggle-redaction-button');
const undoRedactionButton = queryElement<HTMLButtonElement>('undo-redaction-button');
const clearRedactionsButton = queryElement<HTMLButtonElement>('clear-redactions-button');
const redactionCount = queryElement<HTMLSpanElement>('redaction-count');
const redactionHint = queryElement<HTMLParagraphElement>('redaction-hint');
const previewCaption = queryElement<HTMLParagraphElement>('preview-caption');
const captureHeading = queryElement<HTMLHeadingElement>('capture-heading');
const captureTime = queryElement<HTMLParagraphElement>('capture-time');
const confirmCaptureButton = queryElement<HTMLButtonElement>('confirm-capture-button');
const discardCaptureButton = queryElement<HTMLButtonElement>('discard-capture-button');
const queueCount = queryElement<HTMLParagraphElement>('queue-count');
const historyList = queryElement<HTMLDivElement>('history-list');
const detailTag = queryElement<HTMLElement>('detail-tag');
const detailId = queryElement<HTMLElement>('detail-id');
const detailSelector = queryElement<HTMLElement>('detail-selector');
const detailText = queryElement<HTMLParagraphElement>('detail-text');
const detailPage = queryElement<HTMLParagraphElement>('detail-page');
const detailRect = queryElement<HTMLElement>('detail-rect');
const detailViewport = queryElement<HTMLElement>('detail-viewport');
const detailSurface = queryElement<HTMLElement>('detail-surface');
const stepEditorSection = queryElement<HTMLElement>('step-editor-section');
const stepEmptySection = queryElement<HTMLElement>('step-empty-section');
const stepPreviewImage = queryElement<HTMLImageElement>('step-preview-image');
const stepHeading = queryElement<HTMLHeadingElement>('step-heading');
const stepMeta = queryElement<HTMLParagraphElement>('step-meta');
const stepTitleInput = queryElement<HTMLInputElement>('step-title-input');
const stepDescriptionInput = queryElement<HTMLTextAreaElement>('step-description-input');
const stepExpectedResultInput = queryElement<HTMLTextAreaElement>('step-expected-result-input');
const saveStepButton = queryElement<HTMLButtonElement>('save-step-button');
const moveStepUpButton = queryElement<HTMLButtonElement>('move-step-up-button');
const moveStepDownButton = queryElement<HTMLButtonElement>('move-step-down-button');
const deleteStepButton = queryElement<HTMLButtonElement>('delete-step-button');
const downloadOriginalButton = queryElement<HTMLButtonElement>('download-original-button');
const stepDetailSelector = queryElement<HTMLElement>('step-detail-selector');
const stepDetailPage = queryElement<HTMLParagraphElement>('step-detail-page');
const stepDetailCreatedAt = queryElement<HTMLParagraphElement>('step-detail-created-at');
const stepsCount = queryElement<HTMLParagraphElement>('steps-count');
const stepsList = queryElement<HTMLDivElement>('steps-list');
const exportJsonButton = queryElement<HTMLButtonElement>('export-json-button');
const exportImagesButton = queryElement<HTMLButtonElement>('export-images-button');
const clearManualButton = queryElement<HTMLButtonElement>('clear-manual-button');
const manualTitleInput = queryElement<HTMLInputElement>('manual-title-input');
const manualAuthorInput = queryElement<HTMLInputElement>('manual-author-input');
const manualDescriptionInput = queryElement<HTMLTextAreaElement>('manual-description-input');
const saveManualMetaButton = queryElement<HTMLButtonElement>('save-manual-meta-button');
const openPrintViewButton = queryElement<HTMLButtonElement>('open-print-view-button');

void initializeSidePanel();

async function initializeSidePanel(): Promise<void> {
  captureViewportButton.addEventListener('click', () => {
    void runPanelAction(handleCaptureViewport);
  });

  toggleCaptureModeButton.addEventListener('click', () => {
    void runPanelAction(handleToggleCaptureMode);
  });

  clearCapturesButton.addEventListener('click', () => {
    void browser.runtime.sendMessage({
      type: MESSAGE_TYPE_CLEAR_CAPTURES,
    });
  });

  backendApiUrlInput.addEventListener('input', () => {
    backendApiBaseUrlDraft = backendApiUrlInput.value;
    backendSettingsDirty = true;
    renderBackendSyncSection();
  });

  backendUsernameInput.addEventListener('input', () => {
    backendUsernameDraft = backendUsernameInput.value;
    backendSettingsDirty = true;
    renderBackendSyncSection();
  });

  backendPasswordInput.addEventListener('input', () => {
    backendPasswordDraft = backendPasswordInput.value;
    renderBackendSyncSection();
  });

  backendWorkspaceSelect.addEventListener('change', () => {
    backendWorkspaceIdDraft = backendWorkspaceSelect.value;
    systemExportState = 'idle';
    systemExportMessage = '';
    backendSystemIdDraft = '';
    backendModuleIdDraft = '';
    backendActionIdDraft = '';
    backendManualIdDraft = '';
    backendCatalog = null;
    backendManuals = [];
    backendSettingsDirty = true;
    void runPanelAction(async () => {
      await resetVisibleManualDraftForRemoteContext();
      await loadBackendCatalogForDraft();
      await persistBackendSettingsDraft();
    });
  });

  backendSystemSelect.addEventListener('change', () => {
    backendSystemIdDraft = backendSystemSelect.value;
    systemExportState = 'idle';
    systemExportMessage = '';
    backendModuleIdDraft = '';
    backendActionIdDraft = '';
    backendManualIdDraft = '';
    backendManuals = [];
    backendSettingsDirty = true;
    renderBackendSyncSection();
    void runPanelAction(async () => {
      await resetVisibleManualDraftForRemoteContext();
      await persistBackendSettingsDraft();
    });
  });

  backendModuleSelect.addEventListener('change', () => {
    backendModuleIdDraft = backendModuleSelect.value;
    backendActionIdDraft = '';
    backendManualIdDraft = '';
    backendManuals = [];
    backendSettingsDirty = true;
    renderBackendSyncSection();
    void runPanelAction(async () => {
      await resetVisibleManualDraftForRemoteContext();
      await persistBackendSettingsDraft();
    });
  });

  backendActionSelect.addEventListener('change', () => {
    backendActionIdDraft = backendActionSelect.value;
    backendManualIdDraft = '';
    backendSettingsDirty = true;
    void runPanelAction(async () => {
      await resetVisibleManualDraftForRemoteContext();
      await loadManualsForSelectedAction();
      await persistBackendSettingsDraft();
    });
  });

  backendManualSelect.addEventListener('change', () => {
    backendManualIdDraft = backendManualSelect.value;
    backendSettingsDirty = true;
    renderBackendSyncSection();
    void runPanelAction(async () => {
      await resetVisibleManualDraftForRemoteContext(buildManualDraftSeedFromSummary(getSelectedRemoteManual()));
      await persistBackendSettingsDraft();
    });
  });

  newSystemNameInput.addEventListener('input', () => {
    newSystemNameDraft = newSystemNameInput.value;
    renderBackendSyncSection();
  });

  newWorkspaceNameInput.addEventListener('input', () => {
    newWorkspaceNameDraft = newWorkspaceNameInput.value;
    renderBackendSyncSection();
  });

  newModuleNameInput.addEventListener('input', () => {
    newModuleNameDraft = newModuleNameInput.value;
    renderBackendSyncSection();
  });

  newActionNameInput.addEventListener('input', () => {
    newActionNameDraft = newActionNameInput.value;
    renderBackendSyncSection();
  });

  collaboratorUsernameInput.addEventListener('input', () => {
    collaboratorUsernameDraft = collaboratorUsernameInput.value;
    renderBackendSyncSection();
  });

  collaboratorRoleSelect.addEventListener('change', () => {
    collaboratorRoleDraft = parseWorkspaceMemberRole(collaboratorRoleSelect.value);
    renderBackendSyncSection();
  });

  confirmCaptureButton.addEventListener('click', () => {
    void runPanelAction(handleConfirmSelectedCapture);
  });

  discardCaptureButton.addEventListener('click', () => {
    void runPanelAction(handleDiscardSelectedCapture);
  });

  toggleRedactionButton.addEventListener('click', () => {
    redactionModeEnabled = !redactionModeEnabled;
    resetRedactionDraft();
    renderCapturePreview(getSelectedCapture());
  });

  undoRedactionButton.addEventListener('click', () => {
    void runPanelAction(handleUndoRedaction);
  });

  clearRedactionsButton.addEventListener('click', () => {
    void runPanelAction(handleClearRedactions);
  });

  captureCanvas.addEventListener('pointerdown', handleRedactionPointerDown);
  captureCanvas.addEventListener('pointermove', handleRedactionPointerMove);
  captureCanvas.addEventListener('pointerup', handleRedactionPointerUp);
  captureCanvas.addEventListener('pointercancel', handleRedactionPointerCancel);

  saveStepButton.addEventListener('click', () => {
    void runPanelAction(handleSaveSelectedStep);
  });

  moveStepUpButton.addEventListener('click', () => {
    void runPanelAction(async () => {
      await moveSelectedStep(-1);
    });
  });

  moveStepDownButton.addEventListener('click', () => {
    void runPanelAction(async () => {
      await moveSelectedStep(1);
    });
  });

  deleteStepButton.addEventListener('click', () => {
    void runPanelAction(handleDeleteSelectedStep);
  });

  downloadOriginalButton.addEventListener('click', () => {
    handleDownloadSelectedStepImage('original');
  });

  exportJsonButton.addEventListener('click', () => {
    void runPanelAction(handleExportManualJson);
  });

  exportImagesButton.addEventListener('click', () => {
    void runPanelAction(handleExportManualImages);
  });

  clearManualButton.addEventListener('click', () => {
    void runPanelAction(handleClearManualDraft);
  });

  saveManualMetaButton.addEventListener('click', () => {
    void runPanelAction(handleSaveManualMetadata);
  });

  backendLoginButton.addEventListener('click', () => {
    void runPanelAction(handleBackendLogin);
  });

  backendRegisterButton.addEventListener('click', () => {
    void runPanelAction(handleBackendRegister);
  });

  createRemoteManualButton.addEventListener('click', () => {
    void runPanelAction(handleCreateRemoteManual);
  });

  loadRemoteManualButton.addEventListener('click', () => {
    void runPanelAction(handleLoadRemoteManual);
  });

  exportSystemPdfButton.addEventListener('click', () => {
    void runPanelAction(handleExportSystemPdf);
  });

  createSystemButton.addEventListener('click', () => {
    void runPanelAction(handleCreateRemoteSystem);
  });

  createWorkspaceButton.addEventListener('click', () => {
    void runPanelAction(handleCreateRemoteWorkspace);
  });

  createModuleButton.addEventListener('click', () => {
    void runPanelAction(handleCreateRemoteModule);
  });

  createActionButton.addEventListener('click', () => {
    void runPanelAction(handleCreateRemoteAction);
  });

  addCollaboratorButton.addEventListener('click', () => {
    void runPanelAction(handleAddWorkspaceCollaborator);
  });

  openPrintViewButton.addEventListener('click', () => {
    void runPanelAction(async () => {
      await openManualPage(true);
    });
  });

  stepTitleInput.addEventListener('input', () => {
    stepFormTitle = stepTitleInput.value;
    stepFormDirty = true;
    updateStepActionState(getSelectedStep());
  });

  stepDescriptionInput.addEventListener('input', () => {
    stepFormDescription = stepDescriptionInput.value;
    stepFormDirty = true;
    updateStepActionState(getSelectedStep());
  });

  stepExpectedResultInput.addEventListener('input', () => {
    stepFormExpectedResult = stepExpectedResultInput.value;
    stepFormDirty = true;
    updateStepActionState(getSelectedStep());
  });

  manualTitleInput.addEventListener('input', () => {
    manualTitleDraft = manualTitleInput.value;
    manualMetaDirty = true;
    renderExportState();
  });

  manualAuthorInput.addEventListener('input', () => {
    manualAuthorDraft = manualAuthorInput.value;
    manualMetaDirty = true;
    renderExportState();
  });

  manualDescriptionInput.addEventListener('input', () => {
    manualDescriptionDraft = manualDescriptionInput.value;
    manualMetaDirty = true;
    renderExportState();
  });

  browser.storage.onChanged.addListener((changes, areaName) => {
    const watchedSessionChange =
      areaName === 'session' && Object.prototype.hasOwnProperty.call(changes, PANEL_STATE_STORAGE_KEY);
    const watchedLocalChange =
      areaName === 'local' &&
      (
        Object.prototype.hasOwnProperty.call(changes, MANUAL_DRAFT_STORAGE_KEY) ||
        Object.prototype.hasOwnProperty.call(changes, BACKEND_SYNC_SETTINGS_STORAGE_KEY)
      );

    if (!watchedSessionChange && !watchedLocalChange) {
      return;
    }

    void refreshState();
  });

  await refreshState();
  await tryLoadInitialBackendCatalog();
}

async function refreshState(): Promise<void> {
  const [panelState, manualDraft, backendSettings] = await Promise.all([
    loadPanelState(),
    loadManualDraft(),
    loadBackendSyncSettings(),
  ]);

  currentState = panelState;
  currentDraft = manualDraft;
  currentBackendSettings = backendSettings;

  if (
    selectedCaptureId === null ||
    !currentState.captures.some((capture) => capture.id === selectedCaptureId)
  ) {
    selectedCaptureId = currentState.captures.at(-1)?.id ?? null;
  }

  if (
    selectedStepId === null ||
    !currentDraft.steps.some((step) => step.id === selectedStepId)
  ) {
    selectedStepId = currentDraft.steps[0]?.id ?? null;
  }

  syncStepFormState(getSelectedStep());
  syncManualMetaFormState();
  syncBackendSettingsFormState();
  render();
}

async function tryLoadInitialBackendCatalog(): Promise<void> {
  if (
    !currentBackendSettings.enabled ||
    currentBackendSettings.apiBaseUrl.trim().length === 0 ||
    currentBackendSettings.authToken === null
  ) {
    return;
  }
  const apiBaseUrl = currentBackendSettings.apiBaseUrl;
  const authToken = currentBackendSettings.authToken;
  const workspaceId = currentBackendSettings.workspaceId;

  try {
    const client = createManualBuilderApiClient(apiBaseUrl, authToken);
    const storageStatus = await client.getStorageStatus();
    backendStorageProviderDraft = storageStatus.activeProvider;
    currentBackendSettings = {
      ...currentBackendSettings,
      storageProvider: storageStatus.activeProvider,
    };
    await saveBackendSyncSettings(currentBackendSettings);

    if (currentBackendSettings.workspaceId.trim().length === 0) {
      render();
      return;
    }

    await loadBackendWorkspaces(apiBaseUrl, authToken);
    await loadBackendCatalog(
      apiBaseUrl,
      authToken,
      workspaceId,
    );
    render();
  } catch {
    return;
  }
}

function render(): void {
  const selectedCapture = getSelectedCapture();
  const selectedStep = getSelectedStep();

  renderStatusBadge();
  renderCaptureModeButton();
  renderSummary();
  renderBackendSyncSection();
  renderPendingSection();
  renderErrorSection();
  renderCapturePreview(selectedCapture);
  renderCaptureQueue(selectedCapture);
  renderStepEditor(selectedStep);
  renderStepsList(selectedStep);
  renderManualMetaForm();
  renderExportState();
}

function renderCaptureModeButton(): void {
  const enabled = currentState.captureMode === 'capture-only';
  toggleCaptureModeButton.textContent = enabled ? 'Solo captura: si' : 'Solo captura: no';
  toggleCaptureModeButton.classList.toggle('is-active', enabled);
  toggleCaptureModeButton.setAttribute('aria-pressed', String(enabled));
  toggleCaptureModeButton.disabled = panelBusy || currentState.status === 'capturing';
}

function renderStatusBadge(): void {
  const { text, modifierClass } = getStatusPresentation(currentState, panelBusy);
  statusBadge.textContent = text;
  statusBadge.className = `status-badge ${modifierClass}`;
}

function renderSummary(): void {
  if (currentState.status === 'capturing' && currentState.pendingSelection !== null) {
    summaryTitle.textContent = 'Captura en curso';
    summaryText.textContent = `Procesando ${currentState.pendingSelection.selector}`;
    return;
  }

  if (currentState.status === 'error' && currentState.lastError !== null) {
    summaryTitle.textContent = 'La ultima captura fallo';
    summaryText.textContent = currentState.lastError;
    return;
  }

  if (currentDraft.steps.length > 0 || currentState.captures.length > 0) {
    summaryTitle.textContent = `${currentDraft.steps.length} paso${currentDraft.steps.length === 1 ? '' : 's'} en el manual`;
    summaryText.textContent =
      `${currentState.captures.length} captura${currentState.captures.length === 1 ? '' : 's'} en revision | Superficie: ${formatReviewSurface(currentState.reviewSurface)}${currentState.captureMode === 'capture-only' ? ' | Solo captura activo' : ''}`;
    return;
  }

  if (currentState.captureMode === 'capture-only') {
    summaryTitle.textContent = 'Solo captura listo';
    summaryText.textContent = 'Presiona ALT + S en la pagina. Cada clic capturara primero, reproducira despues la accion del elemento y mantendra el selector activo hasta que presiones ESC.';
    return;
  }

  summaryTitle.textContent = 'Esperando una seleccion';
  summaryText.textContent = 'Captura un elemento para revisarlo y luego convertirlo en un paso del manual.';
}

function renderBackendSyncSection(): void {
  backendApiUrlInput.value = backendApiBaseUrlDraft;
  backendUsernameInput.value = backendUsernameDraft;
  backendPasswordInput.value = backendPasswordDraft;
  newWorkspaceNameInput.value = newWorkspaceNameDraft;
  newSystemNameInput.value = newSystemNameDraft;
  newModuleNameInput.value = newModuleNameDraft;
  newActionNameInput.value = newActionNameDraft;
  collaboratorUsernameInput.value = collaboratorUsernameDraft;
  collaboratorRoleSelect.value = collaboratorRoleDraft;
  renderCatalogSelectors();
  backendSyncStatusText.textContent = buildBackendSyncStatusText();
  renderSystemExportStatus();

  const hasApiUrlDraft = backendApiBaseUrlDraft.trim().length > 0;
  const isAuthenticated = backendAuthTokenDraft !== null && backendAuthTokenDraft.trim().length > 0;
  const hasWorkspaceDraft = backendWorkspaceIdDraft.trim().length > 0;
  const hasConnectionDraft =
    hasApiUrlDraft &&
    isAuthenticated &&
    hasWorkspaceDraft &&
    backendStartedByDraft.trim().length > 0 &&
    backendActionIdDraft.trim().length > 0;
  const canCreateRemoteManual = hasConnectionDraft && getEffectiveManualTitle().length > 0;
  const canLoadRemoteManual = hasConnectionDraft && backendManualIdDraft.trim().length > 0;
  const canExportSystem = hasApiUrlDraft && isAuthenticated && backendSystemIdDraft.trim().length > 0;
  const canLogin = hasApiUrlDraft && backendUsernameDraft.trim().length >= 2 && backendPasswordDraft.length >= 6;
  const isReady = isAuthenticated && backendActionIdDraft.trim().length > 0;
  const usesLocalStorage = backendStorageProviderDraft === 'local';

  backendConnectionBadge.textContent = isReady
    ? usesLocalStorage ? 'API en modo local' : 'OneDrive activo'
    : isAuthenticated ? 'Cuenta conectada' : 'Sin conectar';
  backendConnectionBadge.className = `connection-badge ${isReady ? usesLocalStorage ? 'is-warning' : 'is-ready' : isAuthenticated ? 'is-connected' : ''}`;

  backendLoginButton.disabled = panelBusy || !canLogin;
  backendRegisterButton.disabled = panelBusy || !canLogin;
  createRemoteManualButton.disabled = panelBusy || !canCreateRemoteManual;
  loadRemoteManualButton.disabled = panelBusy || !canLoadRemoteManual;
  exportSystemPdfButton.disabled = panelBusy || !canExportSystem;
  createWorkspaceButton.disabled =
    panelBusy ||
    !hasApiUrlDraft ||
    !isAuthenticated ||
    newWorkspaceNameDraft.trim().length < 2;
  createSystemButton.disabled =
    panelBusy ||
    !hasApiUrlDraft ||
    !isAuthenticated ||
    !hasWorkspaceDraft ||
    newSystemNameDraft.trim().length < 2;
  createModuleButton.disabled =
    panelBusy ||
    !hasApiUrlDraft ||
    !isAuthenticated ||
    backendSystemIdDraft.trim().length === 0 ||
    newModuleNameDraft.trim().length < 2;
  createActionButton.disabled =
    panelBusy ||
    !hasApiUrlDraft ||
    !isAuthenticated ||
    backendModuleIdDraft.trim().length === 0 ||
    newActionNameDraft.trim().length < 2;
  addCollaboratorButton.disabled =
    panelBusy ||
    !hasApiUrlDraft ||
    !isAuthenticated ||
    !hasWorkspaceDraft ||
    collaboratorUsernameDraft.trim().length < 2;
}

function renderSystemExportStatus(): void {
  systemExportStatus.hidden = systemExportState === 'idle';
  systemExportStatus.dataset.state = systemExportState;
  systemExportStatus.textContent = systemExportMessage;
}

function setSystemExportStatus(state: SystemExportState, message: string): void {
  systemExportState = state;
  systemExportMessage = message;
  renderSystemExportStatus();
}

function renderCatalogSelectors(): void {
  const systems = backendCatalog?.systems ?? [];
  const selectedSystem = getSelectedRemoteSystem();
  const modules = selectedSystem?.systemModules ?? [];
  const selectedModule = getSelectedRemoteModule();
  const actions = selectedModule?.actions ?? [];

  renderSelectOptions(
    backendWorkspaceSelect,
    backendWorkspaces,
    backendWorkspaceIdDraft,
    backendAuthTokenDraft === null ? 'Inicia sesion' : 'Selecciona un workspace',
    (workspace) => workspace.id,
    (workspace) => workspace.name,
  );

  renderSelectOptions(
    backendSystemSelect,
    systems,
    backendSystemIdDraft,
    backendWorkspaceIdDraft.length === 0 ? 'Selecciona un workspace' : 'Selecciona un sistema',
    (system) => system.id,
    (system) => system.name,
  );

  renderSelectOptions(
    backendModuleSelect,
    modules,
    backendModuleIdDraft,
    backendSystemIdDraft.length === 0 ? 'Selecciona un sistema' : 'Selecciona un modulo',
    (systemModule) => systemModule.id,
    (systemModule) => systemModule.name,
  );

  renderSelectOptions(
    backendActionSelect,
    actions,
    backendActionIdDraft,
    backendModuleIdDraft.length === 0 ? 'Selecciona un modulo' : 'Selecciona una accion',
    (action) => action.id,
    (action) => action.name,
  );

  renderSelectOptions(
    backendManualSelect,
    backendManuals,
    backendManualIdDraft,
    backendActionIdDraft.length === 0 ? 'Selecciona una accion' : 'Selecciona o crea un manual',
    (manual) => manual.id,
    (manual) => `${manual.title} (${manual.stepCount} paso${manual.stepCount === 1 ? '' : 's'})`,
  );

  backendWorkspaceSelect.disabled = backendAuthTokenDraft === null || backendWorkspaces.length === 0;
  backendSystemSelect.disabled = backendWorkspaceIdDraft.length === 0 || systems.length === 0;
  backendModuleSelect.disabled = backendSystemIdDraft.length === 0 || modules.length === 0;
  backendActionSelect.disabled = backendModuleIdDraft.length === 0 || actions.length === 0;
  backendManualSelect.disabled = backendActionIdDraft.length === 0 || backendManuals.length === 0;
}

function renderSelectOptions<TItem>(
  select: HTMLSelectElement,
  items: TItem[],
  selectedValue: string,
  placeholder: string,
  getValue: (item: TItem) => string,
  getLabel: (item: TItem) => string,
): void {
  select.replaceChildren();

  const placeholderOption = document.createElement('option');
  placeholderOption.value = '';
  placeholderOption.textContent = placeholder;
  select.appendChild(placeholderOption);

  for (const item of items) {
    const option = document.createElement('option');
    option.value = getValue(item);
    option.textContent = getLabel(item);
    select.appendChild(option);
  }

  select.value = items.some((item) => getValue(item) === selectedValue) ? selectedValue : '';
}

function renderPendingSection(): void {
  if (currentState.status === 'capturing' && currentState.pendingSelection !== null) {
    pendingSection.hidden = false;
    pendingSelector.textContent = currentState.pendingSelection.selector;
    return;
  }

  pendingSection.hidden = true;
  pendingSelector.textContent = '';
}

function renderErrorSection(): void {
  const selectedCaptureError = getSelectedCapture()?.remoteSyncError ?? null;
  const visibleError = currentState.lastError ?? selectedCaptureError ?? currentBackendSettings.lastError;
  errorSection.hidden = visibleError === null;
  errorText.textContent = visibleError ?? '';
}

function renderCapturePreview(selectedCapture: CapturedSelectionRecord | null): void {
  previewRenderToken += 1;

  if (selectedCapture === null) {
    redactionModeEnabled = false;
    resetRedactionDraft();
    previewSection.hidden = true;
    reviewEmptySection.hidden = false;
    previewCaption.textContent = '';
    clearPreviewCanvas();
    return;
  }

  reviewEmptySection.hidden = true;
  previewSection.hidden = false;
  captureHeading.textContent = selectedCapture.selectedElement.pageTitle || 'Pagina sin titulo';
  captureTime.textContent = formatTimestamp(selectedCapture.createdAt);
  previewCaption.textContent = selectedCapture.captureTarget === 'viewport'
    ? 'Captura de la pantalla visible completa, sin selector ni resaltado de elemento.'
    : getPreviewCaption('full');
  detailTag.textContent = selectedCapture.selectedElement.tagName;
  detailId.textContent = selectedCapture.selectedElement.id ?? 'Sin ID';
  detailSelector.textContent = selectedCapture.selectedElement.selector;
  detailText.textContent = selectedCapture.selectedElement.text ?? 'Sin texto visible';
  detailPage.textContent = selectedCapture.selectedElement.url;
  detailRect.textContent = formatRect(selectedCapture.selectedElement.rect);
  detailViewport.textContent = formatViewport(selectedCapture);
  detailSurface.textContent = `${selectedCapture.captureTarget === 'viewport' ? 'Pantalla visible' : formatReviewSurface(currentState.reviewSurface)} | ${formatRemoteSyncStatus(selectedCapture.remoteSyncStatus)}`;
  confirmCaptureButton.disabled = panelBusy;
  discardCaptureButton.disabled = panelBusy;
  const regionCount = selectedCapture.redactionRegions.length;
  toggleRedactionButton.disabled = panelBusy;
  toggleRedactionButton.classList.toggle('is-active', redactionModeEnabled);
  toggleRedactionButton.setAttribute('aria-pressed', String(redactionModeEnabled));
  toggleRedactionButton.textContent = redactionModeEnabled
    ? 'Ocultando informacion'
    : 'Ocultar informacion';
  undoRedactionButton.disabled = panelBusy || regionCount === 0;
  clearRedactionsButton.disabled = panelBusy || regionCount === 0;
  redactionCount.textContent = `${regionCount} zona${regionCount === 1 ? '' : 's'} oculta${regionCount === 1 ? '' : 's'}`;
  redactionHint.textContent = redactionModeEnabled
    ? 'Arrastra sobre cada dato sensible. El difuminado se aplicara al original y al contexto antes de subirlos.'
    : 'Activa Ocultar informacion y arrastra sobre cada dato sensible antes de agregar el paso.';
  captureCanvas.classList.toggle('is-redacting', redactionModeEnabled);

  const renderToken = previewRenderToken;
  void drawPreview(selectedCapture, 'full', renderToken);
}

function renderCaptureQueue(selectedCapture: CapturedSelectionRecord | null): void {
  queueCount.textContent = `${currentState.captures.length} captura${currentState.captures.length === 1 ? '' : 's'}`;
  historyList.replaceChildren();

  if (currentState.captures.length === 0) {
    const placeholder = document.createElement('p');
    placeholder.className = 'history-placeholder';
    placeholder.textContent = 'No hay capturas pendientes de confirmacion.';
    historyList.appendChild(placeholder);
    return;
  }

  const fragment = document.createDocumentFragment();

  for (const capture of [...currentState.captures].reverse()) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = capture.id === selectedCapture?.id ? 'history-item is-active' : 'history-item';
    if (capture.remoteSyncStatus === 'error') {
      button.classList.add('has-error');
      button.title = capture.remoteSyncError ?? 'La captura no se sincronizo con el backend.';
    }
    button.disabled = panelBusy;
    button.addEventListener('click', () => {
      resetRedactionDraft();
      selectedCaptureId = capture.id;
      render();
    });

    const thumbnail = document.createElement('img');
    thumbnail.className = 'history-thumb';
    thumbnail.src = capture.imageDataUrl;
    thumbnail.alt = `Captura pendiente ${capture.selectedElement.selector}`;

    const content = document.createElement('div');
    content.className = 'history-copy';

    const title = document.createElement('strong');
    title.textContent = capture.selectedElement.selector;

    const subtitle = document.createElement('span');
    subtitle.textContent =
      `${capture.selectedElement.tagName} | ${formatTimestamp(capture.createdAt)} | ${formatRemoteSyncStatus(capture.remoteSyncStatus)}`;

    const text = document.createElement('span');
    text.textContent = capture.selectedElement.text ?? capture.selectedElement.pageTitle;

    content.append(title, subtitle, text);
    button.append(thumbnail, content);
    fragment.appendChild(button);
  }

  historyList.appendChild(fragment);
}

function renderStepEditor(selectedStep: ManualStep | null): void {
  if (selectedStep === null) {
    stepEditorSection.hidden = true;
    stepEmptySection.hidden = false;
    stepPreviewImage.removeAttribute('src');
    return;
  }

  stepEmptySection.hidden = true;
  stepEditorSection.hidden = false;
  stepPreviewImage.src = selectedStep.imageOriginalDataUrl;
  stepPreviewImage.alt = `Vista del ${selectedStep.title}`;
  stepHeading.textContent = selectedStep.title;
  stepMeta.textContent =
    `Paso ${selectedStep.order} | ${selectedStep.pageTitle || 'Pagina sin titulo'} | ${formatRemoteSyncStatus(selectedStep.remoteSyncStatus)}${selectedStep.remoteSyncError ? ` | ${selectedStep.remoteSyncError}` : ''}`;
  stepTitleInput.value = stepFormTitle;
  stepDescriptionInput.value = stepFormDescription;
  stepExpectedResultInput.value = stepFormExpectedResult;
  stepDetailSelector.textContent = selectedStep.selector;
  stepDetailPage.textContent = selectedStep.url;
  stepDetailCreatedAt.textContent = formatTimestamp(selectedStep.createdAt);

  updateStepActionState(selectedStep);
}

function renderStepsList(selectedStep: ManualStep | null): void {
  stepsCount.textContent = `${currentDraft.steps.length} paso${currentDraft.steps.length === 1 ? '' : 's'}`;
  stepsList.replaceChildren();

  if (currentDraft.steps.length === 0) {
    const placeholder = document.createElement('p');
    placeholder.className = 'history-placeholder';
    placeholder.textContent = 'Todavia no has confirmado ningun paso del manual.';
    stepsList.appendChild(placeholder);
    return;
  }

  const fragment = document.createDocumentFragment();

  for (const step of currentDraft.steps) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = step.id === selectedStep?.id ? 'step-item is-active' : 'step-item';
    button.disabled = panelBusy;
    button.draggable = !panelBusy;
    button.dataset.stepId = step.id;
    button.title = `Paso ${step.order}. Arrastra para reordenar o haz clic para editar.`;
    button.setAttribute('aria-label', `Paso ${step.order}: ${step.title}. Arrastra para reordenar.`);
    button.addEventListener('click', () => {
      if (stepDragJustFinished) {
        stepDragJustFinished = false;
        return;
      }

      selectedStepId = step.id;
      stepFormDirty = false;
      syncStepFormState(step);
      render();
    });
    button.addEventListener('dragstart', (event) => {
      if (panelBusy) {
        event.preventDefault();
        return;
      }

      draggedStepId = step.id;
      button.classList.add('is-dragging');
      stepsList.classList.add('is-reordering');
      event.dataTransfer?.setData('text/plain', step.id);
      if (event.dataTransfer !== null) {
        event.dataTransfer.effectAllowed = 'move';
      }
    });
    button.addEventListener('dragover', (event) => {
      if (draggedStepId === null || draggedStepId === step.id || panelBusy) {
        return;
      }

      event.preventDefault();
      if (event.dataTransfer !== null) {
        event.dataTransfer.dropEffect = 'move';
      }
      showStepDropIndicator(button, getStepDropPosition(button, event.clientY));
    });
    button.addEventListener('dragleave', (event) => {
      if (event.relatedTarget instanceof Node && button.contains(event.relatedTarget)) {
        return;
      }
      clearStepDropIndicator(button);
    });
    button.addEventListener('drop', (event) => {
      event.preventDefault();
      const sourceStepId = draggedStepId ?? event.dataTransfer?.getData('text/plain') ?? null;
      const dropPosition = getStepDropPosition(button, event.clientY);
      clearStepDragState();

      if (sourceStepId === null || sourceStepId === step.id) {
        return;
      }

      stepDragJustFinished = true;
      void runPanelAction(async () => {
        await reorderStepByDrop(sourceStepId, step.id, dropPosition);
      });
    });
    button.addEventListener('dragend', () => {
      stepDragJustFinished = stepDragJustFinished || draggedStepId !== null;
      clearStepDragState();
      window.setTimeout(() => {
        stepDragJustFinished = false;
      }, 0);
    });

    const orderBadge = document.createElement('span');
    orderBadge.className = 'step-order';
    orderBadge.textContent = `${step.order}`;

    const copy = document.createElement('div');
    copy.className = 'step-copy';

    const title = document.createElement('strong');
    title.textContent = step.title;

    const subtitle = document.createElement('span');
    subtitle.textContent =
      `${step.selector} | ${formatTimestamp(step.createdAt)} | ${formatRemoteSyncStatus(step.remoteSyncStatus)}`;

    const description = document.createElement('span');
    description.textContent = step.description || step.pageTitle;

    const dragHandle = document.createElement('span');
    dragHandle.className = 'step-drag-handle';
    dragHandle.textContent = '⋮⋮';
    dragHandle.setAttribute('aria-hidden', 'true');

    copy.append(title, subtitle, description);
    button.append(orderBadge, copy, dragHandle);
    fragment.appendChild(button);
  }

  stepsList.appendChild(fragment);
}

function renderManualMetaForm(): void {
  manualTitleInput.value = manualTitleDraft;
  manualAuthorInput.value = manualAuthorDraft;
  manualDescriptionInput.value = manualDescriptionDraft;
}

function renderExportState(): void {
  const hasSteps = currentDraft.steps.length > 0;
  exportJsonButton.disabled = !hasSteps || panelBusy;
  exportImagesButton.disabled = !hasSteps || panelBusy;
  clearManualButton.disabled = !hasSteps || panelBusy;
  openPrintViewButton.disabled = !hasSteps || panelBusy;
  saveManualMetaButton.disabled = panelBusy || !manualMetaDirty;
  captureViewportButton.disabled = panelBusy || currentState.status === 'capturing';
  clearCapturesButton.disabled =
    (currentState.captures.length === 0 && currentState.pendingSelection === null) || panelBusy;
}

function updateStepActionState(selectedStep: ManualStep | null): void {
  const hasSelectedStep = selectedStep !== null;

  saveStepButton.disabled = !hasSelectedStep || !stepFormDirty || panelBusy;
  moveStepUpButton.disabled = !hasSelectedStep || panelBusy || selectedStep?.order === 1;
  moveStepDownButton.disabled =
    !hasSelectedStep || panelBusy || selectedStep?.order === currentDraft.steps.length;
  deleteStepButton.disabled = !hasSelectedStep || panelBusy;
  downloadOriginalButton.disabled = !hasSelectedStep || panelBusy;
}

async function drawPreview(
  capture: CapturedSelectionRecord,
  mode: PreviewMode,
  renderToken: number,
): Promise<void> {
  try {
    const image = await loadCaptureImage(capture.imageDataUrl);
    if (renderToken !== previewRenderToken) {
      return;
    }

    const draftRegions = redactionDraftCaptureId === capture.id && redactionDraft !== null
      ? [...capture.redactionRegions, redactionDraft]
      : capture.redactionRegions;
    drawCapturePreviewToCanvas(captureCanvas, image, capture, mode, draftRegions);
  } catch (error) {
    if (renderToken !== previewRenderToken) {
      return;
    }

    clearPreviewCanvas();
    previewCaption.textContent = `No se pudo dibujar la vista previa: ${getErrorMessage(error)}`;
  }
}

async function handleCaptureViewport(): Promise<void> {
  try {
    await browser.runtime.sendMessage({ type: MESSAGE_TYPE_CAPTURE_VIEWPORT_REQUEST });
  } catch (error) {
    const panelState = await loadPanelState();
    await savePanelState({
      ...panelState,
      status: 'error',
      pendingSelection: null,
      lastError: getErrorMessage(error),
      lastUpdatedAt: new Date().toISOString(),
    });
  }

  await refreshState();
}

async function handleToggleCaptureMode(): Promise<void> {
  const panelState = await loadPanelState();
  await savePanelState({
    ...panelState,
    captureMode: panelState.captureMode === 'capture-only' ? 'review' : 'capture-only',
    lastUpdatedAt: new Date().toISOString(),
  });
  await refreshState();
}

function handleRedactionPointerDown(event: PointerEvent): void {
  const capture = getSelectedCapture();
  if (!redactionModeEnabled || panelBusy || capture === null || event.button !== 0) {
    return;
  }

  event.preventDefault();
  captureCanvas.setPointerCapture(event.pointerId);
  redactionDragStart = getNormalizedCanvasPoint(event);
  redactionDraft = null;
  redactionDraftCaptureId = capture.id;
}

function handleRedactionPointerMove(event: PointerEvent): void {
  if (redactionDragStart === null || redactionDraftCaptureId === null) {
    return;
  }

  event.preventDefault();
  redactionDraft = createRedactionRegion(redactionDragStart, getNormalizedCanvasPoint(event));
  redrawSelectedCapture();
}

function handleRedactionPointerUp(event: PointerEvent): void {
  if (redactionDragStart === null || redactionDraftCaptureId === null) {
    return;
  }

  event.preventDefault();
  const captureId = redactionDraftCaptureId;
  const region = createRedactionRegion(redactionDragStart, getNormalizedCanvasPoint(event));
  resetRedactionDraft();
  if (captureCanvas.hasPointerCapture(event.pointerId)) {
    captureCanvas.releasePointerCapture(event.pointerId);
  }

  if (region.width < 0.006 || region.height < 0.006) {
    redrawSelectedCapture();
    return;
  }

  void runPanelAction(async () => {
    await updateCaptureRedactions(captureId, (regions) => [...regions, region]);
  });
}

function handleRedactionPointerCancel(event: PointerEvent): void {
  resetRedactionDraft();
  if (captureCanvas.hasPointerCapture(event.pointerId)) {
    captureCanvas.releasePointerCapture(event.pointerId);
  }
  redrawSelectedCapture();
}

async function handleUndoRedaction(): Promise<void> {
  const capture = getSelectedCapture();
  if (capture === null) {
    return;
  }

  await updateCaptureRedactions(capture.id, (regions) => regions.slice(0, -1));
}

async function handleClearRedactions(): Promise<void> {
  const capture = getSelectedCapture();
  if (capture === null) {
    return;
  }

  await updateCaptureRedactions(capture.id, () => []);
}

async function updateCaptureRedactions(
  captureId: string,
  update: (regions: ImageRedactionRegion[]) => ImageRedactionRegion[],
): Promise<void> {
  const panelState = await loadPanelState();
  if (!panelState.captures.some((capture) => capture.id === captureId)) {
    await refreshState();
    return;
  }

  await savePanelState({
    ...panelState,
    captures: panelState.captures.map((capture) => capture.id === captureId
      ? { ...capture, redactionRegions: update(capture.redactionRegions) }
      : capture),
    lastUpdatedAt: new Date().toISOString(),
  });
  await refreshState();
}

function getNormalizedCanvasPoint(event: PointerEvent): NormalizedPoint {
  const bounds = captureCanvas.getBoundingClientRect();
  return {
    x: clampNumber((event.clientX - bounds.left) / Math.max(1, bounds.width), 0, 1),
    y: clampNumber((event.clientY - bounds.top) / Math.max(1, bounds.height), 0, 1),
  };
}

function createRedactionRegion(start: NormalizedPoint, end: NormalizedPoint): ImageRedactionRegion {
  const x = Math.min(start.x, end.x);
  const y = Math.min(start.y, end.y);
  return {
    x,
    y,
    width: Math.max(0, Math.max(start.x, end.x) - x),
    height: Math.max(0, Math.max(start.y, end.y) - y),
  };
}

function resetRedactionDraft(): void {
  redactionDragStart = null;
  redactionDraft = null;
  redactionDraftCaptureId = null;
}

function redrawSelectedCapture(): void {
  const capture = getSelectedCapture();
  if (capture === null) {
    return;
  }

  previewRenderToken += 1;
  void drawPreview(capture, 'full', previewRenderToken);
}

async function handleConfirmSelectedCapture(): Promise<void> {
  const panelState = await loadPanelState();
  const manualDraft = await loadManualDraft();
  const capture = panelState.captures.find((entry) => entry.id === selectedCaptureId) ?? null;

  if (capture === null) {
    await refreshState();
    return;
  }

  const originalAsset = await createRedactedOriginalImageAsset(capture);
  const protectedCapture: CapturedSelectionRecord = {
    ...capture,
    imageDataUrl: originalAsset.dataUrl,
    redactionRegions: [],
  };
  const contextAsset = await createContextImageAsset(protectedCapture);
  const nextOrder = manualDraft.steps.length + 1;
  const localStep = createManualStep({
    capture: protectedCapture,
    order: nextOrder,
    title: buildStepTitleSuggestion(capture),
    description: '',
    imageContextDataUrl: contextAsset.dataUrl,
    imageContextFormat: contextAsset.format,
  });
  const nextStep = await syncConfirmedStepToBackend(protectedCapture, localStep, contextAsset);

  selectedStepId = nextStep.id;
  selectedCaptureId = getNextCaptureId(panelState.captures, capture.id);
  stepFormDirty = false;

  await saveManualDraft({
    ...manualDraft,
    steps: [...manualDraft.steps, nextStep],
  });

  await savePanelState(removeCaptureFromState(panelState, capture.id));
  await refreshState();
}

async function handleDiscardSelectedCapture(): Promise<void> {
  const panelState = await loadPanelState();
  const capture = panelState.captures.find((entry) => entry.id === selectedCaptureId) ?? null;

  if (capture === null) {
    await refreshState();
    return;
  }

  await trySyncDiscardedCaptureToBackend(capture);
  selectedCaptureId = getNextCaptureId(panelState.captures, capture.id);
  await savePanelState(removeCaptureFromState(panelState, capture.id));
  await refreshState();
  await tryLoadInitialBackendCatalog();
}

async function handleSaveSelectedStep(): Promise<void> {
  const manualDraft = await loadManualDraft();
  const selectedStep = manualDraft.steps.find((step) => step.id === selectedStepId) ?? null;

  if (selectedStep === null) {
    await refreshState();
    return;
  }

  const title = sanitizeStepTitle(stepFormTitle) || 'Elemento seleccionado';
  const description = sanitizeStepDescription(stepFormDescription);
  const expectedResult = sanitizeStepExpectedResult(stepFormExpectedResult);

  stepFormDirty = false;
  await persistStepEdits(manualDraft, selectedStep.id, title, description, expectedResult);
  await refreshState();
}

async function moveSelectedStep(direction: -1 | 1): Promise<void> {
  const manualDraft = await loadManualDraft();
  const currentIndex = manualDraft.steps.findIndex((step) => step.id === selectedStepId);

  if (currentIndex === -1) {
    await refreshState();
    return;
  }

  const targetIndex = currentIndex + direction;
  if (targetIndex < 0 || targetIndex >= manualDraft.steps.length) {
    return;
  }

  const nextSteps = [...manualDraft.steps];
  const [movedStep] = nextSteps.splice(currentIndex, 1);
  if (movedStep === undefined) {
    return;
  }

  nextSteps.splice(targetIndex, 0, movedStep);
  await saveManualDraft({
    ...manualDraft,
    steps: nextSteps,
  });
  await refreshState();
}

async function reorderStepByDrop(
  sourceStepId: string,
  targetStepId: string,
  position: StepDropPosition,
): Promise<void> {
  await persistPendingEditsIfNeeded();
  const manualDraft = await loadManualDraft();
  const sourceIndex = manualDraft.steps.findIndex((step) => step.id === sourceStepId);
  const targetIndex = manualDraft.steps.findIndex((step) => step.id === targetStepId);

  if (sourceIndex === -1 || targetIndex === -1 || sourceIndex === targetIndex) {
    await refreshState();
    return;
  }

  const nextSteps = [...manualDraft.steps];
  const [movedStep] = nextSteps.splice(sourceIndex, 1);
  if (movedStep === undefined) {
    return;
  }

  const adjustedTargetIndex = nextSteps.findIndex((step) => step.id === targetStepId);
  const insertionIndex = position === 'after' ? adjustedTargetIndex + 1 : adjustedTargetIndex;
  nextSteps.splice(insertionIndex, 0, movedStep);

  await saveManualDraft({
    ...manualDraft,
    steps: nextSteps,
  });
  await refreshState();
}

function getStepDropPosition(button: HTMLButtonElement, clientY: number): StepDropPosition {
  const rect = button.getBoundingClientRect();
  return clientY < rect.top + rect.height / 2 ? 'before' : 'after';
}

function showStepDropIndicator(button: HTMLButtonElement, position: StepDropPosition): void {
  for (const item of stepsList.querySelectorAll('.step-item')) {
    item.classList.remove('is-drop-before', 'is-drop-after');
  }
  button.classList.add(position === 'before' ? 'is-drop-before' : 'is-drop-after');
}

function clearStepDropIndicator(button: HTMLButtonElement): void {
  button.classList.remove('is-drop-before', 'is-drop-after');
}

function clearStepDragState(): void {
  draggedStepId = null;
  stepsList.classList.remove('is-reordering');
  for (const item of stepsList.querySelectorAll('.step-item')) {
    item.classList.remove('is-dragging', 'is-drop-before', 'is-drop-after');
  }
}

async function handleDeleteSelectedStep(): Promise<void> {
  const manualDraft = await loadManualDraft();
  const currentIndex = manualDraft.steps.findIndex((step) => step.id === selectedStepId);

  if (currentIndex === -1) {
    await refreshState();
    return;
  }

  const selectedStep = manualDraft.steps[currentIndex];
  if (selectedStep === undefined) {
    return;
  }

  const shouldDelete = window.confirm(`Eliminar "${selectedStep.title}" del manual actual?`);
  if (!shouldDelete) {
    return;
  }

  await deleteRemoteStepIfNeeded(selectedStep);

  const nextSteps = manualDraft.steps.filter((step) => step.id !== selectedStep.id);
  const fallbackStep = nextSteps[currentIndex] ?? nextSteps[currentIndex - 1] ?? null;

  selectedStepId = fallbackStep?.id ?? null;
  stepFormDirty = false;
  await saveManualDraft({
    ...manualDraft,
    steps: nextSteps,
  });
  await refreshState();
}

function handleDownloadSelectedStepImage(imageKind: 'context' | 'original'): void {
  const selectedStep = getSelectedStep();
  if (selectedStep === null) {
    return;
  }

  if (imageKind === 'context') {
    downloadDataUrlFile(
      selectedStep.imageContextDataUrl,
      `${buildStepFileBaseName(selectedStep)}-context.${getImageExtension(selectedStep.imageContextFormat)}`,
    );
    return;
  }

  downloadDataUrlFile(
    selectedStep.imageOriginalDataUrl,
    `${buildStepFileBaseName(selectedStep)}-original.${getImageExtension(selectedStep.imageOriginalFormat)}`,
  );
}

async function handleExportManualJson(): Promise<void> {
  await persistPendingEditsIfNeeded();

  if (currentDraft.steps.length === 0) {
    return;
  }

  const payload: ExportedManualDocument = {
    exportedAt: new Date().toISOString(),
    generatedBy: 'Manual Builder',
    version: 1,
    title: currentDraft.title,
    author: currentDraft.author,
    description: currentDraft.description,
    createdAt: currentDraft.createdAt,
    lastUpdatedAt: currentDraft.lastUpdatedAt,
    stepCount: currentDraft.steps.length,
    steps: currentDraft.steps,
  };

  downloadTextFile(
    JSON.stringify(payload, null, 2),
    `manual-builder-${buildExportStamp()}.json`,
    'application/json',
  );
}

async function handleExportManualImages(): Promise<void> {
  await persistPendingEditsIfNeeded();

  if (currentDraft.steps.length === 0) {
    return;
  }

  for (const step of currentDraft.steps) {
    downloadDataUrlFile(
      step.imageContextDataUrl,
      `${buildStepFileBaseName(step)}-context.${getImageExtension(step.imageContextFormat)}`,
    );
    downloadDataUrlFile(
      step.imageOriginalDataUrl,
      `${buildStepFileBaseName(step)}-original.${getImageExtension(step.imageOriginalFormat)}`,
    );
  }
}

async function openManualPage(exportPdf: boolean): Promise<void> {
  await persistPendingEditsIfNeeded();

  if (currentDraft.steps.length === 0) {
    return;
  }

  const targetUrl = new URL(getManualPageUrl());
  if (exportPdf) {
    targetUrl.searchParams.set('exportPdf', '1');
  }

  window.open(targetUrl.toString(), '_blank', 'noopener');
}

async function handleClearManualDraft(): Promise<void> {
  if (currentDraft.steps.length === 0) {
    return;
  }

  const shouldClear = window.confirm('Eliminar todos los pasos guardados del manual actual?');
  if (!shouldClear) {
    return;
  }

  selectedStepId = null;
  stepFormDirty = false;
  manualMetaDirty = false;
  await resetManualDraft();
  await refreshState();
}

async function resetVisibleManualDraftForRemoteContext(seed: ManualDraftSeed | null = null): Promise<void> {
  const fallbackDraft = createEmptyManualDraft();

  await persistPendingEditsIfNeeded();

  selectedStepId = null;
  stepFormStepId = null;
  stepFormTitle = '';
  stepFormDescription = '';
  stepFormExpectedResult = '';
  stepFormDirty = false;
  manualMetaDirty = false;

  await saveManualDraft({
    title: sanitizeManualTitle(seed?.title ?? '') || fallbackDraft.title,
    author: sanitizeManualAuthor(seed?.author ?? ''),
    description: sanitizeManualDescription(seed?.description ?? ''),
    createdAt: normalizeSeedDate(seed?.createdAt) ?? fallbackDraft.createdAt,
    steps: [],
    lastUpdatedAt: null,
  });
}

async function handleSaveManualMetadata(): Promise<void> {
  const manualDraft = await loadManualDraft();

  await saveManualDraft({
    ...manualDraft,
    title: sanitizeManualTitle(manualTitleDraft) || 'Manual de usuario',
    author: sanitizeManualAuthor(manualAuthorDraft),
    description: sanitizeManualDescription(manualDescriptionDraft),
  });

  manualMetaDirty = false;
  await refreshState();
}

async function handleBackendLogin(): Promise<void> {
  await authenticateBackend('login');
}

async function handleBackendRegister(): Promise<void> {
  await authenticateBackend('register');
}

async function authenticateBackend(mode: 'login' | 'register'): Promise<void> {
  const previousSettings = await loadBackendSyncSettings();
  const apiBaseUrl = backendApiBaseUrlDraft.trim();
  const username = backendUsernameDraft.trim();
  const password = backendPasswordDraft;

  try {
    if (apiBaseUrl.length === 0) {
      throw new Error('Configura la URL base del backend.');
    }
    if (username.length < 2) {
      throw new Error('El usuario debe tener al menos 2 caracteres.');
    }
    if (password.length < 6) {
      throw new Error('La contrasena debe tener al menos 6 caracteres. Puede contener letras y numeros.');
    }

    // Capture credentials before any storage write; storage change events refresh the form.
    const client = createManualBuilderApiClient(apiBaseUrl);
    const authResponse = mode === 'login'
      ? await client.login({
          username,
          password,
        })
      : await client.register({
          username,
          password,
          displayName: username,
        });

    await applyBackendAuthResponse(previousSettings, authResponse, client.baseUrl);
  } catch (error) {
    await saveBackendSyncSettings({
      ...previousSettings,
      apiBaseUrl: apiBaseUrl || previousSettings.apiBaseUrl,
      username,
      lastError: getErrorMessage(error),
    });
  }

  backendSettingsDirty = false;
  await refreshState();
}

async function applyBackendAuthResponse(
  previousSettings: BackendSyncSettings,
  authResponse: RemoteAuthResponse,
  apiBaseUrl: string,
): Promise<void> {
  backendAuthTokenDraft = authResponse.accessToken;
  backendUserIdDraft = authResponse.user.id;
  backendUsernameDraft = authResponse.user.username;
  backendDisplayNameDraft = authResponse.user.displayName;
  backendStartedByDraft = authResponse.user.displayName || authResponse.user.username;
  backendPasswordDraft = '';

  const authenticatedSettings: BackendSyncSettings = {
    ...previousSettings,
    enabled: true,
    apiBaseUrl,
    authToken: authResponse.accessToken,
    userId: authResponse.user.id,
    username: authResponse.user.username,
    displayName: authResponse.user.displayName,
    startedBy: backendStartedByDraft,
    sessionId: null,
    sessionActionId: null,
    storageProvider: backendStorageProviderDraft,
    lastValidatedAt: new Date().toISOString(),
    lastError: null,
  };
  await saveBackendSyncSettings(authenticatedSettings);

  const client = createManualBuilderApiClient(apiBaseUrl, authResponse.accessToken);
  try {
    const storageStatus = await client.getStorageStatus();
    backendStorageProviderDraft = storageStatus.activeProvider;
  } catch {
    backendStorageProviderDraft = null;
  }

  try {
    backendWorkspaces = await loadBackendWorkspaces(apiBaseUrl, authResponse.accessToken);
    if (!backendWorkspaces.some((workspace) => workspace.id === backendWorkspaceIdDraft)) {
      backendWorkspaceIdDraft = backendWorkspaces[0]?.id ?? '';
    }

    if (backendWorkspaceIdDraft.length > 0) {
      await loadBackendCatalog(apiBaseUrl, authResponse.accessToken, backendWorkspaceIdDraft);
    }
  } catch (error) {
    await saveBackendSyncSettings({
      ...authenticatedSettings,
      storageProvider: backendStorageProviderDraft,
      lastError: `Sesion iniciada, pero no se pudo cargar el catalogo: ${getErrorMessage(error)}`,
    });
    return;
  }

  await saveBackendSyncSettings({
    ...authenticatedSettings,
    workspaceId: backendWorkspaceIdDraft,
    systemId: backendSystemIdDraft,
    moduleId: backendModuleIdDraft,
    actionId: backendActionIdDraft,
    manualId: backendManualIdDraft,
    sessionId: null,
    sessionActionId: null,
    workspaceName: backendWorkspaces.find((workspace) => workspace.id === backendWorkspaceIdDraft)?.name ?? null,
    storageProvider: backendStorageProviderDraft,
    lastValidatedAt: new Date().toISOString(),
    lastError: null,
  });
}

async function handleCreateRemoteWorkspace(): Promise<void> {
  const settings = await persistBackendSettingsDraft();

  try {
    if (settings.authToken === null) {
      throw new Error('Inicia sesion antes de crear un workspace.');
    }

    const client = createManualBuilderApiClient(settings.apiBaseUrl, settings.authToken);
    const workspace = await client.createWorkspace({
      name: newWorkspaceNameDraft,
    });

    newWorkspaceNameDraft = '';
    backendWorkspaceIdDraft = workspace.id;
    backendSystemIdDraft = '';
    backendModuleIdDraft = '';
    backendActionIdDraft = '';
    backendManualIdDraft = '';
    backendCatalog = null;
    backendManuals = [];
    await loadBackendWorkspaces(client.baseUrl, settings.authToken);
    await loadBackendCatalog(client.baseUrl, settings.authToken, workspace.id);
    await saveBackendSyncSettings({
      ...settings,
      apiBaseUrl: client.baseUrl,
      workspaceId: workspace.id,
      systemId: '',
      moduleId: '',
      actionId: '',
      manualId: '',
      sessionId: null,
      sessionActionId: null,
      workspaceName: workspace.name,
      lastValidatedAt: new Date().toISOString(),
      lastError: null,
    });
    await resetVisibleManualDraftForRemoteContext();
  } catch (error) {
    await saveBackendSyncSettings({
      ...settings,
      lastError: getErrorMessage(error),
    });
  }

  backendSettingsDirty = false;
  await refreshState();
}

async function handleCreateRemoteSystem(): Promise<void> {
  const settings = await persistBackendSettingsDraft();

  try {
    if (settings.authToken === null) {
      throw new Error('Inicia sesion antes de crear un sistema.');
    }

    if (settings.workspaceId.trim().length === 0) {
      throw new Error('Selecciona un workspace antes de crear un sistema.');
    }

    const workspaceOverview = backendCatalog ?? await loadBackendCatalog(settings.apiBaseUrl, settings.authToken, settings.workspaceId);
    const client = createManualBuilderApiClient(settings.apiBaseUrl, settings.authToken);
    const system = await client.createSystem({
      workspaceId: workspaceOverview.workspace.id,
      name: newSystemNameDraft,
    });

    backendSystemIdDraft = system.id;
    backendModuleIdDraft = '';
    backendActionIdDraft = '';
    backendManualIdDraft = '';
    backendManuals = [];
    newSystemNameDraft = '';

    await loadBackendCatalog(client.baseUrl, settings.authToken, workspaceOverview.workspace.id);
    await saveBackendSyncSettings({
      ...settings,
      apiBaseUrl: client.baseUrl,
      workspaceId: workspaceOverview.workspace.id,
      systemId: backendSystemIdDraft,
      moduleId: '',
      actionId: '',
      manualId: '',
      sessionId: null,
      sessionActionId: null,
      lastError: null,
    });
    await resetVisibleManualDraftForRemoteContext();
  } catch (error) {
    await saveBackendSyncSettings({
      ...settings,
      lastError: getErrorMessage(error),
    });
  }

  backendSettingsDirty = false;
  await refreshState();
}

async function handleCreateRemoteModule(): Promise<void> {
  const settings = await persistBackendSettingsDraft();

  try {
    if (settings.authToken === null) {
      throw new Error('Inicia sesion antes de crear un modulo.');
    }

    if (backendSystemIdDraft.length === 0) {
      throw new Error('Selecciona un sistema antes de crear el modulo.');
    }

    const client = createManualBuilderApiClient(settings.apiBaseUrl, settings.authToken);
    const systemModule = await client.createSystemModule({
      systemId: backendSystemIdDraft,
      name: newModuleNameDraft,
    });

    backendModuleIdDraft = systemModule.id;
    backendActionIdDraft = '';
    backendManualIdDraft = '';
    backendManuals = [];
    newModuleNameDraft = '';

    await loadBackendCatalog(client.baseUrl, settings.authToken, settings.workspaceId);
    await saveBackendSyncSettings({
      ...settings,
      apiBaseUrl: client.baseUrl,
      systemId: backendSystemIdDraft,
      moduleId: backendModuleIdDraft,
      actionId: '',
      manualId: '',
      sessionId: null,
      sessionActionId: null,
      lastError: null,
    });
    await resetVisibleManualDraftForRemoteContext();
  } catch (error) {
    await saveBackendSyncSettings({
      ...settings,
      lastError: getErrorMessage(error),
    });
  }

  backendSettingsDirty = false;
  await refreshState();
}

async function handleCreateRemoteAction(): Promise<void> {
  const settings = await persistBackendSettingsDraft();

  try {
    if (settings.authToken === null) {
      throw new Error('Inicia sesion antes de crear una accion.');
    }

    if (backendModuleIdDraft.length === 0) {
      throw new Error('Selecciona un modulo antes de crear la accion.');
    }

    const client = createManualBuilderApiClient(settings.apiBaseUrl, settings.authToken);
    const action = await client.createAction({
      moduleId: backendModuleIdDraft,
      name: newActionNameDraft,
    });

    backendActionIdDraft = action.id;
    backendManualIdDraft = '';
    backendManuals = [];
    newActionNameDraft = '';

    await loadBackendCatalog(client.baseUrl, settings.authToken, settings.workspaceId);
    await loadManualsForSelectedAction();
    await saveBackendSyncSettings({
      ...settings,
      apiBaseUrl: client.baseUrl,
      systemId: backendSystemIdDraft,
      moduleId: backendModuleIdDraft,
      actionId: backendActionIdDraft,
      manualId: '',
      sessionId: null,
      sessionActionId: null,
      lastError: null,
    });
    await resetVisibleManualDraftForRemoteContext();
  } catch (error) {
    await saveBackendSyncSettings({
      ...settings,
      lastError: getErrorMessage(error),
    });
  }

  backendSettingsDirty = false;
  await refreshState();
}

async function handleCreateRemoteManual(): Promise<void> {
  await persistPendingEditsIfNeeded();

  const settings = await persistBackendSettingsDraft();

  try {
    const configurationError = getBackendSettingsConfigurationError(settings, false);
    if (configurationError !== null) {
      throw new Error(configurationError);
    }

    const client = createManualBuilderApiClient(settings.apiBaseUrl, settings.authToken);
    const manual = await client.createManual({
      actionId: settings.actionId,
      title: getEffectiveManualTitle(),
      description: sanitizeManualDescription(manualDescriptionDraft),
      createdBy: settings.startedBy,
    });

    await saveBackendSyncSettings({
      ...settings,
      apiBaseUrl: client.baseUrl,
      workspaceId: backendWorkspaceIdDraft,
      systemId: backendSystemIdDraft,
      moduleId: backendModuleIdDraft,
      actionId: settings.actionId,
      manualId: manual.id,
      lastError: null,
    });

    backendManualIdDraft = manual.id;
    await loadManualsForSelectedAction();
    await resetVisibleManualDraftForRemoteContext({
      title: manual.title,
      author: manual.createdBy,
      description: manual.description,
      createdAt: manual.createdAt,
    });
  } catch (error) {
    await saveBackendSyncSettings({
      ...settings,
      lastError: getErrorMessage(error),
    });
  }

  await refreshState();
}

async function handleLoadRemoteManual(): Promise<void> {
  await persistPendingEditsIfNeeded();

  const settings = await persistBackendSettingsDraft();

  try {
    const configurationError = getBackendSettingsConfigurationError(settings, true);
    if (configurationError !== null) {
      throw new Error(configurationError);
    }

    if (
      currentDraft.steps.length > 0 &&
      !window.confirm('Cargar el manual remoto reemplazara el borrador local actual. Continuar?')
    ) {
      return;
    }

    const client = createManualBuilderApiClient(settings.apiBaseUrl, settings.authToken);
    const remoteManual = await client.getManual(settings.manualId);
    const loadedDraft = await buildManualDraftFromRemoteManual(remoteManual, client.baseUrl);
    const firstStep = loadedDraft.steps[0] ?? null;

    selectedStepId = firstStep?.id ?? null;
    selectedCaptureId = null;
    stepFormDirty = false;
    manualMetaDirty = false;
    backendWorkspaceIdDraft = remoteManual.system.workspaceId;
    backendSystemIdDraft = remoteManual.system.id;
    backendModuleIdDraft = remoteManual.systemModule.id;
    backendActionIdDraft = remoteManual.action.id;
    backendManualIdDraft = remoteManual.manual.id;

    await saveManualDraft(loadedDraft);
    await saveBackendSyncSettings({
      ...settings,
      apiBaseUrl: client.baseUrl,
      workspaceId: remoteManual.system.workspaceId,
      systemId: remoteManual.system.id,
      moduleId: remoteManual.systemModule.id,
      actionId: remoteManual.action.id,
      manualId: remoteManual.manual.id,
      sessionId: null,
      sessionActionId: null,
      workspaceName: backendCatalog?.workspace.name ?? settings.workspaceName,
      lastValidatedAt: new Date().toISOString(),
      lastError: null,
    });

    if (settings.authToken !== null) {
      await loadBackendCatalog(client.baseUrl, settings.authToken, remoteManual.system.workspaceId);
      await loadManualsForSelectedAction();
    }
  } catch (error) {
    await saveBackendSyncSettings({
      ...settings,
      lastError: getErrorMessage(error),
    });
  }

  await refreshState();
}

async function handleExportSystemPdf(): Promise<void> {
  try {
    await persistPendingEditsIfNeeded();
    const settings = await persistBackendSettingsDraft();

    if (settings.authToken === null || settings.authToken.trim().length === 0) {
      throw new Error('Inicia sesion antes de exportar un sistema.');
    }
    if (backendSystemIdDraft.trim().length === 0) {
      throw new Error('Selecciona el sistema que deseas exportar.');
    }

    const client = createManualBuilderApiClient(settings.apiBaseUrl, settings.authToken);
    setSystemExportStatus('working', 'Consultando modulos, acciones y manuales del sistema...');
    const systemTree = await client.getSystemTree(backendSystemIdDraft);
    const systemDocument = await buildSystemPdfExportDocument(systemTree, client);

    if (systemDocument.steps.length === 0) {
      throw new Error('El sistema seleccionado no tiene pasos guardados para exportar.');
    }

    const { exportManualPdf } = await import('../../lib/pdf/manual-pdf.download');
    await exportManualPdf(systemDocument, {
      includeCover: true,
      drawSelectionHighlight: 'auto',
      imageQuality: 0.94,
      maxImageDimension: 2560,
      fileName: systemDocument.title,
      fontUrls: {
        regular: getRuntimeUrl('/fonts/NotoSans-Regular.ttf'),
        bold: getRuntimeUrl('/fonts/NotoSans-Bold.ttf'),
      },
      onProgress: (progress) => {
        setSystemExportStatus('working', progress.message);
      },
    });

    setSystemExportStatus(
      'completed',
      `PDF del sistema generado con ${systemDocument.steps.length} paso${systemDocument.steps.length === 1 ? '' : 's'}.`,
    );
  } catch (error) {
    setSystemExportStatus('error', getErrorMessage(error));
  }
}

async function buildSystemPdfExportDocument(
  systemTree: RemoteSystemTree,
  client: ReturnType<typeof createManualBuilderApiClient>,
): Promise<SystemPdfExportDocument> {
  const steps: ManualStep[] = [];
  const structure: ManualSystemStructure = {
    systemName: systemTree.system.name,
    modules: [],
  };
  const totalManuals = systemTree.systemModules.reduce(
    (total, systemModule) => total + systemModule.actions.reduce(
      (moduleTotal, action) => moduleTotal + action.manuals.length,
      0,
    ),
    0,
  );
  let processedManuals = 0;

  for (const systemModule of systemTree.systemModules) {
    const structureModule: ManualSystemStructure['modules'][number] = {
      name: systemModule.name,
      actions: [],
    };

    for (const action of systemModule.actions) {
      const structureAction: ManualSystemStructure['modules'][number]['actions'][number] = {
        name: action.name,
        manuals: [],
      };

      for (const manualSummary of action.manuals) {
        processedManuals += 1;
        setSystemExportStatus(
          'working',
          `Cargando manual ${processedManuals} de ${totalManuals}: ${manualSummary.title}`,
        );
        const remoteManual = await client.getManual(manualSummary.id);
        const manualDraft = await buildManualDraftFromRemoteManual(remoteManual, client.baseUrl);

        structureAction.manuals.push({
          title: remoteManual.manual.title,
          stepCount: manualDraft.steps.length,
        });

        for (const step of manualDraft.steps) {
          steps.push({
            ...step,
            order: steps.length + 1,
            hierarchy: {
              systemName: systemTree.system.name,
              moduleName: systemModule.name,
              actionName: action.name,
              manualTitle: remoteManual.manual.title,
            },
          });
        }
      }

      structureModule.actions.push(structureAction);
    }

    structure.modules.push(structureModule);
  }

  const latestUpdatedAt = systemTree.systemModules
    .flatMap((systemModule) => systemModule.actions)
    .flatMap((action) => action.manuals)
    .map((manual) => manual.updatedAt)
    .sort()
    .at(-1) ?? null;
  const title = sanitizeManualTitle(`Manual del sistema ${systemTree.system.name}`)
    || 'Manual del sistema';
  const description = sanitizeManualDescription(systemTree.system.description)
    || sanitizeManualDescription(
      `Documento consolidado de ${structure.modules.length} modulo${structure.modules.length === 1 ? '' : 's'} del sistema ${systemTree.system.name}.`,
    );

  return {
    title,
    author: sanitizeManualAuthor(backendDisplayNameDraft || backendUsernameDraft || 'Manual Builder'),
    description,
    createdAt: new Date().toISOString(),
    steps,
    lastUpdatedAt: latestUpdatedAt,
    structure,
  };
}

async function handleAddWorkspaceCollaborator(): Promise<void> {
  const settings = await persistBackendSettingsDraft();

  try {
    if (settings.authToken === null) {
      throw new Error('Inicia sesion antes de agregar colaboradores.');
    }

    if (settings.workspaceId.trim().length === 0) {
      throw new Error('Selecciona un workspace antes de agregar colaboradores.');
    }

    const client = createManualBuilderApiClient(settings.apiBaseUrl, settings.authToken);
    await client.addWorkspaceMember(settings.workspaceId, {
      username: collaboratorUsernameDraft,
      role: collaboratorRoleDraft,
    });

    collaboratorUsernameDraft = '';
    await saveBackendSyncSettings({
      ...settings,
      apiBaseUrl: client.baseUrl,
      lastValidatedAt: new Date().toISOString(),
      lastError: null,
    });
  } catch (error) {
    await saveBackendSyncSettings({
      ...settings,
      lastError: getErrorMessage(error),
    });
  }

  backendSettingsDirty = false;
  await refreshState();
}

async function loadBackendWorkspaces(
  apiBaseUrl: string,
  authToken: string,
): Promise<RemoteWorkspaceRecord[]> {
  const client = createManualBuilderApiClient(apiBaseUrl, authToken);
  backendWorkspaces = await client.listWorkspaces();
  return backendWorkspaces;
}

async function loadBackendCatalogForDraft(): Promise<void> {
  if (backendAuthTokenDraft === null || backendWorkspaceIdDraft.trim().length === 0) {
    return;
  }

  await loadBackendCatalog(backendApiBaseUrlDraft, backendAuthTokenDraft, backendWorkspaceIdDraft);
}

async function loadBackendCatalog(
  apiBaseUrl: string,
  authToken: string,
  workspaceId: string,
): Promise<WorkspaceOverview> {
  const client = createManualBuilderApiClient(apiBaseUrl, authToken);
  const workspaceOverview = await client.getWorkspaceOverview(workspaceId);
  backendCatalog = workspaceOverview;
  backendWorkspaceIdDraft = workspaceOverview.workspace.id;
  synchronizeCatalogSelection();

  if (backendActionIdDraft.length > 0) {
    await loadManualsForSelectedAction();
  } else {
    backendManuals = [];
    backendManualIdDraft = '';
  }

  return workspaceOverview;
}

async function loadManualsForSelectedAction(): Promise<void> {
  if (backendActionIdDraft.trim().length === 0) {
    backendManuals = [];
    backendManualIdDraft = '';
    renderBackendSyncSection();
    return;
  }

  const client = createManualBuilderApiClient(backendApiBaseUrlDraft, backendAuthTokenDraft);
  backendManuals = await client.listManualsByAction(backendActionIdDraft);

  if (!backendManuals.some((manual) => manual.id === backendManualIdDraft)) {
    backendManualIdDraft = '';
  }

  renderBackendSyncSection();
}

async function buildManualDraftFromRemoteManual(
  remoteManual: RemoteManualDetail,
  apiBaseUrl: string,
): Promise<ManualDraft> {
  const remoteSteps = [...remoteManual.steps].sort((left, right) => left.order - right.order);
  const steps: ManualStep[] = [];

  for (const [index, remoteStep] of remoteSteps.entries()) {
    steps.push(await buildManualStepFromRemoteStep(
      remoteStep,
      index + 1,
      remoteManual.manual.id,
      apiBaseUrl,
    ));
  }

  return {
    title: sanitizeManualTitle(remoteManual.manual.title) || 'Manual de usuario',
    author: sanitizeManualAuthor(remoteManual.manual.createdBy),
    description: sanitizeManualDescription(remoteManual.manual.description),
    createdAt: remoteManual.manual.createdAt,
    steps,
    lastUpdatedAt: remoteManual.manual.updatedAt,
  };
}

async function buildManualStepFromRemoteStep(
  remoteStep: RemoteManualStepWithAsset,
  order: number,
  manualId: string,
  apiBaseUrl: string,
): Promise<ManualStep> {
  const originalAsset = await fetchRemoteAssetAsImageAsset(
    remoteStep.sourceCapture?.originalAsset ?? remoteStep.asset,
    apiBaseUrl,
  );
  const contextAsset = await fetchRemoteAssetAsImageAsset(
    remoteStep.sourceCapture?.contextAsset ?? remoteStep.asset,
    apiBaseUrl,
  );
  const selectedElement = buildSelectedElementFromRemoteStep(remoteStep);

  return {
    id: crypto.randomUUID(),
    order,
    title: sanitizeStepTitle(remoteStep.title) || `Paso ${order}`,
    description: sanitizeStepDescription(remoteStep.description),
    guide: {
      expectedResult: sanitizeStepExpectedResult(remoteStep.expectedResult ?? ''),
    },
    selector: remoteStep.selector,
    url: remoteStep.pageUrl,
    pageTitle: remoteStep.pageTitle,
    imageOriginalDataUrl: originalAsset.dataUrl,
    imageOriginalFormat: originalAsset.format,
    imageContextDataUrl: contextAsset.dataUrl,
    imageContextFormat: contextAsset.format,
    selectedElement,
    contextRegion: selectedElement.rect,
    createdAt: remoteStep.createdAt,
    annotationBaked: true,
    remoteManualId: manualId,
    remoteCaptureId: remoteStep.sourceCaptureId,
    remoteStepId: remoteStep.id,
    remoteSyncStatus: 'synced',
    remoteSyncError: null,
  };
}

function buildSelectedElementFromRemoteStep(remoteStep: RemoteManualStepWithAsset): SelectedElementData {
  return {
    tagName: remoteStep.selectedElementTag,
    id: null,
    text: remoteStep.textSnippet,
    selector: remoteStep.selector,
    url: remoteStep.pageUrl,
    pageTitle: remoteStep.pageTitle,
    rect: {
      x: 0,
      y: 0,
      width: 1,
      height: 1,
    },
    viewport: {
      width: 1,
      height: 1,
      devicePixelRatio: 1,
    },
  };
}

async function fetchRemoteAssetAsImageAsset(
  asset: RemoteAssetRecord,
  apiBaseUrl: string,
): Promise<GeneratedImageAsset> {
  const response = await fetch(resolveRemoteAssetUrl(asset.publicUrl, apiBaseUrl));
  if (!response.ok) {
    throw new Error(`No se pudo descargar la imagen remota ${asset.fileName}.`);
  }

  const blob = await response.blob();
  const detectedFormat = getSupportedImageAssetFormat(blob.type || asset.mimeType);
  if (detectedFormat !== null) {
    return {
      dataUrl: await blobToDataUrl(blob),
      format: detectedFormat,
    };
  }

  return {
    dataUrl: await convertImageBlobToPngDataUrl(blob),
    format: 'png',
  };
}

function resolveRemoteAssetUrl(publicUrl: string, apiBaseUrl: string): string {
  try {
    return new URL(publicUrl).toString();
  } catch {
    return new URL(publicUrl, new URL(apiBaseUrl).origin).toString();
  }
}

function getSupportedImageAssetFormat(mimeType: string): ImageAssetFormat | null {
  switch (mimeType.toLowerCase()) {
    case 'image/jpeg':
    case 'image/jpg':
      return 'jpeg';
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    default:
      return null;
  }
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
        return;
      }

      reject(new Error('No se pudo convertir la imagen remota a Data URL.'));
    };
    reader.onerror = () => reject(new Error('No se pudo leer la imagen remota.'));
    reader.readAsDataURL(blob);
  });
}

function convertImageBlobToPngDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(blob);

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);

      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, image.naturalWidth);
      canvas.height = Math.max(1, image.naturalHeight);

      const context = canvas.getContext('2d');
      if (context === null) {
        reject(new Error('No se pudo preparar la imagen remota para edicion local.'));
        return;
      }

      context.drawImage(image, 0, 0);
      resolve(canvas.toDataURL('image/png'));
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('El formato de imagen remota no se puede cargar en este navegador.'));
    };

    image.src = objectUrl;
  });
}

function synchronizeCatalogSelection(): void {
  if (backendCatalog === null) {
    return;
  }

  if (backendActionIdDraft.length > 0) {
    const actionPath = findActionPath(backendActionIdDraft);
    if (actionPath !== null) {
      backendSystemIdDraft = actionPath.system.id;
      backendModuleIdDraft = actionPath.systemModule.id;
      return;
    }
  }

  const selectedSystem = getSelectedRemoteSystem();
  if (selectedSystem === null) {
    backendSystemIdDraft = '';
    backendModuleIdDraft = '';
    backendActionIdDraft = '';
    backendManualIdDraft = '';
    return;
  }

  const selectedModule = getSelectedRemoteModule();
  if (selectedModule === null) {
    backendModuleIdDraft = '';
    backendActionIdDraft = '';
    backendManualIdDraft = '';
    return;
  }

  const selectedAction = getSelectedRemoteAction();
  if (selectedAction === null) {
    backendActionIdDraft = '';
    backendManualIdDraft = '';
  }
}

function findActionPath(actionId: string): {
  system: RemoteSystemSummary;
  systemModule: RemoteSystemModuleSummary;
  action: RemoteActionSummary;
} | null {
  for (const system of backendCatalog?.systems ?? []) {
    for (const systemModule of system.systemModules) {
      const action = systemModule.actions.find((candidate) => candidate.id === actionId) ?? null;
      if (action !== null) {
        return { system, systemModule, action };
      }
    }
  }

  return null;
}

function getSelectedRemoteSystem(): RemoteSystemSummary | null {
  return backendCatalog?.systems.find((system) => system.id === backendSystemIdDraft) ?? null;
}

function getSelectedRemoteModule(): RemoteSystemModuleSummary | null {
  return getSelectedRemoteSystem()?.systemModules.find((systemModule) => (
    systemModule.id === backendModuleIdDraft
  )) ?? null;
}

function getSelectedRemoteAction(): RemoteActionSummary | null {
  return getSelectedRemoteModule()?.actions.find((action) => action.id === backendActionIdDraft) ?? null;
}

function getSelectedRemoteManual(): RemoteManualSummary | null {
  return backendManuals.find((manual) => manual.id === backendManualIdDraft) ?? null;
}

function buildManualDraftSeedFromSummary(manual: RemoteManualSummary | null): ManualDraftSeed | null {
  if (manual === null) {
    return null;
  }

  return {
    title: manual.title,
    author: manual.createdBy,
    description: manual.description,
    createdAt: manual.createdAt,
  };
}

async function syncConfirmedStepToBackend(
  capture: CapturedSelectionRecord,
  step: ManualStep,
  contextAsset: GeneratedImageAsset,
): Promise<ManualStep> {
  const settings = await loadBackendSyncSettings();
  if (!settings.enabled) {
    return step;
  }

  const configurationError = getBackendSettingsConfigurationError(settings, false);
  if (configurationError !== null) {
    await saveBackendSyncSettings({
      ...settings,
      lastError: configurationError,
    });

    return applyRemoteSyncError(step, settings.manualId, capture.remoteCaptureId, configurationError);
  }

  let remoteCaptureId: string | null = null;

  try {
    const client = createManualBuilderApiClient(settings.apiBaseUrl, settings.authToken);
    const sessionId = await ensureRemoteSessionId(client, settings);
    const createdCapture = await client.createCapture(sessionId, {
      ...buildRemoteCapturePayload(capture.selectedElement, capture.imageDataUrl, step.title),
      description: step.description,
      framing: DEFAULT_REMOTE_FRAMING,
      contextImageDataUrl: capture.captureTarget === 'viewport' ? null : contextAsset.dataUrl,
    });
    remoteCaptureId = createdCapture.capture.id;

    let remoteStepId: string | null = null;
    if (settings.manualId.trim().length > 0) {
      const response = await client.addStepFromCapture(settings.manualId, {
        captureId: remoteCaptureId,
        title: step.title,
        description: step.description,
        expectedResult: step.guide?.expectedResult ?? '',
        framing: DEFAULT_REMOTE_FRAMING,
      });
      remoteStepId = response.step.id;
    }

    await saveBackendSyncSettings({
      ...settings,
      apiBaseUrl: client.baseUrl,
      sessionId,
      sessionActionId: settings.actionId,
      storageProvider: createdCapture.originalAsset.provider === 'local'
        ? 'local'
        : createdCapture.originalAsset.provider === 'onedrive-business'
          ? 'onedrive-business'
          : settings.storageProvider,
      lastError: null,
    });

    return {
      ...step,
      remoteManualId: settings.manualId || null,
      remoteCaptureId,
      remoteStepId,
      remoteSyncStatus: 'synced',
      remoteSyncError: null,
    };
  } catch (error) {
    const syncError = getErrorMessage(error);

    await saveBackendSyncSettings({
      ...settings,
      lastError: syncError,
    });

    return applyRemoteSyncError(step, settings.manualId, remoteCaptureId, syncError);
  }
}

async function trySyncDiscardedCaptureToBackend(capture: CapturedSelectionRecord): Promise<void> {
  const settings = await loadBackendSyncSettings();
  if (!settings.enabled || capture.remoteCaptureId === null) {
    return;
  }

  try {
    const client = createManualBuilderApiClient(settings.apiBaseUrl, settings.authToken);
    await client.reviewCapture(capture.remoteCaptureId, {
      status: 'discarded',
    });

    await saveBackendSyncSettings({
      ...settings,
      apiBaseUrl: client.baseUrl,
      lastError: null,
    });
  } catch (error) {
    await saveBackendSyncSettings({
      ...settings,
      lastError: getErrorMessage(error),
    });
  }
}

async function syncEditedStepToBackend(step: ManualStep): Promise<ManualStep> {
  if (step.remoteStepId === null || step.remoteStepId === undefined) {
    return step;
  }

  const settings = await loadBackendSyncSettings();
  if (!settings.enabled) {
    return step;
  }

  try {
    const client = createManualBuilderApiClient(settings.apiBaseUrl, settings.authToken);
    await client.updateManualStep(step.remoteStepId, {
      title: step.title,
      description: step.description,
      expectedResult: step.guide?.expectedResult ?? '',
    });

    await saveBackendSyncSettings({
      ...settings,
      apiBaseUrl: client.baseUrl,
      lastError: null,
    });

    return {
      ...step,
      remoteSyncStatus: 'synced',
      remoteSyncError: null,
    };
  } catch (error) {
    const syncError = getErrorMessage(error);

    await saveBackendSyncSettings({
      ...settings,
      lastError: syncError,
    });

    return {
      ...step,
      remoteSyncStatus: 'error',
      remoteSyncError: syncError,
    };
  }
}

async function deleteRemoteStepIfNeeded(step: ManualStep): Promise<void> {
  if (step.remoteStepId === null || step.remoteStepId === undefined) {
    return;
  }

  const settings = await loadBackendSyncSettings();
  if (settings.apiBaseUrl.trim().length === 0 || settings.authToken === null) {
    throw new Error('No se puede eliminar el paso remoto porque no hay sesion activa con el backend.');
  }

  try {
    const client = createManualBuilderApiClient(settings.apiBaseUrl, settings.authToken);
    await client.deleteManualStep(step.remoteStepId);
    await saveBackendSyncSettings({
      ...settings,
      apiBaseUrl: client.baseUrl,
      lastError: null,
    });
  } catch (error) {
    const syncError = getErrorMessage(error);

    await saveBackendSyncSettings({
      ...settings,
      lastError: syncError,
    });

    throw new Error(`No se pudo eliminar el paso remoto: ${syncError}`);
  }
}

async function createRedactedOriginalImageAsset(
  capture: CapturedSelectionRecord,
): Promise<GeneratedImageAsset> {
  const format = detectImageFormatFromDataUrl(capture.imageDataUrl);
  if (capture.redactionRegions.length === 0) {
    return {
      dataUrl: capture.imageDataUrl,
      format,
    };
  }

  const image = await loadCaptureImage(capture.imageDataUrl);
  const detachedCanvas = document.createElement('canvas');
  detachedCanvas.width = Math.max(1, image.naturalWidth);
  detachedCanvas.height = Math.max(1, image.naturalHeight);
  const context = detachedCanvas.getContext('2d');
  if (context === null) {
    throw new Error('No se pudo preparar la captura protegida.');
  }

  context.drawImage(image, 0, 0);
  applyImageRedactions(
    context,
    image.naturalWidth,
    image.naturalHeight,
    { x: 0, y: 0, width: image.naturalWidth, height: image.naturalHeight },
    detachedCanvas.width,
    detachedCanvas.height,
    capture.redactionRegions,
  );

  if (format === 'jpeg') {
    return { dataUrl: detachedCanvas.toDataURL('image/jpeg', STORED_IMAGE_QUALITY), format };
  }

  if (format === 'webp') {
    const dataUrl = detachedCanvas.toDataURL('image/webp', STORED_IMAGE_QUALITY);
    if (dataUrl.startsWith('data:image/webp')) {
      return { dataUrl, format };
    }
  }

  return { dataUrl: detachedCanvas.toDataURL('image/png'), format: 'png' };
}

async function createContextImageAsset(
  capture: CapturedSelectionRecord,
): Promise<GeneratedImageAsset> {
  if (capture.captureTarget === 'viewport') {
    return {
      dataUrl: capture.imageDataUrl,
      format: detectImageFormatFromDataUrl(capture.imageDataUrl),
    };
  }

  const image = await loadCaptureImage(capture.imageDataUrl);
  const detachedCanvas = document.createElement('canvas');
  drawCapturePreviewToCanvas(detachedCanvas, image, capture, 'context');

  const preferredDataUrl = detachedCanvas.toDataURL('image/webp', CONTEXT_IMAGE_QUALITY);
  if (preferredDataUrl.startsWith('data:image/webp')) {
    return {
      dataUrl: preferredDataUrl,
      format: 'webp',
    };
  }

  return {
    dataUrl: detachedCanvas.toDataURL('image/png'),
    format: 'png',
  };
}

async function persistBackendSettingsDraft(): Promise<BackendSyncSettings> {
  const previousSettings = await loadBackendSyncSettings();
  const apiChanged = previousSettings.apiBaseUrl.trim() !== backendApiBaseUrlDraft.trim();
  const loginIdentityChanged = previousSettings.username.trim() !== backendUsernameDraft.trim();
  const shouldResetAuth = apiChanged || loginIdentityChanged;
  const shouldResetSession =
    shouldResetAuth ||
    previousSettings.authToken !== backendAuthTokenDraft ||
    previousSettings.workspaceId.trim() !== backendWorkspaceIdDraft.trim() ||
    previousSettings.startedBy.trim() !== backendStartedByDraft.trim() ||
    previousSettings.actionId.trim() !== backendActionIdDraft.trim();
  const nextAuthToken = shouldResetAuth ? null : backendAuthTokenDraft;

  const nextSettings: BackendSyncSettings = {
    ...previousSettings,
    enabled: nextAuthToken !== null,
    apiBaseUrl: backendApiBaseUrlDraft,
    authToken: nextAuthToken,
    userId: shouldResetAuth ? null : backendUserIdDraft,
    username: backendUsernameDraft,
    displayName: shouldResetAuth ? '' : backendDisplayNameDraft,
    startedBy: backendStartedByDraft,
    workspaceId: backendWorkspaceIdDraft,
    systemId: backendSystemIdDraft,
    moduleId: backendModuleIdDraft,
    actionId: backendActionIdDraft,
    manualId: backendManualIdDraft,
    sessionId: shouldResetSession ? null : previousSettings.sessionId,
    sessionActionId: shouldResetSession ? null : previousSettings.sessionActionId,
    workspaceName: apiChanged
      ? null
      : backendWorkspaces.find((workspace) => workspace.id === backendWorkspaceIdDraft)?.name ?? previousSettings.workspaceName,
    storageProvider: apiChanged ? null : backendStorageProviderDraft,
    lastValidatedAt: apiChanged ? null : previousSettings.lastValidatedAt,
    lastError: shouldResetSession ? null : previousSettings.lastError,
  };

  await saveBackendSyncSettings(nextSettings);
  backendSettingsDirty = false;
  return loadBackendSyncSettings();
}

async function ensureRemoteSessionId(
  client: ReturnType<typeof createManualBuilderApiClient>,
  settings: BackendSyncSettings,
): Promise<string> {
  if (settings.sessionId !== null && settings.sessionActionId === settings.actionId) {
    return settings.sessionId;
  }

  const session = await client.createCaptureSession({
    actionId: settings.actionId,
    startedBy: settings.startedBy,
  });

  return session.id;
}

function applyRemoteSyncError(
  step: ManualStep,
  manualId: string,
  captureId: string | null,
  errorMessage: string,
): ManualStep {
  return {
    ...step,
    remoteManualId: manualId.trim().length > 0 ? manualId : null,
    remoteCaptureId: captureId,
    remoteSyncStatus: 'error',
    remoteSyncError: errorMessage,
  };
}

function getBackendSettingsConfigurationError(
  settings: BackendSyncSettings,
  requireManualId: boolean,
): string | null {
  if (settings.apiBaseUrl.trim().length === 0) {
    return 'Configura la URL base del backend.';
  }

  if (settings.authToken === null || settings.authToken.trim().length === 0) {
    return 'Inicia sesion en el backend.';
  }

  if (settings.workspaceId.trim().length === 0) {
    return 'Selecciona o crea un workspace.';
  }

  if (settings.actionId.trim().length === 0) {
    return 'Selecciona una accion remota.';
  }

  if (requireManualId && settings.manualId.trim().length === 0) {
    return 'Selecciona o crea un manual remoto antes de sincronizar pasos.';
  }

  return null;
}

function buildBackendSyncStatusText(): string {
  if (backendSettingsDirty) {
    return 'Completa el usuario y la contrasena para iniciar sesion. La seleccion del catalogo se guarda automaticamente.';
  }

  if (!currentBackendSettings.enabled) {
    return 'Inicia sesion para guardar las capturas confirmadas en el backend y en el proveedor remoto configurado.';
  }

  if (currentBackendSettings.lastError !== null) {
    return `Ultimo error remoto: ${currentBackendSettings.lastError}`;
  }

  const configurationWarning = getBackendSettingsConfigurationError(currentBackendSettings, false);
  if (configurationWarning !== null) {
    return `${configurationWarning} Selecciona una accion para guardar remotamente las capturas que confirmes.`;
  }

  if (currentBackendSettings.storageProvider === 'local') {
    return 'La conexion esta activa, pero esta API usa almacenamiento local. Cambia ASSET_STORAGE_PROVIDER a onedrive-business y reinicia la API.';
  }

  const summary: string[] = [
    `Sincronizacion al confirmar activa en ${currentBackendSettings.workspaceName ?? currentBackendSettings.apiBaseUrl}`,
  ];
  if (currentBackendSettings.username.trim().length > 0) {
    summary.push(`Usuario: ${currentBackendSettings.displayName || currentBackendSettings.username}`);
  }

  const selectedSystem = getSelectedRemoteSystem();
  const selectedModule = getSelectedRemoteModule();
  const selectedAction = getSelectedRemoteAction();
  const selectedManual = getSelectedRemoteManual();

  if (selectedSystem !== null) {
    summary.push(`Sistema: ${selectedSystem.name}`);
  }

  if (selectedModule !== null) {
    summary.push(`Modulo: ${selectedModule.name}`);
  }

  if (selectedAction !== null) {
    summary.push(`Accion: ${selectedAction.name}`);
  } else {
    summary.push(`Action: ${shortenIdentifier(currentBackendSettings.actionId)}`);
  }

  if (currentBackendSettings.manualId.trim().length > 0) {
    summary.push(`Manual: ${selectedManual?.title ?? shortenIdentifier(currentBackendSettings.manualId)}`);
  } else {
    summary.push('Sin manual remoto asignado');
  }

  if (currentBackendSettings.sessionId !== null) {
    summary.push(`Sesion: ${shortenIdentifier(currentBackendSettings.sessionId)}`);
  } else {
    summary.push('La sesion remota se creara con la siguiente captura');
  }

  if (currentBackendSettings.lastValidatedAt !== null) {
    summary.push(`Validado: ${formatTimestamp(currentBackendSettings.lastValidatedAt)}`);
  }

  return summary.join(' | ');
}

async function persistPendingEditsIfNeeded(): Promise<void> {
  if (!stepFormDirty && !manualMetaDirty) {
    return;
  }

  let nextDraft: ManualDraft = await loadManualDraft();

  if (stepFormDirty && selectedStepId !== null) {
    nextDraft = await persistStepEdits(
      nextDraft,
      selectedStepId,
      sanitizeStepTitle(stepFormTitle) || 'Elemento seleccionado',
      sanitizeStepDescription(stepFormDescription),
      sanitizeStepExpectedResult(stepFormExpectedResult),
    );
    stepFormDirty = false;
  }

  if (manualMetaDirty) {
    nextDraft = {
      ...nextDraft,
      title: sanitizeManualTitle(manualTitleDraft) || 'Manual de usuario',
      author: sanitizeManualAuthor(manualAuthorDraft),
      description: sanitizeManualDescription(manualDescriptionDraft),
    };

    manualMetaDirty = false;
  }

  await saveManualDraft(nextDraft);
  await refreshState();
}

async function persistStepEdits(
  manualDraft: ManualDraft,
  stepId: string,
  title: string,
  description: string,
  expectedResult: string,
): Promise<ManualDraft> {
  const editedAt = new Date().toISOString();
  const locallyUpdatedDraft: ManualDraft = {
    ...manualDraft,
    steps: manualDraft.steps.map((step) => (
      step.id === stepId
        ? {
            ...step,
            title,
            description,
            guide: {
              ...step.guide,
              expectedResult,
            },
            updatedAt: editedAt,
          }
        : step
    )),
  };

  await saveManualDraft(locallyUpdatedDraft);

  const locallyUpdatedStep = locallyUpdatedDraft.steps.find((step) => step.id === stepId) ?? null;
  if (locallyUpdatedStep === null) {
    return loadManualDraft();
  }

  const remotelyUpdatedStep = await syncEditedStepToBackend(locallyUpdatedStep);
  if (remotelyUpdatedStep === locallyUpdatedStep) {
    return loadManualDraft();
  }

  const remotelyUpdatedDraft: ManualDraft = {
    ...locallyUpdatedDraft,
    steps: locallyUpdatedDraft.steps.map((step) => (
      step.id === stepId ? remotelyUpdatedStep : step
    )),
  };

  await saveManualDraft(remotelyUpdatedDraft);
  return loadManualDraft();
}

function drawCapturePreviewToCanvas(
  targetCanvas: HTMLCanvasElement,
  image: HTMLImageElement,
  capture: CapturedSelectionRecord,
  mode: PreviewMode,
  redactionRegions: ImageRedactionRegion[] = capture.redactionRegions,
): void {
  const imageScale = getImageScale(image, capture);
  const sourceRect = mode === 'context'
    ? clampPixelRect(toPixelRect(capture.contextRegion, imageScale), image)
    : {
        x: 0,
        y: 0,
        width: Math.max(1, image.naturalWidth),
        height: Math.max(1, image.naturalHeight),
      };
  const selectedRect = toPixelRect(capture.selectedElement.rect, imageScale);
  const drawWidth = Math.max(1, Math.round(sourceRect.width));
  const drawHeight = Math.max(1, Math.round(sourceRect.height));

  targetCanvas.width = drawWidth;
  targetCanvas.height = drawHeight;
  targetCanvas.style.aspectRatio = `${drawWidth} / ${drawHeight}`;

  const context = targetCanvas.getContext('2d');
  if (context === null) {
    throw new Error('No se pudo obtener el contexto 2D del canvas.');
  }

  context.clearRect(0, 0, drawWidth, drawHeight);
  context.drawImage(
    image,
    sourceRect.x,
    sourceRect.y,
    sourceRect.width,
    sourceRect.height,
    0,
    0,
    drawWidth,
    drawHeight,
  );

  applyImageRedactions(
    context,
    image.naturalWidth,
    image.naturalHeight,
    sourceRect,
    drawWidth,
    drawHeight,
    redactionRegions,
  );

  if (capture.captureTarget === 'viewport') {
    return;
  }

  const drawScaleX = drawWidth / sourceRect.width;
  const drawScaleY = drawHeight / sourceRect.height;
  const highlightRect = {
    x: (selectedRect.x - sourceRect.x) * drawScaleX,
    y: (selectedRect.y - sourceRect.y) * drawScaleY,
    width: selectedRect.width * drawScaleX,
    height: selectedRect.height * drawScaleY,
  };

  drawOutsideMask(context, drawWidth, drawHeight, highlightRect, mode);
  drawHighlight(context, highlightRect);
}

function applyImageRedactions(
  context: CanvasRenderingContext2D,
  imageWidth: number,
  imageHeight: number,
  sourceRect: PixelRect,
  canvasWidth: number,
  canvasHeight: number,
  regions: ImageRedactionRegion[],
): void {
  if (regions.length === 0) {
    return;
  }

  const snapshot = document.createElement('canvas');
  snapshot.width = canvasWidth;
  snapshot.height = canvasHeight;
  const snapshotContext = snapshot.getContext('2d');
  if (snapshotContext === null) {
    throw new Error('No se pudo preparar el procesamiento de informacion sensible.');
  }
  snapshotContext.drawImage(context.canvas, 0, 0);

  const scaleX = canvasWidth / sourceRect.width;
  const scaleY = canvasHeight / sourceRect.height;

  for (const region of regions) {
    const imageRegion: PixelRect = {
      x: region.x * imageWidth,
      y: region.y * imageHeight,
      width: region.width * imageWidth,
      height: region.height * imageHeight,
    };
    const visibleRegion = intersectPixelRects(imageRegion, sourceRect);
    if (visibleRegion === null) {
      continue;
    }

    const targetRegion: PixelRect = {
      x: (visibleRegion.x - sourceRect.x) * scaleX,
      y: (visibleRegion.y - sourceRect.y) * scaleY,
      width: visibleRegion.width * scaleX,
      height: visibleRegion.height * scaleY,
    };
    drawPixelatedRegion(context, snapshot, targetRegion);
  }
}

function drawPixelatedRegion(
  context: CanvasRenderingContext2D,
  snapshot: HTMLCanvasElement,
  region: PixelRect,
): void {
  const width = Math.max(1, Math.ceil(region.width));
  const height = Math.max(1, Math.ceil(region.height));
  if (width < 2 || height < 2) {
    return;
  }

  const pixelCanvas = document.createElement('canvas');
  pixelCanvas.width = Math.max(1, Math.ceil(width / 20));
  pixelCanvas.height = Math.max(1, Math.ceil(height / 20));
  const pixelContext = pixelCanvas.getContext('2d');
  if (pixelContext === null) {
    throw new Error('No se pudo difuminar la zona seleccionada.');
  }

  pixelContext.drawImage(
    snapshot,
    region.x,
    region.y,
    region.width,
    region.height,
    0,
    0,
    pixelCanvas.width,
    pixelCanvas.height,
  );

  context.save();
  context.beginPath();
  context.rect(region.x, region.y, region.width, region.height);
  context.clip();
  context.imageSmoothingEnabled = false;
  context.filter = `blur(${Math.max(8, Math.min(18, Math.round(Math.min(width, height) / 7)))}px)`;
  context.drawImage(
    pixelCanvas,
    0,
    0,
    pixelCanvas.width,
    pixelCanvas.height,
    region.x - 10,
    region.y - 10,
    region.width + 20,
    region.height + 20,
  );
  context.filter = 'none';
  context.fillStyle = 'rgba(19, 34, 56, 0.14)';
  context.fillRect(region.x, region.y, region.width, region.height);
  context.restore();
}

function intersectPixelRects(first: PixelRect, second: PixelRect): PixelRect | null {
  const x = Math.max(first.x, second.x);
  const y = Math.max(first.y, second.y);
  const right = Math.min(first.x + first.width, second.x + second.width);
  const bottom = Math.min(first.y + first.height, second.y + second.height);

  return right > x && bottom > y
    ? { x, y, width: right - x, height: bottom - y }
    : null;
}

function drawOutsideMask(
  context: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  highlightRect: PixelRect,
  mode: PreviewMode,
): void {
  const x = clampNumber(highlightRect.x, 0, canvasWidth);
  const y = clampNumber(highlightRect.y, 0, canvasHeight);
  const right = clampNumber(highlightRect.x + highlightRect.width, 0, canvasWidth);
  const bottom = clampNumber(highlightRect.y + highlightRect.height, 0, canvasHeight);

  context.save();
  context.fillStyle = mode === 'context' ? 'rgba(19, 34, 56, 0.12)' : 'rgba(19, 34, 56, 0.18)';
  context.fillRect(0, 0, canvasWidth, y);
  context.fillRect(0, y, x, Math.max(0, bottom - y));
  context.fillRect(right, y, Math.max(0, canvasWidth - right), Math.max(0, bottom - y));
  context.fillRect(0, bottom, canvasWidth, Math.max(0, canvasHeight - bottom));
  context.restore();
}

function drawHighlight(context: CanvasRenderingContext2D, highlightRect: PixelRect): void {
  const borderWidth = Math.max(
    3,
    Math.min(10, Math.round(Math.min(highlightRect.width, highlightRect.height) * 0.03)),
  );
  const inset = borderWidth / 2;

  context.save();
  context.strokeStyle = '#ffffff';
  context.lineWidth = borderWidth + 2;
  context.strokeRect(
    highlightRect.x - inset,
    highlightRect.y - inset,
    highlightRect.width + borderWidth,
    highlightRect.height + borderWidth,
  );

  context.strokeStyle = '#e53935';
  context.lineWidth = borderWidth;
  context.strokeRect(
    highlightRect.x,
    highlightRect.y,
    highlightRect.width,
    highlightRect.height,
  );
  context.restore();
}

function clearPreviewCanvas(): void {
  captureCanvas.width = 1;
  captureCanvas.height = 1;
  captureCanvas.style.removeProperty('aspect-ratio');
}

async function runPanelAction(action: () => Promise<void>): Promise<void> {
  if (panelBusy) {
    return;
  }

  panelBusy = true;
  render();

  try {
    await action();
  } finally {
    panelBusy = false;
    render();
  }
}

function getSelectedCapture(): CapturedSelectionRecord | null {
  return currentState.captures.find((capture) => capture.id === selectedCaptureId) ?? null;
}

function getSelectedStep(): ManualStep | null {
  return currentDraft.steps.find((step) => step.id === selectedStepId) ?? null;
}

function syncStepFormState(selectedStep: ManualStep | null): void {
  if (selectedStep === null) {
    stepFormStepId = null;
    stepFormTitle = '';
    stepFormDescription = '';
    stepFormExpectedResult = '';
    stepFormDirty = false;
    return;
  }

  if (stepFormStepId === selectedStep.id && stepFormDirty) {
    return;
  }

  stepFormStepId = selectedStep.id;
  stepFormTitle = selectedStep.title;
  stepFormDescription = selectedStep.description;
  stepFormExpectedResult = selectedStep.guide?.expectedResult ?? '';
  stepFormDirty = false;
}

function syncManualMetaFormState(): void {
  if (manualMetaDirty) {
    return;
  }

  manualTitleDraft = currentDraft.title;
  manualAuthorDraft = currentDraft.author;
  manualDescriptionDraft = currentDraft.description;
}

function syncBackendSettingsFormState(): void {
  if (backendSettingsDirty) {
    return;
  }

  backendApiBaseUrlDraft = currentBackendSettings.apiBaseUrl;
  backendAuthTokenDraft = currentBackendSettings.authToken;
  backendUserIdDraft = currentBackendSettings.userId;
  backendUsernameDraft = currentBackendSettings.username;
  backendDisplayNameDraft = currentBackendSettings.displayName;
  backendPasswordDraft = '';
  backendStartedByDraft = currentBackendSettings.startedBy;
  backendWorkspaceIdDraft = currentBackendSettings.workspaceId;
  backendSystemIdDraft = currentBackendSettings.systemId;
  backendModuleIdDraft = currentBackendSettings.moduleId;
  backendActionIdDraft = currentBackendSettings.actionId;
  backendManualIdDraft = currentBackendSettings.manualId;
  backendStorageProviderDraft = currentBackendSettings.storageProvider;
}

function getStatusPresentation(
  state: CapturePanelState,
  busy: boolean,
): { text: string; modifierClass: string } {
  if (busy) {
    return { text: 'Procesando', modifierClass: 'is-capturing' };
  }

  switch (state.status) {
    case 'capturing':
      return { text: 'Capturando', modifierClass: 'is-capturing' };
    case 'ready':
      return { text: 'Listo', modifierClass: 'is-ready' };
    case 'error':
      return { text: 'Con error', modifierClass: 'is-error' };
    default:
      return { text: 'Sin actividad', modifierClass: 'is-idle' };
  }
}

function removeCaptureFromState(
  state: CapturePanelState,
  captureId: string,
): CapturePanelState {
  const nextCaptures = state.captures.filter((capture) => capture.id !== captureId);

  return {
    ...state,
    captures: nextCaptures,
    status: nextCaptures.length > 0 ? 'ready' : 'idle',
    pendingSelection: null,
    lastUpdatedAt: new Date().toISOString(),
  };
}

function getNextCaptureId(captures: CapturedSelectionRecord[], removedCaptureId: string): string | null {
  const remainingCaptures = captures.filter((capture) => capture.id !== removedCaptureId);
  return remainingCaptures.at(-1)?.id ?? null;
}

function normalizeSeedDate(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized !== undefined && normalized.length > 0 ? normalized : null;
}

function formatTimestamp(isoDate: string): string {
  return new Date(isoDate).toLocaleString('es-EC', {
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

function formatRemoteSyncStatus(status: ManualStep['remoteSyncStatus'] | CapturedSelectionRecord['remoteSyncStatus']): string {
  switch (status) {
    case 'synced':
      return 'Remoto OK';
    case 'error':
      return 'Remoto con error';
    default:
      return 'Solo local';
  }
}

function formatRect(rect: SelectionRect): string {
  return `x:${Math.round(rect.x)} y:${Math.round(rect.y)} | ${Math.round(rect.width)}x${Math.round(rect.height)} px`;
}

function formatViewport(capture: CapturedSelectionRecord): string {
  const { width, height, devicePixelRatio } = capture.selectedElement.viewport;
  return `${width}x${height} | DPR ${devicePixelRatio}`;
}

function formatReviewSurface(reviewSurface: ReviewSurface): string {
  switch (reviewSurface) {
    case 'sidepanel':
      return 'Panel lateral';
    case 'sidebar':
      return 'Barra lateral';
    default:
      return 'Pestana de revision';
  }
}

function getPreviewCaption(mode: PreviewMode): string {
  if (mode === 'context') {
    return 'Recorte contextual: muestra el elemento seleccionado con parte del entorno para que el paso del manual sea mas claro.';
  }

  return 'Pantalla completa: mantiene la captura visible completa y resalta el elemento dentro del viewport.';
}

function getEffectiveManualTitle(): string {
  return sanitizeManualTitle(manualTitleDraft) || currentDraft.title || 'Manual de usuario';
}

function getImageScale(
  image: HTMLImageElement,
  capture: CapturedSelectionRecord,
): ImageScale {
  const viewport = capture.selectedElement.viewport;
  return {
    x: image.naturalWidth / Math.max(1, viewport.width),
    y: image.naturalHeight / Math.max(1, viewport.height),
  };
}

function toPixelRect(rect: SelectionRect, imageScale: ImageScale): PixelRect {
  return {
    x: rect.x * imageScale.x,
    y: rect.y * imageScale.y,
    width: rect.width * imageScale.x,
    height: rect.height * imageScale.y,
  };
}

function clampPixelRect(rect: PixelRect, image: HTMLImageElement): PixelRect {
  const x = clampNumber(rect.x, 0, image.naturalWidth);
  const y = clampNumber(rect.y, 0, image.naturalHeight);
  const right = clampNumber(rect.x + rect.width, 0, image.naturalWidth);
  const bottom = clampNumber(rect.y + rect.height, 0, image.naturalHeight);

  return {
    x,
    y,
    width: Math.max(1, right - x),
    height: Math.max(1, bottom - y),
  };
}

function clampNumber(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

function loadCaptureImage(imageDataUrl: string): Promise<HTMLImageElement> {
  const existingImage = captureImageCache.get(imageDataUrl);
  if (existingImage !== undefined) {
    return existingImage;
  }

  const imagePromise = new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('La captura no pudo cargarse en el panel.'));
    image.src = imageDataUrl;
  });

  captureImageCache.set(imageDataUrl, imagePromise);
  return imagePromise;
}

function buildExportStamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function shortenIdentifier(value: string): string {
  return value.length <= 12 ? value : `${value.slice(0, 8)}...${value.slice(-4)}`;
}

function parseWorkspaceMemberRole(value: string): RemoteWorkspaceMemberRole {
  if (value === 'admin' || value === 'viewer') {
    return value;
  }

  return 'editor';
}

function buildStepFileBaseName(step: ManualStep): string {
  return `manual-step-${String(step.order).padStart(2, '0')}-${slugify(step.title)}`;
}

function slugify(value: string): string {
  const normalized = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return normalized || 'paso';
}

function downloadTextFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const objectUrl = URL.createObjectURL(blob);
  triggerDownload(objectUrl, filename);
  window.setTimeout(() => {
    URL.revokeObjectURL(objectUrl);
  }, 1_000);
}

function downloadDataUrlFile(dataUrl: string, filename: string): void {
  triggerDownload(dataUrl, filename);
}

function triggerDownload(href: string, filename: string): void {
  const anchor = document.createElement('a');
  anchor.href = href;
  anchor.download = filename;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

function getManualPageUrl(): string {
  return getRuntimeUrl(MANUAL_PAGE_PATH);
}

function getRuntimeUrl(path: string): string {
  return (browser.runtime.getURL as (resourcePath: string) => string)(path);
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return 'Se produjo un error desconocido.';
}

function queryElement<TElement extends HTMLElement>(id: string): TElement {
  const element = document.getElementById(id);
  if (element === null) {
    throw new Error(`No se encontro el elemento requerido: ${id}`);
  }

  return element as TElement;
}
