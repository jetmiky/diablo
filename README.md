# Diablo

A central conductor that runs your skills through the [Pi coding agent](https://github.com/badlogic/pi-mono) in isolated git worktrees, stopping at human gates and handing work off as git commits.

## What it is

Diablo is **not the brain** — your skills are. Diablo is the conductor: it decides *which* model tier runs *which* skill, in *which* worktree, reading *which* inputs, then stops at *which* human gate.

- **Skill-driven** — your skills provide the procedures (grilling, PRD, issues, TDD, handoff, refactor). Diablo injects them into Pi via `@file` references.
- **Central, not a swarm** — one conductor dispatches Pi runs synchronously. No daemon, no message bus, no scheduler.
- **Git as the event store** — work transfers between steps as commits, so every step is durable and resumable.
- **Human gates** — interactive steps (grilling) hand you the keyboard; approval steps pause for `y/N`; AFK steps run headless.

## Credits

Diablo conducts a set of engineering skills authored by **Matt Pocock** — [github.com/mattpocock/skills](https://github.com/mattpocock/skills). The skills (`master-plan`, `tdd`, `grill-with-docs`, `to-prd`, `to-issues`, `handoff`, and others) are the "brain" diablo orchestrates; diablo itself is only the conductor. All credit for the skill methodology belongs to the original author. Vendored copies kept in this repo are derivative configurations adapted for diablo's pipeline; upstream remains the source of truth for the methodology.

## Status

Early development. Building the core step-execution primitive first (sequential, single-issue), parallel multi-issue later.

## Model tiers

| Tier | Model | Thinking | Used for |
|------|-------|----------|----------|
| planner-high | `kr/claude-opus-4.8` | high | grilling, master plan |
| planner-med | `kr/claude-opus-4.8` | medium | PRD, stage plan, final verify |
| worker | `kr/claude-sonnet-4.5` | medium | implementation |
| verifier | `kr/claude-sonnet-4.5` | medium | per-stage verification |

## Develop

```bash
bun install
bun test
bun run typecheck
```
