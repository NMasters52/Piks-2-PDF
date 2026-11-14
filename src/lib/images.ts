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

import { MAX_IMAGE_LONG_EDGE } from '../types/walk';

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

/** FOUNDATION STUB — images agent implements; keep the signature identical. */
export function normalizeImageFile(_file: File): Promise<NormalizedImage> {
  return Promise.reject(
    new DecodeError('NOT IMPLEMENTED: normalizeImageFile is the images agent’s task (src/lib/images.ts).'),
  );
}
