# Pik-2-PDF execution log

One-day MVP build, 2026-11-14. Orchestration agent owns this file; updated at each checkpoint.

## Preflight receipt

- Task / repo: Pik-2-PDF one-day MVP / `/home/nick/Work/experiments/Piks-2-PDF`
- Checkout: same path | branch `main` | planning docs commit `f54e170` | clean (docs only, was non-Git → initialized)
- Isolation: `worktree` for all delegates | integrator: coordinator checkout
- Runtime: Node v26.12.0, npm 11.20.0 (chosen package manager; lockfile committed). pnpm 1.4.4 present but npm chosen.
- Delegate catalog verified via `orchestrator_capabilities`:
  - Implementation: `cursor` / `composer-2.5`, options `{"fastMode":"false"}`
  - Review: `cursor` / `grok-4.7`, options `{"contextWindow":"256k","fastMode":"false","reasoning_effort":"medium"}` (strings, per catalog)
  - Direct `grok` provider: confirmed **disabled** ("Provider instance is disabled.")
- Deployment: user chose **Vercel**; no credentials on machine yet — user will run `npx vercel login`. Blocked on user auth at deploy time.
- Font: DejaVu Sans 2.37 TTF bundled at `src/assets/fonts/DejaVuSans.ttf` + license (downloaded from upstream release; local system had none).
- Result: **PASS** pending launch-test confirmation.

## Launch tests (read-only, worktree isolation)

| Model | Task ID | Result |
| --- | --- | --- |
| composer-2.5 | `node:delegated-task:...delegate-task%3Acad6c1f7-9354-474f-a5b9-5f955d0bb0bf` | **PASS** — ran shell in worktree `t3-14a53100` @ `f54e170`, verbatim limit/offline quotes, clean tree |
| grok-4.7 | `node:delegated-task:...delegate-task%3A20f637dc-5bab-4956-a876-90ec8dc9d395` | **PASS** — ran shell in worktree `t3-63508344` @ `f54e170`, verbatim quotes, clean tree |

Both launch results confirmed `providerInstanceId: cursor` with requested model + string options. **Launch gate: PASS.**

## Foundation

- Commit `646997b` on `main`: Vite 8 + React 19 + TS scaffold, Tailwind v4, shared contracts
  (`src/types/walk.ts`, `src/lib/db.ts` WalkStore interface, `src/lib/images.ts`, `src/lib/pdf/layout.ts`,
  `src/lib/pdf.ts`, `src/workers/pdf.worker.ts`), DejaVu Sans bundled, vitest harness.
- Verified: `npm run typecheck` clean, `npm test` 18/18 passing, `npm run build` green (dist 219.9 kB JS).
- Coordinator-owned files delegates must not edit: `src/types/walk.ts`, `package.json`, lockfile, configs.
  Contract changes go through the coordinator.

## Build wave

Running (3 × cursor/composer-2.5, worktree isolation, from foundation commit `5cab70d`; each must `npm ci`, keep typecheck/test/build green, return commit + evidence):

| Task | Task ID | Owned files |
| --- | --- | --- |
| Storage | `...delegate-task%3A74318402-2ab4-47c2-b502-da28caacbc46` | `src/lib/db.ts` — **DONE** `3d79aa8` |
| Images + PDF | `...delegate-task%3A8536b145-bda0-4ca1-b08f-d1b619e5083a` | `src/lib/images.ts`, `src/lib/pdf/*`, `src/workers/` — **DONE** `8ed6db6` |
| UI | `...delegate-task%3Aeb2bec3d-1960-47cb-98ce-cc70a25e6c1d` | `src/app/`, `src/components/`, `src/index.css` — **DONE** `51c909c` |

All three merged into `main`; union verified: typecheck clean, **78/78 tests**, build green.

## Integration verification (real browser, production build served on :4173)

Full flow driven end-to-end via preview automation. Bugs found and fixed during this phase:

1. **Save-queue deadlock** (`6e8bd1b`): `updateJobId` before a walk exists threw 'No walk' →
   `blockedJob` never cleared → first import hung at "importing…" forever. Fix: precondition misses
   (`precondition: true` StorageErrors) reject their own mutation without blocking the queue; UI keeps
   pre-walk job ID in state and applies it at `createWalk`. Regression tests added.
2. **Worker chunk not emitted** (`ce2f22a`): `new Worker(WORKER_URL)` const indirection broke Vite's
   `new Worker(new URL(...))` detection → every export failed with "Worker error". Fix: literal inline
   pattern + boot-time warm construct. Also added offline warm-up (`04741d5`): font + worker fetched
   at boot so first export needs no network (offline-while-open contract).

Verified evidence (real Chromium, production bundle):

- Normalize: 2000×1500 → 1600×1200 JPEG (aspect preserved), blob committed with walk atomically
- Hydration across reload: photo, note (accents: `résumé — &`), job ID all restored; "Saved" only after commit
- Capacity: 12-file selection with 11 spaces → rejected in full, exact message "That selection has 12
  photos but only 11 spaces remain. Nothing was imported."; at 50/50 inputs disabled with explanation;
  remove → 49 → inputs re-enabled; DB orders consecutive 0..49
- Export (worker, real): 1 photo → 1 page (28.7KB); 50 photos → **13 pages** (789.6KB / 771KB after
  rounding); pdfjs-verified: 50/50 images, footers "page X of 13" on all pages, header `J-77A · 2026-11-14`,
  numbering 1–50 complete, accented note intact, no aspect anomalies
- Download → real file `Cabinet-Walk_J-77A_2026-11-14.pdf` on disk (correct contract filename)
- Pause/resume works; clear dialog: cancel preserves, confirm transactionally clears UI + DB
- Single-flight export + retry path exercised (Worker error → Retry export → success)

Side task: Vercel CLI setup delegate `...delegate-task%3A1177c890-d54c-433f-8b79-c7a3334f154c`
(cursor/composer-2.5) — running; deployment blocked on its auth result + user `vercel login` confirmation.

## Review wave (cursor/grok-4.7, worktree isolation, against integrated commit `974f4aa`)

**Delegate launch blocker (14:0x):** All three in-flight tasks failed at the provider —
Vercel setup (composer-2.5, ran ~45 min then died), persistence review + PDF/image review (grok-4.7,
failed at launch) — plus a grok-4.7 no-options canary: all with the same error:

> Model unavailable on Plus. Plus includes Composer 2.5, Grok 4.7, Grok 4.6, and Grok 4.5 with
> fixed settings. Switch to an included model to continue.

`orchestrator_capabilities` is UNCHANGED (cursor: canRunChildTask true, same models/options, no
constraints) — so this is account/plan-side enforcement on the Cursor Plus plan, not a catalog or
options problem. Options were also cleared to defaults and the failure persists. Composer-2.5
no-options canary launched to isolate whether ANY cursor child still works.

| Review | Task ID | Status |
| --- | --- | --- |
| Persistence | `...delegate-task%3A120ece19-29ac-47fd-a357-12794853eede` | **FAILED** (provider) |
| PDF + images | `...delegate-task%3A3ce31356-cbc1-4322-9204-c597577e7230` | **FAILED** (provider) |
| Offline/acceptance | not launched (cap) | pending |
| Vercel setup (side) | `...delegate-task%3A1177c890-d54c-433f-8b79-c7a3334f154c` | **FAILED** (provider, mid-run) |

**Relaunch (user-approved substitution):** user chose Codex `gpt-6.1-sol` @ reasoningEffort `high`
for the review wave after the Cursor block. All three launched successfully against `974f4aa`:

| Review | Task ID | Status |
| --- | --- | --- |
| Persistence | `...delegate-task%3A5b943500-245e-44ad-b199-95214e80c883` | running |
| PDF + images | `...delegate-task%3Ad8c2d691-0114-4c08-b1d8-c64b6e6361d9` | running |
| Offline/acceptance | `...delegate-task%3A85c5af74-6a59-4f4d-9dc7-1b638b40d0ba` | running |

**Vercel:** coordinator runs `npx vercel login` directly (CLI 65.16.0, device flow —
`https://vercel.com/oauth/device?user_code=JVPH-RQKB` given to the user; polling in background).

## Deployment 1 (iPad-testable build)

- Account: `nmasters52` (device login approved by user); project `pik-2-pdf` (prj_wV6BS7LL14DEjJEBIaOUQvdOwcEP)
- **Production URL: https://pik-2-pdf.vercel.app** (HSTS on; immutable hashed assets)
- Source: repo HEAD `1a64c27` at deploy; app code last changed `ce2f22a`; cloud build by Vercel
  (served bundle hash differs from local by build env only)
- Verified on the live URL: app boots, one photo upload → normalized 1600×1200 → IndexedDB commit →
  "Saved"; worker chunk + font assets 200 (font fetched at boot for offline export)
- Earlier browser-verified evidence (localhost, same code): 50 photos → 13 pages (771KB), all
  contract checks passed; downloads produce correct `Cabinet-Walk_<id>_<date>.pdf` filenames
- **Field checkpoint: PENDING — user tests on iPad (capture, library import, note, save to Files,
  orientation/numbering/notes inspection, representative 50-photo export + private upload)**

## Integration / review / deployment

(pending)
