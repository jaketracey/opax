# Martin identities: measurement before implementation

Measured offline on 14 November 2026 from the read-only `/home/jake/.cache/autoresearch/parli.db`, branch base `c4185f03b` (portal row 179). The [original metadata fixture](../../tests/fixtures/speech-identities/martin.json) lists all 663 candidate speech ids. The [measurement receipt](2026-11-14-martin-measurement.json) pins every proposed move, both holds, source checksum and service records. This measurement is committed before resolver changes.

All rows below are federal House (`representatives`) rows. A blank seat is shown as `(empty)`.

| Source | Seat | Dates | Current id | Rows | Decision |
| --- | --- | --- | --- | ---: | --- |
| zenodo | Cunningham | 1998-03-02 to 2002-06-27 | 10905 | 344 | Stephen Paul Martin |
| zenodo | (empty) | 2001-08-06 to 2002-05-14 | 10905 | 2 | Stephen Paul Martin: explicit Stephen print |
| wragge_xml | Banks | 1970-03-18 to 1980-05-15 | 10937 | 131 | Vincent Joseph Martin |
| wragge_xml | BANKS, NEW SOUTH WALES | 1971-03-09 | 10937 | 1 | Vincent Joseph Martin |
| wragge_xml | (empty) | 1972-03-23 to 1973-11-29 | 10937 | 2 | Hold |
| wragge_xml | MACARTHUR | 1988-03-23 to 1990-09-13 | 10937 | 8 | Stephen Paul Martin |
| wragge_xml | Cunningham | 1998-03-02 to 2002-06-27 | 10937 | 131 | Stephen Paul Martin |
| wragge_xml | Dickson | 1998-03-02 to 1998-07-03 | 10592 | 44 | Anthony Charles Smith |

Exactly **661 additional rows** are proposed to move: **485** to Stephen Martin's existing `person_9c02d321caef54b2ba21a1f8`, **132** to Vincent Joseph Martin (`person_e88df9ffb591568ea3b6ea51`), and **44** to Anthony Charles Smith's existing `person_efb744ffb3a25d578e592281`. Vincent has no existing full-person catalogue entry; his id is `parli.electorates.stable_id('person', 'handbook:KN9')`, based on the held Handbook PHID, rather than reusing a surname stub. Wragge exports and KB eligibility stay excluded.

The held Handbook cache (SHA-256 `3754df31cdb3df2e7f08eb06a08e501f0cb26ca5d2f211bdb819f957eb3ed3b8`) establishes:

| Identity | PHID | Dated service |
| --- | --- | --- |
| Stephen Paul Martin | 8I4 | House, 1984-12-01 to 2002-08-16 |
| Steven Leigh Martin, senator Steve Martin, id 10905 | 275266 | Senate, Tasmania, 2018-02-09 to 2019-06-30 |
| Fiona Barbouttis Martin, id 10937 | 282982 | House, Reid, 2019-05-18 to 2022-05-21 |
| Vincent Joseph Martin | KN9 | House, Banks, 1969-10-25 to 1980-09-19 |
| Anthony Charles Smith | SK6 | House, Dickson, 1996-03-02 to 1998-10-03 |
| Anthony David Hawthorn Smith, Tony Smith, id 10592 | 00APG | House, Casey, 2001-11-10 to 2022-04-11 |

The manifest-pinned electorate catalogue independently supplies Stephen's Macarthur term (`term_59774310ac7f5781829d8fe1`, 1984-12-01 to 1993-03-13), Cunningham terms from 1993-03-13, and the Dickson term already reviewed in row 179. Every proposed row lies inside the target's recorded House and seat service. The 346 Stephen prints cannot belong to a senator who began service in 2018. Reid and Casey service both begin after their incorrectly attributed historical rows. Raw prints, seats and parties remain evidence and will not be rewritten.

Two candidates stay exactly as stored: **615266**, `Mr MARTIN`, 1972-03-23, no seat (surname alone lacks reviewed seat evidence); **622652**, `The DEPUTY SPEAKER (Mr Martin`, 1973-11-29, no seat (malformed presiding-officer attribution). These are explicitly held rather than assigned by surname. The original 89 corrections from row 179 remain a separate baseline; the combined unrepaired-snapshot delta should be **750**, followed by zero on a second pass.

## Resolver, full replay and profile counts

The shared `parli.ingest.speaker_identity` resolver now supports reviewed additional seat/print/prior-id rules for one existing person. Every rule still requires federal House service and its dates. The explicit Stephen print can resolve the two empty-seat rows; a surname-only Martin print cannot. Wragge uses the same rules and the same audit receipts. Its corrections do not enter `ext_kb_patch_queue`, because that source is excluded from KB publication. The hygiene identity loop uses that same queue rule. No raw name, party, seat, date or speech text is rewritten.

The full 27 GB database was copied locally. The unmodified row 179 resolver first moved its **89** rows in that copy. A temporary SQLite trigger then recorded every speech update during this lane's replay: **661** updates, exactly the measured ids and destinations, followed by **zero** on the second pass. All non-attribution columns of changed rows were compared with their originals; both held rows were checked unchanged. A separate read-only whole-database resolver check found **750** combined changes, with no extra or missing ids. The [replay receipt](2026-11-14-martin-replay.json) records every update. Only the scratch copy was writable; the original database mtime stayed `1794306224736217783` ns.

The [rebuild receipt](2026-11-14-martin-rebuild.json) compares ids after row 179 against this lane, without inferring an identity from an already correct clean name:

| Profile identity | All stored links before | After | Export-eligible House links before | After |
| --- | ---: | ---: | ---: | ---: |
| Stephen Paul Martin | 4 | 489 | 2 | 299 |
| Senator Steve Martin, 10905 | 346 | 0 | 297 | 0 |
| Fiona Martin, 10937 | 637 | 366 | 244 | 244 |
| Tony Smith of Casey, 10592 | 2,817 | 2,773 | 380 | 380 |
| Anthony Charles Smith of Dickson | 85 | 129 | 76 | 76 |
| Vincent Joseph Martin of Banks | 0 | 132 | 0 | 0 |

Eligible means the existing non-Wragge House corpus since 1993-03-13, with its 200-character, role and duplicate rules. Stephen's additional eligible cohort is **297**; the other **49** main-source rows fail existing publication eligibility. The public speaker and parliamentarian name counts already grouped the 297 speeches under the clean/original Stephen name: the rebuilt public name counts stay Stephen **299**, Steve **0** (absent), Fiona **244**, and Tony **380** in parliamentarians (**401** in the speaker directory, which includes other transcript turns). These stable display counts must not conceal the corrected person-id ownership. The stored Fiona and Tony totals still include unrelated existing rows outside this review.

The offline KB document rebuild contains **346** main-source documents and no Wragge documents. SHA-256: `ecccb1e3d0031a4d8a29ba03ba39096ad47197cc0cc37fc9ebc022b3c9854294`. It was not sent to a KB. The scratch replay queued exactly **346** additional main-source slugs and recorded all **661** database corrections, including the **315** excluded Wragge corrections. Together with row 179, the unrepaired snapshot yields **750** corrections and **435** main-source queue entries.

## Rollout

**Rollout:** After row 179 and this lane merge, the next normal daily refresh's `link_speakers` pre-pass applies **661 additional corrections** to the production database, seeds Vincent Joseph Martin's reviewed member record if missing, records the audit receipts and queues **346 additional KB patches**. The 315 Wragge corrections stay outside exports and the KB. The next weekly run rebuilds speaker and parliamentarian exports, followed by the normal search/crawl build and publication gates. The existing monthly hygiene and `OPAX_SYNC_KB=1` patch-drain step corrects existing KB resources while preserving topic enrichment; daily bulk sync alone does not drain these historical patches. If neither lane has replayed yet, the combined totals are 750 corrections and 435 patches. To roll this lane back while retaining row 179, revert its resolver/facts changes together, restore the 661 measured rows' original `person_id` and `speaker_name_clean` from the pinned fixture, requeue the same 346 main-source slugs and rebuild the affected exports through the normal pipeline.

No production, KB or D1 writes, APH or ParlInfo requests, SSH, deployment or external messages were performed. All substantial commands ran at `nice -n 10`; observed load5 stayed below 40. Local logs, full JSONL documents, archived row 179 resolver and the scratch replay are under `~/opax-work/evidence/im-martin-identities/`. No `.ops/` files are committed.

## Export rebuilds and gates

Both full read-only source exports were rebuilt. Their bytes equal row 179's final raw exports: parliamentarians SHA-256 `3e8cffecc977749836dd02f96ec435a5b2c9393f9d2e0fd370d192ddcca45743`, speakers SHA-256 `2d55023b707bc048429abeab4183716ab4fffa9ff51e196cab05909054babbb1`. Applying the reviewed identity overlay again reproduces the shipped parliamentarian export exactly, with zero new changes and zero identity holds. The affected speaker rows likewise reproduce the shipped counts. Existing unrelated curated rows are retained. The [export receipt](2026-11-14-martin-exports.json) pins these results and the catalogue hashes.

`cd portal && npm run build:search` rebuilt search, crawl paths, hubs and the local assets required by the portal tests. Search version remains `052c0ed6be0c6ee1`; crawl counts and stamps were rebuilt. There is no tracked public-asset delta after rebuilding the affected exports. The identity correction changes stored and KB person ids, while preserving the already correct public Stephen name aggregate.

Commands and final checks:

```sh
nice -n 10 .venv/bin/python scripts/export_parliamentarians.py --defer-check
nice -n 10 .venv/bin/python scripts/export_speakers.py
# Incremental rebuild uses rebuild(..., baseline=<archived c4185f03b resolver>.resolve_attribution).
# The normal CLI compares the complete unrepaired snapshot (750 rows):
nice -n 10 .venv/bin/python scripts/rebuild_speech_identities.py --db ~/.cache/autoresearch/parli.db --out ~/opax-work/evidence/im-martin-identities/rebuild-combined
(cd portal && nice -n 10 npm run build:search)
nice -n 10 node scripts/stamp_assets.mjs
nice -n 10 node scripts/stamp_assets.mjs --check
```

- Identity Python suite: **771 passed** in **9.47 seconds**, including the held-row checks, full combined fixture replay, Wragge queue exclusions, both pipeline callers, chamber/seat boundaries and id-based rebuild counts.
- Revert proof: the new per-row suite against the archived row 179 resolver gives **661 failures, two passes**. Every proposed correction is caught; both held rows remain unchanged.
- Speaker, linker, hygiene, exporter, roster-identity and Handbook Python suite: **170 passed, 12 subtests passed** in **7.53 seconds**.
- From `portal/`, `npx tsc --noEmit`: **passed**, exit 0, with this worktree's `.venv/bin` on PATH.
- `stamp_assets.mjs --check` and `git diff --check`: **passed**.
- From `portal/`, `npm test --script-shell=/home/jake/opax-work/evidence/im-martin-identities/npm-concurrency-4-shell.sh`, with this worktree's `.venv/bin` on PATH: **4,907 passed, zero failures, zero cancellations, 11 skipped**, exit 0, **304.12 seconds**. The local shell wrapper executes `node --test --test-concurrency=4 test/*.test.mjs`; four direct workers at nice 10 were verified. `portal/package.json` is unchanged.
- Full-database conservation: **1,316,517 speech rows before and after**; both source and scratch file sizes are **28,851,892,224 bytes**. Final observed load5: **12.17**, below 40.
