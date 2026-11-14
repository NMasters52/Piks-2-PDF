type ClearWalkDialogProps = {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  clearing?: boolean;
};

export function ClearWalkDialog({ open, onConfirm, onCancel, clearing }: ClearWalkDialogProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="clear-walk-title"
    >
      <div className="w-full max-w-sm border border-black bg-white p-4 shadow-none">
        <h2 id="clear-walk-title" className="text-lg font-bold">
          Clear this walk?
        </h2>
        <p className="mt-2 text-sm">
          This removes all photos, notes, and the job ID from this device. Export a PDF first if
          you need a copy.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onConfirm}
            disabled={clearing}
            className="border border-black px-3 py-2 text-sm font-medium focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-black disabled:opacity-50"
          >
            {clearing ? 'Clearing…' : 'Clear walk'}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={clearing}
            autoFocus
            className="border border-black px-3 py-2 text-sm focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-black"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}