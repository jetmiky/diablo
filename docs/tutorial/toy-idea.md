# Currency conversion core — rough idea

> This file is the **starting point for the `diablo intake` path** in the
> tutorial. It is deliberately vague: a handful of half-formed bullets, the way
> a real idea actually arrives. You don't refine it yourself — you paste these
> bullets into the interactive `diablo intake` grilling session and let the
> Socratic dialogue pull the precise requirements out of you. The polished,
> ready-to-run version of this same idea lives in
> [`feature-convert.md`](feature-convert.md) — compare the two when you're done
> to see what intake added.

- I want a small TypeScript library to help convert money between currencies
- It should take an amount and a rate and give back the converted amount
- Only a few currencies matter to me — something like USD, IDR, JPY, EUR
- It needs to validate input somehow: reject a currency it doesn't know, reject
  an amount that isn't a real number, and not let you convert a currency to
  itself — but I haven't pinned down the exact errors
- The result should print nicely, like `IDR 15,000` or `USD 150.50`, though I'm
  fuzzy on how decimals differ between currencies
- Keep it pure — just a library, no CLI, no network, no files (that comes later)
- I'd like tests, ideally written first
