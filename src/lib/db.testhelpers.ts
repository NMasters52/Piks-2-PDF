import { MAX_PHOTOS, type WalkPhoto } from '../types/walk';

export function makeTestBlob(bytes = 4): Blob {
  return new Blob([new Uint8Array(bytes)], { type: 'image/jpeg' });
}

export function makePhotoInput(
  partial?: Partial<Omit<WalkPhoto, 'walkId'>>,
): Omit<WalkPhoto, 'walkId'> {
  const now = Date.now();
  return {
    id: partial?.id ?? crypto.randomUUID(),
    blob: partial?.blob ?? makeTestBlob(),
    mimeType: 'image/jpeg',
    width: partial?.width ?? 100,
    height: partial?.height ?? 100,
    note: partial?.note ?? '',
    createdAt: partial?.createdAt ?? now,
    order: partial?.order ?? 0,
  };
}

export function makePhotoSequence(count: number): Omit<WalkPhoto, 'walkId'>[] {
  return Array.from({ length: count }, (_, order) =>
    makePhotoInput({ id: `photo-${order}`, order }),
  );
}

export const PHOTO_AT_CAPACITY = MAX_PHOTOS;