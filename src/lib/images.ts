// Image normalization (decode → orientation → resize → JPEG).
// OWNED BY: images/PDF agent (images half). Keep exported signatures identical.
//
// Required semantics (pik-2-pdf-playbook.md, "Images and export"):
// - Accept JPEG and PNG imports; must handle HEIC-origin iPad photos — verify
//   real behavior, do not infer from filename or accept attribute.
// - Apply EXIF orientation so photos are upright; preserve aspect ratio; no upscaling.
// - Downscale so the long edge is <= MAX_IMAGE_LONG_EDGE; encode JPEG at
//   JPEG_QUALITY (see types/walk.ts).
// - Release decoded bitmaps, canvases, and object URLs before resolving.
// - NEVER call inside a database transaction (caller serializes).
// - Unsupported/corrupt files throw DecodeError; callers keep siblings.

import { JPEG_QUALITY, MAX_IMAGE_LONG_EDGE } from '../types/walk';

export class DecodeError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'DecodeError';
  }
}

export type NormalizedImage = {
  blob: Blob;
  mimeType: 'image/jpeg';
  width: number;
  height: number;
};

/** Pure, testable: target dimensions preserving aspect ratio without upscaling. */
export function scaledDimensions(
  width: number,
  height: number,
  maxLongEdge: number = MAX_IMAGE_LONG_EDGE,
): { width: number; height: number } {
  const longEdge = Math.max(width, height);
  if (longEdge <= maxLongEdge) return { width, height };
  const scale = maxLongEdge / longEdge;
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

function canvasToJpegBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new DecodeError('Failed to encode JPEG from canvas'));
          return;
        }
        resolve(blob);
      },
      'image/jpeg',
      JPEG_QUALITY,
    );
  });
}

async function decodeWithImageBitmap(file: File): Promise<{ source: ImageBitmap; width: number; height: number }> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    return { source: bitmap, width: bitmap.width, height: bitmap.height };
  } catch (cause) {
    throw new DecodeError('Unable to decode image file', { cause });
  }
}

async function decodeWithImageElement(
  file: File,
): Promise<{ source: HTMLImageElement; width: number; height: number; objectUrl: string }> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new DecodeError('Image element failed to load'));
      el.src = objectUrl;
    });
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, objectUrl };
  } catch (cause) {
    URL.revokeObjectURL(objectUrl);
    if (cause instanceof DecodeError) throw cause;
    throw new DecodeError('Unable to decode image file', { cause });
  }
}

function drawToCanvas(
  source: ImageBitmap | HTMLImageElement,
  width: number,
  height: number,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new DecodeError('Canvas 2D context unavailable');
  ctx.drawImage(source, 0, 0, width, height);
  return canvas;
}

async function decodeSource(
  file: File,
): Promise<
  | { kind: 'bitmap'; bitmap: ImageBitmap; width: number; height: number }
  | { kind: 'element'; img: HTMLImageElement; objectUrl: string; width: number; height: number }
> {
  if (typeof createImageBitmap === 'function') {
    try {
      const { source, width, height } = await decodeWithImageBitmap(file);
      if (width > 0 && height > 0) {
        return { kind: 'bitmap', bitmap: source, width, height };
      }
      source.close();
    } catch {
      // Fall through to HTMLImageElement path (e.g. jsdom or older Safari quirks).
    }
  }
  const { source, width, height, objectUrl } = await decodeWithImageElement(file);
  if (width <= 0 || height <= 0) {
    URL.revokeObjectURL(objectUrl);
    throw new DecodeError('Decoded image has no dimensions');
  }
  return { kind: 'element', img: source, objectUrl, width, height };
}

export async function normalizeImageFile(file: File): Promise<NormalizedImage> {
  const decoded = await decodeSource(file);
  const { width: targetW, height: targetH } = scaledDimensions(decoded.width, decoded.height);

  let canvas: HTMLCanvasElement | null = null;
  try {
    if (decoded.kind === 'bitmap') {
      canvas = drawToCanvas(decoded.bitmap, targetW, targetH);
      decoded.bitmap.close();
    } else {
      canvas = drawToCanvas(decoded.img, targetW, targetH);
      URL.revokeObjectURL(decoded.objectUrl);
    }

    const blob = await canvasToJpegBlob(canvas);
    return {
      blob,
      mimeType: 'image/jpeg',
      width: targetW,
      height: targetH,
    };
  } catch (cause) {
    if (decoded.kind === 'bitmap') decoded.bitmap.close();
    else URL.revokeObjectURL(decoded.objectUrl);
    if (cause instanceof DecodeError) throw cause;
    throw new DecodeError('Failed to normalize image', { cause });
  } finally {
    canvas = null;
  }
}