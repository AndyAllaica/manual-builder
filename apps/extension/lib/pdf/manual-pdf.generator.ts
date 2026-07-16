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
  processDataUrl,
  rectToPdfCoordinates,
  type PreparedStepImages,
} from './manual-pdf.images';
import { fitTextInBox, sanitizeForStandardPdfFont } from './manual-pdf.text';
import { hexToRgb, resolveManualPdfTheme } from './manual-pdf.theme';
import type {
  ImagePlacement,
  ManualExport,
  ManualPdfBrandingLayout,
  ManualPdfOptions,
  ManualPdfProgress,
  ManualPdfTheme,
  ManualSystemStructure,
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

interface PreparedBrandingImage {
  image: PDFImage;
  width: number;
  height: number;
}

interface PreparedPdfBranding {
  header: PreparedBrandingImage | undefined;
  footer: PreparedBrandingImage | undefined;
  layout: ManualPdfBrandingLayout;
}

interface PortraitContentBounds {
  top: number;
  bottom: number;
}

interface StepPageNumbering {
  current: number;
  total: number;
  documentCurrent: number;
}

const DEFAULT_IMAGE_QUALITY = 0.94;
const DEFAULT_MAX_IMAGE_DIMENSION = 2560;
const DEFAULT_PORTRAIT_BRANDING_LAYOUT: ManualPdfBrandingLayout = {
  headerWidth: 595.28,
  headerHeight: 76,
  footerWidth: 595.28,
  footerHeight: 44,
  footerOffsetY: 0,
  contentGap: 12,
};

export async function generateManualPdf(
  manualInput: ManualExport,
  options: ManualPdfOptions = {},
): Promise<Uint8Array> {
  const manual = resolveManualExport(manualInput);
  if (manual.steps.length === 0) {
    throw new Error('No existen pasos para exportar.');
  }

  const theme = resolvePdfTheme(options);
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
  const branding = await preparePdfBranding(document, options, imageOptions);

  const coverPageCount = options.includeCover === false ? 0 : 1;
  if (coverPageCount > 0) {
    reportProgress(options, { current: 0, total, percentage: 5, stage: 'cover', message: 'Diseñando la portada...' });
    let coverImage: ProcessedImage | undefined;
    try {
      const prepared = await prepareStepImages(manual.steps[0]!, imageOptions, options.assetResolver);
      coverImage = prepared.general ?? prepared.detail;
    } catch {
      coverImage = undefined;
    }
    await drawCover(document, manual, coverImage, fonts, theme, branding);
  }

  const structurePageCount = manual.structure === undefined
    ? 0
    : drawSystemStructurePages(document, manual.structure, fonts, theme, branding);
  const stepPageNumbering = buildStepPageNumbering(manual);

  for (let index = 0; index < manual.steps.length; index += 1) {
    const step = manual.steps[index]!;
    const current = index + 1;
    const numbering = stepPageNumbering[index]!;
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
    await drawStepPage(
      document,
      manual,
      step,
      resolveStepContent(step),
      images,
      numbering,
      coverPageCount + structurePageCount,
      fonts,
      theme,
      options,
      branding,
    );
    await yieldToUi();
  }

  reportProgress(options, { current: total, total, percentage: 95, stage: 'saving', message: 'Finalizando el archivo PDF...' });
  const bytes = await document.save({ useObjectStreams: true });
  reportProgress(options, { current: total, total, percentage: 100, stage: 'completed', message: 'PDF generado correctamente.' });
  return bytes;
}

function resolvePdfTheme(options: ManualPdfOptions): ManualPdfTheme {
  const theme = resolveManualPdfTheme(options.theme);
  if (options.orientation !== 'portrait' || theme.pageHeight >= theme.pageWidth) {
    return theme;
  }

  return {
    ...theme,
    pageWidth: theme.pageHeight,
    pageHeight: theme.pageWidth,
  };
}

function isPortraitTheme(theme: ManualPdfTheme): boolean {
  return theme.pageHeight > theme.pageWidth;
}

function buildStepPageNumbering(manual: ResolvedManual): StepPageNumbering[] {
  const numbering = manual.steps.map((_, index) => ({
    current: index + 1,
    total: manual.steps.length,
    documentCurrent: index + 1,
  }));

  if (manual.structure === undefined) {
    return numbering;
  }

  let groupStart = 0;
  while (groupStart < manual.steps.length) {
    const groupKey = getStepHierarchyGroupKey(manual.steps[groupStart]!);
    if (groupKey === null) {
      groupStart += 1;
      continue;
    }

    let groupEnd = groupStart + 1;
    while (
      groupEnd < manual.steps.length
      && getStepHierarchyGroupKey(manual.steps[groupEnd]!) === groupKey
    ) {
      groupEnd += 1;
    }

    const groupTotal = groupEnd - groupStart;
    for (let index = groupStart; index < groupEnd; index += 1) {
      numbering[index] = {
        current: index - groupStart + 1,
        total: groupTotal,
        documentCurrent: index + 1,
      };
    }
    groupStart = groupEnd;
  }

  return numbering;
}

function getStepHierarchyGroupKey(step: ResolvedManualStep): string | null {
  if (step.hierarchy === undefined) {
    return null;
  }

  return [
    step.hierarchy.systemName,
    step.hierarchy.moduleName,
    step.hierarchy.actionName,
  ].join('\u0000');
}

function getStepHeaderText(step: ResolvedManualStep): string {
  if (step.hierarchy === undefined) {
    return 'MANUAL DE USUARIO';
  }

  return `ACCIÓN: ${step.hierarchy.actionName} | MÓDULO: ${step.hierarchy.moduleName}`;
}

async function preparePdfBranding(
  document: PDFDocument,
  options: ManualPdfOptions,
  imageOptions: { imageQuality: number; maxImageDimension: number },
): Promise<PreparedPdfBranding> {
  const layout = resolvePortraitBrandingLayout(options.portraitBrandingLayout);
  if (options.orientation !== 'portrait') {
    return { header: undefined, footer: undefined, layout };
  }

  return {
    header: await prepareBrandingImage(document, options.headerImageDataUrl, imageOptions),
    footer: await prepareBrandingImage(document, options.footerImageDataUrl, imageOptions),
    layout,
  };
}

function resolvePortraitBrandingLayout(
  value: Partial<ManualPdfBrandingLayout> | undefined,
): ManualPdfBrandingLayout {
  return {
    headerWidth: clamp(value?.headerWidth ?? DEFAULT_PORTRAIT_BRANDING_LAYOUT.headerWidth, 24, 841.89),
    headerHeight: clamp(value?.headerHeight ?? DEFAULT_PORTRAIT_BRANDING_LAYOUT.headerHeight, 24, 180),
    footerWidth: clamp(value?.footerWidth ?? DEFAULT_PORTRAIT_BRANDING_LAYOUT.footerWidth, 24, 841.89),
    footerHeight: clamp(value?.footerHeight ?? DEFAULT_PORTRAIT_BRANDING_LAYOUT.footerHeight, 18, 100),
    footerOffsetY: clamp(value?.footerOffsetY ?? DEFAULT_PORTRAIT_BRANDING_LAYOUT.footerOffsetY, 0, 80),
    contentGap: clamp(value?.contentGap ?? DEFAULT_PORTRAIT_BRANDING_LAYOUT.contentGap, 0, 36),
  };
}

async function prepareBrandingImage(
  document: PDFDocument,
  dataUrl: string | null | undefined,
  imageOptions: { imageQuality: number; maxImageDimension: number },
): Promise<PreparedBrandingImage | undefined> {
  if (dataUrl === null || dataUrl === undefined || dataUrl.length === 0) {
    return undefined;
  }

  try {
    const processed = await processDataUrl(dataUrl, {
      ...imageOptions,
      preserveTransparency: true,
    });
    return {
      image: await embedProcessedImage(document, processed),
      width: processed.width,
      height: processed.height,
    };
  } catch {
    return undefined;
  }
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

async function drawPortraitCover(
  document: PDFDocument,
  manual: ResolvedManual,
  coverImage: ProcessedImage | undefined,
  fonts: PdfFonts,
  theme: ManualPdfTheme,
  branding: PreparedPdfBranding,
): Promise<void> {
  const page = document.addPage([theme.pageWidth, theme.pageHeight]);
  const contentBounds = getPortraitContentBounds(theme, branding);
  const contentWidth = theme.pageWidth - 72;
  const heroHeight = 260;
  const heroBottom = contentBounds.top - heroHeight;
  page.drawRectangle({ x: 0, y: 0, width: theme.pageWidth, height: theme.pageHeight, color: hexToRgb(theme.warmWhite) });
  page.drawRectangle({ x: 0, y: heroBottom, width: theme.pageWidth, height: heroHeight, color: hexToRgb(theme.primaryRed) });
  page.drawRectangle({ x: 0, y: heroBottom, width: 18, height: heroHeight, color: hexToRgb(theme.deepRed) });
  page.drawRectangle({ x: 36, y: contentBounds.top - 58, width: 48, height: 4, color: hexToRgb(theme.gold) });

  drawLabel(page, 'MANUAL DE USUARIO', 36, contentBounds.top - 86, fonts.bold, theme.white, fonts.boldIsCustom, 10);
  drawTextBox(page, manual.title, fonts, theme, {
    x: 36,
    top: contentBounds.top - 110,
    width: contentWidth,
    height: 132,
    preferredSize: 31,
    minimumSize: 21,
    color: theme.white,
    bold: true,
    maxLines: 4,
    lineHeightRatio: 1.04,
  });
  drawTextBox(page, manual.description || 'Documento generado con Manual Builder.', fonts, theme, {
    x: 36,
    top: contentBounds.top - 226,
    width: contentWidth,
    height: 42,
    preferredSize: 10,
    minimumSize: 8,
    color: theme.white,
    maxLines: 3,
  });

  const imageTop = heroBottom - 24;
  const statusBannerY = contentBounds.bottom + 24;
  const imageHeight = Math.min(300, Math.max(210, imageTop - statusBannerY - 140));
  const imageBox = { x: 36, y: imageTop - imageHeight, width: contentWidth, height: imageHeight };
  drawCard(page, imageBox, theme.white, theme.softBorder);
  if (coverImage !== undefined) {
    await drawEmbeddedImage(document, page, coverImage, insetBox(imageBox, 10), theme, true);
  } else {
    drawImagePlaceholder(page, insetBox(imageBox, 10), 'Captura principal no disponible', fonts, theme);
  }

  const documentLabelY = imageBox.y - 36;
  drawLabel(page, 'DOCUMENTO', 36, documentLabelY, fonts.bold, theme.primaryRed, fonts.boldIsCustom, 8);
  drawTextBox(page, manual.author ? `Autor: ${manual.author}` : 'Autor no especificado', fonts, theme, {
    x: 36,
    top: documentLabelY - 15,
    width: 255,
    height: 30,
    preferredSize: 10,
    minimumSize: 8,
    color: theme.darkText,
    maxLines: 2,
  });
  drawTextBox(page, `Generado: ${formatDate(new Date())}`, fonts, theme, {
    x: 305,
    top: documentLabelY - 15,
    width: 254,
    height: 30,
    preferredSize: 10,
    minimumSize: 8,
    color: theme.mutedText,
    maxLines: 2,
  });
  page.drawRectangle({ x: 36, y: statusBannerY, width: contentWidth, height: 52, color: hexToRgb(theme.deepRed) });
  drawLabel(
    page,
    `${manual.steps.length} PASO${manual.steps.length === 1 ? '' : 'S'}`,
    54,
    statusBannerY + 19,
    fonts.bold,
    theme.white,
    fonts.boldIsCustom,
    12,
  );
  page.drawCircle({ x: theme.pageWidth - 48, y: statusBannerY + 26, size: 6, color: hexToRgb(theme.green) });
  drawLabel(page, 'LISTO PARA CONSULTA', theme.pageWidth - 205, statusBannerY + 23, fonts.bold, theme.white, fonts.boldIsCustom, 8);
  drawPdfBranding(page, branding, theme);
}

function drawPortraitSystemStructurePages(
  document: PDFDocument,
  structure: ManualSystemStructure,
  fonts: PdfFonts,
  theme: ManualPdfTheme,
  branding: PreparedPdfBranding,
): number {
  const pages: PDFPage[] = [];
  const contentBounds = getPortraitContentBounds(theme, branding);
  const contentWidth = theme.pageWidth - 60;
  let page!: PDFPage;
  let cursorTop = 0;

  const createPage = (continuation: boolean): void => {
    page = document.addPage([theme.pageWidth, theme.pageHeight]);
    pages.push(page);
    page.drawRectangle({ x: 0, y: 0, width: theme.pageWidth, height: theme.pageHeight, color: hexToRgb(theme.warmWhite) });
    page.drawRectangle({ x: 0, y: contentBounds.top - 12, width: theme.pageWidth, height: 12, color: hexToRgb(theme.primaryRed) });
    drawLabel(
      page,
      continuation ? 'ESTRUCTURA DEL SISTEMA / CONTINUACION' : 'ESTRUCTURA DEL SISTEMA',
      30,
      contentBounds.top - 38,
      fonts.bold,
      theme.primaryRed,
      fonts.boldIsCustom,
      8,
    );
    drawTextBox(page, structure.systemName || 'Sistema', fonts, theme, {
      x: 30,
      top: contentBounds.top - 62,
      width: contentWidth,
      height: 42,
      preferredSize: 25,
      minimumSize: 18,
      color: theme.darkText,
      bold: true,
      maxLines: 2,
    });
    cursorTop = contentBounds.top - 132;
  };

  const drawModuleHeader = (moduleName: string, continuation: boolean): void => {
    page.drawRectangle({
      x: 30,
      y: cursorTop - 30,
      width: contentWidth,
      height: 30,
      color: hexToRgb(theme.white),
      borderColor: hexToRgb(theme.softBorder),
      borderWidth: 0.7,
    });
    drawTextBox(page, `${continuation ? 'MODULO (CONT.)' : 'MODULO'}: ${moduleName}`, fonts, theme, {
      x: 44,
      top: cursorTop - 7,
      width: contentWidth - 28,
      height: 18,
      preferredSize: 10,
      minimumSize: 8,
      color: theme.primaryRed,
      bold: true,
      maxLines: 1,
    });
    cursorTop -= 42;
  };

  createPage(false);

  for (const systemModule of structure.modules) {
    if (cursorTop - 42 < contentBounds.bottom + 55) {
      createPage(true);
    }
    drawModuleHeader(systemModule.name, false);

    if (systemModule.actions.length === 0) {
      drawTextBox(page, 'Sin acciones registradas.', fonts, theme, {
        x: 58,
        top: cursorTop,
        width: contentWidth - 28,
        height: 18,
        preferredSize: 8,
        minimumSize: 7,
        color: theme.mutedText,
        maxLines: 1,
      });
      cursorTop -= 32;
      continue;
    }

    for (const action of systemModule.actions) {
      if (cursorTop - 48 < contentBounds.bottom + 55) {
        createPage(true);
        drawModuleHeader(systemModule.name, true);
      }

      const totalSteps = action.manuals.reduce((total, manual) => total + manual.stepCount, 0);
      const manualTitles = action.manuals.map((manual) => manual.title).join(', ');
      const actionDetail = action.manuals.length === 0
        ? 'Sin manuales registrados'
        : `${action.manuals.length} manual${action.manuals.length === 1 ? '' : 'es'} | ${totalSteps} paso${totalSteps === 1 ? '' : 's'} | ${manualTitles}`;

      page.drawCircle({ x: 45, y: cursorTop - 7, size: 4, color: hexToRgb(theme.gold) });
      drawTextBox(page, action.name, fonts, theme, {
        x: 58,
        top: cursorTop,
        width: contentWidth - 28,
        height: 17,
        preferredSize: 9.5,
        minimumSize: 8,
        color: theme.darkText,
        bold: true,
        maxLines: 1,
      });
      drawTextBox(page, actionDetail, fonts, theme, {
        x: 58,
        top: cursorTop - 18,
        width: contentWidth - 28,
        height: 25,
        preferredSize: 7.5,
        minimumSize: 6.5,
        color: theme.mutedText,
        maxLines: 2,
      });
      cursorTop -= 50;
    }
  }

  pages.forEach((structurePage, index) => {
    drawLabel(
      structurePage,
      `ESTRUCTURA ${index + 1} DE ${pages.length}`,
      theme.pageWidth - 130,
      contentBounds.bottom + 20,
      fonts.bold,
      theme.mutedText,
      fonts.boldIsCustom,
      7,
    );
    drawPdfBranding(structurePage, branding, theme);
  });

  return pages.length;
}

async function drawPortraitStepPage(
  document: PDFDocument,
  manual: ResolvedManual,
  step: ResolvedManualStep,
  content: ResolvedStepContent,
  images: PreparedStepImages,
  numbering: StepPageNumbering,
  pageNumberOffset: number,
  fonts: PdfFonts,
  theme: ManualPdfTheme,
  options: ManualPdfOptions,
  branding: PreparedPdfBranding,
): Promise<void> {
  const { current, total, documentCurrent } = numbering;
  const page = document.addPage([theme.pageWidth, theme.pageHeight]);
  const contentBounds = getPortraitContentBounds(theme, branding);
  const contentWidth = theme.pageWidth - 60;
  page.drawRectangle({ x: 0, y: 0, width: theme.pageWidth, height: theme.pageHeight, color: hexToRgb(theme.warmWhite) });
  page.drawRectangle({ x: 0, y: contentBounds.top - 12, width: theme.pageWidth, height: 12, color: hexToRgb(theme.primaryRed) });

  drawTextBox(page, getStepHeaderText(step), fonts, theme, {
    x: 30,
    top: contentBounds.top - 29,
    width: theme.pageWidth - 140,
    height: 14,
    preferredSize: 8,
    minimumSize: 6.5,
    color: theme.primaryRed,
    bold: true,
    maxLines: 1,
  });
  drawLabel(page, `PASO ${current} DE ${total}`, theme.pageWidth - 88, contentBounds.top - 38, fonts.bold, theme.mutedText, fonts.boldIsCustom, 7);
  drawTextBox(page, String(current).padStart(2, '0'), fonts, theme, {
    x: 30,
    top: contentBounds.top - 62,
    width: 54,
    height: 52,
    preferredSize: 35,
    minimumSize: 29,
    color: theme.primaryRed,
    bold: true,
    maxLines: 1,
  });
  drawTextBox(page, `Paso ${current}: ${content.title}`, fonts, theme, {
    x: 92,
    top: contentBounds.top - 62,
    width: theme.pageWidth - 122,
    height: 48,
    preferredSize: 19,
    minimumSize: 14,
    color: theme.darkText,
    bold: true,
    maxLines: 2,
    lineHeightRatio: 1.05,
  });
  const hasExpectedResult = content.expectedResult.trim().length > 0;
  const hasResource = documentCurrent === 1 && content.resource.trim().length > 0;
  const hasBottomCards = hasExpectedResult || hasResource;
  const bottomCardY = contentBounds.bottom + 40;
  const bottomCardHeight = 75;
  const lowerCardsY = hasBottomCards ? bottomCardY + 90 : bottomCardY;
  const lowerCardsHeight = 190;
  const gap = 16;
  const detailWidth = 190;
  const actionWidth = contentWidth - detailWidth - gap;
  const detailX = 30 + actionWidth + gap;
  const generalCardY = lowerCardsY + lowerCardsHeight + gap;
  const generalCardTop = contentBounds.top - 152;
  const generalCard = {
    x: 30,
    y: generalCardY,
    width: contentWidth,
    height: generalCardTop - generalCardY,
  };
  const actionCard = { x: 30, y: lowerCardsY, width: actionWidth, height: lowerCardsHeight };
  const detailCard = { x: detailX, y: lowerCardsY, width: detailWidth, height: lowerCardsHeight };

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
  drawLabel(page, 'ACCION PRINCIPAL', actionCard.x + 14, actionCard.y + actionCard.height - 18, fonts.bold, theme.primaryRed, fonts.boldIsCustom, 8);
  const visibleActions = content.actions.slice(0, 10);
  const actionText = visibleActions.map((action) => `- ${action}`).join('\n')
    + (content.actions.length > visibleActions.length ? '\n...' : '');
  drawTextBox(page, actionText, fonts, theme, {
    x: actionCard.x + 14,
    top: actionCard.y + actionCard.height - 34,
    width: actionCard.width - 28,
    height: actionCard.height - 44,
    preferredSize: 8.5,
    minimumSize: 7,
    color: theme.darkText,
    maxLines: 12,
    lineHeightRatio: 1.23,
  });

  drawCard(page, detailCard, theme.white, theme.softBorder);
  if (images.detail !== undefined) {
    await drawEmbeddedImage(document, page, images.detail, {
      x: detailCard.x + 8,
      y: detailCard.y + 25,
      width: detailCard.width - 16,
      height: detailCard.height - 34,
    }, theme, true);
  } else {
    drawImagePlaceholder(page, {
      x: detailCard.x + 8,
      y: detailCard.y + 25,
      width: detailCard.width - 16,
      height: detailCard.height - 34,
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
    const expectedCard = hasResource
      ? { x: 30, y: bottomCardY, width: actionWidth, height: bottomCardHeight }
      : { x: 30, y: bottomCardY, width: contentWidth, height: bottomCardHeight };
    drawCard(page, expectedCard, theme.white, theme.softBorder);
    page.drawCircle({ x: expectedCard.x + 18, y: expectedCard.y + expectedCard.height - 18, size: 5, color: hexToRgb(theme.green) });
    drawLabel(page, 'RESULTADO ESPERADO', expectedCard.x + 30, expectedCard.y + expectedCard.height - 15, fonts.bold, theme.green, fonts.boldIsCustom, 8);
    drawTextBox(page, content.expectedResult, fonts, theme, {
      x: expectedCard.x + 14,
      top: expectedCard.y + expectedCard.height - 30,
      width: expectedCard.width - 28,
      height: 38,
      preferredSize: 8.2,
      minimumSize: 7,
      color: theme.darkText,
      maxLines: 3,
    });
  }

  if (hasResource) {
    const resourceCard = hasExpectedResult
      ? { x: detailX, y: bottomCardY, width: detailWidth, height: bottomCardHeight }
      : { x: 30, y: bottomCardY, width: contentWidth, height: bottomCardHeight };
    drawCard(page, resourceCard, theme.white, theme.softBorder);
    drawLabel(page, 'PAGINA / RECURSO', resourceCard.x + 14, resourceCard.y + resourceCard.height - 15, fonts.bold, theme.gold, fonts.boldIsCustom, 8);
    drawTextBox(page, content.resource, fonts, theme, {
      x: resourceCard.x + 14,
      top: resourceCard.y + resourceCard.height - 30,
      width: resourceCard.width - 28,
      height: 38,
      preferredSize: 7.5,
      minimumSize: 6.2,
      color: theme.darkText,
      maxLines: 3,
    });
  }

  const progressWidth = (current / total) * contentWidth;
  page.drawRectangle({ x: 30, y: contentBounds.bottom + 22, width: contentWidth, height: 3, color: hexToRgb(theme.softBorder) });
  page.drawRectangle({ x: 30, y: contentBounds.bottom + 22, width: progressWidth, height: 3, color: hexToRgb(theme.primaryRed) });
  drawTextBox(page, manual.title, fonts, theme, {
    x: 30,
    top: contentBounds.bottom + 17,
    width: theme.pageWidth - 95,
    height: 10,
    preferredSize: 6.5,
    minimumSize: 6.5,
    color: theme.mutedText,
    maxLines: 1,
  });
  drawLabel(page, `${documentCurrent + pageNumberOffset}`, theme.pageWidth - 36, contentBounds.bottom + 10, fonts.bold, theme.mutedText, fonts.boldIsCustom, 7);
  drawPdfBranding(page, branding, theme);
}

async function drawCover(
  document: PDFDocument,
  manual: ResolvedManual,
  coverImage: ProcessedImage | undefined,
  fonts: PdfFonts,
  theme: ManualPdfTheme,
  branding: PreparedPdfBranding,
): Promise<void> {
  if (isPortraitTheme(theme)) {
    return drawPortraitCover(document, manual, coverImage, fonts, theme, branding);
  }

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
  drawPdfBranding(page, branding, theme);
}

function drawSystemStructurePages(
  document: PDFDocument,
  structure: ManualSystemStructure,
  fonts: PdfFonts,
  theme: ManualPdfTheme,
  branding: PreparedPdfBranding,
): number {
  if (isPortraitTheme(theme)) {
    return drawPortraitSystemStructurePages(document, structure, fonts, theme, branding);
  }

  const pages: PDFPage[] = [];
  let page!: PDFPage;
  let cursorTop = 0;

  const createPage = (continuation: boolean): void => {
    page = document.addPage([theme.pageWidth, theme.pageHeight]);
    pages.push(page);
    page.drawRectangle({
      x: 0,
      y: 0,
      width: theme.pageWidth,
      height: theme.pageHeight,
      color: hexToRgb(theme.warmWhite),
    });
    page.drawRectangle({
      x: 0,
      y: theme.pageHeight - 12,
      width: theme.pageWidth,
      height: 12,
      color: hexToRgb(theme.primaryRed),
    });
    drawLabel(
      page,
      continuation ? 'ESTRUCTURA DEL SISTEMA / CONTINUACION' : 'ESTRUCTURA DEL SISTEMA',
      30,
      557,
      fonts.bold,
      theme.primaryRed,
      fonts.boldIsCustom,
      8,
    );
    drawTextBox(page, structure.systemName || 'Sistema', fonts, theme, {
      x: 30,
      top: 535,
      width: 760,
      height: 34,
      preferredSize: 24,
      minimumSize: 18,
      color: theme.darkText,
      bold: true,
      maxLines: 1,
    });
    cursorTop = 475;
  };

  const drawModuleHeader = (moduleName: string, continuation: boolean): void => {
    page.drawRectangle({
      x: 30,
      y: cursorTop - 28,
      width: 782,
      height: 28,
      color: hexToRgb(theme.white),
      borderColor: hexToRgb(theme.softBorder),
      borderWidth: 0.7,
    });
    drawTextBox(page, `${continuation ? 'MODULO (CONT.)' : 'MODULO'}: ${moduleName}`, fonts, theme, {
      x: 44,
      top: cursorTop - 7,
      width: 750,
      height: 16,
      preferredSize: 10,
      minimumSize: 8,
      color: theme.primaryRed,
      bold: true,
      maxLines: 1,
    });
    cursorTop -= 38;
  };

  createPage(false);

  for (const systemModule of structure.modules) {
    if (cursorTop - 38 < 45) {
      createPage(true);
    }
    drawModuleHeader(systemModule.name, false);

    if (systemModule.actions.length === 0) {
      drawTextBox(page, 'Sin acciones registradas.', fonts, theme, {
        x: 58,
        top: cursorTop,
        width: 720,
        height: 18,
        preferredSize: 8,
        minimumSize: 7,
        color: theme.mutedText,
        maxLines: 1,
      });
      cursorTop -= 30;
      continue;
    }

    for (const action of systemModule.actions) {
      if (cursorTop - 42 < 45) {
        createPage(true);
        drawModuleHeader(systemModule.name, true);
      }

      const totalSteps = action.manuals.reduce((total, manual) => total + manual.stepCount, 0);
      const manualTitles = action.manuals.map((manual) => manual.title).join(', ');
      const actionDetail = action.manuals.length === 0
        ? 'Sin manuales registrados'
        : `${action.manuals.length} manual${action.manuals.length === 1 ? '' : 'es'} | ${totalSteps} paso${totalSteps === 1 ? '' : 's'} | ${manualTitles}`;

      page.drawCircle({
        x: 45,
        y: cursorTop - 7,
        size: 4,
        color: hexToRgb(theme.gold),
      });
      drawTextBox(page, action.name, fonts, theme, {
        x: 58,
        top: cursorTop,
        width: 730,
        height: 16,
        preferredSize: 9.5,
        minimumSize: 8,
        color: theme.darkText,
        bold: true,
        maxLines: 1,
      });
      drawTextBox(page, actionDetail, fonts, theme, {
        x: 58,
        top: cursorTop - 17,
        width: 730,
        height: 16,
        preferredSize: 7.5,
        minimumSize: 6.5,
        color: theme.mutedText,
        maxLines: 1,
      });
      cursorTop -= 42;
    }
  }

  pages.forEach((structurePage, index) => {
    drawLabel(
      structurePage,
      `ESTRUCTURA ${index + 1} DE ${pages.length}`,
      700,
      20,
      fonts.bold,
      theme.mutedText,
      fonts.boldIsCustom,
      7,
    );
    drawPdfBranding(structurePage, branding, theme);
  });

  return pages.length;
}

async function drawStepPage(
  document: PDFDocument,
  manual: ResolvedManual,
  step: ResolvedManualStep,
  content: ResolvedStepContent,
  images: PreparedStepImages,
  numbering: StepPageNumbering,
  pageNumberOffset: number,
  fonts: PdfFonts,
  theme: ManualPdfTheme,
  options: ManualPdfOptions,
  branding: PreparedPdfBranding,
): Promise<void> {
  const { current, total, documentCurrent } = numbering;
  if (isPortraitTheme(theme)) {
    return drawPortraitStepPage(
      document,
      manual,
      step,
      content,
      images,
      numbering,
      pageNumberOffset,
      fonts,
      theme,
      options,
      branding,
    );
  }

  const page = document.addPage([theme.pageWidth, theme.pageHeight]);
  page.drawRectangle({ x: 0, y: 0, width: theme.pageWidth, height: theme.pageHeight, color: hexToRgb(theme.warmWhite) });
  page.drawRectangle({ x: 0, y: theme.pageHeight - 12, width: theme.pageWidth, height: 12, color: hexToRgb(theme.primaryRed) });

  drawTextBox(page, getStepHeaderText(step), fonts, theme, {
    x: 30,
    top: 565,
    width: 680,
    height: 14,
    preferredSize: 8,
    minimumSize: 6.5,
    color: theme.primaryRed,
    bold: true,
    maxLines: 1,
  });
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
  const hasExpectedResult = content.expectedResult.trim().length > 0;
  const hasResource = documentCurrent === 1 && content.resource.trim().length > 0;
  const hasBottomCards = hasExpectedResult || hasResource;
  const mainContentBottom = hasBottomCards ? 125 : 38;
  const generalCard = { x: 30, y: mainContentBottom, width: 518, height: 480 - mainContentBottom };
  const detailCard = {
    x: 564,
    y: mainContentBottom,
    width: 248,
    height: hasBottomCards ? 145 : 180,
  };
  const actionCard = {
    x: 564,
    y: detailCard.y + detailCard.height + 16,
    width: 248,
    height: 480 - (detailCard.y + detailCard.height + 16),
  };
  const expectedCard = { x: 30, y: 38, width: 518, height: 70 };
  const resourceCard = hasExpectedResult && hasResource
    ? { x: 564, y: 38, width: 248, height: 70 }
    : { x: 30, y: 38, width: 782, height: 70 };
  const resolvedExpectedCard = hasExpectedResult && !hasResource
    ? { x: 30, y: 38, width: 782, height: 70 }
    : expectedCard;

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
  const maximumVisibleActions = actionCard.height >= 220 ? 7 : 5;
  const visibleActions = content.actions.slice(0, maximumVisibleActions);
  const actionText = visibleActions.map((action) => `- ${action}`).join('\n')
    + (content.actions.length > visibleActions.length ? '\n...' : '');
  drawTextBox(page, actionText, fonts, theme, {
    x: actionCard.x + 14,
    top: actionCard.y + actionCard.height - 34,
    width: actionCard.width - 28,
    height: actionCard.height - 44,
    preferredSize: 9,
    minimumSize: 7,
    color: theme.darkText,
    maxLines: actionCard.height >= 220 ? 17 : 13,
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
    drawCard(page, resolvedExpectedCard, theme.white, theme.softBorder);
    page.drawCircle({ x: resolvedExpectedCard.x + 18, y: resolvedExpectedCard.y + resolvedExpectedCard.height - 18, size: 5, color: hexToRgb(theme.green) });
    drawLabel(page, 'RESULTADO ESPERADO', resolvedExpectedCard.x + 30, resolvedExpectedCard.y + resolvedExpectedCard.height - 15, fonts.bold, theme.green, fonts.boldIsCustom, 8);
    drawTextBox(page, content.expectedResult, fonts, theme, {
      x: resolvedExpectedCard.x + 14,
      top: resolvedExpectedCard.y + resolvedExpectedCard.height - 30,
      width: resolvedExpectedCard.width - 28,
      height: 34,
      preferredSize: 8.5,
      minimumSize: 7,
      color: theme.darkText,
      maxLines: 3,
    });
  }

  if (hasResource) {
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
  }

  const progressWidth = (current / total) * (theme.pageWidth - 60);
  page.drawRectangle({ x: 30, y: 20, width: theme.pageWidth - 60, height: 3, color: hexToRgb(theme.softBorder) });
  page.drawRectangle({ x: 30, y: 20, width: progressWidth, height: 3, color: hexToRgb(theme.primaryRed) });
  drawTextBox(page, manual.title, fonts, theme, {
    x: 30,
    top: 16,
    width: branding.footer === undefined ? 690 : 460,
    height: 10,
    preferredSize: 6.5,
    minimumSize: 6.5,
    color: theme.mutedText,
    maxLines: 1,
  });
  drawLabel(page, `${documentCurrent + pageNumberOffset}`, 799, 10, fonts.bold, theme.mutedText, fonts.boldIsCustom, 7);
  drawPdfBranding(page, branding, theme);
}

function drawPdfBranding(
  page: PDFPage,
  branding: PreparedPdfBranding,
  theme: ManualPdfTheme,
): void {
  if (!isPortraitTheme(theme)) {
    return;
  }

  if (branding.header !== undefined) {
    const headerWidth = Math.min(branding.layout.headerWidth, theme.pageWidth);
    drawPdfImage(page, branding.header.image, {
      x: (theme.pageWidth - headerWidth) / 2,
      y: theme.pageHeight - branding.layout.headerHeight,
      width: headerWidth,
      height: branding.layout.headerHeight,
    });
  }

  if (branding.footer !== undefined) {
    const footerWidth = Math.min(branding.layout.footerWidth, theme.pageWidth);
    drawPdfImage(page, branding.footer.image, {
      x: (theme.pageWidth - footerWidth) / 2,
      y: branding.layout.footerOffsetY,
      width: footerWidth,
      height: branding.layout.footerHeight,
    });
  }
}

function getPortraitContentBounds(
  theme: ManualPdfTheme,
  branding: PreparedPdfBranding,
): PortraitContentBounds {
  const topReserved = branding.header === undefined
    ? 0
    : branding.layout.headerHeight + branding.layout.contentGap;
  const bottomReserved = branding.footer === undefined
    ? 0
    : branding.layout.footerOffsetY + branding.layout.footerHeight + branding.layout.contentGap;

  return {
    top: theme.pageHeight - topReserved,
    bottom: bottomReserved,
  };
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
  if (step.captureTarget === 'viewport') {
    return false;
  }
  if (step.annotationBaked === true) {
    return false;
  }
  if (!hasDrawableSelectionGeometry(step)) {
    return false;
  }
  return true;
}

function hasDrawableSelectionGeometry(step: ResolvedManualStep): boolean {
  const { rect, viewport } = step.selectedElement;
  return rect !== undefined
    && viewport !== undefined
    && [rect.x, rect.y, rect.width, rect.height, viewport.width, viewport.height].every(Number.isFinite)
    && rect.width > 0
    && rect.height > 0
    && viewport.width > 1
    && viewport.height > 1;
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
