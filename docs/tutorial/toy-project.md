# Roman numeral converter

Status: ready-for-agent

A tiny, self-contained TypeScript library for converting between integers and
Roman numerals. It is intentionally small, pure (no I/O, no dependencies), and
deterministic — an ideal toy for exercising diablo end to end: the planner can
break it into clean TDD stages, the worker can implement each behind tests, and
the verifier has unambiguous acceptance criteria to judge against.

This file IS a diablo run ticket — a matured requirement, ready to hand
straight to `diablo run`. The companion guide ([`README.md`](README.md)) tells
you where to copy it. If you'd rather build this same requirement up from a
rough idea through an interactive interview, start from [`toy-idea.md`](toy-idea.md)
on the `diablo intake` path instead.

## What to build

A library module `src/roman.ts` exporting two pure functions:

- `toRoman(n: number): string` — convert a positive integer to its Roman
  numeral string (uppercase, standard subtractive notation: `4` → `IV`,
  `9` → `IX`, `40` → `XL`, `90` → `XC`, `400` → `CD`, `900` → `CM`).
- `fromRoman(s: string): number` — convert a valid Roman numeral string back to
  its integer value. Case-insensitive on input.

The two functions must round-trip: for every integer `n` in the supported range,
`fromRoman(toRoman(n)) === n`.

### Supported range and errors

- Supported range is `1`–`3999` inclusive (classic Roman numeral range).
- `toRoman` must throw a clear `RangeError` for `n < 1`, `n > 3999`, or a
  non-integer (e.g. `1.5`, `NaN`).
- `fromRoman` must throw a clear `Error` for a string that is not a valid
  canonical Roman numeral (e.g. `"IIII"`, `"VV"`, `"IL"`, `""`, `"banana"`).
  Only canonical forms are accepted — `"IV"` is valid, `"IIII"` is not.

## Acceptance criteria

- [ ] `toRoman` converts the full range `1`–`3999` correctly, including every
      subtractive form (`IV`, `IX`, `XL`, `XC`, `CD`, `CM`)
- [ ] `fromRoman` parses every canonical numeral in range and is
      case-insensitive
- [ ] Round-trip property holds: `fromRoman(toRoman(n)) === n` for all
      `1 ≤ n ≤ 3999` (assert across the whole range, or a representative sweep)
- [ ] `toRoman` throws `RangeError` on out-of-range and non-integer input
- [ ] `fromRoman` throws on invalid / non-canonical input
- [ ] Tests are written first (red), then the implementation makes them pass
      (green), exercising the functions through their public interface only
- [ ] `bun run typecheck` is clean and the full `bun test` suite passes

## Out of scope

- No CLI, no file I/O, no network — a pure library only.
- No support for the vinculum (overline) notation for numbers ≥ 4000.
- No zero or negative numerals (Roman numerals have no zero).
