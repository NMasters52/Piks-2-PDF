# Pik-2-PDF MVP orchestration playbook

## Goal and authority

Build a working cabinet photo-to-PDF utility in two days. The user will field-test it on an iPad on day one. Prioritize saved work, offline operation while the app remains open, and readable PDFs over appearance.

This playbook incorporates the decisions in `mvp-alignment.md` and uses `CABINET_PDF_HANDOFF.md` as its technical baseline. When they differ, this playbook takes precedence. `CONTEXT.md` defines the domain terms. `Orchestration-Playbook-Design-Guide.md` guides execution discipline.

The product decisions below are agreed. Engineering defaults are proposed implementation choices the agent may adjust while preserving the agreed behavior. Hardware and internal-program acceptance remain unverified until the user tests them. Do not treat an unchecked field test as a completed requirement.

## Agreed product contract

- One current walk with an optional job/lot identifier, ordered photos, and optional notes.
- Automatically save changes locally on the same device. Allow explicit pause and resume. No walk list or switching between jobs.
- Recover the saved walk after closing Safari and reopening the app with a connection.
- While the app is already loaded, poor or absent connectivity must not prevent capture/import, notes, persistence, or PDF generation. Offline reopening is not required.
- Enforce a hard limit of 50 photos. At capacity, disable additions and explain why. Removing a photo frees a place after the removal succeeds.
- Reject an entire selection that exceeds the remaining capacity. State how many spaces remain. Never silently select a subset.
- Within capacity, retain successful imports when an individual file fails. Identify the failure and allow retry without duplicating the successful imports.
- Notes are optional, at most 200 characters, with a visible counter. Include the full note in the PDF.
- Show "Saved" only after persistence completes. On save failure, mark unsaved changes, preserve existing saved work, pause photo additions, and offer retry or PDF export.
- Export leaves the walk intact. Clearing the walk requires explicit confirmation.
- Use black and white, basic lines, readable text, labeled controls, and ordinary focus indicators. No branding or decorative work.

## Preflight

1. Read this playbook, the handoff, and repository instructions. Confirm the checkout path. At planning time the folder contains documents and is not a Git repository; inspect again before initializing anything. Preserve the documents.
2. Check the installed Node/package-manager versions and available tools. Choose one package manager, commit its lockfile, and record the versions used. Check current official library documentation when implementation requires it.
3. Initialize Git if it is still absent. Establish the main checkout before considering parallel work. Record the branch and commit tested at each checkpoint; identify uncommitted changes explicitly.
4. Check available deployment access and applicable permissions. Prepare the app and run checks before requesting any approval required to publish. Do not invent credentials or assume a linked Vercel project.
5. Arrange the day-one iPad checkpoint early. Ask the user to record iPad model and iPadOS version with results. The internal upload program is private; do not ask for its name, credentials, or upload limit.

## Architecture and ownership

Use React, TypeScript, Vite, Tailwind CSS v4, minimal shadcn/ui components, `idb` for IndexedDB, and `pdf-lib`. Deploy a static build over HTTPS on Vercel. Use browser image/canvas APIs for normalization and compression. Prefer a PDF Web Worker if it works reliably on the target iPad.

Do not add a backend, accounts, photo uploads, analytics, cloud storage, Redux, React Query, React Router, or a service worker. Bundle all runtime assets locally. Do not require a network request when the user first invokes export after going offline; ensure its code, worker, and fonts are ready while the app is online.

Start with one implementing agent. The orchestration agent owns integration, the running build, verification, and the final report. Parallelism is optional, not a prerequisite. If permitted and useful after the data contracts are stable, delegate PDF rendering or an independent review in isolated worktrees. Check provider/model availability before launch. Give each delegate explicit owned files, contracts, expected checks, and a return artifact. Do not let multiple agents own the database schema, lockfile, shared browser, or deployment at once. Integrate and test in the final checkout before claiming completion.

Suggested module boundaries:

- `lib/db.ts`: transactions, hydration, schema versioning, and committed-save acknowledgments.
- `lib/images.ts`: decode, orientation, resize, JPEG output, and resource cleanup.
- `lib/pdf.ts` and `workers/pdf.worker.ts`: export snapshot, layout, progress, and error handling.
- `app/App.tsx` and small components: capture/import, photo cards, notes, save status, pause/resume, export, clear confirmation.
- `types/walk.ts`: shared walk, photo, and export message types.

## Engineering defaults

These choices close implementation details without adding product scope. Document changes and their reasons. Escalate only when evidence requires changing the agreed product contract.

### Data and persistence

Retain the handoff's walk and photo IDs, timestamps, note, blob, and order fields. Add a photo-to-walk reference and persisted active/paused status. Keep one current walk. Store image blobs in IndexedDB, never localStorage. Keep the schema versioned and migrations non-destructive.

Normalize a photo before saving it. Persist its normalized blob and metadata together in a transaction; update related walk metadata atomically. Use the normalized image as the app's retained copy, not a second full-resolution original. This utility is not an original-photo archive. Verify defect detail before reducing the handoff's starting image settings.

Serialize mutations and imports so ordering, the 50-photo limit, and save acknowledgments remain correct under repeated taps. Keep image decoding outside database transactions. Reserve capacity for pending imports. Define import order by the input file list, not by whichever decode finishes first. Do not promise the photo library's selection order matches the user's tapping order.

Hydrate before allowing edits. Persist notes and job ID on change through an ordered save queue; stale completions must not mark newer edits saved. Pause waits for pending saves before reporting success. Do not rely on unload callbacks to save data. The most recent acknowledged saved version is the recovery guarantee.

If the app closes during import, restore all committed photos on the next connected launch. Do not claim unsaved or unfinished imports were recovered; the user can reselect missing files. Keep failed items identified while the app remains open. Retrying a failed item must not re-import successful siblings. Selecting the same image afresh is not a request for automatic duplicate detection.

On storage failure, preserve committed records and retain unsaved work in memory where possible. Explain that unsaved work may be lost if the app closes. Retry the pending mutation without duplication. Allow recovery export from the visible, successfully decoded photos and current notes even when persistence is unavailable. Never clear the database automatically to recover from an error.

Remove photo data and metadata transactionally. Clear the entire current walk transactionally only after confirmation, and only reset the visible state after success. Prevent import, export, and clear operations from racing. Keep a second writable tab from overwriting the current walk using a simple tested exclusive-writer mechanism or explicit read-only behavior.

### Images and export

Provide separate camera and multi-file library controls. Start with the handoff's camera input attributes, but verify actual iPad behavior. Require JPEG and PNG imports and test actual iPad camera/library selections, including HEIC-origin photos. Do not infer decode support from `accept="image/*"` or a filename. Identify unsupported/corrupt files without discarding other photos. If normal iPad photos fail, treat that as a day-one blocker and investigate before adding a conversion dependency.

Process images incrementally. Start around 1600 px on the long edge and JPEG quality 0.8, preserve aspect ratio and orientation, and avoid upscaling. Release decoded images, temporary canvases, and object URLs when no longer needed. Avoid holding full-resolution originals for all 50 images in memory.

Export a stable snapshot. Disable mutations during snapshot/export for this MVP. If saving fails, make the recovery-export path explicit instead of waiting indefinitely. Block duplicate exports, show progress, and retain the walk on failure. Generate first, then expose a user-initiated Save/Share action; provide a save/download fallback when file sharing is unavailable or canceled. Canceling sharing must not clear the walk or report it delivered.

### PDF contract

- US Letter portrait, 612 × 792 points, four tiles per page in a 2 × 2 grid.
- Number photos consecutively in current queue order. No reordering controls.
- Fit images without stretching or cropping. Reserve sufficient note space for all 200 characters; wrap long unbroken text and test multiline notes.
- Leave missing notes blank. Partial final pages are valid. Disable export for an empty walk.
- Header contains the optional job/lot ID and date. Footer is "page X of Y".
- Use the walk creation date in the device's local timezone consistently for header and filename. This is an engineering default, not a new date-entry feature.
- Filename is `Cabinet-Walk_<sanitized-job-id>_<YYYY-MM-DD>.pdf`, omitting the ID segment when blank. Sanitize unsafe filename characters and handle a sanitized-empty ID.
- Ensure the PDF text path supports actual user text, including punctuation and accented characters. Never silently drop unsupported characters or notes. Bundle any required font assets.
- Fifty photos produce 13 pages. Do not split into multiple PDFs or lower quality merely to guess an unknown upload limit.

## Two-day execution sequence

### Day one: usable flow and private field test

1. Scaffold the app and minimal UI. Establish the data model, database access, save acknowledgments, hydration, and pause/resume first.
2. Build one photo end to end: import/capture, normalize, save, display, note, reload, export, save PDF. Use this to verify the module contracts before expanding capacity.
3. Add incremental batches, the 50-photo limit, note limits, removal, clear confirmation, progress, and recoverable failures. Produce the fixed PDF layout and usable iPad save flow.
4. Run typecheck, focused tests, and the production build. Exercise the built app. Prepare an HTTPS URL accessible to the user's iPad under applicable deployment permissions. Record which commit the deployment serves.
5. Run the day-one field checkpoint below. Do not spend this window polishing appearance. If the checkpoint cannot happen, record it as pending and continue independent verification; do not claim field readiness.

Day-one field checkpoint, performed by the user on the iPad:

- Capture a photo, import library photos, add a note, and save a PDF to Files.
- Inspect orientation, image detail, numbering, and notes in the PDF.
- Export a representative 50-photo walk and privately upload it to the internal job-jacket program.
- Report success/failure, PDF byte size if shareable, visible errors, and whether small defects remain readable. No program identity or private photos need to be shared with the agent.
- If the upload fails, first distinguish PDF opening, Files saving, network, and program rejection. Change compression only when the observed failure and readability checks justify it.

### Day two: recovery and acceptance

1. Fix issues observed on day one, prioritizing data loss, capture/import failures, unreadable PDF content, and failed save/upload flows.
2. Complete fault injection, offline tests, interrupted-operation recovery, and 50-photo checks. Use the real iPad for browser-specific behavior.
3. Rerun affected checks against the integrated production build. Repeat the private upload check if export changes materially.
4. Deliver the working URL or exact local instructions, source state, test evidence, unresolved limitations, and next action. Never trade saved-work correctness for decoration or extra features.

## Verification and release gate

Run typecheck, configured lint, and production build. Add focused automated tests for the following behavior, using integration/browser tests where the database or UI matters:

| Area | Required evidence |
| --- | --- |
| PDF pagination | 1, 4, 5, 20, 40, and 50 photos yield 1, 1, 2, 5, 10, and 13 pages. |
| PDF content | Render generated pages and inspect portrait/landscape images, numbering, first/last pages, full 200-character notes, long words, punctuation, blank notes, and job IDs. Text extraction alone does not prove correct layout. |
| Ordering and removal | Delayed image decodes do not reorder photos. Removing one excludes it and preserves remaining note pairings. |
| Capacity | 45 + 10 rejects all 10; 45 + 5 succeeds; a 51-file selection rejects all; repeated taps cannot exceed 50. |
| Partial import | A corrupt file among valid files reports failure while valid files persist. Retrying only the failure adds no duplicate successful imports. |
| Persistence | Acknowledged photos, notes, job ID, and pause status survive refresh and connected close/reopen. Interrupt a batch and verify committed photos survive. |
| Save failure | Inject quota/transaction failures. No false "Saved", no clearing of existing data, additions stop, retry works, and recovery export remains available. |
| Offline while open | Load the production app online, then disable connectivity before the first import/export. Add photos and notes, pause/resume in the loaded app, generate PDF, and save to Files without network dependence. Offline reopening is excluded. |
| Export lifecycle | Repeated taps generate one export, UI shows progress, worker/export failures can be retried, canceled sharing retains data, and export never clears the walk. |
| Destructive actions | Canceling clear preserves everything; confirmed clear persists; failed clear does not pretend to succeed. Second-tab writes cannot silently overwrite data. |
| Privacy | Inspect network traffic during capture, notes, and export. No images, notes, or job identifiers leave the app. The user's separate manual upload is outside this check. |
| Real-device acceptance | On the user's iPad, 50 photos save, restore, and export; normal camera/library inputs work; PDF saves to Files, remains readable, and passes the user's internal upload test. |

Record command results, artifact paths, commit/build identity, device/browser version, and the user's field-test results. Desktop browser checks complement iPad tests; they do not substitute for them. Do not claim iPhone verification.

Done means the agreed flow passes on the iPad, including the private upload, with no known saved-data loss or silent note truncation. If hardware testing or upload acceptance remains pending, deliver the build with that gate explicitly pending rather than calling it field-verified.

## Scope limits and escalation

No multi-walk library, cloud sync, accounts, AI, defect tagging, drawing, reordering, templates, branding, PWA installation, offline cold start, PunchLens integration, or automated internal-program upload. IndexedDB is local browser storage, not a backup; clearing browser data or storage eviction can remove a walk. Give a brief reminder to save PDFs to Files.

The user need not re-approve routine implementation choices. Ask only if evidence requires changing an agreed contract, such as the 50-photo capacity, four-photo layout, full notes, or one-PDF output. Present the failure and a concrete proposed change. Follow the active environment's push, merge, and deployment rules.

## Handoff and finish

Use an available handoff skill when changing agents. If none is available, leave a concise `HANDOFF.md` containing the checkout/branch/commit, dirty changes, tested and served build identity, run commands, test results and artifact paths, field-test status, blockers, and next action. Do not assume a skill or delegate is available without checking.

The final report must distinguish implemented behavior, automated verification, and user-observed iPad results. Include the deployment URL or exact run instructions and known limitations. Leave private program details and photos out of the report.
