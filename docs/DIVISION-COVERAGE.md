# Division member coverage: phase 1 measurement

Baseline: branch `im/division-coverage`, parent `b65d87783`, 14 November 2026. All **3,706 partial pages out of 11,075** were measured before exporter changes. Deltas below are **named minus published official**; paired and absent rows do not contribute to aye/no counts. This is a classification of evidence, not an assumption that every mismatch means a missing person.

| Class and gap shape | Pages | Partial before | Examples (three per non-empty class) |
| --- | ---: | ---: | --- |
| a: House, two tellers each side | 688 | 688 | `federal-representatives-2439`, `federal-representatives-2440`, `federal-representatives-2442` |
| a: Senate, one teller each side | 975 | 975 | `federal-senate-1131`, `federal-senate-1132`, `federal-senate-1133` |
| a: one-sided teller counts | 38 | 38 | `federal-representatives-396`, `federal-representatives-502`, `federal-representatives-804` |
| a: unequal teller counts | 18 | 18 | `federal-representatives-2447`, `federal-representatives-2457`, `federal-representatives-3490` |
| b: held NSW name table and dated roster | 16 | 16 | `nsw-lc-2025-11-27-2`, `nsw-lc-2025-11-27-3`, `nsw-lc-2025-11-27-5` |
| d: NSW source absent from DB | 25 | 25 | `nsw-lc-2026-09-23-5`, `nsw-lc-2026-09-24-13`, `nsw-lc-2026-09-24-14` |
| d: NSW table conflicts | 4 | 4 | `nsw-lc-2025-12-23-20`, `nsw-lc-2025-12-23-21`, `nsw-lc-2025-12-23-22` |
| d: federal one name short | 1,498 | 1,498 | `federal-representatives-4520`, `federal-representatives-4521`, `federal-representatives-4588` |
| d: federal two names short | 439 | 439 | `federal-representatives-4259`, `federal-representatives-4260`, `federal-representatives-4261` |
| d: larger or mixed gap | 5 | 5 | `federal-representatives-2496`, `federal-representatives-2549`, `federal-representatives-2694` |
| c: proven to need a new network fetch | 0 | 0 | None established |

Class totals: **a = 1,719; b = 16; c = 0; d = 1,971**. Class c is deliberately empty: absence of a name in the held database does not prove a new fetch will supply it. The remaining mismatches stay unknown until a source establishes whether the count or the list differs. No casting vote or pair has been presumed from a numerical gap.

## Evidence and scope

`scripts/audit_division_coverage.py` opens `parli.db` with `?mode=ro`, `query_only=ON` and a read transaction. The database contains 10,755 ext_ divisions, including 10,574 TVFY records, and 11,101 legacy divisions. Published pages are the baseline because some are newer than this database. All 850,033 legacy vote rows were checked: there are **zero additional aye/no identities** beyond the corresponding ext_ votes. The ext_ source tables, roster terms and federal summary text were also inspected. An FTS search for both AYES and NOES found 3,891 speech candidates; none supplies a missing name for the five larger federal gaps. ParlInfo document tables hold bills, digests, memoranda, releases and reports, rather than another Hansard division-list dataset.

An already cached OpenAustralia archive at `/home/jake/opax-staging/oa-feed` was read locally for independent teller evidence. There were **no network fetches**, including no APH or ParlInfo requests. Each class-a record has the same complete person-ID/vote set in the XML and the published page, no duplicated voters, XML counts equal to the named counts, and explicitly marked tellers exactly equal to the difference from the published totals. XML member-office IDs were mapped through the cached `people.xml`, not through surnames. Each evidence row records the XML URL, gid and file SHA-256. The rule is specific to those proved source records, never a blanket rule that a gap of one or two means tellers.

For example, [Senate 2858, 6 September 2006](https://data.openaustralia.org.au/scrapedxml/senate_debates/2006-09-06.xml) explicitly lists 34 ayes and 37 noes, including one teller on each side. The published TVFY totals are 33 and 36. The named voters are all held; no name or source total needs changing. House XML can mark two tellers on each side, only one side, or unequal numbers. The 18 unequal cases are accepted only because the individual XML records explicitly mark those numbers.

Class b contains 16 NSW Council pages whose held `ext_divisions.extra.table_names` retains Franklin and agrees with all other named votes. The held `ext_state_roster` uniquely identifies Ben Franklin, Q19873536, in `nsw_lc` from 8 May 2019, observed through 21 September 2026. The reviewed NSW Council list No. 320 (25 September 2026), held in `scripts/roster_state_evidence.json`, independently records his statewide New South Wales seat. No party is inferred from the coalition label in Wikidata. Four other NSW rows have held tables that disagree with the published vote lists; those are class d and must be retained without a guessed repair. Twenty-five later partial NSW pages have no corresponding source row in this database.

## What another acquisition could add

For the 1,937 small federal shortfalls, a TVFY public division page and the corresponding OpenAustralia XML are the permitted places to compare the named table with the published count. Most cached XML lists reproduce the held shortfall. For [House 7575, 8 February 2022](https://data.openaustralia.org.au/scrapedxml/representatives_debates/2022-02-08.xml), the XML itself has 63 ayes and 59 noes, while TVFY totals are 64 and 59: fetching that same XML adds no name. A new source comparison could distinguish a source tally error, a parser omission, or a genuinely missing name, but the held evidence does not establish which. Official totals will remain unchanged.

The five larger gaps are House 2496, 2549 and 2694, and Senate 3166 and 3310. The separate cached XML has respectively 15, 6, 6, 15 and 7 additional identities (49 member-votes); these are not in the held database vote tables. The cached evidence also reveals a remaining no-vote discrepancy for Senate 3310. Name recovery was requested from sources already in parli.db, so importing this separate archive is an optional scope extension, not counted in class b here. Four other XML records (House 5752 to 5755) contradict existing named votes; House 7968 has an extra aye when the published gap is a no. They require source review, not unioning vote sets.

For the 25 later NSW pages absent from the DB, reacquiring their NSW Hansard API daily fragments could supply the original name tables, potentially the same unresolved Franklin row. For the four conflicting held NSW tables, reacquiring the exact fragment and selecting the correct numbered division could resolve the conflict. No new fetch is needed to implement classes a and b. No evidence supports silently changing a total, inventing an identity, treating an unrecorded row as absent, or counting a pair as an aye/no.

## Gap shape by chamber

| Named minus official (ayes, noes) | Chamber | Pages |
| --- | --- | ---: |
| (-13, 2) | representatives | 1 |
| (-9, -6) | senate | 1 |
| (-7, -1) | senate | 1 |
| (-6, 0) | representatives | 1 |
| (-4, 2) | representatives | 1 |
| (-2, 0) | representatives | 201 |
| (-2, 0) | senate | 75 |
| (-1, -1) | representatives | 1 |
| (-1, 0) | nsw_lc | 23 |
| (-1, 0) | representatives | 810 |
| (-1, 0) | senate | 140 |
| (0, -2) | representatives | 118 |
| (0, -2) | senate | 44 |
| (0, -1) | nsw_lc | 22 |
| (0, -1) | representatives | 450 |
| (0, -1) | senate | 98 |
| (0, 1) | senate | 6 |
| (0, 2) | representatives | 1 |
| (1, 0) | senate | 29 |
| (1, 1) | senate | 975 |
| (1, 2) | representatives | 9 |
| (2, 0) | representatives | 2 |
| (2, 1) | representatives | 5 |
| (2, 2) | representatives | 688 |
| (2, 3) | representatives | 2 |
| (3, 2) | representatives | 2 |

## Year, chamber and source

| Year | Chamber | Source | a | b | d | Total |
| --- | --- | --- | ---: | ---: | ---: | ---: |
| 2006 | representatives | theyvoteforyou | 211 | 0 | 2 | 213 |
| 2006 | senate | theyvoteforyou | 288 | 0 | 0 | 288 |
| 2007 | representatives | theyvoteforyou | 75 | 0 | 0 | 75 |
| 2007 | senate | theyvoteforyou | 190 | 0 | 0 | 190 |
| 2008 | representatives | theyvoteforyou | 153 | 0 | 0 | 153 |
| 2008 | senate | theyvoteforyou | 139 | 0 | 0 | 139 |
| 2009 | representatives | theyvoteforyou | 128 | 0 | 0 | 128 |
| 2009 | senate | theyvoteforyou | 196 | 0 | 0 | 196 |
| 2010 | representatives | theyvoteforyou | 101 | 0 | 0 | 101 |
| 2010 | senate | theyvoteforyou | 149 | 0 | 0 | 149 |
| 2011 | representatives | theyvoteforyou | 41 | 0 | 0 | 41 |
| 2011 | senate | theyvoteforyou | 48 | 0 | 0 | 48 |
| 2012 | representatives | theyvoteforyou | 0 | 0 | 1 | 1 |
| 2013 | senate | theyvoteforyou | 0 | 0 | 23 | 23 |
| 2014 | senate | theyvoteforyou | 0 | 0 | 160 | 160 |
| 2016 | representatives | theyvoteforyou | 0 | 0 | 132 | 132 |
| 2016 | senate | theyvoteforyou | 0 | 0 | 28 | 28 |
| 2017 | representatives | theyvoteforyou | 0 | 0 | 190 | 190 |
| 2018 | representatives | theyvoteforyou | 0 | 0 | 103 | 103 |
| 2018 | senate | theyvoteforyou | 0 | 0 | 148 | 148 |
| 2019 | representatives | theyvoteforyou | 0 | 0 | 199 | 199 |
| 2020 | representatives | theyvoteforyou | 0 | 0 | 302 | 302 |
| 2021 | representatives | theyvoteforyou | 0 | 0 | 252 | 252 |
| 2022 | representatives | theyvoteforyou | 0 | 0 | 109 | 109 |
| 2023 | representatives | theyvoteforyou | 0 | 0 | 117 | 117 |
| 2024 | representatives | theyvoteforyou | 0 | 0 | 150 | 150 |
| 2025 | nsw_lc | nsw_hansard_api | 0 | 8 | 4 | 12 |
| 2025 | representatives | theyvoteforyou | 0 | 0 | 26 | 26 |
| 2026 | nsw_lc | nsw_hansard_api | 0 | 8 | 0 | 8 |
| 2026 | nsw_lc | published snapshot (absent from DB) | 0 | 0 | 25 | 25 |

## Reproduce

```sh
nice -n 10 python3 scripts/audit_division_coverage.py \
  --db /home/jake/.cache/autoresearch/parli.db \
  --archive /home/jake/opax-staging/oa-feed \
  --out /tmp/division-coverage-audit.json
```

Run against the baseline published exports. `docs/evidence/division-coverage-baseline.json` freezes the 3,706 classifications, all deltas, source evidence and named-vote fingerprints for review independently of a subsequent rebuild. Phase 2 results and gates will be appended after the measurement commit.
