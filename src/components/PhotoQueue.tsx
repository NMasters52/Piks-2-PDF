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
      <p className="mb-4 text-sm text-neutral-700">No photos yet. Take or add photos to begin.</p>
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