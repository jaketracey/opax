# Discovery review pass 16 — ordinary funding questions and useful next steps

## Reproduced weaknesses

“Who gets the most from mining?” skipped the receipt calculator because the question omitted a word such as “money” or “funding”. The equivalent explicit question already worked. Independent aggregation of the published graph confirmed United Australia Party at $155,465,435 across 727 selected receipt records.

After an answer, “Ask something else” randomly selected from the full question pool, discarding the reviewed starting questions. Existing wrapping worked on mobile and tablet. A later browser check found single-line tablet buttons were only 40px high, and a mobile table header split “Records” mid-word.

## Changes

Recipient-ranking questions can use the calculator when they name a supported industry after “from”. Routing and calculation share the same industry vocabulary; the calculator still requires the whole question's scope to match. Unsupported topics, explicit speech/person filters, exclusions and questions about influence remain outside this shortcut. Mixed known and unknown names cannot produce a partial total.

Independent review caught an ambiguous case: “Who gets the most from the media?” can mean attention. Bare media wording therefore requires a financial or industry/sector/lobby cue before entering the funding calculation. Broader grammar such as “Which political party…” and past-tense forms remains for a later pass.

The homepage and post-answer question choices now share a stable reviewed-first order, remove duplicates and exclude the question just answered. The next-question buttons have a 44px minimum height. Table headings wrap at spaces rather than splitting words. Existing colours, type, layout and source data are retained.

## Validation and limits

The source-only API returned calculated answers for the short mining question, a fossil-fuel recipient question and a gambling question limited to the 2020–21 financial-year key. These use real receipt data without a model call. Arithmetic, exact source links, scope restrictions and media ambiguity passed independent review and 41 focused tests. All 514 portal tests, type checks, asset stamps and production dry-run passed after building the search catalogue required by a clean worktree.

Chromium and WebKit checks at 390, 768 and 1440px use real deterministic Ask responses. They inspect source destinations, reviewed next questions, repeated-question exclusion, button sizes and horizontal overflow. Unrelated generation routes are intercepted. Final browser/release evidence is archived in `/Users/jake/.cache/opax/discovery-reviews/pass-16-20260913/`.

The result is a ranking within Opax's selected disclosed party receipts, not every donor or a gifts-only total. It does not establish personal payments, lobbying coordination or influence. No paid external model calls were made and this pass does not newly validate generated politician-position answers.

The user requested another bounded cycle after pass 15: passes 16–20. Four further hourly passes remain after this release; each must reproduce a useful weakness, challenge the proposed fix and verify any deployment. A no-change audit is valid. Existing enrichment and source monitoring continues, and its explicit summary-worker stop marker is preserved.
