import { useEffect, useRef } from 'react';
import type { ExportArtifact, RecentExport } from '../lib/db';

const buttonClass = 'min-h-11 rounded-md border border-foreground px-3 py-2 text-sm disabled:opacity-50';

export function openExport({ pdf, filename }: ExportArtifact, download: boolean) {
  const url = URL.createObjectURL(pdf);
  const link = document.createElement('a');
  link.href = url;
  if (download) {
    link.download = filename;
  } else {
    link.target = '_blank';
    link.rel = 'noopener';
  }
  link.click();
  // Give the browser time to consume the URL after the click.
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

type Props = {
  mode: 'history' | 'replace' | 'cancel-edit';
  entries: RecentExport[];
  loading: boolean;
  error: string | null;
  canEdit: boolean;
  onEdit: (id: string) => void;
  onReplace: (downloadPrevious: boolean) => void;
  onCancelEdit: () => void;
  onClose: () => void;
};

export function RecentExportsDialog({
  mode, entries, loading, error, canEdit, onEdit, onReplace, onCancelEdit, onClose,
}: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const element = dialog.current!;
    const previousFocus = document.activeElement;
    if (typeof element.showModal === 'function') element.showModal();
    else element.setAttribute('open', '');
    closeButton.current?.focus({ preventScroll: true });
    return () => {
      if (typeof element.close === 'function') element.close();
      else element.removeAttribute('open');
      if (previousFocus instanceof HTMLElement) previousFocus.focus({ preventScroll: true });
    };
  }, []);

  const title = {
    history: 'Recent exports',
    replace: 'Download the previous PDF before replacing it?',
    'cancel-edit': 'Discard edits to this export?',
  }[mode];

  return (
    <dialog
      ref={dialog}
      className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-sm overflow-auto rounded-lg border border-border bg-card p-4 backdrop:bg-black/40"
      aria-labelledby="recent-exports-title"
      aria-modal="true"
      onCancel={(event) => {
        event.preventDefault();
        if (!loading) onClose();
      }}
    >
      <h2 id="recent-exports-title" className="text-lg font-bold">{title}</h2>
      {loading && <p role="status" className="mt-2 text-sm">Loading…</p>}
      {error && <p role="alert" className="mt-2 text-sm text-danger-foreground">{error}</p>}
      {mode === 'history' && (
        entries.length > 0 ? (
          <ul className="mt-3 space-y-3">
            {entries.map((entry) => (
              <li key={entry.walk.id} className="rounded-md border border-border p-3">
                <div className="wrap-anywhere text-sm font-medium">{entry.filename}</div>
                <p className="text-xs text-muted">
                  {entry.photos.length} {entry.photos.length === 1 ? 'photo' : 'photos'} ·{' '}
                  {new Date(entry.exportedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button type="button" className={buttonClass} onClick={() => openExport(entry, false)}>View PDF</button>
                  <button type="button" className={buttonClass} onClick={() => openExport(entry, true)}>Download PDF</button>
                  <button type="button" className={buttonClass} disabled={!canEdit || loading} onClick={() => onEdit(entry.walk.id)}>Edit walk</button>
                </div>
              </li>
            ))}
          </ul>
        ) : !loading && !error && <p className="mt-2 text-sm">No recent exports.</p>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        {mode === 'replace' && (
          <>
            <button type="button" className={buttonClass} onClick={() => onReplace(true)}>Download previous PDF</button>
            <button type="button" className={buttonClass} onClick={() => onReplace(false)}>Continue without downloading</button>
          </>
        )}
        {mode === 'cancel-edit' && (
          <button type="button" className={buttonClass} disabled={loading} onClick={onCancelEdit}>Discard edits</button>
        )}
        <button ref={closeButton} type="button" className={buttonClass} disabled={loading} onClick={onClose}>
          {mode === 'history' ? 'Close' : mode === 'replace' ? 'Cancel' : 'Keep editing'}
        </button>
      </div>
    </dialog>
  );
}
