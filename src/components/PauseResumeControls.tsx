import type { WalkStatus } from '../types/walk';

type PauseResumeControlsProps = {
  status: WalkStatus;
  onPause: () => void;
  onResume: () => void;
  disabled?: boolean;
  busy?: boolean;
};

export function PauseResumeControls({
  status,
  onPause,
  onResume,
  disabled,
  busy,
}: PauseResumeControlsProps) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      {status === 'paused' ? (
        <span className="border border-black px-2 py-1 text-sm font-medium" role="status">
          Walk paused
        </span>
      ) : null}
      {status === 'active' ? (
        <button
          type="button"
          onClick={onPause}
          disabled={disabled || busy}
          className="border border-black px-3 py-2 text-sm focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-black disabled:opacity-50"
        >
          {busy ? 'Pausing…' : 'Pause walk'}
        </button>
      ) : (
        <button
          type="button"
          onClick={onResume}
          disabled={disabled || busy}
          className="border border-black px-3 py-2 text-sm focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-black disabled:opacity-50"
        >
          Resume walk
        </button>
      )}
    </div>
  );
}