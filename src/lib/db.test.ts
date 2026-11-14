import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_PHOTOS } from '../types/walk';
import type { SaveState } from '../types/walk';
import {
  StorageError,
  createWalkStore,
  resetDbConnectionForTests,
  resetDbTestHooks,
  resetWriterLockForTests,
  setDbTestHooks,
  createMemoryLockManager,
} from './db';
import { makePhotoInput, makePhotoSequence } from './db.testhelpers';

const DB_NAME = 'pik-2-pdf';

async function resetDatabase(): Promise<void> {
  await resetDbConnectionForTests();
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => resolve();
  });
}

async function setupWalk(jobId = 'J-1') {
  const store = createWalkStore();
  const walk = await store.createWalk(jobId);
  return { store, walk };
}

describe('WalkStore', () => {
  beforeEach(async () => {
    resetDbTestHooks();
    resetWriterLockForTests();
    await resetDatabase();
  });

  afterEach(() => {
    resetDbTestHooks();
    resetWriterLockForTests();
  });

  describe('save queue and save state', () => {
    it('emits unsaved on enqueue and saved only after the full queue drains', async () => {
      const store = createWalkStore();
      const states: string[] = [];
      store.subscribeSaveState((s) => states.push(s));

      await store.createWalk('');
      expect(states).toContain('unsaved');
      await vi.waitFor(() => expect(states.at(-1)).toBe('saved'));

      await store.updateJobId('JOB');
      expect(states.filter((s) => s === 'unsaved').length).toBeGreaterThanOrEqual(2);
      await vi.waitFor(() => expect(states.at(-1)).toBe('saved'));
    });

    it('never emits saved from a stale completion while newer edits are still pending', async () => {
      const { store, walk } = await setupWalk();
      const slowGate = deferred<void>();
      let noteTxn = 0;
      const states: string[] = [];
      store.subscribeSaveState((s) => states.push(s));

      await store.appendPhoto(makePhotoInput({ id: 'a', order: 0 }));

      setDbTestHooks({
        beforeQueuedTransaction: async (op) => {
          if (op === 'updateNote') {
            noteTxn += 1;
            if (noteTxn === 1) await slowGate.promise;
          }
        },
      });

      const slow = store.updateNote('a', 'first');
      await Promise.resolve();
      const fast = store.updateNote('a', 'second');
      expect(states.at(-1)).toBe('unsaved');
      slowGate.resolve();
      await slow;
      await fast;
      expect(states.at(-1)).toBe('saved');

      const hydrated = await createWalkStore().hydrate();
      expect(hydrated.status).toBe('ok');
      if (hydrated.status === 'ok') {
        expect(hydrated.photos[0]?.note).toBe('second');
        expect(hydrated.walk.id).toBe(walk.id);
      }
    });

    it('emits save-failed on mutation failure and blocks the queue until retry', async () => {
      const { store } = await setupWalk();
      const photo = makePhotoInput({ id: 'p1', order: 0 });
      await store.appendPhoto(photo);

      let failOnce = true;
      setDbTestHooks({
        beforeAppendPhotoPut: () => {
          if (failOnce) {
            failOnce = false;
            throw new StorageError('transaction', 'injected');
          }
        },
      });

      const states: string[] = [];
      let lastError: StorageError | undefined;
      store.subscribeSaveState((s, e) => {
        states.push(s);
        lastError = e;
      });

      await expect(store.appendPhoto(makePhotoInput({ id: 'p2', order: 1 }))).rejects.toMatchObject({
        code: 'transaction',
      });
      expect(states).toContain('save-failed');
      expect(lastError?.code).toBe('transaction');

      await store.retryPendingSaves();
      await vi.waitFor(() => expect(states.at(-1)).toBe('saved'));
      expect(await store.countPhotos()).toBe(2);
    });
  });

  describe('appendPhoto', () => {
    it('persists photo and walk metadata atomically after commit', async () => {
      const { store, walk } = await setupWalk('LOT-9');
      const input = makePhotoInput({ id: 'pic', order: 0, note: 'hinge' });
      const persisted = await store.appendPhoto(input);
      expect(persisted.walkId).toBe(walk.id);

      const fresh = createWalkStore();
      const hydrated = await fresh.hydrate();
      expect(hydrated).toMatchObject({
        status: 'ok',
        walk: expect.objectContaining({ jobId: 'LOT-9' }),
      });
      if (hydrated.status === 'ok') {
        expect(hydrated.photos).toHaveLength(1);
        expect(hydrated.photos[0]?.id).toBe('pic');
        expect(hydrated.photos[0]?.note).toBe('hinge');
        expect(hydrated.photos[0]?.mimeType).toBe('image/jpeg');
        expect(hydrated.photos[0]?.blob).toBeTruthy();
      }
    });

    it('throws StorageError quota at MAX_PHOTOS committed photos', async () => {
      const { store } = await setupWalk();
      const batch = makePhotoSequence(MAX_PHOTOS);
      for (const p of batch) {
        await store.appendPhoto(p);
      }
      expect(await store.countPhotos()).toBe(MAX_PHOTOS);
      await expect(store.appendPhoto(makePhotoInput({ order: MAX_PHOTOS }))).rejects.toMatchObject({
        code: 'quota',
      });
      expect(await store.countPhotos()).toBe(MAX_PHOTOS);
    });
  });

  describe('removePhoto', () => {
    it('removes, renumbers consecutively, and preserves note pairings', async () => {
      const { store } = await setupWalk();
      await store.appendPhoto(makePhotoInput({ id: '0', order: 0, note: 'n0' }));
      await store.appendPhoto(makePhotoInput({ id: '1', order: 1, note: 'n1' }));
      await store.appendPhoto(makePhotoInput({ id: '2', order: 2, note: 'n2' }));

      const remaining = await store.removePhoto('1');
      expect(remaining.map((p) => p.id)).toEqual(['0', '2']);
      expect(remaining.map((p) => p.order)).toEqual([0, 1]);
      expect(remaining.map((p) => p.note)).toEqual(['n0', 'n2']);
    });
  });

  describe('metadata updates', () => {
    it('updateNote and updateJobId persist through the save queue', async () => {
      const { store } = await setupWalk('old');
      await store.appendPhoto(makePhotoInput({ id: 'p', order: 0 }));
      await store.updateNote('p', 'updated note');
      await store.updateJobId('new');

      const hydrated = await createWalkStore().hydrate();
      if (hydrated.status !== 'ok') throw new Error('expected walk');
      expect(hydrated.walk.jobId).toBe('new');
      expect(hydrated.photos[0]?.note).toBe('updated note');
    });
  });

  describe('setStatus', () => {
    it('setStatus paused resolves after pending saves drain and persists', async () => {
      const { store } = await setupWalk();
      let release: () => void;
      const gate = new Promise<void>((r) => {
        release = r;
      });
      setDbTestHooks({
        beforeQueuedTransaction: async (op) => {
          if (op === 'updateJobId') await gate;
        },
      });

      const pending = store.updateJobId('slow');
      const pause = store.setStatus('paused');
      let pausedResolved = false;
      void pause.then(() => {
        pausedResolved = true;
      });
      await new Promise((r) => setTimeout(r, 20));
      expect(pausedResolved).toBe(false);
      release!();
      await pending;
      await pause;
      expect(pausedResolved).toBe(true);

      const hydrated = await createWalkStore().hydrate();
      if (hydrated.status !== 'ok') throw new Error('expected walk');
      expect(hydrated.walk.status).toBe('paused');
      expect(hydrated.walk.jobId).toBe('slow');
    });
  });

  describe('clearWalk', () => {
    it('transactionally removes walk and all photos', async () => {
      const { store } = await setupWalk();
      await store.appendPhoto(makePhotoInput({ order: 0 }));
      await store.clearWalk();
      expect(await store.hydrate()).toEqual({ status: 'empty' });
      expect(await store.countPhotos()).toBe(0);
    });
  });

  describe('hydrate', () => {
    it('returns empty or ok with sorted photos on a fresh store instance', async () => {
      const empty = createWalkStore();
      expect(await empty.hydrate()).toEqual({ status: 'empty' });

      const { store } = await setupWalk();
      // Caller order values are ignored: orders are assigned by commit order.
      await store.appendPhoto(makePhotoInput({ id: 'b', order: 99 }));
      await store.appendPhoto(makePhotoInput({ id: 'a', order: 99 }));

      const reopen = createWalkStore();
      const result = await reopen.hydrate();
      if (result.status !== 'ok') throw new Error('expected ok');
      expect(result.photos.map((p) => p.order)).toEqual([0, 1]);
      expect(result.photos.map((p) => p.id)).toEqual(['b', 'a']);
    });
  });

  describe('acquireWriterLock', () => {
    it('grants exclusive writer lock to first instance and false to second', async () => {
      const manager = createMemoryLockManager();
      const a = createWalkStore({ lockManager: manager });
      const b = createWalkStore({ lockManager: manager });
      expect(await a.acquireWriterLock()).toBe(true);
      expect(await b.acquireWriterLock()).toBe(false);
      // Released lock is acquirable again (StrictMode remount path).
      await a.releaseWriterLock();
      expect(await b.acquireWriterLock()).toBe(true);
    });

    it('fails closed as read-only when no Web Locks mechanism exists', async () => {
      const store = createWalkStore({ lockManager: null });
      expect(await store.acquireWriterLock()).toBe(false);
    });
  });

  describe('StorageError codes', () => {
    it('classifies quota and transaction failures without false saved or data loss', async () => {
      const { store } = await setupWalk();
      await store.appendPhoto(makePhotoInput({ id: 'keep', order: 0 }));

      setDbTestHooks({
        beforeAppendPhotoPut: () => {
          throw new DOMException('quota', 'QuotaExceededError');
        },
      });

      const states: string[] = [];
      store.subscribeSaveState((s) => states.push(s));
      await expect(store.appendPhoto(makePhotoInput({ id: 'fail', order: 1 }))).rejects.toMatchObject({
        code: 'quota',
      });
      expect(states).toContain('save-failed');
      expect(states.at(-1)).not.toBe('saved');
      expect(await store.countPhotos()).toBe(1);

      resetDbTestHooks();
      await store.retryPendingSaves();
      expect(await store.countPhotos()).toBe(2);
      await vi.waitFor(() => expect(states.at(-1)).toBe('saved'));
    });
  });

  describe('interrupted batch import', () => {
    it('keeps committed photo A, save-failed on B, retry commits B without duplicates', async () => {
      const { store } = await setupWalk();
      let failB = true;
      setDbTestHooks({
        beforeAppendPhotoPut: ({ photoId }) => {
          if (photoId === 'B' && failB) {
            failB = false;
            throw new StorageError('transaction', 'batch interrupt');
          }
        },
      });

      const states: string[] = [];
      store.subscribeSaveState((s) => states.push(s));

      await store.appendPhoto(makePhotoInput({ id: 'A', order: 0 }));
      await expect(store.appendPhoto(makePhotoInput({ id: 'B', order: 1 }))).rejects.toBeTruthy();
      expect(await store.countPhotos()).toBe(1);
      expect(states).toContain('save-failed');

      await store.retryPendingSaves();
      expect(await store.countPhotos()).toBe(2);
      const hydrated = await createWalkStore().hydrate();
      if (hydrated.status !== 'ok') throw new Error('expected ok');
      expect(hydrated.photos.map((p) => p.id)).toEqual(['A', 'B']);
    });
  });
});

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
describe('precondition misses do not block the queue (integration regression)', () => {
  beforeEach(async () => {
    resetDbTestHooks();
    resetWriterLockForTests();
    await resetDatabase();
  });

  afterEach(() => {
    resetDbTestHooks();
    resetWriterLockForTests();
  });

  it('updateJobId before createWalk rejects without blocking later mutations', async () => {
    const store = createWalkStore();
    const states: SaveState[] = [];
    store.subscribeSaveState((s) => states.push(s));

    // UI types a job id before the first photo: updateJobId has no walk yet.
    await expect(store.updateJobId('J-77A')).rejects.toBeTruthy();
    // The queue must still drain: createWalk + appendPhoto work normally.
    const walk = await store.createWalk('J-77A');
    expect(walk.jobId).toBe('J-77A');
    await store.appendPhoto(makePhotoInput({ id: 'A', order: 0 }));
    expect(await store.countPhotos()).toBe(1);
    expect(states[states.length - 1]).toBe('saved');
    expect(states).not.toContain('save-failed');
  });

  it('updateNote for an unknown photo does not block the queue', async () => {
    const store = createWalkStore();
    await store.createWalk('');
    await expect(store.updateNote('missing-id', 'x')).rejects.toBeTruthy();
    await store.appendPhoto(makePhotoInput({ id: 'A', order: 0 }));
    expect(await store.countPhotos()).toBe(1);
  });
});

describe('failure latching and pause (review fixes)', () => {
  beforeEach(async () => {
    resetDbTestHooks();
    resetWriterLockForTests();
    await resetDatabase();
  });

  it('keeps save-failed latched while new mutations queue behind the block', async () => {
    const store = createWalkStore({ lockManager: createMemoryLockManager() });
    const states: SaveState[] = [];
    store.subscribeSaveState((s) => states.push(s));
    const { store: walkStore } = { store };
    await store.createWalk('');

    setDbTestHooks({
      beforeAppendPhotoPut: ({ photoId }) => {
        if (photoId === 'B') throw new DOMException('quota', 'QuotaExceededError');
      },
    });
    const first = store.appendPhoto(makePhotoInput({ id: 'A' }));
    await first;
    const second = store.appendPhoto(makePhotoInput({ id: 'B' }));
    await expect(second).rejects.toBeTruthy();
    const statesAfterFailure = states.length;

    // C queues behind the blocked job: failure state must NOT flip to 'unsaved'.
    const third = store.appendPhoto(makePhotoInput({ id: 'C' }));
    expect(states.slice(statesAfterFailure)).not.toContain('unsaved');
    expect(states[states.length - 1]).toBe('save-failed');

    // Pause must settle promptly (reject) instead of spinning forever.
    await expect(store.setStatus('paused')).rejects.toBeTruthy();

    // Clear the fault, retry: blocked job and queued C both commit.
    resetDbTestHooks();
    await store.retryPendingSaves();
    await third;
    expect(await store.countPhotos()).toBe(3);
    expect(states[states.length - 1]).toBe('saved');
    void walkStore;
  });
});
