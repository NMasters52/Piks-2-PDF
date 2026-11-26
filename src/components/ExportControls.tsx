type ExportControlsProps = {
  exporting: boolean;
  exportProgress?: { photosDone: number; totalPhotos: number } | null;
  exportError?: string | null;
  exportReady?: { filename: string } | null;
  exportWarnings?: string[];
  onShare: () => void;
  onDownload: () => void;
  onDismissExport: () => void;
  onRetryExport: () => void;
};

export function ExportControls({
  exporting,
  exportProgress,
  exportError,
  exportReady,
  exportWarnings,
  onShare,
  onDownload,
  onDismissExport,
  onRetryExport,
}: ExportControlsProps) {

  return (
    <div>
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
        <div className="mb-4 grid grid-cols-2 gap-2 rounded-md border border-neutral-300 bg-neutral-50 p-3">
          <p className="col-span-2 wrap-anywhere text-sm font-medium" role="status">
            PDF ready: {exportReady.filename}
          </p>
          {exportWarnings?.map((warning) => (
            <p key={warning} className="col-span-2 text-xs" role="note">
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
            className="col-span-2 justify-self-end text-sm underline focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-black"
          >
            Dismiss
          </button>
        </div>
      ) : null}
    </div>
  );
}
