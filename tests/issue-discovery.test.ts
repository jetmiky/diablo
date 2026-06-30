import { describe, expect, test } from "bun:test";
import {
  resolveTicketPaths,
  discoverIssues,
  firstTicketPath,
} from "../src/app/issue-discovery.ts";
import type { DirPort } from "../src/ports/dir.ts";

// In-memory DirPort: maps a directory path to its entry names. Any path not in
// the map returns null (not a readable directory) — matching the live adapter's
// absent-or-file case.
class FakeDir implements DirPort {
  constructor(private readonly dirs: Record<string, string[]> = {}) {}
  listDir(path: string): string[] | null {
    return this.dirs[path] ?? null;
  }
}

describe("resolveTicketPaths", () => {
  test("a directory expands to its sorted .md files as full paths", () => {
    const dir = new FakeDir({
      "/repo/.scratch/money": ["02-b.md", "01-a.md", "notes.txt", "03-c.md"],
    });
    expect(resolveTicketPaths(dir, "/repo/.scratch/money")).toEqual([
      "/repo/.scratch/money/01-a.md",
      "/repo/.scratch/money/02-b.md",
      "/repo/.scratch/money/03-c.md",
    ]);
  });

  test("a non-directory (file or absent) returns the location itself", () => {
    const dir = new FakeDir(); // everything is null
    expect(resolveTicketPaths(dir, "/repo/.scratch/solo.md")).toEqual([
      "/repo/.scratch/solo.md",
    ]);
  });

  test("a directory with no .md files returns an empty list", () => {
    const dir = new FakeDir({ "/repo/.scratch/empty": ["README.txt", "data.json"] });
    expect(resolveTicketPaths(dir, "/repo/.scratch/empty")).toEqual([]);
  });
});

describe("discoverIssues", () => {
  test("lists .scratch entries, strips trailing .md, sorts, drops dotfiles", () => {
    const dir = new FakeDir({
      "/repo/.scratch": ["money", "greet.md", ".gitkeep", "auth"],
    });
    expect(discoverIssues(dir, "/repo")).toEqual(["auth", "greet", "money"]);
  });

  test("absent .scratch returns an empty list", () => {
    const dir = new FakeDir(); // .scratch is null
    expect(discoverIssues(dir, "/repo")).toEqual([]);
  });
});

describe("firstTicketPath", () => {
  test("returns the first ticket file when the issue dir has .md files", () => {
    const dir = new FakeDir({
      "/repo/.scratch/money": ["02-b.md", "01-a.md"],
    });
    expect(firstTicketPath(dir, "/repo", "money")).toBe(
      "/repo/.scratch/money/01-a.md",
    );
  });

  test("falls back to the issue dir path when there are no ticket files", () => {
    const dir = new FakeDir({ "/repo/.scratch/money": [] });
    expect(firstTicketPath(dir, "/repo", "money")).toBe("/repo/.scratch/money");
  });

  test("falls back to the issue dir path when the dir is absent", () => {
    const dir = new FakeDir();
    expect(firstTicketPath(dir, "/repo", "money")).toBe("/repo/.scratch/money");
  });
});
