import { useEffect, useRef, useState } from 'react';
import type { ParkedDraft } from '../lib/db';

export type WalkPrompt =
  | { kind: 'new' }
  | { kind: 'drafts' }
  | { kind: 'reopen'; draft: ParkedDraft }
  | { kind: 'replace' };

type WalkSwitchDialogProps = {
  prompt: WalkPrompt;
  drafts: ParkedDraft[];
  loading: boolean;
  busy: boolean;
  error: string | null;
  canPark: boolean;
  onOpenDraft: (draft: ParkedDraft) => void;
  onPark: () => void;
  onReplace: (draftId: string) => void;
  onDiscard: () => void;
  onRetryDrafts: () => void;
  onCancel: () => void;
};

function DraftDetails({ draft }: { draft: ParkedDraft }) {
  return (
    <span className="block min-w-0">
      <span className="block wrap-anywhere font-medium">{draft.jobId || 'Untitled walk'}</span>
      <span className="block text-xs text-neutral-600">
        {draft.photoCount} {draft.photoCount === 1 ? 'photo' : 'photos'} · Edited{' '}
        {new Date(draft.updatedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
      </span>
    </span>
  );
}

const buttonClass =
  'min-h-11 rounded-md border border-neutral-400 px-3 py-2 text-sm disabled:opacity-50';

export function WalkSwitchDialog({
  prompt, drafts, loading, busy, error, canPark, onOpenDraft, onPark, onReplace,
  onDiscard, onRetryDrafts, onCancel,
}: WalkSwitchDialogProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);
  const [selected, setSelected] = useState('');
  const selectingDraft = prompt.kind === 'drafts' || prompt.kind === 'replace';
  const replacement = prompt.kind === 'replace';
  const decidingCurrentWalk = prompt.kind === 'new' || prompt.kind === 'reopen';
  const selectedDraft = drafts.find((draft) => draft.id === selected);
  const titles = {
    new: 'Start a new walk?',
    drafts: 'Saved drafts',
    reopen: 'Open draft?',
    replace: 'Choose a draft to replace',
  };

  useEffect(() => {
    const element = dialog.current!;
    const previousFocus = document.activeElement;
    if (typeof element.showModal === 'function') element.showModal();
    else element.setAttribute('open', '');
    return () => {
      if (typeof element.close === 'function') element.close();
      else element.removeAttribute('open');
      if (previousFocus instanceof HTMLElement) previousFocus.focus({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    cancelButton.current?.focus({ preventScroll: true });
  }, [prompt.kind]);

  return (
    <dialog
      ref={dialog}
      className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-sm overflow-auto rounded-lg border border-neutral-300 bg-white p-4 shadow-lg backdrop:bg-black/40"
      aria-labelledby="walk-switch-title"
      aria-describedby={prompt.kind === 'drafts' ? undefined : 'walk-switch-description'}
      aria-modal="true"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onCancel();
      }}
    >
      <h2 id="walk-switch-title" className="text-lg font-bold">{titles[prompt.kind]}</h2>
      {prompt.kind === 'reopen' && (
        <div className="mt-2">
          <DraftDetails draft={prompt.draft} />
        </div>
      )}
      {decidingCurrentWalk && (
        <p id="walk-switch-description" className="mt-2 text-sm">
          {canPark
            ? 'Save this walk as a draft to keep its photos and notes on this device. Discarding removes the walk and all of its contents.'
            : 'Discarding clears your current changes.'}
        </p>
      )}
      {replacement && (
        <p id="walk-switch-description" className="mt-2 text-sm">
          All three draft slots are full. Replacing a draft deletes its photos and notes.
        </p>
      )}
      {error && <p className="mt-2 text-sm text-red-800" role="alert">{error}</p>}
      {selectingDraft && (
        loading ? <p className="mt-2 text-sm" role="status">Loading drafts…</p>
          : drafts.length === 0 ? (
            error ? <button type="button" className={`mt-3 ${buttonClass}`} onClick={onRetryDrafts}>Retry</button>
              : <p className="mt-2 text-sm">No saved drafts.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {drafts.map((draft) => (
                <li key={draft.id}>
                  {replacement ? (
                    <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md border border-neutral-400 p-2 text-sm">
                      <input
                        type="radio"
                        name="replace-draft"
                        checked={selected === draft.id}
                        disabled={busy}
                        onChange={() => setSelected(draft.id)}
                      />
                      <DraftDetails draft={draft} />
                    </label>
                  ) : (
                    <button
                      type="button"
                      className={`w-full text-left ${buttonClass}`}
                      disabled={busy}
                      onClick={() => onOpenDraft(draft)}
                    >
                      <DraftDetails draft={draft} />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )
      )}
      {busy && <p className="mt-2 text-sm" role="status">Saving changes…</p>}
      <div className="mt-4 flex flex-wrap gap-2">
        {!selectingDraft && (
          <button type="button" className={buttonClass} disabled={busy || loading || !canPark} onClick={onPark}>
            Save draft
          </button>
        )}
        {replacement && (
          <button
            type="button"
            className={buttonClass}
            disabled={busy || !selectedDraft}
            onClick={() => { if (selectedDraft) onReplace(selectedDraft.id); }}
          >
            Replace draft
          </button>
        )}
        <button ref={cancelButton} type="button" className={buttonClass} disabled={busy} onClick={onCancel}>
          {prompt.kind === 'drafts' ? 'Close' : 'Keep editing'}
        </button>
        {!selectingDraft && (
          <button
            type="button"
            className={`${buttonClass} ml-auto border-red-700 text-red-800 hover:bg-red-50`}
            disabled={busy || loading}
            onClick={onDiscard}
          >
            Discard walk
          </button>
        )}
      </div>
    </dialog>
  );
}
