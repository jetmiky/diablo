# Vendored skills — upstream provenance

The skills under this directory are **vendored** into the diablo repository so
that the orchestration engine and the skills it drives evolve in lockstep (the
plan parser in `src/domain/plan.ts` is a strict contract on the master-plan
skill's output format), and so a fresh clone / npm install is fully
self-contained with no dependency on a global `~/.agents/skills` directory.

## Attribution

The engineering-skill methodology is authored by **Matt Pocock**.

- Upstream: https://github.com/mattpocock/skills

All credit for the skill methodology belongs to the original author.

## These are verbatim copies

The copies kept here are **verbatim, unmodified copies** of the upstream skills,
not derivative configurations. Copying verbatim is deliberate:

- a fresh clone is self-contained (no global `~/.agents/skills` dependency);
- attribution stays honest — what runs is exactly what upstream published;
- updating from upstream is a clean re-copy, not a merge.

The plan parser (`src/domain/plan.ts`) is a strict contract on the master-plan
skill's output, but that contract is currently satisfied by the **unmodified**
upstream skill — so no fork exists today.

## Vendored set

Only the skills diablo actually orchestrates are vendored (not unrelated Hermes
skills):

| Skill | Role in diablo |
|-------|----------------|
| `master-plan` | Planner (default `diablo run`) — frozen staged plan |
| `tdd` | Worker — red-green-refactor implementation discipline |
| `grill-with-docs` | Intake — Socratic requirement gathering |
| `to-prd` | Intake — PRD authoring from gathered requirements |
| `to-issues` | Intake — decompose a PRD into tracked issues |
| `domain-modeling` | Intake/design — shared domain vocabulary |
| `setup-matt-pocock-skills` | `diablo init` — project skill bootstrap |
| `improve-codebase-architecture` | Planner for `diablo refactor` |

## Not vendored: `handoff` (handled natively)

The upstream `handoff` skill is **deliberately not vendored**. diablo implements
stage-to-stage handoff natively in the engine: the worker's carry-forward note
(decisions, deferrals, gotchas) is captured as a progress event and folded by
the `ProgressTracker` into the same `progress.md` the next stage's design step
reads. A separate handoff skill would be redundant and could drift from the live
tracker, so handoff stays an engine concern, not a skill.

## Vendored from

- Source: a local checkout of the upstream skills (`~/.agents/skills`) that did
  not carry a git revision at vendoring time.
- Vendored on: 2026-06-28.

## Updating from upstream

Keep the copies **verbatim**. Re-copy from upstream to update. Only fork a skill
if the plan parser (or another hard engine contract) genuinely breaks against
the upstream output — and if you must, keep the fork minimal and record the
exact divergence and its reason in this file. Do not pre-emptively "adapt"
skills; verbatim is the default.
