# Tutorial: drive diablo on a toy project

Run diablo end to end on a small TypeScript library. You'll build **two
features** and see both run modes:

| Feature | Run mode | What it shows |
| --- | --- | --- |
| **1 — converter** | `diablo run` directly | auto-plan: no `plan` step, straight to build |
| **2 — arithmetic** | `diablo plan` → `diablo run` | negotiate + freeze a plan first, then build |

> **Time:** ~15 min of attention + agent run time. **Cost:** real Pi model calls.

---

## Prerequisites

| Need | Check | Expect |
| --- | --- | --- |
| Node ≥ 22 or Bun | `bun --version` | a version |
| Pi, configured | `pi --version` | runs, no auth error |
| git | `git --version` | a version |

diablo spawns `pi` for every step, resolving it from `PATH` (any manager). If
`pi` isn't on `PATH`, set `DIABLO_PI_BIN` to its absolute path.

---

## Step 0 — Shorthand

diablo isn't installed globally here; run it from source behind an alias.

```bash
export DIABLO_SRC="$HOME/playground/diablo"   # your local clone
export PATH="$HOME/.bun/bin:$PATH"            # so bun + pi resolve
alias diablo='bun run "$DIABLO_SRC/src/cli/main.ts"'

diablo --version    # → 0.1.0
```

(After `npm i -g @jetmiky/diablo`, just use `diablo` directly.)

---

## Step 1 — Init the project

```bash
mkdir -p ~/playground/roman-toy && cd ~/playground/roman-toy
diablo init
```

Run every command below from inside `~/playground/roman-toy`. `init`:

1. Scaffolds `diablo.config.json` (won't clobber an existing one).
2. Runs the interactive skill-setup Pi session — answer its prompts in the terminal.
3. Asks to bootstrap tooling — answer **y**, choose **bun**. diablo runs
   `git init` and wires husky + commitlint.

> **Why bun?** The acceptance criteria run `bun test` / `bun run typecheck`.
> Pick **skip** for non-Node projects (git init only).

The config it writes:

```jsonc
{
  "models": { "planner": "claude-opus-4.8", "worker": "claude-sonnet-4.5", "verifier": "claude-sonnet-4.5" },
  "integration": { "targetBranch": "main", "branchPrefix": "diablo/", "autoMerge": false },
  "gate": "none",
  "retry": { "limit": 2 }
}
```

Field meanings: [README → Configure](../../README.md#configure).

---

## Feature 1 — converter, via `diablo run` (no plan)

A small, well-understood ticket: skip planning and let `run` auto-plan.

**1. Drop the ticket in.** diablo reads tickets from `.scratch/<issue>/`.

```bash
mkdir -p .scratch/roman-convert
cp "$DIABLO_SRC/docs/tutorial/feature-convert.md" .scratch/roman-convert/01-convert.md
```

**2. Run it.**

```bash
diablo run roman-convert
```

With no frozen plan, `run` auto-plans and goes straight into the build:

1. **Worktree** — cuts an isolated worktree at `.worktrees/roman-convert/` on
   branch `diablo/roman-convert`. Your main checkout stays clean.
2. **Plan** (planner/opus) — writes a frozen master plan of staged `T-00X` tasks.
3. **Each stage** runs `design → worker → verifier`:
   - **design** (planner-med) names the functions/types for the stage.
   - **worker** (sonnet) implements TDD-style (tests first) and commits.
   - **verifier** (sonnet) runs typecheck + tests, returns `VERDICT: PASS/FAIL`.
4. **Retry** — `FAIL [implementation]` re-runs the worker with feedback (up to
   `retry.limit`). `FAIL [plan]` halts to you (diablo never auto-replans).
5. **Final verification** across the whole feature.

Watch progress live in a second terminal:

```bash
cat .worktrees/roman-convert/.plans/roman-convert-progress.md
```

When done:

```
✅ issue roman-convert complete — final commit <sha>
📦 work is on diablo/roman-convert. To integrate:
   git merge --no-ff diablo/roman-convert
```

`autoMerge` is `false`, so diablo leaves the work on its branch — you decide.
Inspect, then merge:

```bash
cat .worktrees/roman-convert/src/roman.ts
git merge --no-ff diablo/roman-convert
```

---

## Feature 2 — arithmetic, via `diablo plan` then `diablo run`

This feature builds on Feature 1 and leaves real design choices open (how to
handle out-of-range results). That's when planning earns its keep: shape the
approach before the expensive build.

**1. Drop the ticket in.**

```bash
mkdir -p .scratch/roman-math
cp "$DIABLO_SRC/docs/tutorial/feature-math.md" .scratch/roman-math/01-math.md
```

**2. Negotiate a plan.**

```bash
diablo plan roman-math
```

1. **Propose** — the planner writes a proposed staged plan and summarizes its
   approach, non-goals, and risks.
2. **Negotiate** — it waits. Challenge it in plain words ("how should overflow
   past 3999 fail?"). It defends or revises, citing the ticket. Go a few rounds.
3. **Freeze** — type `approve` to freeze (status → `planned`). Type `abort` to
   walk away.

```
✅ plan for roman-math frozen. Next: diablo run roman-math
```

**3. Run the frozen plan.**

```bash
diablo run roman-math
```

Now `run` executes **that** plan instead of auto-planning. The guarantee: once a
plan exists, `run` only executes it if you approved it — a half-negotiated draft
is rejected until you `approve` it or delete the draft. Integrate as before:

```bash
git merge --no-ff diablo/roman-math
```

> **Picker shortcut.** Run `diablo plan` / `diablo run` with no issue to pick
> from a list of `.scratch/` issues tagged by status.

---

## Optional — watch each stage with the approval gate

By default `gate` is `"none"` (fully autonomous). To pause after each verified
stage, set in `diablo.config.json`:

```jsonc
  "gate": "approval",
```

After a stage is committed and passes verification, diablo asks `Proceed? [y/N]`.
`y` continues; anything else halts cleanly (committed work stays on the branch).
Re-run `diablo run <issue>` to resume from the frozen plan.

---

## Optional — build a ticket from a rough idea with `diablo intake`

Instead of dropping a ready ticket, hand diablo a vague idea and let it
interview you into a precise one:

```bash
diablo intake roman-convert
```

`intake` is interactive: a Socratic `grill-with-docs` session → optional
state-machine modeling → PRD → your approval → issue files under `.scratch/`.
Paste the bullets from [`toy-idea.md`](toy-idea.md) as your opening answer.
Output is non-deterministic (your answers shape it), but lands a ticket `run`
can execute the same way. See [`feature-convert.md`](feature-convert.md) for the
matured version of that idea.

---

## Cleanup

```bash
git worktree remove .worktrees/roman-convert --force; git branch -D diablo/roman-convert
git worktree remove .worktrees/roman-math --force;    git branch -D diablo/roman-math
# or just: rm -rf ~/playground/roman-toy
```

---

## Variations

| Try | How | Changes |
| --- | --- | --- |
| Fully autonomous | `"gate": "none"` | no pauses |
| Auto-merge on pass | `"integration.autoMerge": true` | clean run merges to `main` |
| Cheaper run | `diablo run roman-convert --worker-model claude-haiku-4.5` | flag overrides config |
| Refactor flow | `diablo refactor <area>` | same pipeline, refactor planner |

---

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| First step fails instantly | Pi not configured | `pi --version`, set up Pi |
| `spawn pi ENOENT` | `pi` not on `PATH` | ensure `which pi` works, or set `DIABLO_PI_BIN` |
| Skill setup / intake shows no prompts | old build | rebuild — interactive sessions inherit your terminal |
| `exit code 127` on commit | bun not on PATH for husky hook | `export PATH="$HOME/.bun/bin:$PATH"` |
| `Vendored skills directory not found` | bad invocation path | use the absolute `src/cli/main.ts` from Step 0 |
| Run halted at a gate | you declined | re-run `diablo run <issue>` — resumes from the frozen plan |
| Run halted on `FAIL [plan]` | frozen plan can't be satisfied | read verifier feedback; fix the ticket, start fresh |

> **Resuming:** `diablo run` is resume-aware — re-run a halted issue and it
> reuses the frozen plan and worktree instead of replanning.
