# Diablo

A central conductor that runs your skills through the [Pi coding agent](https://github.com/badlogic/pi-mono) in isolated git worktrees, stopping at human gates and handing work off as git commits.

## What it is

Diablo is **not the brain** — your skills are. Diablo is the conductor: it decides *which* model tier runs *which* skill, in *which* worktree, reading *which* inputs, then stops at *which* human gate.

- **Skill-driven** — your skills provide the procedures (grilling, PRD, issues, TDD, handoff, refactor). Diablo injects them into Pi via `@file` references.
- **Central, not a swarm** — one conductor dispatches Pi runs synchronously. No daemon, no message bus, no scheduler.
- **Git as the event store** — work transfers between steps as commits, so every step is durable and resumable.
- **Human gates** — interactive steps (grilling) hand you the keyboard; approval steps pause for `y/N`; AFK steps run headless.

## Credits

Diablo conducts a set of engineering skills authored by **Matt Pocock** — [github.com/mattpocock/skills](https://github.com/mattpocock/skills). The skills (`master-plan`, `tdd`, `grill-with-docs`, `to-prd`, `to-issues`, `handoff`, and others) are the "brain" diablo orchestrates; diablo itself is only the conductor. All credit for the skill methodology belongs to the original author.

The orchestrated skills are **vendored** into this repo under [`skills/`](skills/) so the engine and the skills it drives evolve in lockstep (the plan parser is a strict contract on the master-plan skill's output) and a fresh clone is self-contained. Those vendored copies are derivative configurations adapted for diablo's pipeline; upstream remains the source of truth for the methodology. See [`skills/UPSTREAM.md`](skills/UPSTREAM.md) for provenance and the vendored set.

## Status

Early development. Building the core step-execution primitive first (sequential, single-issue), parallel multi-issue later.

## Model tiers

| Tier | Model | Thinking | Used for |
|------|-------|----------|----------|
| planner-high | `kr/claude-opus-4.8` | high | grilling, master plan |
| planner-med | `kr/claude-opus-4.8` | medium | per-stage design (grounded in committed code), final verification |
| worker | `kr/claude-sonnet-4.5` | medium | implementation |
| verifier | `kr/claude-sonnet-4.5` | medium | per-stage verification |

Each implementation stage runs **design → worker → verifier**: a `planner-med`
design step reads the code prior stages actually committed and writes a short
design note (functions/types/files with signatures) that the worker implements
against. The frozen plan stays behavior-level; the per-stage design grounds the
interface in real code rather than guessing at plan time. The final
`Verification` stage escalates to the `planner-med` tier (a holistic,
whole-feature judgment), while mid-pipeline verifiers stay cheap on the verifier
tier.

## Configure

`diablo init` scaffolds a minimal `diablo.config.json`, runs the skill setup, and
(opt-in) offers to bootstrap `git`/`husky`/`commitlint`. Config is optional —
diablo runs with built-in defaults when no file is present.

```jsonc
{
  "models":      { "planner": "claude-opus-4.8", "worker": "claude-sonnet-4.5", "verifier": "claude-sonnet-4.5" },
  "integration": { "targetBranch": "main", "branchPrefix": "diablo/", "autoMerge": false },
  "gate":        "approval",
  "retry":       { "limit": 2 }
}
```

Model selection follows three layers, each overriding the one before:

```
built-in defaults  ←  diablo.config.json  ←  CLI flag (--planner-model, ...)
```

## Branch integration

Each run does its work on `<branchPrefix><issue>` (default `diablo/<issue>`),
cut from `targetBranch`. After a final PASS:

- `autoMerge: false` (default) — the branch is left intact and diablo prints the
  exact `git merge` command. A passing verdict is not the same as "the human
  wants this in main."
- `autoMerge: true` + a clean merge — the branch is merged into `targetBranch`
  in the primary working copy.
- A merge conflict — diablo aborts the merge cleanly, lists the conflicting
  files, and prints the manual command. Conflicts are **never** auto-resolved.

## Run vs refactor

`diablo run <issue>` and `diablo refactor <area>` share ONE engine — the same
design → worker → verifier → final-verify pipeline, integration, and gates. They
differ only in the planner skill injected:

| Command | Planner skill | Produces |
|---------|---------------|----------|
| `diablo run <issue>` | `master-plan` | an implementation plan from a ticket |
| `diablo refactor <area>` | `improve-codebase-architecture` | a refactor plan for an area |

Refactor is human-initiated, never auto-detected — deciding "this is large enough
to refactor" is a human judgment. A refactor plan can surface new issues, which
flow back through `to-issues` → `diablo run`. Same engine, looped.

## Develop

```bash
bun install
bun test
bun run typecheck
```
