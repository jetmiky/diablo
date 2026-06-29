/**
 * Parses the frozen master-plan markdown (produced by the master-plan skill)
 * into structured stages and tasks. This is the contract between the skill's
 * output format and diablo's engine, so it is strict: a malformed plan throws
 * rather than silently producing an empty pipeline.
 *
 * Pure (no I/O) so it is unit-tested directly against the skill's exact format:
 *
 *   ### Stage N - Title
 *   [T-00X] - Task title
 *   - Objective: ...
 *   - Target Files: a.ts, b.ts
 *   - Dependency: T-001 , T-002   (or None)
 *   - Acceptance Criterias:
 *     - Criterion 1
 *     - Criterion 2
 */

export interface PlanTask {
  id: string;
  title: string;
  objective: string;
  targetFiles: string[];
  dependencies: string[];
  acceptanceCriteria: string[];
}

export interface PlanStage {
  number: number;
  title: string;
  tasks: PlanTask[];
}

export interface Plan {
  stages: PlanStage[];
}

/**
 * Thrown when the frozen plan markdown does not match the master-plan skill's
 * contract. Carries a `diagnostic` — a specific, actionable description of what
 * was expected and not found — so the run can (a) halt with a message a human
 * can act on, and (b) re-ask the planner with the exact complaint injected,
 * rather than crashing with a generic error after the priciest step has run.
 */
export class PlanParseError extends Error {
  constructor(readonly diagnostic: string) {
    super(diagnostic);
    this.name = "PlanParseError";
  }
}

const FORMAT_HINT =
  `Expected the master-plan format: one or more '### Stage N - Title' headings, ` +
  `each followed by one or more '[T-00X] - Task title' tasks with '- Objective:', ` +
  `'- Target Files:', '- Dependency:', and '- Acceptance Criterias:' fields.`;

const STAGE_RE = /^#{2,4}\s+Stage\s+(\d+)\s*[-:–—]\s*(.+?)\s*$/;
const TASK_RE = /^\[(T-\d+)\]\s*-\s*(.+?)\s*$/;
const FIELD_RE = /^-\s*(Objective|Target Files|Dependency|Acceptance Criterias)\s*:\s*(.*)$/;
const BULLET_RE = /^\s*-\s+(.*\S)\s*$/;

export function parsePlan(markdown: string): Plan {
  const lines = markdown.split("\n");
  const stages: PlanStage[] = [];

  let stage: PlanStage | undefined;
  let task: PlanTask | undefined;
  let collectingCriteria = false;

  const finishTask = () => {
    if (task && stage) stage.tasks.push(task);
    task = undefined;
    collectingCriteria = false;
  };

  for (const raw of lines) {
    const stageMatch = STAGE_RE.exec(raw);
    if (stageMatch) {
      finishTask();
      stage = { number: Number(stageMatch[1]), title: stageMatch[2]!, tasks: [] };
      stages.push(stage);
      continue;
    }

    const taskMatch = TASK_RE.exec(raw);
    if (taskMatch) {
      finishTask();
      task = {
        id: taskMatch[1]!,
        title: taskMatch[2]!,
        objective: "",
        targetFiles: [],
        dependencies: [],
        acceptanceCriteria: [],
      };
      continue;
    }

    if (!task) continue;

    const fieldMatch = FIELD_RE.exec(raw);
    if (fieldMatch) {
      const [, label, value] = fieldMatch;
      collectingCriteria = false;
      switch (label) {
        case "Objective":
          task.objective = value!.trim();
          break;
        case "Target Files":
          task.targetFiles = splitList(value!);
          break;
        case "Dependency":
          task.dependencies = parseDependencies(value!);
          break;
        case "Acceptance Criterias":
          collectingCriteria = true;
          break;
      }
      continue;
    }

    if (collectingCriteria) {
      const bullet = BULLET_RE.exec(raw);
      if (bullet) task.acceptanceCriteria.push(bullet[1]!);
    }
  }
  finishTask();

  if (stages.length === 0) {
    throw new PlanParseError(
      `Plan has no stages (expected '### Stage N - Title' headings). ${FORMAT_HINT}`,
    );
  }
  for (const s of stages) {
    if (s.tasks.length === 0) {
      throw new PlanParseError(
        `Plan stage ${s.number} (${s.title}) has no tasks ` +
          `(expected one or more '[T-00X] - Task title' lines under the stage heading). ${FORMAT_HINT}`,
      );
    }
  }

  return { stages };
}

/** Splits a comma-separated value into trimmed, non-empty parts. */
function splitList(value: string): string[] {
  return value
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

/** Parses a Dependency value; "None" (any case) yields an empty list. */
function parseDependencies(value: string): string[] {
  if (value.trim().toLowerCase() === "none") return [];
  return splitList(value);
}
