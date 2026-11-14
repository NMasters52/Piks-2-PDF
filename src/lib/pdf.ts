// Main-thread PDF export wrapper (spawns the Web Worker).
// OWNED BY: images/PDF agent. Keep exported signatures identical.
//
// Required semantics:
// - One export in flight at a time: a second call while one is active throws
//   PdfExportError('worker') so repeated taps cannot generate duplicates.
// - Surface worker progress via onProgress; resolve with bytes + filename.
// - Worker failure resolves/rejects with PdfExportError('render'|'font');
//   the UI can retry after a failure.
// - The worker (src/workers/pdf.worker.ts) must be loaded with `new Worker(
//   new URL('../workers/pdf.worker.ts', import.meta.url), { type: 'module' })`
//   so Vite bundles it — its code must be ready offline once the app loaded.
// - Font bytes come from src/assets/fonts/DejaVuSans.ttf via `?url` import
//   fetched ONCE while online, then reused; export after going offline must
//   not need the network.

import type { PdfPhotoInput } from '../types/walk';
import { buildPdfFilename } from './pdf/layout';

export class PdfExportError extends Error {
  constructor(
    public code: 'render' | 'font' | 'worker',
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'PdfExportError';
  }
}

export type ExportSnapshot = {
  jobId: string;
  walkCreatedAt: number;
  photos: PdfPhotoInput[];
};

export type ExportProgress = (info: { photosDone: number; totalPhotos: number }) => void;

/** FOUNDATION STUB — pdf agent implements; keep the signature identical. */
export function renderWalkPdf(
  _snapshot: ExportSnapshot,
  _onProgress?: ExportProgress,
): Promise<{ bytes: Uint8Array; filename: string }> {
  return Promise.reject(
    new PdfExportError(
      'worker',
      'NOT IMPLEMENTED: renderWalkPdf is the pdf agent’s task (src/lib/pdf.ts + src/workers/pdf.worker.ts).',
    ),
  );
}

export { buildPdfFilename };
