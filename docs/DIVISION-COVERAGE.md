# Division member coverage: phase 1 measurement

Baseline: branch `im/division-coverage`, parent `b65d87783`, 14 November 2026. All **3,706 partial pages out of 11,075** were measured before exporter changes. Deltas below are **named minus published source**; paired and absent rows do not contribute to aye/no counts. This is a classification of evidence, not an assumption that every mismatch means a missing person.

| Class and gap shape | Pages | Examples (three per non-empty class) |
| --- | ---: | --- |
| a: House, two tellers each side | 688 | `federal-representatives-2439`, `federal-representatives-2440`, `federal-representatives-2442` |
| a: Senate, one teller each side | 975 | `federal-senate-1131`, `federal-senate-1132`, `federal-senate-1133` |
| a: one-sided teller counts | 38 | `federal-representatives-396`, `federal-representatives-502`, `federal-representatives-804` |
| a: unequal teller counts | 18 | `federal-representatives-2447`, `federal-representatives-2457`, `federal-representatives-3490` |
| b: held Hansard list for a division absent from ext_ | 12 | `nsw-lc-2026-09-23-5`, `nsw-lc-2026-09-24-13`, `nsw-lc-2026-09-24-14` |
| b: held Hansard list replaces conflicting extract | 4 | `nsw-lc-2025-12-23-20`, `nsw-lc-2025-12-23-21`, `nsw-lc-2025-12-23-22` |
| b: held NSW name table and dated roster | 16 | `nsw-lc-2025-11-27-2`, `nsw-lc-2025-11-27-3`, `nsw-lc-2025-11-27-5` |
| d: NSW source absent from DB | 13 | `nsw-lc-2026-10-13-2`, `nsw-lc-2026-10-20-1`, `nsw-lc-2026-10-20-2` |
| d: federal one name short | 1,498 | `federal-representatives-4520`, `federal-representatives-4521`, `federal-representatives-4588` |
| d: federal two names short | 439 | `federal-representatives-4259`, `federal-representatives-4260`, `federal-representatives-4261` |
| d: larger or mixed gap | 5 | `federal-representatives-2496`, `federal-representatives-2549`, `federal-representatives-2694` |
| c: proved to require a new network fetch | 0 | None established |

**Revised class totals: a = 1,719; b = 32; c = 0; d = 1,955.** The first measurement commit, `9db855489`, found 16 held-name-table recoveries. A broader audit of `speeches.text` found 16 further recoveries before that recovery path was implemented: four conflicting extracted tables and 12 newer divisions absent from ext_. The revision preserves the original 3,706-page baseline and its named-vote fingerprints. Class c remains empty because absence of a held name does not prove a new fetch will supply it. No casting vote or pair is presumed from a numerical gap.

`docs/evidence/division-held-speech-lists.json` freezes 30 unique held speech-list matches, including corroboration of 14 of the original 16 name-table cases. Each match has the same chamber, date, topic, source side counts and every existing named vote. The full printed list must contain unique surnames, and exactly one held list may match. Additional names must independently pass the dated chamber and seat checks. For the 12 September 23 to 24 cases, the open roster service observed on 21 September is corroborated by the held official Council list on 25 September, bounding the same service through 25 September. Nothing is projected into the October sittings.

An FTS audit of all partial chamber-days found 52 matching federal speech candidates, all procedural text rather than named roll calls, and 76 NSW Council candidates on six dates. No matching held October lists were found for the remaining 13 NSW pages. This resolves the four conflicting extracts from full held text and supplies the original lists for 12 of the 25 pages absent from ext_.

## Evidence and scope

`scripts/audit_division_coverage.py` opens `parli.db` with `?mode=ro`, `query_only=ON` and a read transaction. The database contains 10,755 ext_ divisions, including 10,574 TVFY records, and 11,101 legacy divisions. Published pages are the baseline because some are newer than this database. All 850,033 legacy vote rows were checked: there are **zero additional aye/no identities** beyond the corresponding ext_ votes. The ext_ source tables, roster terms and federal summary text were also inspected. An FTS search for both AYES and NOES found 3,891 speech candidates; none supplies a missing name for the five larger federal gaps. ParlInfo document tables hold bills, digests, memoranda, releases and reports, rather than another Hansard division-list dataset.

An already cached OpenAustralia archive at `/home/jake/opax-staging/oa-feed` was read locally for independent teller evidence. There were **no network fetches**, including no APH or ParlInfo requests. Each class-a record has the same complete person-ID/vote set in the XML and the published page, no duplicated voters, XML counts equal to the named counts, and explicitly marked tellers exactly equal to the difference from the published totals. XML member-office IDs were mapped through the cached `people.xml`, not through surnames. Each evidence row records the XML URL, gid and file SHA-256. The named figure is the Hansard tally, including tellers; the comparison figure is the They Vote For You tally. The rule is specific to those proved source records, never a blanket rule that a gap of one or two means tellers.

For example, [Senate 2858, 6 September 2006](https://data.openaustralia.org.au/scrapedxml/senate_debates/2006-09-06.xml) explicitly lists 34 ayes and 37 noes, including one teller on each side. The published TVFY totals are 33 and 36. The named voters are all held; no name or source total needs changing. House XML can mark two tellers on each side, only one side, or unequal numbers. The 18 unequal cases are accepted only because the individual XML records explicitly mark those numbers.

Class b contains 32 NSW Council pages. Sixteen have Franklin in held `ext_divisions.extra.table_names`; 16 further pages have a matching complete list in `speeches.text`. The held `ext_state_roster` uniquely identifies Ben Franklin, Q19873536, in `nsw_lc` from 8 May 2019, observed on 21 September 2026. The reviewed official Council list No. 320, 25 September 2026, held in `scripts/roster_state_evidence.json`, independently records his statewide New South Wales seat and corroborates that open service through 25 September. No later vote date is inferred and no party is inferred from Wikidata's coalition label. Each speech-list match records its speech ID, text SHA-256, full printed side lists, topic, counts and the additional name's dated identity.

## What another acquisition could add

For the 1,937 small federal shortfalls, a TVFY public division page and the corresponding OpenAustralia XML are the permitted places to compare the named table with the published count. Most cached XML lists reproduce the held shortfall. For [House 7575, 8 February 2022](https://data.openaustralia.org.au/scrapedxml/representatives_debates/2022-02-08.xml), the XML itself has 63 ayes and 59 noes, while TVFY totals are 64 and 59: fetching that same XML adds no name. A new source comparison could distinguish a source tally error, a parser omission, or a genuinely missing name, but the held evidence does not establish which. Source totals will remain unchanged.

The five larger gaps are House 2496, 2549 and 2694, and Senate 3166 and 3310. The separate cached XML has respectively 15, 6, 6, 15 and 7 additional identities (49 member-votes); these are not in the held database vote tables. The cached evidence also reveals a remaining no-vote discrepancy for Senate 3310. Name recovery was requested from sources already in parli.db, so importing this separate archive is an optional scope extension, not counted in class b here. Four other XML records (House 5752 to 5755) contradict existing named votes; House 7968 has an extra aye when the published gap is a no. They require source review, not unioning vote sets.

For the 13 October NSW pages without held lists, reacquiring their NSW Hansard API daily fragments and a dated membership observation could supply the original tables and identity evidence. The four conflicting extracts and 12 September pages can already be closed from held speech text, without reacquisition. No new fetch is needed to implement classes a and b. No evidence supports silently changing a total, inventing an identity, treating an unrecorded row as absent, or counting a pair as an aye/no.

## Gap shape by chamber

| Named minus source (ayes, noes) | Chamber | Pages |
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
| 2025 | nsw_lc | nsw_hansard_api | 0 | 12 | 0 | 12 |
| 2025 | representatives | theyvoteforyou | 0 | 0 | 26 | 26 |
| 2026 | nsw_lc | nsw_hansard_api | 0 | 8 | 0 | 8 |
| 2026 | nsw_lc | published snapshot (absent from DB) | 0 | 12 | 13 | 25 |

## Reproduce

```sh
nice -n 10 python3 scripts/audit_division_coverage.py \
  --db /home/jake/.cache/autoresearch/parli.db \
  --archive /home/jake/opax-staging/oa-feed \
  --out /tmp/division-coverage-audit.json
```

Run against the baseline published exports. `docs/evidence/division-coverage-baseline.json` freezes the 3,706 classifications, all deltas, source evidence and named-vote fingerprints for review independently of a subsequent rebuild. Phase 2 results and gates will be appended after the measurement commit.

The held speech-list measurement is independently reproducible against the original committed records:

```sh
nice -n 10 python3 scripts/division_held_speeches.py \
  --baseline b65d87783 --out /tmp/division-held-speech-lists.json
```

## Phase 2 result

Measurement commits `9db855489` and `4e1cd4bbe` precede the corresponding recovery implementations. The rebuilt catalogue retains all **11,075 divisions**, with **9,120 recorded lists and 1,955 partial lists**, down from 3,706 partial lists. It holds **874,521 member rows**, up from 874,489. All **1,719 convention cases** and all **32 held-database recovery cases** are recorded. No previously recorded list became partial.

| Measured class | Partial before | Partial after |
| --- | ---: | ---: |
| a: House, two tellers each side | 688 | 0 |
| a: Senate, one teller each side | 975 | 0 |
| a: one-sided teller counts | 38 | 0 |
| a: unequal teller counts | 18 | 0 |
| b: held Hansard list for a division absent from ext_ | 12 | 0 |
| b: held Hansard list replaces conflicting extract | 4 | 0 |
| b: held NSW name table and dated roster | 16 | 0 |
| d: NSW source absent from DB | 13 | 13 |
| d: federal one name short | 1,498 | 1,498 |
| d: federal two names short | 439 | 439 |
| d: larger or mixed gap | 5 | 5 |
| c: proved to require a new network fetch | 0 | 0 |
| **Total** | **3,706** | **1,955** |

`docs/evidence/division-coverage-result.json` records the corpus comparison and every recovered vote's source and dated identity. Comparison with the integration base checked all 11,075 records: **no division date, chamber, jurisdiction, question, result, source URL or source total changed, and no prior named vote was lost**. Every base record and prior member is preserved, including the divisions newer than the local DB. Twelve newer divisions were enriched from their held speech lists.

`scripts/division_coverage.py` checks a teller case against its frozen key, chamber, date, source URL, source totals and named-vote SHA-256. Named vote sets must contain unique person IDs. Each published convention record carries the cited XML URL, gid, file hash, counts and teller counts in `_meta.member_reconciliation`. A changed source fact or named identity invalidates the rule; arithmetic offsets alone never establish completeness. `_meta.member_tally` gives the named and source counts for unresolved mismatches. The browser, crawlable answer and comparison tools share coverage helpers in `division-markdown.js`; the visible note explains both counts and links to teller evidence.

The 32 recovered member-votes are Ben Franklin's explicitly printed aye/no entries in held NSW tables and speech text. Each carries `member_source` with the division URL, original print, dated chamber service, statewide seat and identity/seat sources. Speech recoveries also carry the held speech ID, text SHA-256 and matching rule. No NSW parliament person ID or party is invented. An open term is bounded by held observations, including the official list on 25 September, and is never projected into the October sittings.

For `nsw-lc-2025-12-23-19`, the held name array has 20 no prints against a source count of 26, while ext_votes retains 25 named noes. Every print agrees with the held votes; Franklin is explicitly on the no side and supplies the remaining name. This shortened-array recovery requires the source's full counts to agree and the explicit additions to close the tally exactly. Four conflicting extracts instead take their missing name from a complete held speech list matched by exact topic, date, chamber, counts and every prior named vote. The same unique-list rule enriches 12 September records absent from ext_. Ambiguous lists, conflicting sides, uncertain identities, wrong seats and evidence ending before the vote leave the division untouched. Prior paired records are retained and do not enter aye/no counts.

The coverage export is applied over row 172's published division files, based on `b82465653` (`origin/int/party-dated`) until that integration lands on main. It does **not** rebuild votes or party labels from the local DB. Run `scripts/export_division_pages.py --refresh-coverage`: it reads the published records, uses the read-only DB solely for missing-name evidence, then changes coverage metadata and the 32 sourced member-votes. The exporter rejects any change to a prior member object, including its party label, blank party, withheld party or provenance, or to unrelated metadata and source facts. It preserves existing refresh-retention reasons. The recovered votes have no party fields.

`scripts/check_division_coverage.py --base origin/int/party-dated` independently compares every division with the Git base. It checks all prior member fields and unrelated metadata, unchanged party tallies and party-provenance summaries, and the absence of party fields on added votes. The result is **0 existing party-field changes and 0 party-tally changes**. Unknown-party counters increase by exactly the 32 newly sourced votes. Party tests, the party-member index and the agency top-supplier cache are inherited from the base. A stale local DB party label, including a blank or conflicting one, cannot overwrite published evidence.

No source acquisition was performed. Cached XML proves teller conventions; new names come from the requested held database sources. The 49 additional member-votes in the separate XML archive remain outside that recovery scope. The remaining 1,955 pages disclose held named counts beside source counts. Follow-up acquisitions would compare the 1,942 federal source discrepancies with TVFY public tables and OpenAustralia XML, and obtain matching October NSW Hansard fragments plus dated membership observations for the 13 remaining NSW pages. Fetching the same XML for most small federal gaps supplies no new name, so recovery is not promised.

## Gates

- Python exporter, division and dated-party suites: **328 tests and 782 subtests passed**.
- Regression proof: pending the scratch-worktree run with production changes restored to the integration base and the regression tests retained.
- `cd portal && npx tsc --noEmit`: **passed**, after generating the ignored local Worker declarations with `npx wrangler types`.
- Focused portal division, party and crawl tests: **84 passed**.
- `npm test -- --test-concurrency=4`, with the worktree's `.venv/bin` on PATH: **4,922 passed, 0 failed, 0 skipped**.
- Rebuilt with `scripts/export_division_pages.py --refresh-coverage`, the offline `npm run build:search` prerequisites and `scripts/stamp_assets.mjs`. `OPAX_TABLE_METADATA_ONLY=1` skipped SQL preparation and service writes. Asset stamp check: **passed**. Coverage helpers share the existing Markdown module, preserving the platform's 100 header-rule limit.
- Commands ran at `nice -n 10`. Heavy gates paused when the shared host's load5 reached 40 and resumed below 39.5. The DB was opened only with `?mode=ro` and `query_only=ON`. No production, KB or remote D1 writes were made. No `.ops/` files are included in the commits.
