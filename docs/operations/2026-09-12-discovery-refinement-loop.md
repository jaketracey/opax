# Discovery refinement loop — initial pass, 12 September 2026

This follows the Ask discovery review earlier that day. The purpose is to make a small set of compelling public questions reliably useful, then schedule three more bounded reviews. Existing enrichment monitoring continues; the discovery reviews run at most once every two hours and remove only their own added instructions after the third pass.

## Evidenced failures

Six production probes tested familiar donor names, proposal wording, party comparisons, industry comparisons and a historical period. The structural harness alone did not expose all the quality problems:

- “Who gets more gambling money, Labor or Liberal?” took 56.96 seconds and returned speech excerpts rather than a calculated comparison.
- “Who gives more money to Labor, unions or banks?” took 45.13 seconds and returned several incomparable figures from speeches. The shared receipt helper also treated banks as the entire finance industry. The published classification cannot establish a banks-only total.
- “Who gets the most money from Mineralogy?” took 51.63 seconds. It retrieved the relevant figures but added unnecessary speech commentary and state data. The omitted company suffix had prevented the direct calculation.
- “What has David Pocock proposed about housing affordability?” took 28.24 seconds and reported no relevant proposal. The wording “proposed” had not triggered the named-speaker filter.
- Existing “Who gives the most money to the Liberal Party?” and the gambling ranking before 2000 already returned direct calculations in around 0.1 seconds.

## Resulting behaviour

Two parties or two industries can now be compared over the same selected period. Answers lead with the dollar difference and show both totals and record counts with individual source links. Multiple dimensions, unmatched categories, missing data, inflation adjustments and changes between separate periods are not silently replaced by a pooled comparison. Bank and ambiguous energy questions request a precise scope instead of widening the industry. A unique company name can omit its legal suffix.

Proposal and recommendation wording now resolves a named parliamentary speaker, searches the topic under that filter, and uses the existing attributed-position prompt, validation and recovery. The cache version changes so old failed answers are not reused. This does not make all generated summaries reliable; exact source review still matters.

The homepage examples include the reviewed party comparison, Pocock proposal and Mineralogy question. Calculated answers are marked “From disclosed receipts”. Calculation-download links now render as links rather than raw Markdown.

## Verified examples

The figures below are calculations from the 7 September 2026 published graph, not every donor or gifts-only donations. They are nominal party receipts, not personal payments or evidence of influence.

| Question | Checked result |
| --- | --- |
| Gambling receipts, Labor vs Liberal | $10,763,834 vs $9,024,407; difference $1,739,427 |
| Same comparison, 2020 first-year financial-year key | $457,673 vs $360,195; difference $97,478 |
| Union vs finance receipts to Labor | $247,398,401 vs $124,432,023; difference $122,966,378 |
| Mineralogy's largest recipient in the federal selection | United Australia Party, $128,428,269 |

The union/finance figures were independently summed from donor-to-party edges using decimal arithmetic. Finance is not relabelled as banks.

The Pocock response now cites `speech-1204764` (2 July 2026) and `speech-827462` (9 February 2023). Original text was read, not just the summaries. The July speech proposes affordable housing obligations for residential development on surplus Commonwealth land sold or leased to private entities. It defines affordable rent as at most 75% of market rent or 30% of household income, whichever is lower. The February speech welcomes the Housing Australia Future Fund while criticising its scale. These are recorded proposals and arguments, not statements that the proposal became law or remains his current platform. The first revised uncached answer took 15.42 seconds.

## Validation and next passes

- 347 portal tests passed, including new paired arithmetic, date scope, missing-side, unsupported-category and proposal-filter checks.
- TypeScript and asset stamps passed.
- The six added end-to-end cases passed against the changed Worker using the live corpus. The final Pocock repeat was a cache hit; its earlier uncached answer and original sources were reviewed separately.
- Browser checks at 390, 768 and 1440 pixels found no overflow or page errors. Both comparison rows, three citation controls and the calculation link rendered correctly; tapping a citation opened the evidence.
- The regression harness now checks required answer status, so a calculated-answer case cannot pass merely by returning a cited speech summary. An expected request for clearer scope is valid without invented citations.

Repeat the new cases with `scripts/ask_regression.py --bench scripts/ask_discovery_questions.json --only gambling-party-comparison gambling-party-comparison-year mineralogy-familiar-name industry-comparison banks-not-finance pocock-proposals`. Use a fresh output directory and the deployed base URL for release verification.

Next reviews should test additional natural wording, named-speaker attribution in combined debates, follow-up questions and distinct historical periods. A structural pass is not proof of factual quality. The published map remains a selected export and cannot answer every industry, donor or financial classification. Keep paid probes bounded and prefer arithmetic or existing successful caches where appropriate.
