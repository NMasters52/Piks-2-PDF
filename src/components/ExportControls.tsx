type ExportControlsProps = {
  photoCount: number;
  onExport: () => void;
  exporting: boolean;
  exportProgress?: { photosDone: number; totalPhotos: number } | null;
  exportError?: string | null;
  exportReady?: { filename: string } | null;
  exportWarnings?: string[];
  onShare: () => void;
  onDownload: () => void;
  onDismissExport: () => void;
  onRetryExport: () => void;
  disabled?: boolean;
  exportLabel?: string;
};

export function ExportControls({
  photoCount,
  onExport,
  exporting,
  exportProgress,
  exportError,
  exportReady,
  exportWarnings,  onShare,
  onDownload,
  onDismissExport,
  onRetryExport,
  disabled,
  exportLabel = 'Export PDF',
}: ExportControlsProps) {
  const exportDisabled = disabled || photoCount === 0 || exporting;

  return (
    <div className="min-w-0 flex-1 max-h-[45dvh] overflow-auto">
      <button
        type="button"
        onClick={onExport}
        disabled={exportDisabled}
        className="w-full border border-black min-h-11 px-2 py-2 text-sm font-medium focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-black disabled:opacity-50"
      >
        {exporting ? 'Generating PDF…' : exportLabel}
      </button>
      {photoCount === 0 ? (
        <p className="mt-2 text-xs text-neutral-700">Add at least one photo to export.</p>
      ) : null}
      {exporting && exportProgress ? (
        <p className="mt-2 text-sm" role="status" aria-live="polite">
          Preparing PDF: {exportProgress.photosDone} of {exportProgress.totalPhotos} photos
        </p>
      ) : null}
      {exportError ? (
        <div className="mt-2 text-sm" role="alert">
          <p>{exportError}</p>
          <button
            type="button"
            onClick={onRetryExport}
            className="mt-2 border border-black px-3 py-1 text-sm focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-black"
          >
            Retry export
          </button>
        </div>
      ) : null}
      {exportReady ? (
        <div className="mt-3 flex flex-col gap-2">
          <p className="text-sm" role="status">
            PDF ready: {exportReady.filename}
          </p>
          {exportWarnings?.map((warning) => (
            <p key={warning} className="text-xs" role="note">
              {warning}
            </p>
          ))}
          <button
            type="button"
            onClick={onShare}
            className="border border-black px-3 py-2 text-sm focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-black"
          >
            Save / Share
          </button>
          <button
            type="button"
            onClick={onDownload}
            className="border border-black px-3 py-2 text-sm focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-black"
          >
            Download
          </button>
          <button
            type="button"
            onClick={onDismissExport}
            className="text-left text-sm underline focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-black"
          >
            Dismiss
          </button>
        </div>
      ) : null}
    </div>
  );
}