# Orchestration Playbook Guide

A simple reference for writing agent playbooks. **Not a required template or automated system.** Use only what the task needs.

## What a playbook should cover

1. **Goal** — What needs to be done? What counts as finished?
2. **Preflight** — Check the relevant starting conditions: correct repo/worktree, available model and tools, running services if needed, and permission boundaries.
3. **Delegation** — Who does what? Who owns the final result? Use isolated worktrees if agents work in parallel.
4. **Verification** — What tests or reviews prove the *intended behavior* works? Confirm they ran against the correct code.
5. **Handoff** — Leave the next agent the current state, checkout/commit, test results, blockers, and next step. Use the handoff skill rather than repeating its instructions.
6. **Finish** — Report what changed and what remains. Get approval before push, merge, or deploy when required.

## Keep it proportional

- **Small task:** One agent, one relevant check, short summary.
- **Larger task:** Preflight, delegation, review, and handoff as needed.
- **Parallel or high-risk task:** Explicit ownership, isolated workspaces, stronger verification.

## Lessons from the audit

- Tests passed in one worktree while a different checkout served the app. **Record which code was tested and served.**
- Tests passed but checked the wrong lesson-selection behavior. **Verify user intent, not just green tests.**
- Delegates failed because models, options, or Git roots were wrong. **Check launch prerequisites first.**
- Shared browsers and APIs caused collisions. **Coordinate shared resources.**
- Auto-deploy can start as soon as code merges. **Run critical checks before shipping where possible.**

## Guiding rule

**Use the smallest workflow that makes the result trustworthy.** These are design considerations, not mandatory steps for every playbook. Add automation or structure only after repeated real-world problems justify it.
