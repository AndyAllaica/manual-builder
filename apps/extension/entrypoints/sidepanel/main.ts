import {
  MANUAL_DRAFT_STORAGE_KEY,
  MESSAGE_TYPE_CLEAR_CAPTURES,
  PANEL_STATE_STORAGE_KEY,
  buildStepTitleSuggestion,
  createEmptyManualDraft,
  createEmptyPanelState,
  createManualStep,
  getImageExtension,
  sanitizeManualAuthor,
  sanitizeManualDescription,
  sanitizeManualTitle,
  sanitizeStepDescription,
  sanitizeStepTitle,
  type CapturePanelState,
  type CaptureMode,
  type CapturedSelectionRecord,
  type ImageAssetFormat,
  type ManualDraft,
  type ManualStep,
  type ReviewSurface,
  type SelectionRect,
} from '../../lib/manual-builder';
import { loadPanelState, savePanelState } from '../../lib/panel-state';
import { loadManualDraft, resetManualDraft, saveManualDraft } from '../../lib/manual-step-state';
import './style.css';

type PreviewMode = 'context' | 'full';

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

let currentState: CapturePanelState = createEmptyPanelState();
let currentDraft: ManualDraft = createEmptyManualDraft();
let selectedCaptureId: string | null = null;
let selectedStepId: string | null = null;
let previewMode: PreviewMode = 'context';
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

const captureImageCache = new Map<string, Promise<HTMLImageElement>>();

const statusBadge = queryElement<HTMLSpanElement>('status-badge');
const clearCapturesButton = queryElement<HTMLButtonElement>('clear-captures-button');
const summaryTitle = queryElement<HTMLParagraphElement>('summary-title');
const summaryText = queryElement<HTMLParagraphElement>('summary-text');
const captureModeTitle = queryElement<HTMLHeadingElement>('capture-mode-title');
const captureModeText = queryElement<HTMLParagraphElement>('capture-mode-text');
const toggleCaptureModeButton = queryElement<HTMLButtonElement>('toggle-capture-mode-button');
const pendingSection = queryElement<HTMLElement>('pending-section');
const pendingSelector = queryElement<HTMLParagraphElement>('pending-selector');
const errorSection = queryElement<HTMLElement>('error-section');
const errorText = queryElement<HTMLParagraphElement>('error-text');
const previewSection = queryElement<HTMLElement>('preview-section');
const reviewEmptySection = queryElement<HTMLElement>('review-empty-section');
const contextModeButton = queryElement<HTMLButtonElement>('context-mode-button');
const fullModeButton = queryElement<HTMLButtonElement>('full-mode-button');
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
const detailContext = queryElement<HTMLElement>('detail-context');
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
const downloadContextButton = queryElement<HTMLButtonElement>('download-context-button');
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
const openManualViewButton = queryElement<HTMLButtonElement>('open-manual-view-button');
const openPrintViewButton = queryElement<HTMLButtonElement>('open-print-view-button');

void initializeSidePanel();

async function initializeSidePanel(): Promise<void> {
  clearCapturesButton.addEventListener('click', () => {
    void browser.runtime.sendMessage({
      type: MESSAGE_TYPE_CLEAR_CAPTURES,
    });
  });

  toggleCaptureModeButton.addEventListener('click', () => {
    void runPanelAction(handleToggleCaptureMode);
  });

  contextModeButton.addEventListener('click', () => {
    previewMode = 'context';
    render();
  });

  fullModeButton.addEventListener('click', () => {
    previewMode = 'full';
    render();
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

  downloadContextButton.addEventListener('click', () => {
    handleDownloadSelectedStepImage('context');
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

  openManualViewButton.addEventListener('click', () => {
    void runPanelAction(async () => {
      await openManualPage(false);
    });
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
      areaName === 'local' && Object.prototype.hasOwnProperty.call(changes, MANUAL_DRAFT_STORAGE_KEY);

    if (!watchedSessionChange && !watchedLocalChange) {
      return;
    }

    void refreshState();
  });

  await refreshState();
}

async function refreshState(): Promise<void> {
  const [panelState, manualDraft] = await Promise.all([
    loadPanelState(),
    loadManualDraft(),
  ]);

  currentState = panelState;
  currentDraft = manualDraft;

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
  render();
}

function render(): void {
  const selectedCapture = getSelectedCapture();
  const selectedStep = getSelectedStep();

  renderStatusBadge();
  renderSummary();
  renderCaptureMode();
  renderPendingSection();
  renderErrorSection();
  renderCapturePreview(selectedCapture);
  renderCaptureQueue(selectedCapture);
  renderPreviewModeButtons();
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

function renderCaptureMode(): void {
  const presentation = getCaptureModePresentation(currentState.captureMode);
  captureModeTitle.textContent = presentation.title;
  captureModeText.textContent = presentation.description;
  toggleCaptureModeButton.textContent = presentation.buttonLabel;
  toggleCaptureModeButton.className = presentation.buttonClassName;
  toggleCaptureModeButton.disabled = panelBusy;
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
  const shouldShowError = currentState.lastError !== null;
  errorSection.hidden = !shouldShowError;
  errorText.textContent = currentState.lastError ?? '';
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
  previewCaption.textContent = getPreviewCaption(previewMode);
  detailTag.textContent = selectedCapture.selectedElement.tagName;
  detailId.textContent = selectedCapture.selectedElement.id ?? 'Sin ID';
  detailSelector.textContent = selectedCapture.selectedElement.selector;
  detailText.textContent = selectedCapture.selectedElement.text ?? 'Sin texto visible';
  detailPage.textContent = selectedCapture.selectedElement.url;
  detailRect.textContent = formatRect(selectedCapture.selectedElement.rect);
  detailContext.textContent = formatRect(selectedCapture.contextRegion);
  detailViewport.textContent = formatViewport(selectedCapture);
  detailSurface.textContent = formatReviewSurface(currentState.reviewSurface);
  confirmCaptureButton.disabled = panelBusy;
  discardCaptureButton.disabled = panelBusy;

  const renderToken = previewRenderToken;
  void drawPreview(selectedCapture, previewMode, renderToken);
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
    subtitle.textContent = `${capture.selectedElement.tagName} | ${formatTimestamp(capture.createdAt)}`;

    const text = document.createElement('span');
    text.textContent = capture.selectedElement.text ?? capture.selectedElement.pageTitle;

    content.append(title, subtitle, text);
    button.append(thumbnail, content);
    fragment.appendChild(button);
  }

  historyList.appendChild(fragment);
}

function renderPreviewModeButtons(): void {
  const isContextMode = previewMode === 'context';
  contextModeButton.className = isContextMode ? 'mode-button is-active' : 'mode-button';
  fullModeButton.className = isContextMode ? 'mode-button' : 'mode-button is-active';
  contextModeButton.setAttribute('aria-pressed', String(isContextMode));
  fullModeButton.setAttribute('aria-pressed', String(!isContextMode));
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
  stepPreviewImage.src = selectedStep.imageContextDataUrl;
  stepPreviewImage.alt = `Vista del ${selectedStep.title}`;
  stepHeading.textContent = selectedStep.title;
  stepMeta.textContent = `Paso ${selectedStep.order} | ${selectedStep.pageTitle || 'Pagina sin titulo'}`;
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
    button.addEventListener('click', () => {
      selectedStepId = step.id;
      stepFormDirty = false;
      syncStepFormState(step);
      render();
    });

    const orderBadge = document.createElement('span');
    orderBadge.className = 'step-order';
    orderBadge.textContent = `${step.order}`;

    const copy = document.createElement('div');
    copy.className = 'step-copy';

    const title = document.createElement('strong');
    title.textContent = step.title;

    const subtitle = document.createElement('span');
    subtitle.textContent = `${step.selector} | ${formatTimestamp(step.createdAt)}`;

    const description = document.createElement('span');
    description.textContent = step.description || step.pageTitle;

    copy.append(title, subtitle, description);
    button.append(orderBadge, copy);
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
  openManualViewButton.disabled = !hasSteps || panelBusy;
  openPrintViewButton.disabled = !hasSteps || panelBusy;
  saveManualMetaButton.disabled = panelBusy || !manualMetaDirty;
  toggleCaptureModeButton.disabled = panelBusy;
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
  downloadContextButton.disabled = !hasSelectedStep || panelBusy;
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
  const nextStep = createManualStep({
    capture,
    order: nextOrder,
    title: buildStepTitleSuggestion(capture, nextOrder),
    description: '',
    imageContextDataUrl: contextAsset.dataUrl,
    imageContextFormat: contextAsset.format,
  });

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

  selectedCaptureId = getNextCaptureId(panelState.captures, capture.id);
  await savePanelState(removeCaptureFromState(panelState, capture.id));
  await refreshState();
}

async function handleSaveSelectedStep(): Promise<void> {
  const manualDraft = await loadManualDraft();
  const selectedStep = manualDraft.steps.find((step) => step.id === selectedStepId) ?? null;

  if (selectedStep === null) {
    await refreshState();
    return;
  }

  const title = sanitizeStepTitle(stepFormTitle) || `Paso ${selectedStep.order}`;
  const description = sanitizeStepDescription(stepFormDescription);

  const nextSteps = manualDraft.steps.map((step) => (
    step.id === selectedStep.id
      ? {
          ...step,
          title,
          description,
        }
      : step
  ));

  stepFormDirty = false;
  await saveManualDraft({
    ...manualDraft,
    steps: nextSteps,
  });
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

async function handleToggleCaptureMode(): Promise<void> {
  const panelState = await loadPanelState();
  const nextMode: CaptureMode = panelState.captureMode === 'capture-only' ? 'review' : 'capture-only';

  await savePanelState({
    ...panelState,
    captureMode: nextMode,
    lastUpdatedAt: new Date().toISOString(),
  });

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

async function createContextImageAsset(
  capture: CapturedSelectionRecord,
): Promise<{ dataUrl: string; format: ImageAssetFormat }> {
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

async function persistPendingEditsIfNeeded(): Promise<void> {
  if (!stepFormDirty && !manualMetaDirty) {
    return;
  }

  const manualDraft = await loadManualDraft();
  let nextDraft: ManualDraft = manualDraft;

  if (stepFormDirty && selectedStepId !== null) {
    nextDraft = {
      ...nextDraft,
      steps: nextDraft.steps.map((step) => (
        step.id === selectedStepId
          ? {
              ...step,
              title: sanitizeStepTitle(stepFormTitle) || `Paso ${step.order}`,
              description: sanitizeStepDescription(stepFormDescription),
            }
          : step
      )),
    };

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

function getCaptureModePresentation(mode: CaptureMode): {
  title: string;
  description: string;
  buttonLabel: string;
  buttonClassName: string;
} {
  if (mode === 'capture-only') {
    return {
      title: 'Solo captura activo',
      description: 'La extension acumula capturas en la cola temporal sin abrir la revision automaticamente. El clic real del navegador continua normalmente, asi que puedes avanzar por la aplicacion mientras capturas. Presiona ALT + S una vez y sigue seleccionando hasta ESC. La cola conserva hasta 12 capturas o hasta agotar el presupuesto temporal de memoria.',
      buttonLabel: 'Desactivar solo captura',
      buttonClassName: 'primary-button',
    };
  }

  return {
    title: 'Revision paso a paso',
    description: 'Cada captura abre la revision para decidir de inmediato si se convierte en paso del manual o si se descarta.',
    buttonLabel: 'Activar solo captura',
    buttonClassName: 'secondary-button',
  };
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

  return 'Error desconocido al cargar la vista previa.';
}

function queryElement<TElement extends HTMLElement>(id: string): TElement {
  const element = document.getElementById(id);
  if (element === null) {
    throw new Error(`No se encontro el elemento requerido: ${id}`);
  }

  return element as TElement;
}
