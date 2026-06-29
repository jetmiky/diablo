import { describe, expect, test } from "bun:test";
import {
  readStatus,
  writeStatus,
  type IssueStatusStoreDeps,
} from "../src/app/issue-status-store.ts";
import { DEFAULT_STATUS } from "../src/domain/issue-status.ts";
import type { FsPort } from "../src/ports/fs.ts";

// In-memory fs seeded with optional initial files.
class FakeFs implements FsPort {
  files = new Map<string, string>();
  constructor(initial: Record<string, string> = {}) {
    for (const [k, v] of Object.entries(initial)) this.files.set(k, v);
  }
  read(path: string): Promise<string> {
    const v = this.files.get(path);
    if (v === undefined) return Promise.reject(new Error(`ENOENT: ${path}`));
    return Promise.resolve(v);
  }
  write(path: string, content: string): Promise<void> {
    this.files.set(path, content);
    return Promise.resolve();
  }
  exists(path: string): Promise<boolean> {
    return Promise.resolve(this.files.has(path));
  }
}

function deps(fs: FsPort): IssueStatusStoreDeps {
  return { fs };
}

describe("issue-status-store", () => {
  test("writeStatus then readStatus round-trips the status", async () => {
    const fs = new FakeFs();
    const d = deps(fs);
    const opts = { diabloDir: "/proj/.diablo", issue: "billing-02" };

    await writeStatus(d, { ...opts, status: "planned" });
    const status = await readStatus(d, opts);

    expect(status).toBe("planned");
  });

  test("writeStatus creates a JSON file with status and updatedAt", async () => {
    const fs = new FakeFs();
    const d = deps(fs);

    await writeStatus(d, {
      diabloDir: "/proj/.diablo",
      issue: "billing-02",
      status: "in-progress",
    });

    const content = fs.files.get("/proj/.diablo/billing-02/state.json");
    expect(content).toBeDefined();
    const json = JSON.parse(content!);
    expect(json.status).toBe("in-progress");
    expect(json.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/); // ISO format
  });

  test("readStatus returns DEFAULT_STATUS when the file does not exist", async () => {
    const fs = new FakeFs(); // empty, no state.json
    const d = deps(fs);

    const status = await readStatus(d, {
      diabloDir: "/proj/.diablo",
      issue: "billing-02",
    });

    expect(status).toBe(DEFAULT_STATUS); // "open"
  });

  test("readStatus falls back to DEFAULT_STATUS on malformed JSON", async () => {
    const fs = new FakeFs({
      "/proj/.diablo/billing-02/state.json": "{ not json",
    });
    const d = deps(fs);

    const status = await readStatus(d, {
      diabloDir: "/proj/.diablo",
      issue: "billing-02",
    });

    expect(status).toBe(DEFAULT_STATUS);
  });

  test("readStatus falls back to DEFAULT_STATUS on unknown status value", async () => {
    const fs = new FakeFs({
      "/proj/.diablo/billing-02/state.json": JSON.stringify({
        status: "bogus-status",
        updatedAt: "2026-06-29T00:00:00.000Z",
      }),
    });
    const d = deps(fs);

    const status = await readStatus(d, {
      diabloDir: "/proj/.diablo",
      issue: "billing-02",
    });

    expect(status).toBe(DEFAULT_STATUS);
  });

  test("readStatus constructs the path as <diabloDir>/<issue>/state.json", async () => {
    const fs = new FakeFs({
      "/custom/.diablo/auth-15/state.json": JSON.stringify({
        status: "done",
        updatedAt: "2026-06-29T00:00:00.000Z",
      }),
    });
    const d = deps(fs);

    const status = await readStatus(d, {
      diabloDir: "/custom/.diablo",
      issue: "auth-15",
    });

    expect(status).toBe("done");
  });

  test("writeStatus overwrites an existing state file", async () => {
    const fs = new FakeFs({
      "/proj/.diablo/billing-02/state.json": JSON.stringify({
        status: "open",
        updatedAt: "2026-01-01T00:00:00.000Z",
      }),
    });
    const d = deps(fs);

    await writeStatus(d, {
      diabloDir: "/proj/.diablo",
      issue: "billing-02",
      status: "done",
    });

    const status = await readStatus(d, {
      diabloDir: "/proj/.diablo",
      issue: "billing-02",
    });
    expect(status).toBe("done");
  });
});
