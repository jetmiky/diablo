# Roman numeral converter — rough idea

> This file is the **starting point for the `diablo intake` path** in the
> tutorial. It is deliberately vague: a handful of half-formed bullets, the way
> a real idea actually arrives. You don't refine it yourself — you paste these
> bullets into the interactive `diablo intake` grilling session and let the
> Socratic dialogue pull the precise requirements out of you. The polished,
> ready-to-run version of this same idea lives in
> [`toy-project.md`](toy-project.md) — compare the two when you're done to see
> what intake added.

- I want a small TypeScript library to work with Roman numerals
- It should go both ways: number → Roman numeral, and Roman numeral → number
- Keep it pure — just a library, no CLI, no files, no network
- It should reject nonsense input somehow, but I haven't thought through what
  counts as "nonsense" or what error to throw
- I'd like tests, ideally written first
- Not sure what number range to support, or how strict to be about weird
  numerals like "IIII" vs "IV"
