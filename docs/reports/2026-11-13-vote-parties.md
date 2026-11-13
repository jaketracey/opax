# Division vote parties and profile parties, 13 November 2026

Portal audit findings F08 (division rows with no party) and F07 (profiles reading "Party not recorded"). A party is shown only where dated evidence covers that exact date. A wrong label is worse than none, so most gaps stay open and the reasons are counted below. No parliament website, APH or ParlInfo was read. Two read-only Wikidata queries were made at under one a second with the OPAXBot user agent. Nothing was deployed.

## What was measured

- **Division rows:** every committed shard in `portal/public/divisions` (11,075 divisions), the committed electorate release, `scripts/roster_state_evidence.json`, `scripts/roster_service.json`, and `ext_state_roster` from this host's `parli.db` (copied 10 November; Wikidata fetched 21 September 2026).
- **Profiles:** the committed `parliamentarians.json` and electorate release, through the same seat-roster fallback the site uses.
- **Reproduce:** `python3 scripts/vote_parties.py --dry-run --db ~/.cache/autoresearch/parli.db`.

The row count matches the audit exactly: 31,841 rows without a party across 9,379 divisions, and 286 state divisions with no party at all (NSW 212, Victoria 74). The profile count is 494, against 505 in the audit (237 full names and 257 single-name prints, against 248 and 257). The 11 fewer full-name gaps are most likely from the newer `parliamentarians.json` (12 November).

## The rules

**Rows.** A row is matched only inside its own chamber, in this order:

1. Person ID.
2. Exact full name or a listed alias.
3. A bare surname print, only when exactly one sitting member holds that surname that day and no other name with that surname voted in the chamber that day.

Two people with one name who could both sit that day leave the row unknown.

A matched row takes a party only from evidence covering its date:

| Source | What it gives |
| --- | --- |
| Release term | The electorate release's term party periods (OpenAustralia service records, federal House): start ≤ date < end, or an open period up to its observed-through date. Office codes (SPK, CWM) are not parties. |
| Release roster | A verified seat roster, on its own as-of date. |
| Official list | An official chamber list in `roster_state_evidence.json`, on its own as-of date. |
| Service record | A reviewed dated service entry in `roster_service.json`. |
| Bracket | The nearest official observations before and after the date name the same party, at most four years apart. |
| Wikidata term | An `ext_state_roster` term with a start date and one parliamentary group. It counts **only when an official list later in the same term, on or after the division date, records the same party.** |

All applicable sources must agree, and no official list inside a contributing term may disagree. Nothing carries forward past the latest evidence.

**Why Wikidata needs confirming.** Wikidata's term group is not dated inside the term, and it lags changes. Checked against the official lists held, it still gave Moira Deeming (Liberal) and Darren Cheeseman (Labor) their old parties in September 2026. It also gave Stephen Andrew One Nation on the date the Queensland record lists him as Katter's Australian Party. Wikidata party membership with start and end qualifiers (P102) covers only two people per chamber in NSW and Victoria, so no new ingest was worth adding.

**Profiles.** These apply only to full-name profiles with no party of their own and no verified seat party:

- The profile must match an official list or a reviewed service record by exact full name (or listed alias), in a chamber the profile sat in.
- The latest dated observation decides. Two parties or two seats on that date give nothing.
- The party is shown dated: "Labor (parliamentary roster as at 25 Sep 2026)".
- Single-name prints are never matched.
- The profile's own `party` field is not written, so no speech inherits a snapshot party (the concern in the 12 November state-party report).

## Dry run: division rows

### By chamber, source and outcome

"Office" counts rows carrying a presiding-officer code; they are a subset of the unknown rows. "Wikidata unconfirmed" counts rows that Wikidata alone would label; these are not applied.

| Chamber | Unknown | Office | Release term | Release roster | Wikidata confirmed | Bracket | **Filled** | Wikidata unconfirmed | Evidence ends before date | No dated party | No match | Conflicting |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Federal House | 2,802 | 2,752 | 2,013 | 0 | 0 | 0 | **2,013** | 0 | 789 | 0 | 0 | 0 |
| Federal Senate | 14,733 | 14,081 | 0 | 0 | 0 | 0 | **0** | 0 | 567 | 6,631 | 7,535 | 0 |
| NSW Assembly | 6,308 | 0 | 0 | 0 | 0 | 0 | **0** | 929 | 914 | 4,327 | 138 | 0 |
| NSW Council | 4,741 | 0 | 0 | 0 | 212 | 0 | **212** | 0 | 1,369 | 3,134 | 26 | 0 |
| Qld Assembly | 4 | 0 | 0 | 0 | 4 | 0 | **4** | 0 | 0 | 0 | 0 | 0 |
| Vic Assembly | 1,177 | 0 | 0 | 0 | 306 | 7 | **313** | 233 | 330 | 300 | 1 | 0 |
| Vic Council | 2,076 | 0 | 0 | 70 | 511 | 0 | **581** | 172 | 566 | 755 | 2 | 22 |
| **Total** | **31,841** | **16,833** | **2,013** | **70** | **1,033** | **7** | **3,123** | **1,334** | **4,535** | **15,147** | **7,702** | **22** |

No row stayed unknown because of surname or same-name ambiguity: those rules found no case in the committed pages. The fixtures cover them.

### By identity rule

| Rule | Federal House | NSW Council | Qld | Vic Assembly | Vic Council | Total |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Person ID | 2,013 | 0 | 0 | 0 | 0 | 2,013 |
| Exact full name | 0 | 212 | 0 | 313 | 581 | 1,106 |
| Unique surname | 0 | 0 | 4 | 0 | 0 | 4 |

### By era

| Era | Federal House | Federal Senate | NSW Assembly | NSW Council | Qld | Vic Assembly | Vic Council |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2006–2012 | 914 of 1,208 | 0 of 4,253 | | | | | |
| 2013–2021 | 1,070 of 1,520 | 0 of 7,026 | | | | | |
| 2022–2025 | 23 of 24 | 0 of 1,996 | 0 of 1,477 | 110 of 1,293 | | | |
| 2026 | 6 of 50 | 0 of 1,458 | 0 of 4,831 | 102 of 3,448 | 4 of 4 | 313 of 1,177 | 581 of 2,076 |

### Divisions

| Measure | Before | After |
| --- | ---: | ---: |
| Divisions with any row lacking a party | 9,379 | 7,608 |
| Divisions with no party on any row | 286 | 164 (NSW 137, Victoria 27) |

### Checking the federal source against recorded labels

The release-term rule was run against the 446,065 federal House rows that already carry a source party, holding the source label out.

- The rule agrees on 433,385 rows (97.2%).
- Nearly all of the remaining 12,680 are rows where the existing label is wrong for the date, not the release. The release dates the changes, while the existing labels apply today's party to every date.
- Examples of existing labels:
  - Barnaby Joyce is "One Nation" on divisions from 2013.
  - Russell Broadbent is "Independent" from 2006.
  - Craig Kelly is "United Australia Party" from 2010.
  - Bob Katter is "Katter's Australian Party" before the party existed.
- A smaller share is LNP members whom the release records as Liberal or Nationals.

See "Separate finding" below.

## Dry run: profiles

These are profiles with no party after the existing seat fallback, against those the new list fallback fills.

| Profiles | Without a party | Filled |
| --- | ---: | ---: |
| Full name, NSW Council only | 58 | 25 |
| Full name, NSW Council and Assembly | 10 | 4 |
| Full name, NSW Assembly only | 139 | 0 |
| Full name, Victoria | 9 | 0 |
| Full name, South Australia | 14 | 0 |
| Full name, federal | 7 | 0 |
| **Full name, total** | **237** | **29** |
| Single-name prints, all jurisdictions | 257 | 0 (left alone by rule) |
| **Total** | **494** | **29** |

All 29 come from the official NSW Council list of 25 September 2026.

## Samples, before and after

### Division rows

| Division | Date | Member | Before | After | Source |
| --- | --- | --- | --- | --- | --- |
| division-federal-representatives-1000 | 2012-03-22 | Bruce Scott (CWM) | none | Nationals | Release term |
| division-federal-representatives-5954 | 2019-10-24 | Milton Dick | none | Labor | Release term (his period before he became Speaker in July 2022) |
| division-nsw-lc-2025-11-27-1 | 2025-11-27 | Emma Hurst | none | Animal Justice Party | Wikidata term, confirmed by the 25 Sep 2026 list |
| division-vic-la-2026-08-26-1 | 2026-08-26 | Danny O'Brien | none | Nationals | Bracket (VEC 26 Nov 2022, release roster 9 Sep 2026) |
| division-vic-lc-2026-09-09-1 | 2026-09-09 | Aiv Puglielli | none | Greens | Release roster, 9 Sep 2026 |

The audit's examples are unchanged: `division-nsw-la-2026-11-11-3` (90 rows) and `division-nsw-lc-2026-11-11-6` (32 rows). No dated evidence covers 11 November 2026:

- The latest official NSW Council list is 25 September.
- No NSW Assembly list is held.
- Wikidata was fetched on 21 September.

These pages keep saying so, now as "No party is recorded for any of the 90 members on this date."

### Profiles

| Profile | Before | After |
| --- | --- | --- |
| Penny Sharpe | Party not recorded | Labor (parliamentary roster as at 25 Sep 2026) |
| Tania Mihailuk | Party not recorded | Independent (parliamentary roster as at 25 Sep 2026) |
| Adam Crouch | Party not recorded | Party not recorded (NSW Assembly: no official list held) |
| Roberts (single-name print) | Party not recorded | Party not recorded (left alone by rule) |

## What stays unknown, and why

**Evidence ends before the date (4,535 rows).** Most are divisions after 21 to 25 September 2026: NSW from October and November, Victoria from 10 September, and federal from 9 September. The evidence stops there, and nothing carries forward. These fill on the nightly once:

- a newer official list is committed;
- the electorate release is refreshed; or
- `state_rosters fetch` runs with a later `fetched_at` and an official list confirms it.

**No dated party (15,147 rows).**

- **Senate presiding officers who are current:** Sue Lines (President) and Slade Brockman (Deputy President). The release holds no Senate term party periods. A Senate roster is held only for 4 September 2026.
- **NSW and Victorian members with no confirmed party covering the date:** Wikidata gives most current NSW members no single group. Among `ext_state_roster` rows in NSW, 433 of 515 have no party, and 41 more read "Liberal-National Coalition", which names no single party.

**No match (7,702 rows).**

- **Former Senate presiding officers:** Scott Ryan, Stephen Parry, John Hogg and Alan Ferguson are in none of the held rosters.
- **State members missing from every held roster** (167 rows).

**Wikidata unconfirmed (1,334 rows, not applied).**

- **NSW Assembly (929 rows):** has no official list, so Wikidata cannot be confirmed for it. A committed official NSW Assembly members list would confirm or veto these on the next nightly.
- **Victoria (405 rows):** 386 fall after the 9 September roster. The other 19 are Moira Deeming and Darren Cheeseman, whose Wikidata group the roster contradicts.

**Conflicting (22 rows).** Moira Deeming and Darren Cheeseman, where Wikidata's stale group disagrees with the official roster.

**Profiles.** 139 NSW Assembly profiles remain without a party because no official NSW Assembly list is held. The others are SA, Victorian and federal members not on any held list. All 257 single-name prints are left alone.

## How the nightly applies it

`scripts/vm/nightly.sh` runs `scripts/export_division_pages.py` (step 3b). That now:

1. Loads the evidence: the release from `portal/public/electorates`, the two committed evidence files, and `ext_state_roster` from the same read-only database snapshot as the votes.
2. Fills dated parties into every published shard, including retained ones. Fills are recomputed from scratch on each run, so a fill whose evidence is withdrawn or contradicted disappears on the next run. Source parties are never changed.
3. Writes `coverage.party_filled_count` and `coverage.unknown_party_count` into `divisions/index.json`. The run log reports both.

Filled rows carry `party_source` (basis and URL), and filled shards carry `_meta.party_fill`. The Worker's division page says how many labels came from a dated roster.

`portal/public/data/roster-list-parties.json` is generated by `scripts/export_roster_list_parties.py` from the two committed evidence files. It changes only with a reviewed evidence commit, and `tests/test_vote_parties.py` fails when it is stale. The Worker and the person page read it at request time.

## Separate finding: undated federal party labels

The federal division rows' existing parties come from an undated label: today's party, applied to every date. On 12,680 federal House rows they disagree with the release's dated party periods, and the release is right in the cases checked:

- Joyce is shown as One Nation in 2013.
- Broadbent is shown as Independent in 2006.
- Kelly is shown as UAP in 2010.
- Slipper and Thomson are shown as Independent for whole terms.
- Katter is shown as KAP before 2011.

`parli/ingest/federal_affiliations.py` already says the undated members party must never be read; the published rows predate that rule or bypass it. This work does not change source labels (out of scope, and the change touches thousands of published rows). A follow-up could apply the same release-term check to labelled rows and withhold a label that disagrees with a dated period.

## Validation

- `tests/test_vote_parties.py`: 19 tests, all invented names. They cover:
  - the unique-surname fill;
  - two sitting namesakes staying unknown;
  - a party change on each date;
  - no carry-forward;
  - list-date-only, bracket and conflict;
  - Wikidata confirmation and stale-group veto;
  - same-name ambiguity;
  - office codes and person ID;
  - recompute and withdrawal;
  - the export and index integration;
  - the roster-list file sync check.
- `portal/test/roster-party.test.mjs` (3 new tests): a full-name profile gets a dated party; a single-name profile gets none; other chambers and split lists give none.
- `portal/test/division-parties.test.mjs` (3 tests): roster labels are named as such, unknown rows are counted in words, and no "Unknown" party line appears.
