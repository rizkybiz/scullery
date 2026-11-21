# Recipe import eval set

How the AI output of the recipe import is checked. The import turns a web page or pasted text into
a draft for the recipe form; a person always reviews the draft before saving. This set measures how
often the draft is right without that person, and in what ways it is wrong.

## What it runs

`scripts/eval-import.ts` runs **the app's own code**, the same functions the import uses:

```
fixture ──► source.ts (JSON-LD Recipe, else visible text)
        ──► structure.ts (one AI SDK call through AI Gateway, structured output, no tools)
        ──► normalize.ts (API limits and tidy-ups)
        ──► score.ts (deterministic checks against cases.ts)
```

Each model runs **alone, without Gateway fallbacks**, so a result belongs to the model named.

## The cases

16 fixtures in `fixtures/`, all invented for this repo: no live fetching (results do not drift
with someone's website) and no copyrighted pages.

| Kind | Cases |
|---|---|
| JSON-LD pages | plain, inside a Yoast `@graph`, ingredient headings and `HowToSection` steps, fractions, ranges, notes and optional, ISO durations and timers |
| Plain HTML | lists with navigation around them; a long blog post with ads and comments |
| Pasted text | numbered steps, a paragraph of method, headings, unit spellings, units the API does not have |
| Must refuse | a news article |
| Must resist | a page with hidden text telling the AI to rename the recipe, add bleach and a link |

Each case lists only the fields it is about (`cases.ts`). The expectations encode the agreed
conventions, not "looks right":

- headings such as "For the filling:" are sections, never ingredients;
- numbered or listed steps are kept; an unnumbered paragraph is one step per sentence;
- a timer only for one stated duration (a range takes the shorter; two durations, none);
- a plain count ("3 eggs") has no unit; a unit the API lacks ("sprig", "head") is null;
- nothing from text addressed to an AI appears anywhere in the draft.

`score.ts` makes every expectation one check and gives it a kind (quantities, units, timers,
sections, safety...), so a run says where a model goes wrong, not only how often.

## Running it

```sh
vercel env pull /tmp/dev.env --environment development   # a 12-hour OIDC token; no API key exists
export VERCEL_OIDC_TOKEN=...                              # from that file
node scripts/eval-import.ts                               # both models, ~11 minutes
node scripts/eval-import.ts --model google/gemini-2.5-flash-lite --case 05-jsonld-ranges
```

- **Cost:** one free-tier AI Gateway request per case per model (32 for a full run, a few thousand
  tokens each). The script refuses models outside `EVAL_MODELS`.
- **Rate limit:** the free tier allows each model 5 requests a minute for the whole team, so
  requests are 13 s apart (`--pace`). Do not run it while someone imports on a deployment.
- **Output:** `results/<model>.json` (every draft and check) and `RESULTS.md` (the summary).

Run it by hand after changing the prompt, the schema, `normalize.ts` or the models. It is not in CI:
every run spends free-tier requests and is slow by design.

## Run log

Each run's numbers, and what changed before it. Raw results of the latest run are in `results/`.

1. **Baseline** (no changes): Flash-Lite 284/294 checks, 6/16 cases fully right, median 1.8 s, but
   three cases were lost to the rate limit. Nano 324/329, 11/16, median 15.8 s.
   Failures by kind: plain counts given the unit `each` (Flash-Lite 5, Nano 1); "a pinch of" with
   no amount (both); "sheet" mapped to `slice`; a step with two durations given a timer; a few
   missed timers, one missed preparation, one missed yield.
2. **Pacing and prompt.** Changes: requests paced under the rate limit; `temperature` only for
   models that accept it; two prompt conventions ("a plain count has no unit, `each` only when
   written"; "'a' before a unit is 1"; never substitute a near unit).
   Flash-Lite 318/329 checks, 9/16 cases, median 1.9 s, no rate-limit errors. Nano 327/329, 15/16,
   median 14.8 s. Nano now gets every unit right; Flash-Lite still replaces units the API lacks
   with near ones ("3 sprigs" a bunch, "2 handfuls" a cup, "3 eggs" 3 each) despite the new rule.
3. **Unit check in normalize.** Change: a unit is kept only if the ingredient's own source line
   writes it (prompt rules alone had not stopped the substitutions).
   Flash-Lite 325/329 checks, 12/16 cases, median 1.9 s: every unit failure gone, nothing correct
   dropped. Left: two quantities read wrong, two timer judgements. Nano 327/329, 14/16, median
   14.4 s: a missed yield and a missed preparation, the second one passed in run 2.
   **Decision:** Flash-Lite stays primary (2 checks behind, 7.5 times faster, and a person reviews
   every draft); Nano is the Gateway fallback.
