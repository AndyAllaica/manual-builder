import type { ManualStepGuide, SelectionRect, ViewportData } from '../manual-builder';
import { normalizeWhitespace, truncateText } from './manual-pdf.text';
import type {
  CompatibleManualStep,
  CompatibleSelectedElement,
  ManualExport,
  ResolvedManual,
  ResolvedManualStep,
  ResolvedStepContent,
} from './manual-pdf.types';

const LOW_QUALITY_PHRASES = new Set([
  'aaaa',
  'algo de por ahi',
  'no se',
  'nose',
  'prueba',
  'test',
  'testing',
  'xd',
]);

export function resolveManualExport(manual: ManualExport): ResolvedManual {
  const indexedSteps = manual.steps.map((step, index) => ({ step, index }));
  indexedSteps.sort((left, right) => {
    const leftOrder = sortableNumber(left.step.order);
    const rightOrder = sortableNumber(right.step.order);
    if (leftOrder !== rightOrder) {
      return leftOrder < rightOrder ? -1 : 1;
    }

    const leftDate = sortableDate(left.step.createdAt);
    const rightDate = sortableDate(right.step.createdAt);
    if (leftDate !== rightDate) {
      return leftDate < rightDate ? -1 : 1;
    }

    return left.index - right.index;
  });

  return {
    title: usableOrFallback(manual.title, 'Manual de usuario'),
    description: normalizeWhitespace(manual.description),
    author: normalizeWhitespace(manual.author),
    createdAt: normalizeWhitespace(manual.createdAt) || new Date().toISOString(),
    steps: indexedSteps.map(({ step }, index) => resolveStep(step, index)),
  };
}

export function resolveStepContent(step: ResolvedManualStep): ResolvedStepContent {
  const guide = normalizeGuide(step.guide);
  const element = step.selectedElement;
  const label = resolveElementLabel(element, step);
  const title = firstUsableText(
    guide?.title,
    step.title,
    label,
    step.pageTitle,
    `Paso ${step.order}`,
  );
  const summary = firstUsableText(
    guide?.summary,
    isUsableInstructionText(step.description) ? step.description : undefined,
    element.text,
    element.ariaLabel,
    element.elementTitle,
    element.title,
    step.pageTitle,
    resolveDomain(step.url),
    'Complete la acción indicada en el elemento resaltado.',
  );
  const actions = guide?.actions.length
    ? guide.actions
    : isUsableInstructionText(step.description)
      ? [step.description]
      : inferActions(element, label);

  return {
    title: truncateText(title, 150),
    summary: truncateText(summary, 420),
    actions,
    expectedResult: firstUsableText(
      guide?.expectedResult,
      inferExpectedResult(element),
      'Verifique que la acción se haya completado correctamente.',
    ),
    detailCaption: firstUsableText(
      guide?.detailCaption,
      label ? `Detalle de ${label}` : undefined,
      'Detalle del elemento seleccionado',
    ),
    resource: resolveResource(step.pageTitle, step.url),
  };
}

export function isUsableInstructionText(value: unknown): value is string {
  const text = normalizeWhitespace(value);
  if (text.length < 4 || !/[\p{L}\p{N}]/u.test(text)) {
    return false;
  }

  const normalized = text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (LOW_QUALITY_PHRASES.has(normalized) || /^(.)\1{3,}$/.test(normalized)) {
    return false;
  }

  return normalized.replace(/\s/g, '').length >= 4;
}

export function inferActions(element: CompatibleSelectedElement, label: string): string[] {
  const tagName = normalizeWhitespace(element.tagName).toLowerCase();
  const inputType = normalizeWhitespace(element.inputType).toLowerCase();
  const quotedLabel = label.length > 0 ? ` «${truncateText(label, 72)}»` : '';

  if (inputType === 'checkbox') {
    return ['Active o desactive la opción resaltada según corresponda.'];
  }
  if (inputType === 'radio') {
    return ['Seleccione la alternativa requerida.'];
  }
  if (tagName === 'input' || tagName === 'textarea') {
    return [
      'Seleccione el campo resaltado.',
      'Ingrese la información solicitada.',
      'Verifique que el valor se haya registrado correctamente.',
    ];
  }
  if (tagName === 'button') {
    return [`Haga clic en el botón${quotedLabel}.`, 'Espere a que el sistema procese la acción.'];
  }
  if (tagName === 'a') {
    return [`Haga clic en el enlace${quotedLabel}.`, 'Verifique que se abra la página correspondiente.'];
  }
  if (tagName === 'select') {
    return [
      'Abra la lista resaltada.',
      'Seleccione la opción requerida.',
      'Confirme que la opción quede visible.',
    ];
  }

  return ['Revise la información resaltada.', 'Compruebe que los datos mostrados sean correctos.'];
}

export function resolveResource(pageTitle: string, url: string): string {
  const title = normalizeWhitespace(pageTitle);
  const domain = resolveDomain(url);
  if (title.length > 0 && domain.length > 0) {
    return `${truncateText(title, 72)} | ${domain}`;
  }
  return title || domain || 'Recurso no identificado';
}

function resolveStep(step: CompatibleManualStep, index: number): ResolvedManualStep {
  const selectedElement: CompatibleSelectedElement = {
    ...(step.selectedElement ?? {}),
    ...(step.selectedElement?.rect === undefined && step.rect !== undefined ? { rect: step.rect } : {}),
    ...(step.selectedElement?.viewport === undefined && step.viewport !== undefined ? { viewport: step.viewport } : {}),
  };
  const fallbackOrder = index + 1;

  return {
    id: normalizeWhitespace(step.id) || `step-${fallbackOrder}`,
    order: Number.isFinite(step.order) && (step.order ?? 0) > 0 ? Math.trunc(step.order ?? fallbackOrder) : fallbackOrder,
    title: normalizeWhitespace(step.title),
    description: normalizeWhitespace(step.description),
    createdAt: normalizeWhitespace(step.createdAt),
    updatedAt: normalizeWhitespace(step.updatedAt),
    url: normalizeWhitespace(step.url) || normalizeWhitespace(selectedElement.url),
    pageTitle: normalizeWhitespace(step.pageTitle) || normalizeWhitespace(selectedElement.pageTitle),
    selector: normalizeWhitespace(step.selector) || normalizeWhitespace(selectedElement.selector),
    imageOriginalDataUrl: firstDataUrl(step.imageOriginalDataUrl, step.imageDataUrl, step.screenshotDataUrl),
    imageContextDataUrl: firstDataUrl(step.imageContextDataUrl, step.contextImageDataUrl),
    imageAssetId: optionalString(step.imageAssetId),
    contextImageAssetId: optionalString(step.contextImageAssetId),
    contextRegion: validRect(step.contextRegion) ? step.contextRegion : undefined,
    selectedElement,
    annotationBaked: typeof step.annotationBaked === 'boolean' ? step.annotationBaked : undefined,
    guide: step.guide,
  };
}

function normalizeGuide(guide: ManualStepGuide | undefined): Required<ManualStepGuide> | undefined {
  if (guide === undefined) {
    return undefined;
  }

  const actions = Array.isArray(guide.actions)
    ? guide.actions.filter(isUsableInstructionText).map((action) => truncateText(action, 220))
    : [];
  const normalized = {
    title: isUsableInstructionText(guide.title) ? normalizeWhitespace(guide.title) : '',
    summary: isUsableInstructionText(guide.summary) ? normalizeWhitespace(guide.summary) : '',
    actions,
    expectedResult: isUsableInstructionText(guide.expectedResult) ? normalizeWhitespace(guide.expectedResult) : '',
    detailCaption: isUsableInstructionText(guide.detailCaption) ? normalizeWhitespace(guide.detailCaption) : '',
  };

  return Object.values(normalized).some((value) => Array.isArray(value) ? value.length > 0 : value.length > 0)
    ? normalized
    : undefined;
}

function resolveElementLabel(element: CompatibleSelectedElement, step: ResolvedManualStep): string {
  return firstUsableText(
    element.text,
    element.ariaLabel,
    element.elementTitle,
    element.title,
    element.id,
    step.selector,
    '',
  );
}

function inferExpectedResult(element: CompatibleSelectedElement): string {
  const tagName = normalizeWhitespace(element.tagName).toLowerCase();
  if (tagName === 'a') {
    return 'La página o recurso correspondiente debe abrirse correctamente.';
  }
  if (tagName === 'button') {
    return 'El sistema debe procesar la acción solicitada.';
  }
  if (tagName === 'input' || tagName === 'textarea' || tagName === 'select') {
    return 'El valor seleccionado o ingresado debe quedar visible en el campo.';
  }
  return 'La información indicada debe mostrarse de forma correcta.';
}

function firstUsableText(...values: unknown[]): string {
  for (const value of values) {
    if (isUsableInstructionText(value)) {
      return normalizeWhitespace(value);
    }
  }
  return '';
}

function usableOrFallback(value: unknown, fallback: string): string {
  const normalized = normalizeWhitespace(value);
  return normalized.length > 0 ? normalized : fallback;
}

function firstDataUrl(...values: unknown[]): string | undefined {
  return values.map(optionalString).find((value) => value?.startsWith('data:image/'));
}

function optionalString(value: unknown): string | undefined {
  const normalized = normalizeWhitespace(value);
  return normalized.length > 0 ? normalized : undefined;
}

function validRect(value: SelectionRect | undefined): value is SelectionRect {
  return value !== undefined
    && [value.x, value.y, value.width, value.height].every(Number.isFinite)
    && value.width > 0
    && value.height > 0;
}

function sortableNumber(value: number | undefined): number {
  return Number.isFinite(value) ? (value ?? Number.POSITIVE_INFINITY) : Number.POSITIVE_INFINITY;
}

function sortableDate(value: string | undefined): number {
  const timestamp = Date.parse(value ?? '');
  return Number.isFinite(timestamp) ? timestamp : Number.POSITIVE_INFINITY;
}

function resolveDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return truncateText(url, 90);
  }
}
