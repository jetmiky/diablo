/**
 * Resolves the Pi binary diablo spawns for every agent step.
 *
 * diablo is published to npm and run by users who installed Pi however they
 * like — npm, bun, or pnpm — each of which puts the `pi` binary in a DIFFERENT
 * global bin directory. Hardcoding one manager's path (e.g. ~/.bun/bin/pi) only
 * works for that manager and silently breaks everyone else.
 *
 * The rule, in precedence order:
 *   1. $DIABLO_PI_BIN — an explicit absolute path, the escape hatch for a Pi
 *      that is installed somewhere not on PATH (or for pinning a specific build).
 *   2. the bare name "pi" — passed to node:child_process spawn WITHOUT a shell,
 *      Node resolves a slash-less command against $PATH (execvp semantics), so
 *      any global install on the user's PATH resolves regardless of manager.
 *
 * Pure: the environment is injected, so the rule is unit-tested without touching
 * the real process env.
 */
export interface PiBinaryEnv {
  DIABLO_PI_BIN?: string;
  /** Index signature so node's ProcessEnv ({ [k]: string | undefined }) is assignable. */
  [key: string]: string | undefined;
}

export function resolvePiBinary(env: PiBinaryEnv): string {
  const override = env.DIABLO_PI_BIN?.trim();
  return override ? override : "pi";
}
