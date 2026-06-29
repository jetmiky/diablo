/**
 * The intake phase (grill → state-machine → to-prd → to-issues) runs as a
 * sequence of INTERACTIVE Pi sessions. Unlike the autonomous `run` path — where
 * each role gets an ISOLATED session-id so the verifier never inherits the
 * worker's reasoning — intake's steps form ONE human-in-the-loop narrative that
 * builds on itself: to-issues is better for having seen the whole grill + PRD.
 *
 * So all four steps share a single, feature-scoped session-id. Pi resumes an
 * existing --session-id (creating it only if missing), so the second step
 * onward resumes the transcript from the first instead of re-reading artifacts
 * cold. Deliberately NOT stamped with a runId (unlike run): a stable id means a
 * re-run of `diablo intake <feature>` RESUMES the same session — exactly what
 * the CLI already promises the user when intake stops at the PRD gate.
 *
 * Pure (no I/O) so the argv shape and id rule are unit-tested directly; the
 * adapter spawns the interactive Pi process with these args.
 */

/** Derives the stable, feature-scoped session id shared by all intake steps. */
export function intakeSessionId(feature: string): string {
  return `diablo-intake-${feature}`;
}

export interface IntakeArgsSpec {
  /** The shared, feature-scoped session id (see intakeSessionId). */
  sessionId: string;
  /** Absolute path to the step's skill, injected as an @file reference. */
  skillPath: string;
  /** The prose instruction handed to Pi as the trailing message. */
  instruction: string;
  /**
   * Optional input artifacts (e.g. the state-machine markdown) injected as
   * @file references so the step can read them. The shared session already
   * carries the prior steps' transcript; artifacts remain the durable handoff.
   */
  inputs?: string[];
}

/**
 * Builds the `pi` argv for one INTERACTIVE intake step. The returned array is
 * passed straight to the process spawner (no shell), so values need no quoting.
 *
 * Crucially this carries `--session-id`, absent from the prior implementation —
 * that omission is why each step started cold. NOT headless: no `-p`, so Pi
 * stays interactive (inherited stdio) for the Socratic dialogue. The skill and
 * any input artifacts are injected as @file refs, mirroring the run path's
 * `buildPiArgs`.
 */
export function buildIntakeArgs(spec: IntakeArgsSpec): string[] {
  const args = ["--session-id", spec.sessionId, `@${spec.skillPath}`];
  for (const input of spec.inputs ?? []) args.push(`@${input}`);
  args.push(spec.instruction);
  return args;
}
