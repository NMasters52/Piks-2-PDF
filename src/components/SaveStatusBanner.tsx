import type { SaveState } from '../types/walk';
import type { StorageError } from '../lib/db';

type SaveStatusBannerProps = {
  saveState: SaveState;
  error?: StorageError;
  onRetry: () => void;
  onRecoveryExport: () => void;
  retrying?: boolean;
};

export function SaveStatusBanner({
  saveState,
  error,
  onRetry,
  onRecoveryExport,
  retrying,
}: SaveStatusBannerProps) {
  if (saveState === 'saved') {
    return (
      <p className="text-xs text-muted" role="status" aria-live="polite">
        Saved on this device
      </p>
    );
  }

  if (saveState === 'unsaved') {
    return (
      <p className="text-xs text-muted" role="status" aria-live="polite">
        Unsaved changes…
      </p>
    );
  }

  return (
    <div
      role="alert"
      className="mb-4 border border-foreground bg-card px-3 py-3 text-sm"
    >
      <p className="font-medium">Save failed</p>
      {error ? <p className="mt-1">{error.message}</p> : null}
      <p className="mt-2">
        Unsaved work may be lost if you close the app. Photo additions are paused until you
        retry or export a recovery PDF from your current photos.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onRetry}
          disabled={retrying}
          className="border border-foreground px-3 py-2 text-sm font-medium focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-foreground disabled:opacity-50"
        >
          {retrying ? 'Retrying…' : 'Retry save'}
        </button>
        <button
          type="button"
          onClick={onRecoveryExport}
          className="border border-foreground px-3 py-2 text-sm font-medium focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-foreground"
        >
          Recovery export (PDF)
        </button>
      </div>
    </div>
  );
}