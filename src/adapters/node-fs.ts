/**
 * NodeFs is the live FsPort binding over node:fs/promises. Writes create parent
 * directories so callers can target nested paths (e.g. .plans/<feature>-plan.md)
 * without pre-creating dirs. Validated by the CLI path, not unit tests.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { FsPort } from "../ports/fs.ts";

export class NodeFs implements FsPort {
  read(path: string): Promise<string> {
    return readFile(path, "utf8");
  }

  async write(path: string, content: string): Promise<void> {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content, "utf8");
  }

  async exists(path: string): Promise<boolean> {
    try {
      await readFile(path);
      return true;
    } catch {
      return false;
    }
  }
}
