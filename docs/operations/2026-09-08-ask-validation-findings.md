# Ask regression findings — 8 September 2026

## Baseline

Ran all 44 cases against `https://opax.com.au/api/ask` on the production release at `e15a537`. With the completed scope assertions, 37 passed structural checks, six failed scope checks, and one returned an uncited thin answer. These are mechanical verdicts, not factual accuracy scores.

The evidence audit fetched all 263 distinct original documents cited by the baseline responses; every fetch succeeded. It checks long direct quotations against cited documents and flags mismatches for review. Ellipses, wording changes and citation misassignments need different treatment. It does not certify paraphrases or speaker identity.

## Reproduced defects and changes

| Cases | Observed defect | Change |
| --- | --- | --- |
| `named-wilkie`, `named-chaney` | Natural questions about an MP retrieved other people's speeches; Chaney question falsely appeared unsupported | Match an exact full name from the parliamentarian roster in the grammatical speech subject and apply the speaker filter |
| `natural-dates` | A 1998–2000 question retrieved later records, including recent financial records | Apply unambiguous natural year windows before document and catalog retrieval |
| `state-health` | Queensland question was dominated by other parliaments | Infer a named parliamentary jurisdiction |
| `safeguard`, `greens-cohort` | Senate questions included House records | Apply a Senate chamber filter; preserve broad financial retrieval for funding questions |
| `followup-independent` | Follow-up returned unrelated health/education passages despite housing context | Keep a contextual retrieval query and disable the provider's failing implicit history rewrite with `chat_history_relevance_threshold: 1`; preserve history for answer generation |
| `voice` | Introduction dates were presented as dates bills passed | Label bill dates explicitly as introduction dates; keep current status separate |
| `contract-flow` | Generic words crowded out specific contract notices | Remove question scaffolding such as government/awarded from catalog query terms |
| `timor`, `independent-typo`, `republic` | Altered quotations or quotations linked to a different cited record | Require exact quoted wording; check long quotations against original cited text, retry once with default citations, and return clearly labelled evidence excerpts if recovery still fails |

Explicit filters take precedence. Names mentioned as the object of a speech, party comparisons, ambiguous year references and nonpolitical uses of independence do not become restrictive subject filters. Inferred filters are visible with the answer. The Ask cache version changes so old answers are not replayed.

## Verification

- 188 portal tests and three Python regression-runner tests passed.
- Type generation, TypeScript, browser JavaScript syntax, asset stamps and Worker deployment dry run passed.
- Live local-provider checks verified named MPs, date windows, Queensland and Senate scope, bill-date wording, specific contract notices and the recovered housing follow-up.
- Baseline and local raw evidence remain in `/private/tmp/opax-ask-baseline-20260908` and sibling `opax-ask-local-*` directories on the operator's machine. They are not committed model output fixtures.

## Limits

The source corpus still includes debate records containing multiple speakers under one index name. Filtering a name or party cannot repair that ingestion issue. The answer must distinguish index labels from verified attribution. A literal quotation check does not establish the truth of political claims, certify every paraphrase, or establish exhaustive coverage. Year-specific financial totals may remain unavailable when the published records contain only aggregates. Unsupported-person, false-premise, injection and no-evidence controls are included in the release bench.

Production verification is recorded after release in the companion release report.
