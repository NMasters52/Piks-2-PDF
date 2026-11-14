// PDF Web Worker entry.
// OWNED BY: images/PDF agent.

import type { PdfRenderRequest, PdfWorkerOutgoing } from '../types/walk';
import { renderPdfBytes } from '../lib/pdf/layout';

const workerSelf = self as unknown as {
  postMessage(message: PdfWorkerOutgoing, transfer?: Transferable[]): void;
  addEventListener(
    type: 'message',
    listener: (event: MessageEvent<PdfRenderRequest>) => void,
  ): void;
};

let busy = false;

workerSelf.addEventListener('message', async (event: MessageEvent<PdfRenderRequest>) => {
  if (busy) {
    workerSelf.postMessage({
      type: 'error',
      code: 'render',
      message: 'Worker is already processing a render request',
    });
    return;
  }
  busy = true;
  const request = event.data;

  try {
    const result = await renderPdfBytes(request, (info) => {
      workerSelf.postMessage({
        type: 'progress',
        photosDone: info.photosDone,
        totalPhotos: info.totalPhotos,
      });
    });

    const buffer = result.bytes.buffer.slice(
      result.bytes.byteOffset,
      result.bytes.byteOffset + result.bytes.byteLength,
    ) as ArrayBuffer;
    workerSelf.postMessage(
      {
        type: 'done',
        bytes: buffer,
        filename: result.filename,
        warnings: result.warnings,
      },
      [buffer],
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const isFont =
      message.toLowerCase().includes('font') ||
      message === 'Font embedding failed';
    workerSelf.postMessage({
      type: 'error',
      code: isFont ? 'font' : 'render',
      message,
    });
  } finally {
    busy = false;
  }
});