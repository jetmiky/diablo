# Tutorial: build a currency converter with Diablo

Build a small TypeScript currency converter end to end — two features, both run modes:

| Feature | Run mode | Shows |
| --- | --- | --- |
| **1 — conversion core** | `diablo run` directly | auto-plan, straight to build |
| **2 — live CLI** | `diablo plan` → `diablo run` | freeze a plan first, then build |

> **Time:** ~15 min + agent run time. **Cost:** real Pi model calls.

---

## Prerequisites

| Need | Check | Expect |
| --- | --- | --- |
| Node ≥ 22 or Bun | `bun --version` | a version |
| Pi, configured | `pi --version` | runs, no auth error |
| git | `git --version` | a version |

diablo resolves `pi` from `PATH`. If it isn't there, set `DIABLO_PI_BIN` to its absolute path.

---

## Step 0 — Shorthand

Not installed globally here, so run from source behind an alias:

```bash
export DIABLO_SRC="$HOME/playground/diablo"   # your local clone
export PATH="$HOME/.bun/bin:$PATH"            # so bun + pi resolve
alias diablo='bun run "$DIABLO_SRC/src/cli/main.ts"'

diablo --version    # → 0.1.0
```

(After `npm i -g @jetmiky/diablo`, just use `diablo`.)

---

## Step 1 — Init the project

```bash
mkdir -p ~/playground/currency-converter && cd ~/playground/currency-converter
diablo init --package-manager bun --setup-skills
```

Run everything below from inside `currency-converter`. This scaffolds Diablo's
files, runs the interactive Matt Pocock skills setup, and bootstraps git +
husky/commitlint with Bun. Pick `--package-manager skip` for non-Node projects.

The config it writes:

```json
{
  "defaults": {
    "provider": "9router",
    "model": "kr/claude-sonnet-4.5",
    "thinking": "medium"
  },
  "models": {},
  "integration": { "targetBranch": "main", "branchPrefix": "diablo/", "autoMerge": false },
  "gate": "none",
  "retry": { "limit": 2 },
  "limits": { "stepTimeoutMs": 1200000, "runBudgetMs": 14400000, "maxSteps": 200 },
  "verify": { "commands": [] }
}
```

Field meanings: [docs/config.md](../config.md).

---

## Feature 1 — conversion core, via `diablo run` (no plan)

A small, well-understood ticket: skip planning, let `run` auto-plan.

**1. Drop the ticket in** (diablo reads from `.scratch/<issue>/`):

```bash
mkdir -p .scratch/currency-convert
cp "$DIABLO_SRC/docs/tutorial/feature-convert.md" .scratch/currency-convert/01-convert.md
```

**2. Run it:**

```bash
diablo run currency-convert
```

With no frozen plan, `run` auto-plans and builds:

1. **Worktree** — isolated at `.worktrees/currency-convert/` on branch
   `diablo/currency-convert`; your main checkout stays clean.
2. **Plan** (opus) — freezes a master plan of staged `T-00X` tasks.
3. **Each stage** — `design` (names functions/types) → `worker` (TDD, commits) →
   `verifier` (typecheck + tests, `VERDICT: PASS/FAIL`).
4. **Retry** — `FAIL [implementation]` re-runs the worker (up to `retry.limit`);
   `FAIL [plan]` halts to you.
5. **Final verification** across the feature.

Watch progress in a second terminal:

```bash
cat .worktrees/currency-convert/.plans/currency-convert-progress.md
```

When done, the work sits on its branch (`autoMerge` is `false`). Inspect, then merge:

```bash
cat .worktrees/currency-convert/src/money.ts
git merge --no-ff diablo/currency-convert
```

---

## Feature 2 — live CLI, via `diablo plan` then `diablo run`

Builds on Feature 1 and leaves real design choices open (how a failed fetch
surfaces, where the HTTP boundary lives, how the loop stays testable). That's
when planning earns its keep.

**1. Drop the ticket in:**

```bash
mkdir -p .scratch/currency-cli
cp "$DIABLO_SRC/docs/tutorial/feature-cli.md" .scratch/currency-cli/01-cli.md
```

**2. Negotiate a plan:**

```bash
diablo plan currency-cli
```

It proposes a staged plan, then waits. Challenge it in plain words ("how should
a failed fetch surface?") — it defends or revises, citing the ticket. Type
`approve` to freeze (status → `planned`), or `abort` to walk away.

**3. Run the frozen plan:**

```bash
diablo run currency-cli
```

`run` now executes **that** plan instead of auto-planning — a half-negotiated
draft is rejected until you `approve` it. Integrate as before:

```bash
git merge --no-ff diablo/currency-cli
```

> **Picker shortcut.** Run `diablo plan` / `diablo run` with no issue to pick
> from a list of `.scratch/` issues by status.

---

## Optional — pause after each stage

Set `"gate": "approval"` in `diablo.config.json`. After each verified stage
diablo asks `Proceed? [y/N]`; anything but `y` halts cleanly (committed work
stays). Re-run `diablo run <issue>` to resume.

---

## Optional — build a ticket from a rough idea with `diablo intake`

Hand diablo a vague idea and let it interview you into a precise one:

```bash
diablo intake currency-convert
```

Interactive: a Socratic `grill-with-docs` session → optional state-machine
modeling → PRD → your approval → issue files under `.scratch/`. Paste the
bullets from [`toy-idea.md`](toy-idea.md) as your opening answer; compare the
result against [`feature-convert.md`](feature-convert.md).

---

## Cleanup

Once an issue's branch is merged, reclaim its worktree (and branch) with the
explicit cleanup command — never automatic, so a halted run is always resumable:

```bash
diablo clean currency-convert    # removes the worktree + deletes the merged branch
diablo clean currency-cli
```

`diablo clean` refuses to remove a worktree whose branch isn't merged into the
target branch; pass `--force` to discard unmerged work anyway, or `--keep-branch`
to remove only the worktree. To wipe the whole sandbox at once:

```bash
rm -rf ~/playground/currency-converter
```

---

## Variations

| Try | How |
| --- | --- |
| Auto-merge on pass | `"integration.autoMerge": true` |
| Cheaper run | `diablo run currency-convert --worker-model claude-haiku-4.5` |
| Refactor flow | `diablo refactor <area>` |

---

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| First step fails instantly | Pi not configured | `pi --version`, set up Pi |
| `spawn pi ENOENT` | `pi` not on `PATH` | ensure `which pi` works, or set `DIABLO_PI_BIN` |
| Intake shows no prompts | old build | rebuild — interactive sessions inherit your terminal |
| `exit code 127` on commit | bun not on `PATH` for husky | `export PATH="$HOME/.bun/bin:$PATH"` |
| `Vendored skills directory not found` | bad invocation path | use the absolute `src/cli/main.ts` from Step 0 |
| Run halted on `FAIL [plan]` | frozen plan can't be satisfied | read verifier feedback, fix the ticket, start fresh |

> **Resuming:** `diablo run` is resume-aware — re-run a halted issue and it
> reuses the frozen plan and worktree.
