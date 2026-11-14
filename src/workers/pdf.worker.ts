// PDF Web Worker entry.
// OWNED BY: images/PDF agent.
// Contract: receives PdfRenderRequest, calls renderPdfBytes() from
// src/lib/pdf/layout.ts (pure, testable), posts PdfRenderProgress updates,
// then EXACTLY ONE terminal PdfRenderDone or PdfRenderError message.
// No network access from this worker. Font bytes arrive in the request.

import type { PdfRenderRequest, PdfWorkerOutgoing } from '../types/walk';

// DOM lib's Window.postMessage signature differs from the worker global; cast once.
const workerSelf = self as unknown as {
  postMessage(message: PdfWorkerOutgoing): void;
  addEventListener(
    type: 'message',
    listener: (event: MessageEvent<PdfRenderRequest>) => void,
  ): void;
};

// FOUNDATION STUB — pdf agent replaces the handler body.
workerSelf.addEventListener('message', () => {
  workerSelf.postMessage({
    type: 'error',
    code: 'render',
    message: 'pdf.worker not implemented yet',
  });
});
