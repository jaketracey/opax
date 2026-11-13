# Dated House speaker identities

Reviewed 14 November 2026. Original base: `00150690c7c7b8b8f1888a29c805c0090d6cbcce`. Branch: `im/speech-identities`. The approved implementation `9765da941287b3cc3985dc117de07b4e73c840d6` was rebased as `6f20fde52` onto `b65d87783f2dd6f00ca5d3cfd44bd9165daddfd3` (`origin/main`, including #364 and #365). The sweep was read from `im/sa-council-evidence` at `7415b8721a5ea30a03aa3a0f390e06a299a77716`; its report cites its earlier base `9412816c8196d5b0a057b57d2d8c7e8ce20adf27`.

## Result and evidence

All **85 Dickson records** formerly linked to `10592` resolve to **Anthony Charles Smith**, existing catalogue identity `person_efb744ffb3a25d578e592281`, Handbook PHID **SK6**. All **four Cunningham records** formerly linked to `10937` resolve to **Stephen Martin**, existing catalogue identity `person_9c02d321caef54b2ba21a1f8`, Handbook PHID **8I4**, whose full name is Stephen Paul Martin. His existing 297-speech transcript profile is reused. No second Stephen Martin profile is published.

The [reviewed source facts](../../parli/ingest/federal_speaker_identities.json) reuse the manifest-pinned electorate release `9e281b4ef4edbd38`:

| Member | Seat and House service used by the repair | Existing source record |
| --- | --- | --- |
| Anthony Charles Smith | Dickson, representatives, 1996-03-02 to 1998-10-03 | `term_7c92080334c6545eaee623fe` |
| Stephen Paul Martin | Cunningham, representatives, 1996-04-30 to 2002-08-16, Labor period | `term_9c1dd8c325e95220a1499cbd` |

The catalogue also holds Martin's earlier Cunningham periods from 1993 and Macarthur service from 1984. The repair uses the dated Cunningham Labor period containing the four speeches, rather than treating his full parliamentary career as one seat term. Ask retains the complete held seat history.

Held sources are OpenAustralia's [representatives register](https://raw.githubusercontent.com/openaustralia/openaustralia-parser/master/data/representatives.csv), SHA-256 `3c9a623c968eb3ce660626d0cc43eb4e503bd41be5ff83831718a36452a200b6`, and its [pinned people register](https://raw.githubusercontent.com/openaustralia/openaustralia-parser/061ec16fdc68ef52544a35d8c4f6413e4622e6cb/data/people.csv), SHA-256 `42e310b1a1e8b63243e6027f0c07303bf068c1ef9db5d9fc9744880d93ed007f`. The held 13 November Handbook cache independently distinguishes SK6 from Casey PHID **00APG**, and 8I4 from Reid PHID **282982**, by full name, seat and service dates. Its checksum and selected public member records are in the source-facts file. No source request was necessary.

The [89-row original metadata fixture](../../tests/fixtures/speech-identities/house.json) pins the actual speech ids, prints, dates, recorded parties and seats. Its SHA-256 is `b9552e67826df2336e19399596f1d8d666d72ac7dac26e2522297c344f7dd3cf`. Earliest examples are **5**, 1998-03-02, Dickson, and **73570**, 2002-03-14, Cunningham, `Dr MARTIN,MP`, ALP. The expanded Anthony Charles print is retained unchanged. The Handbook records Smith's Liberal and later Independent affiliations; the raw corpus party labels are preserved, including their existing inconsistencies with the dated Handbook change on 26 May 1998. This repair does not invent a party timeline from those labels.

## Attribution and rebuild

The federal linker's full-name lookup could choose a later namesake without checking an individual speech's seat and date. Its broad surname matching and the hygiene pass's full-name expansion then perpetuated an already assigned id. The old roster export grouped the original print; the KB and speaker directory used the contaminated clean name. This explains why the same fault appeared differently across the published aggregates.

`parli.ingest.speaker_identity` now supplies one reviewed resolver shared by the nightly federal linker, speaker hygiene, `arag_sync.map_speech`, the speaker export and the parliamentarian export. It checks the original print, federal jurisdiction, House, dated service, seat and prior id. Cunningham requires its explicit seat. The two Dickson rows with an empty seat are identified by their full Tony Smith print within the earlier member's disjoint service period. Committees, witnesses, chairs, Wragge XML, contradictory seats and dates outside service do not inherit these rules. No global surname alias is added.

The linker runs the repair before its broad name lookup, including rows already linked. It seeds only missing member records using the existing catalogue ids and Handbook House career dates. Martin's `entered_house` is 1984-12-01; the separate Cunningham interval used to resolve the four prints starts in 1996. Each changed row gets an audit receipt and a pending KB patch. The hygiene identity loop uses the same decisions. Raw prints, text, parties, seats and speech ids are unchanged. KB mapping and both read-only exporters also resolve an unrepaired snapshot, so a manual database patch is not required for correct rebuild output.

The roster accept list pins the exact source replay and profile changes in [speech_identity_review.json](../../scripts/speech_identity_review.json). Its rule verifies the 85 + 4 fixture, holds a changed raw export, and permits only the reviewed records. The neutral Martin aggregate keeps its pinned 148-witness cohort and loses only the two eligible Cunningham speeches. The Casey profile retains a single Liberal label. Stephen Martin gains his own catalogue id, Cunningham representation and full-name alias. Ask service lookup now accepts the catalogue's own person id as well as legacy numeric ids.

Offline rebuild commands, from this branch:

```sh
python3 scripts/export_parliamentarians.py --defer-check > people-final-raw.json
python3 scripts/export_speakers.py > speakers-final.json
python3 scripts/rebuild_speech_identities.py --db ~/.cache/autoresearch/parli.db --out rebuild-final
node scripts/build_search_catalog.mjs
node scripts/build_crawl_catalog.mjs
```

The full before/after exports were rebuilt against the same read-only snapshot. Applying only this repair's reviewed roster groups to the pre-change shipped roster reproduces every checked-in person row exactly: **four accepted changes, no repair holds**. The relevant speaker-directory rows were installed from the rebuilt export; unrelated rows were retained. Search, crawl paths and asset stamps were rebuilt locally. The [checked-in rebuild receipt](2026-11-14-speech-identities-rebuild.json) lists every moved id, original-row checksum, all profile topic counts and shares, and the 89 rebuilt KB documents' digest. Document JSONL SHA-256: `fcc4f825123c296249145cdc3bb3b3a435fd6f878b3efbf4e5a18ea49a0ea120`.

A separate local scratch database replay moved **89 rows**, queued **89 slugs**, and moved **zero** rows on the second pass. It did not drain the queue or contact the KB. The source database remained read-only, with mtime unchanged at **2026-11-10T10:23:44.736218+00:00**.

## Counts and dates

The attribution change covers **85 + 4 stored speeches**. The portal's existing 200-character and deduplication rules admit **76 + 2** of them. The other **11** retain corrected identities but do not enter those portal totals. The normal five-speech profile floor is unchanged; Martin's two eligible speeches join his existing profile.

House profile cohorts under the existing speech-export rules:

| Profile | Before | After | First speech before | First speech after | Last speech, unchanged |
| --- | ---: | ---: | --- | --- | --- |
| Tony Smith, Casey | 456 | 380 | 1998-03-02 | 2011-05-10 | 2022-03-31 |
| Anthony Charles Smith, Dickson | 0 | 76 | none | 1998-03-02 | 1998-07-15, newly attributed |
| Fiona Martin, Reid-linked records | 246 | 244 | 2002-03-14 | 2019-07-25 | 2022-03-31 |
| Stephen Martin, existing profile | 297 | 299 | 1998-03-02 | 1998-03-02 | 2002-06-27 |

The published parliamentarian directory used original prints, so Fiona Martin's visible row was already **244** and stays **244**. The two eligible Cunningham speeches instead came out of its neutral **Martin** aggregate, **63 to 61**, whose transcript total falls **211 to 209** and first year moves **2002 to 2024**. Its House chamber is removed; its separated witness count remains **148**. The directory-wide speech total is conserved at **669,898**. Tony Smith's published row changes **456 to 380** and first year **1998 to 2011**; the Dickson row is new at **76**; Stephen Martin changes **297 to 299**.

The speaker directory includes committee material and has a different denominator. Its same-snapshot rebuild changes Tony Smith **477 to 401**, Fiona Martin **246 to 244**, Anthony Charles Smith **0 to 76**, and Stephen Martin **297 to 299**. The previously shipped Tony speaker-directory cache was **496**. Independent review confirmed that the **19-row** difference from the same-snapshot baseline of **477** reflects database changes since 4 October, rather than rows dropped by this resolver. The repair itself moves **76 eligible Dickson rows** from that baseline, producing **401**.

Topic shares below reuse the held legacy `speech_topics` labels, with all eligible House speeches in the profile as denominator. They are a reproducible local recount, not fresh model classification or a claim to have refreshed the live KB. Labels can overlap and the legacy classifier has documented substring weaknesses. Existing KB enrichment labels are retained by the speaker patcher's merge path when the normal pipeline drains the queue. The receipt includes every held topic; this table shows four examples as before to after percentages.

| Profile | Economy | Housing | Health | Technology |
| --- | --- | --- | --- | --- |
| Tony Smith, Casey | 48.68% to 51.32% | 31.58% to 27.89% | 12.50% to 11.58% | 77.41% to 75.00% |
| Fiona Martin, Reid-linked records | 46.34% to 45.90% | 33.74% to 33.61% | 49.19% to 49.59% | 71.95% to 71.72% |
| Anthony Charles Smith | no prior cohort to 35.53% | no prior cohort to 50.00% | no prior cohort to 17.11% | no prior cohort to 89.47% |
| Stephen Martin | 54.21% to 54.52% | 33.33% to 33.44% | 18.18% to 18.06% | 83.50% to 83.61% |

## Guard and remaining findings

The guard checks resolved ids against independently sourced catalogue seat periods in the speech's house on its date. It does not trust the contaminated raw `members.entered_house` values. [The replay test](../../tests/test_federal_speaker_identities.py) **failed all 89 parameterised cases before the fix**, on the main attribution path, in 0.69 seconds. After the fix, all 89 pass; the complete focused identity suite originally passed **94 tests**, including wrong-seat/house/date and witness refusals, exact exception matching, unchanged raw evidence, idempotence, exports and moved-review holds.

The repeatable full held-House audit is `scripts/audit_speech_service.py`, with exact dated allowances in `scripts/speech_service_exceptions.json`. That file has **no allowances** for these pairs and no stale entries. Its raw and resolved runs check **392,274** non-Wragge, linked House records since 1993-03-13, excluding typed chairs, unknowns and witnesses, without a length floor:

| Result | Raw attribution | Resolved attribution |
| --- | ---: | ---: |
| Holds a sourced seat on that day | 370,623 | 370,712 |
| Outside held House service periods | 692 | 603 |
| No catalogue term evidence for the resolved id | 20,959 | 20,959 |

The removed violation-id set is **exactly the 89-row fixture**. The **603 remaining mismatches against held service periods concern 10 identities**; examples are speech ids **307, 656, 658, 1154, 1376**, under ids `10127` and `10817`. The **20,959 missing-term cases concern 76 identities**; examples are **8, 15, 17, 18, 19**. These are unresolved evidence/attribution findings, not allowances or certified valid records; catalogue coverage can also need review. The broad audit intentionally still exits 1 for these other findings; only these two pairs were repaired.

The orchestrator has assigned **44 Wragge-source Dickson records** and **273 Martin records from 1970 to 2002** to a separate backlog follow-up. They are outside this repair. Another existing issue is that the already correctly named Stephen Martin transcript cohort has **346 raw non-Wragge House records**, **297 eligible**, stored under `10905`, whose members row is Steve Martin. They lack a corresponding catalogue term in this audit and remain in the missing-evidence set. Their speech attribution ids were not changed: that is additional namesake work outside the requested 89. Reusing the existing Stephen Martin profile avoids duplicating that person's transcript page while exposing this remaining source-id debt.

## Coordination with the unmerged sweep

Do not edit `im/sa-council-evidence` from this branch. On integration, rebuild its corpus-earliest snapshot from the repaired offline database or this resolved attribution path, then remove its two `known-corpus-namesake` allowance groups, **seven interval entries** in total:

| Actor | Catalogue term keys, including each listed party subkey | Entries to drop |
| --- | --- | ---: |
| `pid:10592` | `term_548d8e13ed075dedb5d5ef38` and `/party/0`; `term_5df30f10ae685542a4338393` and `/party/0`; `term_a0d920896176537397f458a4` | 5 |
| `pid:10937` | `term_aad5f54465ee500b869c6efc` and `/party/0` | 2 |

All keys have the `catalog/` prefix. Deleting them against its old raw snapshot alone would leave stale first-speech evidence. Regenerate ordinary earlier-term exceptions for later Casey periods where required; the sourced terms themselves remain valid. The sweep uses no length floor, so its corrected Casey corpus bound is 2006-02-09, distinct from the eligible-profile bound of 2011-05-10 above. Benjamin Hood and all SA speech attribution are unchanged here.

## Gates and boundaries

- Initial `cat /proc/loadavg`: **8.83 6.68 4.68**, so load5 was **6.68**, below 40. Subsequent gate starts were checked; new gates were held when load5 exceeded 40 (observed up to 49.56), and resumed after a check of 36.58. One brief build attempt started at 41.96 was stopped and restarted after a check of 39.32. The successful Python, TypeScript and final portal-test runs all started below 40.
- Python roster/speaker gate: **459 passed, 14,218 subtests passed**, one previously passed frozen-replay test deselected, in **363.37 seconds**. The preceding full run passed both frozen export scenarios and 455 tests, with **11 failures** (including six subtest failures); it exposed the old Stephen Martin no-id expectation, minimal export fixtures missing source/seat columns, and a missing local `lxml` dependency. The expectation and absent-column handling were corrected, `lxml` was installed from cache into the local virtual environment, and every remaining suite was rerun successfully. The full replay was not repeated because its full schema and 1998-to-2002 cohort were unaffected by those fixes.
- From `portal/`, `npx tsc --noEmit`: **passed**, exit 0, after generating the worktree's missing ignored runtime declarations with `npm run types`. The initial attempt exited 2 because `worker-configuration.d.ts` was absent; no TypeScript source workaround was needed.
- Original portal test gate: **4,895 passed, zero failures, zero cancellations, 11 skipped**, in **441.70 seconds**, with four active test workers verified. The initial appended-flag invocation was stopped because Node ignored the limit after the file list. The temporary default-concurrency change has now been removed from `portal/package.json`, preserving main's CI behaviour. Missing ignored hub/election assets were built locally. Two old Liberal-count expectations were updated from 346 to **347**, reflecting the newly separate former Liberal member from Dickson; server and browser counts agree.
- Focused reuse/roster preservation checks: **111 passed, 53 subtests passed**. Ask/person-service checks: **22 passed**, concurrency 4.
- Roster accept-list validation: **736 records, 844 groups applied, 26 new rows, 7 pre-existing reviewed drops; zero problems**.
- Full affected exports, scoped source-to-shipped overlay, 89-document rebuild, source-id delta check and scratch idempotence replay: **passed**.
- Offline search/crawl builds, asset stamp check and `git diff --check`: **passed**. Original search catalogue version `d15dccb6778b2679` contains all four affected named profiles and their correct addresses; crawl paths add only the Dickson address and Martin's full-name alias. The full `npm run build:search` also prepared the fresh worktree's ignored growth, hub, election and table assets offline; its table step generated local SQL files only. Asset stamping changed cache hashes only.

Local receipts and gate logs are under `~/opax-work/evidence/im-speech-identities/`; only public member metadata and the compact rebuild receipt are committed. The requested common brief was absent at both supplied Linux locations, so the task's supplied summary governed this work. No manual production writes, source fetches, SSH, messages to other people or deployment occurred during this work. Branch publication follows the approved post-rebase gates. Dependency installation was local. The patch queue was populated only in the disposable local replay database.

## Approved review follow-up

The independent review approved the source repair: replay over the whole held database changes exactly **89 rows**, the second pass changes **zero**, and a missing evidence file fails the run rather than unlinking records. Disabling the resolver makes **93 of the original 94 identity tests fail**.

The rebase onto `b65d87783` completed successfully. Twelve conflicted files contained generated stamps or the search manifest. Identical source lines were reconciled after comparing their stamps; the merged source retains both main's donor changes and the identity changes. Search and crawl catalogues were rebuilt, and `scripts/stamp_assets.mjs` regenerated the asset hashes and `spa-shell.js` from the combined `index.html`. No generated file was resolved with `--ours` or `--theirs`.

Review follow-up implementation: `bc71e7cb76a96dc741eb40757fb6777a4eb085a6`. P3 is implemented: a conflicting existing member record logs its catalogue id, leaves that member and its speeches untouched, and allows the other identity repair to proceed. Both the nightly linker and hygiene loop use that exclusion, including hygiene dry runs. Six regression cases cover a conflict in either identity across the linker, hygiene and hygiene dry-run paths. Missing source evidence still fails closed.

**Rollout:** After merge, the next normal daily refresh's `link_speakers` pre-pass will write the **89 corrections to the production database**, seed any missing reviewed member records, record the audit receipts and queue **89 KB patches**. These production writes through the normal pipeline are intended and approved. The next weekly run will rebuild the speaker and parliamentarian exports from those corrected identities, followed by the normal search/crawl build and publication gates. The existing monthly hygiene and `OPAX_SYNC_KB=1` patch-drain step applies queued corrections to existing KB resources while preserving topic enrichment; the daily bulk sync alone does not drain these historical patches. To revert, revert the resolver and its `federal_speaker_identities.json` evidence together before reverse replaying the 89 pinned fixture rows' original `person_id` and `speaker_name_clean`, requeue those same speech slugs, and rebuild the affected exports through the normal pipeline. Removing the evidence file alone is not a rollback because its absence deliberately stops the resolver.

The package test script remains identical to main; concurrency 4 is supplied only by an untracked local npm script-shell wrapper for this gate. Post-rebase gates:

- Initial load check: **15.24 19.37 24.24**, load5 **19.37**. Gate starts: identity **13.81**, speaker checks **12.35**, TypeScript **14.40**, portal tests **15.32**, all below 40. Periodic checks during the portal run also stayed below 40; its final load5 check was **33.84**.
- Python identity suite: **100 passed** in **2.06 seconds**, including all 89 service guards and six conflict cases.
- Speaker/linker/hygiene Python checks: **132 passed, six subtests passed** in **0.71 seconds**.
- From `portal/`, `npx tsc --noEmit`: **passed**, exit 0.
- From `portal/`, `npm test --script-shell="$HOME/opax-work/evidence/im-speech-identities/npm-concurrency-4-shell.sh"`: **4,907 passed, zero failures, zero cancellations, 11 skipped**, in **523.65 seconds**, exit 0. The wrapper executes `node --test --test-concurrency=4 test/*.test.mjs`; the runner's four direct workers were verified.
- Search and crawl catalogues rebuilt successfully; search version **052c0ed6be0c6ee1**. `stamp_assets.mjs --check` and `git diff --check`: **passed**. Every public JavaScript source change against the rebased main is a stamp change except the intended person paths and regenerated SPA shell.
