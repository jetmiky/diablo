/**
 * NodeDir is the live DirPort binding over node:fs. It lists a directory's
 * entry names synchronously, returning null when the path is not a readable
 * directory — whether absent or a file — so callers get the single "nothing to
 * enumerate" signal the issue-discovery helpers expect. Synchronous to match
 * the CLI's synchronous discovery path; validated by the CLI, not unit tests.
 */
import { readdirSync, statSync } from "node:fs";
import type { DirPort } from "../ports/dir.ts";

export class NodeDir implements DirPort {
  listDir(path: string): string[] | null {
    try {
      if (!statSync(path).isDirectory()) return null;
    } catch {
      return null; // absent path
    }
    return readdirSync(path);
  }
}
