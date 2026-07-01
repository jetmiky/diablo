<p align="center">
  <img src="assets/diablo.jpg" alt="Diablo" width="100%">
</p>

# Diablo

A skill-driven conductor for the [Pi coding agent](https://github.com/earendil-works/pi).

Diablo runs engineering skills through Pi in isolated git worktrees, turns each
handoff into a commit, retries implementation failures, and stops at human gates
when judgment is required.

Diablo is **not the brain**. The skills are. Diablo is the ritual coordinator.

## Built on Matt Pocock's skills

Diablo sits on top of the engineering skill system authored by
[Matt Pocock](https://github.com/mattpocock/skills/).

Those skills — planning, TDD, grilling, PRD generation, issue decomposition, and
architecture review — are the brain of the workflow. Diablo decides when to run
each skill, which Pi actor should run it, which files it should read, and how the
result becomes durable git history.

The vendored copies live in [`skills/`](skills/). See
[`skills/UPSTREAM.md`](skills/UPSTREAM.md) for provenance and the vendored set.

## Why "Diablo"?

The name is inspired by Diablo from *Tensei Shitara Slime Datta Ken*.

The vibe: composed, loyal, powerful, and extremely effective once given a clear
order. Diablo does not replace your judgment; it waits for a shaped task, then
quietly coordinates the sequence — plan, design, build, verify, commit, hand off.

Fan-inspired; not affiliated.

## How it works in 60 seconds

1. You create or generate an issue under `.scratch/<issue>/`.
2. Diablo creates an isolated worktree and branch for that issue.
3. An Architect writes or negotiates a frozen staged plan.
4. Each stage runs: Planner design → Worker implementation → Verifier review.
5. The Worker commits. The Verifier either passes, asks for an implementation
   retry, or halts on a plan problem.
6. A final verification checks the whole feature and its acceptance criteria.
7. The branch is left for you to merge, unless auto-merge is enabled.

For the fuller mechanism, see [`docs/how-it-works.md`](docs/how-it-works.md).

## The four Pi actors

Diablo uses four Pi roles. They are not daemons or separate agents chatting in a
swarm; each role is a separate Pi invocation with a narrow job.

| Actor | Job |
| --- | --- |
| **Architect** | Turns an issue into a frozen staged plan, or negotiates one through `diablo plan`. Also plans refactors. |
| **Planner** | Designs the next implementation stage against the code that actually exists now. Also performs final whole-feature verification. |
| **Worker** | Implements one stage, usually under the vendored TDD skill, then commits the work. |
| **Verifier** | Reviews one stage and returns `VERDICT: PASS` or `VERDICT: FAIL [implementation\|plan]`. |

The important split: the Architect plans the feature, the Planner designs the
next slice, the Worker changes code, and the Verifier judges that slice.

## Quickstart

### Requirements

- Node >= 22 or Bun
- Git
- [`pi`](https://github.com/earendil-works/pi) installed, configured, and on your
  `PATH`

Diablo resolves Pi by running the `pi` binary. If Pi is not on `PATH`, set:

```bash
export DIABLO_PI_BIN="/absolute/path/to/pi"
```

### Install / run

From this repository during development:

```bash
bun install
bun run src/cli/main.ts --help
```

After global install:

```bash
diablo --help
```

### Initialize a project

```bash
diablo init
```

This scaffolds:

- `diablo.config.json`
- `.gitignore` entries for Diablo runtime artifacts
- `AGENTS.md` or `CLAUDE.md`
- `CONTEXT.md`
- `.scratch/`
- `docs/agents/`

### Run an issue

```bash
mkdir -p .scratch/currency-convert
$EDITOR .scratch/currency-convert/01-convert.md

diablo run currency-convert
```

For a full guided example, start with the currency converter tutorial:
[`docs/tutorial/`](docs/tutorial/README.md).

## Main commands

| Command | Purpose |
| --- | --- |
| `diablo init` | Scaffold a repo for Diablo. |
| `diablo intake <feature>` | Turn a rough idea into PRD/issues through an interactive grilling flow. |
| `diablo plan [issue]` | Negotiate and freeze a plan before the expensive build. |
| `diablo run [issue]` | Execute an issue through the staged pipeline. |
| `diablo refactor <area>` | Run the same pipeline with an architecture/refactor planning skill. |
| `diablo clean [issue]` | Remove a completed issue worktree and, optionally, its branch. |
| `diablo telegram setup` | Configure per-repo Telegram progress notifications. |

When `plan`, `run`, or `clean` is called without an issue, Diablo opens an
interactive picker if the terminal supports it.

## Configuration

`diablo.config.json` controls model/provider selection, branch integration,
human gates, retry behavior, deterministic verification commands, safety limits,
and the skills directory override.

A typical scaffold looks like:

```json
{
  "defaults": {
    "provider": "9router",
    "model": "kr/claude-sonnet-4.5",
    "thinking": "medium"
  },
  "models": {},
  "integration": {
    "targetBranch": "main",
    "branchPrefix": "diablo/",
    "autoMerge": false
  },
  "gate": "none",
  "retry": { "limit": 2 },
  "limits": {
    "stepTimeoutMs": 1200000,
    "runBudgetMs": 14400000,
    "maxSteps": 200
  },
  "verify": { "commands": [] }
}
```

See [`docs/config.md`](docs/config.md) for the full reference and customization
examples.

## Progress and safety

Diablo keeps runs inspectable and resumable:

- work happens on `diablo/<issue>` in `.worktrees/<issue>/`;
- stage handoffs are commits, not hidden agent memory;
- progress is written to stdout and `.plans/<issue>-progress.md`;
- Telegram push is optional and stores credentials outside `diablo.config.json`;
- `verify.commands` lets Diablo measure typecheck/test results itself;
- `gate: "approval"` pauses after verified stages if you want human checkpoints.

## Docs map

| Doc | Use it for |
| --- | --- |
| [`docs/how-it-works.md`](docs/how-it-works.md) | The pipeline, actors, gates, worktrees, retries, and done gate. |
| [`docs/config.md`](docs/config.md) | Full `diablo.config.json` reference. |
| [`docs/tutorial/`](docs/tutorial/README.md) | Follow-along currency converter tutorial. |
| [`skills/UPSTREAM.md`](skills/UPSTREAM.md) | Matt Pocock skills attribution and vendoring policy. |
| [`docs/adr/`](docs/adr/) | Architectural decisions behind the engine. |

## Status

Early development. The core sequential, single-issue pipeline exists; broader
parallel multi-issue orchestration is intentionally later.

## Develop

```bash
bun install
bun test
bun run typecheck
```
