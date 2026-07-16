import type { ManualPdfOrientation } from './pdf/manual-pdf.types';

export const PDF_BRANDING_STORAGE_KEY = 'manualBuilderPdfBranding';

export interface PdfBrandingSettings {
  orientation: ManualPdfOrientation;
}

type PdfBrandingStorageShape = {
  [PDF_BRANDING_STORAGE_KEY]?: Partial<PdfBrandingSettings>;
};

export function createEmptyPdfBrandingSettings(): PdfBrandingSettings {
  return {
    orientation: 'landscape',
  };
}

export async function loadPdfBrandingSettings(): Promise<PdfBrandingSettings> {
  const result = await browser.storage.local.get<PdfBrandingStorageShape>(PDF_BRANDING_STORAGE_KEY);
  return normalizePdfBrandingSettings(result[PDF_BRANDING_STORAGE_KEY]);
}

export async function savePdfBrandingSettings(settings: PdfBrandingSettings): Promise<void> {
  await browser.storage.local.set<PdfBrandingStorageShape>({
    [PDF_BRANDING_STORAGE_KEY]: normalizePdfBrandingSettings(settings),
  });
}

function normalizePdfBrandingSettings(
  value: Partial<PdfBrandingSettings> | null | undefined,
): PdfBrandingSettings {
  return {
    orientation: value?.orientation === 'portrait' ? 'portrait' : 'landscape',
  };
}
