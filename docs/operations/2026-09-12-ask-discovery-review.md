# Ask discovery review — 12 September 2026

The review tested politician positions and political-funding rankings against the live Ask service, then repeated the same questions against the changed Worker using the live corpus. The accepted scope is a politician's recorded position, never a fabricated quote or a prediction of what they would say.

## Findings and changes

The initial six production questions produced five timeouts at roughly 80–85 seconds. The one answer returned for fossil-fuel funding named Labor as the largest recipient based on a small retrieved sample. Summing the published receipt edges instead put Liberal first: $9,013,973 versus Labor's $8,526,686. This is a correction within the published selection, not a claim to have measured every donation.

Funding rankings now bypass generation and sum the published donor-to-party edges. They show the five leading parties, donors, or individual donor–party connections, depending on the question. Date and party filters are applied before ranking. Each row links to its scoped money map and the calculation data is downloadable. Public grants and contracts do not enter the receipt calculation. Exact industry links also retain the narrower industry, such as fossil fuels, rather than expanding to the mining-and-energy cluster.

Named 'would/might say' questions now resolve the parliamentary speaker and search the topic under that filter. Including the name in the search had over-ranked ministerial replies addressed to the person. Position prompts require attributed, past-tense statements and favour concrete policies. They exclude fictional speech and other speakers' replies. A conservative topic-overlap check rejects unrelated retrieved material; this is a guard against obvious drift, not semantic fact checking. Position text is held until validation finishes. A deliberately scoped evidence-gap answer is accepted without forcing the model to invent a citation.

If a position draft loses its citations, one bounded recovery uses the existing cited-search-summary validator: every point must supply an exact excerpt from one of the retrieved source records. Invented excerpts and unsupported numbers fail validation. Dates are added from source metadata. If this fails, the existing original-passage fallback remains available.

The model remains DeepSeek V4 Flash (`deepseek/deepseek-v4-flash-0731`). Live host probes found substantial latency variation. The existing OpenRouter `opax` preset was updated to version 5, preferring OpenInference, then DeepInfra, then Morph, with fallback enabled and reasoning disabled. No API-key limit, model, or billing plan was changed. This is a routing change, not proof that all future requests will meet a latency target.

## Reviewed examples

- **Pauline Hanson / housing:** the original 11 February 2025 speech (`speech-1194323`) proposes a five-year GST moratorium on essential building materials for homes up to $1 million. The original 23 June 2026 speech (`speech-1203782`) criticises changes to capital gains tax and negative gearing. These are her attributed proposals and arguments, not verified economic effects.
- **Pauline Hanson / immigration:** the original 26 August 2025 speech (`speech-1196388`) proposes an approximately 130,000-per-year immigration cap, with possible increases when capacity permits. It also discusses temporary protection visas and the Refugee Convention. The cap must not be relabelled as net migration.
- **Gambling receipts:** Labor leads the published selection at $10,763,834, followed by Liberal at $9,024,407. For the 2020 first-year financial-year key alone, Labor leads at $457,673. Nominal amounts and included periods are displayed.
- **Largest individual connection:** Mineralogy Pty Ltd → United Australia Party is $128,428,269 in the published selection.
- **Unsupported position:** asking about quantum zoning on Mars returns an explicit evidence limitation rather than unrelated NDIS or family policies.
- **Albanese / housing control:** the recovery produced dated statements about the Housing Australia Future Fund in 2022 and the Housing Affordability Fund in 2008. This control needed recovery; generation is not uniformly reliable on the first attempt. One draft repeated the same 30,000-home commitment across sources, so it should not be presented as two separate commitments.

## Coverage and remaining limits

The federal graph is a selected export: leading lifetime donors plus additional donors meeting the public-money selection rules. It is not the complete donor universe. Banking-related receipts can lead rankings, including Westpac in the selected Labor and One Nation records. These cannot be labelled as gifts-only donation rankings. The answer states this explicitly. Party receipts are not personal payments to politicians; an industry grouping does not establish lobbying coordination, policy influence, or wrongdoing.

Financial years use their first year as the key; election returns may use a polling-year key. Undated receipts are excluded from year-filtered calculations. Exact source arithmetic is reproducible, but it does not verify the original disclosure classification. Free-form prose still needs source review before being reused in promotional claims. A matching citation validates an excerpt's origin, not every inference a model makes from it.

## Validation and reproduction

- All focused ten-question cases passed the structural harness in the final local pass. Two Hanson answers were cache hits from successful prior live-corpus runs; uncached successful runs were approximately 13–16 seconds. The Albanese recovery took approximately 31 seconds. These are observed samples, not an SLA.
- Funding calculations returned in approximately 10–20 ms locally without a model call.
- Automated tests cover wrong ranking direction, the fossil-fuel winner, scoped years and parties, donation/receipt wording, citation ranges, evidence-gap handling, unrelated-topic rejection and exact-excerpt recovery.
- Desktop (1440 px) and mobile (390 px) browser checks found no horizontal overflow or page errors; six citation buttons and all table columns rendered, and tapping a citation opened the evidence. A zero-height citation-button box was corrected.
- The fossil-fuel → Liberal source link retained eight matching edges and the exact industry filter in the rendered map.
- Full portal tests, TypeScript, asset stamps and all four jurisdiction graph smoke tests are required before deployment.

Repeat the focused review:

```sh
python3 scripts/ask_regression.py \
  --base https://opax.com.au \
  --bench scripts/ask_discovery_questions.json \
  --out /tmp/opax-discovery-review
```

`CHECKED` means structural checks passed, not a factual endorsement. Review each answer against its original cited speeches and independently sum the receipt dataset. Exact money expectations are tied to the 7 September 2026 graph snapshot and should be reviewed when the graph changes. Raw provider responses and credentials are not committed.
