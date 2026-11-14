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
//   failed (pause waits for pending saves before reporting success).
// - clearWalk clears walk + photos transactionally; caller confirms first;
//   visible state resets only after success.
// - Exclusive writer: acquireWriterLock() uses the Web Locks API ('pik-2-pdf'
 //  exclusive lock). Resolves false when another tab holds it → UI goes
//   read-only. Must be tested.
// - Recovery guarantee: the most recent acknowledged 'saved' state. getCommittedSnapshot() exists for recovery export.

import type { HydrationResult, SaveState, Walk, WalkPhoto, WalkStatus } from '../types/walk';

export type StorageErrorCode = 'quota' | 'transaction' | 'locked' | 'unknown';

export class StorageError extends Error {
  constructor(
    public code: StorageErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'StorageError';
  }
}

export interface WalkStore {
  /** Exclusive writer lock via Web Locks API. false → another tab owns
   *  writes and this instance must not mutate; UI must go read-only. */
  acquireWriterLock(): Promise<boolean>;
  /** Load the current walk + photos (photos sorted by `order`). Resolves
   *  {status:'empty'} when no walk exists yet. Throws StorageError. */
  hydrate(): Promise<HydrationResult>;
  /** Create the single current walk. */
  createWalk(jobId: string): Promise<Walk>;
  /** Number of committed photos (for capacity gating). */
  countPhotos(): Promise<number>;
  /** Transactionally persist one normalized photo + walk metadata.
   *  Throws StorageError('quota') at MAX_PHOTOS committed. Resolves the
   *  persisted record after the transaction commits (save acknowledgment). */
  appendPhoto(photo: Omit<WalkPhoto, 'walkId'>): Promise<WalkPhoto>;
  /** Transactional removal + renumbering. Resolves remaining photos sorted by order. */
  removePhoto(photoId: string): Promise<WalkPhoto[]>;
  /** Queue a note update (max MAX_NOTE_CHARS enforced upstream). */
  updateNote(photoId: string, note: string): Promise<void>;
  /** Queue a job/lot ID update ('' allowed). */
  updateJobId(jobId: string): Promise<void>;
  /** Persist pause/resume. 'paused' waits for pending saves before resolving. */
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

/** FOUNDATION STUB — storage agent replaces the internals of this module,
 *  keeping every exported signature identical. */
export function createWalkStore(): WalkStore {
  throw new Error(
    'NOT IMPLEMENTED: createWalkStore is the storage agent’s task (src/lib/db.ts). Keep the WalkStore API.',
  );
}
