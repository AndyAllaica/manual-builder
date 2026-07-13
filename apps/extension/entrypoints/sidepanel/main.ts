import {
  BACKEND_SYNC_SETTINGS_STORAGE_KEY,
  MANUAL_DRAFT_STORAGE_KEY,
  MESSAGE_TYPE_CLEAR_CAPTURES,
  PANEL_STATE_STORAGE_KEY,
  buildStepTitleSuggestion,
  createEmptyBackendSyncSettings,
  createEmptyManualDraft,
  createEmptyPanelState,
  createManualStep,
  getImageExtension,
  sanitizeManualAuthor,
  sanitizeManualDescription,
  sanitizeManualTitle,
  sanitizeStepDescription,
  sanitizeStepTitle,
  type BackendSyncSettings,
  type CapturePanelState,
  type CapturedSelectionRecord,
  type ImageAssetFormat,
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
  type WorkspaceOverview,
} from '../../lib/manual-builder-api';
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

const MANUAL_PAGE_PATH = '/manual.html' as const;
const DEFAULT_REMOTE_FRAMING = 'full' as const;

let currentState: CapturePanelState = createEmptyPanelState();
let currentDraft: ManualDraft = createEmptyManualDraft();
let currentBackendSettings: BackendSyncSettings = createEmptyBackendSyncSettings();
let selectedCaptureId: string | null = null;
let selectedStepId: string | null = null;
let draggedStepId: string | null = null;
let stepDragJustFinished = false;
let previewRenderToken = 0;
let panelBusy = false;
let stepFormStepId: string | null = null;
let stepFormTitle = '';
let stepFormDescription = '';
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

const captureImageCache = new Map<string, Promise<HTMLImageElement>>();

const statusBadge = queryElement<HTMLSpanElement>('status-badge');
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
const pendingSection = queryElement<HTMLElement>('pending-section');
const pendingSelector = queryElement<HTMLParagraphElement>('pending-selector');
const errorSection = queryElement<HTMLElement>('error-section');
const errorText = queryElement<HTMLParagraphElement>('error-text');
const previewSection = queryElement<HTMLElement>('preview-section');
const reviewEmptySection = queryElement<HTMLElement>('review-empty-section');
const captureCanvas = queryElement<HTMLCanvasElement>('capture-canvas');
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
    backendSystemIdDraft = '';
    backendModuleIdDraft = '';
    backendActionIdDraft = '';
    backendManualIdDraft = '';
    backendCatalog = null;
    backendManuals = [];
    backendSettingsDirty = true;
    void runPanelAction(async () => {
      await loadBackendCatalogForDraft();
      await persistBackendSettingsDraft();
    });
  });

  backendSystemSelect.addEventListener('change', () => {
    backendSystemIdDraft = backendSystemSelect.value;
    backendModuleIdDraft = '';
    backendActionIdDraft = '';
    backendManualIdDraft = '';
    backendManuals = [];
    backendSettingsDirty = true;
    renderBackendSyncSection();
    void runPanelAction(async () => {
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
      await persistBackendSettingsDraft();
    });
  });

  backendActionSelect.addEventListener('change', () => {
    backendActionIdDraft = backendActionSelect.value;
    backendManualIdDraft = '';
    backendSettingsDirty = true;
    void runPanelAction(async () => {
      await loadManualsForSelectedAction();
      await persistBackendSettingsDraft();
    });
  });

  backendManualSelect.addEventListener('change', () => {
    backendManualIdDraft = backendManualSelect.value;
    backendSettingsDirty = true;
    renderBackendSyncSection();
    void runPanelAction(async () => {
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
    selectedCaptureId = currentState.captures[0]?.id ?? null;
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
    summaryText.textContent = 'Presiona ALT + S en la pagina. Cada clic guardara una captura en cola, dejara pasar la accion real del elemento y el selector seguira activo hasta que presiones ESC.';
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
  previewCaption.textContent = getPreviewCaption('full');
  detailTag.textContent = selectedCapture.selectedElement.tagName;
  detailId.textContent = selectedCapture.selectedElement.id ?? 'Sin ID';
  detailSelector.textContent = selectedCapture.selectedElement.selector;
  detailText.textContent = selectedCapture.selectedElement.text ?? 'Sin texto visible';
  detailPage.textContent = selectedCapture.selectedElement.url;
  detailRect.textContent = formatRect(selectedCapture.selectedElement.rect);
  detailViewport.textContent = formatViewport(selectedCapture);
  detailSurface.textContent = `${formatReviewSurface(currentState.reviewSurface)} | ${formatRemoteSyncStatus(selectedCapture.remoteSyncStatus)}`;
  confirmCaptureButton.disabled = panelBusy;
  discardCaptureButton.disabled = panelBusy;

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

  for (const capture of currentState.captures) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = capture.id === selectedCapture?.id ? 'history-item is-active' : 'history-item';
    if (capture.remoteSyncStatus === 'error') {
      button.classList.add('has-error');
      button.title = capture.remoteSyncError ?? 'La captura no se sincronizo con el backend.';
    }
    button.disabled = panelBusy;
    button.addEventListener('click', () => {
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

    drawCapturePreviewToCanvas(captureCanvas, image, capture, mode);
  } catch (error) {
    if (renderToken !== previewRenderToken) {
      return;
    }

    clearPreviewCanvas();
    previewCaption.textContent = `No se pudo dibujar la vista previa: ${getErrorMessage(error)}`;
  }
}

async function handleConfirmSelectedCapture(): Promise<void> {
  const panelState = await loadPanelState();
  const manualDraft = await loadManualDraft();
  const capture = panelState.captures.find((entry) => entry.id === selectedCaptureId) ?? null;

  if (capture === null) {
    await refreshState();
    return;
  }

  const contextAsset = await createContextImageAsset(capture);
  const nextOrder = manualDraft.steps.length + 1;
  const localStep = createManualStep({
    capture,
    order: nextOrder,
    title: buildStepTitleSuggestion(capture),
    description: '',
    imageContextDataUrl: contextAsset.dataUrl,
    imageContextFormat: contextAsset.format,
  });
  const nextStep = await syncConfirmedStepToBackend(capture, localStep, contextAsset);

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

  stepFormDirty = false;
  await persistStepEdits(manualDraft, selectedStep.id, title, description);
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
  const imageAsset = await fetchRemoteAssetAsImageAsset(remoteStep.asset, apiBaseUrl);
  const selectedElement = buildSelectedElementFromRemoteStep(remoteStep);

  return {
    id: crypto.randomUUID(),
    order,
    title: sanitizeStepTitle(remoteStep.title) || `Paso ${order}`,
    description: sanitizeStepDescription(remoteStep.description),
    selector: remoteStep.selector,
    url: remoteStep.pageUrl,
    pageTitle: remoteStep.pageTitle,
    imageOriginalDataUrl: imageAsset.dataUrl,
    imageOriginalFormat: imageAsset.format,
    imageContextDataUrl: imageAsset.dataUrl,
    imageContextFormat: imageAsset.format,
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

async function syncConfirmedStepToBackend(
  capture: CapturedSelectionRecord,
  step: ManualStep,
  contextAsset: GeneratedImageAsset,
): Promise<ManualStep> {
  const settings = await loadBackendSyncSettings();
  if (!settings.enabled) {
    return step;
  }

  const configurationError = getBackendSettingsConfigurationError(settings, true);
  if (configurationError !== null) {
    await saveBackendSyncSettings({
      ...settings,
      lastError: configurationError,
    });

    return applyRemoteSyncError(step, settings.manualId, capture.remoteCaptureId, configurationError);
  }

  try {
    const client = createManualBuilderApiClient(settings.apiBaseUrl, settings.authToken);
    const sessionId = await ensureRemoteSessionId(client, settings);
    const canReuseRemoteCapture =
      capture.remoteCaptureId !== null &&
      capture.remoteSessionId !== null &&
      capture.remoteSessionId === sessionId;

    let remoteCaptureId = capture.remoteCaptureId;

    if (!canReuseRemoteCapture) {
      const createdCapture = await client.createCapture(sessionId, {
        ...buildRemoteCapturePayload(capture.selectedElement, capture.imageDataUrl, step.title),
        description: step.description,
        framing: DEFAULT_REMOTE_FRAMING,
        contextImageDataUrl: contextAsset.dataUrl,
      });
      remoteCaptureId = createdCapture.capture.id;
    } else if (remoteCaptureId !== null) {
      await client.reviewCapture(remoteCaptureId, {
        status: 'pending',
        title: step.title,
        description: step.description,
        framing: DEFAULT_REMOTE_FRAMING,
        contextImageDataUrl: contextAsset.dataUrl,
      });
    }

    if (remoteCaptureId === null) {
      throw new Error('No se pudo resolver el identificador remoto de la captura.');
    }

    const response = await client.addStepFromCapture(settings.manualId, {
      captureId: remoteCaptureId,
      title: step.title,
      description: step.description,
      framing: DEFAULT_REMOTE_FRAMING,
    });

    await saveBackendSyncSettings({
      ...settings,
      apiBaseUrl: client.baseUrl,
      sessionId,
      sessionActionId: settings.actionId,
      lastError: null,
    });

    return {
      ...step,
      remoteManualId: settings.manualId,
      remoteCaptureId,
      remoteStepId: response.step.id,
      remoteSyncStatus: 'synced',
      remoteSyncError: null,
    };
  } catch (error) {
    const syncError = getErrorMessage(error);

    await saveBackendSyncSettings({
      ...settings,
      lastError: syncError,
    });

    return applyRemoteSyncError(step, settings.manualId, capture.remoteCaptureId, syncError);
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

async function createContextImageAsset(
  capture: CapturedSelectionRecord,
): Promise<GeneratedImageAsset> {
  const image = await loadCaptureImage(capture.imageDataUrl);
  const detachedCanvas = document.createElement('canvas');
  drawCapturePreviewToCanvas(detachedCanvas, image, capture, 'context');

  const preferredDataUrl = detachedCanvas.toDataURL('image/webp', 0.84);
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
    return 'Inicia sesion para guardar las nuevas capturas en el backend y en el proveedor remoto configurado.';
  }

  if (currentBackendSettings.lastError !== null) {
    return `Ultimo error remoto: ${currentBackendSettings.lastError}`;
  }

  const configurationWarning = getBackendSettingsConfigurationError(currentBackendSettings, false);
  if (configurationWarning !== null) {
    return `${configurationWarning} Selecciona una accion para activar el guardado automatico de nuevas capturas.`;
  }

  if (currentBackendSettings.storageProvider === 'local') {
    return 'La conexion esta activa, pero esta API usa almacenamiento local. Cambia ASSET_STORAGE_PROVIDER a onedrive-business y reinicia la API.';
  }

  const summary: string[] = [
    `Sincronizacion automatica activa en ${currentBackendSettings.workspaceName ?? currentBackendSettings.apiBaseUrl}`,
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
  const borderWidth = Math.max(2, Math.round(Math.min(highlightRect.width, highlightRect.height) * 0.03));
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
    stepFormDirty = false;
    return;
  }

  if (stepFormStepId === selectedStep.id && stepFormDirty) {
    return;
  }

  stepFormStepId = selectedStep.id;
  stepFormTitle = selectedStep.title;
  stepFormDescription = selectedStep.description;
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
  return remainingCaptures[0]?.id ?? null;
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
  return (browser.runtime.getURL as (path: string) => string)(MANUAL_PAGE_PATH);
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
