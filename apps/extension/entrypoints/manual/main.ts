import { createEmptyManualDraft, type ManualDraft, type ManualStep } from '../../lib/manual-builder';
import { loadManualDraft } from '../../lib/manual-step-state';
import type { ManualPdfProgress } from '../../lib/pdf/manual-pdf.types';
import './style.css';

const shouldAutoPrint = new URLSearchParams(window.location.search).get('print') === '1';
const shouldAutoExportPdf = new URLSearchParams(window.location.search).get('exportPdf') === '1';

let currentDraft: ManualDraft = createEmptyManualDraft();
let hasAutoPrinted = false;
let hasAutoExportedPdf = false;
let pdfExportInProgress = false;

const refreshButton = queryElement<HTMLButtonElement>('refresh-button');
const pdfButton = queryElement<HTMLButtonElement>('pdf-button');
const printButton = queryElement<HTMLButtonElement>('print-button');
const pdfStatus = queryElement<HTMLElement>('pdf-status');
const pdfStatusTitle = queryElement<HTMLElement>('pdf-status-title');
const pdfStatusMessage = queryElement<HTMLElement>('pdf-status-message');
const pdfProgress = queryElement<HTMLProgressElement>('pdf-progress');
const emptyState = queryElement<HTMLElement>('empty-state');
const manualDocument = queryElement<HTMLElement>('manual-document');
const documentTitle = queryElement<HTMLHeadingElement>('document-title');
const documentDescription = queryElement<HTMLParagraphElement>('document-description');
const documentAuthor = queryElement<HTMLElement>('document-author');
const documentCreatedAt = queryElement<HTMLElement>('document-created-at');
const documentUpdatedAt = queryElement<HTMLElement>('document-updated-at');
const documentStepCount = queryElement<HTMLElement>('document-step-count');
const stepsContainer = queryElement<HTMLElement>('steps-container');

void initializePage();

async function initializePage(): Promise<void> {
  refreshButton.addEventListener('click', () => {
    void refreshView();
  });

  pdfButton.addEventListener('click', () => {
    void handlePdfExport();
  });

  printButton.addEventListener('click', () => {
    window.print();
  });

  browser.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') {
      return;
    }

    if (!Object.prototype.hasOwnProperty.call(changes, 'manualBuilderDraft')) {
      return;
    }

    void refreshView();
  });

  await refreshView();
}

async function refreshView(): Promise<void> {
  currentDraft = await loadManualDraft();
  render();
  void maybeAutoPrint();
  void maybeAutoExportPdf();
}

function render(): void {
  const hasSteps = currentDraft.steps.length > 0;
  emptyState.hidden = hasSteps;
  manualDocument.hidden = !hasSteps;
  printButton.disabled = !hasSteps;
  pdfButton.disabled = !hasSteps || pdfExportInProgress;

  if (!hasSteps) {
    document.title = 'Manual Builder | Sin pasos';
    stepsContainer.replaceChildren();
    return;
  }

  documentTitle.textContent = currentDraft.title;
  documentDescription.textContent = currentDraft.description || 'Sin descripcion adicional.';
  documentDescription.hidden = false;
  documentAuthor.textContent = currentDraft.author || 'Sin autor definido';
  documentCreatedAt.textContent = formatTimestamp(currentDraft.createdAt);
  documentUpdatedAt.textContent = currentDraft.lastUpdatedAt
    ? formatTimestamp(currentDraft.lastUpdatedAt)
    : 'Sin cambios posteriores';
  documentStepCount.textContent = `${currentDraft.steps.length}`;
  document.title = `Manual Builder | ${currentDraft.title}`;

  renderSteps(currentDraft.steps);
}

async function handlePdfExport(): Promise<void> {
  if (pdfExportInProgress) {
    return;
  }
  if (currentDraft.steps.length === 0) {
    showPdfError('No existen pasos para exportar.');
    return;
  }

  pdfExportInProgress = true;
  pdfButton.disabled = true;
  refreshButton.disabled = true;
  pdfStatus.hidden = false;
  pdfStatus.dataset.state = 'working';
  updatePdfProgress({
    current: 0,
    total: currentDraft.steps.length,
    percentage: 0,
    stage: 'preparing',
    message: 'Preparando el manual...',
  });

  try {
    const { exportManualPdf } = await import('../../lib/pdf/manual-pdf.download');
    await exportManualPdf(currentDraft, {
      includeCover: true,
      drawSelectionHighlight: 'auto',
      imageQuality: 0.94,
      maxImageDimension: 2560,
      fileName: currentDraft.title,
      fontUrls: {
        regular: getRuntimeUrl('/fonts/NotoSans-Regular.ttf'),
        bold: getRuntimeUrl('/fonts/NotoSans-Bold.ttf'),
      },
      onProgress: updatePdfProgress,
    });
  } catch (error) {
    showPdfError(getErrorMessage(error));
  } finally {
    pdfExportInProgress = false;
    pdfButton.disabled = currentDraft.steps.length === 0;
    refreshButton.disabled = false;
  }
}

async function maybeAutoExportPdf(): Promise<void> {
  if (!shouldAutoExportPdf || hasAutoExportedPdf || currentDraft.steps.length === 0) {
    return;
  }

  hasAutoExportedPdf = true;
  await handlePdfExport();
}

function updatePdfProgress(progress: ManualPdfProgress): void {
  pdfStatus.hidden = false;
  pdfStatus.dataset.state = progress.stage === 'completed' ? 'completed' : 'working';
  pdfStatusTitle.textContent = progress.stage === 'completed'
    ? 'PDF generado'
    : progress.stage === 'step'
      ? `Paso ${progress.current} de ${progress.total}`
      : 'Generando PDF';
  pdfStatusMessage.textContent = progress.message;
  pdfProgress.value = progress.percentage;
}

function showPdfError(message: string): void {
  pdfStatus.hidden = false;
  pdfStatus.dataset.state = 'error';
  pdfStatusTitle.textContent = 'No se pudo exportar el PDF';
  pdfStatusMessage.textContent = message;
  pdfProgress.removeAttribute('value');
}

function renderSteps(steps: ManualStep[]): void {
  stepsContainer.replaceChildren();

  const fragment = document.createDocumentFragment();

  for (const step of steps) {
    const article = document.createElement('article');
    article.className = 'step-sheet';

    const header = document.createElement('header');
    header.className = 'step-header';

    const orderBadge = document.createElement('span');
    orderBadge.className = 'step-badge';
    orderBadge.textContent = `Paso ${step.order}`;

    const headingGroup = document.createElement('div');

    const title = document.createElement('h2');
    title.textContent = step.title;

    const subtitle = document.createElement('p');
    subtitle.className = 'step-subtitle';
    subtitle.textContent = `${step.pageTitle || 'Pagina sin titulo'} | ${step.url}`;

    headingGroup.append(orderBadge, title, subtitle);
    header.appendChild(headingGroup);

    const body = document.createElement('div');
    body.className = 'step-body';

    const image = document.createElement('img');
    image.className = 'step-image';
    image.src = step.imageOriginalDataUrl;
    image.alt = `Imagen del ${step.title}`;

    const content = document.createElement('div');
    content.className = 'step-content';

    const description = document.createElement('p');
    description.className = 'step-description';
    description.textContent = step.description || 'Sin descripcion. Agrega una instruccion breve en el editor.';

    const expectedResult = document.createElement('div');
    expectedResult.className = 'step-expected-result';
    const expectedResultLabel = document.createElement('strong');
    expectedResultLabel.textContent = 'Resultado esperado';
    const expectedResultText = document.createElement('p');
    expectedResultText.textContent = step.guide?.expectedResult || 'Verifica que la accion se complete correctamente.';
    expectedResult.append(expectedResultLabel, expectedResultText);

    const metaGrid = document.createElement('dl');
    metaGrid.className = 'step-meta-grid';

    metaGrid.append(
      createMetaRow('Selector', step.selector),
      createMetaRow('Elemento', step.selectedElement.tagName),
      createMetaRow('Texto', step.selectedElement.text ?? 'Sin texto visible'),
      createMetaRow('Capturado', formatTimestamp(step.createdAt)),
    );

    content.append(description, expectedResult, metaGrid);
    body.append(image, content);
    article.append(header, body);
    fragment.appendChild(article);
  }

  stepsContainer.appendChild(fragment);
}

async function maybeAutoPrint(): Promise<void> {
  if (!shouldAutoPrint || hasAutoPrinted || currentDraft.steps.length === 0) {
    return;
  }

  hasAutoPrinted = true;
  await waitForImagesReady();
  window.setTimeout(() => {
    window.print();
  }, 450);
}

async function waitForImagesReady(): Promise<void> {
  const images = Array.from(stepsContainer.querySelectorAll('img'));
  await Promise.all(images.map(async (image) => {
    if (image.complete && image.naturalWidth > 0) {
      return;
    }

    if (typeof image.decode === 'function') {
      try {
        await image.decode();
        return;
      } catch {
        return waitForImageLoad(image);
      }
    }

    await waitForImageLoad(image);
  }));
}

function waitForImageLoad(image: HTMLImageElement): Promise<void> {
  return new Promise((resolve) => {
    const handleDone = (): void => {
      image.removeEventListener('load', handleDone);
      image.removeEventListener('error', handleDone);
      resolve();
    };

    image.addEventListener('load', handleDone, { once: true });
    image.addEventListener('error', handleDone, { once: true });
  });
}

function createMetaRow(label: string, value: string): DocumentFragment {
  const fragment = document.createDocumentFragment();
  const dt = document.createElement('dt');
  dt.textContent = label;
  const dd = document.createElement('dd');
  dd.textContent = value;
  fragment.append(dt, dd);
  return fragment;
}

function formatTimestamp(isoDate: string): string {
  return new Date(isoDate).toLocaleString('es-EC', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Ocurrió un error inesperado durante la exportación.';
}

function getRuntimeUrl(path: string): string {
  return (browser.runtime.getURL as (resourcePath: string) => string)(path);
}

function queryElement<TElement extends HTMLElement>(id: string): TElement {
  const element = document.getElementById(id);
  if (element === null) {
    throw new Error(`No se encontro el elemento requerido: ${id}`);
  }

  return element as TElement;
}
