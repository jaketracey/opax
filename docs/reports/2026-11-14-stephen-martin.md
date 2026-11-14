# Stephen Martin and Wragge identity follow-up

Base: `origin/mf/179`, `72792fe3f`, which was available at the start. Branch: `im/stephen-martin`. Implementation: `0e0c2f9c8`; corpus-bound reconciliation: `942a72348`. This follows row 179's shared dated resolver, rather than introducing a second attribution path. The source is the read-only 10 November desktop snapshot, not a current production read.

The supplied ids were measured in full, without a speech-length floor: **3,889 stored rows**, comprising **3,763 parliamentary rows** and **126 committee rows**. Committee testimony retains its existing witness handling and is not assigned a parliamentary identity by this repair. Of the parliamentary rows, **752** contradict independently sourced service: **89** belong to the predecessor repair, **661** are corrected here, and **two** are held. The resolved cohort has **3,761 service-compatible rows and two holds**.

BACKLOG 3y2 was not present in the supplied worktree or the local locations searched. Its location was requested during the work. Additional, unspecified BACKLOG entries cannot be certified as completed. A wider, reproducible audit records the other findings separately, without inventing replacement identities.

## Measured id pairs

The following counts are additional to row 179's 85 Dickson and four Cunningham rows.

| Current id | Correct id | Source and dated seat | Moved |
| --- | --- | --- | ---: |
| `10905`, Steve Martin | `person_9c02d321caef54b2ba21a1f8`, Stephen Martin | Zenodo, Cunningham, 1998 to 2002; two full-name prints lack a seat | 346 |
| `10937`, Fiona Martin | `person_9c02d321caef54b2ba21a1f8`, Stephen Martin | Wragge, Cunningham 131; Macarthur 8 | 139 |
| `10937`, Fiona Martin | `person_6b7f7f7533045b15bff880a6`, Vincent Martin | Wragge, Banks 132 | 132 |
| `10592`, Tony Smith of Casey | `person_efb744ffb3a25d578e592281`, Anthony Charles Smith | Wragge, Dickson, 1998 | 44 |
| **Total** | | | **661** |

All **273** Wragge rows under Fiona Martin were accounted for: **131 Cunningham + 8 Macarthur + 132 Banks + 2 holds**. The holds remain under their original id:

| Speech id | Date | Print | Reason |
| --- | --- | --- | --- |
| `615266` | 1972-03-23 | `Mr MARTIN` | Surname-only print with no seat. No inferred Banks attribution. |
| `622652` | 1973-11-29 | `The DEPUTY SPEAKER (Mr Martin` | Presiding-officer turn with no seat. The member-speech resolver does not identify its office holder. |

The [663-row metadata fixture](../../tests/fixtures/speech-identities/martin-wragge.json) includes every follow-up row and both holds. The [rebuild receipt](2026-11-14-stephen-martin-rebuild.json) pins the moved ids, original-row checksums, source, date and seat.

## Evidence and matching boundaries

The [reviewed source facts](../../parli/ingest/federal_speaker_identities.json) and the fixture independently retain these OpenAustralia records:

- Stephen Paul Martin: Macarthur, 1984-12-01 to 1993-03-13; Cunningham service and party periods from 1993-03-13 to 2002-08-16. The affected Cunningham rows fall within the 1996-04-30 to 2002-08-16 period. The existing catalogue identity is reused.
- Vincent Joseph Martin: Banks, 1969-10-25 to 1980-09-19, representative record **356**, OpenAustralia person **421**, legacy person id **10421**, Handbook **KN9**. Neither the snapshot's members table nor the published post-1993 catalogue contains his own identity. His stable catalogue id is `stable_id('person', 'oa:Vincent Joseph Martin')`. The new member record uses his full name and sourced dates; Wragge exclusion means no new public profile is manufactured.
- Anthony Charles Smith: Dickson, 1996-03-02 to 1998-10-03, Handbook **SK6**, reusing the existing catalogue identity.
- The held Handbook distinguishes Steve Martin's Senate service, Tasmania, 2018-02-09 to 2019-06-30, from Stephen Martin's House service. It also places Fiona Martin in Reid in 2019 to 2022 and Tony Smith in Casey from 2001, rather than trusting their contaminated `members` dates.

The pinned [representatives register](https://raw.githubusercontent.com/openaustralia/openaustralia-parser/061ec16fdc68ef52544a35d8c4f6413e4622e6cb/data/representatives.csv) has SHA-256 `3c9a623c968eb3ce660626d0cc43eb4e503bd41be5ff83831718a36452a200b6`; the pinned [people register](https://raw.githubusercontent.com/openaustralia/openaustralia-parser/061ec16fdc68ef52544a35d8c4f6413e4622e6cb/data/people.csv) has SHA-256 `42e310b1a1e8b63243e6027f0c07303bf068c1ef9db5d9fc9744880d93ed007f`. These match the predecessor's held source digests. They were retrieved with User-Agent `opax-improve-audit`, one second apart. Handbook evidence was read from the existing 13 November cache; no APH or ParlInfo request was made.

The shared resolver checks source, original print, prior id, chamber, service date and exact reviewed seat print. `MACARTHUR` and `BANKS, NEW SOUTH WALES` are explicit source variants. Only the full personal print `Stephen Martin` can use the two missing-seat rows. Conflicting identity matches return no decision. The new rules require the measured prior id or an already corrected id; they do not broaden the predecessor's unlinked-row rules. Existing member conflicts skip only that target identity, even when another target shares its old id.

## Ten moved rows

Each row is a House speech. The receipt supplies its complete original-row checksum. Evidence codes: **C** = OpenAustralia Cunningham record 580, **M** = Macarthur record 355, **B** = Banks record 356, **D** = the predecessor's independently held Dickson term `term_7c92080334c6545eaee623fe`.

| Speech id and unchanged citation | Date | Source | Original print | Recorded seat | Destination and evidence |
| --- | --- | --- | --- | --- | --- |
| `speech-91` | 1998-03-02 | Zenodo | `Martin, Stephen, MP` | Cunningham | Stephen Martin, C |
| `speech-79976` | 2002-06-27 | Zenodo | `Martin, Stephen, MP` | Cunningham | Stephen Martin, C |
| `speech-653750` | 1998-03-02 | Wragge | `Mr MARTIN` | Cunningham | Stephen Martin, C |
| `speech-672567` | 2002-06-27 | Wragge | `Dr MARTIN` | Cunningham | Stephen Martin, C |
| `speech-651802` | 1988-03-23 | Wragge | `Mr MARTIN` | MACARTHUR | Stephen Martin, M |
| `speech-653137` | 1990-09-13 | Wragge | `Mr MARTIN` | MACARTHUR | Stephen Martin, M |
| `speech-605436` | 1970-03-18 | Wragge | `Mr MARTIN` | Banks | Vincent Martin, B |
| `speech-610663` | 1971-03-09 | Wragge | `Mr MARTIN` | BANKS, NEW SOUTH WALES | Vincent Martin, B |
| `speech-653698` | 1998-03-02 | Wragge | `Mr TONY SMITH` | Dickson | Anthony Charles Smith, D |
| `speech-656266` | 1998-07-03 | Wragge | `Mr TONY SMITH` | Dickson | Anthony Charles Smith, D |

## Counts and exports

The before column below starts after the predecessor's 89 corrections. Counts include all stored sources, including committee testimony still attached to the legacy ids; they are not public profile totals.

| Stored id | Before | After | Change |
| --- | ---: | ---: | ---: |
| `10905`, Steve Martin | 346 | 0 | -346 |
| Stephen Martin catalogue id | 4 | 489 | +485 |
| `10937`, Fiona Martin | 637 | 366 | -271 |
| Vincent Martin catalogue id | 0 | 132 | +132 |
| `10592`, Tony Smith | 2,817 | 2,773 | -44 |
| Anthony Charles Smith catalogue id | 85 | 129 | +44 |

**Public speech counts do not change in this follow-up.** Row 179's checked-in exports already carry the corrected aggregate names and Stephen Martin's correct profile id. These are repository export counts, not a live production measurement. The 346 additional main-source rows already have the display name Stephen Martin; this follow-up repairs their stored ids and KB metadata. All 315 newly moved Wragge rows remain excluded by the existing public corpus rules. Short rows also retain the existing length threshold.

| Profile | Parliamentarian directory, before to after | Speaker directory, before to after |
| --- | --- | --- |
| Stephen Martin | 299 to 299 | 299 to 299 |
| Steve Martin | no published profile, 0 to 0 | absent, 0 to 0 |
| Fiona Martin | 244 to 244 | 244 to 244 |
| Tony Smith, Casey | 380 to 380 | 401 to 401 |
| Anthony Charles Smith, Dickson | 76 to 76 | 76 to 76 |
| Vincent Martin | no published profile, 0 to 0 | absent, 0 to 0 |

The complete same-snapshot raw parliamentarian export is identical across all **1,554** person records and **555,193** counted speeches. The complete speaker export is identical across all **2,364** names, including the same **16,964** committee twins excluded. Its comparison read **617,834** eligible source rows. The machine-readable audit receipt includes both full comparisons. The checked-in public directory and speaker assets are unchanged. No production, KB or D1 write, deployment or SSH operation is part of this branch. The scratch replay queues patches locally and never drains them.

## Wider audit and replay

The all-federal audit includes Wragge and Senate records, all dates and no speech-length floor. Its independently sourced input comprises **1,547** OpenAustralia House and held historical Senate periods. Missing evidence is reported separately from a demonstrated service conflict. It does not certify missing-evidence records or select new people from surname similarity.

| Result | Stored ids | Resolved ids |
| --- | ---: | ---: |
| Checked | 729,876 | 729,876 |
| Compatible with held service | 413,604 | 414,354 |
| Chamber mismatch | 6,398 | 6,052 |
| Outside held service dates | 26,455 | 26,051 |
| Seat mismatch | 12,619 | 12,619 |
| Missing service evidence | 270,800 | 270,800 |

The removed conflict-id set is **exactly the predecessor's 89 plus this branch's 661**, with **zero introduced conflicts**. Remaining findings are not exceptions or approved replacements. The [grouped wider audit receipt](2026-11-14-stephen-martin-audit.json) lists every unresolved current id, replacement id where established, reason, source and count. Detailed row-level output remains in the local evidence directory. Replacement ids for the other findings remain unresolved because a dated service conflict alone does not establish who actually spoke.

The integrated roster-period gate also required the follow-up anticipated in row 179. `audit_roster_periods.py --identity-db` now reaggregates the **3,446** affected non-Wragge source rows through the shared resolver before joining prints to own-house corpus bounds. The aggregate alone has no seat, so it cannot authorise a repair. A mismatched cohort count fails closed. Catalogue people already published under their stable ids share that same actor in the interval inventory; a conflicting canonical id cannot capture another person through a shared print.

Stephen Martin and Anthony Charles Smith now have their own canonical-id bounds, records **91** and **5**, both dated 1998-03-02. Casey's literal own-house bound moves from the misassigned 1998 record to **2006-02-09**, record **770517**, distinct from the eligible profile's 2011 first year. Fiona Martin's earliest own-house record is her **2019-07-22** vote, distinct from her first eligible speech on 2019-07-25. All other people's bounds and all source service endpoints are unchanged.

All seven obsolete namesake allowances are removed: four exception rows are deleted and three Casey rows are converted to ordinary, independently covered later-period exceptions. Nine missing-bound entries are removed after the two canonical actors gain traceable bounds. SA records and service dates are unchanged. The read-only resolver path over the original snapshot reproduces the repaired scratch database's bounds exactly.

Reproduce this scoped integration with the held original aggregate:

```sh
python3 scripts/audit_roster_periods.py \
  --corpus-raw /home/jake/opax-work/evidence/im-sa-council-evidence/note1/corpus-earliest-raw.json \
  --identity-db /home/jake/.cache/autoresearch/parli.db
```

Offline reproduction, with the pinned CSVs and their existing acquisition receipts available locally:

```sh
python3 scripts/build_speech_service_evidence.py \
  --openaustralia-dir "$EVIDENCE" \
  --politicians-dir /home/jake/opax-staging/federation/roster/raw/acquired \
  --out "$EVIDENCE/service-evidence.json"
python3 scripts/audit_speech_service.py \
  --db /home/jake/.cache/autoresearch/parli.db --all-federal --raw \
  --service-evidence "$EVIDENCE/service-evidence.json" --out "$EVIDENCE/audit-raw.json"
python3 scripts/audit_speech_service.py \
  --db /home/jake/.cache/autoresearch/parli.db --all-federal \
  --service-evidence "$EVIDENCE/service-evidence.json" --out "$EVIDENCE/audit-resolved.json"
```

The audit intentionally exits 1 while unresolved findings remain. Add repeated `--person-id 10592 --person-id 10905 --person-id 10937` options to reproduce the supplied-id cohort. The service-input builder performs no fetching and verifies its input digests and acquisition receipts.

A disposable copy of the extracted snapshot metadata, with full original rows restored for the affected ids, replayed **89 predecessor moves, 661 follow-up moves, then zero moves on the second pass**. It contains **435 local pending patches**, the predecessor’s 89 plus the 346 new main-source rows. The 315 Wragge corrections receive audit receipts and no KB patches, preserving their corpus exclusion. Only the 346 new main-source documents are rebuilt for KB-shape validation. The complete speech-id set and every moved row's raw fields, text, party and date were preserved. The rebuilt document slugs are the same `speech-<id>` citations.

Local receipts and logs: `/home/jake/opax-work/evidence/im-stephen-martin/`.

## Final gates and task acceptance

- Shared dated resolver, linker and hygiene paths: verified by the full held-row replay, wrong seat/chamber/date and witness refusals, conflicting-match holds, per-target member conflicts, stable citations, raw-field preservation and idempotence. The new rules do not claim unlinked or unrelated prior ids.
- Final Python identity, rebuild, exporter and corpus-bound gate: **797 passed, six subtests passed**, 27.29 seconds. Command: `.venv/bin/python -m pytest -q tests/test_federal_speaker_identities.py tests/test_martin_wragge_identities.py scripts/test_roster_periods.py scripts/test_export_parliamentarians.py`.
- Speaker, parser, hygiene and exporter checks: **897 passed**, 21.51 seconds. This overlaps the identity gate; the counts are not additive.
- Frozen weekly export replay, both scenarios: **one test and two subtests passed**, 734.36 seconds. No timeout was relaxed.
- The initial broader Python run passed **1,063 tests and 14,182 subtests**, with four failures: a missing local `lxml` dependency, two frozen-replay subtest timeouts during load pauses, and the integrated corpus-bound gap described above. `lxml` was installed from the existing offline cache into the task's own environment. The final parser, frozen-replay and bound checks cover all four failures successfully.
- Full portal `npm test` through the untracked local script-shell wrapper: **4,970 passed, 11 skipped, zero failures or cancellations**, 644.69 seconds, exit 0. The wrapper invokes `node --test --test-concurrency=4 test/*.test.mjs`, placing the concurrency flag before the files. The repository package script is unchanged. The initial run was stopped after exposing missing ignored search/crawl assets and a pause-sensitive timing test; the normal offline `npm run build:search` prepared the required assets before the successful complete rerun. The table step generated local SQL files only.
- From `portal/`, `npx --no-install tsc --noEmit`: **passed**, exit 0. Missing ignored runtime declarations were generated locally with `npm run types`.
- `node scripts/stamp_assets.mjs --check`: **passed**, exit 0. Search/crawl and other required assets were generated locally; the only unrelated tracked generated value was restored. No public asset source or directory export is changed in this branch.
- `scripts/roster_accept.py --check`: **736 records, 844 groups applied, 26 new rows, seven existing drops, zero problems**.
- Complete read-only speaker and parliamentarian export comparisons, exact conflict-id-set comparison, scratch repair replay, queue exclusion for Wragge and original-vs-repaired corpus-bound comparison: **passed**.
- `git diff --check`: **passed**. No `.ops/` file is included. Heavy commands run at `nice -n 10` under a monitor that pauses their process groups whenever the five-minute load exceeds 40; extended pauses occurred while the shared load reached approximately 48. Final gates completed after the load fell below the limit.
- The original database remains **28,851,892,224 bytes**, mtime **2026-11-10T10:23:44.736218+00:00**, unchanged from the initial check. Every source connection used read-only mode. Database updates and patch queues were confined to scratch copies; no production, KB or D1 writes, deployment, SSH, APH fetch or ParlInfo fetch occurred.

The explicitly supplied id pairs, moved-row evidence, public count comparisons, tests and branch publication are handled. Additional unspecified BACKLOG 3y2 entries remain unverified because that file was unavailable; the broader unresolved findings are recorded rather than guessed.
