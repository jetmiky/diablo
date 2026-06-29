# Feature 2 — Roman numeral arithmetic

Status: ready-for-agent

Builds on Feature 1: arithmetic that takes and returns Roman numerals, reusing
`toRoman`/`fromRoman` rather than reimplementing conversion. This ticket leaves
a few real design choices open (how to handle results that fall out of range,
what division should mean) — which is exactly why the [tutorial](README.md)
runs it through `diablo plan` first, to negotiate and freeze the approach before
the build.

## What to build

A module `src/roman-math.ts` exporting pure functions operating on Roman numeral
strings, reusing `src/roman.ts`:

- `add(a: string, b: string): string`
- `subtract(a: string, b: string): string`
- `multiply(a: string, b: string): string`

Each parses its Roman inputs, computes on integers, and returns a Roman numeral.

### Range and errors

- Inputs and results stay within Feature 1's `1`–`3999` range.
- Invalid Roman input must surface the same way Feature 1 handles it (do not
  swallow the error).
- A result outside `1`–`3999` (e.g. `subtract("I", "I")` → 0, or an overflow
  past 3999) must fail clearly rather than return nonsense. **How** to signal
  this — which error type, and the exact boundary behavior — is a design choice
  to settle during `diablo plan`.

## Acceptance criteria

- [ ] `add`, `subtract`, `multiply` work across valid in-range operands
- [ ] Conversion is reused from `src/roman.ts` (not reimplemented)
- [ ] Out-of-range results fail clearly (per the frozen plan's decision)
- [ ] Invalid Roman input propagates an error
- [ ] Tests written first (red → green), through the public interface only
- [ ] `bun run typecheck` clean and `bun test` passes

## Out of scope

- No division (ambiguous for integers with no zero/fractions — deliberately left out).
- No CLI, file I/O, or network.
