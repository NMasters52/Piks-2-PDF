// Pure PDF layout + naming logic.
// OWNED BY: images/PDF agent (pdf half). Keep exported signatures identical.

import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, PDFFont, PDFPage, RGB, rgb } from 'pdf-lib';
import type { PdfRenderRequest } from '../../types/walk';
import { MAX_NOTE_CHARS } from '../../types/walk';

export const PAGE_WIDTH_PT = 612;
export const PAGE_HEIGHT_PT = 792;
export const PHOTOS_PER_PAGE = 4;
export const GRID_COLS = 2;
export const GRID_ROWS = 2;
export const MARGIN_PT = 36;
export const HEADER_HEIGHT_PT = 48;
export const FOOTER_HEIGHT_PT = 30;
export const TILE_GAP_PT = 12;

export const NOTE_FONT_SIZE = 8;
export const NOTE_LINE_HEIGHT = 10;
export const NUMBER_FONT_SIZE = 10;
export const HEADER_FONT_SIZE = 11;
export const FOOTER_FONT_SIZE = 9;
export const TILE_PADDING_PT = 4;

const HEADER_TEXT_COLOR: RGB = rgb(0, 0, 0);
const FOOTER_TEXT_COLOR: RGB = rgb(0.25, 0.25, 0.25);

/** Pages produced for a photo count: Math.ceil(n / PHOTOS_PER_PAGE). */
export function pageCount(photoCount: number): number {
  return Math.max(1, Math.ceil(photoCount / PHOTOS_PER_PAGE));
}

/** Local-calendar date (YYYY-MM-DD) in the device timezone. */
export function pdfDateString(createdAt: number): string {
  const d = new Date(createdAt);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Keep filesystem-safe characters; runs of anything else become one '-';
 *  trim; cap at 60 chars. An empty result uses the filename fallback. */
export function sanitizeJobIdSegment(jobId: string): string {
  const cleaned = jobId
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 60)
    .replace(/[-.]+$/g, '');
  return cleaned;
}

/** Use the sanitized Job/Lot ID when available, otherwise the local creation date and time. */
export function buildPdfFilename(jobId: string, createdAt: number): string {
  const segment = sanitizeJobIdSegment(jobId);
  if (segment) return `${segment}.pdf`;

  const date = new Date(createdAt);
  const hours = date.getHours();
  const hour = hours % 12 || 12;
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  const period = hours < 12 ? 'AM' : 'PM';
  return `Field-Walk_${pdfDateString(createdAt)}_${hour}.${minutes}.${seconds} ${period}.pdf`;
}

export const GRID_WIDTH_PT = PAGE_WIDTH_PT - MARGIN_PT * 2;
export const GRID_HEIGHT_PT =
  PAGE_HEIGHT_PT - MARGIN_PT * 2 - HEADER_HEIGHT_PT - FOOTER_HEIGHT_PT;
export const TILE_WIDTH_PT = (GRID_WIDTH_PT - TILE_GAP_PT) / GRID_COLS;
export const TILE_HEIGHT_PT = (GRID_HEIGHT_PT - TILE_GAP_PT) / GRID_ROWS;
export const NOTE_MAX_WIDTH_PT = TILE_WIDTH_PT - TILE_PADDING_PT * 2;

const WORST_CASE_NOTE = 'W'.repeat(MAX_NOTE_CHARS);

function tileOrigin(col: number, row: number): { x: number; yBottom: number; yTop: number } {
  const x = MARGIN_PT + col * (TILE_WIDTH_PT + TILE_GAP_PT);
  const yTop = PAGE_HEIGHT_PT - MARGIN_PT - HEADER_HEIGHT_PT - row * (TILE_HEIGHT_PT + TILE_GAP_PT);
  const yBottom = yTop - TILE_HEIGHT_PT;
  return { x, yBottom, yTop };
}

/** Wrap note text to lines at `size`: explicit line breaks are honored as
 *  forced lines, whitespace is measured (never passed through to drawText,
 *  which would apply its own line spacing), and long unbroken tokens are
 *  broken by measured width. Blank segments (e.g. '\n\n') produce empty
 *  lines that still consume vertical space. */
export function wrapNoteLines(
  note: string,
  font: PDFFont,
  maxWidth: number,
  size: number = NOTE_FONT_SIZE,
): string[] {
  if (!note) return [];
  const lines: string[] = [];
  const paragraphs = note.split(/\r\n|\r|\n/);

  const wrapSegment = (segment: string) => {
    const words = segment.split(/(\s+)/);
    let current = '';
    const flush = () => {
      if (current) {
        lines.push(current);
        current = '';
      }
    };
    const breakLongToken = (token: string) => {
      let chunk = '';
      for (const ch of token) {
        const next = chunk + ch;
        if (font.widthOfTextAtSize(next, size) <= maxWidth) {
          chunk = next;
        } else {
          if (chunk) lines.push(chunk);
          chunk = ch;
        }
      }
      if (chunk) lines.push(chunk);
    };
    for (const part of words) {
      if (!part) continue;
      if (/^\s+$/.test(part)) {
        const candidate = current + part;
        if (font.widthOfTextAtSize(candidate, size) <= maxWidth) current = candidate;
        else flush();
        continue;
      }
      const candidate = current ? `${current}${part}` : part;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        current = candidate;
      } else if (!current) {
        breakLongToken(part);
      } else {
        flush();
        if (font.widthOfTextAtSize(part, size) <= maxWidth) current = part;
        else breakLongToken(part);
      }
    }
    flush();
  };

  paragraphs.forEach((segment, index) => {
    if (index > 0) lines.push('');
    if (segment) wrapSegment(segment);
  });
  return lines;
}

export function worstCaseNoteLineCount(font: PDFFont, maxWidth: number = NOTE_MAX_WIDTH_PT): number {
  return wrapNoteLines(WORST_CASE_NOTE, font, maxWidth).length;
}

function fitImageRect(
  imgW: number,
  imgH: number,
  boxW: number,
  boxH: number,
): { drawW: number; drawH: number; offsetX: number; offsetY: number } {
  const scale = Math.min(boxW / imgW, boxH / imgH);
  const drawW = imgW * scale;
  const drawH = imgH * scale;
  return {
    drawW,
    drawH,
    offsetX: (boxW - drawW) / 2,
    offsetY: (boxH - drawH) / 2,
  };
}

function drawHeader(page: PDFPage, font: PDFFont, jobId: string, walkCreatedAt: number) {
  const dateStr = pdfDateString(walkCreatedAt);
  const segment = sanitizeJobIdSegment(jobId);
  const headerText = segment ? `${segment}  ·  ${dateStr}` : dateStr;
  const y = PAGE_HEIGHT_PT - MARGIN_PT - HEADER_FONT_SIZE - 6;
  page.drawText(headerText, {
    x: MARGIN_PT,
    y,
    size: HEADER_FONT_SIZE,
    font,
    color: HEADER_TEXT_COLOR,
  });
}

function drawFooter(page: PDFPage, font: PDFFont, pageIndex: number, pageTotal: number) {
  const text = `page ${pageIndex} of ${pageTotal}`;
  const textWidth = font.widthOfTextAtSize(text, FOOTER_FONT_SIZE);
  const y = MARGIN_PT + 8;
  page.drawText(text, {
    x: (PAGE_WIDTH_PT - textWidth) / 2,
    y,
    size: FOOTER_FONT_SIZE,
    font,
    color: FOOTER_TEXT_COLOR,
  });
}

export const NOTE_MIN_FONT_SIZE = 5;

/** Characters in `texts` without a glyph in the embedded font. Export never
 *  fails on them, but the caller must warn — boxes are not silent. */
function collectGlyphWarnings(
  fkFont: { hasGlyphForCodePoint(codePoint: number): boolean },
  texts: string[],
): string[] {
  const missing = new Set<string>();
  for (const text of texts) {
    for (const ch of text) {
      const codePoint = ch.codePointAt(0)!;
      if (codePoint === 10 || codePoint === 13) continue;
      if (!fkFont.hasGlyphForCodePoint(codePoint)) missing.add(ch);
    }
  }
  if (missing.size === 0) return [];
  return [
    `Characters not covered by the bundled PDF font (they will appear as boxes): ${[...missing].join(' ')}`,
  ];
}

export async function renderPdfBytes(
  request: PdfRenderRequest,
  onProgress?: (info: { photosDone: number; totalPhotos: number }) => void,
): Promise<{ bytes: Uint8Array; filename: string; warnings?: string[] }> {
  const { photos, fontBytes, jobId, walkCreatedAt } = request;
  if (photos.length === 0) {
    throw new Error('Cannot render PDF for an empty photo set');
  }

  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);

  let font: PDFFont;
  try {
    font = await pdfDoc.embedFont(
      fontBytes instanceof Uint8Array ? fontBytes : new Uint8Array(fontBytes),
      { subset: true },
    );
  } catch (cause) {
    throw new Error('Font embedding failed', { cause });
  }

  const fkFont = fontkit.create(
    fontBytes instanceof Uint8Array ? fontBytes : new Uint8Array(fontBytes),
  ) as unknown as { hasGlyphForCodePoint(codePoint: number): boolean };
  const glyphWarnings = collectGlyphWarnings(fkFont, [
    jobId,
    ...photos.map((p) => p.note),
  ]);

  const totalPages = pageCount(photos.length);
  const filename = buildPdfFilename(jobId, walkCreatedAt);
  const numberBand = NUMBER_FONT_SIZE + 6;
  const imageBoxWidth = TILE_WIDTH_PT - TILE_PADDING_PT * 2;
  // Total vertical space the note block may occupy within a tile (below the image).
  const maxNoteBlockHeight = TILE_HEIGHT_PT - numberBand - TILE_PADDING_PT * 2;

  let photosDone = 0;
  const totalPhotos = photos.length;

  for (let pageIdx = 0; pageIdx < totalPages; pageIdx++) {
    const page = pdfDoc.addPage([PAGE_WIDTH_PT, PAGE_HEIGHT_PT]);
    drawHeader(page, font, jobId, walkCreatedAt);
    drawFooter(page, font, pageIdx + 1, totalPages);

    const sliceStart = pageIdx * PHOTOS_PER_PAGE;
    const slice = photos.slice(sliceStart, sliceStart + PHOTOS_PER_PAGE);

    for (let tile = 0; tile < slice.length; tile++) {
      const photo = slice[tile]!;
      const col = tile % GRID_COLS;
      const row = Math.floor(tile / GRID_COLS);
      const { x, yBottom, yTop } = tileOrigin(col, row);

      const numberY = yTop - TILE_PADDING_PT - NUMBER_FONT_SIZE;
      page.drawText(String(photo.order), {
        x: x + TILE_PADDING_PT,
        y: numberY,
        size: NUMBER_FONT_SIZE,
        font,
        color: HEADER_TEXT_COLOR,
      });

      // --- note fit (per photo): measured wrap honoring explicit breaks,
      // shrinking so the WHOLE note stays inside its tile, never clipped. ---
      let noteSize = NOTE_FONT_SIZE;
      let noteLineHeight = NOTE_LINE_HEIGHT;
      let noteLines = wrapNoteLines(photo.note, font, NOTE_MAX_WIDTH_PT, noteSize);
      while (
        noteLines.length > 0 &&
        noteLines.length * noteLineHeight > maxNoteBlockHeight &&
        noteSize > NOTE_MIN_FONT_SIZE
      ) {
        noteSize = Math.max(NOTE_MIN_FONT_SIZE, noteSize - 0.5);
        noteLineHeight = noteSize * 1.25;
        noteLines = wrapNoteLines(photo.note, font, NOTE_MAX_WIDTH_PT, noteSize);
      }
      let noteOverflow = false;
      if (noteLines.length > 0 && noteLines.length * noteLineHeight > maxNoteBlockHeight) {
        // Physically unplaceable at the floor size (pathological notes, e.g.
        // many forced breaks): compress spacing to stay on-page and mark the
        // note visibly. Never silently drop text.
        noteLineHeight = Math.max(2, maxNoteBlockHeight / noteLines.length);
        noteOverflow = noteLineHeight < noteSize * 0.8;
      }
      const noteBlockHeight = noteLines.length * noteLineHeight + TILE_PADDING_PT;

      // --- image: all remaining tile height above the note block, centered ---
      const jpg = await pdfDoc.embedJpg(photo.jpegBytes);
      const photoImageBoxHeight = Math.max(
        20,
        yTop - numberBand - TILE_PADDING_PT - (yBottom + noteBlockHeight + TILE_PADDING_PT),
      );
      const { drawW, drawH, offsetX, offsetY } = fitImageRect(
        photo.width,
        photo.height,
        imageBoxWidth,
        photoImageBoxHeight,
      );
      page.drawImage(jpg, {
        x: x + TILE_PADDING_PT + offsetX,
        y: yBottom + noteBlockHeight + TILE_PADDING_PT + offsetY,
        width: drawW,
        height: drawH,
      });

      // --- note: baselines top-down so wrapped lines read in order ---
      const noteBlockTop = yBottom + noteBlockHeight - TILE_PADDING_PT;
      for (let i = 0; i < noteLines.length; i++) {
        const line = noteLines[i]!;
        if (!line) continue;
        page.drawText(line, {
          x: x + TILE_PADDING_PT,
          y: noteBlockTop - noteSize - i * noteLineHeight,
          size: noteSize,
          font,
          color: HEADER_TEXT_COLOR,
        });
      }
      if (noteOverflow) {
        page.drawText('[Note did not fully fit in the photo tile]', {
          x: x + TILE_PADDING_PT,
          y: yBottom + TILE_PADDING_PT,
          size: noteSize,
          font,
          color: HEADER_TEXT_COLOR,
        });
      }

      photosDone++;
      onProgress?.({ photosDone, totalPhotos });
    }
  }

  const bytes = await pdfDoc.save();
  return { bytes, filename, warnings: glyphWarnings.length > 0 ? glyphWarnings : undefined };
}