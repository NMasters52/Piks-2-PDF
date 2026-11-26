import type { WalkPhoto } from '../types/walk';
import { PhotoCard } from './PhotoCard';

type PhotoQueueProps = {
  photos: WalkPhoto[];
  onNoteChange: (photoId: string, note: string) => void;
  onRemove: (photoId: string) => void;
  disabled?: boolean;
  removingId?: string | null;
};

export function PhotoQueue({
  photos,
  onNoteChange,
  onRemove,
  disabled,
  removingId,
}: PhotoQueueProps) {
  if (photos.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-card px-4 py-10 text-center">
        <p className="font-semibold">No photos yet</p>
        <p className="mt-1 text-sm text-muted">Take a photo or add one from your library to begin.</p>
      </div>
    );
  }

  const sorted = [...photos].sort((a, b) => a.order - b.order);

  return (
    <ul className="mb-4 flex flex-col gap-3" aria-label="Photo queue">
      {sorted.map((photo) => (
        <PhotoCard
          key={photo.id}
          photo={photo}
          displayNumber={photo.order + 1}
          onNoteChange={onNoteChange}
          onRemove={onRemove}
          disabled={disabled}
          removing={removingId === photo.id}
        />
      ))}
    </ul>
  );
}