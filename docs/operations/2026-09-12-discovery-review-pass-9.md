# Discovery review — pass 9, 12 September 2026

Short follow-ups about a politician's proposal now retain the person and topic. Eligibility answers use separate original quotations for the qualifying group and any deferred threshold. Duration answers distinguish a proposal's term from the period used to estimate its cost.

## Reproduced problems

After asking about David Pocock's housing proposals, “Who would be eligible?” lost the speaker and topic. Production returned unrelated passages about citizenship, employment, midwifery and tax. After asking about Pauline Hanson's housing position, “How long would it last?” returned broad excerpts that omitted the five-year measure but included its four-year costing horizon. The cost follow-up was already a useful control.

The reviewed originals establish the distinctions:

- [Pauline Hanson, 11 February 2025](https://opax.com.au/doc/speech-1194323): a proposed five-year GST moratorium on essential building materials for homes up to $1 million; a claimed cost of $1.4 billion over the next four years.
- [David Pocock, 2 July 2026](https://opax.com.au/doc/speech-1204764): qualifying, income-eligible Australians in specified residential developments; maximum allowable household incomes to be specified under regulations. The rent formula is not an eligibility rule.

## Changes

Conservative follow-up recognition covers “Who would be eligible?”, “Which homes would qualify?” and short references such as “for it”. Explicit filters still take priority. Fresh questions about other subjects reset scope, and model replies cannot establish a person filter. Duration and eligibility details retain the original search topic while the latest question controls the answer.

Eligibility requests bypass generation and quote the recorded criteria directly. A second quotation shows a deferred income threshold without stitching non-contiguous sentences into one quote. If the selected speeches do not verify eligibility, the answer preserves the selection and states the gap. Generated paraphrases cannot add unsupported groups such as veterans or pensioners.

Duration validation requires a time period attached to the measure. Policy age, a costing horizon and a budget period cannot support a claim about how long the proposal lasts. A failed summary may use a proposal quotation only when that quotation explicitly records the requested duration. The named-position cache version advances; general Ask and funding caches retain their existing versions.

## Review and validation

The independent Codex review compared the original speaking turns, challenged duration and eligibility claims, and passed the corrected implementation. It caught policy-age and costing false positives, an overbroad eligibility match to an unrelated tax proposal, and unsupported generated categories. Each was corrected before final validation.

The initial complete portal suite passed 435 tests, followed by TypeScript, asset stamps, four jurisdiction graph smoke checks and a production Worker dry run. An additional integration regression verifies that unverified eligibility never calls generation, bringing the suite to 436 tests. Local Chromium and WebKit each passed nine response-replay cases at 390, 768 and 1440 pixels, using responses separately obtained from the running application. Checks cover submitted conversation context, proposal details, dates, citation actions, source links, horizontal overflow and browser errors. The mobile WebKit result was also inspected visually.

Three production baseline probes and four application-generation attempts during iteration were used. Two further generated production controls are reserved for post-deploy verification; the corrected eligibility path needs no generation. Browser replays add no generation calls. No paid enrichment calls were made. Intermediate failures and superseded answers are retained as diagnostics rather than counted as final semantic passes.

Final production results, API timings, browser checks, asset and graph comparisons, commit and Worker version are recorded in `/Users/jake/.cache/opax/discovery-reviews/pass-9-20260912/release-verified.json`. Working evidence is in `/tmp/opax-discovery-pass9`, including the independent review and original responses.

## Limits and completion

These are dated recorded proposals, not predictions, current promises or proof that a measure became law. Follow-up recognition and sentence extraction are intentionally conservative. Bounded retrieval cannot establish that no other proposal exists. WebKit viewport checks do not replace a physical iPhone or live voice test.

This completes the ninth scheduled discovery review once production is verified. The discovery appendix can then be removed from the recurring automation; enrichment monitoring continues independently.


## Production-driven cost correction

The first deployment passed the duration and eligibility probes, but the previously successful cost control fell back to broad evidence and omitted the figure. That was a semantic failure, despite a 200 response and citations. A follow-up release in the same pass now prefers a contiguous original excerpt joining the on-topic proposal to a nearby explicit “This/Our plan/policy will/would cost $…” sentence. It stops on another speaker, another party, a new/separate proposal, a budget or an intervening cost claim; the search is bounded to three following sentences and 1,400 characters. Missing explicit linkage still requires a verified summary. The named-position cache advances again to v6.

The corrected local answer quoted the five-year proposal and $1.4 billion over four years in 1.89 seconds, without generation. The complete suite passed 437 tests, including unrelated/opponent costs, changed proposals, absent proposals, other topics and speaker boundaries. Final production verification and browser checks use the corrected response; the failed first release response remains archived. Total paid application-generation attempts for this pass are bounded to ten, including the final duration control. Exact cost and eligibility checks and all browser replays require no generation.
