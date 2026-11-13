# Federal vote rows: the party held on the vote date, 13 November 2026

Follow-up to the separate finding in `2026-11-13-vote-parties.md`. Federal division rows showed each member's latest party on every date. For example, Barnaby Joyce was "One Nation" on 2013 divisions, Craig Kelly "United Australia Party" from 2010 and Russell Broadbent "Independent" from 2006. These labels feed the party lines on division pages, so a 2013 division showed a One Nation vote that never happened.

No parliament website was read, and nothing was deployed. Everything below comes from the committed division pages, the committed electorate release and roster evidence, and this host's `parli.db` (copied 10 November). The database was used only for the Hansard cross-check.

## Where the labels come from

- **The party field:** federal rows take it from `ext_votes.party`. `parli/ingest/votes_ingest.py` (`read_legacy`) fills that column through `parli/ingest/federal_affiliations.py` (`FederalAffiliations.at`). That function reads the party TheyVoteForYou attaches to each vote in its division detail, or the `tvfy_vote_parties` table.
- **Why it is undated:** TheyVoteForYou's per-vote party is the member's latest party, not the party held that day. The module's docstring already warns about this ("never read the undated members party"), but the per-vote party carries the same problem.
- **The export:** `scripts/export_division_pages.py` publishes these labels, and `scripts/division_rules.py` normalises them (office codes out, one label per party).
- **The dated record:** the electorate release's term party periods, which come from OpenAustralia service records. They have day precision and give a reason for each change. They cover the federal House only.

## Measure: the 12,680 disagreements

The release's dated periods were applied to every labelled federal House row, matched by person ID. They disagree with the source label on exactly 12,680 rows, all belonging to 13 people.

| Class | Rows | People |
| --- | ---: | --- |
| (a) Naming variant of the same party | 1,462 | Andrew Wallace, LNP / Liberal (1,121); Rebekha Sharkie, Centre Alliance / Nick Xenophon Team (310); Clive Palmer, United Australia Party / Palmer United Party (31) |
| (b) Real change: the label is a party joined later | 4,022 | Barnaby Joyce, One Nation (1,799); Craig Kelly, United Australia Party (1,923: 1,774 while Liberal, 149 while an independent); Bob Katter, Katter's Australian Party before it existed (300) |
| (c) Presiding officers and independents: the label is "Independent" for a member who sat for a party that day | 7,196 | Russell Broadbent (2,574); Ian Goodenough (1,679); Andrew Gee (1,253); Peter Slipper (724, before he became Speaker); Craig Thomson (558); Julia Banks (408) |
| (d) The dated record looks wrong | 0 confirmed | See below |
| **Total** | **12,680** | |

Presiding-officer rows themselves are not in this set. Their party field holds an office code, and im-vote-parties already publishes those rows without a party. Slipper is in (c) because the source labels his whole career with the "Independent" he took as Speaker.

A further 8,667 labelled rows are those of five Queensland LNP members (Scott Buchholz, Michelle Landry, David Littleproud, Ted O'Brien and Llew O'Brien). An exact comparison read these as "conflicting", because the release files each member's term as Liberal or Nationals and the 4 September 2026 roster as LNP. Compared in substance, all three labels agree, so these rows are not disagreements and do not change.

### Samples

**(a) Naming variants (kept as the source gives them).**

| Division | Date | Member | Source label | Dated record |
| --- | --- | --- | --- | --- |
| division-federal-representatives-3020 | 2013-11-20 | Clive Palmer | United Australia Party | Palmer United Party |
| division-federal-representatives-3323 | 2014-07-14 | Clive Palmer | United Australia Party | Palmer United Party |
| division-federal-representatives-3710 | 2015-03-05 | Clive Palmer | United Australia Party | Palmer United Party |
| division-federal-representatives-4258 | 2016-05-05 | Clive Palmer | United Australia Party | Palmer United Party |
| division-federal-representatives-4259 | 2016-08-31 | Andrew Wallace | LNP | Liberal |
| division-federal-representatives-6057 | 2019-11-27 | Andrew Wallace | LNP | Liberal |
| division-federal-representatives-7504 | 2021-11-22 | Andrew Wallace | LNP | Liberal |
| division-federal-representatives-4259 | 2016-08-31 | Rebekha Sharkie | Centre Alliance | Nick Xenophon Team |
| division-federal-representatives-4587 | 2017-03-01 | Rebekha Sharkie | Centre Alliance | Nick Xenophon Team |
| division-federal-representatives-5179 | 2018-03-27 | Rebekha Sharkie | Centre Alliance | Nick Xenophon Team |

**(b) Real party changes.**

| Division | Date | Member | Source label | Dated record |
| --- | --- | --- | --- | --- |
| division-federal-representatives-2442 | 2006-02-09 | Bob Katter | Katter's Australian Party | Independent |
| division-federal-representatives-304 | 2006-10-30 | Bob Katter | Katter's Australian Party | Independent |
| division-federal-representatives-496 | 2008-06-05 | Bob Katter | Katter's Australian Party | Independent |
| division-federal-representatives-926 | 2011-09-22 | Bob Katter | Katter's Australian Party | Independent |
| division-federal-representatives-3091 | 2010-09-29 | Craig Kelly | United Australia Party | Liberal |
| division-federal-representatives-4420 | 2016-11-23 | Craig Kelly | United Australia Party | Liberal |
| division-federal-representatives-7333 | 2021-06-24 | Craig Kelly | United Australia Party | Independent |
| division-federal-representatives-2988 | 2013-11-13 | Barnaby Joyce | One Nation | Nationals |
| division-federal-representatives-6042 | 2019-11-27 | Barnaby Joyce | One Nation | Nationals |
| division-federal-representatives-9804 | 2025-10-29 | Barnaby Joyce | One Nation | Nationals |

**(c) Presiding officers and independents.**

| Division | Date | Member | Source label | Dated record |
| --- | --- | --- | --- | --- |
| division-federal-representatives-2439 | 2006-02-07 | Peter Slipper | Independent | Liberal |
| division-federal-representatives-955 | 2011-11-23 | Peter Slipper | Independent | Liberal |
| division-federal-representatives-2439 | 2006-02-07 | Russell Broadbent | Independent | Liberal |
| division-federal-representatives-8412 | 2023-10-19 | Russell Broadbent | Independent | Liberal |
| division-federal-representatives-423 | 2008-02-12 | Craig Thomson | Independent | Labor |
| division-federal-representatives-975 | 2012-03-01 | Craig Thomson | Independent | Labor |
| division-federal-representatives-2988 | 2013-11-13 | Ian Goodenough | Independent | Liberal |
| division-federal-representatives-9292 | 2024-11-28 | Ian Goodenough | Independent | Liberal |
| division-federal-representatives-4259 | 2016-08-31 | Andrew Gee | Independent | Nationals |
| division-federal-representatives-4259 | 2016-08-31 | Julia Banks | Independent | Liberal |

### (d) Does the dated record look wrong anywhere?

**The check.** As a second, partly independent source, every corrected row was compared with the party printed on the member's own Hansard speeches (`speeches.party_canonical`). This is the timeline `export_bills.PartyTimeline` reads. The Hansard party was taken on the same day, or from agreeing observations on both sides within a year.

| Hansard on the 11,218 rows that change | Rows |
| --- | ---: |
| Agrees with the dated record | 10,146 |
| Agrees with the source label | 247 |
| Names a third party | 37 |
| Unclear, or no speech within a year | 788 |

**Where Hansard disagrees, the release is right.** The 284 rows where Hansard disagrees with the release were each checked against known dates:

- **Kelly (121 rows, March to June 2021):** Hansard prints "United Australia Party", but he joined it on 23 August 2021. The release has him as an independent from 23 February.
- **Kelly (37 rows):** Hansard prints "Independent" in October 2020, while he was still Liberal.
- **Slipper (125 rows, 2008 to 2011):** Hansard mixes "Independent" and Liberal on the same days, before he became Speaker in November 2011.
- **Banks (1 row, October 2018):** she left the Liberals on 27 November 2018.

The Hansard party is itself taken from OpenAustralia's member data, so it can lead or lag. It is a lead, not evidence. No row was held back on its account.

**One boundary looks approximate.** The release dates Ian Goodenough's change from Liberal to Independent as 31 December 2024 / 1 January 2025. A year-end date is a common placeholder, yet the release marks it with day precision. 115 corrected Goodenough rows fall between April and November 2024; if the true date is earlier in 2024, some of them read Liberal when they should not. Hansard gives no help here: it prints him Liberal in February 2025. This needs a reviewed entry in `scripts/roster_service.json` (that file's evidence is checked against the release, so a conflict would hold the label back) once the date is confirmed from a primary source. It was not confirmed here.

**Outside the 12,680, where the label and the release are both wrong.** These rows don't change under this rule, because the source label agrees with the release:

- **Harry Quick (241 rows, 2006 to 2007):** the release has one "Independent" period for his whole 1993 to 2007 term. Hansard prints him Labor on most 2006 and 2007 speaking days.
- **Michael Johnson (12 rows, 1 and 3 June 2010):** the release has him Liberal until the August 2010 election. Hansard prints him Independent in 2010.

A reviewed service entry for each would hold these labels back on the next nightly.

## The fix

**Where.** `scripts/vote_parties.py`, applied by `scripts/export_division_pages.py` on every nightly. This is the same pass that fills rows with no party (im-vote-parties), with the same evidence: the release term periods and roster, the official lists, the reviewed service records, confirmed Wikidata terms and agreeing brackets.

**Each source label is now checked against that evidence:**

| Dated evidence for the row's date | Result |
| --- | --- |
| Agrees in substance | Keep the source label as given (naming variants included). |
| Names a different party in substance | Replace with the dated party. The source label stays in `party_source.source_party`. |
| Conflicts in substance (a term and a list inside it disagree, or lists either side name different parties) | Hold the label back: no party, with the source label in `party_withheld`. |
| No covering evidence, no identity match, or an ambiguous identity (two people with that name) | Keep the source label. |

**Substance.** `same_party` uses the repo's alias map, `PARTY_CANONICAL` in `parli/ingest/tvfy_refresh.py`. That map already joins ALP and Labor, Nick Xenophon Team and Centre Alliance, Palmer United Party and United Australia Party, and Pauline Hanson's One Nation and One Nation. On top of that is a small explicit map: LNP and Country Liberal Party each match Liberal and Nationals, plus a few alias spellings. Liberal and Nationals stay two parties.

**Recomputed each night.** Each run first restores the source label on every corrected or held row, and removes every fill, before checking again from the snapshot. Withdrawn evidence clears on the next run, and a rerun is byte-stable (tested).

**Missing sources.** Every evidence source is optional, as im-vote-parties made it: a missing or unreadable one is skipped with one log line, and the nightly carries on. The electorate release is the dated record for federal labels, so if it does not load, the run logs one `WARNING` line and checks no source label at all. Every label stays as the source gives it, including any a previous night corrected, and the refresh does not fail. Gap fills still come from whatever other sources loaded (tested).

**After merging im-vote-parties (fix-1).** Brackets and Wikidata confirmation now stop at a general election (`scripts/general_elections.json`), not after four years. Labels are compared in substance inside that rule too. The counts are unchanged: 11,218 labels replaced, none held back and 3,123 gap fills (dry run with `parli.db`).

**Index.** `divisions/index.json` coverage gains `party_corrected_count` and `party_withheld_count`. `party_filled_count` now counts gap fills only. The run log prints all three.

### Result on the committed pages

| Outcome | Federal House | Federal Senate | Qld | Total |
| --- | ---: | ---: | ---: | ---: |
| Label agrees with the dated record | 442,052 | 0 | 114 | 442,166 |
| Naming variant kept | 1,462 | 0 | 0 | 1,462 |
| **Label replaced by the dated party** | **11,218** | **0** | **0** | **11,218** |
| **Label held back (unknown)** | **0** | **0** | **0** | **0** |
| Kept: no dated evidence for the date, or no match | 7,949 | 379,797 | 56 | 387,802 |

- **Rows that change:** 11,218, on 3,256 House divisions. In this dry run every changed party line is a House division.
- **Rows that go unknown:** none on the committed data. The hold-back rule is tested with fixtures.
- **Party lines that disappear:** One Nation from 1,799 divisions, United Australia Party from 1,894, Katter's Australian Party from 300, and Independent from 166. A Nationals line appears on 6 divisions where Joyce was the only Nationals member voting.
- **Gap fills are unchanged:** all 31,841 unlabelled rows resolve exactly as they did before this change. With `parli.db`, 3,123 are filled, the same count as im-vote-parties.

### Before and after

| Division | Date | Member | Before | After |
| --- | --- | --- | --- | --- |
| division-federal-representatives-2988 | 2013-11-13 | Barnaby Joyce | One Nation | Nationals |
| division-federal-representatives-5650 | 2019-02-12 | Barnaby Joyce | One Nation | Nationals |
| division-federal-representatives-9807 | 2026-01-20 | Barnaby Joyce | One Nation | One Nation (dated record agrees) |
| division-federal-representatives-3091 | 2010-09-29 | Craig Kelly | United Australia Party | Liberal |
| division-federal-representatives-7013 | 2021-03-15 | Craig Kelly | United Australia Party | Independent |
| division-federal-representatives-2439 | 2006-02-07 | Russell Broadbent | Independent | Liberal |
| division-federal-representatives-8379 | 2023-10-16 | Russell Broadbent | Independent | Liberal |
| division-federal-representatives-423 | 2008-02-12 | Bob Katter | Katter's Australian Party | Independent |
| division-federal-representatives-2582 | 2011-09-20 | Craig Thomson | Independent | Labor |
| division-federal-representatives-6172 | 2020-02-06 | Andrew Gee | Independent | Nationals |
| division-federal-representatives-4259 | 2016-08-31 | Andrew Wallace | LNP | LNP (naming variant, kept) |

## Senate

**Senate rows have the same problem.** 379,797 Senate rows carry a source label. Hansard, under the same rule as above, disagrees on at least 5,243 of them, agrees on 109,949 and is silent or unclear on 264,605. The known cases are clear:

| Division | Date | Member | Source label | Party that day |
| --- | --- | --- | --- | --- |
| division-federal-senate-1442 | 2008-02-13 | Barnaby Joyce | One Nation | Nationals |
| division-federal-senate-1250 | 2007-02-06 | Cory Bernardi | Australian Conservatives | Liberal |
| division-federal-senate-1250 | 2007-02-06 | Andrew Bartlett | Greens | Australian Democrats |
| division-federal-senate-1789 | 2010-02-02 | Nick Xenophon | Centre Alliance | Independent |
| division-federal-senate-113 | 2012-10-09 | John Madigan | Independent | DLP |
| division-federal-senate-10296 | 2023-03-24 | Fatima Payman | Australia's Voice | Labor |
| division-federal-senate-10296 | 2023-03-24 | Gerard Rennick | Gerard Rennick People First | Liberal |
| division-federal-senate-10296 | 2023-03-24 | David Van | Independent | Liberal |
| division-federal-senate-10419 | 2024-07-01 | Dorinda Cox | Labor | Greens |

**The Hansard count is only a rough lead.** It includes Hansard lag: it still prints Lidia Thorpe as Greens and Tammy Tyrrell as Jacqui Lambie Network after they left, and it prints Rex Patrick as Nationals, which he never was.

**Untouched, as the brief asks.** The release holds no Senate term party periods. The only dated Senate evidence is the 4 September 2026 roster, and no Senate division falls on that date. Every Senate label stays as the source gives it (tested).

**What would fix it:** dated Senate service records. OpenAustralia's Senate membership data is the same kind of source as the House periods the release already uses. Once those load into the release, or into `scripts/roster_service.json`, the next nightly applies this rule to Senate rows with no code change.

## Consumers checked

| Consumer | Reads | Follows the corrected labels? |
| --- | --- | --- |
| Division page, server render (`portal/src/seo-content.ts`, `divisionVotes`) | Shard rows and index `party_tallies` | Yes. The wording now separates a replaced label ("gives a party not held on this date") from a gap fill, and counts held labels with the unknown rows. A held label is never shown. |
| Division page, browser (`portal/public/app.js`) | Shard rows | Yes. Party lines come from `member.party`; held rows count in "N not placed with a party". |
| Division index tallies (`export_division_pages.party_tallies`) | Rows after the check | Yes (tested). |
| Ask `division` tool (`portal/src/tools/division.ts`) | Shard rows: party majorities, crossed-floor, person votes | Yes. Unchanged code. |
| Ask `member_divisions` (`portal/src/tools/member-divisions.ts`) | Shard rows and index tallies | Yes. Unchanged code. |
| Ask division aggregates and policy votes (`portal/src/tools/division-aggregates.ts`, `division-policy.ts`) | Index `party_tallies` | Yes. Unchanged code. |
| Party pages (`scripts/build_party_index.mjs` builds `/graph/party-members.json` from shards; `portal/public/party-page.js`, `portal/src/index.ts`) | Shard rows | Yes, at build time: Joyce counts under Nationals for 2013 to 2025 votes, not One Nation. The page note "Division records use the latest recorded affiliation" is still true of Senate rows, so it is kept. The builder's comment is updated. |
| Bill page party splits (`scripts/export_bills.py`, `PartyTimeline`) | Hansard dated timeline, not row labels | Not affected: already dated by its own rule. |
| Person vote summaries (`scripts/export_votes.py`, `portal/public/votes.json`) | `members` table (federal) and the most common `ext_votes.party` (state) | Not affected: one current-party label per person, never a party line per vote. |
| Mobile votes contract (`scripts/vm/mobile_votes_contract.py`) | `votes.json` shape only | Not affected: no per-vote party. |
| Data validation (`scripts/vm/validate_data.py`) | Office codes in rows and tallies | Unchanged. A replaced label is never an office code (tested). |

## Tests

All test people are invented.

- **`tests/test_vote_parties.py`:** 10 new tests (36 in total after the merge).
  - A member who changed party shows the old party on old dates and the new one after.
  - Naming variants are never rewritten (LNP and Liberal, Centre Alliance and NXT, ALP and Labor, "Liberal National Party").
  - Liberal and Nationals stay two parties.
  - Ambiguous evidence holds the label back (a term with a disagreeing list inside it, and disagreeing lists either side).
  - No covering evidence, or two people with one name, keeps the label.
  - Senate rows are untouched without dated Senate evidence.
  - Corrections and holds are recomputed from the source label, and withdrawn evidence clears them.
  - Without the dated release, no label is checked or changed, and earlier corrections go back to the source label.
  - `same_party` cases.
  - An export integration test: tallies follow the correction, reruns are byte-stable, and withdrawal clears.
- **`portal/test/division-parties.test.mjs`:** 2 new tests (7 in total after the merge).
  - Replaced-label wording, with no "gap fill" wording and no stale party.
  - A held label is counted in words and never shown.
- **`scripts/vm/test_nightly.sh`:** the fixture sandbox now copies `vote_parties.py`, its evidence files and `tvfy_refresh`'s imports, and holds an empty electorate release. The exporter has imported `vote_parties` and read the release since im-vote-parties, so before this change the fixture import check failed, and with that fixed the sandboxed division export failed. A missing release in a real run is logged and leaves every source label unchanged (see "Missing sources").

The three dated-record leads (Goodenough, Quick and Johnson) and the missing dated Senate records go to the backlog as data tickets.

**Reproduce:** `python3 scripts/vote_parties.py --dry-run [--db ~/.cache/autoresearch/parli.db]` prints every outcome by chamber, era, rule and source.
