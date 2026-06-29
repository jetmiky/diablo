# ADR 0001 — Engine-owned verification gate

Status: accepted
Date: 2026-06-29

## Context

diablo's headline promise is "safe to run AFK". Until now the correctness gate
rested entirely on the verifier LLM honestly running the project's gates and
honestly reporting `VERDICT: PASS`. Nothing in the engine ever executed the
typecheck/test suite and checked its exit code, so a hallucinated PASS, a
wrong command, or a skipped suite would be believed. Separately, when a project
had a husky pre-commit, a worker that wrote a failing test made `git commit`
fail inside the hook; that raised a generic error that crashed the whole run
instead of routing into the existing `FAIL [implementation]` retry loop. And a
project with no husky (brownfield, or `skip` chosen at bootstrap) had no
deterministic gate at all.

Two options were considered:

- **Option A — engine-owned gate:** diablo runs the configured gate command(s)
  itself after each committing step, independent of any git hook. Husky becomes
  optional defense-in-depth.
- **Option B — lean on husky:** keep husky as the gate, but classify a
  hook-failed commit as `FAIL [implementation]` and feed it into the retry loop.

## Decision

**Option A — engine-owned gate.**

The effective stage verdict becomes `measured_exit_code_ok AND llm_verdict`. The
LLM verdict provides narration and the FAIL category (`[implementation]` vs
`[plan]`); the measured exit code of the gate command is what has teeth. A green
verdict over a non-zero gate exit is a FAIL.

- After a committing step, diablo runs the configured gate command(s) (typecheck
  + test) through the `ProcessRunner` seam and captures the exit code.
- A deterministic gate failure — whether a measured non-zero exit or a
  husky-blocked commit — is routed into the SAME `FAIL [implementation]` retry
  path that already exists in `run-stage`, with the captured output injected as
  feedback, instead of crashing. `FAIL [plan]` still halts to a human.
- The gate command is resolved from `diablo.config.json` (built-in default ←
  config), since it is project- and package-manager-specific (`bun test` vs
  `npm test` vs none).
- A project with no configured gate degrades explicitly and loudly: diablo
  states the run is LLM-verdict-only, rather than silently pretending the verdict
  is authoritative.

## Rationale

Option A is the only choice that makes the AFK guarantee hold regardless of
husky, works identically for greenfield and brownfield, and matches the
project's standing principle: **the agent judges, diablo enforces mechanically.**
The truth of "tests pass" should be a fact diablo MEASURES, not a sentence the
model EMITS. Option B couples soundness to a hook the user can bypass with
`--no-verify` and is useless for `skip`/brownfield projects.

## Consequences

- diablo must know the project's gate command — a new config surface
  (`gate`/`verify` command), with a sane built-in default.
- Husky remains useful as local defense-in-depth but is no longer load-bearing
  for the run's correctness.
- The retry budget (`retry.limit`) now bounds retries triggered by measured
  failures as well as verifier-verdict failures.
