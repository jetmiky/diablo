# AGENTS.md

Guidance for AI agents working in the diablo repo.

## Agent skills

### Issue tracker

Issues and PRDs live as local markdown under `.scratch/<feature-slug>/` (no remote tracker; GitHub Issues is not used for work tracking). This is the same `.scratch/` convention diablo itself reads run tickets from. See `docs/agents/issue-tracker.md`.

### Triage labels

Canonical five-role vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`), recorded as a `Status:` line in each issue file. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.
