# Architecture & Product Contract

This document captures the durable product rules, PDF specification, persistence guarantees, and module layout for Pik-2-PDF.

## Stack

- **UI:** React 19, TypeScript, Vite 8, Tailwind CSS v4
- **Persistence:** IndexedDB via `idb`
- **PDF generation:** `pdf-lib` + `@pdf-lib/fontkit` with bundled DejaVu Sans (`src/assets/fonts/DejaVuSans.ttf`), executed in an inline Web Worker (`?worker&inline`)
- **Testing:** Vitest, Testing Library, `fake-indexeddb`, `pdfjs-dist`

No backend, service worker, accounts, router, or external state-management library.

## Product contract

- **Single active walk:** One current walk at a time with an optional job/lot ID, ordered photos, and optional notes. Supports pause and resume.
- **Capacity (50 photos max):**
  - Hard limit of 50 photos per walk. At 50/50, add controls are disabled with an explanation; removing a photo frees a slot after removal commits.
  - A multi-file selection that exceeds remaining capacity is rejected in full, showing how many spaces remain (never silently imports a subset).
  - Within capacity, if an individual file fails to decode, valid siblings are kept and the failed item remains retryable without duplicating committed photos.
- **Notes:** Optional, up to 200 characters per photo with a visible counter. Included in full in the PDF without silent truncation.
- **Export & clear:**
  - Exporting leaves the current walk intact.
  - Clearing the walk requires explicit confirmation and only resets UI state after the transactional delete succeeds.

## Persistence & offline guarantees

- **Committed-save semantics:** The UI shows "Saved" only after IndexedDB commits. Mutations (imports, note edits, job ID edits, pause/resume) run through a serialized save queue so stale completions cannot mark newer edits saved.
- **Image storage:** Photos are decoded and normalized *outside* DB transactions (target ~1600 px long edge, JPEG quality ~0.8, preserving aspect ratio/orientation, no upscaling). The normalized JPEG blob and metadata are written atomically in one transaction. Originals are not retained.
- **Failure recovery:** On storage/quota failure, committed records are preserved, unsaved changes are marked visibly, further photo additions pause, and both retry and recovery PDF export remain available. The app never clears the database automatically to recover.
- **Exclusive writer:** A Web Lock (`navigator.locks`) ensures only one tab writes to the walk at a time; additional tabs open read-only.
- **Offline while open:** After initial online load, capture/import, notes, persistence, and PDF export require no network requests. Reopening the app offline is outside scope.

## PDF specification

- **Page format:** US Letter portrait (`612 × 792` pt), 2 × 2 grid (4 photos per page; 50 photos = 13 pages). Partial final pages are valid.
- **Header & footer:** Header shows the optional job/lot ID and the walk creation date (device local timezone). Footer shows `page X of Y`.
- **Tiles:** Photos are numbered consecutively in queue order and fitted without stretching or cropping. Notes appear beneath their corresponding photo; missing notes leave the area blank.
- **Filename:** `<sanitized-job-id>.pdf` when a job/lot ID is present; otherwise `Field-Walk_<YYYY-MM-DD>_<H.MM.SS AM/PM>.pdf` (device local timezone).
- **Export lifecycle:** Single-flight (repeated taps do not trigger duplicate exports), displays progress, retains the walk on failure or canceled share, and provides a download fallback when Web Share is unavailable.

## Module boundaries

- `src/types/walk.ts` — Shared walk, photo, and worker message types.
- `src/lib/db.ts` — IndexedDB schema, transactions, hydration, save queue, and exclusive-writer lock.
- `src/lib/images.ts` — Incremental decode, orientation/aspect preservation, resize, JPEG compression, and resource cleanup.
- `src/lib/pdf.ts` & `src/lib/pdf/layout.ts` — Export snapshot, 2×2 Letter layout calculations, and worker orchestration.
- `src/workers/pdf.worker.ts` — Off-main-thread PDF assembly (bundled inline for offline reliability).
- `src/app/` & `src/components/` — Minimal black-and-white UI, capture/library inputs, photo queue, notes, save status, pause/resume, and export/clear controls.
