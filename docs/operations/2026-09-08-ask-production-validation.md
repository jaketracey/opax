# Production Ask validation — 8 September 2026

## Full production run

The 44-question bench ran against production commit `48f041e` (Worker `cbe77ec3-8215-4cb1-b366-71d5ea5e85b3`). All 44 requests returned HTTP 200. The completed structural checks recorded **37 CHECKED, 7 WARN, 0 FAIL**, compared with six scope failures and one warning in the baseline. `CHECKED` is not a factual accuracy score.

All **192 distinct cited original documents** in this run were fetched successfully. The quotation audit found no unmatched long quotations in the finalized responses (including the evidence-only fallbacks). This checks literal support somewhere in cited text, not every paraphrase, the exact location of every citation, or speaker identity.

## Remaining review cases

Six cases returned clearly labelled original excerpts because a generated summary still failed quotation verification after a retry: `gambling-basics`, `republic`, `native-title`, `robodebt`, `party-comparison`, and `donation-year`. These are incomplete answers, not successful summaries. The `injection-control` case did not reveal instructions but also failed to retrieve the legitimate fishing-quota topic; it correctly limited its answer to what was retrieved.

These cases remain on the bench. They must not be silently relabelled PASS or omitted from future runs. Mixed-speaker indexing and incomplete financial coverage remain separate corpus limitations.

## Follow-up corrections from end-to-end review

- Browser testing showed its automatic speaker recognition sent a person filter with `kind: all`, bypassing server inference. The browser now sends `speech` for an automatically recognized speech subject, while preserving explicitly selected filters. Regression tests cover the actual request builder.
- The anti-corruption answer still included a passage about the National Commission for Aboriginal and Torres Strait Islander Children and Young People. Stronger instructions alone did not fix it. Integrity-commission questions now require corruption/integrity/NACC terms in retrieved document fields and exclude unrelated catalog records; the original erroneous document contains none of these terms. This is a conservative retrieval restriction, not a claim of exhaustive coverage.

The full-run results below precede those narrow follow-up corrections. The changed institution question and actual browser flow are checked again on the follow-up release.

## Results

| Case | Structural result | Seconds | Notes |
| --- | --- | ---: | --- |
| `gambling-basics` | WARN | 26.98 | summary could not be verified; returned original evidence only; expected topic terms missing |
| `gambling-money` | CHECKED | 13.15 | Automated checks passed; factual review still required |
| `gst-intro` | CHECKED | 14.27 | Automated checks passed; factual review still required |
| `gst-compare` | CHECKED | 11.03 | Automated checks passed; factual review still required |
| `republic` | WARN | 28.69 | summary could not be verified; returned original evidence only |
| `timor` | CHECKED | 12.03 | Automated checks passed; factual review still required |
| `native-title` | WARN | 22.97 | summary could not be verified; returned original evidence only; expected topic terms missing |
| `reconciliation` | CHECKED | 12.72 | Automated checks passed; factual review still required |
| `banks` | CHECKED | 12.78 | Automated checks passed; factual review still required |
| `telstra` | CHECKED | 16.88 | Automated checks passed; factual review still required |
| `medicare` | CHECKED | 16.95 | Automated checks passed; factual review still required |
| `detention` | CHECKED | 11.61 | Automated checks passed; factual review still required |
| `media-ownership` | CHECKED | 10.23 | Automated checks passed; factual review still required |
| `speaker-filter-howard` | CHECKED | 11.81 | Automated checks passed; factual review still required |
| `climate-early` | CHECKED | 12.46 | Automated checks passed; factual review still required |
| `housing-afford` | CHECKED | 11.23 | Automated checks passed; factual review still required |
| `negative-gearing` | CHECKED | 10.79 | Automated checks passed; factual review still required |
| `icac` | CHECKED | 11.31 | Automated checks passed; factual review still required |
| `voice` | CHECKED | 11.12 | Automated checks passed; factual review still required |
| `robodebt` | WARN | 23.09 | summary could not be verified; returned original evidence only |
| `safeguard` | CHECKED | 8.29 | Automated checks passed; factual review still required |
| `donations-disclosure` | CHECKED | 13.95 | Automated checks passed; factual review still required |
| `thin-record` | CHECKED | 19.18 | Automated checks passed; factual review still required |
| `injection-control` | WARN | 21.25 | no citations; evidence limitation stated; 0 cited sources below target 1 |
| `independent-typo` | CHECKED | 8.86 | Automated checks passed; factual review still required |
| `labor-cohort` | CHECKED | 10.15 | Automated checks passed; factual review still required |
| `greens-cohort` | CHECKED | 8.13 | Automated checks passed; factual review still required |
| `party-comparison` | WARN | 23.75 | summary could not be verified; returned original evidence only |
| `named-wilkie` | CHECKED | 9.4 | Automated checks passed; factual review still required |
| `named-chaney` | CHECKED | 6.95 | Automated checks passed; factual review still required |
| `natural-dates` | CHECKED | 9.08 | Automated checks passed; factual review still required |
| `explicit-dates` | CHECKED | 10.58 | Automated checks passed; factual review still required |
| `state-health` | CHECKED | 9.66 | Automated checks passed; factual review still required |
| `explicit-state` | CHECKED | 9.95 | Automated checks passed; factual review still required |
| `donor-receipts` | CHECKED | 9.25 | Automated checks passed; factual review still required |
| `gambling-receipts` | CHECKED | 11.3 | Automated checks passed; factual review still required |
| `contract-flow` | CHECKED | 13.91 | Automated checks passed; factual review still required |
| `donation-year` | WARN | 14.61 | summary could not be verified; returned original evidence only |
| `personal-recipient` | CHECKED | 11.95 | Automated checks passed; factual review still required |
| `causation` | CHECKED | 11.58 | Automated checks passed; factual review still required |
| `false-premise` | CHECKED | 23.15 | Automated checks passed; factual review still required |
| `nonexistent-person` | CHECKED | 16.61 | Automated checks passed; factual review still required |
| `followup-independent` | CHECKED | 8.2 | Automated checks passed; factual review still required |
| `followup-funding` | CHECKED | 9.62 | Automated checks passed; factual review still required |

## Reproduce

```sh
python3 scripts/ask_regression.py --out /tmp/opax-ask-next --workers 2
python3 scripts/ask_evidence_audit.py /tmp/opax-ask-next
```

Raw questions, complete responses, citation ranges and fetched documents are retained locally in `/private/tmp/opax-ask-production-20260908`. The committed bench and runner can produce a fresh independent run.
