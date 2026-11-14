import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { WalkStore } from '../lib/db';
import { DecodeError } from '../lib/images';
import { PdfExportError, type ExportSnapshot } from '../lib/pdf';
import { CaptureControls } from '../components/CaptureControls';
import { CapacityIndicator } from '../components/CapacityIndicator';
import { ClearWalkDialog } from '../components/ClearWalkDialog';
import { ExportControls } from '../components/ExportControls';
import {
  FailedImportList,
  type FailedImport,
} from '../components/FailedImportList';
import { JobIdField } from '../components/JobIdField';
import { PauseResumeControls } from '../components/PauseResumeControls';
import { PhotoQueue } from '../components/PhotoQueue';
import { ReadOnlyBanner } from '../components/ReadOnlyBanner';
import { SaveStatusBanner } from '../components/SaveStatusBanner';
import {
  MAX_PHOTOS,
  canAcceptSelection,
  remainingPhotoCapacity,
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
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);
  const exportInFlightRef = useRef(false);
  const jobIdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const importChainRef = useRef<Promise<void>>(Promise.resolve());

  const [hydrating, setHydrating] = useState(true);
  const [readOnly, setReadOnly] = useState(false);
  const [walk, setWalk] = useState<Walk | null>(null);
  const [photos, setPhotos] = useState<WalkPhoto[]>([]);
  const [jobIdInput, setJobIdInput] = useState('');
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [saveError, setSaveError] = useState<import('../lib/db').StorageError | undefined>();
  const [inFlightCount, setInFlightCount] = useState(0);
  const [capacityMessage, setCapacityMessage] = useState<string | null>(null);
  const [failedImports, setFailedImports] = useState<FailedImport[]>([]);
  const [retryingImportKey, setRetryingImportKey] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [pauseBusy, setPauseBusy] = useState(false);
  const [retrySaveBusy, setRetrySaveBusy] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<{
    photosDone: number;
    totalPhotos: number;
  } | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportBytes, setExportBytes] = useState<Uint8Array | null>(null);
  const [exportFilename, setExportFilename] = useState<string | null>(null);
  const [isRecoveryExport, setIsRecoveryExport] = useState(false);
  const exportObjectUrlRef = useRef<string | null>(null);

  useEffect(() => {
    const nextStore = deps.createStore();
    storeRef.current = nextStore;
    let unsub: (() => void) | undefined;

    let cancelled = false;

    void (async () => {
      const writable = await nextStore.acquireWriterLock();
      if (cancelled) return;
      setReadOnly(!writable);
      const hydration = await nextStore.hydrate();
      if (cancelled) return;
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
      setHydrating(false);
    })();

    return () => {
      cancelled = true;
      unsub?.();
      if (exportObjectUrlRef.current) URL.revokeObjectURL(exportObjectUrlRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount once per store instance
  }, [deps]);

  const committedCount = photos.length;
  const additionsBlocked =
    readOnly ||
    saveState === 'save-failed' ||
    walk?.status === 'paused' ||
    committedCount + inFlightCount >= MAX_PHOTOS;

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
      if (jobIdTimerRef.current) clearTimeout(jobIdTimerRef.current);
      jobIdTimerRef.current = setTimeout(() => {
        void storeRef.current?.updateJobId(value).catch(() => undefined);
      }, 300);
    },
    [readOnly],
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
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList);
    processFilesInOrder(files);
  };

  const retryFailedImport = (key: string) => {
    const item = failedImports.find((f) => f.key === key);
    if (!item || readOnly || additionsBlocked) return;
    setRetryingImportKey(key);
    void processFilesInOrder([item.file])?.finally(() => setRetryingImportKey(null));
  };

  const handleNoteChange = (photoId: string, note: string) => {
    if (readOnly || !storeRef.current) return;
    setPhotos((prev) => prev.map((p) => (p.id === photoId ? { ...p, note } : p)));
    void storeRef.current.updateNote(photoId, note).catch(() => undefined);
  };

  const handleRemove = async (photoId: string) => {
    if (readOnly || !storeRef.current) return;
    setRemovingId(photoId);
    try {
      const remaining = await storeRef.current.removePhoto(photoId);
      setPhotos(remaining);
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
    setIsRecoveryExport(false);
  };

  const runExport = useCallback(
    async (recovery = false) => {
      if (!walk || photos.length === 0) return;
      if (exportInFlightRef.current) return;
      exportInFlightRef.current = true;
      setExporting(true);
      setExportError(null);
      resetExportArtifact();

      const sorted = [...photos].sort((a, b) => a.order - b.order);
      const snapshot: ExportSnapshot = {
        jobId: walk.jobId || jobIdInput,
        walkCreatedAt: walk.createdAt,
        photos: await Promise.all(
          sorted.map(async (p) => ({
            order: p.order + 1,
            jpegBytes: await blobToArrayBuffer(p.blob),
            width: p.width,
            height: p.height,
            note: p.note,
          })),
        ),
      };

      try {
        setIsRecoveryExport(recovery);
        const result = await deps.renderWalkPdf(snapshot, (info) => setExportProgress(info));
        setExportBytes(result.bytes);
        setExportFilename(result.filename);
        exportInFlightRef.current = false;
        setExporting(false);
      } catch (err) {
        exportInFlightRef.current = false;
        setExporting(false);
        if (err instanceof PdfExportError && err.code === 'worker') {
          return;
        }
        setExportError(err instanceof Error ? err.message : 'Export failed');
      }
    },
    [walk, photos, jobIdInput, deps],
  );

  const handleShare = async () => {
    if (!exportBytes || !exportFilename) return;
    const file = new File([new Uint8Array(exportBytes)], exportFilename, {
      type: 'application/pdf',
    });
    try {
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: exportFilename });
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
    const url = URL.createObjectURL(
      new Blob([new Uint8Array(exportBytes)], { type: 'application/pdf' }),
    );
    exportObjectUrlRef.current = url;
    const a = document.createElement('a');
    a.href = url;
    a.download = exportFilename;
    a.click();
  };

  const handleClearConfirm = async () => {
    if (!storeRef.current) return;
    setClearing(true);
    try {
      await storeRef.current.clearWalk();
      setWalk(null);
      setPhotos([]);
      setJobIdInput('');
      setFailedImports([]);
      setCapacityMessage(null);
      resetExportArtifact();
      setClearOpen(false);
    } finally {
      setClearing(false);
    }
  };

  if (hydrating) {
    return (
      <main className="mx-auto max-w-xl p-4">
        <p className="text-sm">Loading walk…</p>
      </main>
    );
  }

  const walkStatus = walk?.status ?? 'active';

  return (
    <main className="mx-auto max-w-xl p-4">
      <h1 className="mb-1 text-xl font-bold">Pik-2-PDF</h1>
      <p className="mb-4 text-sm text-neutral-700">Cabinet photos to US Letter PDF</p>

      {readOnly ? <ReadOnlyBanner /> : null}

      <SaveStatusBanner
        saveState={saveState}
        error={saveError}
        onRetry={handleRetrySave}
        onRecoveryExport={() => runExport(true)}
        retrying={retrySaveBusy}
      />

      <JobIdField value={jobIdInput} onChange={handleJobIdChange} disabled={readOnly} />

      <CapacityIndicator committedCount={committedCount} inFlightCount={inFlightCount} />

      {capacityMessage ? (
        <p className="mb-3 border border-black px-3 py-2 text-sm" role="alert">
          {capacityMessage}
        </p>
      ) : null}

      <CaptureControls
        cameraInputRef={cameraRef}
        libraryInputRef={libraryRef}
        onCameraChange={handleFileSelection}
        onLibraryChange={handleFileSelection}
        disabled={additionsBlocked}
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
          disabled={readOnly}
          busy={pauseBusy}
        />
      ) : null}

      <PhotoQueue
        photos={photos}
        onNoteChange={handleNoteChange}
        onRemove={handleRemove}
        disabled={readOnly}
        removingId={removingId}
      />

      <ExportControls
        photoCount={photos.length}
        onExport={() => runExport(false)}
        exporting={exporting}
        exportProgress={exportProgress}
        exportError={exportError}
        exportReady={exportFilename ? { filename: exportFilename } : null}
        onShare={handleShare}
        onDownload={handleDownload}
        onDismissExport={resetExportArtifact}
        onRetryExport={() => runExport(isRecoveryExport)}
        disabled={readOnly}
        exportLabel={isRecoveryExport ? 'Recovery export PDF' : 'Export PDF'}
      />

      <button
        type="button"
        disabled={readOnly || !walk}
        onClick={() => setClearOpen(true)}
        className="border border-black px-3 py-2 text-sm focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-black disabled:opacity-50"
      >
        Clear walk
      </button>

      <ClearWalkDialog
        open={clearOpen}
        onConfirm={handleClearConfirm}
        onCancel={() => setClearOpen(false)}
        clearing={clearing}
      />
    </main>
  );
}
