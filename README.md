# Pik-2-PDF

Mobile-first, browser-based job walking helper. Capture or import photos, attach optional notes, and export a single US Letter 2×2 PDF for upload into an existing job-jacket workflow.

Everything runs locally in the browser—no backend, accounts, cloud storage, analytics, or automatic uploads.

## Quick start

```sh
npm ci
npm run dev
```

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start Vite dev server |
| `npm run build` | Run TypeScript check (`tsc --noEmit`) and production Vite build |
| `npm run preview` | Preview the production build locally |
| `npm run typecheck` | Run `tsc --noEmit` |
| `npm test` | Run Vitest suite once |
| `npm run test:watch` | Run Vitest in watch mode |

## Deployment

- **Platform:** Vercel (static HTTPS build)
- **Production URL:** https://pik-2-pdf.vercel.app
- **Project:** `pik-2-pdf` (`prj_wV6BS7LL14DEjJEBIaOUQvdOwcEP`)

## Documentation

- [docs/architecture.md](docs/architecture.md) — Product contract, PDF layout spec, module boundaries, and persistence/offline guarantees.
- [CONTEXT.md](CONTEXT.md) — Domain vocabulary (*Walk*, *Paused walk*, *Export*).
- [issues/field-test/map.md](issues/field-test/map.md) — Active post-MVP field-test notes and design issues.
- `docs/piks2PDF_playBook_orchestration_data/` — Archived orchestration and build-run records from the initial MVP build.

## Known boundaries

- **Local storage only:** IndexedDB is not a permanent backup and can be evicted by the browser. Save exported PDFs to Files.
- **Offline while open:** Once loaded online, capture/import, notes, persistence, and PDF export work without connectivity (the PDF worker is bundled inline). Offline cold-start / reopening is out of scope (no service worker).
- **Font coverage:** Bundled DejaVu Sans covers standard Latin and accented text, but excludes some scripts and emoji; export warns on unsupported characters.
- **Single-tab writer:** Uses Web Locks so a second open tab stays read-only rather than overwriting the active walk.
