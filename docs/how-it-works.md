# How Diablo Works

Diablo is a central conductor for Pi runs. It does not maintain a swarm, queue,
daemon, or message bus. A Diablo command dispatches a sequence of Pi invocations,
each with a specific role, skill set, worktree, and instruction.

The durable state is the repository: issue files, frozen plans, worktree files,
commits, progress artifacts, and small runtime state under `.diablo/`.

## The short version

1. A feature exists as local markdown under `.scratch/<issue>/`.
2. Diablo creates an isolated worktree at `.worktrees/<issue>/` and a branch such
   as `diablo/<issue>`.
3. The Architect produces a staged plan, either automatically during `diablo run`
   or interactively through `diablo plan`.
4. Each implementation stage runs:
   - Planner: code-level design for this stage;
   - Worker: implementation and commit;
   - Verifier: review and verdict.
5. `VERDICT: FAIL [implementation]` can retry the Worker with verifier feedback.
6. `VERDICT: FAIL [plan]` halts to a human. Diablo does not silently rewrite a
   frozen plan.
7. Final verification checks the whole feature and the acceptance criteria.
8. The branch is left for you to inspect and merge, unless `autoMerge` is enabled.

## Why worktrees and commits?

Diablo treats git as the event store.

Work does not pass from actor to actor through hidden chat history. It passes
through files and commits:

- the Architect writes a plan artifact;
- the Planner writes stage design guidance;
- the Worker changes files and commits;
- the Verifier reads the committed state and returns a verdict;
- progress and handoff notes are recorded as artifacts.

That makes a run inspectable, resumable, and debuggable. If a run halts, the
worktree and branch remain. Re-running `diablo run <issue>` can continue from the
existing state instead of starting from a blank slate.

## The four Pi actors

Each actor is a separate Pi invocation. The actor name describes responsibility,
not a persistent process.

| Actor | When it runs | Responsibility |
| --- | --- | --- |
| **Architect** | Planning and refactor planning | Reads the ticket/spec and writes a frozen staged plan. In `diablo plan`, it stays interactive until you type `approve` or `abort`. |
| **Planner** | Before each Worker stage; final verification | Designs the next slice against the code that actually exists after previous commits. For final verification, it judges the whole feature. |
| **Worker** | During each implementation stage | Implements the stage, normally using the vendored TDD skill, and commits the result. |
| **Verifier** | After each Worker stage | Reviews the stage, combines model judgment with measured checks when configured, and emits `VERDICT: PASS` or `VERDICT: FAIL`. |

The split is deliberate:

- the Architect owns the feature-level plan;
- the Planner owns near-term code design;
- the Worker owns changes;
- the Verifier owns the stage judgment.

## The main flows

### `diablo run <issue>`

Use this when the issue is already clear enough to build.

If the issue has no approved plan, `run` auto-plans non-interactively and then
executes. If a frozen plan already exists, `run` executes that plan. If a draft
plan exists but was never approved, `run` refuses to proceed; the expensive build
will not start from a half-negotiated plan.

### `diablo plan <issue>`

Use this when design choices matter before spending on implementation.

The Architect proposes a staged plan, summarizes assumptions and risks, and then
waits. You can challenge the plan in plain language. The Architect should defend
or revise, not reflexively agree. Typing `approve` freezes the plan; typing
`abort` exits without freezing.

### `diablo intake <feature>`

Use this when you have a rough idea, not an issue.

The intake flow is intentionally interactive:

1. Socratic grilling gathers requirements.
2. Optional domain/state-machine modeling sharpens stateful features.
3. A PRD is written.
4. You approve or reject the PRD.
5. Approved PRDs are decomposed into issue files under `.scratch/<feature>/`.

### `diablo refactor <area>`

Refactor uses the same engine as `run`, but swaps the planning skill. The
planner creates a refactor plan for the target area, then the normal staged
pipeline executes it.

## Gates

Diablo has several different gates. They are intentionally not the same thing.

| Gate | Where it happens | What it protects |
| --- | --- | --- |
| **Intake approval** | `diablo intake` | Prevents issue generation from an unapproved PRD. |
| **Plan approval** | `diablo plan` | Prevents a costly run from starting on an unapproved plan. |
| **Stage approval** | `gate: "approval"` during `run`/`refactor` | Pauses after a verified stage before continuing. |
| **Done gate** | Final verification | Marks an issue done only when acceptance criteria are proven. |

With the default `gate: "none"`, `run` is AFK-friendly after it starts. The
Verifier and deterministic checks are the automated checkpoint. Set
`gate: "approval"` when you want a human checkpoint after each verified stage.

## Verification and retries

A verifier returns one of the meaningful outcomes:

- `VERDICT: PASS` — continue;
- `VERDICT: FAIL [implementation]` — the plan is still plausible, but the code is
  wrong or incomplete;
- `VERDICT: FAIL [plan]` — the frozen plan itself is wrong or insufficient.

Implementation failures can retry the Worker up to `retry.limit`. The failed
verifier output is injected into the retry so the Worker fixes the specific
problem.

Plan failures halt immediately. Diablo does not auto-replan because the frozen
plan is a human-visible contract.

If `verify.commands` is configured, Diablo also runs those commands itself in
the worktree after verifying steps. A non-zero command exit fails the stage even
if the model says `VERDICT: PASS`.

## Branch integration

Each run works on a branch named with `integration.branchPrefix` plus the issue
slug, for example:

```text
diablo/currency-convert
```

The branch is cut from `integration.targetBranch`.

After a final pass:

- `autoMerge: false` leaves the branch intact and prints the merge command;
- `autoMerge: true` merges it into the target branch when the merge is clean;
- merge conflicts are never auto-resolved.

Nothing is cleaned automatically. Use `diablo clean <issue>` after the work is
merged or intentionally discarded.

## Runtime artifacts

Common artifacts:

| Path | Purpose |
| --- | --- |
| `.scratch/<issue>/` | Human-readable local issue/spec files. |
| `.worktrees/<issue>/` | Isolated git worktree for the run. |
| `.worktrees/<issue>/.plans/` | Frozen plan and live progress files. |
| `.diablo/<issue>/state.json` | Gitignored lifecycle state used by Diablo. |
| `.diablo/<issue>/run.lock` | Per-issue lock preventing overlapping runs. |

The issue markdown keeps human triage labels. `.diablo/<issue>/state.json` keeps
Diablo's runtime lifecycle (`planned`, `in-progress`, `done`, `needs-human`, and
similar state). Keeping these separate prevents the engine from clobbering human
triage decisions.

## Progress surfaces

Diablo reports progress through:

- stdout;
- a live progress markdown file under the worktree's `.plans/` directory;
- optional Telegram push notifications configured by `diablo telegram setup`.

Telegram credentials are not stored in `diablo.config.json`. They live in the
gitignored `.diablo/telegram.json`, or can be supplied through environment
variables for CI/one-off runs.
