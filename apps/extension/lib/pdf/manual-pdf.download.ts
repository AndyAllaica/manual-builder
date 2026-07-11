import { generateManualPdf } from './manual-pdf.generator';
import { sanitizePdfFileName } from './manual-pdf.text';
import type { ManualExport, ManualPdfOptions } from './manual-pdf.types';

export { sanitizePdfFileName } from './manual-pdf.text';

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
