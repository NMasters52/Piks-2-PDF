import { createWalkStore, type WalkStore } from '../lib/db';
import { normalizeImageFile } from '../lib/images';
import { renderWalkPdf } from '../lib/pdf';

export type AppDeps = {
  createStore: () => WalkStore;
  normalizeImageFile: typeof normalizeImageFile;
  renderWalkPdf: typeof renderWalkPdf;
};

export const defaultDeps: AppDeps = {
  createStore: createWalkStore,
  normalizeImageFile,
  renderWalkPdf,
};