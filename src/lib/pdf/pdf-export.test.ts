// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { getDocument, OPS, type PDFPageProxy } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { renderPdfBytes, buildPdfFilename, pageCount } from '../pdf/layout';
import type { PdfPhotoInput } from '../../types/walk';
import { MAX_NOTE_CHARS } from '../../types/walk';
import { loadFontBytes, loadFixtureBytes } from './test-assets';

const TS = new Date(2026, 10, 14, 12, 0, 0).getTime();
const JOB_ID = 'J-TEST';

const fontBytes = loadFontBytes();
const rawFixtures = loadFixtureBytes();
const fixtures = {
  square: { bytes: rawFixtures.square, width: 32, height: 32 },
  wide: { bytes: rawFixtures.wide, width: 64, height: 32 },
  tall: { bytes: rawFixtures.tall, width: 32, height: 64 },
} as const;

function makePhotos(
  count: number,
  noteForOrder?: (order: number) => string,
): PdfPhotoInput[] {
  const keys = ['wide', 'tall', 'square'] as const;
  return Array.from({ length: count }, (_, i) => {
    const key = keys[i % 3]!;
    const fx = fixtures[key];
    return {
      order: i + 1,
      jpegBytes: fx.bytes,
      width: fx.width,
      height: fx.height,
      note: noteForOrder ? noteForOrder(i + 1) : '',
    };
  });
}

async function loadPdf(bytes: Uint8Array) {
  const loadingTask = getDocument({ data: bytes, useSystemFonts: true, verbosity: 0 });
  return loadingTask.promise;
}

async function pageText(page: PDFPageProxy): Promise<string> {
  const content = await page.getTextContent();
  return content.items
    .map((item) => ('str' in item ? item.str : ''))
    .join('\n');
}

type ImagePaint = { name: string; width: number; height: number; aspect: number };

async function imagePaintsOnPage(page: PDFPageProxy): Promise<ImagePaint[]> {
  const ops = await page.getOperatorList();
  const paints: ImagePaint[] = [];
  for (let i = 0; i < ops.fnArray.length; i++) {
    if (ops.fnArray[i] !== OPS.paintImageXObject) continue;
    const intrinsic = ops.argsArray[i] as [string, number, number];
    let sx = intrinsic[1];
    let sy = intrinsic[2];
    for (let j = i - 1; j >= 0; j--) {
      if (ops.fnArray[j] === OPS.paintImageXObject) break;
      if (ops.fnArray[j] === OPS.transform) {
        const m = ops.argsArray[j] as number[];
        if (m.length >= 6 && m[1] === 0 && m[2] === 0) {
          const a = Math.abs(m[0]!);
          const d = Math.abs(m[3]!);
          if (a > 1.5 || d > 1.5) {
            sx = a;
            sy = d;
            break;
          }
        }
      }
    }
    paints.push({
      name: intrinsic[0],
      width: sx,
      height: sy,
      aspect: sx / sy,
    });
  }
  return paints;
}

async function render(count: number, notes?: (order: number) => string) {
  const photos = makePhotos(count, notes);
  const { bytes } = await renderPdfBytes(
    {
      type: 'render',
      jobId: JOB_ID,
      walkCreatedAt: TS,
      photos,
      fontBytes,
    },
    undefined,
  );
  return loadPdf(bytes);
}

describe('PDF export acceptance', () => {
  it.each([
    [1, 1],
    [4, 1],
    [5, 2],
    [20, 5],
    [40, 10],
    [50, 13],
  ])('%i photos → %i pages', async (count, expectedPages) => {
    expect(pageCount(count)).toBe(expectedPages);
    const pdf = await render(count);
    expect(pdf.numPages).toBe(expectedPages);
  });

  it('includes job id, date, numbering, and footers', async () => {
    const pdf = await render(5);
    const allText: string[] = [];
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      allText.push(await pageText(page));
    }
    const joined = allText.join('\n');
    expect(joined).toContain('J-TEST');
    expect(joined).toContain('2026-11-14');
    for (let n = 1; n <= 5; n++) {
      expect(joined).toContain(String(n));
    }
    expect(joined).toContain('page 1 of 2');
    expect(joined).toContain('page 2 of 2');
  });

  it('omits job id segment in header when blank', async () => {
    const photos = makePhotos(1);
    const { bytes } = await renderPdfBytes({
      type: 'render',
      jobId: '',
      walkCreatedAt: TS,
      photos,
      fontBytes,
    });
    const pdf = await loadPdf(bytes);
    const text = await pageText(await pdf.getPage(1));
    expect(text).toContain('2026-11-14');
    expect(text).not.toContain('J-TEST');
    expect(buildPdfFilename('', TS)).toBe('Cabinet-Walk_2026-11-14.pdf');
  });

  it('renders a full 200-char note with accents and a long word', async () => {
    const longWord = 'Antidisestablishmentarianism';
    const prefix = 'Piñata, façade — ';
    const filler = '·';
    const trimmed = (prefix + longWord + filler.repeat(MAX_NOTE_CHARS)).slice(0, MAX_NOTE_CHARS);
    expect(trimmed.length).toBe(MAX_NOTE_CHARS);

    const pdf = await render(2, (order) => (order === 1 ? trimmed : ''));
    const text = await pageText(await pdf.getPage(1));
    expect(text).toContain('Piñata');
    expect(text).toContain('façade');
    expect(text).toContain(longWord);
    const compact = (s: string) => s.replace(/\s+/g, '');
    expect(compact(text)).toContain(compact(trimmed));
  });

  it('leaves blank note areas without spurious note text', async () => {
    const pdf = await render(4, (order) => (order === 2 ? 'Only on photo 2' : ''));
    const text = await pageText(await pdf.getPage(1));
    expect(text).toContain('Only on photo 2');
    expect(text.indexOf('Only on photo 2')).toBe(text.lastIndexOf('Only on photo 2'));
  });

  it('places four images on full pages preserving aspect ratio', async () => {
    const pdf = await render(4);
    const page = await pdf.getPage(1);
    const paints = await imagePaintsOnPage(page);
    expect(paints).toHaveLength(4);

    const aspects = paints.map((p) => p.aspect).sort((a, b) => a - b);
    expect(aspects[0]).toBeLessThan(1);
    expect(aspects[aspects.length - 1]).toBeGreaterThan(1);
    const near = (a: number, b: number) => Math.abs(a - b) < 0.15;
    expect(near(aspects.find((a) => a < 0.9)!, 32 / 64)).toBe(true);
    expect(near(aspects.find((a) => a > 1.1)!, 64 / 32)).toBe(true);
    expect(near(aspects.find((a) => Math.abs(a - 1) < 0.2)!, 1)).toBe(true);
  });

  it('reports progress per photo', async () => {
    const ticks: number[] = [];
    await renderPdfBytes(
      {
        type: 'render',
        jobId: JOB_ID,
        walkCreatedAt: TS,
        photos: makePhotos(3),
        fontBytes,
      },
      (p) => ticks.push(p.photosDone),
    );
    expect(ticks).toEqual([1, 2, 3]);
  });
});