## ADR 0004 — Empty-state gate carve-out ("nothing to check yet")

Status: accepted
Date: 2026-06-30

## Context

ADR 0001 made the deterministic gate authoritative: a non-zero exit from a
configured gate command (`bun run typecheck`, `bun test`) fails the stage
regardless of the LLM verdict. That is correct for real failures, but it
misfires on a state that is legitimate in a TDD-staged plan: an early stage that
creates scaffolding before any source or test file exists.

Two concrete signals, both observed in live E2E runs (2026-06-30):

- `tsc --noEmit` on an empty source tree exits non-zero with
  `error TS18003: No inputs were found in config file ...`. A clean greet-feature
  run halted at stage 1 with `VERDICT: FAIL [plan]` — the agents were correct;
  the gate reacted to an empty tree.
- `bun test` on an empty suite prints `No tests found!` and exits non-zero. The
  engine already had `EMPTY_SUITE_NOTE` steering the LLM verdict to treat this as
  success, but ADR 0001's MEASURED exit fuses in independently of the prompt, so
  the empty suite would still hard-fail the gate.

The prompt-level carve-out (issue #1 option B) is therefore insufficient on its
own: a verifier instruction cannot override a measured non-zero exit.

Options considered (issue `01-tsc-no-inputs-early-stage.md`):

- **A — gate-level recognition:** the verdict layer recognises the
  "no inputs / nothing to check" exit as pass-equivalent for that command.
- **B — verdict-prompt carve-out:** extend the verifier instruction with a
  typecheck analogue of `EMPTY_SUITE_NOTE`. Insufficient alone (measured exit
  still fuses in).
- **C — plan-shape guidance:** instruct the planner never to emit a stage that
  produces zero compilable files.

## Decision

**A + C.**

- **A (the teeth):** a new pure predicate `isNothingToCheck(output)`
  (`src/domain/empty-gate-state.ts`) recognises the two empty-state signals.
  `GateOutcome` carries the command's combined stdout+stderr;
  `CommandVerifyGate` captures it; `combineVerdict` skips a non-zero gate whose
  output is a nothing-to-check state, so it cannot fail the stage. Scoped
  tightly: TS18003 counts ONLY when it is the sole TS diagnostic — any other
  `error TSxxxx` means real source is being checked and the gate still fails. A
  genuine failing test (non-empty-state non-zero) still has teeth.
- **C (defense in depth):** engine-owned planner guidance
  (`PLANNER_GUIDANCE`, ADR 0005) tells the planner to fold scaffolding into the
  first stage that also writes a real source file, so the empty-tree state is
  avoided at the source rather than only tolerated at the gate.

Option B is subsumed: the measured layer now handles the empty state directly,
so no separate prompt analogue is needed (the existing `EMPTY_SUITE_NOTE` stays
as harmless narration).

## Rationale

The empty-tree non-zero exit means "nothing here yet", not "the code is broken".
A is the only option that makes that distinction at the layer that has teeth
(the measured exit), and keeps the AFK guarantee from collapsing on stage 1 of
any clean TDD plan. C removes the state where practical, so A is a safety net
rather than a load-bearing crutch. The predicate is pure and unit-tested, and
the scoping keeps a real type error or failing test failing.

## Consequences

- `GateOutcome` gains an optional `output` field. Back-compat: an outcome
  without it is judged on exit code alone, exactly as before.
- The carve-out can only NEUTRALISE a measured non-zero exit; it never upgrades
  a non-pass LLM verdict (a FAIL/none verdict still fails the stage).
- The recognizer is pattern-based (tsc TS18003, bun "No tests found!"). Other
  toolchains may need their own signals added to `isNothingToCheck` — revisit
  when a non-bun/non-tsc gate is configured.
