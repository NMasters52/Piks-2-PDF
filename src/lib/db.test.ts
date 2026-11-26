import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openDB } from 'idb';
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

  describe('recent exports', () => {
    const pdf = new Blob(['original'], { type: 'application/pdf' });

    it('keeps the latest three distinct walks even when all exports share a clock tick', async () => {
      const { store, walk } = await setupWalk();
      const clock = vi.spyOn(Date, 'now').mockReturnValue(100);
      try {
        const save = (id: string, filename = `${id}.pdf`) =>
          store.saveRecentExport({ walk: { ...walk, id }, photos: [], filename, pdf });
        await save('first');
        await save('second');
        await save('third');
        await save('first', 'first-again.pdf');
        await save('fourth');

        const entries = await store.listRecentExports();
        expect(entries.map((entry) => entry.filename)).toEqual([
          'fourth.pdf', 'first-again.pdf', 'third.pdf',
        ]);
        const brokenPdf = (() => undefined) as unknown as Blob;
        await expect(store.saveRecentExport({
          walk: { ...walk, id: 'fifth' }, photos: [], filename: 'fifth.pdf', pdf: brokenPdf,
        })).rejects.toThrow();
        expect((await store.listRecentExports()).map((entry) => entry.filename)).toEqual(
          entries.map((entry) => entry.filename),
        );
      } finally {
        clock.mockRestore();
      }
    });

    it('isolates edits to an active walk and rolls back a failed replacement', async () => {
      const { store, walk } = await setupWalk();
      const photo = await store.appendPhoto(makePhotoInput({ note: 'Exported note' }));
      await store.saveRecentExport({ walk, photos: [photo], filename: 'original.pdf', pdf });
      await store.updateNote(photo.id, 'Interrupted note');
      await store.beginExportEdit(walk.id, { scrollY: 200, photoId: photo.id });
      await resetDbConnectionForTests();
      const reloaded = createWalkStore();
      const opened = await reloaded.hydrate();
      expect(opened.status).toBe('ok');
      if (opened.status !== 'ok') throw new Error('Expected the edit session');
      expect(opened.photos[0]).toMatchObject({ note: 'Exported note' });
      expect(opened.photos[0].id).not.toBe(photo.id);
      await reloaded.updateNote(opened.photos[0].id, 'Corrected note');

      const brokenPdf = (() => undefined) as unknown as Blob;
      await expect(reloaded.finishExportEdit({ filename: 'bad.pdf', pdf: brokenPdf })).rejects.toThrow();
      expect(await reloaded.getExportEdit()).toMatchObject({
        scrollY: 200, photoId: photo.id, previous: { filename: 'original.pdf' },
      });
      expect(await reloaded.listRecentExports()).toMatchObject([{ filename: 'original.pdf' }]);
      expect(await reloaded.hydrate()).toMatchObject({ photos: [{ note: 'Corrected note' }] });

      await expect(reloaded.finishExportEdit({ filename: 'corrected.pdf', pdf })).resolves.toMatchObject({
        walk: { id: walk.id }, photos: [{ id: photo.id, note: 'Interrupted note' }],
      });
      expect(await reloaded.getExportEdit()).toBeUndefined();
      expect(await reloaded.listRecentExports()).toMatchObject([{
        filename: 'corrected.pdf', walk: { id: walk.id }, photos: [{ note: 'Corrected note' }],
      }]);
      await expect(reloaded.listDrafts()).resolves.toEqual([]);
    });
  });

  describe('parked drafts', () => {
    it('upgrades a v1 active walk and preserves its photos and notes', async () => {
      const previous = await openDB(DB_NAME, 1, {
        upgrade(db) {
          db.createObjectStore('walks', { keyPath: 'id' });
          const photos = db.createObjectStore('photos', { keyPath: 'id' });
          photos.createIndex('byWalkId', 'walkId');
        },
      });
      const now = Date.now();
      const walk = { id: 'v1-walk', jobId: 'Lot 14', createdAt: now, updatedAt: now, status: 'active' };
      const photo = { ...makePhotoInput({ note: 'Check the left hinge' }), walkId: walk.id };
      await previous.put('walks', walk);
      await previous.put('photos', photo);
      previous.close();

      const store = createWalkStore();
      await expect(store.hydrate()).resolves.toMatchObject({
        status: 'ok',
        walk,
        photos: [{ id: photo.id, note: photo.note }],
      });
      await expect(store.listDrafts()).resolves.toEqual([]);
      await store.switchWalk({ current: 'park' });
      await expect(store.listDrafts()).resolves.toMatchObject([{ id: walk.id, photoCount: 1 }]);
      await expect(openDB(DB_NAME, 1)).rejects.toMatchObject({ name: 'VersionError' });
    });

    it('preserves the job, photo and last queued note across reopening the database', async () => {
      const { store, walk } = await setupWalk('Lot 14');
      const photo = await store.appendPhoto(makePhotoInput());
      const saveNote = store.updateNote(photo.id, 'Check the left hinge');
      const park = store.switchWalk({ current: 'park' });
      await saveNote;
      await expect(park).resolves.toEqual({ status: 'empty' });
      await resetDbConnectionForTests();

      const reloaded = createWalkStore();
      await expect(reloaded.hydrate()).resolves.toEqual({ status: 'empty' });
      await expect(reloaded.listDrafts()).resolves.toEqual([
        { id: walk.id, jobId: 'Lot 14', updatedAt: expect.any(Number), photoCount: 1 },
      ]);
      await expect(reloaded.switchWalk({ current: 'none', draftId: walk.id })).resolves.toMatchObject({
        status: 'ok',
        walk: { id: walk.id, jobId: 'Lot 14', status: 'active' },
        photos: [{ id: photo.id, note: 'Check the left hinge' }],
      });
      await expect(reloaded.listDrafts()).resolves.toEqual([]);
    });

    it('requires a replacement at capacity and uses the freed slot when reopening', async () => {
      const store = createWalkStore();
      const parkedIds: string[] = [];
      for (const jobId of ['Lot 1', 'Lot 2', 'Lot 3']) {
        const walk = await store.createWalk(jobId);
        parkedIds.push(walk.id);
        await store.appendPhoto(makePhotoInput());
        await store.switchWalk({ current: 'park' });
      }
      const active = await store.createWalk('Lot 4');
      await store.appendPhoto(makePhotoInput());

      await expect(store.switchWalk({ current: 'park' })).rejects.toThrow('Choose a parked draft');
      await expect(store.hydrate()).resolves.toMatchObject({ walk: { id: active.id } });
      await expect(store.listDrafts()).resolves.toHaveLength(3);

      await store.switchWalk({ current: 'park', replaceDraftId: parkedIds[1] });
      await expect(store.listDrafts()).resolves.toEqual(expect.arrayContaining([
        expect.objectContaining({ id: parkedIds[0], photoCount: 1 }),
        expect.objectContaining({ id: parkedIds[2], photoCount: 1 }),
        expect.objectContaining({ id: active.id, photoCount: 1 }),
      ]));
      await expect(store.switchWalk({ current: 'none', draftId: parkedIds[1] })).rejects.toThrow(
        'no longer available',
      );

      const next = await store.createWalk('Lot 5');
      await expect(
        store.switchWalk({ current: 'park', draftId: parkedIds[0] }),
      ).resolves.toMatchObject({ walk: { id: parkedIds[0] } });
      await expect(store.listDrafts()).resolves.toEqual(expect.arrayContaining([
        expect.objectContaining({ id: next.id }),
      ]));
      await expect(store.listDrafts()).resolves.toHaveLength(3);
    });

    it('rejects a queued switch if an earlier save fails and requires explicit retry', async () => {
      const { store, walk } = await setupWalk();
      const photo = await store.appendPhoto(makePhotoInput());
      setDbTestHooks({
        beforeQueuedTransaction(op) {
          if (op === 'updateNote') throw new StorageError('transaction', 'injected');
        },
      });
      const update = store.updateNote(photo.id, 'new note');
      const switching = store.switchWalk({ current: 'park' });
      await Promise.all([
        expect(update).rejects.toThrow('injected'),
        expect(switching).rejects.toThrow('injected'),
      ]);

      resetDbTestHooks();
      await store.retryPendingSaves();
      await expect(store.listDrafts()).resolves.toEqual([]);
      await expect(store.hydrate()).resolves.toMatchObject({
        walk: { id: walk.id },
        photos: [{ note: 'new note' }],
      });
    });
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

    it('releases an acquisition cancelled before its callback runs', async () => {
      const manager = createMemoryLockManager();
      const first = createWalkStore({ lockManager: manager });
      const acquisition = first.acquireWriterLock();
      await first.releaseWriterLock();
      expect(await acquisition).toBe(false);
      const replacement = createWalkStore({ lockManager: manager });
      expect(await replacement.acquireWriterLock()).toBe(true);
      await replacement.releaseWriterLock();
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
