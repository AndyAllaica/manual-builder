export interface TextMeasurer {
  widthOfTextAtSize(text: string, size: number): number;
}

export interface FittedText {
  lines: string[];
  fontSize: number;
  truncated: boolean;
}

export function normalizeWhitespace(value: unknown): string {
  return typeof value === 'string'
    ? value.replace(/\r\n?/g, '\n').replace(/[\t ]+/g, ' ').replace(/ *\n */g, '\n').trim()
    : '';
}

export function splitLongWord(
  word: string,
  font: TextMeasurer,
  fontSize: number,
  maxWidth: number,
): string[] {
  if (font.widthOfTextAtSize(word, fontSize) <= maxWidth) {
    return [word];
  }

  const parts: string[] = [];
  let part = '';

  for (const character of Array.from(word)) {
    const candidate = part + character;
    if (part.length > 0 && font.widthOfTextAtSize(candidate, fontSize) > maxWidth) {
      parts.push(part);
      part = character;
    } else {
      part = candidate;
    }
  }

  if (part.length > 0) {
    parts.push(part);
  }

  return parts;
}

export function wrapText(
  value: string,
  font: TextMeasurer,
  fontSize: number,
  maxWidth: number,
): string[] {
  const normalized = normalizeWhitespace(value);
  if (normalized.length === 0) {
    return [];
  }

  const lines: string[] = [];
  for (const paragraph of normalized.split('\n')) {
    const words = paragraph.split(' ').flatMap((word) => splitLongWord(word, font, fontSize, maxWidth));
    let line = '';

    for (const word of words) {
      const candidate = line.length === 0 ? word : `${line} ${word}`;
      if (line.length > 0 && font.widthOfTextAtSize(candidate, fontSize) > maxWidth) {
        lines.push(line);
        line = word;
      } else {
        line = candidate;
      }
    }

    if (line.length > 0) {
      lines.push(line);
    }
  }

  return lines;
}

export function truncateText(value: string, maxLength: number): string {
  const normalized = normalizeWhitespace(value).replace(/\n/g, ' ');
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

export function fitTextInBox(input: {
  text: string;
  font: TextMeasurer;
  maxWidth: number;
  maxHeight: number;
  preferredFontSize: number;
  minimumFontSize: number;
  lineHeightRatio?: number;
  maxLines?: number;
}): FittedText {
  const lineHeightRatio = input.lineHeightRatio ?? 1.25;
  for (let fontSize = input.preferredFontSize; fontSize >= input.minimumFontSize; fontSize -= 0.5) {
    const lines = wrapText(input.text, input.font, fontSize, input.maxWidth);
    const heightLimit = Math.max(1, Math.floor(input.maxHeight / (fontSize * lineHeightRatio)));
    const maxLines = Math.min(input.maxLines ?? Number.POSITIVE_INFINITY, heightLimit);
    if (lines.length <= maxLines) {
      return { lines, fontSize, truncated: false };
    }
  }

  const fontSize = input.minimumFontSize;
  const lines = wrapText(input.text, input.font, fontSize, input.maxWidth);
  const heightLimit = Math.max(1, Math.floor(input.maxHeight / (fontSize * lineHeightRatio)));
  const maxLines = Math.min(input.maxLines ?? Number.POSITIVE_INFINITY, heightLimit);
  const visibleLines = lines.slice(0, maxLines);

  if (visibleLines.length > 0 && lines.length > visibleLines.length) {
    const lastIndex = visibleLines.length - 1;
    const lastLine = visibleLines[lastIndex] ?? '';
    visibleLines[lastIndex] = fitEllipsis(lastLine, input.font, fontSize, input.maxWidth);
  }

  return { lines: visibleLines, fontSize, truncated: lines.length > visibleLines.length };
}

export function sanitizeForStandardPdfFont(value: string): string {
  return value
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/[^\u000A\u000D\u0020-\u007E\u00A0-\u00FF\u20AC]/g, '?');
}

export function sanitizePdfFileName(value: string): string {
  const baseName = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, ' ')
    .replace(/\.pdf\s*$/i, '')
    .toLowerCase()
    .replace(/[^a-z0-9._ -]+/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[.-]+|[.-]+$/g, '')
    .slice(0, 120);

  return `${baseName || 'manual-de-usuario'}.pdf`;
}

function fitEllipsis(text: string, font: TextMeasurer, fontSize: number, maxWidth: number): string {
  let candidate = text.trimEnd();
  while (candidate.length > 0 && font.widthOfTextAtSize(`${candidate}...`, fontSize) > maxWidth) {
    candidate = candidate.slice(0, -1).trimEnd();
  }
  return `${candidate}...`;
}
