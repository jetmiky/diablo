import { describe, expect, test } from "bun:test";
import {
  parseAcceptanceCriteria,
  markAllCriteriaChecked,
  parseCriteriaChecklist,
  type AcceptanceCriterion,
} from "../src/domain/acceptance.ts";

describe("parseAcceptanceCriteria", () => {
  test("parses unchecked criteria from the Acceptance criteria section", () => {
    const markdown = `
## Acceptance criteria

- [ ] first criterion
- [ ] second criterion
`;
    const result = parseAcceptanceCriteria(markdown);
    expect(result).toEqual([
      { text: "first criterion", checked: false },
      { text: "second criterion", checked: false },
    ]);
  });

  test("parses mixed checked and unchecked criteria", () => {
    const markdown = `
## Acceptance criteria

- [x] first done
- [ ] second todo
- [X] third done (uppercase)
`;
    const result = parseAcceptanceCriteria(markdown);
    expect(result).toEqual([
      { text: "first done", checked: true },
      { text: "second todo", checked: false },
      { text: "third done (uppercase)", checked: true },
    ]);
  });

  test("returns empty array when section is absent", () => {
    const markdown = `
## Description

Some issue description here.

## Tasks

- Do something
`;
    expect(parseAcceptanceCriteria(markdown)).toEqual([]);
  });

  test("returns empty array for empty markdown", () => {
    expect(parseAcceptanceCriteria("")).toEqual([]);
  });

  test("stops parsing at the next heading", () => {
    const markdown = `
## Acceptance criteria

- [ ] first criterion
- [ ] second criterion

## Next Section

- [ ] this should not be included
`;
    const result = parseAcceptanceCriteria(markdown);
    expect(result).toEqual([
      { text: "first criterion", checked: false },
      { text: "second criterion", checked: false },
    ]);
  });

  test("ignores non-list lines within the section", () => {
    const markdown = `
## Acceptance criteria

Some explanatory text here.

- [ ] first criterion

More text between items.

- [ ] second criterion
`;
    const result = parseAcceptanceCriteria(markdown);
    expect(result).toEqual([
      { text: "first criterion", checked: false },
      { text: "second criterion", checked: false },
    ]);
  });

  test("matches heading case-insensitively", () => {
    const markdown = `
## ACCEPTANCE CRITERIA

- [ ] uppercase heading
`;
    expect(parseAcceptanceCriteria(markdown)).toEqual([
      { text: "uppercase heading", checked: false },
    ]);
  });

  test("tolerates different heading levels", () => {
    const markdown = `
### Acceptance Criteria

- [ ] with three hashes
`;
    expect(parseAcceptanceCriteria(markdown)).toEqual([
      { text: "with three hashes", checked: false },
    ]);
  });
});

describe("markAllCriteriaChecked", () => {
  test("flips all unchecked criteria to checked", () => {
    const markdown = `
## Acceptance criteria

- [ ] first criterion
- [ ] second criterion
`;
    const result = markAllCriteriaChecked(markdown);
    expect(result).toBe(`
## Acceptance criteria

- [x] first criterion
- [x] second criterion
`);
  });

  test("is idempotent (already-checked items stay checked)", () => {
    const markdown = `
## Acceptance criteria

- [x] first criterion
- [x] second criterion
`;
    const result = markAllCriteriaChecked(markdown);
    expect(result).toBe(markdown);
  });

  test("leaves other sections untouched", () => {
    const markdown = `
## Description

- [ ] This is not a criterion

## Acceptance criteria

- [ ] real criterion

## Next Section

- [ ] Also not a criterion
`;
    const expected = `
## Description

- [ ] This is not a criterion

## Acceptance criteria

- [x] real criterion

## Next Section

- [ ] Also not a criterion
`;
    expect(markAllCriteriaChecked(markdown)).toBe(expected);
  });

  test("handles markdown with no acceptance criteria section", () => {
    const markdown = `
## Description

No criteria here.
`;
    expect(markAllCriteriaChecked(markdown)).toBe(markdown);
  });

  test("handles empty markdown", () => {
    expect(markAllCriteriaChecked("")).toBe("");
  });
});

describe("parseCriteriaChecklist", () => {
  test("parses a clean checklist from agent text", () => {
    const text = `
- [x] first criterion met
- [ ] second criterion not met
- [x] third criterion met
`;
    const result = parseCriteriaChecklist(text);
    expect(result).toEqual([
      { text: "first criterion met", checked: true },
      { text: "second criterion not met", checked: false },
      { text: "third criterion met", checked: true },
    ]);
  });

  test("parses checklist after CRITERIA: marker", () => {
    const text = `
Some analysis here.

CRITERIA:

- [x] first criterion — passed all tests
- [ ] second criterion — test failing
`;
    const result = parseCriteriaChecklist(text);
    expect(result).toEqual([
      { text: "first criterion — passed all tests", checked: true },
      { text: "second criterion — test failing", checked: false },
    ]);
  });

  test("tolerates surrounding prose", () => {
    const text = `
Let me verify the criteria:

- [x] criterion one
- [ ] criterion two

Looks like we're missing criterion two.
`;
    const result = parseCriteriaChecklist(text);
    expect(result).toEqual([
      { text: "criterion one", checked: true },
      { text: "criterion two", checked: false },
    ]);
  });

  test("returns empty array when no checklist present", () => {
    const text = "Just some prose with no checkboxes.";
    expect(parseCriteriaChecklist(text)).toEqual([]);
  });
});
