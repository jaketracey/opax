# Loop 2 — results, labels, chronology and recovery

Results now have a serif heading linked directly to the source, one quiet speaker / party dot / parliament / date run, serif passages and briefs, hairline separators and topic links. Date-only source titles are described as speeches by the named speaker rather than repeating the same date twice. Briefs no longer sit in shaded boxes. Missing briefs explicitly fall back to a passage.

The Worker adds optional `topics` to search results by combining and deduplicating resource and computed field classifications already returned by `show: basic`. It adds no per-result fetch. Only search page/window cache schema versions change; the global epoch and all answer caches remain intact. Old responses without topics still render normally.

The histogram keeps annual bars, with a readable maximum count and baseline, and groups tap targets into seven labelled year bands. Each band is at least 44px wide; unlike the old chart, targets do not overlap. Tapping filters the displayed range and preserves query, other filters and sort. Precise from/to years remain in the sheet.

The phone results count is now “1–20 of 154 strongest matches”; desktop retains the longer retrieval caveat. Zero results names the query and filters, with three exits: remove a filter (or edit the query), try in Ask, browse a topic. It no longer renders an empty summary above the actual empty state or claims a semantic search proves no speech uses a phrase.

## Capture critique and corrections

Reviewed all standard views at 360, 390, 430 and 1280px, the three requested 390px query variants, and the expanded phone summaries. Before closing the loop, fixed the two worst findings:

1. Unclamped 600-character passages consumed nearly an entire phone screen. Six-line previews now have an explicit 44px Read more / Show less control; the complete retrieved text remains available inline.
2. Title and metadata targets looked visually detached. Centre the title in its target and close the gap to metadata without shrinking either target.

Remaining: the housing query is clipped in the 360px input. The summary's Read more row leaves too much blank paper below it. The histogram needs a selected-range state for partial bands, and exact-year selection could be easier than sliders. Resize and focus behaviour need a final interaction audit. Long official bill titles still consume four or five lines; retain them rather than invent short titles.

## Verification

- `node --check portal/public/app.js` and `git diff --check`: pass.
- `npx tsc --noEmit -p .`: pass after generating the missing ignored Worker declarations using Wrangler. A temporary external env file supplied only dummy values for the existing secret *names*; no real secrets or project configuration changed.
- Mocked Worker retrieval check: topic union/deduplication, unlabelled resources, preserved party metadata and exactly one `/find` request all pass.
- Width diagnostics: no horizontal page overflow at all four sizes; no browser JavaScript errors.

The live search deployment does not yet return topics. For visual QA only, the harness joins real labels from the free resource endpoint to the real retrieval results. The Worker transformation is tested separately; this is not evidence of a deployed endpoint. Summaries are labelled layout fixtures intercepted locally, with zero paid asks. Final captures are `page-search-loop2-<state>-<width>.png` in the requested scratchpad.
