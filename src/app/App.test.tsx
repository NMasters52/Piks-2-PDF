import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import { createFakeWalkStore, resetFakeWalkStoreIds } from './fakeWalkStore';
import { buildTestDeps, jpegFile, renderApp, DecodeError, PdfExportError } from './testUtils';
import { MAX_NOTE_CHARS, MAX_PHOTOS } from '../types/walk';

beforeEach(() => {
  resetFakeWalkStoreIds();
  vi.restoreAllMocks();
});

afterEach(() => {
  cleanup();
});

async function waitForReady() {
  await waitFor(() =>
    expect(screen.getByRole('heading', { name: /pik-2-pdf/i })).toBeInTheDocument(),
  );
  await waitFor(() =>
    expect(screen.queryByText(/loading walk/i)).not.toBeInTheDocument(),
  );
}

function libraryInput() {
  return screen.getByLabelText(/add photos/i);
}

describe('capacity and selection rejection', () => {
  it('rejects a library selection that exceeds remaining capacity with a message', async () => {
    const store = createFakeWalkStore({
      initialHydration: {
        status: 'ok',
        walk: {
          id: 'w1',
          jobId: '',
          createdAt: 1,
          updatedAt: 1,
          status: 'active',
        },
        photos: Array.from({ length: 45 }, (_, i) => ({
          id: `p${i}`,
          walkId: 'w1',
          blob: new Blob(),
          mimeType: 'image/jpeg' as const,
          width: 10,
          height: 10,
          note: '',
          createdAt: 1,
          order: i,
        })),
      },
    });
    const { user } = renderApp(buildTestDeps(store));
    await waitForReady();
    expect(screen.getByText(/45 of 50 photos/i)).toBeInTheDocument();

    const library = libraryInput();
    const batch = Array.from({ length: 10 }, (_, i) => jpegFile(`extra-${i}.jpg`));
    await user.upload(library, batch);

    expect(await screen.findByText(/only 5 spaces remain/i)).toBeInTheDocument();
    expect(store.getPhotos()).toHaveLength(45);
  });

  it('disables additions at 50 photos with an explanation', async () => {
    const store = createFakeWalkStore({
      initialHydration: {
        status: 'ok',
        walk: {
          id: 'w1',
          jobId: '',
          createdAt: 1,
          updatedAt: 1,
          status: 'active',
        },
        photos: Array.from({ length: MAX_PHOTOS }, (_, i) => ({
          id: `p${i}`,
          walkId: 'w1',
          blob: new Blob(),
          mimeType: 'image/jpeg' as const,
          width: 10,
          height: 10,
          note: '',
          createdAt: 1,
          order: i,
        })),
      },
    });
    renderApp(buildTestDeps(store));
    await waitForReady();
    expect(screen.getByText(`${MAX_PHOTOS} of ${MAX_PHOTOS} photos`)).toBeInTheDocument();
    expect(libraryInput()).toBeDisabled();
    expect(screen.getByText(new RegExp(`${MAX_PHOTOS}-photo limit`, 'i'))).toBeInTheDocument();
  });
});

describe('partial import with retry', () => {
  it('keeps successful imports and retries a failed file without duplicating', async () => {
    const store = createFakeWalkStore();
    const failName = 'bad.jpg';
    const failAttempts: Record<string, number> = {};
    const deps = buildTestDeps(store, {
      normalize: async (file) => {
        if (file.name === failName) {
          failAttempts[failName] = (failAttempts[failName] ?? 0) + 1;
          if (failAttempts[failName] === 1) throw new DecodeError('corrupt file');
        }
        return {
          blob: new Blob([file.name], { type: 'image/jpeg' }),
          mimeType: 'image/jpeg',
          width: 10,
          height: 10,
        };
      },
    });
    const { user } = renderApp(deps);
    await waitForReady();

    const library = libraryInput();
    await user.upload(library, [jpegFile('good.jpg'), jpegFile(failName), jpegFile('good2.jpg')]);

    await waitFor(() => expect(screen.getByText(/Photo 1/i)).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText(/Photo 2/i)).toBeInTheDocument());
    expect(screen.getByText(/bad\.jpg/)).toBeInTheDocument();
    expect(store.getPhotos()).toHaveLength(2);

    const retry = screen.getByRole('button', { name: /^retry$/i });
    await user.click(retry);
    await waitFor(() => expect(screen.queryByText(/bad\.jpg/)).not.toBeInTheDocument());
    expect(store.getPhotos()).toHaveLength(3);
  });
});

describe('notes', () => {
  it('shows a note character counter capped at MAX_NOTE_CHARS', async () => {
    const store = createFakeWalkStore();
    const { user } = renderApp(buildTestDeps(store));
    await waitForReady();
    const library = libraryInput();
    await user.upload(library, [jpegFile('one.jpg')]);
    const note = await screen.findByLabelText(/note/i);
    const long = 'x'.repeat(MAX_NOTE_CHARS + 40);
    await user.type(note, long);
    expect(await screen.findByText(`${MAX_NOTE_CHARS} / ${MAX_NOTE_CHARS}`)).toBeInTheDocument();
  });
});

describe('save state and recovery', () => {
  it('shows save-failed banner with retry and recovery export', async () => {
    const store = createFakeWalkStore({ initialSaveState: 'save-failed' });
    renderApp(buildTestDeps(store));
    await waitForReady();
    expect(screen.getByRole('alert')).toHaveTextContent(/save failed/i);
    expect(screen.getByRole('button', { name: /retry save/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /recovery export/i })).toBeInTheDocument();
    expect(screen.getByText(/unsaved work may be lost/i)).toBeInTheDocument();
    expect(libraryInput()).toBeDisabled();
  });

  it('shows Saved only when save state is saved', async () => {
    const store = createFakeWalkStore({ initialSaveState: 'saved' });
    renderApp(buildTestDeps(store));
    await waitForReady();
    expect(screen.getByRole('status')).toHaveTextContent('Saved');
  });

  it('shows Unsaved changes while queue is pending', async () => {
    const store = createFakeWalkStore({ initialSaveState: 'unsaved' });
    renderApp(buildTestDeps(store));
    await waitForReady();
    expect(screen.getByText(/unsaved changes/i)).toBeInTheDocument();
  });
});

describe('pause and resume', () => {
  it('pauses the walk and blocks additions until resumed', async () => {
    const store = createFakeWalkStore({
      initialHydration: {
        status: 'ok',
        walk: { id: 'w1', jobId: '', createdAt: 1, updatedAt: 1, status: 'active' },
        photos: [
          {
            id: 'p0',
            walkId: 'w1',
            blob: new Blob(),
            mimeType: 'image/jpeg',
            width: 1,
            height: 1,
            note: '',
            createdAt: 1,
            order: 0,
          },
        ],
      },
    });
    const { user } = renderApp(buildTestDeps(store));
    await waitForReady();
    await user.click(screen.getByRole('button', { name: /pause walk/i }));
    expect(await screen.findByText(/walk paused/i)).toBeInTheDocument();
    expect(libraryInput()).toBeDisabled();

    await user.click(screen.getByRole('button', { name: /resume walk/i }));
    await waitFor(() => expect(libraryInput()).not.toBeDisabled());
  });
});

describe('clear walk confirmation', () => {
  it('cancel preserves photos; confirm clears after success', async () => {
    const store = createFakeWalkStore({
      initialHydration: {
        status: 'ok',
        walk: { id: 'w1', jobId: 'J-1', createdAt: 1, updatedAt: 1, status: 'active' },
        photos: [
          {
            id: 'p0',
            walkId: 'w1',
            blob: new Blob(),
            mimeType: 'image/jpeg',
            width: 1,
            height: 1,
            note: 'note',
            createdAt: 1,
            order: 0,
          },
        ],
      },
    });
    const { user } = renderApp(buildTestDeps(store));
    await waitForReady();
    await user.click(screen.getByRole('button', { name: /^new walk$/i }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: /keep editing/i }));
    expect(screen.getByText(/Photo 1/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^new walk$/i }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: /^clear and start new$/i }));
    await waitFor(() => expect(screen.getByText(/no photos yet/i)).toBeInTheDocument());
    expect(store.getPhotos()).toHaveLength(0);
  });
});

describe('export', () => {
  it('disables export when the walk has zero photos', async () => {
    renderApp(buildTestDeps(createFakeWalkStore()));
    await waitForReady();
    expect(screen.getByRole('button', { name: /export pdf/i })).toBeDisabled();
  });

  it('shows export progress and allows retry after failure', async () => {
    let calls = 0;
    const store = createFakeWalkStore({
      initialHydration: {
        status: 'ok',
        walk: { id: 'w1', jobId: '', createdAt: 1, updatedAt: 1, status: 'active' },
        photos: [
          {
            id: 'p0',
            walkId: 'w1',
            blob: new Blob([new Uint8Array([1])]),
            mimeType: 'image/jpeg',
            width: 1,
            height: 1,
            note: '',
            createdAt: 1,
            order: 0,
          },
        ],
      },
    });
    const deps = buildTestDeps(store, {
      renderPdf: async (_snap, onProgress) => {
        calls += 1;
        if (calls === 1) throw new PdfExportError('render', 'boom');
        onProgress?.({ photosDone: 1, totalPhotos: 1 });
        return { bytes: new Uint8Array([1]), filename: 'ok.pdf' };
      },
    });
    const { user } = renderApp(deps);
    await waitForReady();
    await user.click(screen.getByRole('button', { name: /export pdf/i }));
    expect(await screen.findByText(/boom/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /retry export/i }));
    expect(await screen.findByText(/PDF ready/i)).toBeInTheDocument();
    expect(store.getPhotos()).toHaveLength(1);
  });
});

describe('read-only mode', () => {
  it('shows a banner and disables mutations when writer lock is denied', async () => {
    const store = createFakeWalkStore({ writerLock: false });
    renderApp(buildTestDeps(store));
    await waitForReady();
    expect(screen.getByRole('alert')).toHaveTextContent(/another tab is editing/i);
    expect(libraryInput()).toBeDisabled();
    expect(screen.getByRole('button', { name: /export pdf/i })).toBeDisabled();
  });
});

describe('job id input', () => {
  it('queues updateJobId without blocking typing', async () => {
    const store = createFakeWalkStore({
      initialHydration: {
        status: 'ok',
        walk: { id: 'w1', jobId: '', createdAt: 1, updatedAt: 1, status: 'active' },
        photos: [],
      },
    });
    const updateSpy = vi.spyOn(store, 'updateJobId');
    const { user } = renderApp(buildTestDeps(store));
    await waitForReady();
    const field = screen.getByLabelText(/job \/ lot id/i);
    await user.type(field, 'JOB-12');
    await waitFor(() => expect(updateSpy).toHaveBeenCalled(), { timeout: 2000 });
    expect(field).toHaveValue('JOB-12');
  });
});
describe('export lifecycle regressions (review fixes)', () => {
  it('exports with the live job ID input, including when cleared', async () => {
    const store = createFakeWalkStore();
    const snapshots: Array<{ jobId: string }> = [];
    const deps = buildTestDeps(store, {
      renderPdf: async (snapshot) => {
        snapshots.push({ jobId: snapshot.jobId });
        return { bytes: new Uint8Array([1]), filename: 'x.pdf' };
      },
    });
    const { user } = renderApp(deps);
    await waitForReady();

    const jobIdField = screen.getByLabelText(/job \/ lot id/i);
    await user.type(jobIdField, 'OLD-1');
    await user.upload(libraryInput(), [jpegFile('a.jpg')]);
    await waitFor(() => expect(screen.getByText(/Photo 1/i)).toBeInTheDocument());

    await user.clear(jobIdField);
    await user.type(jobIdField, 'NEW-2');
    await user.click(screen.getByRole('button', { name: /^export pdf$/i }));
    await waitFor(() => expect(screen.getByText(/PDF ready/i)).toBeInTheDocument());
    expect(snapshots[snapshots.length - 1]?.jobId).toBe('NEW-2');
  });

  it('blocks export while importing and blocks mutations while exporting', async () => {
    const store = createFakeWalkStore();
    let slowPhase: 'none' | 'decode' | 'render' = 'none';
    let releaseDecode: (() => void) | null = null;
    const decodeGate = new Promise<void>((resolve) => {
      releaseDecode = resolve;
    });
    const deps = buildTestDeps(store, {
      normalize: async (file) => {
        if (slowPhase === 'decode') await decodeGate;
        return {
          blob: new Blob([file.name], { type: 'image/jpeg' }),
          mimeType: 'image/jpeg',
          width: 10,
          height: 10,
        };
      },
      renderPdf: async (_snapshot, onProgress) => {
        if (slowPhase === 'render') {
          await new Promise((r) => setTimeout(r, 400));
        }
        onProgress?.({ photosDone: 1, totalPhotos: 1 });
        return { bytes: new Uint8Array([1]), filename: 'x.pdf' };
      },
    });
    const { user } = renderApp(deps);
    await waitForReady();

    slowPhase = 'decode';
    await user.upload(libraryInput(), [jpegFile('slow.jpg')]);
    await waitFor(() => expect(screen.getByText(/1 importing/i)).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /^export pdf$/i })).toBeDisabled();
    releaseDecode!();

    slowPhase = 'none';
    await waitFor(() => expect(screen.getByText(/Photo 1/i)).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /^export pdf$/i })).toBeEnabled();

    slowPhase = 'render';
    await user.click(screen.getByRole('button', { name: /^export pdf$/i }));
    const removeButtons = await screen.findAllByRole('button', { name: /^remove photo$/i });
    expect(removeButtons[0]).toBeDisabled();
    expect(screen.getByRole('button', { name: /^new walk$/i })).toBeDisabled();

    await waitFor(() => expect(screen.getByText(/PDF ready/i)).toBeInTheDocument());
    expect(removeButtons[0]).toBeEnabled();
  });

  it('stays retryable when building the snapshot fails', async () => {
    const store = createFakeWalkStore();
    let failBlobRead = true;
    class FlakyBlob extends Blob {
      async arrayBuffer(): Promise<ArrayBuffer> {
        if (failBlobRead) {
          failBlobRead = false;
          return Promise.reject(new Error('blob read failed'));
        }
        return super.arrayBuffer();
      }
    }
    const deps = buildTestDeps(store, {
      normalize: async (file) => ({
        blob: new FlakyBlob([file.name], { type: 'image/jpeg' }),
        mimeType: 'image/jpeg',
        width: 10,
        height: 10,
      }),
    });
    const { user } = renderApp(deps);
    await waitForReady();

    await user.upload(libraryInput(), [jpegFile('a.jpg')]);
    await waitFor(() => expect(screen.getByText(/Photo 1/i)).toBeInTheDocument());
    expect(screen.getByRole('status')).toHaveTextContent('Saved');

    await user.click(screen.getByRole('button', { name: /^export pdf$/i }));
    await waitFor(() => expect(screen.getByText(/blob read failed/)).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /^retry export$/i })).toBeEnabled();

    await user.click(screen.getByRole('button', { name: /^retry export$/i }));
    await waitFor(() => expect(screen.getByText(/PDF ready/i)).toBeInTheDocument());
  });
});

it('removes a recovered append from failed imports after retrying save', async () => {
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:recovered');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  const db = await import('../lib/db');
  await db.resetDbConnectionForTests();
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase('pik-2-pdf');
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
  const store = db.createWalkStore({ lockManager: db.createMemoryLockManager() });
  const { user } = renderApp(buildTestDeps(store));
  try {
    await waitForReady();
    db.setDbTestHooks({ beforeAppendPhotoPut: () => { throw new DOMException('quota', 'QuotaExceededError'); } });
    await user.upload(libraryInput(), jpegFile('recover.jpg'));
    await screen.findByText(/recover\.jpg/);
    db.resetDbTestHooks();
    await user.click(screen.getByRole('button', { name: /retry save/i }));
    await screen.findByText('1 of 50 photos');
    expect(screen.queryByRole('button', { name: /^retry$/i })).not.toBeInTheDocument();
    expect(await store.countPhotos()).toBe(1);
  } finally {
    cleanup();
    db.resetDbTestHooks();
    await db.resetDbConnectionForTests();
  }
});
