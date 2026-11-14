import { MAX_PHOTOS } from '../types/walk';

type CapacityIndicatorProps = {
  committedCount: number;
  inFlightCount: number;
};

export function CapacityIndicator({ committedCount, inFlightCount }: CapacityIndicatorProps) {
  const reserved = committedCount + inFlightCount;
  return (
    <p className="mb-3 text-sm font-medium" aria-live="polite">
      {reserved} of {MAX_PHOTOS} photos
      {inFlightCount > 0 ? ` (${inFlightCount} importing…)` : ''}
    </p>
  );
}