# Historic Hansard enrichment

Only active `kind/speech` resources carrying `source/hansard_hist` enable these rules.
The summariser selects the longest non-summary text field, squashes whitespace and clips
very long text with `text.clip`. The short threshold counts Unicode code points of that
input: **under 200**, rather than 200 or fewer. Both queue tasks finish with `status=done` and
`terminal_reason=skipped-short` before generation, including one-word procedural records. Nothing is removed from the KB.

The historic summary validator guards against **novel capitalised terms**, without trying
to recognise every personal name. It tokenises capitalised words and maximal runs joined
by spaces, hyphens, apostrophes or `of/de/la/van`; `for/the` preserve office wording and
`and` joins only for declared office/country wording. Each whole candidate must occur in
the full unit text, the parliamentary roster or a permitted whole-term category. NFKC,
case, apostrophes, hyphens, whitespace and grammatical possessives are normalised.
Sentence-initial words are checked except the small common-word/action-verb list.

Permitted categories are the original small non-person list, whole acronyms of two to
six capitals, declared parliamentary/ministerial offices, gazetteered countries and
nationalities, and dictionary words **standing alone**. No word inside a longer candidate
can excuse an unknown token. Multiword dictionary phrases require their own source,
roster or declared whole-phrase support. Arbitrary streets, rivers, institutions and
programs have no structural exemption. New Caledonia now passes as a gazetteered
territory; Bureau of Meteorology and other undeclared institutions still need source text.
See `HISTORIC_VOCABULARY.md` for sources, licences and asset selection.

**Accepted residual:** a surname that is also an ordinary dictionary word can pass when
used alone. Compound names or names attached to dictionary words/offices still fail.
Short uppercase tokens accepted as acronyms are also ambiguous. Conservative rejection
of other unsupported terms remains intentional; the unit stays indexed and readable.

A novelty failure discards the summary and permits one corrective escalation with the
instruction **"use only names that appear in the speech"**. The normal corrective request
also lists every offending term and asks for a meaningful rewrite without them. Terms
remain transient model input: they never enter complaints, logs, samples or D1 rows.
If a budget/deadline/outage interrupts generation, the next tick retains the single
corrective allowance but uses the generic instruction, because terms are not persisted. The
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

The original **200 real Haiku briefs** are pinned to
`/home/jake/opax-staging/federation/bakeoff/haiku-initial-200.jsonl`, SHA256
`bbe95d82b5a1c1998967ab45681c16bf39f01aebe3d90a9b066ee061bd2e4f86`.
The lane's mutable `haiku-200.jsonl` now includes subsequent lane retries, so it is not
used for this comparison. Each initial brief is matched to its full staged pilot unit
and receives the Worker's deterministic cleanup. All 200 remain in the denominator.

The round-three guard rejects **69/200 (34.5%)**, comprising **92 term occurrences and
61 unique terms**. The offline deterministic triage assigns every term as follows:

| Category | Occurrences | Unique terms | Affected briefs |
| --- | ---: | ---: | ---: |
| Acronym / initialism | 1 | 1 | 1 |
| Office / title | 4 | 4 | 4 |
| Country / demonym / nationality | 1 | 1 | 1 |
| Institution / program | 6 | 5 | 6 |
| Dictionary word alone | 46 | 16 | 41 |
| Capitalisation style | 13 | 13 | 10 |
| Likely personal / conservatively unmatched proper term | 21 | 21 | 21 |

Affected-brief counts overlap. Classification checks whole declared offices/geography,
institution/program endings, lexical dictionary membership and dictionary-only styling
phrases outside personal contexts. Unmatched proper terms enter the likely-personal
category conservatively; these are triage categories rather than human-labelled name
precision. Classification never grants guard exemptions, and no terms are emitted.

The new guard rejects **36/200 (18%)** on the same first-attempt outputs, accepting 33
previously rejected briefs. **The under-15% first-attempt target was not reached.** Further
permitting arbitrary multiword dictionary phrases or undeclared institutions/programs
would exceed the permitted categories, so this is the best safe measured point retained.
All seven recent and four earlier invented-name probes still reject: **11/11**.

The offline retry simulation removes sentences containing offending terms only when an
independent brief remains and passes existing validation. **None of these 36 rejections
has a meaningful remainder.** Accordingly, only the first-attempt rate is reported;
there is **no defensible after-retry/terminal estimate**, and the under-5% terminal target
is unverified. No model retry was called. A stubbed generation test confirms that the
corrective request lists offending terms, accepts a rewritten role-based brief, and
keeps diagnostics redacted. Existing tests preserve the single escalation and terminal
`rejected-names` behavior across interruptions.

The fixed 8,135 reference controls reject **29 (0.3565%)** with source support and
**2,060 (25.3227%)** with source withheld. Source-withheld rejections test novelty, rather
than false positives. Full pilot text as its own brief rejects **0/2,000**; clipped input
rejects **7/2,000 (0.35%)**. New Caledonia's gazetteer admission is intentional; the other
13 added place/institution examples still reject without source and all 14 pass with it.

The aggregate results and hashes are in `historic-strict-measurements.json` and
`historic-review-measurements.json`. The 200-unit sample is not a random T1 sample.
The live golden prompt remains SHA256
`44029ec22e9b37b0bf6cdd383b499e62be187f085ec38fb432043f49c4c02b30`.

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
not measured. The new variable-length offending-term retry suffix is not included in
these illustrative escalation inputs. Ordinary validator retries and concurrent nightly spending can add days.
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
   `src/historic-names.json`, `src/historic-words.json`, `src/historic-geography.json`
   and `src/historic-offices.json` in the Worker bundle. Existing bindings, secrets, budgets, cron
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

Validation: 167 tests, TypeScript and Worker deploy dry run; the 143-case live-source
differential again has zero differences. No production KB, Workers AI,
remote D1 calls, push or deployment were performed. Repository changes are confined to
`enrich/`; the staged aggregate report was refreshed in place.
