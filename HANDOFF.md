# Pik-2-PDF handoff

Updated 2026-11-14, 14:45 America/New_York.

The engineering run is closed. The build is deployed and desktop verification passed.
Final iPad acceptance, including the private upload result, remains pending.

## Source and deployment

- Checkout `/home/nick/Work/experiments/Piks-2-PDF`, branch `main`.
- Application commit `0f317c0`. The subsequent handoff commit changes documentation and ignores only.
- Production https://pik-2-pdf.vercel.app
- Deployment `dpl_Enm3TdfV7oPCvDbbgu4fLP7dZWzM`, READY, production.
- Immutable deployment https://pik-2-9cixxdmje-nmasters52s-projects.vercel.app
- Project `pik-2-pdf`, ID `prj_wV6BS7LL14DEjJEBIaOUQvdOwcEP`, owner `nmasters52s-projects`.
- Public HTML serves `/assets/index-CpQtc4b2.js`. Local hashes differ from the cloud build.
- All three independent review delegates completed, without pending child work. Findings and provider substitution history are in `EXECUTION-LOG.md`.
- No source changes remain uncommitted after the handoff commit. Local verification artifacts are ignored.

## Final fixes and evidence

Final verification uncovered two defects in deployment 3 and resolved the remaining duplicate-retry limitation:

- Worker warm-up did not guarantee offline startup. A fresh live session imported 50 photos offline but its first export failed with `Worker error`. The worker is now bundled inline with `?worker&inline`, so new exports use code already loaded in memory. [Vite worker documentation](https://vite.dev/guide/features#web-workers).
- The prior lock implementation called an invented `Lock.release()` method, and its test double concealed the bug. Web Locks releases when the request callback settles. The implementation now completes and awaits that callback, handles cancellation before grant, and sequences effect cleanup before replacement acquisition. The corrected test failed before the fix. A real Chromium lock probe returned acquisition=true, competing acquisition=false, acquisition after release=true. React StrictMode now remains writable with exactly one held writer lock. [Web Locks request lifecycle](https://developer.mozilla.org/en-US/docs/Web/API/LockManager/request).
- Failed imports retain their attempted photo IDs. Save recovery removes only failure entries whose photo IDs are committed, keeping decode failures retryable without offering to duplicate recovered photos. A regression using the actual store and injected quota failure failed before the fix and passed after it.

Checks at `0f317c0`:

- `npm test`: 90/90 passed across eight files.
- `npm run build`: TypeScript check and production Vite build passed. Bundle-size warning remains, expected with inline export code.
- `git diff --check`: passed.
- Live production flow in Chromium 155 on Linux: loaded online, disabled connectivity before first import and first export, imported 50 photos, edited a full 200-character accented/multiline/unbroken note, paused/resumed, generated and downloaded one PDF.
- Actual PDF: US Letter, 13 pages, 50 images, exact numbering 1–50, all 13 footers, complete test note. Rendered first and last pages inspected, no clipping or overlap observed.
- Connected refresh and tab close/reopen recovered all 50 photos, the 200-character note, job ID, and paused status. Resume worked. A second tab stayed read-only.
- Offline capture/import/edit/export phase used local blob requests; no photo/note/job-data transmission observed. This is desktop evidence, not iPad Safari certification.

Local artifacts, intentionally untracked:

- `output/playwright/final-offline-50.pdf`, 787,824 bytes, synthetic fixtures only.
- `output/playwright/pdf-verification.json`.
- `output/playwright/first-page.png` and `last-page.png`.
- `output/playwright/final-flow.js`, CLI reproduction with fixture paths under `/tmp/piks-e2e`.
- `.playwright-cli/`, browser snapshots and download evidence.

## User field evidence and next action

The supplied iPad export from deployment 1 was previously inspected: 50 images, 13 pages, consecutive numbering, correct footers, approximately 14.5 MB. No notes were attached. This proves a real-device export, but does not establish final-build acceptance or private upload success.

Next, close and reopen the production site online on the iPad to load deployment 4. Record iPad model/iPadOS and pass/fail for camera and library imports, a multiline note, saving to Files, saved-walk restoration, offline-while-open capture/export, defect readability, and the private internal upload of a representative 50-photo PDF. No program identity or private photos are needed. No final acceptance claim until those results arrive.

## Boundaries

- IndexedDB is local storage and may be evicted. Save PDF copies to Files.
- Offline reopening is outside scope. Initial font loading needs connectivity; a failed font fetch can be retried online. The worker no longer depends on the HTTP cache.
- Bundled font coverage excludes some scripts and emoji. Export warns about unsupported characters. Extremely newline-heavy notes can reach the visible overflow marker; ordinary 200-character wrapping was verified. These are disclosed text limitations, not blanket proof for every Unicode note.
- Camera/HEIC behavior, iPad Safari memory and sharing, and final internal-upload success require user verification. iPhone was not tested.
- No new independent review was launched for the final fixes; coordinator regression tests and live checks cover them.

## Local commands

```sh
npm ci
npm test
npm run typecheck
npm run build
npm run dev
```

No configured lint command. No backend, service worker, accounts, or automatic upload.
