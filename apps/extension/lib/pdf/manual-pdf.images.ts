import type { PDFDocument, PDFImage } from 'pdf-lib';
import type { SelectionRect, ViewportData } from '../manual-builder';
import type {
  ImageDimensions,
  ImagePlacement,
  ManualAssetResolver,
  ProcessedImage,
  ResolvedManualStep,
} from './manual-pdf.types';

export interface ImageProcessingOptions {
  maxImageDimension: number;
  imageQuality: number;
}

export interface PreparedStepImages {
  general: ProcessedImage | undefined;
  detail: ProcessedImage | undefined;
}

export function calculateContain(
  image: ImageDimensions,
  box: ImagePlacement,
  allowUpscale = false,
): ImagePlacement {
  if (!hasPositiveDimensions(image) || !hasPositiveDimensions(box)) {
    return { ...box, width: 0, height: 0 };
  }
  const scale = Math.min(box.width / image.width, box.height / image.height, allowUpscale ? Number.POSITIVE_INFINITY : 1);
  const width = image.width * scale;
  const height = image.height * scale;
  return {
    x: box.x + (box.width - width) / 2,
    y: box.y + (box.height - height) / 2,
    width,
    height,
  };
}

export function calculateCover(image: ImageDimensions, box: ImagePlacement): ImagePlacement {
  if (!hasPositiveDimensions(image) || !hasPositiveDimensions(box)) {
    return { ...box, width: 0, height: 0 };
  }
  const scale = Math.max(box.width / image.width, box.height / image.height);
  const width = image.width * scale;
  const height = image.height * scale;
  return {
    x: box.x + (box.width - width) / 2,
    y: box.y + (box.height - height) / 2,
    width,
    height,
  };
}

export function clampRectToViewport(
  rect: SelectionRect | undefined,
  viewport: ViewportData | undefined,
): SelectionRect | undefined {
  if (!isValidRect(rect) || !isValidViewport(viewport)) {
    return undefined;
  }
  const x = clamp(rect.x, 0, viewport.width);
  const y = clamp(rect.y, 0, viewport.height);
  const right = clamp(rect.x + rect.width, 0, viewport.width);
  const bottom = clamp(rect.y + rect.height, 0, viewport.height);
  if (right <= x || bottom <= y) {
    return undefined;
  }
  return { x, y, width: right - x, height: bottom - y };
}

export function padRectWithinViewport(
  rect: SelectionRect | undefined,
  viewport: ViewportData | undefined,
  padding = 72,
): SelectionRect | undefined {
  if (!isValidRect(rect)) {
    return undefined;
  }
  return clampRectToViewport({
    x: rect.x - padding,
    y: rect.y - padding,
    width: rect.width + padding * 2,
    height: rect.height + padding * 2,
  }, viewport);
}

export function rectToPdfCoordinates(
  rect: SelectionRect | undefined,
  viewport: ViewportData | undefined,
  imagePlacement: ImagePlacement,
): ImagePlacement | undefined {
  const boundedRect = clampRectToViewport(rect, viewport);
  if (boundedRect === undefined || !isValidViewport(viewport) || !hasPositiveDimensions(imagePlacement)) {
    return undefined;
  }
  return {
    x: imagePlacement.x + (boundedRect.x / viewport.width) * imagePlacement.width,
    y: imagePlacement.y + imagePlacement.height
      - ((boundedRect.y + boundedRect.height) / viewport.height) * imagePlacement.height,
    width: (boundedRect.width / viewport.width) * imagePlacement.width,
    height: (boundedRect.height / viewport.height) * imagePlacement.height,
  };
}

export async function prepareStepImages(
  step: ResolvedManualStep,
  options: ImageProcessingOptions,
  assetResolver?: ManualAssetResolver,
): Promise<PreparedStepImages> {
  const originalDataUrl = await resolveImageDataUrl(step.imageOriginalDataUrl, step.imageAssetId, assetResolver);
  const contextDataUrl = await resolveImageDataUrl(step.imageContextDataUrl, step.contextImageAssetId, assetResolver);
  let general: ProcessedImage | undefined;
  let detail: ProcessedImage | undefined;

  if (originalDataUrl !== undefined) {
    try {
      general = await processDataUrl(originalDataUrl, options);
    } catch {
      general = undefined;
    }
  }

  if (contextDataUrl !== undefined) {
    try {
      detail = await processDataUrl(contextDataUrl, options);
    } catch {
      detail = undefined;
    }
  } else if (originalDataUrl !== undefined) {
    const viewport = step.selectedElement.viewport;
    const cropRegion = clampRectToViewport(step.contextRegion, viewport)
      ?? padRectWithinViewport(step.selectedElement.rect, viewport);
    if (cropRegion !== undefined && viewport !== undefined) {
      try {
        detail = await processDataUrl(originalDataUrl, options, cropRegion, viewport);
      } catch {
        detail = undefined;
      }
    }
  }

  return { general, detail };
}

export async function embedProcessedImage(document: PDFDocument, image: ProcessedImage): Promise<PDFImage> {
  return image.format === 'png' ? document.embedPng(image.bytes) : document.embedJpg(image.bytes);
}

export async function processDataUrl(
  dataUrl: string,
  options: ImageProcessingOptions,
  cropRegion?: SelectionRect,
  viewport?: ViewportData,
): Promise<ProcessedImage> {
  const blob = dataUrlToBlob(dataUrl);
  const source = await decodeImage(blob);
  try {
    const crop = resolvePixelCrop(source.width, source.height, cropRegion, viewport);
    const sourceWidth = crop?.width ?? source.width;
    const sourceHeight = crop?.height ?? source.height;
    const resizeScale = Math.min(1, options.maxImageDimension / Math.max(sourceWidth, sourceHeight));
    const targetWidth = Math.max(1, Math.round(sourceWidth * resizeScale));
    const targetHeight = Math.max(1, Math.round(sourceHeight * resizeScale));
    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const context = canvas.getContext('2d');
    if (context === null) {
      throw new Error('No se pudo crear el contexto de imagen.');
    }

    context.fillStyle = '#FFFFFF';
    context.fillRect(0, 0, targetWidth, targetHeight);
    context.drawImage(
      source.image,
      crop?.x ?? 0,
      crop?.y ?? 0,
      sourceWidth,
      sourceHeight,
      0,
      0,
      targetWidth,
      targetHeight,
    );

    const preservePng = blob.type === 'image/png';
    const outputBlob = await canvasToBlob(
      canvas,
      preservePng ? 'image/png' : 'image/jpeg',
      clamp(options.imageQuality, 0.4, 1),
    );
    canvas.width = 1;
    canvas.height = 1;

    return {
      bytes: new Uint8Array(await outputBlob.arrayBuffer()),
      format: preservePng ? 'png' : 'jpeg',
      width: targetWidth,
      height: targetHeight,
    };
  } finally {
    source.close();
  }
}

function dataUrlToBlob(dataUrl: string): Blob {
  const match = /^data:(image\/(?:jpeg|jpg|png|webp));base64,([a-z0-9+/=\s]+)$/i.exec(dataUrl);
  if (match === null) {
    throw new Error('La imagen no contiene un Data URL válido.');
  }
  const sourceMimeType = match[1];
  if (sourceMimeType === undefined) {
    throw new Error('La imagen no contiene un tipo MIME válido.');
  }
  const mimeType = sourceMimeType.toLowerCase() === 'image/jpg' ? 'image/jpeg' : sourceMimeType;
  const binary = atob((match[2] ?? '').replace(/\s/g, ''));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: mimeType });
}

async function decodeImage(blob: Blob): Promise<{
  image: CanvasImageSource;
  width: number;
  height: number;
  close: () => void;
}> {
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(blob);
    return { image: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
  }

  const objectUrl = URL.createObjectURL(blob);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error('No se pudo decodificar la imagen.'));
      element.src = objectUrl;
    });
    return { image, width: image.naturalWidth, height: image.naturalHeight, close: () => undefined };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function resolvePixelCrop(
  imageWidth: number,
  imageHeight: number,
  region?: SelectionRect,
  viewport?: ViewportData,
): SelectionRect | undefined {
  const bounded = clampRectToViewport(region, viewport);
  if (bounded === undefined || !isValidViewport(viewport)) {
    return undefined;
  }
  const scaleX = imageWidth / viewport.width;
  const scaleY = imageHeight / viewport.height;
  return {
    x: Math.max(0, Math.floor(bounded.x * scaleX)),
    y: Math.max(0, Math.floor(bounded.y * scaleY)),
    width: Math.max(1, Math.min(imageWidth, Math.ceil(bounded.width * scaleX))),
    height: Math.max(1, Math.min(imageHeight, Math.ceil(bounded.height * scaleY))),
  };
}

async function resolveImageDataUrl(
  directValue: string | undefined,
  assetId: string | undefined,
  resolver: ManualAssetResolver | undefined,
): Promise<string | undefined> {
  if (directValue !== undefined) {
    return directValue;
  }
  return assetId !== undefined && resolver !== undefined ? resolver.getDataUrl(assetId) : undefined;
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob === null) {
        reject(new Error('No se pudo convertir la imagen.'));
        return;
      }
      resolve(blob);
    }, type, quality);
  });
}

function isValidRect(value: SelectionRect | undefined): value is SelectionRect {
  return value !== undefined
    && [value.x, value.y, value.width, value.height].every(Number.isFinite)
    && value.width > 0
    && value.height > 0;
}

function isValidViewport(value: ViewportData | undefined): value is ViewportData {
  return value !== undefined
    && Number.isFinite(value.width)
    && Number.isFinite(value.height)
    && value.width > 0
    && value.height > 0;
}

function hasPositiveDimensions(value: ImageDimensions): boolean {
  return Number.isFinite(value.width) && Number.isFinite(value.height) && value.width > 0 && value.height > 0;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}
