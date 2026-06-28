# Vendored skills — upstream provenance

The skills under this directory are **vendored** into the diablo repository so
that the orchestration engine and the skills it drives evolve in lockstep (the
plan parser in `src/domain/plan.ts` is a strict contract on the master-plan
skill's output format), and so a fresh clone / npm install is fully
self-contained with no dependency on a global `~/.agents/skills` directory.

## Attribution

The engineering-skill methodology is authored by **Matt Pocock**.

- Upstream: https://github.com/mattpocock/skills

All credit for the skill methodology belongs to the original author. The copies
kept here are **derivative configurations** adapted for diablo's pipeline;
upstream remains the source of truth for the methodology.

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

## Vendored from

- Source: a local checkout of the upstream skills (`~/.agents/skills`) that did
  not carry a git revision at vendoring time.
- Vendored on: 2026-06-28.

When updating from upstream, diff the upstream skill against the copy here and
reconcile deliberately — divergence is expected (e.g. tightening a skill's
output format to match the parser), so do not blindly overwrite.
