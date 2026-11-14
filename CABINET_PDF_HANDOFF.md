# Cabinet Photo-to-PDF — Implementation Handoff

## Goal
Ship a mobile-first, browser-based cabinet post-walk utility this weekend. Capture or select photos, attach optional notes, and export a single downloadable PDF for upload into the existing job-jacket software. Field-test next week.

## Fixed decisions
- React + TypeScript + Vite
- Tailwind CSS v4 + shadcn/ui (minimal components)
- `pdf-lib` for PDF generation
- `idb` wrapper around IndexedDB for session persistence
- Browser Canvas/image APIs for resize/compression; PDF generation in a Web Worker where feasible
- Static deployment to Vercel, HTTPS
- No backend, account, cloud storage, AI, analytics, or photo uploads
- US Letter portrait, four photos per page in a 2×2 grid

## Core user flow
1. Open app on iPad/iPhone in Safari.
2. Optionally enter a job/lot identifier.
3. Use `input type="file" accept="image/*" capture="environment"` to capture, plus a separate photo-library picker (multiple files allowed). Do not assume `capture` forces camera on all devices.
4. Append each image to a visible ordered queue; show thumbnail, optional note, and remove control.
5. Generate a PDF, preview/share/save it via standard browser/iOS workflows; retain the session until explicitly cleared.

## PDF contract
- US Letter portrait (612×792 points), 2 columns × 2 rows per page.
- Header: optional job/lot ID and date. Footer: page X of Y.
- Four numbered photo tiles per page, in capture order; preserve image aspect ratio without cropping; notes under corresponding images.
- Missing notes leave the note area blank. Final page may have fewer than four photos.
- Suggested filename: `Cabinet-Walk_<sanitized-job-id>_<YYYY-MM-DD>.pdf` (omit ID segment if blank).
- JPEG-compress/resample images before embedding; default long edge about 1600 px and JPEG quality around 0.75–0.8. Validate that small defects remain legible on iPad before tuning down.
- Bound memory use: process images incrementally; release object URLs and intermediate buffers. Show progress and errors. Avoid generating duplicate exports on repeated taps.

## Minimal data model
```ts
type WalkPhoto = {
  id: string;
  blob: Blob;
  note: string;
  createdAt: number;
  order: number;
};
type WalkSession = {
  id: string;
  jobId: string;
  createdAt: number;
  updatedAt: number;
};
```
Persist metadata and image blobs in IndexedDB. Do not put image blobs in localStorage. Handle quota errors and private-browsing restrictions gracefully. Export does not clear the session automatically.

## Suggested project structure
```text
src/
  app/App.tsx
  components/CaptureControls.tsx
  components/PhotoQueue.tsx
  components/PhotoCard.tsx
  components/ExportControls.tsx
  lib/db.ts
  lib/images.ts
  lib/pdf.ts
  workers/pdf.worker.ts
  types/walk.ts
  main.tsx
```
Keep architecture simple. Extract only what is needed. Do not add React Query, Redux, React Router, a service worker, or a backend for this MVP.

## Implementation order
1. Scaffold Vite React/TS and basic responsive UI.
2. Add camera/file input and queue thumbnails; confirm Safari capture behavior.
3. Add optional notes, remove photo, and job ID.
4. Implement 2×2 Letter PDF with numbered photos, notes, header/footer, download/share.
5. Persist session and blobs in IndexedDB; verify refresh recovery.
6. Move CPU-heavy export off the main thread, add compression, progress, and error handling.
7. Deploy to Vercel; test on actual iPad/iPhone.

## Acceptance criteria
- Can capture or import 1, 4, 5, 20, and 40 photos.
- Four photos per page, in the correct order; 5 photos yields two pages.
- Portrait and landscape photos are not stretched or cropped.
- Notes stay paired with their images.
- Removing a photo excludes it from export.
- Refresh does not lose the session under normal browser storage conditions.
- Export works on iPad Safari and PDF can be saved to Files and uploaded to job-jacket software.
- Large sessions display progress; UI does not become unusable; errors are recoverable.
- No photo content is sent to any remote service; inspect network requests.
- PDF size and photo detail are acceptable on real job-site examples.

## Explicitly out of scope
AI classification, defect tagging, cloud sync, user accounts, job management, reordering, annotation/drawing, PDF templates, branding, PWA/offline install, and integration with PunchLens. Revisit only after field validation.

## Constraints / risks
- Company policy may restrict using a personal web utility for worksite photos; confirm before using real job data.
- IndexedDB is best-effort browser storage, not permanent backup; users should save exports promptly.
- Browser camera behavior and iOS share/download behavior vary by device/version; test hardware early.
- Four photos per page can make small cabinet defects hard to see; test real photos and adjust compression before production use.

## Agent instructions
Implement the smallest reliable vertical slice first. Avoid speculative abstractions. Run typecheck, lint (if configured), and production build. Add focused tests for page count, ordering, notes, and filenames. Present a working Vercel URL or local test instructions, a concise test report, and known limitations. Do not claim iPad verification unless tested on actual hardware.
