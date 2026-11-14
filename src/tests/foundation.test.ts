// Foundation contract tests — prove the shared pure helpers before delegates
// build on them. Owners may extend their own test files; these must keep passing.
import { describe, expect, it } from 'vitest';
import {
  MAX_NOTE_CHARS,
  MAX_PHOTOS,
  canAcceptSelection,
  remainingPhotoCapacity,
  type PdfRenderDone,
  type PdfRenderError,
  type PdfRenderProgress,
  type PdfWorkerOutgoing,
} from '../types/walk';
import { buildPdfFilename, pageCount, pdfDateString, sanitizeJobIdSegment } from '../lib/pdf/layout';
import { scaledDimensions } from '../lib/images';

// Local-noon on 2026-11-14 so the test passes in any timezone.
const TS = new Date(2026, 10, 14, 12, 0, 0).getTime();

describe('pdf filename', () => {
  it('includes a sanitized job id segment', () => {
    expect(buildPdfFilename('J-12', TS)).toBe('Cabinet-Walk_J-12_2026-11-14.pdf');
  });

  it('omits the segment for a blank id', () => {
    expect(buildPdfFilename('', TS)).toBe('Cabinet-Walk_2026-11-14.pdf');
  });

  it('sanitizes unsafe characters', () => {
    expect(buildPdfFilename('a/b\\c:d*?', TS)).toBe('Cabinet-Walk_a-b-c-d_2026-11-14.pdf');
  });

  it('omits the segment when sanitizing empties the id', () => {
    expect(buildPdfFilename('///', TS)).toBe('Cabinet-Walk_2026-11-14.pdf');
    expect(sanitizeJobIdSegment('///')).toBe('');
  });

  it('formats the local date', () => {
    expect(pdfDateString(TS)).toBe('2026-11-14');
  });
});

describe('pagination', () => {
  it.each([
    [1, 1],
    [4, 1],
    [5, 2],
    [20, 5],
    [40, 10],
    [50, 13],
  ])('%i photos → %i pages', (photos, pages) => {
    expect(pageCount(photos)).toBe(pages);
  });
});

describe('capacity', () => {
  it('computes remaining capacity', () => {
    expect(remainingPhotoCapacity(45)).toBe(5);
    expect(remainingPhotoCapacity(50)).toBe(0);
    expect(remainingPhotoCapacity(51)).toBe(0);
  });

  it('rejects a full selection over remaining capacity', () => {
    expect(canAcceptSelection(10, 45, 0)).toBe(false);
    expect(canAcceptSelection(5, 45, 0)).toBe(true);
  });

  it('reserves capacity for in-flight imports (repeated taps)', () => {
    expect(canAcceptSelection(1, 49, 1)).toBe(false);
    expect(canAcceptSelection(1, 49, 0)).toBe(true);
  });

  it('caps are the agreed contract values', () => {
    expect(MAX_PHOTOS).toBe(50);
    expect(MAX_NOTE_CHARS).toBe(200);
  });
});

describe('image scaling math', () => {
  it('downscales the long edge', () => {
    expect(scaledDimensions(4000, 3000)).toEqual({ width: 1600, height: 1200 });
    expect(scaledDimensions(3200, 1600)).toEqual({ width: 1600, height: 800 });
  });

  it('never upscales', () => {
    expect(scaledDimensions(800, 600)).toEqual({ width: 800, height: 600 });
    expect(scaledDimensions(1200, 1600)).toEqual({ width: 1200, height: 1600 });
  });
});

describe('worker message types compile', () => {
  it('discriminates the union', () => {
    const msgs: PdfWorkerOutgoing[] = [
      { type: 'progress', photosDone: 1, totalPhotos: 4 } satisfies PdfRenderProgress,
      { type: 'done', bytes: new ArrayBuffer(8), filename: 'Cabinet-Walk_2026-11-14.pdf' } satisfies PdfRenderDone,
      { type: 'error', code: 'render', message: 'x' } satisfies PdfRenderError,
    ];
    expect(msgs).toHaveLength(3);
  });
});
