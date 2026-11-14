export type FailedImport = {
  key: string;
  name: string;
  file: File;
  message: string;
};

type FailedImportListProps = {
  failures: FailedImport[];
  onRetry: (key: string) => void;
  retryingKey?: string | null;
};

export function FailedImportList({ failures, onRetry, retryingKey }: FailedImportListProps) {
  if (failures.length === 0) return null;

  return (
    <div className="mb-4 border border-black px-3 py-2" role="alert">
      <p className="text-sm font-medium">Some files could not be imported</p>
      <ul className="mt-2 flex flex-col gap-2">
        {failures.map((f) => (
          <li key={f.key} className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span>
              <span className="font-medium">{f.name}</span>
              {f.message ? ` — ${f.message}` : ''}
            </span>
            <button
              type="button"
              onClick={() => onRetry(f.key)}
              disabled={retryingKey === f.key}
              className="border border-black px-2 py-1 text-xs focus:outline focus:outline-2 focus:outline-offset-1 focus:outline-black disabled:opacity-50"
            >
              {retryingKey === f.key ? 'Retrying…' : 'Retry'}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}