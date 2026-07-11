import { rgb, type RGB } from 'pdf-lib';
import type { ManualPdfTheme } from './manual-pdf.types';

export const DEFAULT_MANUAL_PDF_THEME: ManualPdfTheme = {
  primaryRed: '#B4232C',
  deepRed: '#650F1A',
  gold: '#C9A227',
  green: '#16845B',
  warmWhite: '#F8F4ED',
  white: '#FFFFFF',
  darkText: '#231F20',
  mutedText: '#666064',
  softBorder: '#DED7CE',
  pageWidth: 841.89,
  pageHeight: 595.28,
  margin: 30,
  fontSizeBody: 10,
  fontSizeSmall: 8,
  fontSizeTitle: 21,
};

export function resolveManualPdfTheme(overrides?: Partial<ManualPdfTheme>): ManualPdfTheme {
  return { ...DEFAULT_MANUAL_PDF_THEME, ...overrides };
}

export function hexToRgb(value: string): RGB {
  const normalized = value.replace(/^#/, '');
  const expanded = normalized.length === 3
    ? normalized.split('').map((character) => character.repeat(2)).join('')
    : normalized;
  const parsed = Number.parseInt(expanded, 16);

  if (!Number.isFinite(parsed) || expanded.length !== 6) {
    return rgb(0, 0, 0);
  }

  return rgb(
    ((parsed >> 16) & 255) / 255,
    ((parsed >> 8) & 255) / 255,
    (parsed & 255) / 255,
  );
}
