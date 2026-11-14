// Main-thread PDF export wrapper (spawns the Web Worker).
// OWNED BY: images/PDF agent. Keep exported signatures identical.

import type { PdfPhotoInput, PdfRenderRequest, PdfWorkerOutgoing } from '../types/walk';
import { buildPdfFilename } from './pdf/layout';

import fontUrl from '../assets/fonts/DejaVuSans.ttf?url';

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

let fontBytesCache: ArrayBuffer | null = null;
let fontBytesPromise: Promise<ArrayBuffer> | null = null;

async function loadFontBytes(): Promise<ArrayBuffer> {
  if (fontBytesCache) return fontBytesCache;
  if (!fontBytesPromise) {
    fontBytesPromise = fetch(fontUrl)
      .then((res) => {
        if (!res.ok) {
          throw new PdfExportError(
            'font',
            `PDF font not ready (fetch failed: ${res.status}) — go back online once and retry the export`,
          );
        }
        return res.arrayBuffer();
      })
      .then((buf) => {
        fontBytesCache = buf;
        return buf;
      })
      .catch((cause) => {
        fontBytesPromise = null;
        if (cause instanceof PdfExportError) throw cause;
        throw new PdfExportError('font', 'Failed to load bundled font', { cause });
      });
  }
  return fontBytesPromise;
}

let exportInFlight: Promise<{ bytes: Uint8Array; filename: string; warnings?: string[] }> | null = null;

export async function renderWalkPdf(
  snapshot: ExportSnapshot,
  onProgress?: ExportProgress,
): Promise<{ bytes: Uint8Array; filename: string; warnings?: string[] }> {
  if (exportInFlight) {
    throw new PdfExportError('worker', 'PDF export already in progress');
  }

  if (snapshot.photos.length === 0) {
    throw new PdfExportError('render', 'Cannot export an empty walk');
  }

  const run = (async () => {
    let fontBytes: ArrayBuffer;
    try {
      fontBytes = await loadFontBytes();
    } catch (e) {
      if (e instanceof PdfExportError) throw e;
      throw new PdfExportError('font', 'Failed to load bundled font', { cause: e });
    }

    const request: PdfRenderRequest = {
      type: 'render',
      jobId: snapshot.jobId,
      walkCreatedAt: snapshot.walkCreatedAt,
      photos: snapshot.photos,
      fontBytes,
    };

    // NOTE: keep the `new URL(..., import.meta.url)` INLINE — Vite's worker
    // plugin only detects the literal `new Worker(new URL(...))` pattern and
    // fails to emit the worker chunk otherwise (found in browser testing).
    const worker = new Worker(new URL('../workers/pdf.worker.ts', import.meta.url), {
      type: 'module',
    });

    try {
      return await new Promise<{ bytes: Uint8Array; filename: string; warnings?: string[] }>((resolve, reject) => {
        const onMessage = (event: MessageEvent<PdfWorkerOutgoing>) => {
          const msg = event.data;
          if (msg.type === 'progress') {
            onProgress?.({ photosDone: msg.photosDone, totalPhotos: msg.totalPhotos });
            return;
          }
          worker.removeEventListener('message', onMessage);
          worker.terminate();
          if (msg.type === 'done') {
            resolve({ bytes: new Uint8Array(msg.bytes), filename: msg.filename, warnings: msg.warnings });
          } else {
            reject(new PdfExportError(msg.code, msg.message));
          }
        };

        worker.addEventListener('message', onMessage);
        worker.addEventListener('error', (err) => {
          worker.removeEventListener('message', onMessage);
          worker.terminate();
          reject(new PdfExportError('render', err.message || 'Worker error', { cause: err }));
        });

        worker.postMessage(request);
      });
    } catch (e) {
      worker.terminate();
      if (e instanceof PdfExportError) throw e;
      throw new PdfExportError('render', 'PDF render failed', { cause: e });
    }
  })();

  exportInFlight = run;
  try {
    return await run;
  } finally {
    exportInFlight = null;
  }
}

// Offline-while-open contract (playbook): export code, worker, and fonts must
// be ready while the app is online, because the first export may happen after
// connectivity is gone. The worker bundle and font are immutable hashed
// assets; fetching each once at boot populates the HTTP cache so the first
// export needs no network. Failures are non-fatal — a later export retries.
void loadFontBytes().catch(() => undefined);
try {
  // Boot-time worker warm-up: fetch + parse the worker chunk while online
  // (terminated immediately; real exports spawn their own worker).
  const warm = new Worker(new URL('../workers/pdf.worker.ts', import.meta.url), {
    type: 'module',
  });
  setTimeout(() => warm.terminate(), 3000);
} catch {
  // Worker unavailable (test environments) — exports degrade to their own error path.
}

export { buildPdfFilename };