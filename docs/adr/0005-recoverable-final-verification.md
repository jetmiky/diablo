## ADR 0005 — Recoverable final verification + engine-owned planner guidance

Status: accepted
Date: 2026-06-30

## Context

Observed in a live E2E run (currency-convert feature, 2026-06-30): a feature
passed every per-stage verifier and committed three stages of correct,
typecheck-clean, fully-tested code, then halted unrecoverably at the FINAL
whole-feature verification. Two roots, from issue
`02-stage-verifier-criteria-consistency.md`:

1. **No recovery at the final gate.** The final verification maps to a single
   `planner-med` step with `verifies:true` and no worker. run-stage's retry loop
   only fired for `tier === "verifier"`, so the final step took the
   non-verifying path, ran once, and any FAIL propagated straight to a halt —
   the worst place to fail for an AFK run (most work done, least recoverable).

2. **Criteria drift.** The planner invented an acceptance criterion absent from
   the ticket — `T-008: "No type assertions or @ts-ignore comments"`. Idiomatic
   code (`x as Currency`, typecheck-clean) satisfied every per-stage verifier but
   the holistic final verifier enforced the invented criterion and failed it.

Options considered: **A** make the final verification recoverable; **B** enforce
criteria uniformly per-stage; **C** constrain planner criteria drift to the
ticket. (A and C address different roots; B addresses timing.)

## Decision

**A + C.**

- **A (recovery):**
  - run-stage now treats a step as verifying when `verifies === true` OR
    `tier === "verifier"`, so the final planner-tier verification enters the
    same bounded retry loop as a per-stage verifier.
  - `Stage` gains an optional `recoveryWorker`. plan-to-issue attaches one to the
    final verification stage: a worker-tier step scoped to the verification
    tasks' target files, reading the frozen plan, that commits its fix. It is NOT
    in the step sequence — only the retry path invokes it, with the verifier's
    feedback injected — so it never runs pre-emptively or commits an empty diff.
  - A `FAIL [implementation]` at the final gate now routes to a bounded worker
    retry; a `FAIL [plan]` still halts to a human (the frozen-plan guarantee:
    never auto-replan mid-run).

- **C (criteria provenance):** engine-owned `PLANNER_GUIDANCE`
  (`src/app/planner-guidance.ts`), appended to every planner instruction (the
  auto-plan path in load-issue and the interactive proposal in plan-session),
  tells the planner that every task's acceptance criteria MUST trace to a
  requirement stated in the ticket — do not invent stylistic rules the ticket
  never asked for.

Option B (uniform per-stage enforcement) was not adopted: it is hard to
guarantee a per-stage verifier checks exactly what the holistic one will, and A
already makes a late-surfaced, code-fixable complaint recoverable while C reduces
how often one surfaces.

## Rationale

A makes the most-expensive failure point survivable with machinery the engine
already had (the bounded retry loop) plus one declarative field. C attacks the
provenance root so spurious criteria are less likely in the first place.
Together: C reduces surprise criteria; A makes the final gate survivable when
something does surface late. Guidance lives in the engine, not the vendored
master-plan skill, which stays a verbatim upstream copy — the skill says HOW to
plan; the engine says what shape its pipeline requires.

## Consequences

- `Stage.recoveryWorker` is optional; ordinary stages omit it and recover via
  their own inline worker exactly as before (back-compat preserved, asserted by
  test).
- The recovery worker's retries are bounded by the same `retry.limit` as
  per-stage retries; exhausting it halts to a human.
- `PLANNER_GUIDANCE` is also injected on refactor runs (custom planner
  instruction) and on a bounded re-ask, so the guidance is unconditional.
- Revisit if real runs show the recovery worker thrashing on a criterion that is
  actually a plan defect miscategorised as implementation.
