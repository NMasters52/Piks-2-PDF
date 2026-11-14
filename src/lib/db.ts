// Persistence layer (IndexedDB via `idb`).
// OWNED BY: storage agent. The exported API below is the shared contract —
// keep signatures identical; implement internals freely.
//
// Required semantics (pik-2-pdf-playbook.md, "Data and persistence"):
// - One current walk. Image blobs in IndexedDB, never localStorage.
// - Versioned schema, non-destructive migrations.
// - All mutations pass through ONE ordered save queue:
//     * enqueueing any mutation emits ('unsaved');
//     * 'saved' is emitted only when the entire queue has drained and every
//       mutation committed — a stale completion must never mark newer edits saved;
//     * a failed mutation emits ('save-failed', error) and keeps the queue
//       blocked; existing committed records are never cleared to recover.
// - appendPhoto persists the photo + walk metadata atomically in one
//   transaction and throws StorageError('quota') when committed photos
//   already equal MAX_PHOTOS. Image decoding happens OUTSIDE transactions
//   (caller's job); capacity for in-flight imports is reserved by the caller.
// - removePhoto removes data + metadata transactionally and renumbers the
//   remaining photos consecutively in the same transaction.
// - setStatus('paused') resolves only after pending saves have drained or
//   failed (pause waits for pending saves before resolving).
// - clearWalk clears walk + photos transactionally; caller confirms first;
//   visible state resets only after success.
// - Exclusive writer: acquireWriterLock() uses the Web Locks API ('pik-2-pdf-writer'
//   exclusive lock). Resolves false when another tab holds it → UI goes
//   read-only. Must be tested.
// - Recovery guarantee: the most recent acknowledged 'saved' state. hydrate()
//   re-reads committed data for recovery export (no separate snapshot method).

import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { HydrationResult, SaveState, Walk, WalkPhoto, WalkStatus } from '../types/walk';
import { MAX_PHOTOS } from '../types/walk';

export type StorageErrorCode = 'quota' | 'transaction' | 'locked' | 'unknown';

export class StorageError extends Error {
  /** Precondition misses ('No walk', 'Photo not found', walk-already-exists)
   *  are application-state races, NOT storage failures: they reject their own
   *  mutation but must never block the save queue. */
  precondition?: boolean;
  constructor(
    public code: StorageErrorCode,
    message: string,
    options?: { cause?: unknown; precondition?: boolean },
  ) {
    super(message, options);
    this.name = 'StorageError';
    this.precondition = options?.precondition ?? false;
  }
}

export interface WalkStore {
  /** Exclusive writer lock via Web Locks API. false → another tab owns
   *  writes OR cross-tab exclusion is unavailable (fail closed); the UI must
   *  go read-only. */
  acquireWriterLock(): Promise<boolean>;
  /** Release the writer lock (component unmount / StrictMode remounts). */
  releaseWriterLock(): Promise<void>;
  /** Load the current walk + photos (photos sorted by `order`). Resolves
   *  {status:'empty'} when no walk exists yet. Throws StorageError. */
  hydrate(): Promise<HydrationResult>;
  /** Create the single current walk. */
  createWalk(jobId: string): Promise<Walk>;
  /** Number of committed photos (for capacity gating). */
  countPhotos(): Promise<number>;
  /** Transactionally persist one normalized photo + walk metadata.
   *  Throws StorageError('quota') at MAX_PHOTOS committed. The photo's
   *  `order` is assigned INSIDE the transaction as the committed count, so
   *  removals/retries can never create gaps — the caller's value is ignored.
   *  Resolves the persisted record after the transaction commits (save
   *  acknowledgment). */
  appendPhoto(photo: Omit<WalkPhoto, 'walkId'>): Promise<WalkPhoto>;
  /** Transactional removal + renumbering. Resolves remaining photos sorted by order. */
  removePhoto(photoId: string): Promise<WalkPhoto[]>;
  /** Queue a note update (max MAX_NOTE_CHARS enforced upstream). */
  updateNote(photoId: string, note: string): Promise<void>;
  /** Queue a job/lot ID update ('' allowed). */
  updateJobId(jobId: string): Promise<void>;
  /** Persist pause/resume. 'paused' waits for pending saves before resolving;
   *  it rejects promptly (with the storage error) if the queue is blocked on
   *  a save failure — the user must retry the save first. */
  setStatus(status: WalkStatus): Promise<void>;
  /** Transactional full clear of walk + photos. Caller confirms first. */
  clearWalk(): Promise<void>;
  /** Subscribe to SaveState transitions. Emits the current state immediately.
   *  Returns an unsubscribe function. */
  subscribeSaveState(
    listener: (state: SaveState, error?: StorageError) => void,
  ): () => void;
  /** After 'save-failed': retry the pending mutation(s) without duplication.
   *  Resolves when the queue drains successfully or fails again. */
  retryPendingSaves(): Promise<void>;
}

const DB_NAME = 'pik-2-pdf';
const DB_VERSION = 1;
const WRITER_LOCK = 'pik-2-pdf-writer';

interface Pik2PdfDbSchema extends DBSchema {
  walks: {
    key: string;
    value: Walk;
  };
  photos: {
    key: string;
    value: WalkPhoto;
    indexes: { byWalkId: string };
  };
}

/** Test-only hooks for fault injection (vitest). Not part of the WalkStore contract. */
export type DbTestHooks = {
  /** Called inside appendPhoto transaction before put; throw to simulate failure. */
  beforeAppendPhotoPut?: (context: { photoId: string; committedCount: number }) => void;
  /** Called before any queued mutation runs its IDB transaction. */
  beforeQueuedTransaction?: (op: string) => void | Promise<void>;
};

let dbTestHooks: DbTestHooks = {};

/** @internal For db.test.ts fault injection only. */
export function setDbTestHooks(hooks: DbTestHooks): void {
  dbTestHooks = hooks;
}

/** @internal Reset test hooks after each test. */
export function resetDbTestHooks(): void {
  dbTestHooks = {};
}

type LockManagerLike = {
  request<T>(
    name: string,
    options: { mode: 'exclusive'; ifAvailable?: boolean },
    callback: (lock: unknown) => Promise<T> | T,
  ): Promise<T>;
};

/** Cross-tab exclusion requires the Web Locks API. When it is missing we FAIL
 *  CLOSED (read-only): a module-local memory lock cannot arbitrate between
 *  tabs and would let two writable tabs corrupt each other. Tests inject a
 *  lock manager explicitly via createWalkStore({ lockManager }). */
function getLockManager(): LockManagerLike | null {
  if (typeof navigator !== 'undefined' && navigator.locks) {
    return navigator.locks as unknown as LockManagerLike;
  }
  return null;
}

/** @deprecated No-op: lock behavior is injected via createWalkStore options. */
export function resetWriterLockForTests(): void {
  /* lock manager is now injected; kept so existing test suites keep working */
}

/** Test helper: an in-memory exclusive lock manager (jsdom tests only). */
export function createMemoryLockManager(): LockManagerLike & { _held: boolean } {
  const state = { held: false };
  return {
    _held: false,
    request<T>(
      _name: string,
      options: { mode: 'exclusive'; ifAvailable?: boolean },
      callback: (lock: unknown) => Promise<T> | T,
    ) {
      void _name;
      if (options.ifAvailable && state.held) return Promise.resolve(callback(null));
      state.held = true;
      // Web Locks releases when the callback settles; Lock has no release().
      return Promise.resolve()
        .then(() => callback({ name: _name, mode: options.mode }))
        .finally(() => { state.held = false; });
    },
  } as LockManagerLike & { _held: boolean };
}

let sharedDbPromise: Promise<IDBPDatabase<Pik2PdfDbSchema>> | null = null;

async function closeDatabase(): Promise<void> {
  if (sharedDbPromise) {
    const db = await sharedDbPromise;
    db.close();
    sharedDbPromise = null;
  }
}

function openDatabase(): Promise<IDBPDatabase<Pik2PdfDbSchema>> {
  if (!sharedDbPromise) {
    sharedDbPromise = openDB<Pik2PdfDbSchema>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion, _newVersion, transaction) {
        if (oldVersion < 1) {
          db.createObjectStore('walks', { keyPath: 'id' });
          const photos = db.createObjectStore('photos', { keyPath: 'id' });
          photos.createIndex('byWalkId', 'walkId');
        }
        // Future: non-destructive migrations only — never drop stores here.
        void transaction;
      },
    });
  }
  return sharedDbPromise;
}

/** @internal Reset DB connection singleton between tests. */
export async function resetDbConnectionForTests(): Promise<void> {
  await closeDatabase();
}

function toStorageError(err: unknown): StorageError {
  if (err instanceof StorageError) return err;
  if (err instanceof DOMException) {
    if (err.name === 'QuotaExceededError') {
      return new StorageError('quota', err.message, { cause: err });
    }
    if (err.name === 'AbortError' || err.name === 'TransactionInactiveError') {
      return new StorageError('transaction', err.message, { cause: err });
    }
  }
  const message = err instanceof Error ? err.message : String(err);
  return new StorageError('unknown', message, { cause: err });
}

function sortPhotos(photos: WalkPhoto[]): WalkPhoto[] {
  return [...photos].sort((a, b) => a.order - b.order);
}

type QueueJob<T> = {
  label: string;
  run: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (err: unknown) => void;
};

class WalkStoreImpl implements WalkStore {
  private saveState: SaveState = 'saved';
  private lastError: StorageError | undefined;
  private listeners = new Set<(state: SaveState, error?: StorageError) => void>();
  private pending: QueueJob<unknown>[] = [];
  private running = false;
  private blockedJob: QueueJob<unknown> | null = null;
  private readonly lockManager: LockManagerLike | null;
  private releaseRequested = false;
  private releaseLock: (() => void) | null = null;
  private lockRequest: Promise<unknown> | null = null;

  constructor(lockManager: LockManagerLike | null) {
    this.lockManager = lockManager;
  }

  private emit(state: SaveState, error?: StorageError) {
    this.saveState = state;
    this.lastError = error;
    for (const listener of this.listeners) {
      listener(state, error);
    }
  }

  private emitCurrent(listener: (state: SaveState, error?: StorageError) => void) {
    listener(this.saveState, this.lastError);
  }

  private enqueue<T>(label: string, run: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const job: QueueJob<T> = { label, run, resolve, reject };
      this.pending.push(job as QueueJob<unknown>);
      // While a failure blocks the queue, the failure stays latched: emitting
      // 'unsaved' here would hide the banner, unblock additions, and stall.
      if (!this.blockedJob) {
        this.emit('unsaved');
      }
      void this.pump();
    });
  }

  private async pump(): Promise<void> {
    if (this.running || this.blockedJob) return;
    this.running = true;
    try {
      while (this.pending.length > 0 && !this.blockedJob) {
        const job = this.pending.shift()!;
        try {
          const result = await job.run();
          job.resolve(result);
        } catch (err) {
          const storageErr = toStorageError(err);
          if (storageErr instanceof StorageError && storageErr.precondition) {
            // Application-state race: reject this mutation, keep draining.
            job.reject(storageErr);
            continue;
          }
          this.blockedJob = job;
          job.reject(storageErr);
          this.emit('save-failed', storageErr);
          break;
        }
      }
      if (!this.blockedJob && this.pending.length === 0) {
        this.emit('saved');
      }
    } finally {
      this.running = false;
      if (!this.blockedJob && this.pending.length > 0) {
        void this.pump();
      }
    }
  }

  async acquireWriterLock(): Promise<boolean> {
    // Fail closed: without a cross-tab exclusion mechanism this instance must
    // not write (UI goes read-only).
    this.releaseRequested = false;
    const locks = this.lockManager;
    if (!locks) return false;
    return new Promise<boolean>((resolve) => {
      this.lockRequest = locks
        .request(WRITER_LOCK, { mode: 'exclusive', ifAvailable: true }, (lock) => {
          if (!lock || this.releaseRequested) {
            resolve(false);
            return undefined;
          }
          const hold = new Promise<void>((release) => {
            this.releaseLock = release;
          });
          resolve(true);
          return hold;
        })
        .catch(() => resolve(false));
    });
  }

  async releaseWriterLock(): Promise<void> {
    // Completing the request callback releases a Web Lock. Wait for the
    // request to settle before a replacement store attempts acquisition.
    this.releaseRequested = true;
    const request = this.lockRequest;
    this.releaseLock?.();
    this.releaseLock = null;
    await request;
    if (this.lockRequest === request) this.lockRequest = null;
  }

  async hydrate(): Promise<HydrationResult> {
    try {
      const db = await openDatabase();
      const walk = await this.readCurrentWalk(db);
      if (!walk) return { status: 'empty' };
      const photos = await this.readPhotosForWalk(db, walk.id);
      return { status: 'ok', walk, photos: sortPhotos(photos) };
    } catch (err) {
      throw toStorageError(err);
    }
  }

  createWalk(jobId: string): Promise<Walk> {
    return this.enqueue('createWalk', async () => {
      await dbTestHooks.beforeQueuedTransaction?.('createWalk');
      const db = await openDatabase();
      const existing = await this.readCurrentWalk(db);
      if (existing) {
        throw new StorageError('unknown', 'A walk already exists', { precondition: true });
      }
      const now = Date.now();
      const walk: Walk = {
        id: crypto.randomUUID(),
        jobId,
        createdAt: now,
        updatedAt: now,
        status: 'active',
      };
      const tx = db.transaction('walks', 'readwrite');
      await tx.store.put(walk);
      await tx.done;
      return walk;
    });
  }

  async countPhotos(): Promise<number> {
    const db = await openDatabase();
    const walk = await this.readCurrentWalk(db);
    if (!walk) return 0;
    return db.transaction('photos').store.index('byWalkId').count(walk.id);
  }

  appendPhoto(photo: Omit<WalkPhoto, 'walkId'>): Promise<WalkPhoto> {
    return this.enqueue('appendPhoto', async () => {
      await dbTestHooks.beforeQueuedTransaction?.('appendPhoto');
      const db = await openDatabase();
      const walk = await this.readCurrentWalk(db);
      if (!walk) {
        throw new StorageError('unknown', 'No walk to append to', { precondition: true });
      }
      const tx = db.transaction(['photos', 'walks'], 'readwrite');
      const photoStore = tx.objectStore('photos');
      const walkStore = tx.objectStore('walks');
      const committedCount = await photoStore.index('byWalkId').count(walk.id);
      if (committedCount >= MAX_PHOTOS) {
        await tx.done;
        throw new StorageError('quota', `Cannot exceed ${MAX_PHOTOS} photos`);
      }
      const record: WalkPhoto = { ...photo, walkId: walk.id, order: committedCount };
      dbTestHooks.beforeAppendPhotoPut?.({ photoId: record.id, committedCount });
      await photoStore.put(record);
      const updatedWalk: Walk = { ...walk, updatedAt: Date.now() };
      await walkStore.put(updatedWalk);
      await tx.done;
      return record;
    });
  }

  removePhoto(photoId: string): Promise<WalkPhoto[]> {
    return this.enqueue('removePhoto', async () => {
      await dbTestHooks.beforeQueuedTransaction?.('removePhoto');
      const db = await openDatabase();
      const walk = await this.readCurrentWalk(db);
      if (!walk) {
        throw new StorageError('unknown', 'No walk', { precondition: true });
      }
      const tx = db.transaction(['photos', 'walks'], 'readwrite');
      const photoStore = tx.objectStore('photos');
      const walkStore = tx.objectStore('walks');
      const existing = await photoStore.get(photoId);
      if (!existing || existing.walkId !== walk.id) {
        await tx.done;
        return this.readPhotosCommitted(db, walk.id);
      }
      await photoStore.delete(photoId);
      const remaining = sortPhotos(
        await photoStore.index('byWalkId').getAll(walk.id),
      );
      for (let i = 0; i < remaining.length; i++) {
        const next = { ...remaining[i], order: i };
        remaining[i] = next;
        await photoStore.put(next);
      }
      await walkStore.put({ ...walk, updatedAt: Date.now() });
      await tx.done;
      return remaining;
    });
  }

  updateNote(photoId: string, note: string): Promise<void> {
    return this.enqueue('updateNote', async () => {
      await dbTestHooks.beforeQueuedTransaction?.('updateNote');
      const db = await openDatabase();
      const walk = await this.readCurrentWalk(db);
      if (!walk) throw new StorageError('unknown', 'No walk', { precondition: true });
      const tx = db.transaction(['photos', 'walks'], 'readwrite');
      const photo = await tx.objectStore('photos').get(photoId);
      if (!photo || photo.walkId !== walk.id) {
        throw new StorageError('unknown', 'Photo not found', { precondition: true });
      }
      await tx.objectStore('photos').put({ ...photo, note });
      await tx.objectStore('walks').put({ ...walk, updatedAt: Date.now() });
      await tx.done;
    });
  }

  updateJobId(jobId: string): Promise<void> {
    return this.enqueue('updateJobId', async () => {
      await dbTestHooks.beforeQueuedTransaction?.('updateJobId');
      const db = await openDatabase();
      const walk = await this.readCurrentWalk(db);
      if (!walk) throw new StorageError('unknown', 'No walk', { precondition: true });
      const tx = db.transaction('walks', 'readwrite');
      await tx.store.put({ ...walk, jobId, updatedAt: Date.now() });
      await tx.done;
    });
  }

  setStatus(status: WalkStatus): Promise<void> {
    const waitForIdle =
      status === 'paused'
        ? new Promise<void>((resolve, reject) => {
            const check = () => {
              // A blocked queue means pending saves failed: settle pause
              // promptly instead of spinning busy until a manual retry.
              if (this.blockedJob) {
                reject(
                  this.lastError ??
                    new StorageError('unknown', 'Save failed before pause'),
                );
                return;
              }
              if (this.pending.length > 0 || this.running) {
                setTimeout(check, 0);
                return;
              }
              resolve();
            };
            check();
          })
        : Promise.resolve();
    return waitForIdle.then(() =>
      this.enqueue('setStatus', async () => {
        await dbTestHooks.beforeQueuedTransaction?.('setStatus');
        const db = await openDatabase();
        const walk = await this.readCurrentWalk(db);
        if (!walk) throw new StorageError('unknown', 'No walk', { precondition: true });
        const tx = db.transaction('walks', 'readwrite');
        await tx.store.put({ ...walk, status, updatedAt: Date.now() });
        await tx.done;
      }),
    );
  }

  clearWalk(): Promise<void> {
    return this.enqueue('clearWalk', async () => {
      await dbTestHooks.beforeQueuedTransaction?.('clearWalk');
      const db = await openDatabase();
      const walk = await this.readCurrentWalk(db);
      if (!walk) return;
      const tx = db.transaction(['photos', 'walks'], 'readwrite');
      const photoStore = tx.objectStore('photos');
      const photos = await photoStore.index('byWalkId').getAll(walk.id);
      for (const p of photos) {
        await photoStore.delete(p.id);
      }
      await tx.objectStore('walks').delete(walk.id);
      await tx.done;
    });
  }

  subscribeSaveState(listener: (state: SaveState, error?: StorageError) => void): () => void {
    this.listeners.add(listener);
    this.emitCurrent(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async retryPendingSaves(): Promise<void> {
    if (!this.blockedJob) {
      if (this.pending.length === 0 && !this.running) {
        this.emit('saved');
      }
      return;
    }
    const job = this.blockedJob;
    this.blockedJob = null;
    this.emit('unsaved');
    this.running = true;
    try {
      const result = await job.run();
      job.resolve(result);
      while (this.pending.length > 0) {
        const next = this.pending.shift()!;
        try {
          const nextResult = await next.run();
          next.resolve(nextResult);
        } catch (err) {
          const storageErr = toStorageError(err);
          this.blockedJob = next;
          next.reject(storageErr);
          this.emit('save-failed', storageErr);
          return;
        }
      }
      this.emit('saved');
    } catch (err) {
      const storageErr = toStorageError(err);
      this.blockedJob = job;
      job.reject(storageErr);
      this.emit('save-failed', storageErr);
    } finally {
      this.running = false;
    }
  }

  private async readCurrentWalk(db: IDBPDatabase<Pik2PdfDbSchema>): Promise<Walk | undefined> {
    const all = await db.transaction('walks').store.getAll();
    return all[0];
  }

  private async readPhotosForWalk(
    db: IDBPDatabase<Pik2PdfDbSchema>,
    walkId: string,
  ): Promise<WalkPhoto[]> {
    return sortPhotos(await db.transaction('photos').store.index('byWalkId').getAll(walkId));
  }

  private async readPhotosCommitted(
    db: IDBPDatabase<Pik2PdfDbSchema>,
    walkId: string,
  ): Promise<WalkPhoto[]> {
    return this.readPhotosForWalk(db, walkId);
  }
}

export type WalkStoreOptions = {
  /** Lock manager override (tests). Default: navigator.locks when present,
   *  otherwise null → the store fails closed as read-only. */
  lockManager?: LockManagerLike | null;
};

/** Build the app store. Without Web Locks support the store is read-only
 *  (fail closed) rather than trusting a non-cross-tab fallback. */
export function createWalkStore(options: WalkStoreOptions = {}): WalkStore {
  const lockManager =
    options.lockManager !== undefined ? options.lockManager : getLockManager();
  return new WalkStoreImpl(lockManager);
}