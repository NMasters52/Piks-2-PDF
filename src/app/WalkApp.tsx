import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  MAX_PARKED_DRAFTS,
  StorageError,
  type ExportEdit,
  type RecentExport,
  type ParkedDraft,
  type SwitchWalkOptions,
  type WalkStore,
} from '../lib/db';
import { DecodeError } from '../lib/images';
import { PdfExportError, type ExportSnapshot } from '../lib/pdf';
import { CaptureControls } from '../components/CaptureControls';
import { CapacityIndicator } from '../components/CapacityIndicator';
import { ExportControls } from '../components/ExportControls';
import {
  FailedImportList,
  type FailedImport,
} from '../components/FailedImportList';
import { JobIdField } from '../components/JobIdField';
import { PauseResumeControls } from '../components/PauseResumeControls';
import { PhotoQueue } from '../components/PhotoQueue';
import { RecentExportsDialog, openExport } from '../components/RecentExportsDialog';
import { ReadOnlyBanner } from '../components/ReadOnlyBanner';
import { SaveStatusBanner } from '../components/SaveStatusBanner';
import { ThemeToggle } from '../components/ThemeToggle';
import { WalkSwitchDialog, type WalkPrompt } from '../components/WalkSwitchDialog';
import {
  MAX_PHOTOS,
  canAcceptSelection,
  remainingPhotoCapacity,
  type HydrationResult,
  type SaveState,
  type Walk,
  type WalkPhoto,
} from '../types/walk';
import type { AppDeps } from './deps';

function fileKey(file: File): string {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

async function blobToArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  return blob.arrayBuffer();
}

type WalkAppProps = {
  deps: AppDeps;
};

export function WalkApp({ deps }: WalkAppProps) {
  const storeRef = useRef<WalkStore | null>(null);
  const storeCleanupRef = useRef<Promise<void>>(Promise.resolve());
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);
  const exportInFlightRef = useRef(false);
  const importChainRef = useRef<Promise<void>>(Promise.resolve());

  const [hydrating, setHydrating] = useState(true);
  const [upgradeBlocked, setUpgradeBlocked] = useState(false);
  const [readOnly, setReadOnly] = useState(false);
  const [walk, setWalk] = useState<Walk | null>(null);
  const [photos, setPhotos] = useState<WalkPhoto[]>([]);
  const [jobIdInput, setJobIdInput] = useState('');
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [saveError, setSaveError] = useState<import('../lib/db').StorageError | undefined>();
  const [inFlightCount, setInFlightCount] = useState(0);
  const [capacityMessage, setCapacityMessage] = useState<string | null>(null);
  const importPhotoIdsRef = useRef(new Map<string, string>());
  const [failedImports, setFailedImports] = useState<FailedImport[]>([]);
  const [retryingImportKey, setRetryingImportKey] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [pauseBusy, setPauseBusy] = useState(false);
  const [retrySaveBusy, setRetrySaveBusy] = useState(false);
  const [walkPrompt, setWalkPrompt] = useState<WalkPrompt | null>(null);
  const [drafts, setDrafts] = useState<ParkedDraft[]>([]);
  const [loadingDrafts, setLoadingDrafts] = useState(false);
  const [switchingWalk, setSwitchingWalk] = useState(false);
  const [walkSwitchError, setWalkSwitchError] = useState<string | null>(null);
  const [recentPrompt, setRecentPrompt] = useState<'history' | 'replace' | 'cancel-edit' | null>(null);
  const [recentExports, setRecentExports] = useState<RecentExport[]>([]);
  const [recentBusy, setRecentBusy] = useState(false);
  const [recentError, setRecentError] = useState<string | null>(null);
  const [exportEdit, setExportEdit] = useState<ExportEdit>();
  const restorePositionRef = useRef<ExportEdit | undefined>(undefined);
  const suspendedFailuresRef = useRef<FailedImport[]>([]);
  const draftRequestRef = useRef(0);
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<{
    photosDone: number;
    totalPhotos: number;
  } | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportWarnings, setExportWarnings] = useState<string[]>([]);
  const [exportBytes, setExportBytes] = useState<Uint8Array | null>(null);
  const [exportFilename, setExportFilename] = useState<string | null>(null);
  const [isRecoveryExport, setIsRecoveryExport] = useState(false);
  const exportObjectUrlRef = useRef<string | null>(null);

  useEffect(() => {
    const nextStore = deps.createStore();
    storeRef.current = nextStore;
    let unsub: (() => void) | undefined;

    let cancelled = false;

    const previousCleanup = storeCleanupRef.current;
    const initialization = (async () => {
      await previousCleanup;
      if (cancelled) return;
      const writable = await nextStore.acquireWriterLock();
      if (cancelled) {
        // StrictMode remount: give the lock back so the live store can take it.
        void nextStore.releaseWriterLock();
        return;
      }
      setReadOnly(!writable);
      const [hydration, edit] = await Promise.all([
        nextStore.hydrate(() => { if (!cancelled) setUpgradeBlocked(true); }),
        nextStore.getExportEdit(),
      ]);
      if (cancelled) return;
      setExportEdit(edit);
      if (hydration.status === 'ok') {
        setWalk(hydration.walk);
        setPhotos(hydration.photos);
        setJobIdInput(hydration.walk.jobId);
      }
      unsub = nextStore.subscribeSaveState((state, err) => {
        if (!cancelled) {
          setSaveState(state);
          setSaveError(err);
        }
      });
      setUpgradeBlocked(false);
      setHydrating(false);
    })();

    return () => {
      cancelled = true;
      unsub?.();
      storeCleanupRef.current = initialization.then(() => nextStore.releaseWriterLock());
      if (exportObjectUrlRef.current) URL.revokeObjectURL(exportObjectUrlRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount once per store instance
  }, [deps]);

  useLayoutEffect(() => {
    const position = restorePositionRef.current;
    if (!position) return;
    restorePositionRef.current = undefined;
    const photo = position.photoId
      ? document.querySelector(`[data-photo-id="${CSS.escape(position.photoId)}"]`)
      : null;
    const top = photo
      ? window.scrollY + photo.getBoundingClientRect().top - (position.photoOffset ?? 0)
      : position.scrollY;
    window.scrollTo(0, top);
  }, [walk]);

  const committedCount = photos.length;
  const additionsBlocked =
    readOnly ||
    saveState === 'save-failed' ||
    walk?.status === 'paused' ||
    committedCount + inFlightCount >= MAX_PHOTOS;

  // Mutual exclusion (playbook: prevent import/export/clear races; disable
  // mutations during snapshot/export for this MVP).
  const exportLocked = inFlightCount > 0 || switchingWalk || removingId !== null;
  const mutationsLocked = exporting || walkPrompt !== null || recentPrompt !== null || switchingWalk;
  const writeBusy = readOnly || exportLocked || pauseBusy || retrySaveBusy || saveState !== 'saved';
  // Cancel edit stays available on 'save-failed': the discard path is the
  // escape hatch that keeps the interrupted walk reachable.
  const cancelEditLocked = readOnly || exportLocked || pauseBusy || retrySaveBusy;
  const walkSwitchLocked = writeBusy || mutationsLocked || !!exportEdit;
  const hasCurrentWork = !!walk || jobIdInput.trim() !== '' || failedImports.length > 0;

  const captureDisabledReason = useMemo(() => {
    if (readOnly) return 'This tab is read-only.';
    if (saveState === 'save-failed') return 'Saving failed — retry save or use recovery export.';
    if (walk?.status === 'paused') return 'Walk is paused. Resume to add photos.';
    if (committedCount + inFlightCount >= MAX_PHOTOS) {
      return `At the ${MAX_PHOTOS}-photo limit. Remove a photo to free a space.`;
    }
    return undefined;
  }, [readOnly, saveState, walk?.status, committedCount, inFlightCount]);

  const ensureWalk = useCallback(async (): Promise<Walk> => {
    const s = storeRef.current!;
    if (walk) return walk;
    const created = await s.createWalk(jobIdInput);
    setWalk(created);
    return created;
  }, [walk, jobIdInput]);

  const persistJobId = useCallback(
    (value: string) => {
      if (readOnly || !storeRef.current) return;
      // No walk yet: keep the value in state; ensureWalk() creates the walk
      // with it. The header shows 'Unsaved changes' for this pre-walk case.
      if (!walk) return;
      // Persist immediately (no debounce): the save queue is cheap for
      // metadata, and an immediate 'unsaved' keeps the indicator honest.
      void storeRef.current
        .updateJobId(value)
        .then(() => setWalk((w) => (w ? { ...w, jobId: value } : w)))
        .catch(() => undefined);
    },
    [readOnly, walk],
  );

  const handleJobIdChange = (value: string) => {
    setJobIdInput(value);
    persistJobId(value);
  };

  const importOne = useCallback(
    async (file: File, nextOrder: number) => {
      const s = storeRef.current!;
      const normalized = await deps.normalizeImageFile(file);
      const id = globalThis.crypto?.randomUUID?.() ?? `photo-${Date.now()}-${nextOrder}`;
      importPhotoIdsRef.current.set(fileKey(file), id);
      const saved = await s.appendPhoto({
        id,
        blob: normalized.blob,
        mimeType: normalized.mimeType,
        width: normalized.width,
        height: normalized.height,
        note: '',
        createdAt: Date.now(),
        order: nextOrder,
      });
      importPhotoIdsRef.current.delete(fileKey(file));
      setPhotos((prev) => [...prev, saved].sort((a, b) => a.order - b.order));
      setWalk((w) => (w ? { ...w, updatedAt: Date.now() } : w));
    },
    [deps],
  );

  const processFilesInOrder = useCallback(
    (files: File[]) => {
      const s = storeRef.current;
      if (!s || readOnly) return;

      const selectionCount = files.length;
      const remaining = remainingPhotoCapacity(committedCount);
      if (!canAcceptSelection(selectionCount, committedCount, inFlightCount)) {
        setCapacityMessage(
          `That selection has ${selectionCount} photos but only ${Math.max(
            0,
            remaining - inFlightCount,
          )} spaces remain. Nothing was imported.`,
        );
        return Promise.resolve();
      }
      setCapacityMessage(null);

      setInFlightCount((n) => n + selectionCount);
      importChainRef.current = importChainRef.current.then(async () => {
        try {
          await ensureWalk();
          const s = storeRef.current!;
          for (let i = 0; i < files.length; i += 1) {
            const file = files[i]!;
            const key = fileKey(file);
            try {
              const order = await s.countPhotos();
              await importOne(file, order);
              setFailedImports((prev) => prev.filter((f) => f.key !== key));
            } catch (err) {
              const message =
                err instanceof DecodeError
                  ? err.message
                  : err instanceof Error
                    ? err.message
                    : 'Import failed';
              setFailedImports((prev) => {
                const without = prev.filter((f) => f.key !== key);
                return [...without, { key, name: file.name, file, message }];
              });
            } finally {
              setInFlightCount((n) => Math.max(0, n - 1));
            }
          }
        } catch {
          setInFlightCount((n) => Math.max(0, n - selectionCount));
        }
      });
      return importChainRef.current;
    },
    [readOnly, committedCount, inFlightCount, ensureWalk, importOne],
  );

  const handleFileSelection = (fileList: FileList | null) => {
    if (mutationsLocked || !fileList || fileList.length === 0) return;
    const files = Array.from(fileList);
    processFilesInOrder(files);
  };

  const retryFailedImport = (key: string) => {
    const item = failedImports.find((f) => f.key === key);
    if (!item || readOnly || additionsBlocked || mutationsLocked) return;
    setRetryingImportKey(key);
    void processFilesInOrder([item.file])?.finally(() => setRetryingImportKey(null));
  };

  const handleNoteChange = (photoId: string, note: string) => {
    if (readOnly || mutationsLocked || !storeRef.current) return;
    let previous = '';
    setPhotos((prev) =>
      prev.map((p) => {
        if (p.id === photoId) previous = p.note;
        return p.id === photoId ? { ...p, note } : p;
      }),
    );
    void storeRef.current.updateNote(photoId, note).catch((err) => {
      // Precondition miss (photo removed elsewhere/earlier): revert the
      // optimistic edit instead of showing a note that is not persisted.
      if (err instanceof StorageError && err.precondition) {
        setPhotos((cur) =>
          cur.map((p) => (p.id === photoId ? { ...p, note: previous } : p)),
        );
      }
    });
  };

  const handleRemove = async (photoId: string) => {
    if (readOnly || !storeRef.current) return;
    setRemovingId(photoId);
    try {
      const remaining = await storeRef.current.removePhoto(photoId);
      // Merge, don't replace: notes edited while the removal was pending must
      // survive (they queue after the removal and commit newer values).
      setPhotos((prev) =>
        remaining.map((r) => {
          const newer = prev.find((p) => p.id === r.id);
          return newer ? { ...r, note: newer.note } : r;
        }),
      );
    } finally {
      setRemovingId(null);
    }
  };

  const handlePause = async () => {
    if (readOnly || !storeRef.current || !walk) return;
    setPauseBusy(true);
    try {
      await storeRef.current.setStatus('paused');
      setWalk({ ...walk, status: 'paused' });
    } catch {
      // Queue blocked on a save failure: pause refuses; banner already shows why.
    } finally {
      setPauseBusy(false);
    }
  };

  const handleResume = async () => {
    if (readOnly || !storeRef.current || !walk) return;
    setPauseBusy(true);
    try {
      await storeRef.current.setStatus('active');
      setWalk({ ...walk, status: 'active' });
    } finally {
      setPauseBusy(false);
    }
  };

  const handleRetrySave = async () => {
    if (!storeRef.current) return;
    setRetrySaveBusy(true);
    try {
      await storeRef.current.retryPendingSaves();
      // A retried mutation's original caller has already handled the
      // rejection; reconcile visible state from committed data so recovered
      // records actually appear (photos, cleared walks, metadata).
      const hydration = await storeRef.current.hydrate();
      if (hydration.status === 'ok') {
        setWalk(hydration.walk);
        setPhotos(hydration.photos);
        setJobIdInput(hydration.walk.jobId);
        // Match storage retries to their original file, preserving unrelated
        // decode failures without offering to import recovered photos twice.
        const committedIds = new Set(hydration.photos.map((photo) => photo.id));
        const recoveredKeys = new Set<string>();
        for (const [key, id] of importPhotoIdsRef.current) {
          if (committedIds.has(id)) {
            recoveredKeys.add(key);
            importPhotoIdsRef.current.delete(key);
          }
        }
        setFailedImports((current) => current.filter((item) => !recoveredKeys.has(item.key)));
      } else {
        setWalk(null);
        setPhotos([]);
        setFailedImports([]);
      }
    } catch {
      // Banner already shows the failure; keep it.
    } finally {
      setRetrySaveBusy(false);
    }
  };

  const resetExportArtifact = () => {
    if (exportObjectUrlRef.current) {
      URL.revokeObjectURL(exportObjectUrlRef.current);
      exportObjectUrlRef.current = null;
    }
    setExportBytes(null);
    setExportFilename(null);
    setExportError(null);
    setExportProgress(null);
    setExportWarnings([]);
    setIsRecoveryExport(false);
  };

  const showWalk = (next: HydrationResult, unstartedJobId = '', failures: FailedImport[] = []) => {
    setWalk(next.status === 'ok' ? next.walk : null);
    setPhotos(next.status === 'ok' ? next.photos : []);
    setJobIdInput(next.status === 'ok' ? next.walk.jobId : unstartedJobId);
    importPhotoIdsRef.current.clear();
    setFailedImports(failures);
    setCapacityMessage(null);
  };

  const restoreWalk = (next: HydrationResult, edit: ExportEdit) => {
    restorePositionRef.current = edit;
    showWalk(next, edit.unstartedJobId, suspendedFailuresRef.current);
    suspendedFailuresRef.current = [];
    setExportEdit(undefined);
  };

  const showRecentExports = async () => {
    setRecentPrompt('history');
    setRecentError(null);
    setRecentBusy(true);
    try {
      setRecentExports(await storeRef.current!.listRecentExports());
    } catch {
      setRecentExports([]);
      setRecentError('Could not load recent exports. Close and try again.');
    } finally {
      setRecentBusy(false);
    }
  };

  const beginExportEdit = async (id: string) => {
    const entry = recentExports.find(({ walk }) => walk.id === id);
    if (!entry || writeBusy || recentBusy || exportEdit) return;
    const photo = Array.from(document.querySelectorAll<HTMLElement>('[data-photo-id]'))
      .find((item) => item.getBoundingClientRect().bottom > 64);
    const position = {
      scrollY: window.scrollY,
      photoId: window.scrollY > 0 ? photo?.dataset.photoId : undefined,
      photoOffset: photo?.getBoundingClientRect().top,
      unstartedJobId: walk ? undefined : jobIdInput,
    };
    setRecentBusy(true);
    setRecentError(null);
    try {
      const next = await storeRef.current!.beginExportEdit(id, position);
      suspendedFailuresRef.current = failedImports;
      setExportEdit({ ...position, previous: { filename: entry.filename, pdf: entry.pdf } });
      showWalk(next);
      resetExportArtifact();
      setRecentExports([]);
      setRecentPrompt(null);
      window.scrollTo(0, 0);
    } catch {
      setRecentError('Could not open the export for editing. Try again.');
    } finally {
      setRecentBusy(false);
    }
  };

  const cancelExportEdit = async () => {
    if (!exportEdit || cancelEditLocked || recentBusy) return;
    setRecentBusy(true);
    setRecentError(null);
    try {
      // A blocked save queue rejects finishExportEdit outright; discard drops
      // the parked edit saves so the interrupted walk stays reachable even
      // when saving keeps failing.
      const next = saveState === 'save-failed'
        ? await storeRef.current!.discardExportEdit()
        : await storeRef.current!.finishExportEdit();
      restoreWalk(next, exportEdit);
      resetExportArtifact();
      setRecentPrompt(null);
    } catch {
      setRecentError('Could not return to the interrupted walk. Try again.');
    } finally {
      setRecentBusy(false);
    }
  };

  const runExport = async (recovery = false) => {
    if (!walk || photos.length === 0 || exportInFlightRef.current) return;
    exportInFlightRef.current = true;
    setExporting(true);
    resetExportArtifact();
    setIsRecoveryExport(recovery);

    try {
      const snapshot: ExportSnapshot = {
        jobId: jobIdInput,
        walkCreatedAt: walk.createdAt,
        photos: await Promise.all(
          [...photos].sort((a, b) => a.order - b.order).map(async (p) => ({
            order: p.order + 1,
            jpegBytes: await blobToArrayBuffer(p.blob),
            width: p.width,
            height: p.height,
            note: p.note,
          })),
        ),
      };

      const result = await deps.renderWalkPdf(snapshot, (info) => setExportProgress(info));
      const warnings = [...(result.warnings ?? [])];
      const artifact = {
        filename: result.filename,
        pdf: new Blob([new Uint8Array(result.bytes)], { type: 'application/pdf' }),
      };
      if (exportEdit && !recovery) {
        try {
          const next = await storeRef.current!.finishExportEdit(artifact);
          restoreWalk(next, exportEdit);
        } catch {
          // Storage refused the replacement (e.g. quota): keep the edit
          // session and the previous entry intact, but still expose the
          // rendered PDF so the user can keep a copy outside the app.
          warnings.push('Could not save the corrected export to Recent exports. Download it to keep a copy.');
        }
      } else if (!recovery) {
        try {
          await storeRef.current!.saveRecentExport({
            ...artifact,
            walk: { ...walk, jobId: jobIdInput },
            photos,
          });
        } catch {
          warnings.push('Could not save this PDF to Recent exports. Download it to keep a copy.');
        }
      }
      setExportBytes(result.bytes);
      setExportFilename(result.filename);
      setExportWarnings(warnings);
    } catch (err) {
      if (err instanceof PdfExportError && err.code === 'worker') return;
      setExportError(err instanceof Error ? err.message : 'Export failed');
    } finally {
      exportInFlightRef.current = false;
      setExporting(false);
    }
  };

  const requestExport = () => {
    if (exportEdit) {
      setRecentError(null);
      setRecentPrompt('replace');
      return;
    }
    window.scrollTo(0, 0);
    void runExport();
  };

  const handleShare = async () => {
    if (!exportBytes || !exportFilename) return;
    const file = new File([new Uint8Array(exportBytes)], exportFilename, {
      type: 'application/pdf',
    });
    try {
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file] });
      } else {
        throw new Error('share unavailable');
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return;
      }
      handleDownload();
    }
  };

  const handleDownload = () => {
    if (!exportBytes || !exportFilename) return;
    if (exportObjectUrlRef.current) URL.revokeObjectURL(exportObjectUrlRef.current);
    const url = URL.createObjectURL(
      new Blob([new Uint8Array(exportBytes)], { type: 'application/pdf' }),
    );
    exportObjectUrlRef.current = url;
    const a = document.createElement('a');
    a.href = url;
    a.download = exportFilename;
    a.click();
  };

  const dismissWalkPrompt = () => {
    draftRequestRef.current += 1;
    setLoadingDrafts(false);
    setWalkPrompt(null);
    setWalkSwitchError(null);
  };

  const loadDrafts = async () => {
    const store = storeRef.current;
    if (!store) return;
    const request = ++draftRequestRef.current;
    setLoadingDrafts(true);
    setWalkSwitchError(null);
    try {
      const parked = await store.listDrafts();
      if (draftRequestRef.current !== request) return;
      setDrafts(parked);
      return parked;
    } catch {
      if (draftRequestRef.current === request) {
        setDrafts([]);
        setWalkSwitchError('Could not load drafts. Try again.');
      }
    } finally {
      if (draftRequestRef.current === request) setLoadingDrafts(false);
    }
  };

  const switchWalk = async (options: SwitchWalkOptions) => {
    const store = storeRef.current;
    if (!store || switchingWalk) return;
    setSwitchingWalk(true);
    setWalkSwitchError(null);
    try {
      const next = await store.switchWalk(options);
      showWalk(next);
      resetExportArtifact();
      dismissWalkPrompt();
      window.scrollTo(0, 0);
    } catch {
      setWalkSwitchError('Could not switch walks. Try again or keep editing.');
    } finally {
      setSwitchingWalk(false);
    }
  };

  const parkCurrentWalk = async () => {
    if (walkPrompt?.kind === 'reopen') {
      await switchWalk({ current: 'park', draftId: walkPrompt.draft.id });
      return;
    }
    const parked = await loadDrafts();
    if (!parked) return;
    if (parked.length >= MAX_PARKED_DRAFTS) {
      setWalkPrompt({ kind: 'replace' });
    } else {
      await switchWalk({ current: 'park' });
    }
  };

  if (hydrating) {
    return (
      <main className="walk-page mx-auto min-h-dvh max-w-2xl border bg-surface p-4 pb-32 sm:px-6">
        <p className="text-sm">Loading walk…</p>
        <p className="text-sm" role="status">
          {upgradeBlocked ? 'Close or reload any other Pik-2-PDF tabs to finish loading.' : null}
        </p>
      </main>
    );
  }

  const walkStatus = walk?.status ?? 'active';
  // A job ID typed before the walk exists lives only in state — never show
  // 'Saved' for it.
  const effectiveSaveState: SaveState =
    saveState === 'saved' && !walk && jobIdInput.trim() !== '' ? 'unsaved' : saveState;

  return (
    <main className="walk-page mx-auto min-h-dvh max-w-2xl border bg-surface p-4 pb-32 sm:px-6">
      <header className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold tracking-tight">Pik-2-PDF</h1>
        <div className="ml-auto flex flex-wrap items-center gap-x-3">
          <SaveStatusBanner
            saveState={effectiveSaveState}
            error={saveError}
            onRetry={handleRetrySave}
            onRecoveryExport={() => runExport(true)}
            retrying={retrySaveBusy}
          />
          <button
            type="button"
            className="min-h-11 px-2 text-sm font-medium underline underline-offset-4 disabled:opacity-50"
            disabled={walkSwitchLocked}
            onClick={() => {
              setWalkPrompt({ kind: 'drafts' });
              void loadDrafts();
            }}
          >
            Drafts
          </button>
          <ThemeToggle />
        </div>
      </header>
      <nav aria-label="Walk actions" className="walk-toolbar sticky top-0 z-10 mb-3 grid grid-cols-4 gap-2 border-b bg-surface py-2 text-sm">
        <button
          type="button"
          disabled={readOnly || exportLocked || photos.length === 0 || mutationsLocked || (!!exportEdit && writeBusy)}
          onClick={requestExport}
        >
          {exporting ? 'Generating PDF…' : exportEdit ? 'Export Edited PDF' : isRecoveryExport ? 'Recovery export PDF' : 'Export PDF'}
        </button>
        <button
          type="button"
          disabled={exportEdit ? cancelEditLocked || mutationsLocked : !hasCurrentWork || walkSwitchLocked}
          onClick={() => {
            if (exportEdit) {
              setRecentError(null);
              setRecentPrompt('cancel-edit');
            } else {
              setWalkPrompt({ kind: 'new' });
            }
          }}
        >
          {exportEdit ? 'Cancel edit' : 'New walk'}
        </button>
        <button type="button" disabled={!photos.length} onClick={() => window.scrollTo(0, document.documentElement.scrollHeight)}>
          Jump to bottom ↓
        </button>
        <button
          type="button"
          className="min-h-11 px-2 text-sm font-medium underline underline-offset-4 disabled:opacity-50"
          disabled={mutationsLocked}
          onClick={showRecentExports}
        >
          Recent exports
        </button>
      </nav>
      <p className="mb-4 text-xs text-muted">
        Saved means on this device only — export and keep PDFs in Files as your backup.
      </p>
      {exportEdit && <p className="mb-2 text-sm font-medium">Editing a recent export</p>}
      <ExportControls
        exporting={exporting}
        exportProgress={exportProgress}
        exportError={exportError}
        exportReady={exportFilename ? { filename: exportFilename } : null}
        exportWarnings={exportWarnings}
        onShare={handleShare}
        onDownload={handleDownload}
        onDismissExport={resetExportArtifact}
        onRetryExport={() => isRecoveryExport ? void runExport(true) : requestExport()}
      />


      {readOnly ? <ReadOnlyBanner /> : null}



      <JobIdField value={jobIdInput} onChange={handleJobIdChange} disabled={readOnly || mutationsLocked} />

      <CapacityIndicator committedCount={committedCount} inFlightCount={inFlightCount} />

      {capacityMessage ? (
        <p className="mb-3 border border-foreground px-3 py-2 text-sm" role="alert">
          {capacityMessage}
        </p>
      ) : null}

      <CaptureControls
        cameraInputRef={cameraRef}
        libraryInputRef={libraryRef}
        onCameraChange={handleFileSelection}
        onLibraryChange={handleFileSelection}
        disabled={additionsBlocked || mutationsLocked}
        disabledReason={captureDisabledReason}
      />

      <FailedImportList
        failures={failedImports}
        onRetry={retryFailedImport}
        retryingKey={retryingImportKey}
      />

      {walk ? (
        <PauseResumeControls
          status={walkStatus}
          onPause={handlePause}
          onResume={handleResume}
          disabled={readOnly || mutationsLocked}
          busy={pauseBusy}
        />
      ) : null}

      <PhotoQueue
        photos={photos}
        onNoteChange={handleNoteChange}
        onRemove={handleRemove}
        disabled={readOnly || mutationsLocked}
        removingId={removingId}
      />

      {recentPrompt && (
        <RecentExportsDialog
          mode={recentPrompt}
          entries={recentExports}
          loading={recentBusy}
          error={recentError}
          canEdit={!writeBusy && !exportEdit}
          onEdit={(id) => void beginExportEdit(id)}
          onReplace={(downloadPrevious) => {
            if (!exportEdit || writeBusy || exportInFlightRef.current) return;
            if (downloadPrevious) openExport(exportEdit.previous, true);
            setRecentPrompt(null);
            window.scrollTo(0, 0);
            void runExport();
          }}
          onCancelEdit={() => void cancelExportEdit()}
          onClose={() => {
            setRecentExports([]);
            setRecentPrompt(null);
          }}
        />
      )}
      {walkPrompt && (
        <WalkSwitchDialog
          prompt={walkPrompt}
          drafts={drafts}
          loading={loadingDrafts}
          busy={switchingWalk}
          error={walkSwitchError}
          canPark={!!walk}
          onOpenDraft={(draft) => {
            if (hasCurrentWork) {
              setWalkSwitchError(null);
              setWalkPrompt({ kind: 'reopen', draft });
            } else {
              void switchWalk({ current: 'none', draftId: draft.id });
            }
          }}
          onPark={parkCurrentWalk}
          onReplace={(replaceDraftId) => void switchWalk({ current: 'park', replaceDraftId })}
          onDiscard={() => void switchWalk({
            current: walk ? 'discard' : 'none',
            draftId: walkPrompt.kind === 'reopen' ? walkPrompt.draft.id : undefined,
          })}
          onRetryDrafts={loadDrafts}
          onCancel={dismissWalkPrompt}
        />
      )}
    </main>
  );
}
