---
name: master-plan
description: Break issues into a frozen staged plan with sequenced T-00X tasks plus a live progress tracker. Use before implementing a multi-stage feature or refactor.
disable-model-invocation: true
---

# Master Plan

Turn one or more issues into two files: a **frozen** plan (the spec, never edited) and a **live** progress tracker (the log, updated every task). The plan is read by a fresh worker agent each stage, so write it **dense** — strip cosmetic words; keep only what changes behavior.

Both files live under `.plans/` named for the feature: `.plans/<feature>-plan.md` and `.plans/<feature>-progress.md`.

## 1. Gather context

Read every named issue in full. Then explore the codebase for the seams and files each issue touches. Read `CONTEXT.md` (if present) so task titles and acceptance criteria use the project's domain vocabulary, and respect ADRs in the area you touch.

Done when: you can name, for each issue, the files it changes and the order constraints between the work.

## 2. Write the frozen plan

Break the work into **stages** — each stage a coherent, verifiable slice that builds on the last. Inside each stage, sequence the tasks.

Each **stage** is one `## Stage N - Title` heading. Use this exact heading format — `##`, the word `Stage`, the number, a hyphen, then the title:

```
## Stage 1 - Scaffold and config
```

Each task under a stage is one `[T-00X]` block in this exact format:

```
[T-00X] - [Task title]
- Objective:
- Target Files: src/files.ts
- Dependency: T-00X , T-00X
- Acceptance Criterias:
  - Criteria 1
  - Criteria 2
```

Rules:

- Stage headings: `## Stage N - Title` exactly — H2, `Stage`, number, ` - ` (hyphen, not colon), title. Number stages 1, 2, 3, … in order.
- Number tasks T-001, T-002, … continuously across all stages.
- `Dependency` lists earlier T-00X this task needs, or `None`.
- Acceptance criteria are observable outcomes, not implementation steps.
- Dense prose: no preamble, no restated objectives, no filler. A worker reads this every stage — every wasted word is wasted context.
- No file paths invented for files you have not confirmed exist or will be created.
- The LAST stage is the verification gate: title it `## Stage N - Verification`. It only checks already-built work (typecheck, tests, integration) — it writes no new production code, so it is run as a read-only verification step.

Save to `.plans/<feature>-plan.md`. Tell the user this file is **frozen** — it is not edited again unless the plan itself materially changes.

Done when: every task has all five fields, dependencies form a valid order, and the stages cover the full scope of the issues.

## 3. Seed the live progress tracker

Write **only the format skeleton** to `.plans/<feature>-progress.md` — the structure, not filled-in status. Status is updated later, during implementation.

```
# <Feature> - Progress:

## Stage 1 - [Stage Title]
T-00X:
- Status: TODO | DONE | IN_PROGRESS | DEFERRED
- Result: Done | Done with notes | Added/modify [function] in [file].
- Notes: [Optional]

## Pending Todos
[to be filled if any tasks has todo or special note for later stages or tasks]
```

Use the same `## Stage N - Title` heading here as in the plan, so the two files stay consistent.

Done when: the progress file exists with the skeleton and the feature title, and no task status is prematurely marked.
