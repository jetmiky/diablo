/**
 * Pure template generators for `diablo init` scaffold files. Every function
 * returns a string — no I/O, no side effects, unit-tested directly.
 *
 * The generated content is intentionally minimal: a structural skeleton that
 * the project team fills in. Diablo never writes to these files after init.
 */

// ── Agent guidance docs ─────────────────────────────────────────────────────

/**
 * Builds AGENTS.md content. References the docs/agents/ convention files that
 * init also scaffolds, so the three-point structure (tracker, triage, domain)
 * is self-documenting.
 */
export function buildAgentsMd(): string {
  return `# AGENTS.md

Guidance for AI agents working in this repo.

## Agent skills

### Issue tracker

Issues and PRDs live as local markdown under \`.scratch/<feature-slug>/\` (no remote tracker). See \`docs/agents/issue-tracker.md\`.

### Triage labels

Triage state is recorded as a \`Status:\` line in each issue file. See \`docs/agents/triage-labels.md\` for the label vocabulary.

### Domain docs

See \`docs/agents/domain.md\` for how to consume this repo's domain documentation.
`;
}

/**
 * Builds CLAUDE.md content — same structure as AGENTS.md but addressed to
 * Claude Code. Identical convention references so there is no drift.
 */
export function buildClaudeMd(): string {
  return `# CLAUDE.md

Guidance for Claude Code working in this repo.

## Agent skills

### Issue tracker

Issues and PRDs live as local markdown under \`.scratch/<feature-slug>/\` (no remote tracker). See \`docs/agents/issue-tracker.md\`.

### Triage labels

Triage state is recorded as a \`Status:\` line in each issue file. See \`docs/agents/triage-labels.md\` for the label vocabulary.

### Domain docs

See \`docs/agents/domain.md\` for how to consume this repo's domain documentation.
`;
}

// ── Context docs ────────────────────────────────────────────────────────────

/**
 * Builds a single-context CONTEXT.md at the repo root. The project fills in
 * the glossary and bounded context after init.
 */
export function buildContextMd(): string {
  return `# CONTEXT.md

Domain documentation for this repo.

## Glossary

<!-- Define domain terms here. Use these terms consistently in code, tests, and docs. -->

## Bounded context

<!-- Describe the bounded context this repo operates in. -->
`;
}

// ── Triage labels ───────────────────────────────────────────────────────────

/** The canonical 5-label vocabulary diablo ships with. */
export const DEFAULT_TRIAGE_LABELS = [
  "needs-triage",
  "needs-info",
  "ready-for-agent",
  "ready-for-human",
  "wontfix",
] as const;

/**
 * Builds docs/agents/triage-labels.md. When no custom labels are passed,
 * uses the default 5-label vocabulary. Custom labels get a placeholder
 * description the team fills in.
 */
export function buildTriageLabelsMd(labels?: string[]): string {
  const effective = labels ?? [...DEFAULT_TRIAGE_LABELS];
  const rows = effective.map((label) => `| \`${label}\` | _TODO: fill in_ |`);
  return `# Triage Labels

The label vocabulary for this repo's issue tracker. Each issue file records its triage state as a \`Status:\` line (e.g. \`Status: ready-for-agent\`).

| Label | Meaning |
|-------|---------|
${rows.join("\n")}

Edit the right-hand column to match your team's conventions.
`;
}

// ── Issue tracker conventions ───────────────────────────────────────────────

/**
 * Builds docs/agents/issue-tracker.md describing the .scratch/ convention.
 */
export function buildIssueTrackerMd(): string {
  return `# Issue tracker: Local Markdown

Issues and PRDs for this repo live as markdown files in \`.scratch/\`.

## Conventions

- One feature per directory: \`.scratch/<feature-slug>/\`
- The PRD is \`.scratch/<feature-slug>/PRD.md\`
- Implementation issues are \`.scratch/<feature-slug>/issues/<NN>-<slug>.md\`, numbered from \`01\`
- Triage state is recorded as a \`Status:\` line near the top of each issue file (see \`triage-labels.md\` for the label strings)
- Comments and conversation history append to the bottom of the file under a \`## Comments\` heading

## When a skill says "publish to the issue tracker"

Create a new file under \`.scratch/<feature-slug>/\` (creating the directory if needed).

## When a skill says "fetch the relevant ticket"

Read the file at the referenced path. The user will normally pass the path or the issue number directly.
`;
}

// ── Domain conventions ──────────────────────────────────────────────────────

/**
 * Builds docs/agents/domain.md. Adapts to single vs multiple context layout.
 */
export function buildDomainMd(contextMode: "single" | "multiple"): string {
  if (contextMode === "multiple") {
    return `# Domain Docs

How AI agents should consume this repo's domain documentation when exploring the codebase.

This repo uses **multiple contexts**: each bounded context has its own context map. See \`docs/contexts/\` for per-context documentation.

## Before exploring, read these

- **\`docs/contexts/<your-area>/CONTEXT.md\`** — the context map for the area you're working in
- **\`docs/adr/\`** — read ADRs that touch the area you're about to work in

If any of these files don't exist, **proceed silently**. Don't flag their absence.

## Use the glossary's vocabulary

When your output names a domain concept, use the term as defined in the relevant CONTEXT.md. Don't drift to synonyms.
`;
  }

  return `# Domain Docs

How AI agents should consume this repo's domain documentation when exploring the codebase.

This repo is **single-context**: one \`CONTEXT.md\` + \`docs/adr/\` at the repo root.

## Before exploring, read these

- **\`CONTEXT.md\`** at the repo root
- **\`docs/adr/\`** — read ADRs that touch the area you're about to work in

If any of these files don't exist, **proceed silently**. Don't flag their absence.

## Use the glossary's vocabulary

When your output names a domain concept, use the term as defined in CONTEXT.md. Don't drift to synonyms.
`;
}
