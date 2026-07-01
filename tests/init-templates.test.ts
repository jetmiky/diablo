import { describe, expect, test } from "bun:test";
import {
  buildAgentsMd,
  buildClaudeMd,
  buildContextMd,
  buildTriageLabelsMd,
  buildIssueTrackerMd,
  buildDomainMd,
  DEFAULT_TRIAGE_LABELS,
} from "../src/domain/init-templates.ts";

describe("buildAgentsMd", () => {
  test("references the .scratch/ convention", () => {
    expect(buildAgentsMd()).toContain(".scratch/");
  });

  test("references docs/agents/ convention files", () => {
    const md = buildAgentsMd();
    expect(md).toContain("docs/agents/issue-tracker.md");
    expect(md).toContain("docs/agents/triage-labels.md");
    expect(md).toContain("docs/agents/domain.md");
  });

  test("is valid markdown with a top-level heading", () => {
    expect(buildAgentsMd()).toMatch(/^# AGENTS\.md/);
  });
});

describe("buildClaudeMd", () => {
  test("addresses Claude Code", () => {
    expect(buildClaudeMd()).toContain("# CLAUDE.md");
    expect(buildClaudeMd()).toContain("Claude Code");
  });

  test("references the same convention files as AGENTS.md", () => {
    const claude = buildClaudeMd();
    expect(claude).toContain("docs/agents/issue-tracker.md");
    expect(claude).toContain("docs/agents/triage-labels.md");
    expect(claude).toContain("docs/agents/domain.md");
  });
});

describe("buildContextMd", () => {
  test("has a glossary section", () => {
    expect(buildContextMd()).toContain("## Glossary");
  });

  test("has a bounded context section", () => {
    expect(buildContextMd()).toContain("## Bounded context");
  });

  test("starts with a top-level heading", () => {
    expect(buildContextMd()).toMatch(/^# CONTEXT\.md/);
  });
});

describe("buildTriageLabelsMd", () => {
  test("uses default 5 labels when no args", () => {
    const md = buildTriageLabelsMd();
    for (const label of DEFAULT_TRIAGE_LABELS) {
      expect(md).toContain(`\`${label}\``);
    }
  });

  test("renders custom labels when provided", () => {
    const md = buildTriageLabelsMd(["ready", "done", "blocked"]);
    expect(md).toContain("`ready`");
    expect(md).toContain("`done`");
    expect(md).toContain("`blocked`");
    // Default labels should NOT appear
    expect(md).not.toContain("`needs-triage`");
    expect(md).not.toContain("`wontfix`");
  });

  test("renders a markdown table with Label and Meaning columns", () => {
    const md = buildTriageLabelsMd(["a", "b"]);
    expect(md).toContain("| Label | Meaning |");
    expect(md).toContain("| `a` | _TODO: fill in_ |");
    expect(md).toContain("| `b` | _TODO: fill in_ |");
  });

  test("empty custom labels array produces a table with no rows", () => {
    const md = buildTriageLabelsMd([]);
    expect(md).toContain("| Label | Meaning |");
    // Only the header row, no label rows
    const lines = md.split("\n");
    const tableRows = lines.filter((l) => l.startsWith("| `"));
    expect(tableRows).toHaveLength(0);
  });
});

describe("buildIssueTrackerMd", () => {
  test("documents the .scratch/ convention", () => {
    expect(buildIssueTrackerMd()).toContain(".scratch/");
  });

  test("documents the Status: line convention", () => {
    expect(buildIssueTrackerMd()).toContain("Status:");
  });

  test("documents the PRD convention", () => {
    expect(buildIssueTrackerMd()).toContain("PRD.md");
  });
});

describe("buildDomainMd", () => {
  test("single-context references CONTEXT.md at the repo root", () => {
    const md = buildDomainMd("single");
    expect(md).toContain("single-context");
    expect(md).toContain("CONTEXT.md");
    expect(md).toContain("docs/adr/");
  });

  test("multiple-context references docs/contexts/", () => {
    const md = buildDomainMd("multiple");
    expect(md).toContain("multiple contexts");
    expect(md).toContain("docs/contexts/");
    expect(md).toContain("docs/adr/");
  });

  test("both modes mention glossary vocabulary", () => {
    expect(buildDomainMd("single")).toContain("glossary");
    expect(buildDomainMd("multiple")).toContain("glossary");
  });
});
