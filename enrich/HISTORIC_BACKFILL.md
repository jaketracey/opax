# Historic Hansard enrichment

Only active `kind/speech` resources carrying `source/hansard_hist` enable these rules.
The summariser selects the longest non-summary text field, squashes whitespace and clips
very long text with `text.clip`. The short threshold counts Unicode code points of that
input: **under 200**, rather than 200 or fewer. Both queue tasks finish with `status=done` and
`terminal_reason=skipped-short` before generation, including one-word procedural records. Nothing is removed from the KB.

The summary validator checks personal honorifics, capitalised or uppercase names,
hyphenated and compound names, initials, and surnames in personal or possessive positions. Names supported by the full unit text or the parliamentary
roster pass. Electorates, known places, parties, institutional/law titles and ministerial
portfolios are exempt as whole phrases; institutional words never excuse a titled person.
This is a deterministic recogniser, with limited coverage of
ambiguous isolated capitalised words; the offline audit is specificity evidence, not
personal-name recall or model-output precision.

A name failure discards the summary and permits one corrective escalation. The
`names_rejected` queue flag preserves that allowance across budget/deadline interruptions
and outages. A completed corrective response that still fails validation finishes as
`status=done, terminal_reason=rejected-names`. Accepted topics can finish independently.
Both terminal reasons have `done_at`,
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
stand-in summary fires **3/2,000 (0.15%)**, from names cut by head/tail clipping.

An independent reference selector extracts place/electorate and party mentions,
ministerial titles and bill/act titles from the pilot. Testing those spans in summary-style
prose with source support withheld fires **0/8,135 references (0%)**. The selector stops
before personal honorifics or incomplete subsequent offices, restores split hyphenated
law titles, and excludes ambiguous personal-title fragments mistaken for laws. It corrects
58 spans and replaces nine malformed/ambiguous controls with nine additional source-derived
place/organisation occurrences, selected in pilot order independently of guard results.
There are 8,126 clean original occurrences plus nine replacements, with no resampling.
The review's nine place/organisation examples also pass: **0/9 (0%)**.

| Reference controls | References | Fired |
| --- | ---: | ---: |
| Places/electorates | 4,545 | 0 |
| Parties | 685 | 0 |
| Ministerial titles | 1,956 | 0 |
| Bills/acts | 943 | 0 |
| Additional organisations | 6 | 0 |

These automatically selected controls establish text-only specificity; they do not
measure model-output precision or personal-name recall. Aggregate review evidence is in
`enrich/historic-review-measurements.json`.

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
node scripts/benchmark_migration.ts /tmp/opax-enrich-migration.json
npm test
npx tsc --noEmit
npx wrangler deploy --dry-run
```

The builders accept alternate local roster/portal and staged-directory paths. The asset
contains 5,791 parliamentary name forms, 440 electorate names and 307 portfolio words
(97,308 bytes), derived from the Handbook federation members/electorates/ministries
exports and `portal/public/parliamentarians.json`. It is bundled by Wrangler; no roster D1
table or upload is needed. Handbook members are admitted on verified service. Portal entries
require a pid, a seat/representation record, or dated service in a chamber; speech attendance
and committee witness records do not qualify. The filter admits 1,129 of 1,700 portal entries
and removes 571, including all 260 witness entries flagged in review. The Handbook contributes
1,881 verified members; overlaps are deduplicated as name forms. The census never contacts
KB, Workers AI or D1. The migration benchmark uses an isolated local Miniflare D1 over IPv6;
it does not modify dependencies or use any remote binding.

The review's differential harness is preserved as `scripts/differential_non_historic.mjs`.
Run it against an isolated `origin/main` checkout and this worktree, then compare the output
JSON objects. It covers 13 source labels and 11 scenarios (143 cases), comparing model calls,
KB requests/state, original queue fields, spend, cursors/backoff and tick stats. Only the new
historic metadata columns and counters are excluded. **0 differences** were observed.

## Orchestrator deployment

1. Apply **`enrich/migrations/0002_historic_rules.sql`** to the existing **opax-enrich D1**
   database before deploying the new Worker. This unreleased migration replaces the review's
   table rebuild: it only adds nullable `terminal_reason`, `names_rejected DEFAULT 0` and
   `historic DEFAULT 0`. There is no row copy, table rewrite, CHECK change or index rebuild.
   The original worker remains compatible while the migration goes first.
2. Deploy **opax-enrich** from `enrich/` using its existing `wrangler.jsonc`. Wrangler includes
   `src/historic-names.json` in the Worker bundle. Existing bindings, secrets, budgets, cron
   and live mode apply. No app or portal deployment is needed. Deploy before pushing T1.
3. After pushing historic resources, reconcile the successful slugs from the JSONL push log.
   Set `T1_PUSH_LOG` to that log's absolute path, `OPAX_ENRICH_URL` to the deployed Worker URL,
   and load the existing `ENRICH_ADMIN_TOKEN` into the environment. Run:

   ```sh
   node /home/jake/opax-work/wt/enrich-backfill/enrich/scripts/reconcile_historic.ts \
     --push-log "$T1_PUSH_LOG" \
     --url "$OPAX_ENRICH_URL"
   ```

   An offline preview uses the same command with `--dry-run`; it makes no network requests.
   Each JSONL entry must carry `slug` and a successful `status` (`pushed`, `created`, `updated`,
   `exists`, `ok`, or numeric HTTP 2xx), or `ok: true`. Failed/pending entries are ignored.
   The script deduplicates slugs, submits batches of at most 200 and prints only aggregate
   counts. It calls **`POST /backfill/reconcile`**, body **`{"slugs":["invented-slug"]}`**,
   header **`Authorization: Bearer <ENRICH_ADMIN_TOKEN>`**, using the existing admin auth.

   The Worker resolves slugs through basic metadata and verifies active historic speech
   labels before any batch mutation. It inserts absent summary/topics tasks, then sets
   **priority 0** and the historic marker for unfinished rows: pending, claimed, or saved
   `done/dry` and `done/unwritten` results. Processing state, claims, attempts, results and
   timestamps stay intact. Completed writes, empty/no-text outcomes, quarantines and terminal
   reasons stay intact. Either discovery order works, and re-running the same log is idempotent.
   This also marks any saved results from an older worker before flushing them. Saved results
   from other sources require no full-resource read. Newly generated historic writes reuse
   the text already read for generation; canaries reuse their existing before snapshot.

The additive migration on **480,000 local D1 rows** took **37.45 ms wall time** (D1 reported
**1 ms SQL time** across three ALTER statements, with millisecond resolution). Full original
row hashes and table/index root pages were identical before and after. Old-worker enqueue,
claim and finish statements succeeded against the migrated schema. Timing is local evidence,
not a production latency guarantee.

Validation: 157 tests, TypeScript and Worker deploy dry run. No production KB, Workers AI,
remote D1 calls, push or deployment were performed. Repository changes are confined to
`enrich/`; the staged aggregate report was refreshed in place.
