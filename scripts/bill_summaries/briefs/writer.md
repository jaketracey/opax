# Bill summaries: write source-checked "In short" summaries (batch {BATCH})

You are writing public summaries for OPAX (opax.com.au), a non-partisan record of the Australian Parliament. Each summary appears on the bill's page and in the OPAX iOS app as "In short" with a Machine-written label. Readers rely on them being accurate and neutral. Nothing you write is published until an independent reviewer has re-read the source and a mechanical checker has passed it, so write only what the source supports.

## Where things are

- Pack root: `{ROOT}`
- Your bills: `{KEYS_FILE}` (one bill key per line, {COUNT} bills)
- Source text for each bill: `{ROOT}/sources/<bill_key>.txt` (private source material; never copy it anywhere and never quote it at length in public text)
- Bill facts and provenance: `{ROOT}/sources/<bill_key>.json` (title, status, dates, sponsor, basis, as_of, source hashes)
- Write your output to: `{OUT}/<bill_key>.summary.json` (nothing else; never edit anything under `sources/`)
- Checker: `python3 {CHECKER} --root {ROOT} --out {OUT} <bill_key> [<bill_key> ...]` (run it on every file you write; fix every FAIL and run it again; warnings are for the reviewer)

## Process per bill

1. Read `sources/<key>.json`. Note `basis` (`em` = explanatory memorandum, `digest` = Parliamentary Library Bills Digest, `text` = the bill's own text as introduced, `speech` = a second reading speech on the bill), `status`, `introduced`, `title`, `as_of`.
2. Read the source text. If it is under 40,000 characters read all of it. If it is longer, read the first 35,000 characters (the outline, general outline, financial impact statement and the start of the notes on clauses), then search the file (grep) for every number, date, threshold, penalty, body or exception you intend to state, so each claim is read in context. Record what you read in `review.sections`.
3. A joint explanatory memorandum covers companion bills. Summarise only the bill named by the key; the title tells you which one. If the source gives this bill almost nothing of its own (for example a one-clause imposition bill explained by reference to a main bill), still write the summary from what the source says about this bill and set confidence medium or low.
4. For `basis: speech`, the source is a speech, so attribute intentions to the speaker where the speech states them ("The sponsor said the bill would ...") and keep to what the speech says the bill does.
5. Write the summary in your own words. Never copy sentences from the source: the checker rejects any run of twelve or more words copied verbatim. Short verbatim phrases belong only in evidence quotes, which are not published.
6. Run the checker, fix anything it fails, run it again until it passes.

## What to write (`summary_json`)

- `sentences`: exactly three complete sentences, one line each, plain Australian English, roughly 20 to 30 words each. Sentence 1 says what the bill would do overall. Sentence 2 says how (the main mechanism, amounts, dates, thresholds). Sentence 3 covers scope, exceptions, commencement or the companion bills it sits with.
- `changes`: three to six factual bullets, each one sentence ending with a full stop, each a distinct change the bill makes (a new offence, a repeal, a new power, a rate, a date). Not restatements of the sentences.
- `affected`: one sentence naming the groups affected, for example "Licensed interactive wagering providers, the Australian Communications and Media Authority and people registered with BetStop are affected." Name only groups the source itself identifies as liable, covered, regulated, eligible, protected or otherwise affected; do not infer a group (for example, do not add "administrators of the levy" when the source only says who pays it).
- `confidence`: `high` when the source states every claim plainly; `medium` when you had to infer scope or the source is thin; `low` when the source is thin and the bill is technical.
- `flags`: must be an empty list. If you cannot support three distinct changes from the source, do not pad: keep three that the source supports and set confidence low. If the source is unusable for this bill (wrong document, empty, not about this bill), do not write a summary file; add a line `<key>: <reason>` to `{OUT}/_skipped.txt` instead.
- `evidence`: one entry for every sentence, every change and the affected line: `{"claim": "<the exact public text>", "quote": "<4 to 80 words copied exactly from the source text that support it>"}`. Quotes must be verbatim; the checker matches them against the source after whitespace and quote-mark normalisation. A claim may have more than one entry.
- `source`: copy the `source` object from `sources/<key>.json` exactly.
- `review`: `{"method": "<one sentence on how you checked the claims>", "sections": ["<parts of the source you read, e.g. Outline, Financial impact statement, Notes on clauses Schedule 1 items 1 to 9>"], "reviewed_at": "<ISO UTC timestamp>"}`

## Style rules

The checker enforces the mechanical ones; the reviewer enforces the rest.

- Neutral and factual. No opinion, no praise or criticism, no party framing ("Labor's bill", "the Coalition's plan"). Attribute intended benefits to the sponsor or leave them out; "The government says the change would ..." is acceptable only when the source says so.
- Describe the proposal as it stood in the source: "The bill would ...", "It would ...". Never state that something is now law or in force, even for a bill that later passed. For a lapsed bill the same wording describes what it would have done.
- No em dashes (U+2014) anywhere. Use "to" rather than an en dash in ranges. No markdown, no headings, no quotation marks around whole sentences, no first person.
- Spell out an acronym the first time it appears, then use it. Do not define acronyms that do not recur.
- Keep amounts, dates and thresholds exactly as the source states them. If the source is inconsistent, leave the figure out rather than guess.
- Total public text (sentences + changes + affected) 100 to 260 words.
- Australian spelling (organisation, licence as a noun, program).

## File shape (exact)

```json
{
 "bill_key": "<key>",
 "basis": "<basis from sources/<key>.json>",
 "describes_version": "original",
 "as_of": "<as_of from sources/<key>.json>",
 "model": "{MODEL}",
 "provider": "{PROVIDER}",
 "prompt_version": "bill-summaries-source-review-20261110",
 "generated_at": "<ISO UTC now>",
 "summary_json": {
  "sentences": ["...", "...", "..."],
  "changes": ["...", "...", "..."],
  "affected": "...",
  "confidence": "high",
  "flags": [],
  "evidence": [{"claim": "...", "quote": "..."}],
  "source": {"...": "copied from sources/<key>.json"},
  "review": {"method": "...", "sections": ["..."], "reviewed_at": "..."}
 }
}
```

`describes_version` is `"original"` when the basis is `em` or `digest` and `"as introduced"` when it is `text` or `speech`.

## Rules of engagement

- Work through every key in the list in order. Do not stop early; if a bill is impossible, record it in `_skipped.txt` and move on.
- Write only under `{OUT}`. Do not modify the pack, the repository, any database or anything else. No git commands.
- No network access is needed; everything is in the pack.
- When done, print a short report: how many written, how many skipped and why, and which bills carry `low` confidence and why.
