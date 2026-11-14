# Roster provenance note review

Follow-up to the independent review of `2a3d20b43`, 14 November 2026. This supersedes that commit's 327-row, 549-field raw-date overlay. The [current findings](2026-11-14-roster-provenance-findings.json) retain all 2,002 original raw signals and the exact 60-conflict review cohort. The 81 observation classifications, 48 corpus matches, 279 unmatched intervals and both Fraser Anning holds are unchanged.

## Service date convention

The repository did not implement one consistent source convention. `docs/ELECTORATES.md` calls for half-open internal intervals (`start <= date < end`), while `docs/ELECTORATE_REFERENCE.md` and `Builder.history()` preserve source dates and reasons. The sweep identifies the large start clusters as polling days. Existing reviewed service records distinguish elections, dissolution and actual vacancies. The full OpenAustralia file normally ends older election retirements at dissolution, and defeats at polling day. Its 2010, 2019, 2022 and 2025 retirement rows instead often use polling day. The raw members table also contains expressly approximate speech/election fallbacks documented in `docs/DATA-MEMBERS.md`; those do not establish a service convention.

This overlay consistently uses **recorded House service events**: election starts at polling day; election retirement ends at dissolution; defeat ends at polling day; resignation, death or appointment requires the actual dated event. Ends are exclusive in internal service intervals. This historical recorded-service convention does not assert constitutional membership during the election campaign. Party changes and seat transitions are separate events and cannot establish a whole career. A source declaration, swearing-in or first speech cannot replace polling day. No declaration or swearing-in explanation is asserted for the two later by-election dates.

The pinned event pairs are in [the offline evidence](../../scripts/roster_provenance_sources.json). General-election polling days agree with `scripts/general_elections.json`; dissolution endpoints come from the saved non-current Handbook individuals and the retirement convention in older OpenAustralia rows. The by-election pairs require the same explicit OA person-to-PHID crosswalk, the CSV `by_election` reason and the cached Handbook start. Normalisation uses those exact events, without a fixed date offset. Every proposed endpoint is reviewed under this rule, including endpoints where both sources originally agree. Unexplained disagreements hold the entire row, including an otherwise agreeing endpoint.

## The 60 conflicts

Source A is the byte-pinned OpenAustralia `representatives.csv` used by the published catalogue (SHA-256 `3c9a623c968eb3ce660626d0cc43eb4e503bd41be5ff83831718a36452a200b6`). Source B is the saved Handbook individuals response from 13 November, joined through the pinned OA person-to-PHID crosswalk. All 60 person IDs, fields, PHIDs and A/B values match the independent review exactly. The evidence file retains the original cache checksum, fetch timestamp, source URLs and all 1,881 identity/service summaries. No source was fetched for this review.

| Decision | Conflicts |
| --- | ---: |
| Normalise polling start | 2 |
| Normalise retirement to dissolution | 54 |
| Hold unresolved source conflict | 1 |
| Normalise defeat to polling day | 1 |
| Hold complete career | 2 |
| Total | 60 |

**57 normalised, three held.** The held rows are Emma Husar, David Jull and Belinda Neal. A convention value on a held row is a candidate boundary only, and is never applied. “Unresolved” means no single convention value can be selected from the available evidence.

| Person (OPAX ID) | Field | Source A: OpenAustralia | Source B: Handbook (PHID) | Convention value | Decision |
| --- | --- | --- | --- | --- | --- |
| Garth Hamilton (10963) | entered_house | 2020-12-03 | 2020-11-28 (291387) | 2020-11-28 | Normalise polling start |
| Sharon Bird (10043) | left_house | 2022-05-21 | 2022-04-11 (DZP) | 2022-04-11 | Normalise retirement to dissolution |
| Anthony Byrne (10088) | left_house | 2022-05-21 | 2022-04-11 (008K0) | 2022-04-11 | Normalise retirement to dissolution |
| Michael Danby (10165) | left_house | 2019-05-18 | 2019-04-11 (WF6) | 2019-04-11 | Normalise retirement to dissolution |
| Kate Ellis (10198) | left_house | 2019-05-18 | 2019-04-11 (DZU) | 2019-04-11 | Normalise retirement to dissolution |
| Joel Fitzgibbon (10230) | left_house | 2022-05-21 | 2022-04-11 (8K6) | 2022-04-11 | Normalise retirement to dissolution |
| Jenny Macklin (10409) | left_house | 2019-05-18 | 2019-04-11 (PG6) | 2019-04-11 | Normalise retirement to dissolution |
| Julie Owens (10503) | left_house | 2022-05-21 | 2022-04-11 (E09) | 2022-04-11 | Normalise retirement to dissolution |
| Graham Perrett (10512) | left_house | 2025-05-03 | 2025-03-28 (HVP) | 2025-03-28 | Normalise retirement to dissolution |
| Maria Vamvakinou (10649) | left_house | 2025-05-03 | 2025-03-28 (00AMT) | 2025-03-28 | Normalise retirement to dissolution |
| Gai Brodtmann (10738) | left_house | 2019-05-18 | 2019-04-11 (30540) | 2019-04-11 | Normalise retirement to dissolution |
| Cathy McGowan (10798) | left_house | 2019-05-18 | 2019-04-11 (123674) | 2019-04-11 | Normalise retirement to dissolution |
| Linda Burney (10858) | left_house | 2025-05-03 | 2025-03-28 (8GH) | 2025-03-28 | Normalise retirement to dissolution |
| Emma Husar (10869) | left_house | 2019-05-18 | 2019-04-11 (263328) | Unresolved | Hold: resignation reason unresolved |
| Brian Mitchell (10871) | left_house | 2025-05-03 | 2025-03-28 (129164) | 2025-03-28 | Normalise retirement to dissolution |
| Kevin Andrews (10014) | left_house | 2022-05-21 | 2022-04-11 (HK5) | 2022-04-11 | Normalise retirement to dissolution |
| Julie Bishop (10047) | left_house | 2019-05-18 | 2019-04-11 (83P) | 2019-04-11 | Normalise retirement to dissolution |
| Steven Ciobo (10122) | left_house | 2019-05-18 | 2019-04-11 (00AN0) | 2019-04-11 | Normalise retirement to dissolution |
| Luke Hartsuyker (10285) | left_house | 2019-05-18 | 2019-04-11 (00AMM) | 2019-04-11 | Normalise retirement to dissolution |
| Greg Hunt (10319) | left_house | 2022-05-21 | 2022-04-11 (00AMV) | 2022-04-11 | Normalise retirement to dissolution |
| Steve Irons (10326) | left_house | 2022-05-21 | 2022-04-11 (HYM) | 2022-04-11 | Normalise retirement to dissolution |
| Dennis Jensen (10337) | left_house | 2016-05-09 | 2016-07-02 (DYN) | 2016-07-02 | Normalise defeat to polling day |
| Michael Keenan (10356) | left_house | 2019-05-18 | 2019-04-11 (E0J) | 2019-04-11 | Normalise retirement to dissolution |
| Andrew Laming (10377) | left_house | 2022-05-21 | 2022-04-11 (E0H) | 2022-04-11 | Normalise retirement to dissolution |
| Nola Marino (10416) | left_house | 2025-05-03 | 2025-03-28 (HWP) | 2025-03-28 | Normalise retirement to dissolution |
| Christopher Pyne (10524) | left_house | 2019-05-18 | 2019-04-11 (9V5) | 2019-04-11 | Normalise retirement to dissolution |
| Rowan Ramsey (10529) | left_house | 2025-05-03 | 2025-03-28 (HWS) | 2025-03-28 | Normalise retirement to dissolution |
| Paul Fletcher (10723) | left_house | 2025-05-03 | 2025-03-28 (L6B) | 2025-03-28 | Normalise retirement to dissolution |
| Kelly O'Dwyer (10724) | left_house | 2019-05-18 | 2019-04-11 (LKU) | 2019-04-11 | Normalise retirement to dissolution |
| George Christensen (10726) | left_house | 2022-05-21 | 2022-04-11 (230485) | 2022-04-11 | Normalise retirement to dissolution |
| Ken O'Dowd (10728) | left_house | 2022-05-21 | 2022-04-11 (139441) | 2022-04-11 | Normalise retirement to dissolution |
| Karen Andrews (10745) | left_house | 2025-05-03 | 2025-03-28 (230886) | 2025-03-28 | Normalise retirement to dissolution |
| Jane Prentice (10753) | left_house | 2019-05-18 | 2019-04-11 (217266) | 2019-04-11 | Normalise retirement to dissolution |
| Ann Sudmalis (10795) | left_house | 2019-05-18 | 2019-04-11 (241586) | 2019-04-11 | Normalise retirement to dissolution |
| David Gillespie (10801) | left_house | 2025-05-03 | 2025-03-28 (72184) | 2025-03-28 | Normalise retirement to dissolution |
| Andrew Broad (10803) | left_house | 2019-05-18 | 2019-04-11 (30379) | 2019-04-11 | Normalise retirement to dissolution |
| Craig Laundy (10810) | left_house | 2019-05-18 | 2019-04-11 (247130) | 2019-04-11 | Normalise retirement to dissolution |
| Christian Porter (10815) | left_house | 2022-05-21 | 2022-04-11 (208884) | 2022-04-11 | Normalise retirement to dissolution |
| Nicolle Flint (10882) | left_house | 2022-05-21 | 2022-04-11 (245550) | 2022-04-11 | Normalise retirement to dissolution |
| Jennie George (10246) | left_house | 2010-08-21 | 2010-07-19 (JH5) | 2010-07-19 | Normalise retirement to dissolution |
| Julia Irwin (10327) | left_house | 2010-08-21 | 2010-07-19 (83Z) | 2010-07-19 | Normalise retirement to dissolution |
| Roger Price (10519) | left_house | 2010-08-21 | 2010-07-19 (QI4) | 2010-07-19 | Normalise retirement to dissolution |
| Kay Hull (10315) | left_house | 2010-08-21 | 2010-07-19 (83O) | 2010-07-19 | Normalise retirement to dissolution |
| Duncan Kerr (10365) | left_house | 2010-08-21 | 2010-07-19 (RH4) | 2010-07-19 | Normalise retirement to dissolution |
| Lindsay Tanner (10621) | left_house | 2010-08-21 | 2010-07-19 (YU5) | 2010-07-19 | Normalise retirement to dissolution |
| Pat Farmer (10212) | left_house | 2010-08-21 | 2010-07-19 (00AMO) | 2010-07-19 | Normalise retirement to dissolution |
| Petro Georgiou (10248) | left_house | 2010-08-21 | 2010-07-19 (HM5) | 2010-07-19 | Normalise retirement to dissolution |
| David Jull (10351) | entered_house | 1984-12-01 | 1975-12-13 (MH4) | Unresolved | Hold: two House stints |
| Peter Lindsay (10391) | left_house | 2010-08-21 | 2010-07-19 (HK6) | 2010-07-19 | Normalise retirement to dissolution |
| Margaret May (10426) | left_house | 2010-08-21 | 2010-07-19 (83B) | 2010-07-19 | Normalise retirement to dissolution |
| Chris Pearce (10511) | left_house | 2010-08-21 | 2010-07-19 (A8W) | 2010-07-19 | Normalise retirement to dissolution |
| Danna Vale (10647) | left_house | 2010-08-21 | 2010-07-19 (VK6) | 2010-07-19 | Normalise retirement to dissolution |
| James Bidgood (10040) | left_house | 2010-08-21 | 2010-07-19 (HVM) | 2010-07-19 | Normalise retirement to dissolution |
| Jodie Campbell (10101) | left_house | 2010-08-21 | 2010-07-19 (HWC) | 2010-07-19 | Normalise retirement to dissolution |
| Bob Debus (10171) | left_house | 2010-08-21 | 2010-07-19 (8IS) | 2010-07-19 | Normalise retirement to dissolution |
| Belinda Neal (10479) | left_house | 2010-08-21 | 2010-07-19 (B36) | 2010-07-19 | Hold: disjoint Senate/House career |
| Gavin Pearce (10918) | left_house | 2025-05-03 | 2025-03-28 (282306) | 2025-03-28 | Normalise retirement to dissolution |
| Kylea Tink (10992) | left_house | 2025-05-03 | 2025-03-28 (300124) | 2025-03-28 | Normalise retirement to dissolution |
| Vince Connelly (10939) | left_house | 2022-05-21 | 2022-04-11 (282984) | 2022-04-11 | Normalise retirement to dissolution |
| Kerryn Phelps (10913) | entered_house | 2018-11-05 | 2018-10-20 (008Z0) | 2018-10-20 | Normalise polling start |

## Complete careers and corrected samples

The catalogue omits source rows ending before 13 March 1993 (`Builder.history()`). A single catalogue row therefore cannot prove a single career. The audit now reads all 851 dated source rows without that filter, follows exact source row keys and reviewed full names, and checks the Handbook service envelope, chamber list and gaps in represented parliaments. It also checks the existing accepted/reviewed/shipped service and affiliation inventory: none of those additional intervals belongs to the 319 accepted raw rows. Source summaries cannot fill service gaps. Multiple rows, seats, disjoint parliaments or an unscoped Senate/House summary remain held; exact full-name collisions are never merged.

| Sample | Previous proposal | Revised decision |
| --- | --- | --- |
| Kerryn Phelps (10913) | Start 2018-11-05 | Start **2018-10-20**, the recorded by-election polling day. End remains 2019-05-18 under the defeat convention. |
| Linda Burney (10858) | End 2025-05-03 | End **2025-03-28**, the retirement/dissolution boundary. Start remains 2016-07-02. |
| David Jull (10351) | Start 1984-12-01; end 2007-10-17 | **Hold both corrections.** The full source records Bowman 1975-12-13 to 1983-03-05, then Fadden 1984-12-01 to 2007-10-17. Handbook first service is 1975-12-13. The raw 1976-03-02 / 2007-09-20 values remain unverified and unchanged in scratch. |

The invented Quinn Harrowgate fixture has a 1975 to 1983 stint and a second stint from 1984, while its published catalogue contains only the latter. It must hold the whole row and retain both source intervals. Other guards cover retirement versus defeat normalisation, by-election polling dates, unexplained resignation/date disagreement, current-person end cutoffs, mixed-house summaries and changed source bytes.

| Newly held row | Reason |
| --- | --- |
| David Jull | Two non-contiguous House stints, including pre-1993 service |
| Robert Brown | Hunter and Charlton source rows; no arbitrary later-seat selection |
| Richard Evans | Two source rows sharing the reviewed full name across Capricornia and Cowan; identity/career scope unresolved, without merging them |
| Belinda Neal | Disjoint Senate/House career and gaps in represented parliaments |
| David Smith | Current person with a combined Senate/House summary, not a House-specific start |
| David Feeney | Combined Senate/House service summary |
| Gareth Evans | Combined Senate/House service summary |
| Emma Husar | CSV says resigned but the two dates are polling day and dissolution; retirement normalisation cannot resolve the event reason |

Overall, **319 raw rows receive 535 changes: 319 starts and 216 ends**. The other 1,683 rows remain held: 1,613 have no exact-ID catalogue term, 62 already have multiple catalogue terms/seats, four have additional complete-career rows or gaps, and four have unresolved/scoped-source issues. After the overlay, 1,759 rows still carry unverified raw-ID coverage flags; corrections do not repair attached namesake speeches.

## Published files, scratch and holds

No tracked export or published portal data changes. The comparison is against the branch base `2ccd62bd175cb0779936cf63a79e0564f006ea2e`; the independent review established that the 128 public-file differences against later main are portrait commits. The 81 Handbook metadata classifications and all party windows remain as reviewed in `2a3d20b43`. New source evidence, findings, tests and reports are repository metadata/code.

The previous scratch overlay was first checked against all 2,699 original member rows, restored to source values, then replaced with this review. Exactly 319 rows and 535 endpoint fields differ; every other member value agrees with the read-only source, including Jull's unchanged held row. The source database size and nanosecond mtime are unchanged. No production, KB or remote D1 writes, deploys or SSH occurred. The Fraser Anning windows remain held pending Senate Journals; APH and ParlInfo were not fetched.

## Gates

All final gates passed. Local logs and receipts are outside the repository in `/home/jake/opax-work/evidence/im-roster-provenance/`, with the `note-review-` prefix. Heavy processes run at nice 10 and pause whenever five-minute load exceeds 40.

- The independently reported votes-CSV failure passed unchanged in isolation: one test, 63.06 seconds (64.40 seconds for the Node run). It exercised real local D1 export of 50,001 matching rows, the 50,000-row cap and the truncation note. The earlier `Export unavailable` failure is not reproduced; its exact underlying cause is not established.

No portal product change or timeout extension was needed for that isolated rerun. The full `npm test` run uses `node --test --test-concurrency=4 test/*.test.mjs`. Its local wrapper temporarily puts the flag before file arguments and restores `package.json` byte-for-byte afterwards; appending the flag after npm's existing file arguments does not set the worker limit.


- Full Python roster/state/profile suite and vote-party tests: **251 passed, 14,182 subtests passed**, 843.97 seconds. Both A/B shipped-identity replay scenarios pass with the existing 300-second subprocess limit. No timeout was extended.
- Full portal `npm test`, concurrency 4: **4,979 passed, zero failed, zero skipped**, 391.80 seconds. `OPAX_PYTHON=/home/jake/opax/.venv/bin/python` reused the existing local environment with `openpyxl` 3.1.5. No dependency download was required. The earlier system-Python run had 4,968 passes and eleven missing-module skips; the final full run covers all eleven.
- The votes-CSV cap test also passed in both full runs, including the final run in 24.25 seconds. No portal code change was needed; the independent review's failure remains unreproduced, with its underlying cause unestablished.
- Focused provenance, period and vote-party guards: **73 passed**. The previous-rule probe reproduces the invented two-stint failure: old code accepts 1984-12-01, new code holds both source stints.
- Roster accept list: **842 groups applied, 25 new rows, seven dropped rows, zero problems**.
- Scratch replay and exact member comparison: **319 rows, 535 fields**, all 2,699 rows compared, other values preserved, Jull unchanged, source size and nanosecond mtime unchanged.
- Asset stamp check and `git diff --check`: **passed**. Published export diff against the branch base: **zero files**.
