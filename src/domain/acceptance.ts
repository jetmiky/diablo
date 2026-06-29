/**
 * Parses acceptance criteria from issue markdown and verifier checklists.
 *
 * An issue's acceptance criteria live in its markdown as a checkbox list under
 * the "## Acceptance criteria" heading. A verifier step is instructed to emit
 * its per-criterion results as a similar checklist (optionally after a
 * "CRITERIA:" marker), citing evidence for each.
 *
 * Pure (no I/O) so it is unit-tested directly.
 */

export interface AcceptanceCriterion {
  text: string;
  checked: boolean;
}

const ACCEPTANCE_HEADING_RE = /^#{2,}\s+acceptance\s+criteria/i;
const CHECKBOX_RE = /^-\s+\[([ x])\]\s+(.+)$/i;

export function parseAcceptanceCriteria(markdown: string): AcceptanceCriterion[] {
  const lines = markdown.split("\n");
  const criteria: AcceptanceCriterion[] = [];
  
  let inSection = false;
  
  for (const line of lines) {
    const trimmed = line.trim();
    
    if (ACCEPTANCE_HEADING_RE.test(trimmed)) {
      inSection = true;
      continue;
    }
    
    if (inSection) {
      // Stop at next heading
      if (trimmed.startsWith("#")) {
        break;
      }
      
      // Parse checkbox
      const match = CHECKBOX_RE.exec(trimmed);
      if (match) {
        const checked = match[1]?.toLowerCase() === "x";
        const text = match[2]?.trim() ?? "";
        criteria.push({ text, checked });
      }
    }
  }
  
  return criteria;
}

export function markAllCriteriaChecked(markdown: string): string {
  const lines = markdown.split("\n");
  const result: string[] = [];
  let inSection = false;
  
  for (const line of lines) {
    const trimmed = line.trim();
    
    if (ACCEPTANCE_HEADING_RE.test(trimmed)) {
      inSection = true;
      result.push(line);
      continue;
    }
    
    if (inSection) {
      // Stop at next heading
      if (trimmed.startsWith("#")) {
        inSection = false;
        result.push(line);
        continue;
      }
      
      // Replace [ ] or [x] with [x] in checkbox lines
      const replaced = line.replace(/^(\s*-\s+)\[(\s*[x\s]?)\](\s+.*)$/i, "$1[x]$3");
      result.push(replaced);
    } else {
      result.push(line);
    }
  }
  
  return result.join("\n");
}

export function parseCriteriaChecklist(text: string): AcceptanceCriterion[] {
  const lines = text.split("\n");
  const criteria: AcceptanceCriterion[] = [];
  
  for (const line of lines) {
    const trimmed = line.trim();
    const match = CHECKBOX_RE.exec(trimmed);
    if (match) {
      const checked = match[1]?.toLowerCase() === "x";
      let text = match[2]?.trim() ?? "";
      criteria.push({ text, checked });
    }
  }
  
  return criteria;
}
