# Historic Hansard enrichment

Only active `kind/speech` resources carrying `source/hansard_hist` enable these rules.
The summariser selects the longest non-summary text field, squashes whitespace and clips
very long text with `text.clip`. The short threshold counts Unicode code points of that
input: **under 200**, rather than 200 or fewer. Both queue tasks finish as `skipped-short`
before generation, including one-word procedural records. Nothing is removed from the KB.

The summary validator checks titled surnames, capitalised full names/initials and surnames
attributed with speech verbs. Names supported by the full unit text or the parliamentary
roster pass. Electorates, known places, parties, institutional/law titles and ministerial
portfolios are exempt. This is a deterministic recogniser, with limited coverage of
ambiguous isolated capitalised words; the offline audit is specificity evidence, not
personal-name recall or model-output precision.

A name failure discards the summary and permits one corrective escalation. The
`names_rejected` queue flag preserves that allowance across budget/deadline interruptions
and outages. A completed corrective response that still fails validation finishes as
`rejected-names`. Accepted topics can finish independently. Both new states have `done_at`,
release their claims, clear saved results and are excluded from claims, saved-result flushes
and the backlog budget query. The write path also checks saved/forced results.

Historic prompts describe private individuals by role. The existing live prompt still
matches its golden fixture byte for byte. App/web **Machine generated** wording is unchanged.
Historic rejection diagnostics contain no names or raw model samples.

## Staged census

The report at `/home/jake/opax-staging/federation/kb-gap/short-units.json` contains totals,
shares, every year/chamber/kind stratum, per-file counts and input SHA256 hashes. The desktop
manifest currently contains **179,792** T1 units across 18 files: representatives 1993–1997
and senate 1993–2005. The pilot samples those files and is excluded from the T1 denominator.

| Set | Short | Total | Share |
| --- | ---: | ---: | ---: |
| Pilot | 75 | 2,000 | 3.75% |
| T1 manifest outputs | 8,810 | 179,792 | 4.9001% |
| Literal `*.jsonl`, including duplicate pilot | 8,885 | 181,792 | 4.8875% |

| Year | Pilot short / total | T1 short / total |
| --- | ---: | ---: |
| 1993 | 9 / 224 | 648 / 14,879 |
| 1994 | 6 / 222 | 781 / 19,790 |
| 1995 | 3 / 222 | 837 / 19,891 |
| 1996 | 17 / 222 | 1,174 / 17,878 |
| 1997 | 12 / 222 | 1,495 / 27,403 |
| 1998 | 4 / 111 | 607 / 9,900 |
| 1999 | 3 / 111 | 778 / 13,218 |
| 2000 | 2 / 111 | 622 / 12,438 |
| 2001 | 3 / 111 | 386 / 8,000 |
| 2002 | 5 / 111 | 367 / 9,213 |
| 2003 | 2 / 111 | 399 / 10,705 |
| 2004 | 6 / 111 | 398 / 8,313 |
| 2005 | 3 / 111 | 318 / 8,164 |

| Chamber / unit kind | Pilot short / total | T1 short / total |
| --- | ---: | ---: |
| Representatives | 20 / 557 | 1,388 / 39,396 |
| Senate | 55 / 1,443 | 7,422 / 140,396 |
| Speech | 23 / 666 | 5,653 / 103,167 |
| Question | 19 / 667 | 991 / 38,226 |
| Answer | 33 / 667 | 2,166 / 38,399 |

## Text-only guard audit

No model was called. Complete pilot text checked against its own unit text fires **0/2,000**.
That control verifies source support and necessarily passes references present in the unit;
it does not estimate generated-summary quality. Using the clipped model input as the
stand-in summary fires **2/2,000 (0.10%)**, from names cut by head/tail clipping.

An independent reference selector extracts known place/electorate and party mentions,
ministerial titles and bill/act titles from the pilot. Testing those spans in summary-style
prose with source support withheld fires **2/8,135 references (0.0246%)**, in two units.
The selector uses dictionaries and title patterns; these are automatically selected
controls, rather than manually labelled model outputs.

| Reference controls | References | Fired |
| --- | ---: | ---: |
| Places/electorates | 4,542 | 0 |
| Parties | 685 | 0 |
| Ministerial titles | 1,956 | 2 |
| Bills/acts | 952 | 0 |

The original combined prompt SHA256 is
`44029ec22e9b37b0bf6cdd383b499e62be187f085ec38fb432043f49c4c02b30`.
No speech text, names, titles or model prompts are persisted by the measurement script.

## Neuron estimate

**170,982** units remain after short skips; none additionally fail the existing three-word
minimum. The estimate calls `src/budget.ts:neuronsFor` with the actual historic system and
clipped record-message lengths, **3.5 JS characters per input token**, and the existing
bake-off mean of **620 output tokens including thinking**. One primary call produces both
summary and topics. KB resource IDs are estimated as 32 characters. All units are assumed
to need both tasks. Tokenizer/schema framing and nightly spend are excluded.

| Scenario | Neurons | Days at 1.5M/day | Whole budget days |
| --- | ---: | ---: | ---: |
| One primary call per eligible unit | 5,012,388 | 3.34 | 4 |
| Plus name escalation for 1% of units | 5,168,152 | 3.45 | 4 |
| Plus name escalation for 5% of units | 5,791,210 | 3.86 | 4 |
| Every unit needs a name escalation | 20,588,829 | 13.73 | 14 |
| Primary calls all reach 4,000 output tokens | 22,624,474 | 15.08 | 16 |

Escalation scenarios use the same output-token assumption; their rates are illustrative,
not measured. Ordinary validator retries and concurrent nightly spending can add days.
At the existing steady budget of 150,000/day, the baseline would require 33.42 budget days.

## Reproduce locally

From `enrich/`, with Node 24 and dependencies installed:

```sh
node scripts/build_historic_names.ts
node scripts/measure_historic.ts
node scripts/measure_historic.ts --pilot-audit
npm test
npx tsc --noEmit
npx wrangler deploy --dry-run
```

The builders accept alternate local roster/portal and staged-directory paths. The asset
contains 6,115 parliamentary name forms, 440 electorate names and 307 portfolio words
(100,799 bytes), derived from the Handbook federation members/electorates/ministries
exports and `portal/public/parliamentarians.json`. It is bundled by Wrangler; no roster D1
table or upload is needed. Measurement never contacts KB, Workers AI or D1.

## Orchestrator deployment

1. Apply **`enrich/migrations/0002_historic_rules.sql`** to the existing **opax-enrich D1**
   database before deploying the new Worker. It copies existing queue rows unchanged,
   extends the status CHECK, adds `names_rejected` defaulting to zero and recreates all
   three queue indexes. Existing state/spend/errors/rejections tables are unchanged.
2. Deploy **opax-enrich** from `enrich/` using its existing `wrangler.jsonc`. Wrangler
   includes `src/historic-names.json` in the Worker bundle. Existing bindings, secrets,
   budget variables, cron and live write mode apply. No app or portal deployment is needed.
3. Enqueue T1 resource IDs from the KB upload ledger as `speech_summary` and
   `speech_topics` at **priority 0** (INSERT OR IGNORE on `(rid, task)`). Preserve priority
   100 for nightly discoveries. The existing general discovery path still uses priority
   100; discovery alone would therefore use the steady budget once other backfill drains.
   The four-day estimate assumes T1 is seeded as backfill so DAILY_NEURON_BUDGET applies.

Validation passed locally: 138 tests, TypeScript and Worker deploy dry run. The offline
SQLite test applies the migration over an existing queue row and verifies every field and
index survives. An additional Wrangler **`--local`** migration check failed with a fetch
error, so that extra integration check remains unverified. No KB, Workers AI or
remote D1 calls, push or deployment were performed. Repo changes are confined to `enrich/`.
