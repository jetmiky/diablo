# ADR 0002 — Worktree / branch lifecycle

Status: accepted
Date: 2026-06-29

## Context

diablo creates a git worktree + branch per issue but never removes one. Resume
awareness deliberately REUSES an existing worktree and frozen plan, so a worktree
must survive a halt for a run to be resumable — "never auto-delete mid-flight" is
correct. But there was no lifecycle at all: nothing reclaims a worktree even
after a successful, integrated run, so `.worktrees/<issue>/` and `diablo/<issue>`
branches accumulate as cruft and a stale worktree can collide with a later run of
the same issue.

Options considered:

- **Keep manual (status quo):** never auto-remove; rely on the user. Cruft grows
  unbounded.
- **Auto-clean on successful integration:** remove the worktree + delete the
  branch when `autoMerge` merges cleanly. Risk: deleting work the user had not
  pushed.
- **Explicit `diablo clean` command:** user-invoked teardown with a guard against
  removing an unmerged branch.

## Decision

**Explicit `diablo clean [issue]` command — never automatic.**

- Teardown removes the worktree (`git worktree remove`) and optionally deletes
  the branch, via the `ProcessRunner` seam.
- It REFUSES to remove a worktree whose branch is not merged into the target
  branch unless `--force` is given (reuses `isMerged`).
- Nothing auto-deletes, so resume-awareness is fully preserved: a halted run can
  always be resumed exactly as today.

## Rationale

This is the most aligned with the project's "human stays the gatekeeper" /
warn-not-block posture. Auto-cleaning on merge risks destroying work the user did
not intend to lose, and the resume guarantee forbids any automatic mid-flight
removal. An explicit, guarded command gives a safe, first-class way to reclaim
space without ever surprising the user.

## Consequences

- New `clean` command wired in `main.ts`, parsed in `args.ts`, with help text.
- A safe teardown use-case (pure orchestration over the seam) unit-tested against
  fakes, with the unmerged-branch guard.
- The tutorial's manual-cleanup note is updated to point at `diablo clean`.
