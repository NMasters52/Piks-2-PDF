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
 *  trim; cap at 60 chars. Empty result means "omit the segment". */
export function sanitizeJobIdSegment(jobId: string): string {
  const cleaned = jobId
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 60)
    .replace(/[-.]+$/g, '');
  return cleaned;
}

/** `Cabinet-Walk_<sanitized-job-id>_<YYYY-MM-DD>.pdf`, omitting the ID segment
 *  when blank. Uses the walk creation date in the local timezone. */
export function buildPdfFilename(jobId: string, createdAt: number): string {
  const segment = sanitizeJobIdSegment(jobId);
  const base = segment ? `Cabinet-Walk_${segment}` : 'Cabinet-Walk';
  return `${base}_${pdfDateString(createdAt)}.pdf`;
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

/** Wrap note text to lines; breaks overlong tokens by measured width. */
export function wrapNoteLines(note: string, font: PDFFont, maxWidth: number): string[] {
  if (!note) return [];
  const lines: string[] = [];
  const words = note.split(/(\s+)/);

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
      if (font.widthOfTextAtSize(next, NOTE_FONT_SIZE) <= maxWidth) {
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
      if (font.widthOfTextAtSize(candidate, NOTE_FONT_SIZE) <= maxWidth) current = candidate;
      else flush();
      continue;
    }
    const candidate = current ? `${current}${part}` : part;
    if (font.widthOfTextAtSize(candidate, NOTE_FONT_SIZE) <= maxWidth) {
      current = candidate;
    } else if (!current) {
      breakLongToken(part);
    } else {
      flush();
      if (font.widthOfTextAtSize(part, NOTE_FONT_SIZE) <= maxWidth) current = part;
      else breakLongToken(part);
    }
  }
  flush();
  return lines;
}

export function worstCaseNoteLineCount(font: PDFFont, maxWidth: number = NOTE_MAX_WIDTH_PT): number {
  return wrapNoteLines(WORST_CASE_NOTE, font, maxWidth).length;
}

function computeNoteReservedHeight(font: PDFFont): number {
  const lines = worstCaseNoteLineCount(font);
  return lines * NOTE_LINE_HEIGHT + TILE_PADDING_PT;
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

export async function renderPdfBytes(
  request: PdfRenderRequest,
  onProgress?: (info: { photosDone: number; totalPhotos: number }) => void,
): Promise<{ bytes: Uint8Array; filename: string }> {
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

  const totalPages = pageCount(photos.length);
  const filename = buildPdfFilename(jobId, walkCreatedAt);
  const noteReserved = computeNoteReservedHeight(font);
  const numberBand = NUMBER_FONT_SIZE + 6;
  const imageBoxHeight = TILE_HEIGHT_PT - noteReserved - numberBand - TILE_PADDING_PT;
  const imageBoxWidth = TILE_WIDTH_PT - TILE_PADDING_PT * 2;

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

      const jpg = await pdfDoc.embedJpg(photo.jpegBytes);
      const imgW = photo.width;
      const imgH = photo.height;
      const { drawW, drawH, offsetX, offsetY } = fitImageRect(
        imgW,
        imgH,
        imageBoxWidth,
        imageBoxHeight,
      );

      const imageBoxBottom = yBottom + noteReserved + TILE_PADDING_PT;
      const drawX = x + TILE_PADDING_PT + offsetX;
      const drawY = imageBoxBottom + offsetY;

      page.drawImage(jpg, {
        x: drawX,
        y: drawY,
        width: drawW,
        height: drawH,
      });

      const noteLines = wrapNoteLines(photo.note, font, NOTE_MAX_WIDTH_PT);
      let noteY = yBottom + TILE_PADDING_PT + (noteReserved - TILE_PADDING_PT - noteLines.length * NOTE_LINE_HEIGHT);
      for (const line of noteLines) {
        page.drawText(line, {
          x: x + TILE_PADDING_PT,
          y: noteY,
          size: NOTE_FONT_SIZE,
          font,
          color: HEADER_TEXT_COLOR,
        });
        noteY += NOTE_LINE_HEIGHT;
      }

      photosDone++;
      onProgress?.({ photosDone, totalPhotos });
    }
  }

  const bytes = await pdfDoc.save();
  return { bytes, filename };
}