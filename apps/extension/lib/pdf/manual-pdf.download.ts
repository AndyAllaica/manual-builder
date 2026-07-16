import { inferLegacySelectionGeometry } from '../legacy-selection-geometry';
import { loadPortraitPdfBranding } from './manual-pdf.branding.config';
import { generateManualPdf } from './manual-pdf.generator';
import { sanitizePdfFileName } from './manual-pdf.text';
import type { CompatibleManualStep, ManualExport, ManualPdfOptions } from './manual-pdf.types';

export { sanitizePdfFileName } from './manual-pdf.text';

export type ConfiguredManualPdfExportOptions = Pick<
  ManualPdfOptions,
  'fileName' | 'fontUrls' | 'onProgress' | 'orientation'
>;

export async function exportConfiguredManualPdf(
  manual: ManualExport,
  options: ConfiguredManualPdfExportOptions = {},
): Promise<void> {
  const portraitBranding = options.orientation === 'portrait'
    ? await loadPortraitPdfBranding()
    : {};
  await exportManualPdf(await repairLegacySelectionGeometry(manual), {
    includeCover: true,
    drawSelectionHighlight: 'auto',
    imageQuality: 0.94,
    maxImageDimension: 2560,
    ...options,
    ...portraitBranding,
  });
}

async function repairLegacySelectionGeometry(manual: ManualExport): Promise<ManualExport> {
  const steps: CompatibleManualStep[] = [];

  for (const step of manual.steps) {
    if (step.captureTarget === 'viewport' || hasUsableSelectionGeometry(step)) {
      steps.push(step);
      continue;
    }

    const originalDataUrl = firstImageDataUrl(
      step.imageOriginalDataUrl,
      step.imageDataUrl,
      step.screenshotDataUrl,
    );
    const contextDataUrl = firstImageDataUrl(
      step.imageContextDataUrl,
      step.contextImageDataUrl,
    );
    if (originalDataUrl === undefined || contextDataUrl === undefined) {
      steps.push(step);
      continue;
    }

    const geometry = await inferLegacySelectionGeometry(originalDataUrl, contextDataUrl).catch(() => null);
    if (geometry === null) {
      steps.push(step);
      continue;
    }

    steps.push({
      ...step,
      captureTarget: 'element',
      annotationBaked: false,
      selectedElement: {
        ...(step.selectedElement ?? {}),
        rect: geometry.rect,
        viewport: geometry.viewport,
      },
    });
  }

  return { ...manual, steps };
}

function hasUsableSelectionGeometry(step: CompatibleManualStep): boolean {
  const rect = step.selectedElement?.rect ?? step.rect;
  const viewport = step.selectedElement?.viewport ?? step.viewport;
  return rect !== undefined
    && viewport !== undefined
    && [rect.x, rect.y, rect.width, rect.height, viewport.width, viewport.height].every(Number.isFinite)
    && rect.width > 0
    && rect.height > 0
    && viewport.width > 1
    && viewport.height > 1;
}

function firstImageDataUrl(...values: Array<string | undefined>): string | undefined {
  return values.find((value) => value?.startsWith('data:image/') === true);
}

export async function exportManualPdf(manual: ManualExport, options: ManualPdfOptions = {}): Promise<void> {
  const bytes = await generateManualPdf(manual, options);
  const blob = new Blob([new Uint8Array(bytes)], { type: 'application/pdf' });
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');

  try {
    anchor.href = objectUrl;
    anchor.download = sanitizePdfFileName(options.fileName ?? manual.title ?? 'manual-de-usuario');
    anchor.rel = 'noopener';
    document.body.appendChild(anchor);
    anchor.click();
  } finally {
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1_000);
  }
}
