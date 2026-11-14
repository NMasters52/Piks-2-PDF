// Pure PDF layout + naming logic.
// OWNED BY: images/PDF agent (pdf half). Keep exported signatures identical.
//
// PDF contract (agreed, see playbook):
// - US Letter portrait 612x792 pt, 2x2 grid = 4 photos/page, 50 photos → 13 pages.
// - Header: optional job/lot ID + walk creation date (device local timezone).
//   Footer: "page X of Y".
// - Photos numbered consecutively in queue order (order field, 1-based).
// - Fit without stretching or cropping; notes area must fit the FULL 200-char
//   note (wrapped, long unbroken words wrapped, missing notes blank).
// - Text path must support real user text (punctuation, accented characters):
//   register the bundled Unicode font (src/assets/fonts/DejaVuSans.ttf) with
//   @pdf-lib/fontkit, embed with subsetting. Never silently drop characters.
// - Partial final page is valid; empty walk must not be exported (caller gates).

import type { PdfRenderRequest } from '../../types/walk';

export const PAGE_WIDTH_PT = 612;
export const PAGE_HEIGHT_PT = 792;
export const PHOTOS_PER_PAGE = 4;
export const GRID_COLS = 2;
export const GRID_ROWS = 2;
export const MARGIN_PT = 36;
export const HEADER_HEIGHT_PT = 48;
export const FOOTER_HEIGHT_PT = 30;
export const TILE_GAP_PT = 12;

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

/** FOUNDATION STUB — pdf agent implements the full renderer here. This pure
 *  function is what the worker calls; keep the signature identical and make
 *  it testable WITHOUT a real Worker (import directly in tests). Report
 *  progress via `onProgress` per photo/page. Must work offline: no network. */
export function renderPdfBytes(
  _request: PdfRenderRequest,
  _onProgress?: (info: { photosDone: number; totalPhotos: number }) => void,
): Promise<{ bytes: Uint8Array; filename: string }> {
  return Promise.reject(
    new Error('NOT IMPLEMENTED: renderPdfBytes is the pdf agent’s task (src/lib/pdf/layout.ts).'),
  );
}
