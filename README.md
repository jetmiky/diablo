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
(opt-in) offers to bootstrap tooling. When you opt in, it asks which package
manager to use — **bun**, **npm**, or **pnpm** — and runs `git init` (if needed)
plus installs husky/commitlint with that manager. Choosing **skip** runs `git
init` only and installs no Node tooling — the escape hatch for non-Node projects
(Go, Rust, Python), since husky/commitlint require Node regardless of manager.
Config is optional — diablo runs with built-in defaults when no file is present.

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

## Intake

`diablo intake <feature>` runs the requirement-gathering phase IN FRONT of
`run`. Unlike `run` (autonomous, AFK), intake is interactive and Socratic — it
cannot be AFK — so it is a separate command:

1. **grill-with-docs** — an interactive session that gathers requirements,
   adapting to the project: brownfield reads existing code + `CONTEXT.md`,
   greenfield starts from an empty glossary.
2. **state-machine modeling** (optional) — for stateful features, an interactive
   `domain-modeling` session enumerates states/transitions/guards/events and
   writes a `state-machine.md` artifact the PRD step then incorporates. You're
   asked up front; declining skips it cleanly so simple features aren't burdened.
3. **to-prd** — authors a PRD from the gathered requirements (and the state
   machine, when modeled).
4. **human approval checkpoint** — you approve the PRD before it is decomposed;
   declining stops cleanly with the PRD saved and no issues written.
5. **to-issues** — decomposes the approved PRD into tracked issues under
   `.scratch/<feature>/`, which `diablo run` then picks up.

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

## Progress

A run emits structured progress events through a `ProgressPort` to three sinks:

- **stdout** — a one-line status per event (always on).
- **`progress.md`** — a LIVE tracker in the worktree's `.plans/`, updated every
  event with per-stage status (TODO/IN_PROGRESS/DONE/HALTED), commit SHA,
  verdict, retries, and a Pending Todos list. Each stage's **handoff note**
  (the worker's carry-forward narrative: decisions, deferrals, gotchas) is
  folded into the same artifact — one file, no drift.
- **Telegram** — push notifications rendered as Telegram-HTML (the supported
  `<b>/<i>/<code>/<pre>/<a>` subset, escaped for path/SHA/code-heavy content).
  Enabled only when `DIABLO_TELEGRAM_BOT_TOKEN` and `DIABLO_TELEGRAM_CHAT_ID`
  are set in the environment; no credentials are read from config or committed.

Sinks are best-effort: a failing sink (e.g. Telegram down) never halts a run.
Idle-vs-working is derived from the event stream (`waiting-for-approval` = idle).
Two-way interactive approval over Telegram is out of scope (deferred).

## Develop

```bash
bun install
bun test
bun run typecheck
```
