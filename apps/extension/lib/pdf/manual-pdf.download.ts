import { loadPortraitPdfBranding } from './manual-pdf.branding.config';
import { generateManualPdf } from './manual-pdf.generator';
import { sanitizePdfFileName } from './manual-pdf.text';
import type { ManualExport, ManualPdfOptions } from './manual-pdf.types';

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
  await exportManualPdf(manual, {
    includeCover: true,
    drawSelectionHighlight: 'never',
    imageQuality: 0.94,
    maxImageDimension: 2560,
    ...options,
    ...portraitBranding,
  });
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
