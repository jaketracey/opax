# Historic Hansard enrichment

Only active `kind/speech` resources carrying `source/hansard_hist` enable these rules.
The summariser selects the longest non-summary text field, squashes whitespace and clips
very long text with `text.clip`. The short threshold counts Unicode code points of that
input: **under 200**, rather than 200 or fewer. Both queue tasks finish with `status=done` and
`terminal_reason=skipped-short` before generation, including one-word procedural records. Nothing is removed from the KB.

The historic summary validator guards against **novel capitalised terms**, without trying
to recognise personal names. It tokenises capitalised words and maximal runs joined by
spaces, hyphens, apostrophes or `of/de/la/van`. Sentence-initial terms are also checked,
except a small list of common English words and the existing prompt's action verbs.
Each whole candidate must occur in the full unit text, the parliamentary roster, or the
closed, reviewed `NON_PERSON_TERMS` list in `src/validate.ts`. Matching uses NFKC,
case folding, apostrophe/hyphen normalisation and whitespace normalisation.

The non-person list covers Australian states/territories and their capital cities,
Parliament/House/Senate/Commonwealth/Australia, parties, months/weekdays and common
parliamentary offices and institutional words. It applies only to the whole candidate:
`Government Quenwick` and `Government Department` cannot inherit an exemption from
`Government`. There are no street, geography, organisation, electorate or law-title
exemptions. Added places and organisations, including New Caledonia and Bureau of
Meteorology, need their own unit-text support. Conservative rejection is intentional;
the unit remains indexed and readable without its machine brief.

A novelty failure discards the summary and permits one corrective escalation with the
instruction **"use only names that appear in the speech"**. The
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

## Strictness measurement

The offline bake-off contains **200 real Haiku briefs** in
`/home/jake/opax-staging/federation/bakeoff/haiku-200.jsonl`. Every brief was matched to
its full unit in the staged pilot and passed through the Worker's deterministic cleanup
before checking the strict guard. No briefs were missing, empty, refused or excluded.
**69/200 (34.5%) would be rejected by the guard. This exceeds the 15% threshold; the
rule has not been loosened.** This measures existing first-attempt outputs, rather than
terminal rejections after a corrective escalation. The sample is not a random T1 sample,
so its rate should not be treated as a precise T1 forecast.

The seven new invented probes and four earlier probes all reject: **11/11**. Fourteen
review place/organisation references (the nine earlier examples plus New Caledonia,
Bureau of Meteorology, New Delhi, Rio de Janeiro and Kings Cross) reject without source
support and all pass with source support.

The fixed pilot reference sample retains **8,135 controls** (8,126 clean original spans
plus nine deterministic replacements; 58 spans corrected). Used as briefs, **31/8,135
(0.3811%)** reject with full source support, and **3,276/8,135 (40.2704%)** reject with
source support withheld. The latter is the cost of prohibiting novel additions, not a
false-positive rate under this policy. Fragment selection and normalised whole-term
matching also limit what the supported control rate establishes. Complete pilot text
checked as its own brief rejects **0/2,000**; clipped model text rejects **8/2,000 (0.4%)**.

| Reference controls | References | Source supported rejects | Source withheld rejects |
| --- | ---: | ---: | ---: |
| Places/electorates | 4,545 | 18 | 1,489 |
| Parties | 685 | 0 | 0 |
| Ministerial titles | 1,956 | 0 | 838 |
| Bills/acts | 943 | 13 | 943 |
| Additional organisations | 6 | 0 | 6 |

`historic-strict-measurements.json` contains aggregate results and input hashes;
`historic-review-measurements.json` retains migration/differential evidence alongside
updated guard and roster counts. Neither report contains people, speech text, briefs,
selected terms or prompts. The live combined prompt remains byte-identical to its golden
fixture, SHA256 `44029ec22e9b37b0bf6cdd383b499e62be187f085ec38fb432043f49c4c02b30`.

## Neuron estimate

**170,982** units remain after short skips; none additionally fail the existing three-word
minimum. The estimate calls `src/budget.ts:neuronsFor` with the actual historic system and
clipped record-message lengths, **3.5 JS characters per input token**, and the existing
bake-off mean of **620 output tokens including thinking**. One primary call produces both
summary and topics. KB resource IDs are estimated as 32 characters. All units are assumed
to need both tasks. Tokenizer/schema framing and nightly spend are excluded.

| Scenario | Neurons | Days at 1.5M/day | Whole budget days |
| --- | ---: | ---: | ---: |
| One primary call per eligible unit | 5,028,655 | 3.35 | 4 |
| Plus name escalation for 1% of units | 5,185,585 | 3.46 | 4 |
| Plus name escalation for 5% of units | 5,813,306 | 3.88 | 4 |
| Every unit needs a name escalation | 20,721,675 | 13.81 | 14 |
| Primary calls all reach 4,000 output tokens | 22,640,742 | 15.09 | 16 |

Escalation scenarios use the same output-token assumption; their rates are illustrative,
not measured. Ordinary validator retries and concurrent nightly spending can add days.
At the existing steady budget of 150,000/day, the baseline would require 33.52 budget days.

## Reproduce locally

From `enrich/`, with Node 24 and dependencies installed:

```sh
node scripts/build_historic_names.ts
node scripts/measure_historic.ts
node scripts/measure_historic.ts --pilot-audit
node scripts/measure_strict_guard.ts
node scripts/benchmark_migration.ts /tmp/opax-enrich-migration.json
npm test
npx tsc --noEmit
npx wrangler deploy --dry-run
```

The roster builder accepts positional local paths for the Handbook directory, portal
export, cached official snapshots and dated member SQLite database. Defaults are the
staged Handbook roster, `portal/public/parliamentarians.json`,
`scripts/roster_state_evidence.json` and `/home/jake/.cache/autoresearch/parli.db`.
The database is opened read-only. A missing evidence source fails the build rather than
silently dropping verified forms.

The bundled asset contains **5,835 parliamentary name forms (90,101 bytes including
newline)**. The Handbook contributes 1,881 verified members. Portal entries first qualify
through a pid, seat/representation record, or dated chamber service. Entries with incomplete
portal metadata are additionally matched to cached official parliamentary member snapshots
**and** canonical member records with dated service, matching state, chamber and full/alias
forms. Historical service qualifies even if a cached end date precedes a later snapshot:
this is an all-time roster, rather than a current-member list.

This restores **27 verified NSW directory entries**, adding their 27 full forms and 17
surname forms: 44 forms total. It admits 1,156 of 1,700 portal entries and excludes 544,
including all **260 unverified witness entries** flagged in review. Speech attendance and
committee witness records do not establish membership. Overlaps are deduplicated.
Only parliamentary names are shipped to the Worker. The 440 electorate names and 307
portfolio words used to select the fixed offline controls are separate, script-only
`historic-control-vocabulary.json`; they cannot become guard exemptions.

No roster D1 table/upload is needed. The census and strictness measurement never contact
KB, Workers AI or D1. The unchanged migration benchmark uses isolated local Miniflare D1
over IPv6 and never uses a remote binding.

The review's differential harness is preserved as `scripts/differential_non_historic.mjs`.
Run it against an isolated `origin/main` checkout and this worktree, then compare the output
JSON objects. It covers 13 source labels and 11 scenarios (143 cases), comparing model calls,
KB requests/state, original queue fields, spend, cursors/backoff and tick stats. Only the new
historic metadata columns and counters are excluded. **0 differences** were observed again across all 143 cases against `origin/main` at
`108bbdd0`.

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

Validation: 162 tests, TypeScript and Worker deploy dry run. No production KB, Workers AI,
remote D1 calls, push or deployment were performed. Repository changes are confined to
`enrich/`; the staged aggregate report was refreshed in place.
