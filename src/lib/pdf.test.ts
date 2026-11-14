import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderWalkPdf, type ExportSnapshot } from './pdf';
import type { PdfWorkerOutgoing } from '../types/walk';

let latestWorker: TestWorker | null = null;

class TestWorker {
  private listener: ((ev: MessageEvent<PdfWorkerOutgoing>) => void) | null = null;
  behavior: 'done' | 'error' | 'slow' = 'done';
  errorCode: 'render' | 'font' = 'render';
  errorMessage = 'layout blew up';

  addEventListener(type: string, fn: (ev: MessageEvent<PdfWorkerOutgoing>) => void) {
    if (type === 'message') this.listener = fn;
  }

  removeEventListener() {
    this.listener = null;
  }

  postMessage() {
    if (this.behavior === 'slow') return;
    if (this.behavior === 'error') {
      queueMicrotask(() =>
        this.listener?.({
          data: { type: 'error', code: this.errorCode, message: this.errorMessage },
        } as MessageEvent<PdfWorkerOutgoing>),
      );
      return;
    }
    queueMicrotask(() => {
      this.listener?.({
        data: { type: 'progress', photosDone: 1, totalPhotos: 1 },
      } as MessageEvent<PdfWorkerOutgoing>);
      const bytes = new ArrayBuffer(16);
      this.listener?.({
        data: { type: 'done', bytes, filename: 'Cabinet-Walk_test.pdf' },
      } as MessageEvent<PdfWorkerOutgoing>);
    });
  }

  terminate() {}
}

vi.stubGlobal(
  'Worker',
  vi.fn(function WorkerCtor() {
    latestWorker = new TestWorker();
    return latestWorker;
  }),
);

vi.stubGlobal(
  'fetch',
  vi.fn().mockResolvedValue({
    ok: true,
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(64)),
  } as Response),
);

const snapshot: ExportSnapshot = {
  jobId: 'A-1',
  walkCreatedAt: Date.now(),
  photos: [
    {
      order: 1,
      jpegBytes: new ArrayBuffer(4),
      width: 32,
      height: 32,
      note: '',
    },
  ],
};

beforeEach(() => {
  latestWorker = null;
});

afterEach(() => {
  vi.mocked(Worker).mockImplementation(function WorkerCtor() {
    latestWorker = new TestWorker();
    return latestWorker;
  });
  vi.mocked(fetch).mockResolvedValue({
    ok: true,
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(64)),
  } as Response);
});

describe('renderWalkPdf', () => {
  it('rejects a second concurrent export', async () => {
    latestWorker = null;
    vi.mocked(Worker).mockImplementation(function WorkerCtor() {
      const w = new TestWorker();
      w.behavior = 'slow';
      latestWorker = w;
      return w;
    });

    const first = renderWalkPdf(snapshot);
    await expect(renderWalkPdf(snapshot)).rejects.toMatchObject({
      name: 'PdfExportError',
      code: 'worker',
    });

    latestWorker!.behavior = 'done';
    latestWorker!.postMessage();
    await first;
  });

  it('relays worker progress', async () => {
    const ticks: number[] = [];
    await renderWalkPdf(snapshot, (p) => ticks.push(p.photosDone));
    expect(ticks).toEqual([1]);
  });

  it('maps worker errors to PdfExportError', async () => {
    vi.mocked(Worker).mockImplementation(function WorkerCtor() {
      const w = new TestWorker();
      w.behavior = 'error';
      latestWorker = w;
      return w;
    });
    await expect(renderWalkPdf(snapshot)).rejects.toMatchObject({
      code: 'render',
      message: 'layout blew up',
    });
  });

  it('rejects empty walks before spawning a worker', async () => {
    vi.mocked(Worker).mockClear();
    await expect(
      renderWalkPdf({ ...snapshot, photos: [] }),
    ).rejects.toMatchObject({ code: 'render' });
    expect(Worker).not.toHaveBeenCalled();
  });
});