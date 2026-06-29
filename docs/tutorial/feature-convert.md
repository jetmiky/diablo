# Feature 1 — Roman numeral converter

Status: ready-for-agent

A tiny, pure TypeScript library converting between integers and Roman numerals.
Small, deterministic, no I/O — an ideal first run: clean TDD stages and
unambiguous acceptance criteria. This file IS a diablo run ticket; the
[tutorial](README.md) runs it directly with `diablo run` (no `plan` step).

## What to build

A module `src/roman.ts` exporting two pure functions:

- `toRoman(n: number): string` — integer → Roman numeral (uppercase, subtractive
  notation: `4`→`IV`, `9`→`IX`, `40`→`XL`, `90`→`XC`, `400`→`CD`, `900`→`CM`).
- `fromRoman(s: string): number` — valid Roman numeral → integer.
  Case-insensitive input.

They must round-trip: `fromRoman(toRoman(n)) === n` for every `n` in range.

### Range and errors

- Supported range: `1`–`3999` inclusive.
- `toRoman` throws `RangeError` for `n < 1`, `n > 3999`, or non-integer
  (`1.5`, `NaN`).
- `fromRoman` throws `Error` for non-canonical input (`"IIII"`, `"VV"`, `"IL"`,
  `""`, `"banana"`). Only canonical forms accepted — `"IV"` valid, `"IIII"` not.

## Acceptance criteria

- [ ] `toRoman` converts `1`–`3999` correctly, including every subtractive form
- [ ] `fromRoman` parses every canonical numeral in range, case-insensitive
- [ ] Round-trip holds: `fromRoman(toRoman(n)) === n` across the range
- [ ] `toRoman` throws `RangeError` on out-of-range / non-integer input
- [ ] `fromRoman` throws on invalid / non-canonical input
- [ ] Tests written first (red → green), exercising the public interface only
- [ ] `bun run typecheck` clean and `bun test` passes

## Out of scope

- No CLI, file I/O, or network — a pure library only.
- No vinculum (overline) notation for numbers ≥ 4000.
- No zero or negative numerals.
