import type { ManualPdfBrandingLayout, ManualPdfOptions } from './manual-pdf.types';

interface PortraitPdfBrandingConfig {
  headerSource: string | null;
  footerSource: string | null;
  layout: ManualPdfBrandingLayout;
}

type LoadedPortraitPdfBranding = Pick<
  ManualPdfOptions,
  'headerImageDataUrl' | 'footerImageDataUrl' | 'portraitBrandingLayout'
>;

/**
 * Configuracion visual exclusiva del PDF vertical.
 * Las fuentes pueden ser rutas dentro de public/ o Data URLs base64.
 */
export const PORTRAIT_PDF_BRANDING_CONFIG: PortraitPdfBrandingConfig = {
  headerSource: '/pdf-branding/header.png',
  footerSource: '/pdf-branding/footer.png',
  layout: {
    headerWidth: 475,
    headerHeight: 125,
    footerWidth: 270,
    footerHeight: 33,
    footerOffsetY: 20,
    contentGap: 12,
  },
};

export async function loadPortraitPdfBranding(): Promise<LoadedPortraitPdfBranding> {
  const [headerImageDataUrl, footerImageDataUrl] = await Promise.all([
    loadImageDataUrl(PORTRAIT_PDF_BRANDING_CONFIG.headerSource),
    loadImageDataUrl(PORTRAIT_PDF_BRANDING_CONFIG.footerSource),
  ]);

  return {
    headerImageDataUrl,
    footerImageDataUrl,
    portraitBrandingLayout: PORTRAIT_PDF_BRANDING_CONFIG.layout,
  };
}

async function loadImageDataUrl(source: string | null): Promise<string | null> {
  if (source === null || source.trim().length === 0) {
    return null;
  }
  if (/^data:image\/(?:jpeg|jpg|png|webp);base64,/i.test(source)) {
    return source;
  }

  try {
    const url = isAbsoluteUrl(source)
      ? source
      : (browser.runtime.getURL as (resourcePath: string) => string)(source.replace(/^\/+/, ''));
    const response = await fetch(url);
    if (!response.ok) {
      return null;
    }
    const blob = await response.blob();
    if (!blob.type.startsWith('image/')) {
      return null;
    }
    return await blobToDataUrl(blob);
  } catch {
    return null;
  }
}

function isAbsoluteUrl(value: string): boolean {
  return /^(?:https?:|blob:|chrome-extension:|moz-extension:)/i.test(value);
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
        return;
      }
      reject(new Error('No se pudo leer la imagen de identidad visual.'));
    };
    reader.onerror = () => reject(new Error('No se pudo leer la imagen de identidad visual.'));
    reader.readAsDataURL(blob);
  });
}
