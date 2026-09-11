# Discovery review — scheduled pass 2, 12 September 2026

The second of three scheduled discovery passes adds useful answers to changes in party funding over time. One scheduled review remains; the enrichment monitor continues separately.

## Production failure

Two questions exposed the same gap:

- “Did Labor receive more gambling money in 2020 or 2021?” took 57.85 seconds and said the annual breakdown was not available.
- “How did gambling receipts to Labor change from 2020 to 2021?” took 56.85 seconds, discussed unrelated disclosure legislation and did not establish the requested figures.

The published map already contains those annual receipt cells. Both answers passed the old structural probe because citations alone do not establish that an answer is useful or correct. The bounded baseline also tested Liberal funders and Hanson's housing position. Three baseline requests generated fresh answers; the funder calculation needed no model. Enrichment remains on the existing Codex worker, with zero paid external enrichment calls.

## Change

Ask now calculates comparisons of two individual financial-year keys for one recipient party, optionally restricted to one industry or donor. It leads with the difference, shows both annual totals and receipt counts, and links each row to that exact year and selection in the money map. The calculation-data source is also linked. Intermediate years never enter an endpoint comparison.

Missing years remain an evidence gap, rather than a claimed zero. Recorded zero totals can legitimately tie. Conflicting filters, duplicate or ambiguous years, and requests to compare multiple parties across multiple years ask for clarification. Existing comparisons between parties over a shared date range still aggregate that range. Unmatched donors and industry subsets retain the previous pass's scope guard.

These answers are returned before generation and its cache. The old generated failures therefore cannot override the new calculation, and supported comparisons do not incur model costs. No model, cache epoch, voice-tool calculation, graph data or source record was changed.

## Independent arithmetic

Decimal sums over published gambling donor-to-party `byYear` cells, excluding grants and public-money flows, gave:

| Financial year | Labor receipts | Records | Liberal receipts | Records |
| --- | ---: | ---: | ---: | ---: |
| 2019–20 | $283,635 | 25 | $417,398 | 24 |
| 2020–21 | $457,673 | 47 | $360,195 | 33 |
| 2021–22 | $1,011,028 | 67 | $459,029 | 31 |
| 2022–23 | $650,200 | 22 | $244,100 | 16 |

Labor's 2020–21 to 2021–22 difference is **+$553,355**. The next year is **$360,828 lower**. Comparing only 2019–20 and 2022–23 gives **+$366,565**, without including the intervening years. A shared 2020–2021 key range for both parties instead gives Labor $1,468,701, Liberal $819,224 and a $649,477 difference.

These are nominal, selected party receipts from the 7 September graph, not complete industry funding, gifts-only donations, personal payments or evidence of lobbying/influence. Financial years use the first-year key; election returns may use a polling year. Undated entries are excluded.

## Speaker control: unresolved attribution case

The Hanson housing answer contains a useful documented proposal but is not a full factual pass. Original production resource text was read for `speech-1194323`, `speech-829577` and `speech-1203782`.

The 11 February 2025 statement (`speech-1194323`) supports a five-year GST moratorium on essential building materials for homes up to $1 million and Hanson's stated $1.4 billion four-year costing. It also contains her bathroom-compliance cost claim. The 29 March 2023 questions (`speech-829577`) distinguish Hanson's supplementary immigration question from ministerial replies.

However, the 23 June 2026 record (`speech-1203782`) is indexed under Hanson and contains several speeches. The passage used for the answer's opening supply-versus-investors claim is after a “Time expired” boundary and a new 1:08 pm speech, followed by a reference to the speaker's home state of Western Australia. Its index label is insufficient to attribute that passage to Hanson. The next scheduled pass should prioritize this exact attribution failure and the missing dates in the generated summary. Do not promote that opening claim as a verified Hanson position.

## Validation

- 355 portal tests passed, including annual increases, decreases, endpoints, ties, recorded zeros, missing years, ambiguous cohorts, conflicting filters, exact row links, valid citation offsets and shared-range party comparisons.
- TypeScript, asset stamps and four jurisdiction graph smoke checks passed.
- Ten local end-to-end cases returned the expected answer states and figures. The harness marks the missing-year evidence gap as a no-citation warning; that case intentionally has no fabricated source or total.
- Browser checks at 390, 768 and 1440 pixels verified the two-row table, three citations, exact year/party/industry links, working source disclosure, no horizontal overflow or script errors, and restoration of answer controls after clarification.

Evidence is retained in `/Users/jake/.cache/opax/discovery-reviews/pass-2-20260912` (working copy `/tmp/opax-discovery-pass2`). The five new tracked cases are in `scripts/ask_discovery_questions.json`; run only their IDs for a bounded, calculation-only follow-up.
