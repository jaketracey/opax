# Federal Hansard missing-day backfill — build and staging rehearsal

13 October 2026. Branch `data/federal-backfill`, based on `origin/main` at `2d24cb80`. Speaker attribution commits `bfd8a667`, `e18bd218` and `6015cd7b` were cherry-picked as `36b1b63f`, `e6e7c884` and `886c2cd9`.

**403 zero-row chamber-days produce 108,173 new staging speech rows and 74,880 publishable KB documents.** No production DB/KB writes, enrichment queueing, generation, pushes, deploys, KB slot changes or config changes were performed.

The source was `/home/jake/.cache/autoresearch/parli.db`, opened with SQLite `mode=ro`. A complete SQLite backup was loaded at `/home/jake/opax-staging/federal-backfill-20261013/staging.sqlite`. Full-row SHA-256 over all original speech columns confirms all **1,316,517 original speeches**, including their citation IDs, are unchanged in the copy: `6e6140feb0455611abbe132644bec10eb7183c20ca7c3f23afb1fb8b54ad948d`.

## Counts and exclusions

These are additional KB documents, after the existing parser, identity guards, loader and sync exclusions. Exclusion columns are mutually exclusive in pipeline order. “Length” combines the loader’s <50-character gate and the KB’s 50–199-character gate. “Identity” is the loader’s same-body/different-identity conflict gate; the XML person/office guard rejected zero turns.

| Year | Chamber | Missing days | XML turns | New DB rows | New KB docs | Length | Procedural | Duplicate | Identity |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 2019 | House | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| 2019 | Senate | 40 | 13,639 | 10,602 | 7,168 | 5,354 | 514 | 22 | 581 |
| 2020 | House | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| 2020 | Senate | 46 | 15,575 | 12,310 | 8,713 | 5,753 | 465 | 33 | 611 |
| 2021 | House | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| 2021 | Senate | 52 | 16,273 | 13,503 | 8,990 | 6,336 | 603 | 62 | 282 |
| 2022 | House | 20 | 5,860 | 5,028 | 3,730 | 1,753 | 200 | 19 | 158 |
| 2022 | Senate | 34 | 11,337 | 9,220 | 6,133 | 4,734 | 324 | 24 | 122 |
| 2023 | House | 44 | 12,881 | 11,075 | 8,011 | 3,912 | 574 | 34 | 350 |
| 2023 | Senate | 47 | 18,326 | 14,876 | 9,961 | 7,651 | 497 | 44 | 173 |
| 2024 | House | 62 | 18,147 | 15,500 | 11,275 | 5,333 | 968 | 37 | 534 |
| 2024 | Senate | 52 | 18,097 | 14,558 | 9,854 | 7,396 | 607 | 53 | 187 |
| 2025 | House | 3 | 749 | 671 | 486 | 209 | 48 | 0 | 6 |
| 2025 | Senate | 3 | 1,006 | 830 | 559 | 399 | 44 | 0 | 4 |
| **Total** | | 403 | 131,890 | 108,173 | 74,880 | 48,830 | 4,844 | 328 | 3,008 |

Length exclusions: **20,381** at the loader’s <50 gate and **28,449** at the KB’s <200 gate. The **4,844 procedural exclusions** are presiding-officer turns and the existing visitor/notice/postponement topics. **328 normalized-body/GID duplicates** are reconciled without allocating another citation. All **3,008 identity holds** have reason `batch-identity-conflict`; details are in `loader-days.json`. No additional sync duplicate exclusions arose on these zero-row days.

**74,851 publishable documents have resolved person IDs; 29 remain explicitly `speaker_type=unknown` with no person ID**, following the existing loader’s treatment of XML without a speaker identity. None is assigned to an invented identity. All 74,880 documents retain their original APH/ParlInfo source links. Chair turns retain their role/identity in staging and are filtered by the existing procedural gate.

The parser also observed two duplicate-voter issues in the 12 September 2024 House division. They do not affect speech identity. This lane loads no divisions or votes.

## Size, ingest time and enrichment

KB POST bodies total **296,916,652 bytes (296.9 MB / 283.2 MiB)** using the same JSON escaping as `requests`’ `json=` serialization, before HTTP headers. Speech bodies total **200,973,598 UTF-8 bytes (201.0 MB)**. The sealed JSONL is **296,007,460 bytes**.

**KB ingest planning estimate: 4.16 hours at 5 documents/second; 2.08–10.40 hours at 10–2 documents/second.** This is an assumption, not a measured write benchmark. Existing `arag_sync` uses 10 workers and honors KB backpressure; indexing readiness can lag successful POSTs. The resumed staging parse/load/audit took 460 seconds, excluding the initial full DB backup.

**74,880 summaries and 74,880 topic-label evaluations are needed.** Existing path: `opax-enrich` — `enrich/src/discover.ts` → `enrich/src/tick.ts` → `enrich/src/generate.ts` → `enrich/src/write.ts`. Discovery creates two tasks per resource (149,760 potential queue rows), normally combined into one model call per resource. This lane queued zero rows and called no model.

Offline estimate using the actual Worker prompts, clipping and `neuronsFor()` price table: **US$23.26 first pass**, or **US$25.30 with 5% primary retries plus 1% escalations**. Primary: `@cf/qwen/qwen3-30b-a3b-fp8`; escalation: `@cf/openai/gpt-oss-120b`. Input is estimated at 3.5 JavaScript characters/token; output is 620 tokens including thinking, the existing bake-off mean. Actual input is 529,437,927 prompt characters; 746 long speeches are clipped. At the configured 4,000 output-token cap on every primary call, the first-pass scenario is US$108.10.

These figures are gross marginal model cost, before the shared 10,000-neuron daily allowance, and exclude D1/KB/platform charges. Retry assumptions are scenarios, not measurements. Cloudflare’s [current Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/) was checked: $0.011/1,000 neurons and the configured models’ price rows match the repository table.

After a go and KB ingest, the existing Worker discovers these `source=openaustralia` resources as new content. Its `HISTORIC_HOLD` applies to `source=hansard_hist`, so it does not hold this OA batch. No configuration change or explicit queue-seeding operation is proposed.

## Twenty sample documents

These citation IDs are from the staging DB. A refreshed owner DB may allocate different IDs; once loaded, reruns preserve them. Full document payloads are in `/home/jake/opax-staging/federal-backfill-20261013/samples.json`. Selection takes the midpoint of each populated year/chamber, then quarter points until there are 20; 2019–2021 House has no zero-row days to sample.

| Date | Chamber | Speaker | Staging citation | Person ID | Characters | XML anchor / original APH record |
|---|---|---|---|---|---:|---|
| 2019-09-16 | Senate | Anne Ruston | `speech-1329024` | 10781 | 1,900 | [2019-09-16.64.1](http://parlinfo.aph.gov.au/parlInfo/search/display/display.w3p;adv=yes;orderBy=_fragment_number,doc_date-rev;page=0;query=Dataset%3Ahansards,hansards80%20Date%3A16%2F9%2F2019;rec=0;resCount=Default) |
| 2020-08-24 | Senate | Richard Colbeck | `speech-1340378` | 10131 | 256 | [2020-08-24.62.1](http://parlinfo.aph.gov.au/parlInfo/search/display/display.w3p;adv=yes;orderBy=_fragment_number,doc_date-rev;page=0;query=Dataset%3Ahansards,hansards80%20Date%3A24%2F8%2F2020;rec=0;resCount=Default) |
| 2021-08-03 | Senate | Kim Carr | `speech-1353530` | 10103 | 11,539 | [2021-08-03.12.1](http://parlinfo.aph.gov.au/parlInfo/search/display/display.w3p;adv=yes;orderBy=_fragment_number,doc_date-rev;page=0;query=Dataset%3Ahansards,hansards80%20Date%3A3%2F8%2F2021;rec=0;resCount=Default) |
| 2022-11-10 | House | Helen Haines | `speech-1368823` | 10929 | 811 | [2022-11-10.43.1](http://parlinfo.aph.gov.au/parlInfo/search/display/display.w3p;adv=yes;orderBy=_fragment_number,doc_date-rev;page=0;query=Dataset%3Ahansardr,hansardr80%20Date%3A10%2F11%2F2022;rec=0;resCount=Default) |
| 2022-09-27 | Senate | Katy Gallagher | `speech-1365331` | 10838 | 841 | [2022-09-27.83.1](http://parlinfo.aph.gov.au/parlInfo/search/display/display.w3p;adv=yes;orderBy=_fragment_number,doc_date-rev;page=0;query=Dataset%3Ahansards,hansards80%20Date%3A27%2F9%2F2022;rec=0;resCount=Default) |
| 2023-08-10 | House | Tania Lawrence | `speech-1384978` | 10981 | 2,690 | [2023-08-10.119.2](http://parlinfo.aph.gov.au/parlInfo/search/display/display.w3p;adv=yes;orderBy=_fragment_number,doc_date-rev;page=0;query=Dataset%3Ahansardr,hansardr80%20Date%3A10%2F8%2F2023;rec=0;resCount=Default) |
| 2023-09-13 | Senate | Tony Sheldon | `speech-1388941` | 10944 | 413 | [2023-09-13.130.2](http://parlinfo.aph.gov.au/parlInfo/search/display/display.w3p;adv=yes;orderBy=_fragment_number,doc_date-rev;page=0;query=Dataset%3Ahansards,hansards80%20Date%3A13%2F9%2F2023;rec=0;resCount=Default) |
| 2024-06-26 | House | Kate Chaney | `speech-1412814` | 10974 | 7,916 | [2024-06-26.173.1](http://parlinfo.aph.gov.au/parlInfo/search/display/display.w3p;adv=yes;orderBy=_fragment_number,doc_date-rev;page=0;query=Dataset%3Ahansardr,hansardr80%20Date%3A26%2F6%2F2024;rec=0;resCount=Default) |
| 2024-08-14 | Senate | Tammy Tyrrell | `speech-1417191` | 11012 | 4,188 | [2024-08-14.181.1](http://parlinfo.aph.gov.au/parlInfo/search/display/display.w3p;adv=yes;orderBy=_fragment_number,doc_date-rev;page=0;query=Dataset%3Ahansards,hansards80%20Date%3A14%2F8%2F2024;rec=0;resCount=Default) |
| 2025-02-05 | House | Michael Sukkar | `speech-1430927` | 10791 | 441 | [2025-02-05.72.8](http://parlinfo.aph.gov.au/parlInfo/search/display/display.w3p;adv=yes;orderBy=_fragment_number,doc_date-rev;page=0;query=Dataset%3Ahansardr,hansardr80%20Date%3A5%2F2%2F2025;rec=0;resCount=Default) |
| 2025-02-05 | Senate | Pauline Hanson | `speech-1431179` | 10280 | 666 | [2025-02-05.78.2](http://parlinfo.aph.gov.au/parlInfo/search/display/display.w3p;adv=yes;orderBy=_fragment_number,doc_date-rev;page=0;query=Dataset%3Ahansards,hansards80%20Date%3A5%2F2%2F2025;rec=0;resCount=Default) |
| 2019-07-24 | Senate | Jonathon Duniam | `speech-1326292` | 10847 | 655 | [2019-07-24.196.4](http://parlinfo.aph.gov.au/parlInfo/search/display/display.w3p;adv=yes;orderBy=_fragment_number,doc_date-rev;page=0;query=Dataset%3Ahansards,hansards80%20Date%3A24%2F7%2F2019;rec=0;resCount=Default) |
| 2020-04-08 | Senate | Mathias Cormann | `speech-1337315` | 10148 | 439 | [2020-04-08.57.1](http://parlinfo.aph.gov.au/parlInfo/search/display/display.w3p;adv=yes;orderBy=_fragment_number,doc_date-rev;page=0;query=Dataset%3Ahansards,hansards80%20Date%3A8%2F4%2F2020;rec=0;resCount=Default) |
| 2021-03-15 | Senate | Helen Polley | `speech-1349925` | 10515 | 10,951 | [2021-03-15.160.1](http://parlinfo.aph.gov.au/parlInfo/search/display/display.w3p;adv=yes;orderBy=_fragment_number,doc_date-rev;page=0;query=Dataset%3Ahansards,hansards80%20Date%3A15%2F3%2F2021;rec=0;resCount=Default) |
| 2022-10-26 | House | James Stevens | `speech-1366842` | 10940 | 8,610 | [2022-10-26.127.1](http://parlinfo.aph.gov.au/parlInfo/search/display/display.w3p;adv=yes;orderBy=_fragment_number,doc_date-rev;page=0;query=Dataset%3Ahansardr,hansardr80%20Date%3A26%2F10%2F2022;rec=0;resCount=Default) |
| 2022-08-02 | Senate | Sarah Henderson | `speech-1362406` | 10790 | 1,420 | [2022-08-02.31.2](http://parlinfo.aph.gov.au/parlInfo/search/display/display.w3p;adv=yes;orderBy=_fragment_number,doc_date-rev;page=0;query=Dataset%3Ahansards,hansards80%20Date%3A2%2F8%2F2022;rec=0;resCount=Default) |
| 2023-06-19 | House | Steve Georganas | `speech-1379107` | 10245 | 11,736 | [2023-06-19.118.1](http://parlinfo.aph.gov.au/parlInfo/search/display/display.w3p;adv=yes;orderBy=_fragment_number,doc_date-rev;page=0;query=Dataset%3Ahansardr,hansardr80%20Date%3A19%2F6%2F2023;rec=0;resCount=Default) |
| 2023-08-01 | Senate | Jonathon Duniam | `speech-1382115` | 10847 | 1,999 | [2023-08-01.138.11](http://parlinfo.aph.gov.au/parlInfo/search/display/display.w3p;adv=yes;orderBy=_fragment_number,doc_date-rev;page=0;query=Dataset%3Ahansards,hansards80%20Date%3A1%2F8%2F2023;rec=0;resCount=Default) |
| 2024-03-25 | House | Libby Coker | `speech-1406935` | 10921 | 4,168 | [2024-03-25.249.1](http://parlinfo.aph.gov.au/parlInfo/search/display/display.w3p;adv=yes;orderBy=_fragment_number,doc_date-rev;page=0;query=Dataset%3Ahansardr,hansardr80%20Date%3A25%2F3%2F2024;rec=0;resCount=Default) |
| 2024-03-27 | Senate | Anthony Chisholm | `speech-1408167` | 10849 | 487 | [2024-03-27.172.4](http://parlinfo.aph.gov.au/parlInfo/search/display/display.w3p;adv=yes;orderBy=_fragment_number,doc_date-rev;page=0;query=Dataset%3Ahansards,hansards80%20Date%3A27%2F3%2F2024;rec=0;resCount=Default) |

Each sample preserves one XML turn, its GID/anchor, person ID, office ID, talk type, original APH URL and Commonwealth/OpenAustralia attribution. Nested interjections are separately parsed and cannot enter the parent turn’s words.

## Partial-day list

**304 occupied chamber-days are held in full.** They contain 52,347 eligible XML turns without a unique existing body/GID match and seven identity holds. This is a reconciliation-candidate list: unmatched XML can also result from different API/Zenodo speech boundaries, so it does not establish 304 incomplete sittings or promise 52,347 additional documents.

The **complete date-by-date list** is [2026-10-13-federal-hansard-partial-days.csv](2026-10-13-federal-hansard-partial-days.csv); every row includes chamber, stored row count, eligible unmatched XML count and identity holds. Full GIDs are retained in staging `partial-days.json`.

| Year | House held days | Senate held days |
|---|---:|---:|
| 2019 | 45 | 0 |
| 2020 | 58 | 0 |
| 2021 | 67 | 0 |
| 2022 | 21 | 0 |
| 2023 | 23 | 19 |
| 2024 | 1 | 0 |
| 2025 | 37 | 33 |

The 6 February 2024 House day has **82 stored rows and 146 eligible unmatched XML turns**. It is held and receives no new citation. Existing 2023 House/Senate days through 11/10 May are also held; the backfill adds only the later zero-row days.

## Source and safety evidence

Transport is the public [House XML archive](https://data.openaustralia.org.au/scrapedxml/representatives_debates/) and [Senate XML archive](https://data.openaustralia.org.au/scrapedxml/senate_debates/), with the original APH links and Commonwealth/OpenAustralia attribution. This uses the existing nightly source and licence regime. `HonestHTTP` uses the identifying OPAX user agent, checks robots rules, sends serial requests at least one second apart (or slower per robots), honors retries/refusals, and caches raw XML.

The first rehearsal fetched live directory listings and the three member mappings. The 2019–2025 source listings exactly match the existing cached sets: **381 House days and 326 Senate days**, with no absent/unlisted cache files. The restarted load used those mappings and cached XML offline. The initial staging attempt was interrupted after exposing missing GID indexes; it had committed no new speech rows. The pristine backup was reused after checking count/max-ID equality, then original full-row equality was checked after loading. Raw file hashes and lengths are in `parsed-days.json`.

The loader rechecks zero-row status while holding a SQLite write lock; an occupied day is skipped even if it appeared after discovery. Citation/GID lookups are indexed. Accepted insertion ownership is committed atomically with each speech so an interrupted load can recover only its own rows on a later scoped KB retry; global GID provenance cannot authorize publication. The dedicated checkpoint is rejected if it belongs to another database/date range or is the nightly checkpoint. The default dry run never loads credentials, creates a KB client, writes a checkpoint, or queues enrichment.

**Validation: 125 Python fixture tests and 21 enrichment prompt/text/budget tests passed.** Coverage includes the invented-MP XML fixture, both chamber/source discovery gates, <50/<200/procedural exclusions, nested speakers, chair roles, retained original source links, partial-day/citation stability, interrupted-load recovery, failed KB retry, repeat-run idempotence, dedicated checkpoint validation and the desktop cutover guard. KB tests use a stub; test sockets are disabled.

## Exact command after a go

Run this standalone in the reviewed checkout on the **nightly DB/KB-owning host**, after the speaker relabel lane is idle. The command acquires both owner locks itself and refuses an active nightly/daily writer. Do not wrap it in an already-held owner lock. The desktop has `MIGRATED_TO_VM`; this mode honors that guard and refuses desktop KB pushes. Keep the current KB slot/config. Credentials are read from `~/opax/.env` only when `--sync-kb` is requested. Do not move the staging DB into production.

```sh
cd "$HOME/opax"
"$HOME/opax/.venv/bin/python" -m parli.ingest.openaustralia_xml \
  --backfill-missing-days --apply --sync-kb --enrichment-max-usd 40 \
  --db "$HOME/.cache/autoresearch/parli.db" \
  --start 2019-01-01 --end 2025-12-31 --max-days 1000 \
  --stage "$HOME/.cache/autoresearch/federal-backfill-2019-2025" \
  --cache-dir "$HOME/.cache/autoresearch/oa-feed" \
  --sync-state "$HOME/.cache/autoresearch/federal-backfill-2019-2025-sync.json"
```

Rerun the same command to recover a failed/interrupted push. Accepted insertion ownership is committed atomically with each speech; global GID provenance cannot authorize a retry. Enrichment admission requires the updated Worker and D1 migration 0005, verified by its authenticated read-only status endpoint before loading. Set the existing OPAX_ENRICH_URL and ENRICH_ADMIN_TOKEN in ~/opax/.env; the command changes no configuration. Confirm the owner DB’s discovery receipt before relying on the desktop’s numeric estimate; the command discovers its own current zero-row days. Production citation IDs are allocated there.

## Nightly follow-through

Keep the normal 30-day acquisition. Schedule a **standalone weekly bounded missing-day sweep for 2019–2025** outside the owner’s active refresh. It must acquire both owner locks; invoking it from an already-locked nightly will be refused. The weekly step may use `--apply` with a dedicated ownership/checkpoint file and omit `--sync-kb`, allowing the next normal nightly sync to push all appended rows once, with the durable enrichment cap metadata. Retain the source cache, GID provenance and both checkpoints across transfers.

Persist and monitor zero-row days remaining, source refusals, identity holds and the occupied-day reconciliation receipt; alert on nonzero remaining days or failed ingest rather than marking a failed sweep as repaired. Export updated speech/people/search/corpus coverage through the existing nightly groups after ingest. Keep partial-day reconciliation as a separate reviewed task. The mode’s dates are deliberately pinned to 2019–2025; repairing future years outside the rolling window requires extending the reviewed bounds.

No nightly schedule, production data, deployment or published coverage was changed by this lane.

## Retained staging artifacts

`/home/jake/opax-staging/federal-backfill-20261013/` contains `report.json`, `discovery.json`, `parsed-days.json`, `loader-days.json`, `identity-issues.json`, `partial-days.json`, `samples.json`, `kb-payloads.jsonl`, `enrichment-cost.json`, `document-quality.json`, `live-index-validation.json`, `original-evidence-verification.json`, test logs and the staging DB. `artifact-manifest.json` seals the twelve JSON/JSONL artifacts with file sizes and SHA-256 checksums. The report and complete partial-day CSV are versioned; bulk speech payloads remain in staging.

The original measurements above are retained for comparison. [The review fix report](2026-10-13-federal-hansard-backfill-fix.md) records transactional ownership, both owner locks, the US$40 hard cap and the fresh dry run. Its payload is 303,356,332 bytes after adding cap metadata; all document/exclusion counts and enrichment estimates match this report.
