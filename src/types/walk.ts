// Shared contracts for Pik-2-PDF.
// COORDINATOR-OWNED: delegates must not edit this file. Request changes through
// the coordinator. Contracts were fixed before the implementation wave; see
// FRESH-CHAT-KICKOFF.md and pik-2-pdf-playbook.md for the behavior behind them.

/** Hard per-walk photo limit (agreed product contract). */
export const MAX_PHOTOS = 50;
/** Optional note length limit per photo (agreed product contract). */
export const MAX_NOTE_CHARS = 200;
/** Normalized image long-edge cap in px; never upscale. */
export const MAX_IMAGE_LONG_EDGE = 1600;
/** Normalized JPEG quality. */
export const JPEG_QUALITY = 0.8;

export type WalkStatus = 'active' | 'paused';

/** One photo in the current walk. `blob` is the NORMALIZED JPEG copy — this
 *  app is not an original-photo archive. Persisted in IndexedDB only. */
export type WalkPhoto = {
  id: string;
  walkId: string;
  blob: Blob;
  mimeType: 'image/jpeg';
  /** Pixel dimensions after normalization. */
  width: number;
  height: number;
  /** '' when absent. Never truncated silently; capped at MAX_NOTE_CHARS in UI input. */
  note: string;
  /** Epoch ms at capture/import time. */
  createdAt: number;
  /** 0-based queue position; consecutive after removal (renumbered in the same transaction). */
  order: number;
};

/** The single current walk. No walk list, no job switching. */
export type Walk = {
  id: string;
  /** '' when absent. Used in PDF header and filename. */
  jobId: string;
  /** Epoch ms; drives PDF header date + filename date in the device's local timezone. */
  createdAt: number;
  updatedAt: number;
  status: WalkStatus;
};

/** Persistence indicator state. 'saved' only after an acknowledged commit of
 *  every queued mutation; 'unsaved' when new work is queued; 'save-failed'
 *  after a failed mutation until retryPendingSaves() succeeds or fails again. */
export type SaveState = 'saved' | 'unsaved' | 'save-failed';

export type HydrationResult =
  | { status: 'empty' }
  | { status: 'ok'; walk: Walk; photos: WalkPhoto[] };

/** Free spaces considering only committed photos. */
export function remainingPhotoCapacity(committedCount: number): number {
  return Math.max(0, MAX_PHOTOS - committedCount);
}

/** Selection gate: selections larger than the remaining capacity are rejected
 *  IN FULL (never a silent subset). In-flight (decoding/persisting) imports
 *  reserve capacity so repeated taps cannot exceed 50. */
export function canAcceptSelection(
  selectionCount: number,
  committedCount: number,
  inFlightCount: number,
): boolean {
  return selectionCount <= Math.max(0, remainingPhotoCapacity(committedCount) - inFlightCount);
}

// ---------------------------------------------------------------------------
// PDF export contracts (lib/pdf.ts + src/workers/pdf.worker.ts)
// ---------------------------------------------------------------------------

/** One photo handed to the PDF renderer. `order` is 1-based display numbering. */
export type PdfPhotoInput = {
  order: number;
  /** Normalized JPEG bytes. */
  jpegBytes: ArrayBuffer;
  width: number;
  height: number;
  note: string;
};

export type PdfRenderRequest = {
  type: 'render';
  jobId: string;
  /** Epoch ms; header date + filename date, local timezone. */
  walkCreatedAt: number;
  photos: PdfPhotoInput[];
  /** Bundled Unicode font bytes (transferred, not cloned). */
  fontBytes: ArrayBuffer;
};

export type PdfRenderProgress = {
  type: 'progress';
  photosDone: number;
  totalPhotos: number;
};

export type PdfRenderDone = {
  type: 'done';
  bytes: ArrayBuffer;
  filename: string;
  /** Non-fatal notices (e.g. characters not covered by the bundled font). */
  warnings?: string[];
};

export type PdfRenderError = {
  type: 'error';
  /** 'font' = font registration/embedding failed; 'render' = anything else. */
  code: 'render' | 'font';
  message: string;
};

export type PdfWorkerOutgoing = PdfRenderProgress | PdfRenderDone | PdfRenderError;
