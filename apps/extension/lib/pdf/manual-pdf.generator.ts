import fontkit from '@pdf-lib/fontkit';
import {
  PDFDocument,
  StandardFonts,
  type PDFFont,
  type PDFImage,
  type PDFPage,
} from 'pdf-lib';
import { resolveManualExport, resolveStepContent } from './manual-pdf.content';
import {
  calculateContain,
  embedProcessedImage,
  prepareStepImages,
  rectToPdfCoordinates,
  type PreparedStepImages,
} from './manual-pdf.images';
import { fitTextInBox, sanitizeForStandardPdfFont } from './manual-pdf.text';
import { hexToRgb, resolveManualPdfTheme } from './manual-pdf.theme';
import type {
  ImagePlacement,
  ManualExport,
  ManualPdfOptions,
  ManualPdfProgress,
  ManualPdfTheme,
  ProcessedImage,
  ResolvedManual,
  ResolvedManualStep,
  ResolvedStepContent,
} from './manual-pdf.types';

interface PdfFonts {
  regular: PDFFont;
  bold: PDFFont;
  regularIsCustom: boolean;
  boldIsCustom: boolean;
}

interface TextBoxOptions {
  x: number;
  top: number;
  width: number;
  height: number;
  preferredSize: number;
  minimumSize: number;
  color: string;
  bold?: boolean;
  maxLines?: number;
  lineHeightRatio?: number;
}

const DEFAULT_IMAGE_QUALITY = 0.94;
const DEFAULT_MAX_IMAGE_DIMENSION = 2560;

export async function generateManualPdf(
  manualInput: ManualExport,
  options: ManualPdfOptions = {},
): Promise<Uint8Array> {
  const manual = resolveManualExport(manualInput);
  if (manual.steps.length === 0) {
    throw new Error('No existen pasos para exportar.');
  }

  const theme = resolveManualPdfTheme(options.theme);
  const total = manual.steps.length;
  reportProgress(options, { current: 0, total, percentage: 0, stage: 'preparing', message: 'Preparando el manual...' });

  const document = await PDFDocument.create();
  document.setTitle(manual.title);
  document.setAuthor(manual.author || 'Manual Builder');
  document.setSubject('Manual de usuario');
  document.setCreator('Manual Builder');
  document.setProducer('Manual Builder con pdf-lib');
  document.setCreationDate(new Date());

  reportProgress(options, { current: 0, total, percentage: 2, stage: 'loading-fonts', message: 'Cargando fuentes...' });
  const fonts = await loadFonts(document, options.fontUrls);
  const imageOptions = {
    imageQuality: clamp(options.imageQuality ?? DEFAULT_IMAGE_QUALITY, 0.4, 1),
    maxImageDimension: Math.max(320, Math.round(options.maxImageDimension ?? DEFAULT_MAX_IMAGE_DIMENSION)),
  };

  if (options.includeCover !== false) {
    reportProgress(options, { current: 0, total, percentage: 5, stage: 'cover', message: 'Diseñando la portada...' });
    let coverImage: ProcessedImage | undefined;
    try {
      const prepared = await prepareStepImages(manual.steps[0]!, imageOptions, options.assetResolver);
      coverImage = prepared.general ?? prepared.detail;
    } catch {
      coverImage = undefined;
    }
    await drawCover(document, manual, coverImage, fonts, theme);
  }

  for (let index = 0; index < manual.steps.length; index += 1) {
    const step = manual.steps[index]!;
    const current = index + 1;
    reportProgress(options, {
      current,
      total,
      percentage: Math.round(8 + (current / total) * 84),
      stage: 'step',
      message: `Procesando paso ${current} de ${total}...`,
    });

    let images: PreparedStepImages = { general: undefined, detail: undefined };
    try {
      images = await prepareStepImages(step, imageOptions, options.assetResolver);
    } catch {
      images = { general: undefined, detail: undefined };
    }
    await drawStepPage(document, manual, step, resolveStepContent(step), images, current, total, fonts, theme, options);
    await yieldToUi();
  }

  reportProgress(options, { current: total, total, percentage: 95, stage: 'saving', message: 'Finalizando el archivo PDF...' });
  const bytes = await document.save({ useObjectStreams: true });
  reportProgress(options, { current: total, total, percentage: 100, stage: 'completed', message: 'PDF generado correctamente.' });
  return bytes;
}

async function loadFonts(
  document: PDFDocument,
  urls: ManualPdfOptions['fontUrls'],
): Promise<PdfFonts> {
  const standardRegular = await document.embedFont(StandardFonts.Helvetica);
  const standardBold = await document.embedFont(StandardFonts.HelveticaBold);
  if (urls?.regular === undefined && urls?.bold === undefined) {
    return { regular: standardRegular, bold: standardBold, regularIsCustom: false, boldIsCustom: false };
  }

  document.registerFontkit(fontkit);
  const regular = await tryEmbedCustomFont(document, urls.regular);
  const bold = await tryEmbedCustomFont(document, urls.bold);
  return {
    regular: regular ?? standardRegular,
    bold: bold ?? regular ?? standardBold,
    regularIsCustom: regular !== undefined,
    boldIsCustom: bold !== undefined || regular !== undefined,
  };
}

async function tryEmbedCustomFont(document: PDFDocument, url: string | undefined): Promise<PDFFont | undefined> {
  if (url === undefined) {
    return undefined;
  }
  try {
    const response = await fetch(url);
    if (!response.ok) {
      return undefined;
    }
    return await document.embedFont(await response.arrayBuffer(), { subset: true });
  } catch {
    return undefined;
  }
}

async function drawCover(
  document: PDFDocument,
  manual: ResolvedManual,
  coverImage: ProcessedImage | undefined,
  fonts: PdfFonts,
  theme: ManualPdfTheme,
): Promise<void> {
  const page = document.addPage([theme.pageWidth, theme.pageHeight]);
  page.drawRectangle({ x: 0, y: 0, width: theme.pageWidth, height: theme.pageHeight, color: hexToRgb(theme.warmWhite) });
  page.drawRectangle({ x: 0, y: 0, width: 266, height: theme.pageHeight, color: hexToRgb(theme.primaryRed) });
  page.drawRectangle({ x: 0, y: 0, width: 266, height: 105, color: hexToRgb(theme.deepRed) });
  page.drawRectangle({ x: 42, y: theme.pageHeight - 68, width: 48, height: 4, color: hexToRgb(theme.gold) });

  drawLabel(page, 'MANUAL DE USUARIO', 42, theme.pageHeight - 95, fonts.bold, theme.white, fonts.boldIsCustom, 10);
  drawTextBox(page, manual.title, fonts, theme, {
    x: 42,
    top: theme.pageHeight - 128,
    width: 182,
    height: 178,
    preferredSize: 28,
    minimumSize: 19,
    color: theme.white,
    bold: true,
    maxLines: 6,
    lineHeightRatio: 1.05,
  });
  drawTextBox(page, manual.description || 'Documento generado con Manual Builder.', fonts, theme, {
    x: 42,
    top: 205,
    width: 180,
    height: 72,
    preferredSize: 10,
    minimumSize: 8,
    color: theme.white,
    maxLines: 6,
  });
  drawLabel(page, `${manual.steps.length} PASO${manual.steps.length === 1 ? '' : 'S'}`, 42, 68, fonts.bold, theme.white, fonts.boldIsCustom, 12);

  const imageBox = { x: 310, y: 185, width: 485, height: 320 };
  drawCard(page, imageBox, theme.white, theme.softBorder);
  if (coverImage !== undefined) {
    await drawEmbeddedImage(document, page, coverImage, insetBox(imageBox, 10), theme, false);
  } else {
    drawImagePlaceholder(page, insetBox(imageBox, 10), 'Captura principal no disponible', fonts, theme);
  }

  drawLabel(page, 'DOCUMENTO', 310, 139, fonts.bold, theme.primaryRed, fonts.boldIsCustom, 8);
  drawTextBox(page, manual.author ? `Autor: ${manual.author}` : 'Autor no especificado', fonts, theme, {
    x: 310,
    top: 124,
    width: 250,
    height: 30,
    preferredSize: 10,
    minimumSize: 8,
    color: theme.darkText,
    maxLines: 2,
  });
  drawTextBox(page, `Generado: ${formatDate(new Date())}`, fonts, theme, {
    x: 570,
    top: 124,
    width: 225,
    height: 30,
    preferredSize: 10,
    minimumSize: 8,
    color: theme.mutedText,
    maxLines: 2,
  });
  page.drawCircle({ x: 785, y: 52, size: 6, color: hexToRgb(theme.green) });
  drawLabel(page, 'LISTO PARA CONSULTA', 616, 56, fonts.bold, theme.green, fonts.boldIsCustom, 8);
}

async function drawStepPage(
  document: PDFDocument,
  manual: ResolvedManual,
  step: ResolvedManualStep,
  content: ResolvedStepContent,
  images: PreparedStepImages,
  current: number,
  total: number,
  fonts: PdfFonts,
  theme: ManualPdfTheme,
  options: ManualPdfOptions,
): Promise<void> {
  const page = document.addPage([theme.pageWidth, theme.pageHeight]);
  page.drawRectangle({ x: 0, y: 0, width: theme.pageWidth, height: theme.pageHeight, color: hexToRgb(theme.warmWhite) });
  page.drawRectangle({ x: 0, y: theme.pageHeight - 12, width: theme.pageWidth, height: 12, color: hexToRgb(theme.primaryRed) });

  drawLabel(page, 'MANUAL DE USUARIO', 30, 557, fonts.bold, theme.primaryRed, fonts.boldIsCustom, 8);
  drawLabel(page, `PASO ${current} DE ${total}`, 731, 557, fonts.bold, theme.mutedText, fonts.boldIsCustom, 8);
  drawTextBox(page, String(current).padStart(2, '0'), fonts, theme, {
    x: 30,
    top: 535,
    width: 56,
    height: 58,
    preferredSize: 37,
    minimumSize: 30,
    color: theme.primaryRed,
    bold: true,
    maxLines: 1,
  });
  drawTextBox(page, `Paso ${current}: ${content.title}`, fonts, theme, {
    x: 96,
    top: 535,
    width: 565,
    height: 35,
    preferredSize: theme.fontSizeTitle,
    minimumSize: 15,
    color: theme.darkText,
    bold: true,
    maxLines: 2,
    lineHeightRatio: 1.05,
  });
  drawTextBox(page, content.summary, fonts, theme, {
    x: 97,
    top: 494,
    width: 655,
    height: 27,
    preferredSize: 9,
    minimumSize: 7.5,
    color: theme.mutedText,
    maxLines: 2,
  });

  const generalCard = { x: 30, y: 125, width: 518, height: 330 };
  const actionCard = { x: 564, y: 286, width: 248, height: 169 };
  const detailCard = { x: 564, y: 125, width: 248, height: 145 };
  const hasExpectedResult = content.expectedResult.trim().length > 0;
  const expectedCard = { x: 30, y: 38, width: 518, height: 70 };
  const resourceCard = hasExpectedResult
    ? { x: 564, y: 38, width: 248, height: 70 }
    : { x: 30, y: 38, width: 782, height: 70 };

  drawCard(page, generalCard, theme.white, theme.softBorder);
  let generalPlacement: ImagePlacement | undefined;
  if (images.general !== undefined) {
    generalPlacement = await drawEmbeddedImage(document, page, images.general, insetBox(generalCard, 9), theme, true);
  } else {
    drawImagePlaceholder(page, insetBox(generalCard, 9), 'Captura general no disponible', fonts, theme);
  }

  if (generalPlacement !== undefined && shouldDrawHighlight(step, options.drawSelectionHighlight ?? 'auto')) {
    const highlight = rectToPdfCoordinates(step.selectedElement.rect, step.selectedElement.viewport, generalPlacement);
    if (highlight !== undefined) {
      drawSelectionHighlight(page, highlight, theme);
    }
  }

  drawCard(page, actionCard, theme.white, theme.softBorder);
  drawLabel(page, 'ACCIÓN PRINCIPAL', actionCard.x + 14, actionCard.y + actionCard.height - 18, fonts.bold, theme.primaryRed, fonts.boldIsCustom, 8);
  const visibleActions = content.actions.slice(0, 4);
  const actionText = visibleActions.map((action, index) => `${index + 1}. ${action}`).join('\n')
    + (content.actions.length > visibleActions.length ? '\n...' : '');
  drawTextBox(page, actionText, fonts, theme, {
    x: actionCard.x + 14,
    top: actionCard.y + actionCard.height - 34,
    width: actionCard.width - 28,
    height: actionCard.height - 44,
    preferredSize: 9,
    minimumSize: 7,
    color: theme.darkText,
    maxLines: 11,
    lineHeightRatio: 1.23,
  });

  drawCard(page, detailCard, theme.white, theme.softBorder);
  if (images.detail !== undefined) {
    await drawEmbeddedImage(document, page, images.detail, {
      x: detailCard.x + 8,
      y: detailCard.y + 24,
      width: detailCard.width - 16,
      height: detailCard.height - 32,
    }, theme, true);
  } else {
    drawImagePlaceholder(page, {
      x: detailCard.x + 8,
      y: detailCard.y + 24,
      width: detailCard.width - 16,
      height: detailCard.height - 32,
    }, 'Detalle no disponible', fonts, theme);
  }
  drawTextBox(page, content.detailCaption, fonts, theme, {
    x: detailCard.x + 10,
    top: detailCard.y + 20,
    width: detailCard.width - 20,
    height: 14,
    preferredSize: 7,
    minimumSize: 6.5,
    color: theme.mutedText,
    maxLines: 1,
  });

  if (hasExpectedResult) {
    drawCard(page, expectedCard, theme.white, theme.softBorder);
    page.drawCircle({ x: expectedCard.x + 18, y: expectedCard.y + expectedCard.height - 18, size: 5, color: hexToRgb(theme.green) });
    drawLabel(page, 'RESULTADO ESPERADO', expectedCard.x + 30, expectedCard.y + expectedCard.height - 15, fonts.bold, theme.green, fonts.boldIsCustom, 8);
    drawTextBox(page, content.expectedResult, fonts, theme, {
      x: expectedCard.x + 14,
      top: expectedCard.y + expectedCard.height - 30,
      width: expectedCard.width - 28,
      height: 34,
      preferredSize: 8.5,
      minimumSize: 7,
      color: theme.darkText,
      maxLines: 3,
    });
  }

  drawCard(page, resourceCard, theme.white, theme.softBorder);
  drawLabel(page, 'PÁGINA / RECURSO', resourceCard.x + 14, resourceCard.y + resourceCard.height - 15, fonts.bold, theme.gold, fonts.boldIsCustom, 8);
  drawTextBox(page, content.resource, fonts, theme, {
    x: resourceCard.x + 14,
    top: resourceCard.y + resourceCard.height - 30,
    width: resourceCard.width - 28,
    height: 34,
    preferredSize: 8,
    minimumSize: 6.5,
    color: theme.darkText,
    maxLines: 3,
  });

  const progressWidth = (current / total) * (theme.pageWidth - 60);
  page.drawRectangle({ x: 30, y: 20, width: theme.pageWidth - 60, height: 3, color: hexToRgb(theme.softBorder) });
  page.drawRectangle({ x: 30, y: 20, width: progressWidth, height: 3, color: hexToRgb(theme.primaryRed) });
  drawTextBox(page, manual.title, fonts, theme, {
    x: 30,
    top: 16,
    width: 690,
    height: 10,
    preferredSize: 6.5,
    minimumSize: 6.5,
    color: theme.mutedText,
    maxLines: 1,
  });
  drawLabel(page, `${current + (options.includeCover === false ? 0 : 1)}`, 799, 10, fonts.bold, theme.mutedText, fonts.boldIsCustom, 7);
}

async function drawEmbeddedImage(
  document: PDFDocument,
  page: PDFPage,
  image: ProcessedImage,
  box: ImagePlacement,
  theme: ManualPdfTheme,
  allowUpscale: boolean,
): Promise<ImagePlacement | undefined> {
  try {
    const embedded = await embedProcessedImage(document, image);
    const placement = calculateContain(image, box, allowUpscale);
    drawPdfImage(page, embedded, placement);
    return placement;
  } catch {
    page.drawRectangle({ ...box, color: hexToRgb(theme.warmWhite) });
    return undefined;
  }
}

function drawPdfImage(page: PDFPage, image: PDFImage, placement: ImagePlacement): void {
  page.drawImage(image, placement);
}

function drawTextBox(
  page: PDFPage,
  text: string,
  fonts: PdfFonts,
  theme: ManualPdfTheme,
  options: TextBoxOptions,
): void {
  const font = options.bold === true ? fonts.bold : fonts.regular;
  const isCustom = options.bold === true ? fonts.boldIsCustom : fonts.regularIsCustom;
  const safeText = safeTextForFont(text, isCustom);
  const fitted = fitTextInBox({
    text: safeText,
    font,
    maxWidth: options.width,
    maxHeight: options.height,
    preferredFontSize: options.preferredSize,
    minimumFontSize: options.minimumSize,
    ...(options.maxLines === undefined ? {} : { maxLines: options.maxLines }),
    ...(options.lineHeightRatio === undefined ? {} : { lineHeightRatio: options.lineHeightRatio }),
  });
  const lineHeight = fitted.fontSize * (options.lineHeightRatio ?? 1.25);
  fitted.lines.forEach((line, index) => {
    page.drawText(line, {
      x: options.x,
      y: options.top - fitted.fontSize - index * lineHeight,
      size: fitted.fontSize,
      font,
      color: hexToRgb(options.color),
    });
  });
}

function drawLabel(
  page: PDFPage,
  text: string,
  x: number,
  y: number,
  font: PDFFont,
  color: string,
  isCustom: boolean,
  size: number,
): void {
  page.drawText(safeTextForFont(text, isCustom), { x, y, font, size, color: hexToRgb(color) });
}

function drawCard(page: PDFPage, box: ImagePlacement, background: string, border: string): void {
  page.drawRectangle({
    ...box,
    color: hexToRgb(background),
    borderColor: hexToRgb(border),
    borderWidth: 0.7,
  });
}

function drawImagePlaceholder(
  page: PDFPage,
  box: ImagePlacement,
  label: string,
  fonts: PdfFonts,
  theme: ManualPdfTheme,
): void {
  page.drawRectangle({ ...box, color: hexToRgb(theme.warmWhite), borderColor: hexToRgb(theme.softBorder), borderWidth: 0.7 });
  const iconX = box.x + box.width / 2 - 16;
  const iconY = box.y + box.height / 2 + 6;
  page.drawRectangle({ x: iconX, y: iconY, width: 32, height: 22, borderColor: hexToRgb(theme.mutedText), borderWidth: 1.2 });
  page.drawCircle({ x: iconX + 16, y: iconY + 11, size: 5, borderColor: hexToRgb(theme.mutedText), borderWidth: 1 });
  drawTextBox(page, label, fonts, theme, {
    x: box.x + 12,
    top: iconY - 8,
    width: box.width - 24,
    height: 28,
    preferredSize: 8,
    minimumSize: 7,
    color: theme.mutedText,
    maxLines: 2,
  });
}

function shouldDrawHighlight(step: ResolvedManualStep, mode: NonNullable<ManualPdfOptions['drawSelectionHighlight']>): boolean {
  if (mode === 'never') {
    return false;
  }
  if (mode === 'always') {
    return true;
  }
  return step.annotationBaked !== true;
}

function drawSelectionHighlight(
  page: PDFPage,
  highlight: ImagePlacement,
  theme: ManualPdfTheme,
): void {
  page.drawRectangle({
    ...highlight,
    borderColor: hexToRgb(theme.white),
    borderWidth: 3.4,
  });
  page.drawRectangle({
    ...highlight,
    borderColor: hexToRgb(theme.primaryRed),
    borderWidth: 1.8,
  });
}

function safeTextForFont(value: string, isCustom: boolean): string {
  return isCustom ? value : sanitizeForStandardPdfFont(value);
}

function insetBox(box: ImagePlacement, amount: number): ImagePlacement {
  return {
    x: box.x + amount,
    y: box.y + amount,
    width: Math.max(1, box.width - amount * 2),
    height: Math.max(1, box.height - amount * 2),
  };
}

function reportProgress(options: ManualPdfOptions, progress: ManualPdfProgress): void {
  try {
    options.onProgress?.(progress);
  } catch {
    // La interfaz de progreso no debe interrumpir la generación.
  }
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('es-EC', { dateStyle: 'long' }).format(date);
}

function yieldToUi(): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, 0));
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}
