/**
 * issue-discovery resolves the `.scratch/<issue>` convention into concrete
 * ticket paths and issue names. Lifted out of the CLI composition root so the
 * discovery rules — which entries count as issues, how a directory expands to
 * its ticket files — live behind the DirPort seam and are unit-tested against a
 * fake, rather than coupled to node:fs in main.ts and only reachable through a
 * real temp directory.
 *
 * Pure over the DirPort seam (no direct I/O): the caller injects the adapter.
 */
import type { DirPort } from "../ports/dir.ts";

/**
 * Resolves a ticket location into concrete file paths for @-injection. Pi's
 * @file reads files, not directories (a directory crashes it with EISDIR), so
 * a directory is expanded to the sorted .md files directly inside it. A
 * non-directory (a single .md ticket, or an absent path) returns the location
 * itself, so a missing path surfaces a clear ENOENT downstream.
 */
export function resolveTicketPaths(dir: DirPort, location: string): string[] {
  const entries = dir.listDir(location);
  if (entries === null) return [location];
  return entries
    .filter((name) => name.endsWith(".md"))
    .sort()
    .map((name) => `${location}/${name}`);
}

/**
 * Discovers the candidate issue targets under .scratch/ — the immediate entries
 * (a subdirectory of ticket files, or a single .md ticket). This is the same
 * `.scratch/<issue>` convention `run <issue>` resolves against, so the selector
 * offers exactly what `run`/`plan` can target. Returns sorted names with any
 * trailing .md stripped (so the selection round-trips back to a target), and
 * dotfiles dropped. An absent .scratch returns an empty list.
 */
export function discoverIssues(dir: DirPort, repoRoot: string): string[] {
  const entries = dir.listDir(`${repoRoot}/.scratch`);
  if (entries === null) return [];
  return entries
    .filter((name) => !name.startsWith("."))
    .map((name) => (name.endsWith(".md") ? name.slice(0, -3) : name))
    .sort();
}

/**
 * The first ticket file for an issue — the acceptance-criteria source the done
 * gate reads. Falls back to the issue directory path itself when there are no
 * ticket files (or the directory is absent), so the downstream read surfaces a
 * clear error rather than an undefined path.
 */
export function firstTicketPath(dir: DirPort, repoRoot: string, issue: string): string {
  const location = `${repoRoot}/.scratch/${issue}`;
  const paths = resolveTicketPaths(dir, location);
  return paths[0] ?? location;
}
