import type { SelectionRect, ViewportData } from './manual-builder';

export interface InferredSelectionGeometry {
  rect: SelectionRect;
  viewport: ViewportData;
}

interface RasterImage {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

interface PixelRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface FeatureSample {
  x: number;
  y: number;
  red: number;
  green: number;
  blue: number;
  strength: number;
}

interface MatchCandidate {
  x: number;
  y: number;
  score: number;
}

const OVERLAY_RED = { red: 229, green: 57, blue: 53 } as const;
const MAX_COLOR_CHANNEL_DISTANCE = 48;
const MAX_MATCH_SCORE = 62;
const MAX_CONTEXT_MATCH_SCORE = 68;
const MAX_FEATURE_SAMPLES = 40;
const MAX_CONTEXT_FEATURE_SAMPLES = 64;
const MIN_FEATURE_SAMPLES = 8;
const OUTSIDE_MASK = { red: 19, green: 34, blue: 56, alpha: 0.12 } as const;

export async function inferLegacySelectionGeometry(
  originalDataUrl: string,
  contextDataUrl: string,
): Promise<InferredSelectionGeometry | null> {
  if (originalDataUrl === contextDataUrl) {
    return null;
  }

  const [original, context] = await Promise.all([
    loadRasterImage(originalDataUrl),
    loadRasterImage(contextDataUrl),
  ]);

  if (
    original.width < 16
    || original.height < 16
    || context.width > original.width
    || context.height > original.height
  ) {
    return null;
  }

  const highlight = detectHighlightRect(context);
  if (highlight === null) {
    return null;
  }

  if (context.width === original.width && context.height === original.height) {
    return {
      rect: clampPixelRect(highlight, original.width, original.height),
      viewport: {
        width: original.width,
        height: original.height,
        devicePixelRatio: 1,
      },
    };
  }

  const contextSamples = collectContextFeatureSamples(context, highlight);
  if (contextSamples.length >= MIN_FEATURE_SAMPLES) {
    const contextMatch = findTemplateMatch(original, {
      x: 0,
      y: 0,
      width: context.width,
      height: context.height,
    }, contextSamples);
    if (contextMatch !== null && contextMatch.score <= MAX_CONTEXT_MATCH_SCORE) {
      return {
        rect: clampPixelRect({
          x: contextMatch.x + highlight.x,
          y: contextMatch.y + highlight.y,
          width: highlight.width,
          height: highlight.height,
        }, original.width, original.height),
        viewport: {
          width: original.width,
          height: original.height,
          devicePixelRatio: 1,
        },
      };
    }
  }

  const inset = Math.max(4, Math.min(12, Math.round(Math.min(highlight.width, highlight.height) * 0.12)));
  const template = {
    x: highlight.x + inset,
    y: highlight.y + inset,
    width: highlight.width - inset * 2,
    height: highlight.height - inset * 2,
  };
  if (template.width < 4 || template.height < 4) {
    return null;
  }

  const samples = collectFeatureSamples(context, template);
  if (samples.length < MIN_FEATURE_SAMPLES) {
    return null;
  }

  const match = findTemplateMatch(original, template, samples);
  if (match === null || match.score > MAX_MATCH_SCORE) {
    return null;
  }

  const rect = clampPixelRect({
    x: match.x - inset,
    y: match.y - inset,
    width: highlight.width,
    height: highlight.height,
  }, original.width, original.height);

  return {
    rect,
    viewport: {
      width: original.width,
      height: original.height,
      devicePixelRatio: 1,
    },
  };
}

async function loadRasterImage(dataUrl: string): Promise<RasterImage> {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const element = new Image();
    element.onload = () => resolve(element);
    element.onerror = () => reject(new Error('No se pudo analizar una captura historica.'));
    element.src = dataUrl;
  });
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (context === null) {
    throw new Error('No se pudo analizar la geometria de la captura.');
  }

  context.drawImage(image, 0, 0);
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  canvas.width = 1;
  canvas.height = 1;
  return { width: imageData.width, height: imageData.height, data: imageData.data };
}

function detectHighlightRect(image: RasterImage): PixelRect | null {
  const pixelCount = image.width * image.height;
  const redMask = new Uint8Array(pixelCount);
  for (let index = 0; index < pixelCount; index += 1) {
    const offset = index * 4;
    const red = image.data[offset] ?? 0;
    const green = image.data[offset + 1] ?? 0;
    const blue = image.data[offset + 2] ?? 0;
    if (isOverlayRed(red, green, blue)) {
      redMask[index] = 1;
    }
  }

  const visited = new Uint8Array(pixelCount);
  let bestRect: PixelRect | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (let start = 0; start < pixelCount; start += 1) {
    if (redMask[start] !== 1 || visited[start] === 1) {
      continue;
    }

    const stack = [start];
    visited[start] = 1;
    let componentSize = 0;
    let colorDistance = 0;
    let minimumX = image.width;
    let minimumY = image.height;
    let maximumX = 0;
    let maximumY = 0;

    while (stack.length > 0) {
      const index = stack.pop()!;
      const y = Math.floor(index / image.width);
      const x = index - y * image.width;
      const offset = index * 4;
      componentSize += 1;
      colorDistance += getOverlayColorDistance(
        image.data[offset] ?? 0,
        image.data[offset + 1] ?? 0,
        image.data[offset + 2] ?? 0,
      );
      minimumX = Math.min(minimumX, x);
      minimumY = Math.min(minimumY, y);
      maximumX = Math.max(maximumX, x);
      maximumY = Math.max(maximumY, y);

      visitConnectedPixel(index - 1, x > 0, redMask, visited, stack);
      visitConnectedPixel(index + 1, x + 1 < image.width, redMask, visited, stack);
      visitConnectedPixel(index - image.width, y > 0, redMask, visited, stack);
      visitConnectedPixel(index + image.width, y + 1 < image.height, redMask, visited, stack);
    }

    const rect = {
      x: minimumX,
      y: minimumY,
      width: maximumX - minimumX + 1,
      height: maximumY - minimumY + 1,
    };
    if (!isHighlightCandidate(rect, componentSize, image)) {
      continue;
    }

    const edgeCoverage = getEdgeCoverage(redMask, image.width, rect);
    const minimumEdgeCoverage = Math.min(...edgeCoverage);
    if (minimumEdgeCoverage < 0.34) {
      continue;
    }

    const averageEdgeCoverage = edgeCoverage.reduce((total, value) => total + value, 0) / edgeCoverage.length;
    const perimeterDensity = componentSize / Math.max(1, (rect.width + rect.height) * 2);
    const averageColorDistance = colorDistance / componentSize;
    const score = minimumEdgeCoverage * 5
      + averageEdgeCoverage * 2
      + Math.min(3, perimeterDensity)
      - averageColorDistance / 90;

    if (score > bestScore) {
      bestScore = score;
      bestRect = rect;
    }
  }

  return bestRect;
}

function visitConnectedPixel(
  index: number,
  insideImage: boolean,
  mask: Uint8Array,
  visited: Uint8Array,
  stack: number[],
): void {
  if (!insideImage || mask[index] !== 1 || visited[index] === 1) {
    return;
  }
  visited[index] = 1;
  stack.push(index);
}

function isOverlayRed(red: number, green: number, blue: number): boolean {
  return Math.abs(red - OVERLAY_RED.red) <= MAX_COLOR_CHANNEL_DISTANCE
    && Math.abs(green - OVERLAY_RED.green) <= MAX_COLOR_CHANNEL_DISTANCE
    && Math.abs(blue - OVERLAY_RED.blue) <= MAX_COLOR_CHANNEL_DISTANCE
    && red - green >= 70
    && red - blue >= 70;
}

function getOverlayColorDistance(red: number, green: number, blue: number): number {
  return Math.abs(red - OVERLAY_RED.red)
    + Math.abs(green - OVERLAY_RED.green)
    + Math.abs(blue - OVERLAY_RED.blue);
}

function isHighlightCandidate(rect: PixelRect, componentSize: number, image: RasterImage): boolean {
  const touchesImageEdge = rect.x <= 1
    || rect.y <= 1
    || rect.x + rect.width >= image.width - 1
    || rect.y + rect.height >= image.height - 1;
  const isLargeClippedSelection = rect.width >= image.width * 0.5
    && rect.height >= image.height * 0.5;

  return (!touchesImageEdge || isLargeClippedSelection)
    && rect.width >= 8
    && rect.height >= 8
    && componentSize >= Math.max(16, Math.min(rect.width, rect.height) * 2);
}

function getEdgeCoverage(mask: Uint8Array, imageWidth: number, rect: PixelRect): number[] {
  const band = Math.max(2, Math.min(6, Math.round(Math.min(rect.width, rect.height) * 0.08)));
  let top = 0;
  let bottom = 0;
  let left = 0;
  let right = 0;

  for (let x = rect.x; x < rect.x + rect.width; x += 1) {
    if (hasRedPixelInVerticalBand(mask, imageWidth, x, rect.y, band)) {
      top += 1;
    }
    if (hasRedPixelInVerticalBand(mask, imageWidth, x, rect.y + rect.height - band, band)) {
      bottom += 1;
    }
  }
  for (let y = rect.y; y < rect.y + rect.height; y += 1) {
    if (hasRedPixelInHorizontalBand(mask, imageWidth, rect.x, y, band)) {
      left += 1;
    }
    if (hasRedPixelInHorizontalBand(mask, imageWidth, rect.x + rect.width - band, y, band)) {
      right += 1;
    }
  }

  return [
    top / rect.width,
    bottom / rect.width,
    left / rect.height,
    right / rect.height,
  ];
}

function hasRedPixelInVerticalBand(
  mask: Uint8Array,
  imageWidth: number,
  x: number,
  startY: number,
  length: number,
): boolean {
  for (let offset = 0; offset < length; offset += 1) {
    if (mask[(startY + offset) * imageWidth + x] === 1) {
      return true;
    }
  }
  return false;
}

function hasRedPixelInHorizontalBand(
  mask: Uint8Array,
  imageWidth: number,
  startX: number,
  y: number,
  length: number,
): boolean {
  for (let offset = 0; offset < length; offset += 1) {
    if (mask[y * imageWidth + startX + offset] === 1) {
      return true;
    }
  }
  return false;
}

function collectFeatureSamples(image: RasterImage, template: PixelRect): FeatureSample[] {
  const candidates: FeatureSample[] = [];
  const step = Math.max(1, Math.floor(Math.min(template.width, template.height) / 32));

  for (let y = template.y + 1; y < template.y + template.height - 1; y += step) {
    for (let x = template.x + 1; x < template.x + template.width - 1; x += step) {
      const strength = getGradientStrength(image, x, y);
      if (strength < 24) {
        continue;
      }
      const offset = (y * image.width + x) * 4;
      candidates.push({
        x: x - template.x,
        y: y - template.y,
        red: image.data[offset] ?? 0,
        green: image.data[offset + 1] ?? 0,
        blue: image.data[offset + 2] ?? 0,
        strength,
      });
    }
  }

  candidates.sort((left, right) => right.strength - left.strength);
  const selected: FeatureSample[] = [];
  const minimumSpacing = Math.max(2, Math.round(Math.min(template.width, template.height) / 18));
  for (const candidate of candidates) {
    if (selected.every((sample) => (
      (sample.x - candidate.x) ** 2 + (sample.y - candidate.y) ** 2 >= minimumSpacing ** 2
    ))) {
      selected.push(candidate);
    }
    if (selected.length >= MAX_FEATURE_SAMPLES) {
      break;
    }
  }

  return selected;
}

function collectContextFeatureSamples(image: RasterImage, highlight: PixelRect): FeatureSample[] {
  const candidates: FeatureSample[] = [];
  const step = Math.max(1, Math.floor(Math.min(image.width, image.height) / 96));
  const exclusionPadding = 12;

  for (let y = 2; y < image.height - 2; y += step) {
    for (let x = 2; x < image.width - 2; x += step) {
      if (
        x >= highlight.x - exclusionPadding
        && x <= highlight.x + highlight.width + exclusionPadding
        && y >= highlight.y - exclusionPadding
        && y <= highlight.y + highlight.height + exclusionPadding
      ) {
        continue;
      }

      const strength = getGradientStrength(image, x, y);
      if (strength < 24) {
        continue;
      }
      const offset = (y * image.width + x) * 4;
      candidates.push({
        x,
        y,
        red: reverseOutsideMask(image.data[offset] ?? 0, OUTSIDE_MASK.red),
        green: reverseOutsideMask(image.data[offset + 1] ?? 0, OUTSIDE_MASK.green),
        blue: reverseOutsideMask(image.data[offset + 2] ?? 0, OUTSIDE_MASK.blue),
        strength,
      });
    }
  }

  candidates.sort((left, right) => right.strength - left.strength);
  const selected: FeatureSample[] = [];
  const minimumSpacing = Math.max(4, Math.round(Math.min(image.width, image.height) / 48));
  for (const candidate of candidates) {
    if (selected.every((sample) => (
      (sample.x - candidate.x) ** 2 + (sample.y - candidate.y) ** 2 >= minimumSpacing ** 2
    ))) {
      selected.push(candidate);
    }
    if (selected.length >= MAX_CONTEXT_FEATURE_SAMPLES) {
      break;
    }
  }

  return selected;
}

function reverseOutsideMask(value: number, maskValue: number): number {
  return Math.max(0, Math.min(255, (
    value - maskValue * OUTSIDE_MASK.alpha
  ) / (1 - OUTSIDE_MASK.alpha)));
}

function getGradientStrength(image: RasterImage, x: number, y: number): number {
  const left = (y * image.width + x - 1) * 4;
  const right = (y * image.width + x + 1) * 4;
  const top = ((y - 1) * image.width + x) * 4;
  const bottom = ((y + 1) * image.width + x) * 4;
  let strength = 0;
  for (let channel = 0; channel < 3; channel += 1) {
    strength += Math.abs((image.data[right + channel] ?? 0) - (image.data[left + channel] ?? 0));
    strength += Math.abs((image.data[bottom + channel] ?? 0) - (image.data[top + channel] ?? 0));
  }
  return strength;
}

function findTemplateMatch(
  original: RasterImage,
  template: PixelRect,
  samples: FeatureSample[],
): MatchCandidate | null {
  const maximumX = original.width - template.width;
  const maximumY = original.height - template.height;
  if (maximumX < 0 || maximumY < 0) {
    return null;
  }

  const coarseSamples = samples.slice(0, Math.min(48, samples.length));
  const coarseCandidates: MatchCandidate[] = [];
  const coarseStride = original.width * original.height > 1_000_000 ? 2 : 1;

  for (let y = 0; y <= maximumY; y += coarseStride) {
    for (let x = 0; x <= maximumX; x += coarseStride) {
      const score = calculateMatchScore(original, x, y, coarseSamples);
      addBestCandidate(coarseCandidates, { x, y, score }, 48);
    }
  }

  const refinedCandidates: MatchCandidate[] = [];
  const visited = new Set<string>();
  for (const candidate of coarseCandidates) {
    for (let y = Math.max(0, candidate.y - coarseStride * 2); y <= Math.min(maximumY, candidate.y + coarseStride * 2); y += 1) {
      for (let x = Math.max(0, candidate.x - coarseStride * 2); x <= Math.min(maximumX, candidate.x + coarseStride * 2); x += 1) {
        const key = `${x}:${y}`;
        if (visited.has(key)) {
          continue;
        }
        visited.add(key);
        addBestCandidate(refinedCandidates, {
          x,
          y,
          score: calculateMatchScore(original, x, y, samples),
        }, 4);
      }
    }
  }

  return refinedCandidates[0] ?? null;
}

function calculateMatchScore(
  original: RasterImage,
  originX: number,
  originY: number,
  samples: FeatureSample[],
): number {
  let total = 0;
  for (const sample of samples) {
    const offset = ((originY + sample.y) * original.width + originX + sample.x) * 4;
    total += Math.abs((original.data[offset] ?? 0) - sample.red);
    total += Math.abs((original.data[offset + 1] ?? 0) - sample.green);
    total += Math.abs((original.data[offset + 2] ?? 0) - sample.blue);
  }
  return total / (samples.length * 3);
}

function addBestCandidate(
  candidates: MatchCandidate[],
  candidate: MatchCandidate,
  maximumCandidates: number,
): void {
  const insertionIndex = candidates.findIndex((current) => candidate.score < current.score);
  if (insertionIndex === -1) {
    if (candidates.length < maximumCandidates) {
      candidates.push(candidate);
    }
    return;
  }

  candidates.splice(insertionIndex, 0, candidate);
  if (candidates.length > maximumCandidates) {
    candidates.pop();
  }
}

function clampPixelRect(rect: PixelRect, imageWidth: number, imageHeight: number): SelectionRect {
  const x = Math.max(0, Math.min(imageWidth - 1, Math.round(rect.x)));
  const y = Math.max(0, Math.min(imageHeight - 1, Math.round(rect.y)));
  const right = Math.max(x + 1, Math.min(imageWidth, Math.round(rect.x + rect.width)));
  const bottom = Math.max(y + 1, Math.min(imageHeight, Math.round(rect.y + rect.height)));
  return { x, y, width: right - x, height: bottom - y };
}
