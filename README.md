# Diablo

A central conductor that runs your skills through the [Pi coding agent](https://github.com/earendil-works/pi) in isolated git worktrees, stopping at human gates and handing work off as git commits.

## What it is

Diablo is **not the brain** — your skills are. Diablo is the conductor: it decides _which_ model tier runs _which_ skill, in _which_ worktree, reading _which_ inputs, then stops at _which_ human gate.

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

| Tier         | Model               | Thinking | Used for                                                          |
| ------------ | ------------------- | -------- | ----------------------------------------------------------------- |
| planner-high | `claude-opus-4.8`   | high     | grilling, master plan                                             |
| planner-med  | `claude-opus-4.8`   | medium   | per-stage design (grounded in committed code), final verification |
| worker       | `claude-sonnet-4.5` | medium   | implementation                                                    |
| verifier     | `claude-sonnet-4.5` | medium   | per-stage verification                                            |

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
  "models": {
    "planner": "claude-opus-4.8",
    "worker": "claude-sonnet-4.5",
    "verifier": "claude-sonnet-4.5",
  },
  "integration": {
    "targetBranch": "main",
    "branchPrefix": "diablo/",
    "autoMerge": false,
  },
  "gate": "none",
  "retry": { "limit": 2 },
}
```

This block shows the built-in defaults — writing it out is the same as writing
`{}`. Every field is optional. A present key overrides only itself; everything else
keeps its built-in default. A malformed value (bad JSON, wrong type, unknown
enum) fails loudly at load time rather than silently reverting — so a typo can
never quietly change how a run behaves.

### Field reference

#### `models` — which model runs each tier

```jsonc
"models": {
  "planner": "claude-opus-4.8",    // grilling, master plan, per-stage design, final verify
  "worker": "claude-sonnet-4.5",   // implementation
  "verifier": "claude-sonnet-4.5", // per-stage verification
}
```

Each value is a model **name** only — diablo adds the provider (`9router/kr`)
and the per-tier thinking level (`planner` → high/medium, `worker`/`verifier` →
medium) at run time. You set _what_ model; the tier table owns _how hard it
thinks_.

| Value | Implication |
| ----- | ----------- |
| omitted (default) | planner `claude-opus-4.8`, worker & verifier `claude-sonnet-4.5` — the cost/quality split the pipeline is tuned for: an expensive brain plans and judges, cheaper hands implement. |
| a stronger worker (e.g. `claude-opus-4.8`) | higher implementation quality, materially higher cost and latency on the step that runs most often. |
| a cheaper planner/verifier (e.g. `claude-haiku-4.5`) | faster, cheaper toy/scratch runs; weaker plans and shallower verdicts, so a bad plan or a missed regression is more likely to slip through. |

Precedence (each layer overrides the one before):

```
built-in defaults  ←  diablo.config.json  ←  CLI flag (--planner-model, ...)
```

So `--worker-model claude-haiku-4.5` on a single `diablo run` beats the config
for that run only, without editing the file.

#### `integration` — what happens to the work branch after a passing run

```jsonc
"integration": {
  "targetBranch": "main",      // branch work is cut from, and merged back into
  "branchPrefix": "diablo/",   // work branch is <prefix><issue>
  "autoMerge": false,          // merge into targetBranch on PASS, or leave it
}
```

| Field | Values | Implication |
| ----- | ------ | ----------- |
| `targetBranch` | any branch name (default `main`) | the work branch is cut FROM this and (if `autoMerge`) merged back INTO it. Point it at `develop` or a release branch to keep `main` untouched. |
| `branchPrefix` | any string (default `diablo/`) | the work branch is `<branchPrefix><issue>`. Change it to namespace diablo's branches (e.g. `bot/`, `ai/`) for branch-protection or filtering. |
| `autoMerge: false` | **default** | on a final PASS the branch is left intact and diablo prints the exact `git merge` command. A passing verdict is not the same as "the human wants this in main" — you stay the gatekeeper of the trunk. |
| `autoMerge: true` | opt-in | a clean merge lands automatically in the primary working copy. A merge **conflict** is never auto-resolved: diablo aborts the merge cleanly, lists the conflicting files, and prints the manual command. |

#### `retry` — how many times a failed implementation re-tries before halting

```jsonc
"retry": { "limit": 2 }
```

`limit` is the number of EXTRA worker attempts after the first, on a verifier
`VERDICT: FAIL [implementation]`. The failed verifier feedback is injected into
the re-run so it fixes the specific defect rather than blindly redoing the stage.

| Value | Implication |
| ----- | ----------- |
| `0` | fail-fast — the first implementation FAIL halts the stage to a human. Cheapest, least autonomous. |
| `2` (default) | up to two self-corrections per stage before halting. Absorbs most "almost right" worker misses without supervision. |
| higher | more autonomy on flaky stages, but more spend on a stage that may be failing for a structural reason a retry can't fix. |

Note: a `VERDICT: FAIL [plan]` (the plan itself is wrong, not the code) **always**
halts immediately regardless of `limit` — diablo never auto-replans, because the
frozen plan is a hard contract. Retries only ever re-run the worker.

#### `gate` — human approval checkpoint

```jsonc
"gate": "none"   // or "approval"
```

Controls whether `diablo run` / `diablo refactor` pause for a human `y/N` during
an otherwise-autonomous run. The pause fires **after a stage's work is committed
AND has passed verification** — so you're approving a verified result, not a raw
mid-flight diff. Decline (anything not starting with `y`, including a bare Enter)
halts the run cleanly: the committed work stays on the worktree branch and the
pipeline stops with a clear message — a human halt, not a failure.

| Value | Implication |
| ----- | ----------- |
| `"none"` | **default** — fully AFK. No step ever pauses; the run goes from plan to final verdict to integration without asking. This is diablo's autonomous-conductor identity. |
| `"approval"` | a `y/N` checkpoint after **every verifying step**: each per-stage verifier (once the stage passes) and the final whole-feature verification. You review each verified chunk and decide whether to proceed to the next stage. |

What is **not** gated, even under `"approval"`: the design and worker steps. The
worker runs unattended (it's explicitly told not to ask for approval, since
there's no human in its loop), and the retry loop self-corrects an implementation
FAIL before the gate is ever consulted — so you're only asked once a stage has
genuinely passed. Note this is orthogonal to `integration.autoMerge`: `gate`
checkpoints *between stages during* a run; `autoMerge` decides what happens to
the branch *after* the whole run passes. The PRD-approval prompt inside `diablo
intake` is a separate checkpoint and is unaffected by this field.

#### `skillsDir` — override the vendored skills location

```jsonc
"skillsDir": "/abs/path/to/skills"
```

Omitted (the default), diablo resolves the `skills/` directory **vendored into its
own package** by walking up from its module location — never your project's cwd,
so a fresh clone is self-contained and `diablo run` works from any directory. Set
this only if you deliberately want to point the engine at a different skills set
(e.g. a local fork while debugging the plan parser). Pointing it at skills whose
`master-plan` output doesn't match diablo's plan parser will break plan loading —
this is the escape hatch the memory note calls "fork only when a hard contract
forces it."

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
design → worker → verifier → final-verify pipeline and integration. They differ
only in the planner skill injected:

| Command                  | Planner skill                   | Produces                             |
| ------------------------ | ------------------------------- | ------------------------------------ |
| `diablo run <issue>`     | `master-plan`                   | an implementation plan from a ticket |
| `diablo refactor <area>` | `improve-codebase-architecture` | a refactor plan for an area          |

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
