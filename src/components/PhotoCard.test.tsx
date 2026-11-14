import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PhotoCard } from './PhotoCard';
import { MAX_NOTE_CHARS, type WalkPhoto } from '../types/walk';

const photo: WalkPhoto = {
  id: 'p1',
  walkId: 'w1',
  blob: new Blob(['x'], { type: 'image/jpeg' }),
  mimeType: 'image/jpeg',
  width: 10,
  height: 10,
  note: '',
  createdAt: 1,
  order: 0,
};

describe('PhotoCard', () => {
  it('enforces MAX_NOTE_CHARS in the counter', async () => {
    const user = userEvent.setup();
    const onNoteChange = vi.fn();
    render(
      <PhotoCard
        photo={photo}
        displayNumber={1}
        onNoteChange={onNoteChange}
        onRemove={() => undefined}
      />,
    );
    const area = screen.getByLabelText(/note/i);
    await user.type(area, 'a'.repeat(MAX_NOTE_CHARS + 5));
    expect(screen.getByText(`${MAX_NOTE_CHARS} / ${MAX_NOTE_CHARS}`)).toBeInTheDocument();
    expect(onNoteChange).toHaveBeenLastCalledWith('p1', 'a'.repeat(MAX_NOTE_CHARS));
  });
});