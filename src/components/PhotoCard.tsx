import { useEffect, useState } from 'react';
import { MAX_NOTE_CHARS, type WalkPhoto } from '../types/walk';

type PhotoCardProps = {
  photo: WalkPhoto;
  displayNumber: number;
  onNoteChange: (photoId: string, note: string) => void;
  onRemove: (photoId: string) => void;
  disabled?: boolean;
  removing?: boolean;
};

export function PhotoCard({
  photo,
  displayNumber,
  onNoteChange,
  onRemove,
  disabled,
  removing,
}: PhotoCardProps) {
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);
  const [note, setNote] = useState(photo.note);

  useEffect(() => {
    const url = URL.createObjectURL(photo.blob);
    setThumbUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [photo.blob, photo.id]);

  useEffect(() => {
    setNote(photo.note);
  }, [photo.note]);

  return (
    <li className="border border-black p-3">
      <div className="flex gap-3">
        {thumbUrl ? (
          <img
            src={thumbUrl}
            alt={`Photo ${displayNumber}`}
            className="h-20 w-20 shrink-0 border border-neutral-400 object-contain"
          />
        ) : (
          <div className="h-20 w-20 shrink-0 border border-neutral-400 bg-neutral-100" />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">Photo {displayNumber}</p>
          <label className="mt-2 block text-xs" htmlFor={`note-${photo.id}`}>
            Note (optional)
          </label>
          <textarea
            id={`note-${photo.id}`}
            value={note}
            maxLength={MAX_NOTE_CHARS}
            disabled={disabled}
            rows={3}
            onChange={(e) => {
              const next = e.target.value.slice(0, MAX_NOTE_CHARS);
              setNote(next);
              onNoteChange(photo.id, next);
            }}
            className="mt-1 w-full border border-black px-2 py-1 text-sm focus:outline focus:outline-2 focus:outline-offset-1 focus:outline-black disabled:opacity-50"
          />
          <p className="mt-1 text-right text-xs text-neutral-700" aria-live="polite">
            {note.length} / {MAX_NOTE_CHARS}
          </p>
        </div>
      </div>
      <button
        type="button"
        disabled={disabled || removing}
        onClick={() => onRemove(photo.id)}
        className="mt-3 border border-black px-3 py-1 text-sm focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-black disabled:opacity-50"
      >
        {removing ? 'Removing…' : 'Remove photo'}
      </button>
    </li>
  );
}