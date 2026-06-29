# Tutorial: take diablo for a spin on a toy project

This guide walks you through driving diablo end to end on a small, self-contained
toy project — a Roman numeral converter library. By the end you'll have watched
diablo plan the work, implement it stage by stage behind tests, verify each
stage, and hand you the result as commits on an isolated branch.

The toy requirement lives in [`TOYPROJECT.md`](../TOYPROJECT.md) at the repo
root. You'll copy it into a fresh project as diablo's "ticket."

> **Time:** ~10 minutes of your attention, plus agent run time.
> **Cost:** real model calls run through Pi — this is not a dry run.

---

## What you'll learn

- How `diablo init` scaffolds a project
- How diablo reads a ticket from `.scratch/<issue>/` and freezes a plan
- How the `design → worker → verifier` pipeline runs each stage
- How the `gate` config inserts a human approval checkpoint (we'll use it)
- Where diablo leaves the finished work, and how to integrate it

---

## Prerequisites

Check each of these before you start:

| Requirement          | Check                    | Expected                   |
| -------------------- | ------------------------ | -------------------------- |
| **Bun** ≥ 1.3        | `bun --version`          | a version prints           |
| **Pi coding agent**  | `ls "$HOME/.bun/bin/pi"` | the path exists            |
| **git**              | `git --version`          | a version prints           |
| **Pi is configured** | `pi --version`           | runs without an auth error |

diablo shells out to `pi` at `$HOME/.bun/bin/pi` for every agent step. If Pi
isn't installed or its provider/credentials aren't set up, the run will fail at
the first step — sort that out first.

> **A note on the `diablo` command.** diablo isn't installed globally in this
> tutorial; you run it straight from source. Everywhere below you'll see:
>
> ```bash
> bun run "$DIABLO_SRC/src/cli/main.ts" <args>
> ```
>
> where `$DIABLO_SRC` points at your local diablo clone. Step 0 sets that up
> behind a short alias. If you later `npm i -g @jetmiky/diablo`, you can replace
> the whole thing with just `diablo <args>`.

---

## Step 0 — Set up a shorthand

diablo always operates on your **current working directory**, but it finds its
bundled skills relative to its own location — so you can run it from anywhere by
its absolute path. Make an alias for this shell session:

```bash
# Point this at YOUR local diablo clone (edit the path to match yours).
export DIABLO_SRC="$HOME/playground/diablo"

# Put diablo's source entrypoint behind a short name, and make sure
# bun + pi are on PATH (so the husky hook and the pi binary resolve).
export PATH="$HOME/.bun/bin:$PATH"
alias diablo='bun run "$DIABLO_SRC/src/cli/main.ts"'
```

Verify it works:

```bash
diablo --version      # → 0.1.0
diablo --help         # → the command list
```

You should see:

```
diablo 0.1.0 — a skill-driven Pi conductor

Usage:
  diablo init            Scaffold diablo.config.json and set up skills
  diablo intake <feature> Gather requirements (grill → PRD → issues), interactive
  diablo run <issue>     Run an issue's stages through the agent pipeline
  diablo refactor <area> Refactor an area (same pipeline, refactor planner skill)
  diablo --version       Print the version
  diablo --help          Show this help
```

---

## Step 1 — Create a fresh toy project directory

Keep the toy project separate from diablo's own repo. Everywhere below assumes
you're working **inside** this directory.

```bash
mkdir -p ~/playground/roman-toy
cd ~/playground/roman-toy
```

From now on, run every `diablo` command from inside `~/playground/roman-toy`.

---

## Step 2 — Initialize the project with `diablo init`

```bash
diablo init
```

What this does, in order:

1. **Scaffolds `diablo.config.json`** with built-in defaults (it won't clobber an
   existing one).
2. **Runs the skill-setup flow** — an interactive Pi session that installs the
   engineering skills the pipeline drives.
3. **Asks (opt-in) whether to bootstrap tooling.** Answer **yes** when prompted,
   then choose **bun** as the package manager. diablo will `git init` the repo
   and install husky + commitlint.

You'll be prompted like this:

```
Bootstrap project tooling (git init if needed, husky, commitlint)? [y/N] y
Which package manager? ('skip' for non-Node projects: git init only, no husky/commitlint)
  > bun
    npm
    pnpm
    skip
```

> **Why bun?** The toy is a TypeScript library and our acceptance criteria run
> `bun test` / `bun run typecheck`. Choosing **bun** wires husky so each commit
> is checked. (If you pick **skip**, you get `git init` only — fine for non-Node
> projects, but then you'd need to set up a test runner yourself.)

After it finishes you'll have:

```
roman-toy/
├── diablo.config.json
├── .git/
├── .husky/
├── node_modules/
├── package.json
└── ... (skill setup artifacts)
```

Take a look at the config it wrote:

```bash
cat diablo.config.json
```

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

See the [Configure section of the README](../README.md#configure) for what every
field means.

---

## Step 3 — Turn on the approval gate (so you can watch each stage)

By default `gate` is `"none"` — diablo runs fully autonomous (AFK) and won't
pause. For this tutorial we want to **see** each stage as it passes, so switch
the gate to `"approval"`:

```bash
# Edit diablo.config.json and change "gate": "none" to "gate": "approval"
```

Open `diablo.config.json` in your editor and change that one line:

```jsonc
  "gate": "approval",
```

Now, after each stage's work is committed **and** passes verification, diablo
will pause and ask:

```
━━━ approval gate ━━━
  step:   verifier (roman-converter/stage-1)
  commit: a1b2c3d4e5

<the verifier's summary of what passed>

Proceed? [y/N]
```

Answer `y` to continue to the next stage, or anything else (including a bare
Enter) to halt cleanly — your committed work stays on the branch. The worker and
design steps are never gated; you only ever approve work that has already passed
verification.

> Want the hands-off experience instead? Leave `gate` as `"none"` and diablo
> runs start to finish without stopping.

---

## Step 4 — Drop in the toy ticket

diablo reads run tickets from `.scratch/<issue>/` — one or more `.md` files in a
directory named after the issue. We'll name our issue `roman-converter`.

Copy the toy requirement into place:

```bash
mkdir -p .scratch/roman-converter
cp "$DIABLO_SRC/TOYPROJECT.md" .scratch/roman-converter/01-roman.md
```

Confirm it landed:

```bash
ls .scratch/roman-converter/
# → 01-roman.md
```

> **What makes a valid ticket?** Any markdown with a clear "What to build" and a
> checklist of "Acceptance criteria" — the planner reads these to break the work
> into TDD stages. `TOYPROJECT.md` is already written in this shape.

---

## Step 5 — Run it

```bash
diablo run roman-converter
```

Here's what unfolds, and what you'll see in the terminal:

1. **Worktree created.** diablo cuts an isolated git worktree at
   `.worktrees/roman-converter/` on a new branch `diablo/roman-converter`
   (from `main`). All agent work happens there — your main checkout stays clean.

2. **Planning (planner tier, opus).** The planner reads your ticket and writes a
   **frozen** master plan to
   `.worktrees/roman-converter/.plans/roman-converter-plan.md`, breaking the work
   into sequenced stages and `T-00X` tasks. This plan is never edited again — it's
   the contract the rest of the run executes against.

3. **Each stage runs `design → worker → verifier`:**
   - **design** (planner-med) reads the code committed so far and writes a short
     design note naming the functions/types/signatures for this stage.
   - **worker** (sonnet) implements the stage TDD-style — tests first, then code —
     and commits the result.
   - **verifier** (sonnet) runs the typecheck and full test suite, then returns
     `VERDICT: PASS` or `VERDICT: FAIL`.

4. **Retry on failure.** If the verifier returns `FAIL [implementation]`, diablo
   re-runs the worker with the feedback injected, up to `retry.limit` (2) times.
   A `FAIL [plan]` halts to you instead — the plan is a hard contract and diablo
   never auto-replans.

5. **Approval gate (because we set it).** After each stage passes verification,
   diablo pauses for your `y/N`. Approve to proceed.

6. **Final verification.** A last whole-feature verification (planner tier) runs
   the gates one more time across everything.

You can watch progress live in a second terminal:

```bash
# from inside ~/playground/roman-toy
cat .worktrees/roman-converter/.plans/roman-converter-progress.md
```

This tracker updates every event with per-stage status
(TODO/IN_PROGRESS/DONE/HALTED), commit SHAs, verdicts, retries, and each stage's
handoff note.

---

## Step 6 — Inspect the result

When the run completes you'll see:

```
✅ issue roman-converter complete — final commit <sha>

📦 work is on diablo/roman-converter. To integrate:
   git merge --no-ff diablo/roman-converter
```

Because `autoMerge` is `false` (the default), diablo does **not** merge for you —
it leaves the work on its branch and prints the exact command. A passing verdict
isn't the same as "I want this in main"; you stay the gatekeeper.

Look at what it built:

```bash
# the implementation + tests live on the work branch / worktree
ls .worktrees/roman-converter/src/
cat .worktrees/roman-converter/src/roman.ts

# see the commits the run produced
git -C .worktrees/roman-converter log --oneline main..diablo/roman-converter

# run the tests yourself to confirm
cd .worktrees/roman-converter
bun test
bun run typecheck
cd -
```

---

## Step 7 — Integrate (or throw it away)

If you're happy with it, merge the branch:

```bash
git merge --no-ff diablo/roman-converter
```

If you just wanted to see diablo work and want to discard everything:

```bash
# remove the worktree and its branch
git worktree remove .worktrees/roman-converter --force
git branch -D diablo/roman-converter
```

Or simply delete the whole toy directory:

```bash
cd ~
rm -rf ~/playground/roman-toy
```

---

## Variations to try next

Once the basic run works, experiment:

| Try this                      | How                                                          | What changes                                                          |
| ----------------------------- | ------------------------------------------------------------ | --------------------------------------------------------------------- |
| **Fully autonomous**          | set `"gate": "none"` in `diablo.config.json`                 | no pauses — diablo runs start to finish                               |
| **Auto-merge on pass**        | set `"integration.autoMerge": true`                          | a clean run merges into `main` automatically                          |
| **Cheaper/faster run**        | `diablo run roman-converter --worker-model claude-haiku-4.5` | a CLI flag overrides the config for one run                           |
| **Requirements from scratch** | `diablo intake roman-converter`                              | interactive grilling → PRD → issues, instead of hand-writing a ticket |
| **Refactor flow**             | `diablo refactor <area>`                                     | same pipeline, but the planner produces a refactor plan               |

---

## Troubleshooting

| Symptom                               | Likely cause                         | Fix                                                                   |
| ------------------------------------- | ------------------------------------ | --------------------------------------------------------------------- |
| First agent step fails immediately    | Pi not configured (provider/auth)    | run `pi --version` and set up Pi first                                |
| `exit code 127` on commit             | bun not on PATH for the husky hook   | `export PATH="$HOME/.bun/bin:$PATH"` before running                   |
| `Vendored skills directory not found` | diablo invoked by a broken path      | use the absolute path to `src/cli/main.ts` from step 0                |
| Plan file not written                 | planner step didn't produce the plan | check the ticket has clear "What to build" + acceptance criteria      |
| Run halted at a gate                  | you (or a bare Enter) declined       | re-run `diablo run roman-converter` — it resumes from the frozen plan |
| Run halted on `FAIL [plan]`           | the frozen plan can't be satisfied   | read the verifier feedback; fix the ticket and start fresh            |

> **Resuming:** `diablo run` is resume-aware. If a run halts, just run it again —
> an existing frozen plan and worktree are reused, so it picks up where it left
> off rather than re-planning.
