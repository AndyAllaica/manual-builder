import {
  MESSAGE_TYPE_CLEAR_CAPTURES,
  createEmptyPanelState,
  type CapturePanelState,
  type CapturedSelectionRecord,
} from '../../lib/manual-builder';
import { loadPanelState } from '../../lib/panel-state';
import './style.css';

let currentState: CapturePanelState = createEmptyPanelState();
let selectedCaptureId: string | null = null;

const statusBadge = queryElement<HTMLSpanElement>('status-badge');
const clearButton = queryElement<HTMLButtonElement>('clear-button');
const summaryTitle = queryElement<HTMLParagraphElement>('summary-title');
const summaryText = queryElement<HTMLParagraphElement>('summary-text');
const pendingSection = queryElement<HTMLElement>('pending-section');
const pendingSelector = queryElement<HTMLParagraphElement>('pending-selector');
const errorSection = queryElement<HTMLElement>('error-section');
const errorText = queryElement<HTMLParagraphElement>('error-text');
const previewSection = queryElement<HTMLElement>('preview-section');
const captureImage = queryElement<HTMLImageElement>('capture-image');
const captureHeading = queryElement<HTMLHeadingElement>('capture-heading');
const captureTime = queryElement<HTMLParagraphElement>('capture-time');
const emptySection = queryElement<HTMLElement>('empty-section');
const historyCount = queryElement<HTMLParagraphElement>('history-count');
const historyList = queryElement<HTMLDivElement>('history-list');
const detailTag = queryElement<HTMLElement>('detail-tag');
const detailId = queryElement<HTMLElement>('detail-id');
const detailSelector = queryElement<HTMLElement>('detail-selector');
const detailText = queryElement<HTMLParagraphElement>('detail-text');
const detailPage = queryElement<HTMLParagraphElement>('detail-page');
const detailRect = queryElement<HTMLElement>('detail-rect');
const detailViewport = queryElement<HTMLElement>('detail-viewport');

void initializeSidePanel();

async function initializeSidePanel(): Promise<void> {
  clearButton.addEventListener('click', () => {
    void browser.runtime.sendMessage({
      type: MESSAGE_TYPE_CLEAR_CAPTURES,
    });
  });

  browser.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'session') {
      return;
    }

    if (!Object.prototype.hasOwnProperty.call(changes, 'manualBuilderPanelState')) {
      return;
    }

    void refreshState();
  });

  await refreshState();
}

async function refreshState(): Promise<void> {
  currentState = await loadPanelState();

  if (
    selectedCaptureId === null ||
    !currentState.captures.some((capture) => capture.id === selectedCaptureId)
  ) {
    selectedCaptureId = currentState.captures[0]?.id ?? null;
  }

  render();
}

function render(): void {
  const selectedCapture = currentState.captures.find((capture) => capture.id === selectedCaptureId) ?? null;

  renderStatusBadge();
  renderSummary();
  renderPendingSection();
  renderErrorSection();
  renderPreview(selectedCapture);
  renderEmptySection(selectedCapture);
  renderHistory(selectedCapture);

  clearButton.disabled = currentState.captures.length === 0 && currentState.pendingSelection === null;
}

function renderStatusBadge(): void {
  const { text, modifierClass } = getStatusPresentation(currentState);
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
    summaryTitle.textContent = 'La última captura falló';
    summaryText.textContent = currentState.lastError;
    return;
  }

  if (currentState.captures.length > 0) {
    const latestCapture = currentState.captures[0];
    if (latestCapture === undefined) {
      return;
    }

    summaryTitle.textContent = `${currentState.captures.length} captura${currentState.captures.length === 1 ? '' : 's'} disponible${currentState.captures.length === 1 ? '' : 's'}`;
    summaryText.textContent = `Última selección: ${latestCapture.selectedElement.selector}`;
    return;
  }

  summaryTitle.textContent = 'Esperando una selección';
  summaryText.textContent = 'El panel se actualizará en cuanto selecciones un elemento sobre una página compatible.';
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

function renderPreview(selectedCapture: CapturedSelectionRecord | null): void {
  if (selectedCapture === null) {
    previewSection.hidden = true;
    captureImage.removeAttribute('src');
    return;
  }

  previewSection.hidden = false;
  captureImage.src = selectedCapture.imageDataUrl;
  captureHeading.textContent = selectedCapture.selectedElement.pageTitle || 'Página sin título';
  captureTime.textContent = formatTimestamp(selectedCapture.createdAt);
  detailTag.textContent = selectedCapture.selectedElement.tagName;
  detailId.textContent = selectedCapture.selectedElement.id ?? 'Sin ID';
  detailSelector.textContent = selectedCapture.selectedElement.selector;
  detailText.textContent = selectedCapture.selectedElement.text ?? 'Sin texto visible';
  detailPage.textContent = selectedCapture.selectedElement.url;
  detailRect.textContent = formatRect(selectedCapture);
  detailViewport.textContent = formatViewport(selectedCapture);
}

function renderEmptySection(selectedCapture: CapturedSelectionRecord | null): void {
  emptySection.hidden =
    selectedCapture !== null ||
    (currentState.status === 'capturing' && currentState.pendingSelection !== null);
}

function renderHistory(selectedCapture: CapturedSelectionRecord | null): void {
  historyCount.textContent = `${currentState.captures.length} captura${currentState.captures.length === 1 ? '' : 's'}`;
  historyList.replaceChildren();

  if (currentState.captures.length === 0) {
    const placeholder = document.createElement('p');
    placeholder.className = 'history-placeholder';
    placeholder.textContent = 'Aún no hay elementos capturados en esta sesión.';
    historyList.appendChild(placeholder);
    return;
  }

  const fragment = document.createDocumentFragment();

  for (const capture of currentState.captures) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = capture.id === selectedCapture?.id ? 'history-item is-active' : 'history-item';
    button.addEventListener('click', () => {
      selectedCaptureId = capture.id;
      render();
    });

    const thumbnail = document.createElement('img');
    thumbnail.className = 'history-thumb';
    thumbnail.src = capture.imageDataUrl;
    thumbnail.alt = `Miniatura de la captura ${capture.selectedElement.selector}`;

    const content = document.createElement('div');
    content.className = 'history-copy';

    const title = document.createElement('strong');
    title.textContent = capture.selectedElement.selector;

    const subtitle = document.createElement('span');
    subtitle.textContent = `${capture.selectedElement.tagName} · ${formatTimestamp(capture.createdAt)}`;

    const text = document.createElement('span');
    text.textContent = capture.selectedElement.text ?? capture.selectedElement.pageTitle;

    content.append(title, subtitle, text);
    button.append(thumbnail, content);
    fragment.appendChild(button);
  }

  historyList.appendChild(fragment);
}

function getStatusPresentation(state: CapturePanelState): { text: string; modifierClass: string } {
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

function formatTimestamp(isoDate: string): string {
  return new Date(isoDate).toLocaleString('es-EC', {
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

function formatRect(capture: CapturedSelectionRecord): string {
  const { x, y, width, height } = capture.selectedElement.rect;
  return `x:${Math.round(x)} y:${Math.round(y)} · ${Math.round(width)}×${Math.round(height)} px`;
}

function formatViewport(capture: CapturedSelectionRecord): string {
  const { width, height, devicePixelRatio } = capture.selectedElement.viewport;
  return `${width}×${height} · DPR ${devicePixelRatio}`;
}

function queryElement<TElement extends HTMLElement>(id: string): TElement {
  const element = document.getElementById(id);
  if (element === null) {
    throw new Error(`No se encontró el elemento requerido: ${id}`);
  }

  return element as TElement;
}
