/**
 * intakeDiablo runs the INTAKE phase that sits in front of `diablo run`: it
 * turns a fuzzy idea into tracked issues for both greenfield and brownfield
 * projects. Unlike `run` (autonomous, AFK), intake REQUIRES a human — a Socratic
 * grill-with-docs dialogue — so it runs interactive Pi sessions, and the two are
 * kept cleanly separated (distinct commands, distinct use-cases).
 *
 * Flow: grill (adaptive to greenfield vs brownfield) → to-prd → human approval
 * checkpoint → to-issues. The human approves the PRD BEFORE it is decomposed; a
 * decline stops cleanly after to-prd with no issues written. The side-effecting
 * steps (interactive Pi sessions) are injected so this orchestration is
 * unit-tested against fakes; main.ts wires the real interactive sessions.
 */
import type { FsPort } from "../ports/fs.ts";
import type { PromptPort } from "../ports/prompt.ts";

/** Greenfield starts from an empty glossary; brownfield reads existing code + CONTEXT.md. */
export type IntakeMode = "greenfield" | "brownfield";

export interface GrillContext {
  feature: string;
  mode: IntakeMode;
  scratchDir: string;
}

export interface IntakeDeps {
  fs: FsPort;
  prompt: PromptPort;
  /** Runs the interactive grill-with-docs session (real: an interactive Pi session). */
  grill: (ctx: GrillContext) => Promise<void>;
  /** Runs to-prd to author a PRD from the gathered requirements. */
  toPrd: (ctx: GrillContext) => Promise<void>;
  /** Runs to-issues to decompose the approved PRD into tracked issues. */
  toIssues: (ctx: GrillContext) => Promise<void>;
}

export interface IntakeConfig {
  feature: string;
  repoRoot: string;
  /** Where resulting issues land (.scratch/<feature>/). */
  scratchDir: string;
}

export interface IntakeResult {
  scratchDir: string;
  /** True when the PRD was approved and decomposed into issues. */
  decomposed: boolean;
}

const PRD_APPROVAL_QUESTION =
  "Approve this PRD and decompose it into issues?";

export async function intakeDiablo(deps: IntakeDeps, config: IntakeConfig): Promise<IntakeResult> {
  const mode: IntakeMode = (await hasContext(deps.fs, config.repoRoot)) ? "brownfield" : "greenfield";
  const ctx: GrillContext = { feature: config.feature, mode, scratchDir: config.scratchDir };

  // 1. Interactive Socratic requirement gathering, adapted to the project kind.
  await deps.grill(ctx);

  // 2. Author the PRD from what the grill gathered.
  await deps.toPrd(ctx);

  // 3. Human approval checkpoint BEFORE decomposition — the PRD is the artifact
  //    the human signs off on; declining stops cleanly with no issues written.
  const approved = await deps.prompt.confirm(PRD_APPROVAL_QUESTION);
  if (!approved) {
    return { scratchDir: config.scratchDir, decomposed: false };
  }

  // 4. Decompose the approved PRD into tracked issues under .scratch/<feature>/.
  await deps.toIssues(ctx);
  return { scratchDir: config.scratchDir, decomposed: true };
}

/** Brownfield is signalled by a repo-root CONTEXT.md (the domain doc). */
async function hasContext(fs: FsPort, repoRoot: string): Promise<boolean> {
  return fs.exists(`${repoRoot}/CONTEXT.md`);
}
