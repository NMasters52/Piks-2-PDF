import { describe, expect, it } from 'vitest';
import fontkit from '@pdf-lib/fontkit';
import { PDFDocument } from 'pdf-lib';
import {
  NOTE_MAX_WIDTH_PT,
  pageCount,
  renderPdfBytes,
  wrapNoteLines,
  worstCaseNoteLineCount,
} from './layout';
import { MAX_NOTE_CHARS } from '../../types/walk';
import { loadFontBytes } from './test-assets';

const fontBytes = loadFontBytes();

async function loadFontForWrap() {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  return doc.embedFont(new Uint8Array(fontBytes), { subset: true });
}

describe('wrapNoteLines', () => {
  it('returns no lines for blank notes', async () => {
    const font = await loadFontForWrap();
    expect(wrapNoteLines('', font, NOTE_MAX_WIDTH_PT)).toEqual([]);
  });

  it('wraps a very long unbroken token without truncation', async () => {
    const font = await loadFontForWrap();
    const word = 'x'.repeat(120);
    const lines = wrapNoteLines(word, font, NOTE_MAX_WIDTH_PT);
    expect(lines.join('')).toBe(word);
    expect(lines.length).toBeGreaterThan(1);
  });

  it('fits worst-case 200 characters within reserved line budget', async () => {
    const font = await loadFontForWrap();
    const lines = wrapNoteLines('W'.repeat(MAX_NOTE_CHARS), font, NOTE_MAX_WIDTH_PT);
    expect(lines.join('').length).toBe(MAX_NOTE_CHARS);
    expect(lines.length).toBe(worstCaseNoteLineCount(font));
    expect(lines.length).toBeLessThanOrEqual(25);
  });
});

describe('pageCount', () => {
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

describe('renderPdfBytes integration', () => {
  it('rejects an empty photo list', async () => {
    await expect(
      renderPdfBytes({
        type: 'render',
        jobId: '',
        walkCreatedAt: Date.now(),
        photos: [],
        fontBytes,
      }),
    ).rejects.toThrow(/empty/i);
  });
});