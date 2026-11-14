import { StorageError, type WalkStore } from '../lib/db';
import {
  MAX_PHOTOS,
  type HydrationResult,
  type SaveState,
  type Walk,
  type WalkPhoto,
  type WalkStatus,
} from '../types/walk';

export type FakeWalkStoreOptions = {
  writerLock?: boolean;
  initialHydration?: HydrationResult;
  initialSaveState?: SaveState;
};

let nextPhotoId = 1;

export function resetFakeWalkStoreIds(): void {
  nextPhotoId = 1;
}

export type FakeWalkStore = WalkStore & {
  injectSaveFailure: () => void;
  setWriterLock: (granted: boolean) => void;
  getPhotos: () => WalkPhoto[];
};

export function createFakeWalkStore(options: FakeWalkStoreOptions = {}): FakeWalkStore {
  const {
    writerLock: writerLockGranted = true,
    initialHydration = { status: 'empty' },
    initialSaveState = 'saved',
  } = options;

  let walk: Walk | null =
    initialHydration.status === 'ok' ? { ...initialHydration.walk } : null;
  let photos: WalkPhoto[] =
    initialHydration.status === 'ok' ? initialHydration.photos.map((p) => ({ ...p })) : [];
  let saveState: SaveState = initialSaveState;
  let saveError: StorageError | undefined =
    initialSaveState === 'save-failed'
      ? new StorageError('transaction', 'injected failure')
      : undefined;
  const listeners = new Set<(state: SaveState, error?: StorageError) => void>();
  let queueDepth = 0;
  let failNextMutation = false;
  let locked = false;

  const notify = () => {
    for (const listener of listeners) {
      listener(saveState, saveError);
    }
  };

  const enqueue = async (fn: () => Promise<void>) => {
    queueDepth += 1;
    saveState = 'unsaved';
    notify();
    try {
      if (failNextMutation) {
        failNextMutation = false;
        throw new StorageError('transaction', 'injected failure');
      }
      await fn();
      queueDepth -= 1;
      if (queueDepth === 0) {
        saveState = 'saved';
        saveError = undefined;
        notify();
      }
    } catch (err) {
      queueDepth = Math.max(0, queueDepth - 1);
      saveState = 'save-failed';
      saveError =
        err instanceof StorageError ? err : new StorageError('unknown', String(err));
      notify();
      throw err;
    }
  };

  const store: FakeWalkStore = {
    injectSaveFailure: () => {
      failNextMutation = true;
    },
    setWriterLock: (granted: boolean) => {
      locked = !granted;
    },
    getPhotos: () => photos,

    acquireWriterLock: async () => writerLockGranted && !locked,

    hydrate: async () => {
      if (!walk) return { status: 'empty' as const };
      return { status: 'ok' as const, walk: { ...walk }, photos: photos.map((p) => ({ ...p })) };
    },

    createWalk: async (jobId: string) => {
      const now = Date.now();
      walk = {
        id: 'walk-1',
        jobId,
        createdAt: now,
        updatedAt: now,
        status: 'active',
      };
      return { ...walk };
    },

    countPhotos: async () => photos.length,

    appendPhoto: async (photo: Omit<WalkPhoto, 'walkId'>) => {
      if (photos.length >= MAX_PHOTOS) {
        throw new StorageError('quota', 'at capacity');
      }
      let persisted!: WalkPhoto;
      await enqueue(async () => {
        if (!walk) throw new StorageError('unknown', 'no walk');
        persisted = {
          ...photo,
          walkId: walk.id,
          id: photo.id || `photo-${nextPhotoId++}`,
        };
        photos = [...photos, persisted].sort((a, b) => a.order - b.order);
        walk = { ...walk, updatedAt: Date.now() };
      });
      return persisted!;
    },

    removePhoto: async (photoId: string) => {
      await enqueue(async () => {
        photos = photos
          .filter((p) => p.id !== photoId)
          .map((p, i) => ({ ...p, order: i }));
        if (walk) walk = { ...walk, updatedAt: Date.now() };
      });
      return photos.map((p) => ({ ...p }));
    },

    updateNote: async (photoId: string, note: string) => {
      await enqueue(async () => {
        photos = photos.map((p) => (p.id === photoId ? { ...p, note } : p));
        if (walk) walk = { ...walk, updatedAt: Date.now() };
      });
    },

    updateJobId: async (jobId: string) => {
      await enqueue(async () => {
        if (!walk) return;
        walk = { ...walk, jobId, updatedAt: Date.now() };
      });
    },

    setStatus: async (status: WalkStatus) => {
      if (status === 'paused') {
        while (queueDepth > 0) {
          await new Promise<void>((resolve) => setTimeout(resolve, 0));
        }
      }
      await enqueue(async () => {
        if (!walk) return;
        walk = { ...walk, status, updatedAt: Date.now() };
      });
    },

    clearWalk: async () => {
      await enqueue(async () => {
        walk = null;
        photos = [];
      });
    },

    subscribeSaveState: (listener) => {
      listeners.add(listener);
      listener(saveState, saveError);
      return () => listeners.delete(listener);
    },

    retryPendingSaves: async () => {
      saveState = 'saved';
      saveError = undefined;
      queueDepth = 0;
      notify();
    },
  };

  return store;
}