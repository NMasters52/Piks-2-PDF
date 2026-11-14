# Pik-2-PDF: one-day implementation kickoff

You are the orchestration agent. Implement the MVP in this workspace. There is one day left. Begin execution after preflight; do not restart the product interview.

## Read first

1. Applicable `AGENTS.md` instructions.
2. `pik-2-pdf-playbook.md`, the implementation and acceptance contract.
3. `mvp-alignment.md` and `CONTEXT.md`, the agreed decisions and vocabulary.
4. `CABINET_PDF_HANDOFF.md`, the original technical baseline.
5. `Orchestration-Playbook-Design-Guide.md`, execution guidance.

This kickoff supersedes the playbook's two-day schedule and optional delegation plan. It does not change product scope. Compress execution into one day and target a working integrated iPad build by the halfway point. Reserve the remaining time for field feedback, recovery testing, fixes, and handoff. This is a target, not a promise that untested work is complete.

## Authorized agent plan

Use Cursor-hosted Composer 2.5 for three bounded implementation tasks and Cursor-hosted Grok for three independent reviews. Keep at most three delegates running at once. The coordinator owns the scaffold, shared contracts, integration, deployment, and final verification. Do not create new top-level threads as substitutes for delegates. Do not launch nested delegates.

The previous chat verified this catalog, but did not launch agents:

| Purpose | Provider | Model | Explicit model options |
| --- | --- | --- | --- |
| Implementation | `cursor` | `composer-2.5` | `{"fastMode":"false"}` |
| Review | `cursor` | `grok-4.7` | `{"contextWindow":"256k","fastMode":"false","reasoning_effort":"medium"}` |

These option values are strings, as returned by the catalog. The direct `grok` provider was disabled; do not use it. Do not pass inherited Codex settings such as `serviceTier` or `reasoningEffort` to Cursor.

Discover the current `delegate_task` tool and call `orchestrator_capabilities` before the first launch. Confirm both models and their current supported options. Pass provider, model, and options explicitly in `target`. If unavailable, report the exact blocker; do not silently substitute providers or models. Follow current tool instructions if schemas or runtime behavior differ from this document.

## Launch gate

1. Inspect the workspace and Git state. Planning began in a folder without Git; that may have changed. Preserve existing work. Initialize Git only if needed, and commit the planning documents so worktree delegates can read them. Worktrees do not inherit uncommitted edits.
2. Run one short, read-only delegate through each requested model using `isolation: "worktree"`. Each must execute a shell command, report its actual working directory and commit, read the playbook, and return the exact 50-photo limit and offline boundary. No implementation, nested delegation, push, or deployment in these launch tests.
3. Inspect returned command evidence and actual artifacts where applicable. A queued/running acknowledgment or model self-identification does not prove successful execution. Confirm the launch result selected the requested provider/model.
4. Follow each delegate's returned continuation instructions. Do not poll running tasks. Retain task IDs and links. If replacing a failed or unnecessary run, cancel any still-active task before launching its replacement. Do not create duplicate runs to compensate for a missing response.
5. Proceed with the build wave only after both launch tests succeed. If a launch fails, diagnose the returned error and report it. Do not claim the full graph is running.

## Build graph

Coordinator foundation -> three Composer implementation tasks -> coordinator integration -> three Grok reviews -> fixes and final verification.

The user can begin iPad testing as soon as the integrated build is available, while reviews proceed against that same recorded commit.

Before the build wave, the coordinator scaffolds React/TypeScript/Vite, installs dependencies, establishes test commands, and commits shared types and module interfaces. Define function signatures, error results, ownership of pending state, and worker messages before delegates implement them. Keep dependencies and the lockfile under coordinator ownership.

### Composer implementation wave

- Storage agent owns `src/lib/db.ts` and its focused tests: transactions, save acknowledgments, hydration, pause/resume persistence, and failure recovery.
- Images/PDF agent owns `src/lib/images.ts`, `src/lib/pdf.ts`, `src/workers/pdf.worker.ts`, and focused tests: incremental normalization, ordering, fixed layout, notes, progress, and export errors.
- UI agent owns `src/app/` and `src/components/` plus focused interaction tests: plain black-and-white controls, capture/library input, notes, capacity messages, pause/resume, save status, clear confirmation, and export actions.

Adjust paths to the scaffold before launch. Every task must name its exact files and contracts. Require agents to request interface/dependency changes through the coordinator rather than editing shared contracts independently. Each works in a tool-created isolated worktree from the same foundation commit and returns a commit, changed files, commands/results, and limitations. No push or deployment by children.

Integrate completed work into the coordinator's checkout. Inspect diffs and run the complete one-photo-to-PDF flow before the 50-photo checks. Verify the served app uses the integrated code.

### Grok review wave

Launch three new review delegates from the integrated commit, with separate worktrees and no implementation edits:

- Persistence review: committed-save semantics, failure handling, interrupted imports, clearing, and concurrent writes.
- PDF/image review: orientation, ordering, all note text, pagination, memory use, and export retry behavior.
- Offline/acceptance review: runtime network dependencies, capacity rules, UI flow, privacy, and gaps against the playbook.

Each review must return reproducible findings with file locations, commands/evidence, severity, and coverage limits. No findings is valid; do not invent defects to fill a report. Verify findings before fixing. The coordinator fixes small confirmed defects directly. Every requested independent re-check is a new review task against the updated commit.

## Brief every delegate explicitly

Delegates do not receive the parent conversation. Include the task objective, source documents, exact owned files, shared contracts, forbidden changes, relevant acceptance checks, and required return format in each prompt. Tell children to do their work themselves without spawning agents. Include the one-day deadline but do not use it to excuse data loss or unverified claims.

## Field checkpoint and completion

The user tests on an iPad. Prepare an HTTPS build under applicable deployment permissions. Record the served commit and ask the user to exercise capture, library import, saving to Files, and a representative 50-photo PDF upload into their private internal program. Do not ask for its name or upload limit. The user can report pass/fail without sharing private photos.

Complete offline-while-open and saved-walk recovery checks from the playbook. Do not claim offline reopening, permanent browser storage, iPhone verification, or internal upload success without evidence.

Do not spend the last part of the day adding features. Prioritize capture, committed saves, resume, complete readable PDFs, and the actual iPad flow. When checks or user testing cannot be completed, deliver the working state and identify the pending gate plainly.

Keep a concise execution record with delegate task IDs/links, selected models, source commits, integrated commit, test results, deployed build identity, and field feedback. Use an available handoff skill; otherwise write `HANDOFF.md` with the current state and next action. Follow current tool rules for linking threads and PRs, waiting on delegates, and permissions.

Start now with workspace preflight and model capability verification, then the two launch tests. No agent has already been started by this planning chat.
