# Hansard gaps — 14 November 2026

**The reported Senate hole is real in the local snapshot: 2018-02-09–2019-06-30 has zero plenary speech rows and at least 56 proven sitting days. OpenAustralia served the Senate XML for 2018-02-12, containing 362 speech elements.** This is an acquisition/ingestion gap, not evidence that Hansard was never published. The current missing-day backfill refuses dates before 2019, so it cannot repair the 2018 portion without a code change.

There are larger local holes: Senate 2014–2022, Senate 2024, House 1993–1997, NSW 2023–2024, and much of the historical Senate. Federation Chamber turns are also misclassified as House turns. These are **local-snapshot findings**. Main's newer aggregate exports demonstrate additional holdings, but do not contain a complete speech-by-day index with which to certify every live gap.

This is a bounded census, not a complete historical sitting-calendar audit. The repo publishes only the 2026 federal calendar. Cached historical inventory covers 1901–2005; later division dates and cached source calendars establish additional lower bounds. Complete federal 2006–2025 and state calendars are absent. A 403 on the third source probe stopped further source requests, including the planned state probes. Unknown expected-day counts and unverified licences remain explicitly unknown below.

## Snapshot and reproducibility

Measured `/home/jake/.cache/autoresearch/parli.db`, opened only with `?mode=ro` and `PRAGMA query_only=ON`. Its file modification time is **2026-11-10 10:23:44 UTC / 21:23:44 AEDT**, size **28,851,892,224 bytes**, with **1,316,517 speech rows including committees**. That is a filesystem snapshot date, not a claim that acquisition was current on 10 November. Its total agrees with the source used in the [13 October backfill rehearsal](2026-10-13-federal-hansard-backfill.md). File size and nanosecond modification time were unchanged across this audit.

Measured worktree base: `fdba7591835bd9937da77d6417a29dd27879f312` (`origin/main` when this lane opened, 14 November). Shared remote refs can advance independently; the receipt pins the measured base and actual export hashes. The [cross-check receipt](2026-11-14-hansard-gaps/main-cross-check.json) pins the commit, export hashes, manifest dates, source counts and sample people. No remote corpus, KB, D1 or production database was queried or modified. No SSH was used. Source probes used `opax-improve-audit`, serially, more than one second apart, without redirects or retries. Neither `www.aph.gov.au` nor ParlInfo was requested. Processes ran at niceness 10; observed load5 stayed below 40, and database scans abort at 40.

Reproduce offline, using the existing local caches:

```sh
nice -n 10 python3 scripts/audit/hansard_gaps.py \
  --db /home/jake/.cache/autoresearch/parli.db \
  --cache-root /home/jake/.cache/autoresearch \
  --as-of 2026-11-14 \
  --out /tmp/hansard-gaps-recheck
nice -n 10 python3 -m unittest tests.test_hansard_gaps tests.test_sitting_days
```

The [audit program](../../scripts/audit/hansard_gaps.py) makes no network calls and writes only its output directory. The existing caches are required; the command does not acquire missing inputs.

Committed measurement files:

| File | Contents |
| --- | --- |
| [annual.csv](2026-11-14-hansard-gaps/annual.csv) | Every year from each chamber's earliest held year through 2026, including empty years; all-source and individual-source counts. ACT starts at main's advertised 2024 boundary; Federation starts at the input's 1998 boundary. |
| [speech-days.csv](2026-11-14-hansard-gaps/speech-days.csv) | Stored and public-candidate row counts per chamber, date and source. |
| [expected-days.csv](2026-11-14-hansard-gaps/expected-days.csv) | Deduplicated date evidence: calendar, historical inventory, source input, division or existing transcript. |
| [gaps.csv](2026-11-14-hansard-gaps/gaps.csv) | All 59 runs of at least five missing dates in the available evidence sequences, by source/scope, with cause, plan key and rough row estimate. |
| [thin-days.csv](2026-11-14-hansard-gaps/thin-days.csv) | Every positive day below 10% of its chamber's median, for stored rows and separately public candidates. |
| [calendar-unknown-intervals.csv](2026-11-14-hansard-gaps/calendar-unknown-intervals.csv) | Calendar intervals of 120+ days without rows, for triage only; election recesses are deliberately not adjudicated. |
| [filtered-days.csv](2026-11-14-hansard-gaps/filtered-days.csv) | Occupied source-days with zero public candidates after the existing gates. |
| [zenodo-days.csv](2026-11-14-hansard-gaps/zenodo-days.csv) | Original input counts by date and `fedchamb_flag`, including 50/200-character floors. |
| [measurement.json](2026-11-14-hansard-gaps/measurement.json), [focus receipt](2026-11-14-hansard-gaps/focus-2018-senate.json) | Snapshot identity, input hashes, medians, limitations, and all 56 proven dates in the reported Senate interval. |
| [probes.json](2026-11-14-hansard-gaps/probes.json), [local parse probes](2026-11-14-hansard-gaps/local-parse-probes.json) | Exact request/status receipts and five offline historical parser checks. No speech bodies are committed. |

## What the denominators mean

`expected_days` in the annual CSV is populated only for the historical federal inventory and the 2026 federal calendar. `held_calendar_days` is the intersection with that calendar/inventory. Elsewhere the denominator is blank, and `known_expected_days` is a lower bound, not a coverage percentage. Stored transcript dates establish positive coverage but cannot reveal an entirely unobserved sitting. Division dates prove a sitting; an absence of divisions proves nothing. Cached NSW 2026 dates may themselves be stale. The historical inventory includes its 29 documented missing-source dates, so those are not silently removed from the denominator.

Gap runs are consecutive **expected/evidenced dates**, crossing weekends and recesses. For incomplete calendars an intervening unknown sitting could split a reported run; these are labelled `lower_bound_sequence`, not certified exhaustive runs of the complete calendar. The date bounds in the table are the first and last missing evidenced dates, not every calendar day in between. The known-date list and daily counts permit independent recomputation. `all` means no source has a plenary row; committees never fill a chamber's plenary gap. Source comparisons respect the known acquisition windows: historical XML through 2005; Zenodo 1998–2022; OpenAustralia from 2006.

Public candidates apply the actual `arag_sync` date cutoff (1993-03-13), 200-character floor, P1–P7 procedural rules, blanket `wragge_xml` exclusion, and House/OpenAustralia-on-Zenodo-date exclusion. They are measured **before exact-body deduplication, identity/profile gates and live indexing**. Their 616,820 rows include committee candidates; they must not be compared directly with main's published speech total. The raw and candidate counts answer different questions.

## Chamber coverage

These are local stored plenary rows, with committees excluded. Expected-day coverage by year is in `annual.csv`; no unavailable state denominator is represented as 100% coverage.

| Chamber | First held | Last held | Rows | Held dates | Whole-chamber median rows/day |
| --- | --- | --- | ---: | ---: | ---: |
| House | 1901-05-09 | 2026-09-17 | 715,880 | 7,236 | 43 |
| Senate | 1901-05-09 | 2026-09-17 | 109,226 | 3,139 | 28 |
| Federation Chamber | No distinct DB chamber | — | 0 labelled | 0 labelled | Unknown |
| NSW Assembly | 2015-05-05 | 2026-09-24 | 72,676 | 454 | 140 |
| NSW Council | 2015-05-05 | 2026-09-24 | 47,824 | 411 | 110 |
| Victorian Assembly | 2018-02-06 | 2026-09-24 | 45,976 | 367 | 124 |
| Victorian Council | 2024-03-21 | 2026-09-24 | 15,265 | 129 | 118 |
| SA Assembly | 2020-02-05 | 2024-11-12 | 42,515 | 151 | 260 |
| SA Council | 2020-02-05 | 2023-05-17 | 26,467 | 152 | 159 |
| Queensland Assembly | 2024-02-14 | 2026-09-16 | 17,723 | 64 | 275 |
| ACT Assembly | Absent in this snapshot | — | 0 | 0 | Unknown |

For 2026 through 14 November, the official calendar expects **64 House and 49 Senate days**. The snapshot holds **56/64 House and 45/49 Senate days**. House lacks 12–15 and 26–29 October; Senate lacks 12–15 October, a four-day run below the requested five-day reporting threshold. Future sittings from 16 November are excluded. Main's manifest says federal Hansard is current through 29 October, so these October deficits should be checked on the owner snapshot before scheduling any repair.

WA, Tasmania and NT have no held plenary speech series in this snapshot or main's speech source manifest. They are outside “each state chamber held”; their absence is not hidden behind a fabricated historical sitting count. The Victorian Council has no local series before March 2024 despite the combined Victorian source advertising 2018 onward.

## Gap table

Equivalent all-source and individual-source runs are combined in this display; the CSV retains all 59 scope-specific rows. `≥` denotes incomplete-calendar evidence. “Held” is within the named scope; parentheses report days covered by another source. Plan keys below explain the cause, permitted source/licence and implementation for every row.

| Chamber | Source/scope | From | To | Expected/evidenced days | Held | Cause / plan |
| --- | --- | --- | --- | ---: | --- | --- |
| Federation | all + zenodo | 1998-03-04 | 2022-09-08 | 1,151 input dates | 0 | Federation flag discarded; **F** |
| House | all + wragge_xml | 1981-03-03 | 1981-04-08 | 14 | 0 | SGML parse failures (sampled); **H** |
| House | all + wragge_xml | 1981-04-28 | 1981-09-16 | 29 | 0 | SGML parse failures (sampled); **H** |
| House | all + wragge_xml | 1981-09-22 | 1982-03-09 | 21 | 0 | SGML parse failures (sampled); **H** |
| House | all + wragge_xml | 1982-03-11 | 1982-03-23 | 5 | 0 | SGML parse failures (sampled); **H** |
| House | all + wragge_xml | 1982-03-25 | 1982-05-06 | 10 | 0 | SGML parse failures (sampled); **H** |
| House | all + wragge_xml | 1982-09-07 | 1982-10-12 | 10 | 0 | SGML parse failures (sampled); **H** |
| House | all + wragge_xml | 1982-10-20 | 1982-10-28 | 5 | 0 | SGML parse failures (sampled); **H** |
| House | all + wragge_xml | 1982-11-10 | 1984-04-02 | 66 | 0 | SGML parse failures (sampled); **H** |
| House | all + wragge_xml | 1984-04-04 | 1985-03-22 | 48 | 0 | SGML parse failures (sampled); **H** |
| House | all + wragge_xml | 1985-03-26 | 1988-03-22 | 219 | 0 | SGML parse failures (sampled); **H** |
| House | all + wragge_xml | 1988-04-21 | 1988-06-03 | 13 | 0 | SGML parse failures (sampled); **H** |
| House | all + wragge_xml | 1988-10-12 | 1989-02-28 | 22 | 0 | SGML parse failures (sampled); **H** |
| House | all + wragge_xml | 1989-03-02 | 1989-05-04 | 15 | 0 | SGML parse failures (sampled); **H** |
| House | all + wragge_xml | 1989-05-09 | 1989-05-30 | 8 | 0 | SGML parse failures (sampled); **H** |
| House | all + wragge_xml | 1989-09-06 | 1989-11-27 | 16 | 0 | SGML parse failures (sampled); **H** |
| House | all + wragge_xml | 1989-11-29 | 1990-06-01 | 13 | 0 | SGML parse failures (sampled); **H** |
| House | all + wragge_xml | 1990-09-19 | 1990-10-11 | 5 | 0 | SGML parse failures (sampled); **H** |
| House | all + wragge_xml | 1990-10-16 | 1991-01-21 | 16 | 0 | SGML parse failures (sampled); **H** |
| House | all + wragge_xml | 1991-02-12 | 1991-02-21 | 7 | 0 | SGML parse failures (sampled); **H** |
| House | all + wragge_xml | 1991-03-06 | 1991-06-21 | 29 | 0 | SGML parse failures (sampled); **H** |
| House | all + wragge_xml | 1991-09-04 | 1997-12-06 | 413 | 0 | SGML parse failures (sampled); **H** |
| House | openaustralia | 2014-02-11 | 2022-12-15 | ≥536 | 0 (522 other-source dates) | 522 covered + 14 un-ingested; **A** |
| House | all | 2022-09-26 | 2022-12-15 | ≥14 | 0 | Not ingested locally; **A** |
| House | zenodo | 2022-09-26 | 2022-12-15 | ≥14 | 0 | Finite Zenodo series ended; **A** |
| House | all + openaustralia | 2023-05-24 | 2023-12-07 | ≥31 | 0 | Not ingested locally; **A** |
| House | all + openaustralia | 2024-02-07 | 2025-02-06 | ≥57 | 0 | Not ingested locally; **A** |
| House | all + openaustralia | 2026-10-12 | 2026-10-29 | 8 | 0 | Not ingested locally; **A** |
| Senate | all + wragge_xml | 1953-02-18 | 2005-12-09 | 3,474 | 0 | Partial ingest + SGML failures; **W** |
| Senate | all + openaustralia | 2014-02-11 | 2022-12-15 | ≥419 | 0 | Not ingested locally; **A** |
| Senate | all + openaustralia | 2023-05-11 | 2025-02-06 | ≥101 | 0 | Not ingested locally; **A** |

The 2018-02-09–2019-06-30 focus interval is contained in the larger local Senate run: **≥56 expected days, 0 held**, first evidenced missing day 12 February 2018 and last 3 April 2019. The exact 56-date list is committed. The first-day XML probe proves source material exists there; one probe does not prove that every missing day's XML exists.

## State intervals whose expected-day count is unknown

These are material acquisition suspects, not five-day runs certified against a full state calendar. Importer code has no rule intentionally excluding these years. A later access refusal cannot by itself explain an earlier, chamber-specific stop. The acquisition log necessary to distinguish an unfinished run from an earlier parser failure is not held here.

| Chamber | From | To | Expected days | Held days | Cause / plan |
| --- | --- | --- | --- | ---: | --- |
| NSW Assembly | 2022-11-17 | 2024-11-21 | Unknown | 0 | Uningested in snapshot; API has a historical year-discovery path. **N** |
| NSW Council | 2022-10-21 | 2025-02-10 | Unknown | 0 | Same; no Council rows in either 2023 or 2024. **N** |
| Victorian Assembly | 2018-02-09 | 2018-09-03 | Unknown | 0 | Unfinished acquisition or discovery/parse failure; no receipt identifies which. **V** |
| SA Assembly | 2023-05-17 | 2024-02-05 | Unknown | 0 | Earlier unfinished acquisition/parser failure; not explained by the later WAF pause. **S** |
| SA Assembly | 2024-06-05 | 2024-11-11 | Unknown | 0 | Same; only three dates held in all of 2024. **S** |
| SA Assembly | 2024-11-13 | 2026-11-14 | Unknown | 0 | Current source access paused; no new direct acquisition. **S** |
| SA Council | 2023-05-18 | 2026-11-14 | Unknown | 0 | Earlier partial ingest plus later access pause; combined SA last-date label conceals the Council stop. **S** |
| Queensland Assembly | 2024–2026 | Through 2026-11-14 | Unknown | 64 occupied dates overall | Sparse series, 20/27/17 held dates per year; API pause is documented, but missing sitting count is unmeasured. **Q** |
| ACT Assembly | 2024–2026 | Through 2026-11-14 | Unknown | 0 locally | Snapshot/export mismatch: main already advertises 9,964 ACT documents. **T** |

The full 120-day candidate CSV includes election recesses, for example NSW November 2018–May 2019. Those intervals are not asserted to be missing sittings. Shorter unobserved state runs cannot be excluded without the missing calendars.

## Causes and source/licence evidence

The relevant registry is [AUSTRALIAN_OPEN_DATA_SOURCES.md](../../AUSTRALIAN_OPEN_DATA_SOURCES.md), [STATE_DATA_SOURCES.md](../../STATE_DATA_SOURCES.md), [COVERAGE.md](../COVERAGE.md), [VOTES.md](../VOTES.md), and the newer [SOURCES-ACCESS.md](../SOURCES-ACCESS.md). The March survey's “working/excellent” assessments do not supersede the October/November access pauses.

| Plan | Source and exact existing route/pattern | Licence and probe result |
| --- | --- | --- |
| **A** | OpenAustralia XML: `https://data.openaustralia.org.au/scrapedxml/{representatives_debates,senate_debates}/{YYYY-MM-DD}.xml`; identity mappings under `/members/{people,representatives,senators}.xml`. | Registry finding: underlying parliamentary material **CC BY-NC-ND 3.0 AU**; newer APH registry entries refer to **4.0**. Preserve Commonwealth/OpenAustralia attribution; no new version-specific licence grant was verified in the XML. **200**, 755,985 bytes for [Senate 2018-02-12](https://data.openaustralia.org.au/scrapedxml/senate_debates/2018-02-12.xml), SHA-256 in receipt. Confirms this date and 362 speech elements, not blanket period completeness or a freshly verified licence. |
| **F** | Already-held Zenodo ZIP: `hansard/hansard-corpus.zip`, entry `hansard-corpus/hansard_corpus_1998_to_2022.csv`. Existing loader's parquet entry is also in the ZIP. | **Remote accession and deposited licence are not pinned in the repo/cache.** The single [Zenodo metadata probe](https://zenodo.org/api/records?q=%22hansard_corpus_1998_to_2022%22&size=1) returned **200 with zero hits**. It did not verify a record or a licence. No exact remote download URL can honestly be certified; pin the original accession and its `files[].links` before any new acquisition. Local input proves 1998–2022 House/Federation content, not Senate coverage. The generic parliamentary CC BY-NC-ND finding is not a substitute for the deposit's licence. |
| **H, W** | Existing local historical files: `hansard/hansard-xml/{hofreps,senate}/{YYYY}/{filename}.xml`; sitting inventory and `missing.csv` alongside them. | Cached publisher README says **CC BY-NC-ND**, without pinning the version; original APH links are retained as provenance only and were never fetched. No new remote source is proposed. Five offline parse checks are committed. A missing remote file would remain a source gap, not permission to use another host. |
| **D** | They Vote For You: `https://theyvoteforyou.org.au/api/v1/divisions.json?house={representatives,senate}&start_date={YYYY-MM-DD}&end_date={YYYY-MM-DD}&key={key}`; detail `/api/v1/divisions/{id}.json?key={key}`. Existing 498 monthly list-cache files supply division dates. | Registry finding: **ODbL** for TVFY's database, underlying Hansard rights separate. [Licence-page probe](https://theyvoteforyou.org.au/help/licencing) returned **403 / “Just a moment…”**. No retry, authenticated workaround or alternate route. **All subsequent source probes stopped. Divisions can corroborate sitting dates; they cannot replace speeches.** No API key was used or recorded. |
| **N** | NSW official open-data API: `https://api.parliament.nsw.gov.au/api/hansard/search/year/{YYYY}`, `/daily/tableofcontents/{TocDocId}`, `/daily/fragment/{uid}`. | Registry finding: **CC BY 3.0 AU**, “September 1991 to present” in the NSW Hansard API catalogue. Planned one-request catalogue check was not sent after TVFY's refusal. Historical availability and current terms were not freshly verified. |
| **V** | Victoria: `https://www.parliament.vic.gov.au/api/search/debate?page={N}&pageSize=20&hansard-house={10,20}`; linked Hansard detail pages/PDF URLs, not guessed PDF IDs. | Rights reserved / **specific reuse permission**, recorded as approved 13 October in SOURCES-ACCESS: fair, accurate, non-misleading presentation and free public access. Not a CC licence. No fresh probe after the refusal. |
| **S** | SA: `https://hansardsearch.parliament.sa.gov.au/search/calendar/{YYYY}`, `/daily/{lh,uh}/{YYYY-MM-DD}/download/toc`, `/daily/{lh,uh}/{YYYY-MM-DD}/extract/{ref}/download`. | **Reuse licence unverified.** Source access remains paused for HTTP 403/WAF; 12 October response did not grant access. No fresh probe after the refusal, no alternate-host/challenge workaround. |
| **Q** | QLD: `https://data.parliament.qld.gov.au/api/tabledpaper?page={N}&pageSize=200&api-version=v1` (`isSittingDay` records) for discovery; Hansard `https://documents.parliament.qld.gov.au/events/han/{YYYY}/{YYYY_MM_DD}_A.PDF` and `_WEEKLY.PDF`. | Open-data API **CC BY 4.0** does **not** license Hansard text. Registry says parliamentary Hansard is excluded from the site's general CC BY-NC-ND 3.0 AU grant; permission basis must be established. API access is paused. No fresh probe or PDF fallback after refusal. |
| **T** | ACT: `https://www.hansard.act.gov.au/hansard/{Nth}-assembly/{YYYY}/debates(PDF).htm`; linked `PDF/{YYYYMMDD}.pdf`, proof `P{YYMMDD}.pdf` / `tP{YYMMDD}.pdf`. | Registry finding: **CC BY-NC-ND 4.0**, attribution to ACT Legislative Assembly, unaltered non-commercial sharing; [existing ACT source note](../DATA-ACT-HANSARD.md). No fresh probe after refusal. |

The permitted source families have been assessed, but the requested fresh period-and-licence confirmation is **incomplete**: one XML success, one unsuccessful metadata search, then one refusal. Probe receipts distinguish that outcome from an absence of source material. No unverified licence is promoted to an approval.

Historical causes are supported by [wragge_xml.py](../../parli/ingest/wragge_xml.py): it parses with ElementTree, strips a DOCTYPE as a retry, and returns an empty list on further parse failure. Sample 1981 House and 1993 House/Senate SGML files fail; sample 1953 and 2005 Senate XML files produce 38 and 67 rows. The cached files exist, so the multi-decade Senate hole is not simply a source outage. The unrecorded run boundary prevents proving why the otherwise parsable Senate input stopped being loaded after 1952.

The public sync's blanket historical-source exclusion is separate. [arag_sync.py](../../parli/ingest/arag_sync.py) excludes every `wragge_xml` row, even though the comment describes overlapping House 1998–2005. Loading missing Senate 1993–2005 would therefore still publish nothing until that rule is narrowed. Dates before 1993-03-13 remain outside the current public corpus by deliberate policy.

The Federation defect is in [speeches.py](../../parli/ingest/speeches.py): the Zenodo input has `fedchamb_flag` but no `chamber` field; the loader detects only `chamber`/`house` and defaults to `representatives`. The intact ZIP contains **80,836 flagged turns on 1,151 dates**, of which **64,085 meet the loader's 50-character floor and 50,788 meet the public 200-character floor**. This proves misclassification; it does not prove 80,836 additional missing texts. The separately extracted parquet file in this cache is truncated (29,949,952 bytes; no footer), so this audit streamed the intact ZIP's CSV instead.

## Repair plan — future lane only

Sizes: **S** = bounded audit/configuration work with an existing adapter; **M** = adapter extension and staged reconciliation; **L** = historical parsing/identity work or an unresolved access/rights dependency. Row figures are planning estimates, not insertion promises. The CSV's per-run estimate is `net known missing dates × whole-chamber stored median` (43 House, 28 Senate); old and modern segmentation differ substantially. Overlapping source/all rows must never be summed.

| Key | Implementation / command path | Row-count estimate and identity/party work | Size |
| --- | --- | --- | --- |
| **A** | Extend `federal_backfill.run()`'s hard `2019-01-01` lower bound to the reviewed 2006 boundary, add chamber selection and an explicit source-day manifest. Keep zero-row discovery across **all** sources, immutable GID/citation reconciliation and occupied-day holds. Re-measure on the owner snapshot first. Existing command below handles only 2019–2025. | Focus interval: about **15.5k stored / 10.5k publishable turns for 56 days**, scaling 277/188 turns per missing day from the prior Senate staging run; actual calendar and XML could change both. Local larger Senate 2014–2022: ≥419 days, rough CSV 11,732 rows with the much lower historical median; treat that as triage, not the modern XML budget. Existing 2019–2025 rehearsal provides a stronger baseline: **403 days, 108,173 rows / 74,880 documents**, already a separate measured plan, not new work to blindly repeat on main. Use dated OpenAustralia office/person/chamber membership; preserve unknown identities and conflict holds. | M |
| **H** | Add SGML-capable parsing/normalisation before ElementTree, with representative 1981/1993 fixtures and explicit error receipts; add `--start/--end/--chamber/--stage-db` to the historical loader. Rehearse from **already-held** files; no acquisition required. All 21 historical House runs in the table map here. | The ≥5-day runs total **984 missing inventory days**; rough raw triage **42,312 rows**. Public-policy scope is **329 expected House days from 1993-03-13–1997**, roughly **14,147 rows** at the historical median. Earlier repairs are collection-only under the current cutoff. Resolve printed names against own-chamber service intervals and electorate, not modern namesakes. Historical parties need contemporaneous source/service evidence. | L |
| **W** | Resume/repair the historical Senate loader from cached files, with parser-failure inventory. Then narrow the `wragge_xml` exclusion to actual overlapping House dates; deduplicate by stable provenance/body, not the source name. | **3,474 missing inventory days** in the long run, roughly **97,272 raw rows**. Of these, **862 days fall on/after the public cutoff**, roughly **24,136 rows**. Later parsed samples prove some data is immediately recoverable, but SGML needs H. Handbook party evidence currently scoped to 2006+ cannot date a 1990s senator's affiliation; leave missing party/identity evidence unresolved. | L |
| **F** | Retain `fedchamb_flag`, original input ID and logical chamber; match existing Zenodo rows by original ID or exact dated body before relabelling metadata. Preserve citation IDs. Add explicit Federation Chamber handling to filters, counts and exports, including pre-renaming Main Committee records. Verify API/XML House/Federation provenance before separating later turns. | **0 assumed new speeches**. Up to **64,085 loader-eligible input turns** require matching/classification; **50,788** pass the length floor before other public gates. Do not append duplicates or move the whole House sitting. Party/person follows the original dated House membership, not a new Federation roster. Pin the Zenodo accession/licence before acquiring any replacement file. | M |
| **O** | Keep verified House overlap exclusions, compare occupied days to full XML without appending unmatched turns automatically. | **0 new rows** on dates fully covered by Zenodo; OA's 2014–2022 source run includes **522 covered dates plus 14 net missing dates**, the latter repaired through A. | S |
| **N** | Produce a per-chamber source calendar first. Stage `nsw_hansard --start 2022-10-21 --end 2025-02-10 --no-resume`, bounded to confirmed missing days, using the existing TOC/fragment adapter. Retain member IDs, fragment IDs and errors; a year discovery error must not look like successful completion. | Calendar count unknown. Capacity scenario using ~50 dates/year and stored medians: **~14k Assembly / ~13k Council rows** for the long holes. Confirm calendars before using these figures. Resolve NSW source member IDs, own-chamber service dates and initials; reuse dated state evidence, not today's roster party. | M |
| **V** | Add `--until` and missing-day scope to `vic_parliament`; stage `--house la --since 2018-02-09` with the reviewed end **2018-09-03** after the new bound exists. Check zero-count progress receipts rather than treating every attempted day as complete. Inventory Council's pre-2024 boundary separately. | Calendar count unknown. A 25-day pilot budget would be **~3,100 rows** (25×124), not a verified missing total. Retain source entry/PDF identity, dated chamber service and full-name matches; apply the recorded reuse conditions. | M |
| **S** | Keep acquisition paused. After a permitted source/calendar route and reuse terms are established, stage `sa_hansard --since 2023-05-17 --until 2026-11-14 --chamber sa_ha --no-resume` and the Council equivalent from **2023-05-18**. Record each chamber's TOC separately; an either-house calendar is not proof both chambers sat. | Unknown missing days; budget formula **D_Assembly×260 + D_Council×159 rows**. Illustrative 50-day years imply up to ~39k Assembly rows over 2024–2026 and ~28k Council rows over 3.5 years; recesses, sparse held days and actual calendars must be subtracted first. Resolve initial/surname prints by dated SA chamber service; never infer that an older SA print belongs to a current federal namesake. | L |
| **Q** | Keep the API pause and separate API/Hansard rights. Inventory official sitting/PDF links when permitted; only then stage `qld_parliament --hansard-only --start 2024-02-14 --end 2026-11-14`. Add missing-day manifest controls; no fallback around refused discovery. | **D_missing×275 rows**, where D is currently unknown. Do not infer all calendar weekdays or assume the 64 occupied dates cover three full years. Use QLD source roster IDs plus dated surname/electorate disambiguation; party groups printed on that sitting can be retained as source evidence. | L |
| **T** | Obtain the correct owner snapshot/export day receipt and audit the existing ACT `act_hansard_days` table; use `act_hansard --start ... --end ...` on a separate stage only for verified residual days. | **0 new rows justified by this desktop's absence**: main already has 9,964 ACT documents. Initial party values intentionally remain null; use dated ACT evidence for later fills, and preserve proof/final/citation reconciliation. | S |
| **D** | Use the existing TVFY cache to corroborate dates. Any future division refresh stays in the existing division adapter and licence regime, after the refusal is cleared. | **0 speeches**; votes/participations are not speech estimates. Use existing dated federal affiliation rules for division labels. | S |

Example of the **existing staging-only command**, for a later authorised acquisition lane and a correct owner-snapshot copy. It was **not run here**; it cannot handle 2018 until A changes the validated bound:

```sh
nice -n 10 python3 -m parli.ingest.openaustralia_xml \
  --backfill-missing-days --dry-run \
  --db /path/to/owner-snapshot.sqlite \
  --start 2019-01-01 --end 2025-12-31 --max-days 1000 \
  --stage /tmp/hansard-missing-days-stage \
  --cache-dir /path/to/existing/oa-feed
```

State command fragments above likewise require `OPAX_DB=/path/to/separate-stage.sqlite`, acquired calendars, the existing honest transport and their current access/licence status. The older adapters' advertised `--dry-run` flags are not a substitute for isolation: some initialise schema/progress before entering a dry-run branch. This lane runs none of them.

Across A/H/W/F/N/V/S/Q/T, reuse the **dated** evidence already in [vote_parties.py](../../scripts/vote_parties.py), [roster_service.json](../../scripts/roster_service.json), [roster_accept.json](../../scripts/roster_accept.json), [roster_state_evidence.json](../../scripts/roster_state_evidence.json), [handbook_party_service.json](../../scripts/handbook_party_service.json), and [roster_identity.py](../../scripts/roster_identity.py). These rules are currently wired primarily to vote/profile exports: speech ingestion needs a shared dated-resolution adapter, not a call that rewrites vote pages. Require own chamber and `start ≤ speech date < end`, honor observed-through bounds, conflicting evidence and reviewed holds, preserve source party separately, and leave unresolvable affiliation null. In particular, the existing NXT/Centre Alliance rename boundary is 10 April 2018. Chair offices are roles, not parties. Never fill historical speeches with today's affiliation.

For thin **occupied** days, use the held-day reconciliation path, not the zero-row loader. The [prior partial-day list](2026-10-13-federal-hansard-partial-days.csv) and backfill report already hold 304 occupied days with unmatched XML; those are candidates, not 52,347 guaranteed new speeches. A whole-day comparison must preserve every existing citation and distinguish alternate source segmentation from missing turns. Size **M**, **0 automatic insertions**, row total determined by adjudicated unmatched turns.

Finally, add a read-only coverage check to the normal refresh: retain versioned chamber/year source-day manifests; alert on a five-day zero-row run and on each positive day below the strict 10% chamber-median threshold. Record source refusals and expected-calendar unknowns separately. A successful recent rolling window must not reset a historical coverage alarm. No scheduling or production changes are made in this lane.

## Thin days and main cross-check

There are **145 thin stored days**, using each chamber's median over all its occupied dates, with zero days handled as gaps. This intentionally gives House a historical median of 43 rather than a modern-only median. There are **29 additional flags in the separately measured public-candidate metric**; the metrics overlap and should not be added as distinct days. A thin day can be a genuine short/ceremonial sitting, so the flag alone does not prove missing text.

Recent stored examples: NSW Council **2016-05-03: 2 rows; 2021-09-14 and 2022-09-13: 9 each** (median 110); QLD **2024-11-27: 9** (275); House **2026-01-19: 3** (43); Senate **2023-02-06: 2** (28). SA Assembly/Council both have **2 rows on 2023-03-26**; check source dating as well as completeness. All dates, ratios and both metrics are in the committed CSV.

Main's `corpus.json` is version **2026-11-14**, last refresh check **2026-11-13T19:09:13Z**, and reports **964,517 collected speech resources**. Source comparisons below use local public candidates, not raw table totals; exact dedupe and later source additions still prevent treating differences as exact additions:

| Source | Local candidates | Main manifest documents | Interpretation |
| --- | ---: | ---: | --- |
| Zenodo House | 283,020 | 283,020 | Same count; current loader/label loses Federation identity. |
| OpenAustralia | 32,846 | 110,696 | Main clearly has substantial newer holdings. Local 2019–2025 zeros are not proof of live zeros. |
| NSW | 112,061 | 115,308 | Newer main holdings; aggregates cannot certify either 2023/2024 chamber gap. |
| Victoria | 50,744 | 50,744 | Same source count; no complete day proof. |
| SA | 37,972 | 37,971 | Essentially the same series after gates/dedupe; main explicitly records the 2024-11-12 source stop. |
| QLD | 10,228 | 10,228 | Same source count; main's latest source date is 2026-09-16. |
| ACT | 0 | 9,964 | Explicit snapshot mismatch, not evidence of an absent public ACT corpus. |

Main's latest-source labels are House/Senate combined through **2026-10-29**, NSW **2026-11-12**, Victoria **2026-09-24**, QLD **2026-09-16**, SA **2024-11-12**, ACT **2026-10-29**. A combined last date can conceal an empty chamber or an internal multi-year hole.

The person index declares `generated=2026-10-18` and has **1,565 people / 669,898 counted speeches**. Examples are Penny Wong **2,937**, Sarah Hanson-Young **1,488**, David Fawcett **427**, and David Shoebridge **6,922**. Their first/last years span holes but supply no day denominator; Shoebridge and Hanson-Young also include committees and/or another parliament. `speakers.json` is likewise a name/count index, not a daily speech inventory. `evidence/stats.json` declares the older **2026-09-08 / 1,310,477** source-record snapshot. These metadata dates and totals must not be fused into one supposed database snapshot. The user's live 2018 finding is the starting observation; this lane independently confirms its local absence and one available source date, not a complete live per-day/profile deficit.

Validation: **23 offline tests passed** (six audit tests plus the existing sitting-calendar suite), including expected-day rather than calendar-day adjacency, exact five-day threshold, all-source overlap, Senate/House separation, read-only extraction and the load guard. `git diff --check` passed. All committed artifacts are measurements/report/code/tests; no `.ops/`, raw speech bodies, credentials, downloaded corpus or generated portal changes are included.
