# Orchestrator Preflight v1 — proposal

**Purpose:** Before delegating work, catch preventable environment failures. Run only checks relevant to the task. This is a launch gate, not a full testing or shipping checklist.

## When to run

Run once per delegation batch, and again if the workspace, provider, or shared runtime changes. A focused task with no delegation does not need this preflight.

## Launch checks

1. **Workspace:** Confirm the absolute project path and whether it is a Git root (`git rev-parse --show-toplevel`). For isolated Git worktree delegation, bind the delegate to a Git repository, not its non-Git parent. Record branch, HEAD, and dirty state. Use an isolated worktree for parallel changes; never allow two integrators to modify the same primary checkout.
2. **Delegate capability:** Query the live `orchestrator_capabilities` before launch. Select an available provider and actual model identifier, and pass explicit supported `target.options` (including `fastMode` when required). Do not assume a friendly model label maps to a particular backend.
3. **Runtime (only if needed):** Check required API/service health and ports. For browser/e2e work, identify the browser-lock owner and any shared test accounts. Schedule shared-account/browser tests sequentially.
4. **Permissions:** State whether the agent may edit, commit, push, merge, or deploy. Default to no push/merge/deploy without explicit user authorization. Do not silently change shared checkouts.

## Result

Record a compact launch receipt in the parent thread or ticket:

```md
### Preflight
- Task / repo: <task> / <absolute git root>
- Checkout: <absolute path> | <branch> | <HEAD> | <clean/dirty>
- Isolation: <worktree/shared> | integrator: <owner or none>
- Delegate: <provider> / <actual model ID> / <required target.options>
- Dependencies: <healthy/not needed/blocked> | browser owner: <owner/not needed>
- Permissions: <edit/commit/push/merge/deploy scope>
- Result: PASS | BLOCKED | LIMITED (reason and next action)
```

**PASS:** Relevant checks succeeded; delegation may proceed.

**BLOCKED:** A required precondition failed. Do not launch the affected delegate. Fix it or request a decision.

**LIMITED:** A nonessential check cannot be completed; proceed only with the restricted scope clearly stated (for example, code review without browser verification).

## Failure handling

- Model unavailable, rejected options, credentials missing, or Git-root mismatch = **infrastructure/setup failure**, not worker performance.
- If the requested model is unavailable, report the failure and propose an alternative. Do not silently substitute models when model choice matters.
- If isolation is unavailable, do not quietly fall back to a shared checkout during parallel edits. Request approval for a safe alternative or run tasks sequentially.
- If an API is down or a browser lock is held, do not claim e2e verification is possible. Defer that phase or resolve the dependency first.
- Avoid rerunning expensive checks when the environment has not changed; reuse the receipt but recheck volatile facts at launch.

## Boundary with `/handoff`

Preflight confirms readiness **before** delegation. The handoff records the actual checkout, revision, provider, test evidence, and runtime **after** work. A handoff is not proof that preflight conditions are still true; the receiving agent revalidates volatile state.

## Acceptance tests

1. Delegating from a non-Git parent with worktree isolation is blocked before launch.
2. An unavailable model or rejected provider option is identified before assigning implementation work.
3. A browser verification job with an occupied browser lock or unhealthy API is blocked or restricted.
4. Two parallel tasks cannot silently share the primary checkout.
5. A single focused task does not incur unnecessary orchestration overhead.

**Status:** Draft only. Not installed, committed, or added to the playbook.
