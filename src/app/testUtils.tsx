import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';
import type { AppDeps } from './deps';
import type { WalkStore } from '../lib/db';
import { DecodeError, type NormalizedImage } from '../lib/images';
import { PdfExportError, type ExportSnapshot, type ExportProgress } from '../lib/pdf';

export function jpegFile(name: string, content = 'jpeg'): File {
  return new File([content], name, { type: 'image/jpeg' });
}

export function buildTestDeps(
  store: WalkStore,
  options?: {
    normalize?: (file: File) => Promise<NormalizedImage>;
    renderPdf?: (
      snapshot: ExportSnapshot,
      onProgress?: ExportProgress,
    ) => Promise<{ bytes: Uint8Array; filename: string }>;
  },
): AppDeps {
  return {
    createStore: () => store,
    normalizeImageFile:
      options?.normalize ??
      (async (file) => ({
        blob: new Blob([await file.arrayBuffer()], { type: 'image/jpeg' }),
        mimeType: 'image/jpeg',
        width: 32,
        height: 32,
      })),
    renderWalkPdf:
      options?.renderPdf ??
      (async (snapshot, onProgress) => {
        for (let i = 1; i <= snapshot.photos.length; i += 1) {
          onProgress?.({ photosDone: i, totalPhotos: snapshot.photos.length });
        }
        return { bytes: new Uint8Array([0x25, 0x50, 0x44, 0x46]), filename: 'Cabinet-Walk_test.pdf' };
      }),
  };
}

export function renderApp(deps: AppDeps) {
  const user = userEvent.setup();
  const view = render(<App deps={deps} />);
  return { user, ...view };
}

export { DecodeError, PdfExportError };