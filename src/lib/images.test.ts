import { describe, expect, it, vi } from 'vitest';
import { DecodeError, normalizeImageFile, scaledDimensions } from './images';
import { JPEG_QUALITY, MAX_IMAGE_LONG_EDGE } from '../types/walk';
import squareJpeg from '../tests/fixtures/square-red-32.jpg?url';

describe('scaledDimensions', () => {
  it('matches foundation edge cases', () => {
    expect(scaledDimensions(32, 32)).toEqual({ width: 32, height: 32 });
    expect(scaledDimensions(4000, 2000)).toEqual({ width: 1600, height: 800 });
  });
});

describe('normalizeImageFile', () => {
  it('rejects a non-image payload with DecodeError', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn().mockRejectedValue(new Error('decode failed')));
    vi.spyOn(globalThis, 'Image').mockImplementation(function MockBadImage(this: HTMLImageElement) {
      queueMicrotask(() => this.onerror?.(new Event('error')));
      return this;
    } as unknown as typeof Image);
    const bad = new File([new Uint8Array([0, 1, 2])], 'corrupt.bin', { type: 'application/octet-stream' });
    await expect(normalizeImageFile(bad)).rejects.toBeInstanceOf(DecodeError);
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('rejects an empty file with DecodeError', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn().mockRejectedValue(new Error('decode failed')));
    vi.spyOn(globalThis, 'Image').mockImplementation(function MockEmptyImage(this: HTMLImageElement) {
      queueMicrotask(() => this.onerror?.(new Event('error')));
      return this;
    } as unknown as typeof Image);
    const empty = new File([], 'empty.jpg', { type: 'image/jpeg' });
    await expect(normalizeImageFile(empty)).rejects.toBeInstanceOf(DecodeError);
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('decodes a fixture JPEG when createImageBitmap exists', async () => {
    if (typeof createImageBitmap !== 'function') {
      return;
    }
    const res = await fetch(squareJpeg);
    const buf = await res.arrayBuffer();
    const file = new File([buf], 'square-red-32.jpg', { type: 'image/jpeg' });
    const normalized = await normalizeImageFile(file);
    expect(normalized.mimeType).toBe('image/jpeg');
    expect(normalized.width).toBeLessThanOrEqual(MAX_IMAGE_LONG_EDGE);
    expect(normalized.height).toBeLessThanOrEqual(MAX_IMAGE_LONG_EDGE);
    expect(normalized.blob.type).toBe('image/jpeg');
    expect(normalized.blob.size).toBeGreaterThan(0);
  });

  it('uses JPEG_QUALITY when encoding via canvas (mocked decode)', async () => {
    const toBlob = vi.fn((cb: BlobCallback) => {
      cb(new Blob(['jpeg'], { type: 'image/jpeg' }));
    });
    const fakeCanvas = {
      width: 0,
      height: 0,
      getContext: () => ({ drawImage: vi.fn() }),
      toBlob,
    } as unknown as HTMLCanvasElement;

    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'canvas') return fakeCanvas;
      return document.createElement(tag);
    });

    const bitmap = {
      width: 3200,
      height: 1600,
      close: vi.fn(),
    } as unknown as ImageBitmap;

    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(bitmap));

    const file = new File([new Uint8Array([0xff, 0xd8])], 'wide.jpg', { type: 'image/jpeg' });
    const result = await normalizeImageFile(file);
    expect(result.width).toBe(1600);
    expect(result.height).toBe(800);
    expect(toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/jpeg', JPEG_QUALITY);
    expect(bitmap.close).toHaveBeenCalled();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });
});