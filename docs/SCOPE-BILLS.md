# Bill summaries: measured scope and implementation plan

**Decision: feasible. Start with federal bills active during 2013–2026.** Build a jurisdiction-aware registry, publish independently written summaries as knowledge-box resources of kind `bill`, and export a small static relationship manifest for the portal. Source collection, identity, versioning and review dominate cost; model tokens do not.

Scope date: **5 September 2026, Australia/Melbourne**. Main database snapshot: **2026-09-04 21:35:32 UTC**. Branch: `scope-bills`. All local repository work stayed in `/Users/jake/Projects/opax/.claude/worktrees/scope-bills`. No site code changed; no ingest, knowledge-box request or model-generation request was made. Only this document is committed. Scratch measurements and public responses are under `/tmp/opax-scope-bills` and are not deliverables or published source text.

**Measurement limits:** database totals below are censuses of the read-only snapshot. Public search facets are source-reported counts. EM/digest availability is a bounded, explicitly identified sample, not a census of distinct bills with documents. Full per-parliament availability counts cannot honestly be inferred from document totals: revised EMs and multi-bill digests make those different denominators. Unknown means unmeasured, never absent. The exact availability census is an acceptance deliverable of phase 1, before generation.

## 1. Numbers first

| Measure | Verified count / finding |
| --- | --- |
| Existing bill registry | 5,313 rows; 5,188 distinct literal titles; 5,313 distinct title/introduction-date pairs |
| Registry dates | 1988-12-02 to 2022-03-30; four pre-1998 outliers, not comprehensive historical coverage |
| Progress | 49,950 events across all 5,313 bills; no null stage/date or orphan bill_id |
| Registry status | 3,619 passed; 1,694 lapsed; 0 rejected; 0 before_parliament |
| Missing registry metadata | 611 missing portfolio; 0 missing title/introduction date/house; no sponsor-person, jurisdiction or source URL columns |
| Federal billhome index | 6,469 source records; 6,270 in Parliaments 39–48, 199 in Parliament 38 |
| New registry gap | 807 source billhome records in Parliaments 47–48; 0 bills rows introduced in those terms |
| Existing newer discovery | 300 cached billhome rows in Parliaments 47–48; not a complete new registry |
| Federal divisions | 10,575, 2006-02-07 through 2026-08-20; 844,874 recorded person-votes |
| Bill-naming federal divisions | 5,372 broad bill-word matches; 5,213 explicit bill-year mentions |
| Strict federal bill matches | 3,274 divisions → 1,084 distinct registry bill instances |
| Unmatched federal division headings | 2,098 bill-naming divisions; 502 distinct unresolved extracted title/term mention strings (not proven distinct bill identities) |
| Total speech store | 1,310,477 rows across federal, NSW, VIC, QLD and SA |
| Speech matches | 6,759 federal speeches → 1,123 distinct registry bills; 0 state matches because the registry is federal-only |
| FRL | 13,732 Act titles; 8,564 nonempty originatingBillUri values; existing r/s-code parser recognises 4,049 |
| ALRC bills with an FRL Act candidate | 3,498 unique normalized Act-title + exact royal-assent-date matches; conservative lower bound |
| Hand inspection | 100 source rows; initial rule 95/100 rows with all emitted links correct; corrected rule 99/99 accepted, 1 abstention; same-sample diagnostic, not holdout validation |

### Bill registry by introduction year

`parli/ingest/bills.py` reads ALRC’s [status spreadsheet](https://www.alrc.gov.au/wp-content/uploads/2022/12/Status-of-Commonwealth-Bills.xlsx) and [progress spreadsheet](https://www.alrc.gov.au/wp-content/uploads/2022/12/Progress-of-Commonwealth-Bills-through-Parliament.xlsx), matching on literal title and introduction date. `Act` becomes `passed`; `Not Proceeding` becomes `lapsed`. The PostgreSQL declarations in `parli/pg_schema.sql` describe the logical columns; the inspected live store is SQLite. The loader clears/replaces progress and writes schema/data, so **it was not run**.

| Introduced year | Rows |
| --- | --- |
| 1988 | 1 |
| 1990 | 1 |
| 1995 | 1 |
| 1996 | 1 |
| 1998 | 82 |
| 1999 | 187 |
| 2000 | 187 |
| 2001 | 167 |
| 2002 | 261 |
| 2003 | 179 |
| 2004 | 229 |
| 2005 | 193 |
| 2006 | 208 |
| 2007 | 190 |
| 2008 | 241 |
| 2009 | 248 |
| 2010 | 283 |
| 2011 | 265 |
| 2012 | 235 |
| 2013 | 237 |
| 2014 | 262 |
| 2015 | 230 |
| 2016 | 201 |
| 2017 | 266 |
| 2018 | 249 |
| 2019 | 264 |
| 2020 | 199 |
| 2021 | 196 |
| 2022 | 50 |

The four pre-1998 rows need provenance review. In particular, two GST bills titled 1999 have introduction dates in 1988 and 1990; do not advertise the registry as covering those years.

| bill_id | Title | Stored introduction |
| --- | --- | --- |
| 35 | A New Tax System (Goods and Services Tax Transition) Bill 1999 | 1988-12-02 |
| 93 | A New Tax System (Wine Equalisation Tax Imposition-Excise) Bill 1999 | 1990-03-31 |
| 4762 | Patents Amendment Bill 1996 [2008] | 1996-06-27 |
| 4795 | Parliamentary Approval of Treaties Bill 1995 [2004] | 1995-05-31 |

| Progress stage | Events | Earliest | Latest |
| --- | --- | --- | --- |
| committee | 3288 | 1998-11-11 | 2022-03-30 |
| introduced | 9431 | 1995-05-31 | 2022-03-31 |
| passed | 2019 | 1998-11-25 | 2022-03-31 |
| royal_assent | 3615 | 1998-12-07 | 2022-04-01 |
| second_reading | 23725 | 1988-12-02 | 2022-04-11 |
| third_reading | 7872 | 1998-03-11 | 2022-03-31 |

`second_reading` merges moved, debated, agreed, negatived and amendment events; `event_raw` is needed to recover the outcome. `passed` in this registry means ALRC reported an Act, rather than merely passage through both houses. A future status model must distinguish those states.

### Cached source corpus

| Dataset | Rows | Distinct r/s bill codes | Nonempty bodies | Date range | Body characters |
| --- | --- | --- | --- | --- | --- |
| billhome | 500 | 500 | 0 | 2006-11-29 → 2026-08-20 | 0 |
| bills | 311 | 62 | 311 | 2006-11-29 → 2026-08-20 | 4206072 |
| billsdgs | 100 | 0 | 100 | 2024-11-25 → 2026-08-19 | 4136049 |
| ems | 103 | 72 | 103 | 2009-08-27 → 2026-09-01 | 12131489 |

The recorded bill-text sample is confirmed: **311 sections, 62 bills**. Grouping stored section IDs by version confirms **79 versions**. EMs are **103 documents across 72 bill codes**, not 103 different bills. Digests are **100 documents**; their cached rows contain no bill code. Existing billhome links have **198 non-null bill_id values** and **313 exact r/s-code links to FRL Acts**. These existing ALRC links were made with title-only `setdefault` in `run_link_bills`, without date disambiguation; treat them as candidates.

The cached billhome sample is not simply the newest 500: its date cohorts contain 200 old records from Parliament 41 and 300 from Parliaments 47–48.

## 2. Federal source coverage by parliament

The following first table separates **source-reported record counts** from measured registry joins. `ALRC rows` are grouped by stored introduction date between first openings of successive parliaments; they are not official bill-per-parliament totals. Carryovers, renamed bills and suspect dates explain why these columns must not be subtracted to claim a missing-bill census. `FRL matched` uses unique Act base-title plus exact stored assent date, not the Act’s year as a proxy for the bill’s parliament. Source ParliamentNumber metadata should replace these inferred cohorts in the registry.

| Parliament | Billhome records | EM documents (not bills) | Digest documents (not bills) | ALRC rows by intro | Passed | FRL matched |
| --- | --- | --- | --- | --- | --- | --- |
| Before 39 / source 38 | 199 | 561 | 456 | 8 | 4 | 4 |
| 39 | 732 | 980 | 647 | 619 | 480 | 458 |
| 40 | 607 | 732 | 490 | 588 | 424 | 405 |
| 41 | 657 | 831 | 559 | 672 | 547 | 532 |
| 42 | 683 | 882 | 473 | 646 | 409 | 393 |
| 43 | 802 | 1197 | 493 | 806 | 566 | 555 |
| 44 | 600 | 781 | 338 | 624 | 380 | 363 |
| 45 | 725 | 1013 | 334 | 717 | 402 | 391 |
| 46 | 657 | 894 | 252 | 633 | 407 | 397 |
| 47 | 531 | 805 | 224 | 0 | 0 | 0 |
| 48 | 276 | 347 | 89 | 0 | 0 | 0 |

Source listing totals are 6,469 billhomes, 12,354 EM documents and 7,985 digests. EM/digest facets also include earlier parliaments. They do **not** say how many distinct bills have an EM or digest. FRL’s live `$count=true` confirms the cached Act-title total; this does not prove every cached Act’s status is current.

### Availability measured on a bounded bill sample

For each Parliament 39–48, fetched one newest-first listing page with 100 records; selected 5 using `random.Random(20260905 + parliament).sample(rows, 5)`. Then read each selected billhome and checked EM document links. This is a sample of each term’s newest 100 listing records, biased towards late-term introductions, **not a random sample of the entire parliament**. No population percentage or extrapolated total is claimed.

For digests, a generic billhome “Bills Digest” link is not evidence of a digest: it can lead to no results. Every sampled code is checked with `Dataset:billsdgs BillId_Phrase:"<code>"`, `resCount=1`. This is a useful improvement on DATA-WORDS: even though cached digest rows lack a code, ParlInfo can resolve their relationship by bill code, before falling back to title matching. FRL availability is an exact code lookup in the complete cached title register. “No EM link” is weaker than “no EM exists anywhere”.

| Parliament | Billhomes inspected | EM link available | Digest search hit | FRL Act by code | Full distinct-bill availability census |
| --- | --- | --- | --- | --- | --- |
| 39 | 5 | 3 | 3 | 3 | Not measured |
| 40 | 5 | 2 | 2 | 1 | Not measured |
| 41 | 5 | 5 | 5 | 4 | Not measured |
| 42 | 5 | 5 | 3 | 2 | Not measured |
| 43 | 5 | 5 | 4 | 1 | Not measured |
| 44 | 5 | 5 | 3 | 3 | Not measured |
| 45 | 5 | 5 | 0 | 1 | Not measured |
| 46 | 5 | 5 | 3 | 0 | Not measured |
| 47 | 5 | 5 | 2 | 4 | Not measured |
| 48 | 5 | 5 | 3 | 3 | Not measured |

| Availability sample total | Count |
| --- | --- |
| Billhomes inspected | 50 |
| EM links | 45 |
| Digest hits | 28 |
| FRL code matches | 22 |
| EM or digest | 46 |
| Neither EM link nor digest hit | 4 |

The following are **cached-availability lower bounds only**, using a separate cohort. EMs join by bill code; cached digests by full normalized title, publication after introduction and same inferred term; FRL by bill code. A zero here means the relevant material is not in the small cached cohort, not that Parliament lacks it.

| Inferred parliament | Cached billhomes | With cached EM | With cached digest | With FRL Act |
| --- | --- | --- | --- | --- |
| 38 | 0 | 0 | 0 | 0 |
| 39 | 0 | 0 | 0 | 0 |
| 40 | 0 | 0 | 0 | 0 |
| 41 | 200 | 3 | 0 | 158 |
| 42 | 0 | 0 | 0 | 0 |
| 43 | 0 | 0 | 0 | 0 |
| 44 | 0 | 0 | 0 | 0 |
| 45 | 0 | 0 | 0 | 0 |
| 46 | 0 | 0 | 0 | 0 |
| 47 | 55 | 0 | 7 | 23 |
| 48 | 245 | 69 | 65 | 132 |

### Filling 2022–2026

Enumerate `billhome` by `ParliamentNumber:47` and `48`; retain canonical record IDs, sponsor, portfolio, source status and each progress event. Include the 46th Parliament’s 2022 finish rather than using a simple `year > 2022` filter. Refresh unsettled bills and newly published EM revisions, not just new IDs. Reconcile all older ALRC instances to source IDs and keep aliases for reintroductions. Do not infer a bill registry from Acts: defeated, withdrawn and still-pending bills would disappear.

| Discovery task | Measured or estimated volume |
| --- | --- |
| Parliament 47 | 531 billhome records; 6 listing requests at 100/page |
| Parliament 48 | 276 records; 3 listing requests at 100/page |
| Both new terms | 807 metadata records; 9 listing requests; up to 807 home reads |
| Cached subset | 55 P47 + 245 P48 = 300 records |
| P44–48 initial envelope | 2,789 source records; extend backwards for 2013 and bills still active then |
| Calendar 2013+ ALRC rows | 2,154 |
| First-phase planning allowance | 3,000 bill summaries; budget estimate, not a measured deduplicated registry total |
| Bill-text sample versions | 79 versions from 311 section IDs |
| Cached billhome links | 198 bill_id candidates; 313 FRL code links |
| All P39–48 | 6,270 source records; 65 unfiltered listing requests cover all 6,469 including P38 |

## 3. Votes and speeches: measured joins

### Division counts

Bill-naming means a case-insensitive whole word `bill` or `bills` in `name`. It includes procedural divisions associated with a bill. “Matched” means at least one unambiguous registry identity passes the rule in section 4; it does **not** mean that the voter supported or opposed the bill. Compound motions can match several bills.

| Table | Jurisdiction | Rows | Dates | Bill-naming | Explicit bill/year | Matched rows | Unmatched rows | Matched bills |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| divisions | federal | 10575 | 2006-02-07 → 2026-08-20 | 5372 | 5213 | 3274 | 2098 | 1084 |
| divisions | qld | 442 | 2024-02-14 → 2026-08-26 | 18 | 3 | 0 | 18 | 0 |
| ext_divisions | nsw | 82 | 2025-11-27 → 2026-08-06 | 62 | 62 | 0 | 62 | 0 |
| ext_divisions | vic | 40 | 2026-08-14 → 2026-08-28 | 12 | 7 | 0 | 12 | 0 |
| ext_divisions | qld | 2 | 2026-03-04 → 2026-03-04 | 1 | 0 | 0 | 1 | 0 |
| ext_divisions | federal | 10574 | 2006-02-07 → 2026-08-20 | 5371 | 5212 | 3274 | 2097 | 1084 |

Do not add legacy and extended federal rows together. The extended copy excludes federal division 1764, which has no individual votes. Legacy Queensland rows are heading/PDF extraction records; the unified Queensland sample is the source with enumerated voters. Cross-source state deduplication must use the original sitting/chamber/division identity before any totals are shown.

| Table / group | Rows / count |
| --- | --- |
| All divisions | 11017 |
| All ext_divisions | 10698 |
| Legacy votes | 844874 |
| ext_votes | 850938 |
| Legacy divisions with votes | 10574 |
| Federal fetch bookkeeping | 10575 |
| Federal divisions lacking votes | 1 |
| State ext divisions | 124 |
| State ext votes, including pairs | 6064 |
| SA divisions in either table | 0 |

| Jurisdiction | Nonempty ext bill_ref |
| --- | --- |
| federal | 5127 |
| nsw | 63 |
| vic | 7 |
| qld | 1 |

bill_ref counts differ from name-based counts because the existing field uses separate heading heuristics. The measured title joins above use name consistently.

| Jurisdiction | Vote value | ext_votes | With party |
| --- | --- | --- | --- |
| federal | aye | 414463 | 414463 |
| federal | no | 430411 | 430411 |
| nsw | aye | 1650 | 0 |
| nsw | no | 2317 | 0 |
| nsw | paired | 240 | 0 |
| qld | aye | 102 | 102 |
| qld | no | 68 | 68 |
| qld | paired | 4 | 0 |
| vic | aye | 924 | 0 |
| vic | no | 759 | 0 |

The old statement in VOTES.md was **65% missing**, not 65% complete. That documented local gap is now closed: the database holds the previously reported TVFY API total. We did not re-enumerate the live TVFY API; newer omissions remain possible. One empty division and the absence of on-the-voices votes remain. State division collections are still small samples; NSW and Victoria currently have no party values on their ext vote rows. Never calculate their party splits from current party membership as if it were historical affiliation.

| Federal period | Bill-naming divisions | Matched | Distinct matched bills |
| --- | --- | --- | --- |
| Before 2013 | 1285 | 1068 | 440 |
| 2013 to opening of Parliament 47 | 2372 | 2206 | 649 |
| Parliaments 47–48 | 1715 | 0 | 0 |

Distinct matched bills overlap at period boundaries and must not be summed. The unresolved identity proxy below groups extracted explicit title/year mentions by jurisdiction and inferred term, preserving normalized title text. Extraction can leave compound-title fragments and miss headings without a year. Consequently it measures **unresolved title groups, not an authoritative count of missing bills**. The exact missing-bill count is established when the source registry resolves those groups.

| Table | Jurisdiction | All extracted title/term groups | Groups in unmatched rows |
| --- | --- | --- | --- |
| divisions | federal | 1565 | 502 |
| divisions | qld | 3 | 3 |
| ext_divisions | nsw | 8 | 8 |
| ext_divisions | vic | 4 | 4 |
| ext_divisions | qld | 0 | 0 |
| ext_divisions | federal | 1565 | 502 |

### Speeches

These are row counts in the local speech store, not confirmed portal/knowledge-box resource counts. No knowledge-box read or write was needed. `topic` is often missing or generic, and a bill title alone does not identify the reading stage.

| Jurisdiction / chamber | Speeches | Dates | Topic contains bill | Explicit second-reading topic |
| --- | --- | --- | --- | --- |
| federal / representatives | 715111 | 1901-05-09 → 2026-08-20 | 7486 | 0 |
| federal / senate | 108654 | 1901-05-09 → 2026-08-20 | 5779 | 0 |
| federal / senate_committee | 222965 | 2025-02-24 → 2026-06-05 | 0 | 0 |
| nsw / nsw_la | 70973 | 2015-05-05 → 2026-08-06 | 10590 | 1 |
| nsw / nsw_lc | 46775 | 2015-05-05 → 2026-08-06 | 12573 | 0 |
| qld / qld_la | 17222 | 2024-02-14 → 2026-08-26 | 5550 | 0 |
| sa / sa_ha | 42515 | 2020-02-05 → 2024-11-12 | 12192 | 0 |
| sa / sa_lc | 26467 | 2020-02-05 → 2023-05-17 | 7885 | 0 |
| vic / vic_la | 45289 | 2018-02-06 → 2026-08-27 | 11147 | 8741 |
| vic / vic_lc | 14506 | 2024-03-21 → 2026-08-28 | 2681 | 2089 |

| Jurisdiction | All speeches | Empty topic | Topic exactly Bill/Bills |
| --- | --- | --- | --- |
| federal | 1046730 | 757629 | 5259 |
| nsw | 117748 | 0 | 0 |
| qld | 17222 | 0 | 0 |
| sa | 68982 | 0 | 0 |
| vic | 59795 | 20 | 0 |

| Jurisdiction | Bill/reading candidate speeches | Matched speeches | Distinct matched bills | Ambiguous speeches | Explicit second-reading candidates / joined |
| --- | --- | --- | --- | --- | --- |
| federal | 13265 | 6759 | 1123 | 2 | 0 / 0 |
| nsw | 23164 | 0 | 0 | 0 | 1 / 0 |
| qld | 5550 | 0 | 0 | 0 | 0 / 0 |
| sa | 20077 | 0 | 0 | 0 | 0 / 0 |
| vic | 13851 | 0 | 0 | 0 | 10830 / 0 |

| Federal inferred parliament | Bill-topic speeches | Matched speeches |
| --- | --- | --- |
| 38 | 0 | 0 |
| 39 | 0 | 0 |
| 40 | 0 | 0 |
| 41 | 2931 | 2479 |
| 42 | 4221 | 3627 |
| 43 | 4021 | 653 |
| 44 | 190 | 0 |
| 45 | 0 | 0 |
| 46 | 0 | 0 |
| 47 | 592 | 0 |
| 48 | 1310 | 0 |

Federal titles are especially sparse after 2011: generic `Bills` topics explain much of Parliament 43’s fall-off, and there are no bill-topic candidates in Parliaments 45–46 despite a large speech corpus. Recover the debate hierarchy and stage from original Hansard metadata/source XML. Do not manufacture a second-reading flag from the existence of a bill match. NSW/SA/QLD often have yearless headings; a future jurisdiction/session/date-aware alias pass can use them, but this federal-only registry cannot.

## 4. Matching rule and precision audit

**Proposed ordering:** use authoritative source identity first (ParlInfo bill code; NSW billId; state register ID), then explicit source relationships, then conservative title/date candidates. Relationships are many-to-many. Keep confidence, rule version, evidence URL and unmatched reason on each link; never use an LLM to guess identity silently.

The measured title fallback does Unicode NFKC/casefold, `&` → `and`, punctuation and whitespace normalization, and fiscal-year expansion (`2005-06` → `2005 2006`). It retains substantive words, bill years and bill numbers. It ignores bracketed four-digit reprint years only, not `[No. 2]`. Match a full registry title as contiguous tokens inside a compound heading. Refuse a base-title match when the next token is `no`: this prevents a second introduction from inheriting the first bill’s record. No fuzzy similarity threshold was used.

A candidate must be federal, introduced on/before the division or speech, before the next parliament’s opening, and on/before known royal assent. Exactly one candidate per title is required. Same-name simultaneous House/Senate bills remain ambiguous; the measured ambiguous division is TVFY 4664, Fair Work Amendment (Protecting Take-Home Pay) Bill 2017, candidates 4391 and 5160. The date window is deliberately conservative: resumed Senate bills and post-assent references may be missed. Production should use explicit session, lapse/withdrawal and revival events rather than assuming every bill dies at the next opening.

For Acts, normalize `Bill` to `Act`, remove only the terminal title year/reprint year, and require a unique candidate with **exact ALRC royal-assent date**. This handles bill/Act year rollover. Prefer `originatingBillUri` once a bill code is known; preserve full historical URI IDs because the current regex loses `billshistorical` relationships. Act commencement is separate from assent.

### Hand-checked sample

The scoping agent manually inspected the literal source titles, dates and candidate registry titles below. This is a manual metadata audit, not independent human legal review or a verification of every underlying Hansard page. Sample chosen before correction: 60 federal divisions stratified over Parliaments 41–46 (8/12/14/10/8/8), 20 matched speech topic/date groups, and 20 matched Acts; seed `20260905`. Division populations were sorted by division_id before sampling. Sample speech IDs identify one actual row from each group. An emitted link is correct when it names the same bill instance; a row fails if it emits any wrong-instance link. Incomplete cognate lists reduce recall, not link precision.

| Check | Rows / edges | Correct | Precision / limitation |
| --- | --- | --- | --- |
| Initial accepted rows | 100 | 95 | 95.0%; errors on rows 13, 19, 37, 41, 42 |
| Initial emitted edges | 111 | 105 | 94.6% |
| Corrected same-sample accepted rows | 99 | 99 | 100%; row 13 now abstains |
| Corrected emitted edges | 105 | 105 | 100% on this diagnostic sample |
| Corrected division rows | 59 | 59 | 1 of 60 abstained |
| Speech rows | 20 | 20 | Bill identity only; no second-reading claim |
| Act rows | 20 | 20 | Title + assent metadata check |
| Independent holdout validation | 0 | Not run | Required before release; do not present in-sample 100% as production accuracy |

The initial prefix rule confused reintroduced bills with original bills. Corrected rows remove original IDs 3959/3960, 4194 and 4199 when `[No. 2]` is explicit. Row 13 originally emitted bill_id 3957 (the first introduction); it has no accepted exact second-instance match after correction and is left unresolved. The useful release target is high precision with visible abstentions, followed by a fresh stratified audit including state, yearless, compound, same-name, revised-title and negative controls.

#### Divisions

| Row | Source ID / date | Source title | Corrected registry match | Manual outcome |
| --- | --- | --- | --- | --- |
| 1 | 1343 / 2007-06-19 | Workplace Relations Amendment (A Stronger Safety Net) Bill 2007 — In Committee | 1398: Workplace Relations Amendment (A Stronger Safety Net) Bill 2007; introduced 2007-05-28 | Pass |
| 2 | 341 / 2006-11-29 | Commonwealth Radioactive Waste Management Legislation Amendment Bill 2006 — Second Reading | 1280: Commonwealth Radioactive Waste Management Legislation Amendment Bill 2006; introduced 2006-11-02 | Pass |
| 3 | 2879 / 2006-09-13 | Petroleum Retail Legislation Repeal Bill 2006 - In Committee - Disclosing product discount | 1186: Petroleum Retail Legislation Repeal Bill 2006; introduced 2006-03-30 | Pass |
| 4 | 1406 / 2007-08-16 | Families, Community Services and Indigenous Affairs and Other Legislation Amendment (Northern Territory National Emergency Response and Other Measures) Bill 2007 - In Committee - Access to Aboriginal land | 1433: Families, Community Services and Indigenous Affairs and Other Legislation Amendment (Northern Territory National Emergency Response and Other Measures) Bill 2007; introduced 2007-08-07 | Pass |
| 5 | 2808 / 2006-06-20 | Electoral and Referendum Amendment (Electoral Integrity and Other Measures) Bill 2006 — In Committee | 1146: Electoral and Referendum Amendment (Electoral Integrity and Other Measures) Bill 2006; introduced 2005-12-08 | Pass |
| 6 | 363 / 2007-02-28 | Human Services (Enhanced Service Delivery) Bill 2007 — Consideration in Detail | 3890: Human Services (Enhanced Service Delivery) Bill 2007; introduced 2007-02-07 | Pass |
| 7 | 1224 / 2006-12-05 | Commonwealth Radioactive Waste Management Legislation Amendment Bill 2006 — Second Reading | 1280: Commonwealth Radioactive Waste Management Legislation Amendment Bill 2006; introduced 2006-11-02 | Pass |
| 8 | 317 / 2006-11-02 | Medibank Private Sale Bill 2006 - Third Reading - Read a third time (DUPLICATE) | 1270: Medibank Private Sale Bill 2006; introduced 2006-10-18 | Pass |
| 9 | 1471 / 2008-06-18 | Same-Sex Relationships (Equal Treatment in Commonwealth Laws - Superannuation) Bill 2008 - Referral to Committees - Motion no. 1 | 1527: Same-Sex Relationships (Equal Treatment in Commonwealth Laws—Superannuation) Bill 2008; introduced 2008-05-28 | Pass |
| 10 | 652 / 2009-08-13 | Building and Construction Industry Improvement Amendment (Transition to Fair Work) Bill 2009 — Second Reading | 3962: Building and Construction Industry Improvement Amendment (Transition to Fair Work) Bill 2009; introduced 2009-06-17 | Pass |
| 11 | 573 / 2008-12-04 | Broadcasting Legislation Amendment (Digital Television Switch-Over) Bill 2008 — Second Reading | 1589: Broadcasting Legislation Amendment (Digital Television Switch-over) Bill 2008; introduced 2008-09-24 | Pass |
| 12 | 496 / 2008-06-05 | National Fuelwatch (Empowering Consumers) Bill 2008 — Second Reading — Read a second time | 3924: National Fuelwatch (Empowering Consumers) Bill 2008; introduced 2008-05-29 | Pass |
| 13 | 1782 / 2009-11-30 | Carbon Pollution Reduction Scheme Bill 2009 [No. 2] and related bills - In Committee - Free allocation of permits | Abstain: explicit No. 2 not resolved | Abstain |
| 14 | 678 / 2009-10-22 | Telecommunications Legislation Amendment (Competition and Consumer Safeguards) Bill 2009 — Second Reading — Put the question | 3972: Telecommunications Legislation Amendment (Competition and Consumer Safeguards) Bill 2009; introduced 2009-09-15 | Pass |
| 15 | 483 / 2008-06-02 | Excise Tariff Amendment (Condensate) Bill 2008; Excise Legislation Amendment (Condensate) Bill 2008 — Second Reading | 1510: Excise Tariff Amendment (Condensate) Bill 2008; introduced 2008-05-15; 1511: Excise Legislation Amendment (Condensate) Bill 2008; introduced 2008-05-15 | Pass |
| 16 | 448 / 2008-03-19 | Motions — Independent Reviewer of Terrorism Laws Bill 2008 — That the member be no longer heard | 3919: Independent Reviewer of Terrorism Laws Bill 2008; introduced 2008-03-17 | Pass |
| 17 | 674 / 2009-09-17 | Australian Citizenship Amendment (Citizenship Test Review and Other Measures) Bill 2009 — Second Reading | 1739: Australian Citizenship Amendment (Citizenship Test Review and Other Measures) Bill 2009; introduced 2009-06-25 | Pass |
| 18 | 1830 / 2010-03-15 | Food Importation (Bovine Meat Standards) Bill 2010 — Second Reading - Read a second time | 4929: Food Importation (Bovine Meat Standards) Bill 2010; introduced 2010-03-09 | Pass |
| 19 | 1806 / 2010-02-24 | Fairer Private Health Insurance Incentives (Medicare Levy Surcharge) Bill 2009 [No. 2] and Fairer Private Health Insurance Incentives (Medicare Levy Surcharge - Fringe Benefits) Bill 2009 [No. 2] - Second Reading - Read a second time | 3988: Fairer Private Health Insurance Incentives (Medicare Levy Surcharge—Fringe Benefits) Bill 2009 [No. 2]; introduced 2009-11-19; 3990: Fairer Private Health Insurance Incentives (Medicare Levy Surcharge) Bill 2009 [No. 2]; introduced 2009-11-19 | Pass |
| 20 | 596 / 2009-03-16 | Commonwealth Electoral Amendment (Political Donations and Other Measures) Bill 2009 - Second Reading - Agree to the bill's main idea | 3946: Commonwealth Electoral Amendment (Political Donations and Other Measures) Bill 2009; introduced 2009-03-12 | Pass |
| 21 | 1933 / 2010-11-26 | Telecommunications Legislation Amendment (Competition and Consumer Safeguards) Bill 2010 — In Committee — No—disadvantage test | 1916: Telecommunications Legislation Amendment (Competition and Consumer Safeguards) Bill 2010; introduced 2010-10-20 | Pass |
| 22 | 2274 / 2012-03-20 | Bills — Higher Education Support Amendment Bill (No. 1) 2012; Second Reading | 2161: Higher Education Support Amendment Bill (No. 1) 2012; introduced 2012-02-15 | Pass |
| 23 | 3118 / 2011-11-22 | Bills — Petroleum Resource Rent Tax (Imposition — General) Bill 2011; Second Reading | 2120: Petroleum Resource Rent Tax (Imposition—General) Bill 2011; introduced 2011-11-02 | Pass |
| 24 | 164 / 2012-11-21 | Water Amendment (Long-term Average Sustainable Diversion Limit Adjustment) Bill 2012 - Third Reading - Pass the bill | 2288: Water Amendment (Long-term Average Sustainable Diversion Limit Adjustment) Bill 2012; introduced 2012-09-20 | Pass |
| 25 | 804 / 2011-02-21 | National Radioactive Waste Management Bill 2010 — Second Reading | 1918: National Radioactive Waste Management Bill 2010; introduced 2010-10-21 | Pass |
| 26 | 2388 / 2012-08-22 | Bills — Cybercrime Legislation Amendment Bill 2011; Second Reading | 2030: Cybercrime Legislation Amendment Bill 2011; introduced 2011-06-22 | Pass |
| 27 | 177 / 2012-11-26 | Bills — Fair Entitlements Guarantee Bill 2012; in Committee | 2296: Fair Entitlements Guarantee Bill 2012; introduced 2012-10-11 | Pass |
| 28 | 2185 / 2011-11-23 | Bills — Parliamentary Service Amendment (Parliamentary Budget Officer) Bill 2011; in Committee | 2065: Parliamentary Service Amendment (Parliamentary Budget Officer) Bill 2011; introduced 2011-08-24 | Pass |
| 29 | 876 / 2011-06-23 | Bills — Higher Education Support Amendment (Demand Driven Funding System and Other Measures) Bill 2011; Consideration in Detail | 2018: Higher Education Support Amendment (Demand Driven Funding System and Other Measures) Bill 2011; introduced 2011-05-26 | Pass |
| 30 | 2434 / 2013-06-28 | Social Security Amendment (Supporting More Australians into Work) Bill 2013 - Second Reading - Increase Newstart and support single parents | 2408: Social Security Amendment (Supporting More Australians into Work) Bill 2013; introduced 2013-05-29 | Pass |
| 31 | 3487 / 2011-03-24 | Telecommunications Legislation Amendment (National Broadband Network Measures — Access Arrangements) Bill 2011 — Consideration of Senate Message | 1933: Telecommunications Legislation Amendment (National Broadband Network Measures—Access Arrangements) Bill 2011; introduced 2010-11-25 | Pass |
| 32 | 139 / 2012-10-31 | Bills — Defence Trade Controls Bill 2011; Consideration of House of Representatives Message | 2114: Defence Trade Controls Bill 2011; introduced 2011-11-02 | Pass |
| 33 | 3105 / 2011-11-22 | Bills — Minerals Resource Rent Tax (Consequential Amendments and Transitional Provisions) Bill 2011; Second Reading | 2122: Minerals Resource Rent Tax (Consequential Amendments and Transitional Provisions) Bill 2011; introduced 2011-11-02 | Pass |
| 34 | 159 / 2012-11-20 | Water Amendment (Long-term Average Sustainable Diversion Limit Adjustment) Bill 2012 - In Committee - Ground water amendment | 2288: Water Amendment (Long-term Average Sustainable Diversion Limit Adjustment) Bill 2012; introduced 2012-09-20 | Pass |
| 35 | 3184 / 2014-03-24 | Bills — Land Transport Infrastructure Amendment Bill 2014; Consideration in Detail | 2468: Land Transport Infrastructure Amendment Bill 2014; introduced 2014-02-27 | Pass |
| 36 | 3954 / 2015-10-14 | Bills — Food Standards Australia New Zealand Amendment (Forum on Food Regulation and Other Measures) Bill 2015; Consideration in Detail | 2747: Food Standards Australia New Zealand Amendment (Forum on Food Regulation and Other Measures) Bill 2015; introduced 2015-09-17 | Pass |
| 37 | 3312 / 2014-07-10 | Clean Energy Legislation (Carbon Tax Repeal) Bill 2013 [No. 2] - In Committee - Schedules 2 to 5 | 4233: Clean Energy Legislation (Carbon Tax Repeal) Bill 2013 [No. 2]; introduced 2014-06-23 | Pass |
| 38 | 3198 / 2014-05-14 | Fair Work (Registered Organisations) Amendment Bill 2013 - Second Reading - Agree to the bill's main idea | 4186: Fair Work (Registered Organisations) Amendment Bill 2013; introduced 2013-11-14 | Pass |
| 39 | 3429 / 2014-09-22 | Omnibus Repeal Day (Autumn 2014) Bill 2014 - Third Reading - Read a third time | 2488: Omnibus Repeal Day (Autumn 2014) Bill 2014; introduced 2014-03-19 | Pass |
| 40 | 4237 / 2016-05-02 | Bills — Northern Australia Infrastructure Facility Bill 2016, Northern Australia Infrastructure Facility (Consequential Amendments) Bill 2016; in Committee | 2804: Northern Australia Infrastructure Facility Bill 2016; introduced 2016-03-17; 2805: Northern Australia Infrastructure Facility (Consequential Amendments) Bill 2016; introduced 2016-03-17 | Pass |
| 41 | 3529 / 2014-07-17 | Bills — Minerals Resource Rent Tax Repeal and Other Measures Bill 2013 [No. 2]; in Committee | 4241: Minerals Resource Rent Tax Repeal and Other Measures Bill 2013 [No. 2]; introduced 2014-06-23 | Pass |
| 42 | 3293 / 2014-07-07 | Clean Energy Legislation (Carbon Tax Repeal) Bill 2013 [No. 2] and related bills - First Reading - Proceed without formality | 4233: Clean Energy Legislation (Carbon Tax Repeal) Bill 2013 [No. 2]; introduced 2014-06-23 | Pass |
| 43 | 3687 / 2015-02-12 | Bills – Environment Legislation Amendment Bill 2013 – in Committee – Amendment: extend protections to all threatened species | 2441: Environment Legislation Amendment Bill 2013; introduced 2013-11-14 | Pass |
| 44 | 4043 / 2015-12-03 | Tax Laws Amendment (Combating Multinational Tax Avoidance) Bill 2015 - in Committee - Tax information of companies earning over $100m | 2743: Tax Laws Amendment (Combating Multinational Tax Avoidance) Bill 2015; introduced 2015-09-16 | Pass |
| 45 | 5466 / 2018-10-17 | Treasury Laws Amendment (Gift Cards) Bill 2018 - Second Reading - Criticism of Government | 3164: Treasury Laws Amendment (Gift Cards) Bill 2018; introduced 2018-09-20 | Pass |
| 46 | 4707 / 2017-06-15 | Bills — Banking and Financial Services Commission of Inquiry Bill 2017; Second Reading | 5162: Banking and Financial Services Commission of Inquiry Bill 2017; introduced 2017-03-22 | Pass |
| 47 | 5369 / 2018-08-22 | Treasury Laws Amendment (Enterprise Tax Plan No. 2) Bill 2017 - in Committee - Keep bill unchanged | 4401: Treasury Laws Amendment (Enterprise Tax Plan No. 2) Bill 2017; introduced 2017-05-11 | Pass |
| 48 | 4431 / 2016-11-24 | Passenger Movement Charge Amendment Bill 2016 - Third Reading - Pass the bill | 2849: Passenger Movement Charge Amendment Bill 2016; introduced 2016-10-12 | Pass |
| 49 | 4365 / 2016-10-18 | Building and Construction Industry (Improving Productivity) Bill 2013 and one other - Third Reading - Pass the bill | 2814: Building and Construction Industry (Improving Productivity) Bill 2013; introduced 2016-08-31 | Pass |
| 50 | 4745 / 2017-06-21 | National Disability Insurance Scheme Amendment (Quality and Safeguards Commission and Other Measures) Bill 2017 - Second Reading - Royal Commission into Violence and Abuse against People with Disability | 2960: National Disability Insurance Scheme Amendment (Quality and Safeguards Commission and Other Measures) Bill 2017; introduced 2017-05-31 | Pass |
| 51 | 5121 / 2018-02-13 | Treasury Laws Amendment (Junior Minerals Exploration Incentive) Bill 2017 - Second Reading - Condemn Government | 3033: Treasury Laws Amendment (Junior Minerals Exploration Incentive) Bill 2017; introduced 2017-10-19 | Pass |
| 52 | 5465 / 2018-10-16 | Customs Amendment (Comprehensive and Progressive Agreement for Trans-Pacific Partnership Implementation) Bill 2018 - in Committee - Commencement | 3152: Customs Amendment (Comprehensive and Progressive Agreement for Trans-Pacific Partnership Implementation) Bill 2018; introduced 2018-08-23 | Pass |
| 53 | 7556 / 2021-12-01 | Electoral Legislation Amendment (Political Campaigners) Bill 2021 - Second Reading - Agree with bill's main idea | 3562: Electoral Legislation Amendment (Political Campaigners) Bill 2021; introduced 2021-08-12 | Pass |
| 54 | 6526 / 2020-09-01 | Higher Education Support Amendment (Job-Ready Graduates and Supporting Regional and Remote Students) Bill 2020 - Second Reading - Agree with the bill's main idea | 3413: Higher Education Support Amendment (Job-Ready Graduates and Supporting Regional and Remote Students) Bill 2020; introduced 2020-08-26 | Pass |
| 55 | 6535 / 2020-09-01 | Coronavirus Economic Response Package (Jobkeeper Payments) Amendment Bill 2020 - in Committee - Temporary visa holders | 3412: Coronavirus Economic Response Package (Jobkeeper Payments) Amendment Bill 2020; introduced 2020-08-26 | Pass |
| 56 | 7499 / 2021-11-22 | Electoral Legislation Amendment (Political Campaigners) Bill 2021 - Second Reading - Postpone vote | 3562: Electoral Legislation Amendment (Political Campaigners) Bill 2021; introduced 2021-08-12 | Pass |
| 57 | 7470 / 2021-10-21 | National Disability Insurance Scheme Amendment (Improving Supports for at Risk Participants) Bill 2021 - in Committee - Commencement | 4648: National Disability Insurance Scheme Amendment (Improving Supports for At Risk Participants) Bill 2021; introduced 2021-06-03 | Pass |
| 58 | 6947 / 2021-02-15 | Export Control Amendment (Miscellaneous Measures) Bill 2020 - in Committee - Repeal notes/section | 3455: Export Control Amendment (Miscellaneous Measures) Bill 2020; introduced 2020-11-11 | Pass |
| 59 | 6703 / 2020-11-10 | Economic Recovery Package (Jobmaker Hiring Credit) Amendment Bill 2020 - in Committee - Executive bonuses | 3441: Economic Recovery Package (JobMaker Hiring Credit) Amendment Bill 2020; introduced 2020-10-07 | Pass |
| 60 | 5801 / 2019-07-25 | Counter-Terrorism (Temporary Exclusion Orders) Bill 2019, Counter-Terrorism (Temporary Exclusion Orders) (Consequential Amendments) Bill 2019 - in Committee - Reviewing authority | 3231: Counter-Terrorism (Temporary Exclusion Orders) Bill 2019; introduced 2019-07-04; 3232: Counter-Terrorism (Temporary Exclusion Orders) (Consequential Amendments) Bill 2019; introduced 2019-07-04 | Pass |

#### Speeches

| Row | Source ID / date | Source title | Corrected registry match | Manual outcome |
| --- | --- | --- | --- | --- |
| 61 | 783108 / 2007-09-20 | National Health Security Bill 2007 | 1453: National Health Security Bill 2007; introduced 2007-09-13 | Pass |
| 62 | 778345 / 2007-02-15 | Appropriation Bill (No. 3) 2006-2007; Appropriation Bill (No. 4) 2006-2007 | 1324: Appropriation Bill (No. 4) 2006-2007; introduced 2007-02-08; 1326: Appropriation Bill (No. 3) 2006-2007; introduced 2007-02-08 | Pass |
| 63 | 788274 / 2008-09-25 | Australian Organ and Tissue Donation and Transplantation Authority Bill 2008 | 1579: Australian Organ and Tissue Donation and Transplantation Authority Bill 2008; introduced 2008-09-18 | Pass |
| 64 | 783419 / 2008-02-13 | Defence Amendment (Parliamentary Approval of Overseas Service) Bill 2008 | 4863: Defence Amendment (Parliamentary Approval of Overseas Service) Bill 2008; introduced 2008-02-13 | Pass |
| 65 | 788761 / 2008-10-16 | Dairy Adjustment Levy Termination Bill 2008; Trade Practices Amendment (Clarity in Pricing) Bill 2008 | 1583: Dairy Adjustment Levy Termination Bill 2008; introduced 2008-09-24; 1598: Trade Practices Amendment (Clarity in Pricing) Bill 2008; introduced 2008-09-25 | Pass |
| 66 | 805782 / 2011-03-24 | Tax Laws Amendment (2011 Measures No. 1) Bill 2011 | 1956: Tax Laws Amendment (2011 Measures No. 1) Bill 2011; introduced 2011-02-24 | Pass |
| 67 | 784886 / 2008-05-15 | Health Care (Appropriation) Amendment Bill 2008 | 1509: Health Care (Appropriation) Amendment Bill 2008; introduced 2008-05-15 | Pass |
| 68 | 771416 / 2006-03-27 | Schools Assistance (Learning Together — Achievement Through Choice and Opportunity) Amendment Bill 2006 | 1158: Schools Assistance (Learning Together—Achievement Through Choice and Opportunity) Amendment Bill 2006; introduced 2006-02-16 | Pass |
| 69 | 801935 / 2010-09-29 | Restoring Territory Rights (Voluntary Euthanasia Legislation) Bill 2010 | 4959: Restoring Territory Rights (Voluntary Euthanasia Legislation) Bill 2010; introduced 2010-09-29 | Pass |
| 70 | 804764 / 2011-02-24 | Offshore Petroleum and Greenhouse Gas Storage Regulatory Levies (Consequential Amendments) Bill 2011 | 1958: Offshore Petroleum and Greenhouse Gas Storage Regulatory Levies (Consequential Amendments) Bill 2011; introduced 2011-02-24 | Pass |
| 71 | 789539 / 2008-11-24 | Tax Laws Amendment (2008 Measures No. 5) Bill 2008 | 1595: Tax Laws Amendment (2008 Measures No. 5) Bill 2008; introduced 2008-09-25 | Pass |
| 72 | 804395 / 2011-02-10 | Crimes Legislation Amendment Bill 2010 | 1889: Crimes Legislation Amendment Bill 2010 [2011]; introduced 2010-09-29 | Pass |
| 73 | 782192 / 2007-08-16 | Higher Education Endowment Fund Bill 2007 | 1447: Higher Education Endowment Fund Bill 2007; introduced 2007-08-16 | Pass |
| 74 | 802362 / 2010-10-20 | Tradex Scheme Amendment Bill 2010 | 1873: Tradex Scheme Amendment Bill 2010; introduced 2010-09-29 | Pass |
| 75 | 804359 / 2011-02-09 | Federal Financial Relations Amendment (National Health and Hospitals Network) Bill 2010 | 4075: Federal Financial Relations Amendment (National Health and Hospitals Network) Bill 2010; introduced 2010-10-27 | Pass |
| 76 | 800363 / 2010-05-25 | Interstate Road Transport Charge Amendment Bill 2010 | 1839: Interstate Road Transport Charge Amendment Bill 2010; introduced 2010-05-12 | Pass |
| 77 | 779213 / 2007-03-22 | Schools Assistance (Learning Together — Achievement Through Choice and Opportunity) Amendment Bill 2007 | 1339: Schools Assistance (Learning Together—Achievement Through Choice and Opportunity) Amendment Bill 2007; introduced 2007-02-28 | Pass |
| 78 | 804949 / 2011-02-28 | National Radioactive Waste Management Bill 2010; Screen Australia (Transfer of Assets) Bill 2010; Statute Law Revision Bill (No. 2) 2010 | 1918: National Radioactive Waste Management Bill 2010; introduced 2010-10-21 | Pass |
| 79 | 803203 / 2010-11-16 | Higher Education Support Amendment (Fee-Help Loan Fee) Bill 2010 | 1914: Higher Education Support Amendment (FEE-HELP Loan Fee) Bill 2010; introduced 2010-10-20 | Pass |
| 80 | 803535 / 2010-11-18 | Defence Force Retirement and Death Benefits Amendment (Fair Indexation) Bill 2010 | 4980: Defence Force Retirement and Death Benefits Amendment (Fair Indexation) Bill 2010; introduced 2010-11-18 | Pass |

#### Acts

| Row | Source ID / date | Source title | Corrected registry match | Manual outcome |
| --- | --- | --- | --- | --- |
| 81 | C2009A00058 / 2009-06-26 | Social Security Legislation Amendment (Digital Television Switch-over) Act 2009 | 1687: Social Security Legislation Amendment (Digital Television Switch-over) Bill 2009; introduced 2009-05-13 | Pass |
| 82 | C2009A00070 / 2009-07-08 | Disability Discrimination and Other Human Rights Legislation Amendment Act 2009 | 1626: Disability Discrimination and Other Human Rights Legislation Amendment Bill 2009; introduced 2008-12-03 | Pass |
| 83 | C2004A00476 / 1999-07-16 | Customs Tariff Amendment (Aviation Fuel Revenues) Act 1999 | 118: Customs Tariff Amendment (Aviation Fuel Revenues) Bill 1999; introduced 1999-06-02 | Pass |
| 84 | C2004A00769 / 2001-03-20 | Aboriginal and Torres Strait Islander Commission Amendment Act 2001 | 349: Aboriginal and Torres Strait Islander Commission Amendment Bill 2001; introduced 2000-11-29 | Pass |
| 85 | C2021A00054 / 2021-06-24 | Competition and Consumer Amendment (Motor Vehicle Service and Repair Information Sharing Scheme) Act 2021 | 3513: Competition and Consumer Amendment (Motor Vehicle Service and Repair Information Sharing Scheme) Bill 2021; introduced 2021-03-24 | Pass |
| 86 | C2004A00453 / 1999-07-08 | A New Tax System (Wine Equalisation Tax and Luxury Car Tax Transition) Act 1999 | 91: A New Tax System (Wine Equalisation Tax and Luxury Car Tax Transition) Bill 1999; introduced 1999-03-24 | Pass |
| 87 | C2013A00029 / 2013-03-30 | Broadcasting Legislation Amendment (Convergence Review and Other Measures) Act 2013 | 2356: Broadcasting Legislation Amendment (Convergence Review and Other Measures) Bill 2013; introduced 2013-03-14 | Pass |
| 88 | C2014A00023 / 2014-04-09 | Export Market Development Grants Amendment Act 2014 | 2473: Export Market Development Grants Amendment Bill 2014; introduced 2014-03-06 | Pass |
| 89 | C2009A00009 / 2009-02-25 | Corporations Amendment (No. 1) Act 2009 | 1636: Corporations Amendment (No. 1) Bill 2008 [2009]; introduced 2008-12-03 | Pass |
| 90 | C2021A00059 / 2021-06-29 | National Radioactive Waste Management Amendment (Site Selection, Community Fund and Other Measures) Act 2021 | 3352: National Radioactive Waste Management Amendment (Site Selection, Community Fund and Other Measures) Bill 2020; introduced 2020-02-13 | Pass |
| 91 | C2009A00125 / 2009-12-09 | Resale Royalty Right for Visual Artists Act 2009 | 1621: Resale Royalty Right for Visual Artists Bill 2009; introduced 2008-11-27 | Pass |
| 92 | C2019A00113 / 2019-12-09 | National Disability Insurance Scheme Amendment (Streamlined Governance) Act 2019 | 3258: National Disability Insurance Scheme Amendment (Streamlined Governance) Bill 2019; introduced 2019-07-25 | Pass |
| 93 | C2004A00922 / 2001-10-01 | Treasury Legislation Amendment (Application of Criminal Code) Act (No. 2) 2001 | 397: Treasury Legislation Amendment (Application of Criminal Code) Bill (No. 2) 2001; introduced 2001-04-05 | Pass |
| 94 | C2013A00065 / 2013-06-26 | Customs Tariff Amendment (Incorporation of Proposals) Act 2013 | 2359: Customs Tariff Amendment (Incorporation of Proposals) Bill 2013; introduced 2013-03-20 | Pass |
| 95 | C2016A00076 / 2016-11-23 | Narcotic Drugs Legislation Amendment Act 2016 | 2838: Narcotic Drugs Legislation Amendment Bill 2016; introduced 2016-09-14 | Pass |
| 96 | C2009A00061 / 2009-06-29 | Guarantee of State and Territory Borrowing Appropriation Act 2009 | 1695: Guarantee of State and Territory Borrowing Appropriation Bill 2009; introduced 2009-05-27 | Pass |
| 97 | C2011A00100 / 2011-09-15 | Statute Stocktake Act (No. 1) 2011 | 1978: Statute Stocktake Bill (No. 1) 2011; introduced 2011-03-23 | Pass |
| 98 | C2013A00100 / 2013-06-29 | Charities Act 2013 | 2413: Charities Bill 2013; introduced 2013-05-29 | Pass |
| 99 | C2016A00007 / 2016-02-11 | Food Standards Australia New Zealand Amendment (Forum on Food Regulation and Other Measures) Act 2016 | 2747: Food Standards Australia New Zealand Amendment (Forum on Food Regulation and Other Measures) Bill 2015; introduced 2015-09-17 | Pass |
| 100 | C2006A00116 / 2006-11-04 | Medical Indemnity Legislation Amendment Act 2006 | 1244: Medical Indemnity Legislation Amendment Bill 2006; introduced 2006-09-13 | Pass |

## 5. Registry and summary design

Extend the existing logical `bills` registry with additive fields, retaining `bill_id` for existing references. Canonical keys use jurisdiction plus source identity, e.g. `au-federal-r7531`, `au-nsw-18524`; ALRC-only records receive stable provisional keys and aliases when reconciled. Do not make the title or current status part of a permanent identity.

| Field / relation | Design |
| --- | --- |
| bill_key / jurisdiction | Unique stable key; federal, nsw, vic, qld, sa, with extensible state/territory vocabulary |
| source_system / source_id / parliament / session | Unique source identity and official term metadata; distinguish reintroductions and same-name bills |
| title / short_title / aliases | Exact official title; readable short title; source-supported old, reprint and yearless aliases |
| introduced_date / originating_house | First introduction, separate from arrival in the second house; preserve date precision and original values |
| sponsor_person_id / sponsor_name / portfolio | Person and portfolio are different; include co-sponsors and carrying member in the other house through a related sponsor table |
| status / status_raw / status_as_of | introduced, before_house, passed_one_house, passed_both, assented, withdrawn, rejected, lapsed, unknown; never infer present status from an old snapshot |
| key_dates / bill_progress | First/second/third reading, amendments, passage by house, assent, lapse, revival and commencement; preserve source event and URL |
| source_urls / bill_sources | Billhome, text versions, original/revised/supplementary EM, digest, FRL Act; source id, kind, document date, fetch date, licence and content hash |
| text_source | Structured provenance: source kind, ID, URL, section anchor/offset, version, hash, extraction method; denote EM outline vs digest purpose explicitly |
| bill_summaries | Versioned structured summary, changes array, affected array, model/provider, prompt version, generation time, input/output tokens, review state and superseded version |
| bill_divisions / bill_speeches / bill_acts | Many-to-many links with rule, confidence, source evidence, bill version/stage, and audit outcome |
| bill_aliases / bill_relationships | Former provisional keys, reintroduction-of, cognate-with, amends and Act relationship; no destructive merge on title alone |

A bill can change during passage. An original EM explains what was proposed, not necessarily the final Act. Every summary needs a `describes_version` and `as_of` date. For enacted bills, check revised/supplementary EMs and amendments against the as-passed text or FRL Act before presenting the summary as “what changed”. Otherwise label it “What the bill proposed” and keep the enacted outcome separate. The Time Machine must select a version known at its selected date; it must not show later assent as if it had already occurred.

### Generation contract

Read the EM’s Outline/General Outline; when missing, use a digest’s Purpose/Key provisions section and identify that basis accurately. Neither billhome’s existing prose summary nor entire EMs/digests should be republished. Full text stays in the private source workspace; only independently expressed factual summaries and metadata reach the box/portal. Do not call the original source a neutral account of consequences: EMs describe the sponsor’s proposal, and contested impact claims need attribution.

The structured result has exactly three plain-English summary sentences, three to six factual “what it changes” bullets, and “who is affected”. Each claim has private evidence pointers for review. Missing evidence triggers `needs_review`, not invented details. Financial amounts, thresholds, dates, scope exceptions, prospective/retrospective effect and commencement deserve explicit checking. Very short technical bills should be held for review if the minimum bullet count would require padding.

Use the requested attribution for an EM-based summary: **“Written by a model from the explanatory memorandum; not the record”.** For a digest-based summary, replace “explanatory memorandum” with “Bills Digest”. Link the named document, issuer, version/date and licence. The official record remains separately accessible. Status/sponsor/dates are parsed metadata, not model-generated fields.

Make a dedicated resumable queue patterned on `scripts/label_workers.py`: claim, lease expiry/release, submit, verify and agreement sampling. That script currently clips text to head/tail and PATCHes topic labels into the knowledge box; it cannot be run unchanged for bill summaries. Use atomic claims, separate queue storage, source-hash/prompt-version idempotency, validated structured outputs, a stop switch, bounded retries and reviewed publication. Subscription workers have no incremental per-token bill under the stated arrangement, but consume subscription quota and operator/review time. No workers were started for this scope.

### Token measurements and generation cost

Characters/4 below are token **estimates**, not tokenizer measurements. Reading cost is much lower when the outline is extracted correctly. The five inspected EM openings included an original/replacement pair for the ASIO bill: source-version choice materially changes the content.

| Corpus | Documents | Min chars | Median chars | Mean chars | P90 chars | Max chars |
| --- | --- | --- | --- | --- | --- | --- |
| ems | 103 | 509 | 69514 | 117781.4 | 345470 | 699606 |

| Corpus | Documents | Min chars | Median chars | Mean chars | P90 chars | Max chars |
| --- | --- | --- | --- | --- | --- | --- |
| billsdgs | 100 | 13494 | 42441.5 | 41360.5 | 57393 | 95686 |

| Inspected EM | Outline characters | Estimated tokens | Boundary result |
| --- | --- | --- | --- |
| r2664 | 663 | 166 | Complete outline before Financial Impact |
| r2666 | 13632 | 3408 | Lower bound: outline continued past 14,000-character inspection window |
| r2667 | 1796 | 449 | Complete outline before Financial Impact |
| r7339 replacement | 3936 | 984 | Complete outline before next section |
| r7339 original | 3395 | 849 | Complete outline before next section |

Planning assumption: 4,000 total input tokens (selected source plus instructions/metadata) and 600 total billed output tokens per bill. Include reasoning in the output cap if the provider charges it. Long or structurally ambiguous outlines go to a separate larger-context/review queue. Add 25% for failed validation/retries; this allowance is not a measured retry rate.

The requested nominal DeepSeek v4 flash price is $0.08/$0.16 per million input/output tokens. A read-only [OpenRouter model catalog](https://openrouter.ai/api/v1/models) probe returned `deepseek/deepseek-v4-flash` at **$0.08778/$0.17556** per million. Catalog prices are per-token strings; [OpenRouter’s model documentation](https://openrouter.ai/docs/guides/overview/models) confirms the units. Prices vary by routing/model/date; recheck at execution. No completion endpoint was called. Costs are USD, excluding tax, credit-purchase fees, source retrieval and review. Formula: `N × (input_tokens × input_price_per_million + output_tokens × output_price_per_million) / 1,000,000`. The baseline is $0.000416 per bill nominally or $0.000456456 at the observed rate, before the retry allowance.

| Workload / scenario | Input tokens | Output tokens | Nominal $0.08/$0.16 | Observed $0.08778/$0.17556 | Observed +25% |
| --- | --- | --- | --- | --- | --- |
| One bill | 4,000 | 600 | $0.0004 | $0.0005 | $0.0006 |
| Pilot | 400,000 | 60,000 | $0.0416 | $0.0456 | $0.0571 |
| New P47–48 | 3,228,000 | 484,200 | $0.3357 | $0.3684 | $0.4604 |
| First phase allowance | 12,000,000 | 1,800,000 | $1.2480 | $1.3694 | $1.7117 |
| Existing ALRC registry | 21,252,000 | 3,187,800 | $2.2102 | $2.4252 | $3.0314 |
| P39–48 source envelope | 25,080,000 | 3,762,000 | $2.6083 | $2.8620 | $3.5775 |
| Each additional 1,000 state bills | 4,000,000 | 600,000 | $0.4160 | $0.4565 | $0.5706 |

| Sensitivity / alternative | Per bill | 3,000 bills |
| --- | --- | --- |
| 16,000 input + 1,000 output, observed rate | $0.00158004 | $4.74012 before retries |
| Full mean EM (~29,446 input + 600 output), nominal | $0.00245168 | $7.35504 before instructions/retries |
| Subscription agent workers | $0 incremental per-token under stated subscription | $0 incremental generation invoice; quota/time not free |

Use a paid batch API for a reproducible inexpensive bulk pass when authorized, or subscription workers for the pilot and harder review cases. A worker-capacity estimate should follow the pilot; the topic-label harness’s reported speech throughput is not a bill-summary benchmark.

## 6. Exposure and portal touchpoints

| Option | Advantages | Work and limitations |
| --- | --- | --- |
| Static portal/public/bills/<key>.json + index | Simple deterministic reads, versioned deploy/rollback, minimal runtime changes; easy lazy-load on tap | Not automatically searchable/askable in the knowledge box; building a second search layer duplicates work; thousands of files and deployment/cache lifecycle |
| Knowledge-box resource kind=bill — recommended | One summary body is searchable, askable and citable; per-resource cost is nil as specified; same content supports all touchpoints | Add kind taxonomy/labels and filters, Worker validation, result renderer and bill route; keep source text out and distinguish model prose from official records |
| Small static relationship manifest alongside recommended box resources | Stable bill_key → resource slug and division/speech/year maps; fast UI lookup without fuzzy runtime joins | Generated projection of the registry only; do not create a second independently edited summary store |

The existing source mapper already names `kind=bill` for billhome records, but the portal is not ready for it. `portal/src/index.ts`’s `KINDS` allowlist currently contains speech/legal/news/division/all; add bill to search/ask validation and the classification filter, teach result parsing the canonical bill slug, and add the frontend kind label/filter. Audit record loading, citations, snippets and default speech filters. Sponsor collaborators should be identified as sponsors, not treated as all people who voted or spoke. Attach deterministic bill relationships to speech/division metadata instead.

Keep authoritative relationships/status in the registry and publish a versioned summary resource, for example `bill-au-federal-r7531`, with the structured result in metadata and the readable summary/changes/affected text as the body. A minimal index contains key, title, jurisdiction, dates, status, resource slug and summary revision. Size assumption for planning: 6 KB per summary resource gives roughly 18 MB for the 3,000-bill phase, before relationship manifests; this is not a measured generated artifact.

| Touchpoint | Concrete behavior / implementation seam |
| --- | --- |
| Person vote lists | renderPersonVotes in portal/public/app.js currently links bill names to search; retain the existing substantive-vote polarity rules, add bill_key to export_votes output and open an accessible summary disclosure on tap with a bill-page link. Show stage/date and keep unknown matches as existing search links. |
| Party pages | Add bill-related divisions with dated party splits from vote-time affiliation; distinguish support for a reading from support for an amendment. Show unknown party affiliations, pairs and data coverage explicitly. |
| Second-reading document pages | Attach a bill context panel when bill identity is verified; label second reading only when source stage is recovered. Display source date and summary version, with a direct official-record link. |
| Time Machine | Year index selects bills introduced, debated, passed or assented in that year; distinguish event dates and retrieve the summary/status as of the selected time. Reuse bill keys from speech/decision data. |
| /bill/<key> | Server-routable and client-routable page with summary, changes, affected groups, sponsor, dated status timeline, official sources, related divisions/party splits and linked speeches with existing briefs. Paginate relationships; show the actual motion question. |
| Shared behavior | One reusable summary component, lazy fetch/cache by revision, keyboard/touch access, source attribution, empty/unknown states, and safe rendering of model text. Bill lookup failure must not hide a vote. |

The current person exporter already excludes amendments/gags and handles negative “decline a second reading” polarity. Preserve that separation: a bill identity match is not evidence that an “aye” backed the bill. All related procedural divisions may appear on the bill page when their question is displayed accurately. Existing speech briefs can be reused; generating a brief for every speech is outside the bill-generation estimate.

## 7. State probes and licence position

Each jurisdiction received a bounded listing probe; failed/obsolete paths and follow-up detail probes are recorded below. We did not enumerate or ingest state bill registries. The browser/Firecrawl renderer was needed where the direct HTTP response was blocked or only a JavaScript shell.

| Jurisdiction | Listing result / count | Format and explanatory material | Licence and consequence |
| --- | --- | --- | --- |
| NSW | Old bills-by-session.aspx: 404. Current-session listing: Firecrawl 200, 512 reported results, 10 rendered cards on first page | New portal uses search.parliament.nsw.gov.au billId links and embedded structured detail data; bill 18524 includes XN explanatory-note PDF, sponsor, progress, second-reading links and review digest. Guessed legacy bills API routes returned 404; do not claim a working registry API endpoint. | Current Parliament/API terms are not a blanket CC BY grant: attribution required; modified material/charging governed by terms. Verify the specific explanatory-note source before rollout. |
| Victoria | Parliament bills listing: direct 200; 17 distinct bill-detail URLs | HTML landing page links legislation.vic.gov.au; government Associations Incorporation Reform Amendment Bill 2026 has EM in PDF/DOCX and timeline. Two inspected private-member details had no EM link. | Parliament allows research/personal/organisational use; broader reuse permission required. legislation.vic.gov.au also restricts reproduction. Do not inherit CC BY from premier.vic.gov.au press releases. |
| Queensland | Bills-before-House: direct 403; Firecrawl 200; 16 rows, 16 explanatory-note links | HTML table: title, sponsor/date, stage, bill PDF, Exp Note, compatibility statement and explanatory speech. Legislative history on legislation.qld.gov.au is the preferred attribution-friendly document source. | Parliament web prose is CC BY-NC-ND 3.0 AU, excluding parliamentary documents. legislation.qld.gov.au is CC BY 4.0 with exclusions; verify each document’s actual host and attribution. |
| South Australia | Parliament legislation/index pages: 200; SALT: 200 JavaScript application. /bills obsolete; /legislation/bills works through Firecrawl | SALT is an embedded Angular app; legislation site offers current-session and archived 2005+ A–Z listings. Current-session A listing: 2 bill rows. No standalone EM link on that listing; explanations of clauses are published with second-reading material in Hansard (example linked below). | legislation.sa.gov.au has CC BY 4.0 with exclusions. Parliament-hosted SALT/Hansard terms must be recorded separately; do not extend that licence across hosts. |

SA explanatory material evidence: the [official Council Hansard of 29 October 2025](https://hansardsearch.parliament.sa.gov.au/daily/uh/2025-10-29/pdf/download) records a second-reading explanation and explanation of clauses. This was verified through the official search excerpt, not a full PDF parse. For SA, add a distinct `second_reading_explanation` fallback and attribution; do not label it an EM. Whether each bill has a standalone explanatory document remains unmeasured.

Verified source terms: [Parliament of Australia](https://www.aph.gov.au/Help/Disclaimer_Privacy_Copyright), [Federal Register of Legislation](https://www.legislation.gov.au/terms-of-use), [NSW copyright](https://www.parliament.nsw.gov.au/copyright), [NSW API information](https://www.parliament.nsw.gov.au/parliamentary-business/hansard/hansard-api), [Victoria Parliament](https://www.parliament.vic.gov.au/copyright/), [Victoria legislation](https://www.legislation.vic.gov.au/copyright), [Queensland Parliament](https://www.parliament.qld.gov.au/Global/Copyright), [Queensland legislation](https://www.legislation.qld.gov.au/copyright), [South Australia legislation](https://www.legislation.sa.gov.au/copyright).

For federal sources, follow the owner’s boundary: read aph.gov.au/ParlInfo material, independently explain the underlying facts, and do not republish its text. The site licence is CC BY-NC-ND 4.0; that is **not** a general permission to publish adaptations. Avoid close paraphrases, copied billhome summaries and source excerpts in the box. This scope proposes independent factual writing with citations, not a legal conclusion that every model output is compliant. FRL is CC BY 4.0 and allows adaptation with attribution and changes identified. No source permissions were requested and nothing was submitted externally.

## 8. Phases, effort, cost and acceptance

An agent-day here means one focused agent’s implementation/validation work, not elapsed crawl time and not an independently verified throughput promise. Human editorial/legal decisions and waiting for access are separate. The order prioritises present vote visibility, then historical breadth.

| Phase | Deliverables and release gate | Agent-days estimate |
| --- | --- | --- |
| 1a: federal 2013–2026 registry | Reconcile ALRC, enumerate active/reintroduced and new billhomes, dedupe identities; recover original Hansard stage/title where missing; produce exact per-bill source availability manifest and fresh join audit. | 2–3 |
| 1b: source/summary pilot then bulk | Extract versioned outlines, 100-bill pilot spanning EM/digest/missing/changed bills, claim-level review; then approved generation up to the 3,000-bill planning envelope. Status remains parsed. | 2–3 |
| 1c: publish and expose | bill resource kind/search/ask, static relation index, bill route, person/party/document/Time Machine panels; verify vote polarity and historical dates end-to-end. | 3–4 |
| Phase 1 total | Federal 2013–2026 first; no release until identity and wording checks pass. | 7–10 |
| 2: backfill to 1998 | Parliaments 39–43 plus carryovers; older EM formats and historical FRL URI support; fix outlier dates with source evidence, retain provenance. | 3–5 |
| 3: NSW | Registry/source adapter, explanatory-note extraction, historical sponsor/party map, source-licence check and state join audit; cover existing 2025–2026 votes and speech window. | 3–5 |
| 4: Victoria then Queensland | State IDs/yearless aliases, PDF/DOCX note extraction and status adapters; cover 2026 VIC votes and 2024–2026 QLD legacy/discovered divisions; explicit licence checks. | 4–6 combined |
| 5: South Australia | SALT/current/archive adapter and explanatory-source assessment; speech-first 2020–2024 exposure, divisions when a verified source is added. | 2–4 |
| Total sequential effort | Includes phase 1 subphases once; estimates, not commitments. | 19–30 |

Phase 1’s smallest reviewable increment is the registry plus a 100-bill summary pilot attached to real substantive votes, including examples from each supported year and both houses. Confirm the input version and independently check every number/date/claimed change in the pilot; take a new identity holdout after the measured rule fix. Keep unresolved identities and missing source bodies visible in the manifest. Then run the bulk pass and verify search, ask citations, direct bill URLs and historical Time Machine behavior before release.

### Retrieval budget and WAF risk

ParlInfo rejects the honest OPAX User-Agent with 403; a Firefox User-Agent succeeded for the bounded probes. Use a slow, resumable, cache-first fetcher with retries/backoff, an explicit host rate limit and stop-on-persistent-block behavior. Decode UTF-8 explicitly; preserve full titles from the title element (the metadata title can truncate); repair known digest mojibake; distinguish cover/table-of-contents pages from body sections. Read inline EM/digest display pages; do not follow ParlInfo’s robots-disallowed `/download/` or `/genpdf/` links. The scope fetched no such paths.

Do not crawl every bill-text section just to write a summary. Fetch a selected EM and only relevant later versions/as-passed evidence. Digest fallback discovery can use the verified BillId_Phrase search; recheck negative results independently for priority bills.

| Fetch scenario | Requests / credits assumption | Time / USD estimate |
| --- | --- | --- |
| New P47–48 metadata only | 9 listing + 807 billhome = 816 direct requests | ~19.4 minutes minimum at 0.7 rps; add response latency |
| First phase summary collection | 30 listings + 3,000 homes + 3,000 selected sources + 300 fallback lookups = 6,330 | ~2.5 hours minimum at 0.7 rps; revisions/retries extra |
| All P39–48 envelope | 65 listings + 6,270 homes + 6,270 sources + 627 lookups = 13,232 | ~5.3 hours minimum at 0.7 rps; full-text version crawling excluded |
| Direct HTTP | No Firecrawl credits; use existing cached bodies where suitable | $0 third-party scrape invoice |
| Firecrawl basic full first-phase fallback | 6,330 credits if every request costs one credit | $15.83 at Standard overage $5/2,000; $31.65 at Hobby $5/1,000 |
| Firecrawl basic all-term fallback | 13,232 credits at one/page | $33.08 Standard overage; $66.16 Hobby overage |
| Generation, first phase incl 25% allowance | 3,000 × 4,000 input / 600 output at observed catalog price | $1.71 USD |
| This scope | No model generation; Firecrawl scrape-only calls counted in probe ledger | Existing scrape credits only; no subscription or plan purchase |

[Firecrawl’s current pricing](https://www.firecrawl.dev/pricing) lists basic scrape at one credit/page and the overage schedules above. These are credit-cost equivalents, not promises about the account’s marginal invoice; included credits may make incremental spend nil. Enhanced proxy/PDF options and retries can cost more. The fallback budget uses basic HTML scrapes, not agent/extract/generation. No billing settings were changed.

Main risks: stale or malformed dates; title collisions and reintroductions; original-EM vs final-Act differences; incomplete speech topics; state division and historical party coverage; WAF changes; and source-specific reuse terms. The small API bill is not the schedule risk. Every published claim should retain provenance and a correction path.

## 9. Reproduction and probe ledger

The requested `sqlite3` command failed on `desktop` because the executable is absent (`command not found: sqlite3`). Used Python’s SQLite driver with the same read-only URI semantics, `uri=True`, plus `PRAGMA query_only=ON`. No database initialization helpers or ingest modules were invoked. The main export held one read transaction; additional aggregate/source-opening probes also used `mode=ro`. There was no remote file creation and no database write, journal-mode change, schema mutation or ingest.

Read-only shell pattern (run from this worktree; no `cd` required):

```sh
ssh desktop python3 - <<'PYREAD'
import sqlite3, json
c = sqlite3.connect('file:/home/jake/.cache/autoresearch/parli.db?mode=ro', uri=True)
c.row_factory = sqlite3.Row
c.execute('PRAGMA query_only=ON')
c.execute('BEGIN')
for q in [
  'SELECT status, COUNT(*) n FROM bills GROUP BY status',
  'SELECT substr(introduced_date,1,4) year,COUNT(*) n FROM bills GROUP BY 1',
  'SELECT stage,COUNT(*) n,MIN(date),MAX(date) FROM bill_progress GROUP BY stage',
  'SELECT state,COUNT(*) n,MIN(date),MAX(date) FROM divisions GROUP BY state',
  'SELECT jurisdiction,COUNT(*) n FROM ext_divisions GROUP BY jurisdiction',
  'SELECT jurisdiction,vote,COUNT(*) n FROM ext_votes GROUP BY jurisdiction,vote',
  'SELECT dataset,COUNT(*) n,COUNT(DISTINCT bill_code) codes FROM ext_parlinfo_docs GROUP BY dataset',
  'SELECT COUNT(*) n,SUM(bill_uri IS NOT NULL AND bill_uri != "") uris,SUM(bill_code IS NOT NULL) codes FROM ext_frl_acts'
]:
  print(q, json.dumps([dict(r) for r in c.execute(q)]))
c.rollback()
PYREAD
```

The actual main export script and matching analysis are embedded below, so reproduction does not depend on scratch files surviving. They only SELECT from desktop and analyze a local JSON export. To reproduce, extract the first script to `/tmp/opax-scope-bills/read_db.py`, run `ssh desktop python3 - < /tmp/opax-scope-bills/read_db.py > /tmp/opax-scope-bills/db.json`, and run the analysis script locally. It writes scratch results, never the database. The manual audit uses the fixed source IDs in section 4; the original sample preceded the documented suffix correction.

<details>
<summary>Exact main read-only export script</summary>

```python
import sqlite3,json,datetime
c=sqlite3.connect('file:/home/jake/.cache/autoresearch/parli.db?mode=ro',uri=True)
c.row_factory=sqlite3.Row
c.execute('PRAGMA query_only=ON')
c.execute('BEGIN')
def rows(q): return [dict(r) for r in c.execute(q)]
out={'observed_at':datetime.datetime.now(datetime.timezone.utc).isoformat()}
qs={
'bills':'select * from bills',
'progress':'select bill_id,min(date) first_event,max(date) last_event,max(case when stage="royal_assent" then date end) assent,count(*) events from bill_progress group by bill_id',
'progress_stats':'select stage,count(*) n,min(date) min_date,max(date) max_date from bill_progress group by stage',
'divisions':'select * from divisions',
'ext_divisions':'select * from ext_divisions',
'vote_counts':'select "legacy" dataset,count(*) n,count(distinct division_id) divisions from votes union all select "ext",count(*),count(distinct division_id) from ext_votes',
'ext_vote_groups':'select jurisdiction,vote,count(*) n,sum(party is not null and party != "") with_party from ext_votes group by jurisdiction,vote',
'docs':'select parlinfo_id,dataset,title,date,source,display_url,bill_code,bill_id,length(body_text) body_chars,body_fetched,meta_json from ext_parlinfo_docs where dataset in ("billhome","bills","billshistorical","ems","billsdgs")',
'doc_stats':'select dataset,count(*) n,min(date) min_date,max(date) max_date,count(distinct bill_code) codes,sum(length(body_text)>0) bodies,sum(length(body_text)) chars from ext_parlinfo_docs group by dataset',
'acts':'select * from ext_frl_acts',
'speech_stats':'select state,chamber,count(*) n,min(date) min_date,max(date) max_date,sum(lower(topic) like "%bill%") bill_topics,sum(lower(topic) like "%second reading%" or lower(topic) like "%second-reading%") explicit_second_reading from speeches group by state,chamber',
'speech_topics':'select state,chamber,date,topic,count(*) n,min(speech_id) example_id from speeches where lower(topic) like "%bill%" or lower(topic) like "%second reading%" group by state,chamber,date,topic',
'speech_sources':'select state,source,count(*) n from speeches group by state,source',
'fields':'select count(*) n,sum(title is null or title="") missing_title,sum(introduced_date is null) missing_date,sum(portfolio is null or portfolio="") missing_portfolio,sum(house is null or house="") missing_house from bills'
}
for k,q in qs.items(): out[k]=rows(q)
print(json.dumps(out))
c.rollback()
c.close()
```

</details>

<details>
<summary>Exact corrected local matching/counting script</summary>

```python
import json,re,unicodedata,collections,datetime,bisect,random,pathlib
P=pathlib.Path('/tmp/opax-scope-bills');d=json.load(open(P/'db.json'))
starts=['1998-11-10','2002-02-12','2004-11-16','2008-02-12','2010-09-28','2013-11-12','2016-08-30','2019-07-02','2022-07-26','2025-07-22']
def parl(date):return 38+bisect.bisect_right(starts,date or '')
def norm(t):
 t=unicodedata.normalize('NFKC',t or '').casefold().replace('&',' and ')
 t=re.sub(r'\[(?:19|20)\d{2}\]', ' ', t)
 t=re.sub(r'((?:19|20)\d{2})[–-](\d{2})\b',lambda m:m[1]+' '+m[1][:2]+m[2],t)
 return re.sub(r'[^\w]+',' ',t).strip()
progress={r['bill_id']:r for r in d['progress']}
bills={r['bill_id']:r for r in d['bills']}
idx=collections.defaultdict(list)
for b in d['bills']: idx[norm(b['title'])].append(b)
# Match full normalized registry title, preserving numbers and bill year. Prefix trie for efficient scanning.
trie={}
for k in idx:
 node=trie
 for w in k.split():node=node.setdefault(w,{})
 node['$']=k

def keys(text):
 ws=norm(text).split();found=set()
 for i in range(len(ws)):
  n=trie
  for j,w in enumerate(ws[i:],i):
   if w not in n:break
   n=n[w]
   if '$' in n and not (j+1<len(ws) and ws[j+1]=='no'):
    found.add(n['$'])
 return sorted(found)
def match(text,date,jur='federal'):
 if jur!='federal':return [],[]
 hits=[];amb=[]
 for k in keys(text):
  candidates=[]
  for b in idx[k]:
   intro=b['introduced_date'];p=parl(intro)
   end=starts[p-38] if 39<=p<48 else (starts[0] if p<39 else '2026-09-05')
   assent=progress[b['bill_id']]['assent']
   if intro<=date<end and (not assent or date<=assent):candidates.append(b['bill_id'])
  if len(candidates)==1:hits+=candidates
  elif len(candidates)>1:amb+=candidates
 return sorted(set(hits)),sorted(set(amb))
def refs(text):
 # Extract explicit bill-year spans. These are title mentions, not identities.
 text=re.sub(r'^\s*Bills\s*[-—:]\s*','',text or '',flags=re.I)
 parts=re.split(r';|\s+[—–]\s+|\s+-\s+',text)
 found=[]
 for part in parts:
  for m in re.finditer(r'([^;]+?\bBills?\s*(?:\(No\.?\s*\d+\)\s*)?(?:19|20)\d{2}(?:[-–](?:\d{2}|\d{4}))?(?:\s*\[\d{4}\])?)',part,re.I):
   found.append(norm(m[1]))
 return found
out={}
for table,jfield in [('divisions','state'),('ext_divisions','jurisdiction')]:
 group=collections.defaultdict(list)
 for r in d[table]:group[r[jfield]].append(r)
 res=[]
 for j,rr in group.items():
  named=[r for r in rr if re.search(r'\bbills?\b',r['name'] or '',re.I)]
  matched=[];amb=[];target=set();unrefs=set();allrefs=set()
  for r in named:
   h,a=match(r['name'],r['date'],j);r['_hits']=h;r['_amb']=a
   if h:matched.append(r);target.update(h)
   if a:amb.append(r)
   rs=refs(r['name']);allrefs.update((parl(r['date']),x) for x in rs)
   if not h:unrefs.update((parl(r['date']),x) for x in rs)
  res.append({'jurisdiction':j,'rows':len(rr),'min':min(r['date'] for r in rr),'max':max(r['date'] for r in rr),'bill_named':len(named),'explicit_bill_year':sum(bool(refs(r['name'])) for r in named),'matched':len(matched),'unmatched':len(named)-len(matched),'ambiguous':len(amb),'distinct_bills_matched':len(target),'unmatched_title_term_mentions':len(unrefs),'all_title_term_mentions':len(allrefs)})
 out[table]=res
out['speech']=[]
for j in sorted(set(r['state'] for r in d['speech_topics'])):
 rr=[r for r in d['speech_topics'] if r['state']==j];total=matched=second=secondmatched=amb=0;bid=set()
 for r in rr:
  h,a=match(r['topic'],r['date'],j);r['_hits']=h;r['_amb']=a
  total+=r['n'];matched+=r['n'] if h else 0;amb+=r['n'] if a else 0;bid.update(h)
  if re.search(r'second[ -]reading',r['topic'] or '',re.I):second+=r['n'];secondmatched+=r['n'] if h else 0
 out['speech'].append(dict(jurisdiction=j,bill_or_reading_speeches=total,matched=matched,ambiguous=amb,distinct_bills=len(bid),explicit_second=second,explicit_second_matched=secondmatched))
# Acts title join: Bill -> Act, title year can change on passage, use base title + actual assent date where available.
actidx=collections.defaultdict(list)
for a in d['acts']:
 key=re.sub(r'\b(?:19|20)\d{2}$','',norm(a['name'])).strip();actidx[key].append(a)
for b in d['bills']:
 key=norm(re.sub(r'\bBill\b','Act',b['title'],flags=re.I));key=re.sub(r'\b(?:19|20)\d{2}$','',key).strip()
 cand=[];assent=progress[b['bill_id']]['assent']
 for a in actidx[key]:
  if assent and a['making_date']==assent:cand.append(a)
 b['_acts']=cand if len(cand)==1 else []
# cached billhome -> ALRC mapping revalidate date; existing link only informational
home=[r for r in d['docs'] if r['dataset']=='billhome'];ems=[r for r in d['docs'] if r['dataset']=='ems'];dig=[r for r in d['docs'] if r['dataset']=='billsdgs']
emcodes={r['bill_code'] for r in ems};acodes={r['bill_code'] for r in d['acts'] if r['bill_code']}
for h in home:
 h['_em']=h['bill_code'] in emcodes
 h['_digest']=any(norm(x['title'])==norm(h['title']) and h['date']<=x['date'] and parl(x['date'])==parl(h['date']) for x in dig)
 h['_act']=h['bill_code'] in acodes
out['coverage']=[]
for p in range(38,49):
 bb=[b for b in d['bills'] if parl(b['introduced_date'])==p];hh=[h for h in home if parl(h['date'])==p]
 out['coverage'].append(dict(parliament=p,registry=len(bb),passed=sum(b['status']=='passed' for b in bb),act_assent_join=sum(bool(b['_acts']) for b in bb),cached_home=len(hh),cached_em=sum(h['_em'] for h in hh),cached_digest=sum(h['_digest'] for h in hh),cached_act=sum(h['_act'] for h in hh)))
out['status']=dict(collections.Counter(b['status'] for b in d['bills']))
out['years']=dict(sorted(collections.Counter(b['introduced_date'][:4] for b in d['bills']).items()))
out['speech_parliament']=[]
for p in range(38,49):
 rr=[r for r in d['speech_topics'] if r['state']=='federal' and parl(r['date'])==p]
 out['speech_parliament'].append({'parliament':p,'bill_speeches':sum(r['n'] for r in rr),'matched':sum(r['n'] for r in rr if r['_hits'])})
# Reproducible stratified positive sample for manual assessment: 60 divisions, 20 speeches, 20 Acts.
rng=random.Random(20260905);sample=[]
for p,n in [(41,8),(42,12),(43,14),(44,10),(45,8),(46,8)]:
 rr=sorted([r for r in d['divisions'] if r['state']=='federal' and r.get('_hits') and parl(r['date'])==p],key=lambda r:r['division_id'])
 for r in rng.sample(rr,min(n,len(rr))):sample.append(dict(type='division',id=r['division_id'],date=r['date'],title=r['name'],bills=[bills[x] for x in r['_hits']]))
rr=[r for r in d['speech_topics'] if r['state']=='federal' and r['_hits']]
for r in rng.sample(rr,20):sample.append(dict(type='speech',id=r['example_id'],date=r['date'],title=r['topic'],bills=[bills[x] for x in r['_hits']]))
rr=[b for b in d['bills'] if b['_acts']]
for b in rng.sample(rr,20):
 a=b['_acts'][0];sample.append(dict(type='act',id=a['act_id'],date=a['making_date'],title=a['name'],bill_code=a['bill_code'],bills=[b]))
(P/'metrics.json').write_text(json.dumps(out,indent=2));(P/'annotated.json').write_text(json.dumps(d));(P/'sample.json').write_text(json.dumps(sample,indent=2))
print(json.dumps(out,indent=2))
```

</details>

### Public request commands

All public HTTP probes were GET requests except Firecrawl’s scrape POST wrapper, which only fetched HTML/Markdown. It used the supplied key from `~/.claude.json` in memory; credentials were not printed or written to the report. Neither source ingest nor paid text generation was invoked.

```python
# Independent read probe; write its bytes only to local scratch if needed.
import urllib.request, urllib.parse
ua = 'Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0'
query = 'Dataset:billhome ParliamentNumber:"47"'
url = ('https://parlinfo.aph.gov.au/parlInfo/search/summary/summary.w3p;'
       'adv=yes;orderBy=date-eFirst;page=0;query=' + urllib.parse.quote(query) + ';resCount=100')
with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent':ua}), timeout=35) as r:
    body = r.read()
    print(r.status, len(body))
# EM/digest facets: query='Dataset:ems' or 'Dataset:billsdgs'.
# Per-bill digest existence: query='Dataset:billsdgs BillId_Phrase:"r1344"', resCount=1.
# Billhome: /parlInfo/search/display/display.w3p;query=Id:%22legislation/billhome/<code>%22
```

For FRL: `GET https://api.prod.legislation.gov.au/v1/titles` with `$filter=collection eq 'Act'`, `$orderby=id`, `$top=1`, `$count=true`, `$select=id,name,originatingBillUri`. Result: HTTP 200, 337 bytes, `@odata.count=13732`; first title C1901A00001 has a historical bill URI. Only one Act record fetched. Dates/order-by traps in DATA-WORDS were not stress-tested: production should page stably on id and filter dates locally.

For OpenRouter: `GET https://openrouter.ai/api/v1/models`, no authorization or generation. HTTP 200; 713,831 bytes. Select `data[id == "deepseek/deepseek-v4-flash"].pricing`, as reported above. Context7 resolve/query calls checked OpenRouter’s current catalog schema and price units.

| Repeated direct probes | Requests | HTTP status counts | Total response bytes |
| --- | --- | --- | --- |
| Sample billhome display reads | 50 | {'200': 50} | 1873533 |
| Sample bill-code digest existence reads | 50 | {'200': 50} | 1528465 |
| Per-parliament first listing pages | 10 | {'200': 10} | 1679666 |

| Other direct probe | URL | HTTP | Bytes / observation |
| --- | --- | --- | --- |
| openrouter | https://openrouter.ai/api/v1/models | 200 | 713831 |
| parlinfo | https://parlinfo.aph.gov.au/parlInfo/search/summary/summary.w3p;adv=yes;orderBy=date-eFirst;page=0;query=Dataset%3Abillhome;resCount=100 | 403 | 8079 |
| vic | https://www.parliament.vic.gov.au/parliamentary-activity/bills-and-legislation/ | 200 | 91858 |
| qld | https://www.parliament.qld.gov.au/Work-of-the-Assembly/Bills-and-Legislation/Bills-before-the-House | 403 | 7963 |
| frl | https://api.prod.legislation.gov.au/v1/titles?%24filter=collection+eq+%27Act%27&%24orderby=id&%24top=1&%24count=true&%24select=id%2Cname%2CoriginatingBillUri | 200 | 337 |
| sa | https://www.parliament.sa.gov.au/en/Legislation/Legislation-Home | 200 | 47579 |
| nsw | https://www.parliament.nsw.gov.au/bills/Pages/bills-by-session.aspx | 404 | 78903 |
| parlinfo_browser | https://parlinfo.aph.gov.au/parlInfo/search/summary/summary.w3p;adv=yes;orderBy=date-eFirst;page=0;query=Dataset%3Abillhome;resCount=100 | 200 | 184634 |
| nsw_current | https://www.parliament.nsw.gov.au/parliamentary-business/bills | 403 | 7175 |
| vic_copyright | https://www.parliament.vic.gov.au/copyright/ | 200 | 71273 |
| sa_bills | https://www.parliament.sa.gov.au/en/Legislation/Bills-and-Motions | 200 | 46826 |
| qld_copyright | https://www.parliament.qld.gov.au/Global/Copyright | 200 | 119746 |
| aph_copyright | https://www.aph.gov.au/Help/Disclaimer_Privacy_Copyright | 200 | 74323 |
| vic_example | https://www.legislation.vic.gov.au/bills/domestic-gas-choice-repeal-gas-appliance-ban-bill-2026 | 200 | 120917 |
| sa_copyright | https://www.legislation.sa.gov.au/copyright | 200 | 67799 |
| listing_ems | https://parlinfo.aph.gov.au/parlInfo/search/summary/summary.w3p;adv=yes;orderBy=date-eFirst;page=0;query=Dataset%3Aems;resCount=100 | 200 | 244574 |
| listing_billsdgs | https://parlinfo.aph.gov.au/parlInfo/search/summary/summary.w3p;adv=yes;orderBy=date-eFirst;page=0;query=Dataset%3Abillsdgs;resCount=100 | 200 | 284783 |
| sa_leg_bills | https://www.legislation.sa.gov.au/bills | 403 | 5666 |
| nsw_api_docs | https://api.parliament.nsw.gov.au/swagger/v1/swagger.json | 404 | 0 |
| sa_salt | https://www.parliament.sa.gov.au/en/Legislation/SALT | 200 | 46432 |
| frl_copyright | https://www.legislation.gov.au/copyright | 200 | 38660 |
| vic_em_example | https://www.legislation.vic.gov.au/bills/local-government-amendment-stability-councils-bill-2026 | 200 | 120973 |
| qld_leg_copyright | https://www.legislation.qld.gov.au/copyright | 200 | 19377 |
| nsw_bill_api | https://api.parliament.nsw.gov.au/api/bills?year=2026 | 404 | 0 |
| salt_app | https://salt.parliament.sa.gov.au | 200 | 24978 |
| sa_index | https://www.parliament.sa.gov.au/en/House-of-Assembly/Index-to-bills-and-motions | 200 | 46238 |
| frl_terms | https://www.legislation.gov.au/terms-of-use | 200 | 51290 |
| nsw_docs | https://parliament-api-docs.readthedocs.io/en/latest/api/ | 404 | 4436 |
| sa_listing | https://www.legislation.sa.gov.au/legislation/bills | 403 | 5723 |
| nsw_example | https://www.parliament.nsw.gov.au/parliamentary-business/bills/bill-details?billId=18524 | 200 | 124588 |
| nsw_js | https://www.parliament.nsw.gov.au/__data/assets/git_bridge/0010/190/main.js?h=198ae01 | 403 | 6160 |
| nsw_hansard_bills | https://api.parliament.nsw.gov.au/api/hansard/bills/2026 | 404 | 0 |

| Firecrawl scrape | Source URL | Source status | Credits used |
| --- | --- | --- | --- |
| fire_nsw | https://www.parliament.nsw.gov.au/parliamentary-business/bills | 200 | 1 |
| fire_qld | https://www.parliament.qld.gov.au/Work-of-the-Assembly/Bills-and-Legislation/Bills-before-the-House | 200 | 1 |
| fire_nsw_listing | https://www.parliament.nsw.gov.au/parliamentary-business/bills/current-session-bills | 200 | 1 |
| fire_sa_bills | https://www.legislation.sa.gov.au/bills | 404 | 1 |
| fire_sa_listing | https://www.legislation.sa.gov.au/legislation/bills | 200 | 1 |
| fire_nsw_example | https://www.parliament.nsw.gov.au/parliamentary-business/bills/bill-details?billId=18524 | 200 | 1 |
| fire_sa_current | https://www.legislation.sa.gov.au/legislation/bills/current | 200 | 1 |
| fire_sa_a | https://www.legislation.sa.gov.au/legislation/bills/current?collection=sagov~sp-legsa-search&meta_resourceClass=bill&meta_resourceVersionType=current%20session&meta_resourceTitleAZ=A | 200 | 1 |

| Scope action counter | Count |
| --- | --- |
| Direct HTTP probe requests | 142 |
| Firecrawl calls | 8 |
| Firecrawl credits reported | 8 |
| Allowed Firecrawl ceiling | Under 60; respected |
| Generation calls | 0 |
| Knowledge-box requests | 0 |
| Database write operations | 0 |
| Site code files changed | 0 |

### Bill availability sample identities

EM = actual document link on the inspected home; digest = positive result from BillId_Phrase lookup; Act = exact cached FRL r/s code match. The generic digest navigation link is deliberately ignored. All no-hit digest responses were checked for an explicit no-results page; failures are not counted as absence.

| Parliament | Bill code | Title | EM link | Digest hit | FRL Act |
| --- | --- | --- | --- | --- | --- |
| 39 | r1344 | Family Law Legislation Amendment (Superannuation) (Consequential Provisions) Bill 2001 | yes | yes | yes |
| 39 | r1397 | Health Legislation Amendment Bill (No. 3) 2001 | no link | no hit | no code match |
| 39 | r1322 | Space Activities Amendment (Bilateral Agreement) Bill 2001 | yes | yes | yes |
| 39 | s331 | Interactive Gambling Amendment Bill 2001 | yes | yes | yes |
| 39 | s314 | Public Interest Disclosure Bill 2001 [2002] | no link | no hit | no code match |
| 40 | r2094 | Vocational Education and Training Funding Amendment Bill 2004 | no link | yes | no code match |
| 40 | r2127 | Higher Education Legislation Amendment Bill (No. 3) 2004 | yes | no hit | no code match |
| 40 | r2045 | Tax Laws Amendment (Personal Income Tax Reduction) Bill 2004 | yes | yes | yes |
| 40 | r2057 | Same Sex Relationships (Ensuring Equality) Bill 2004 | no link | no hit | no code match |
| 40 | r2071 | Superannuation (Entitlements of Same Sex Couples) Bill 2004 | no link | no hit | no code match |
| 41 | r2748 | Australian Citizenship Amendment (Citizenship Testing) Bill 2007 | yes | yes | yes |
| 41 | r2809 | Workplace Relations Amendment (A Stronger Safety Net) Bill 2007 | yes | yes | yes |
| 41 | r2844 | Telecommunications Legislation Amendment (Protecting Services for Rural and Regional Australia into the Future) Bill 2007 | yes | yes | yes |
| 41 | s596 | Communications Legislation Amendment (Miscellaneous Measures) Bill 2007 | yes | yes | no code match |
| 41 | r2857 | National Greenhouse and Energy Reporting Bill 2007 | yes | yes | yes |
| 42 | r4413 | National Health and Hospitals Network Bill 2010 | yes | no hit | no code match |
| 42 | r4361 | Appropriation Bill (No. 1) 2010-2011 | yes | yes | yes |
| 42 | r4329 | Social Security and Indigenous Legislation Amendment (Budget and Other Measures) Bill 2010 | yes | yes | yes |
| 42 | r4364 | Migration Amendment (Visa Capping) Bill 2010 | yes | yes | no code match |
| 42 | r4366 | Autonomous Sanctions Bill 2010 | yes | no hit | no code match |
| 43 | r5108 | Grape and Wine Legislation Amendment (Australian Grape and Wine Authority) Bill 2013 | yes | yes | no code match |
| 43 | r5076 | Intellectual Property Laws Amendment Bill 2013 | yes | yes | no code match |
| 43 | r5105 | Superannuation (Excess Concessional Contributions Charge) Bill 2013 | yes | yes | yes |
| 43 | r5091 | Homelessness Bill 2013 | yes | yes | no code match |
| 43 | r5056 | Voice for Animals (Independent Office of Animal Welfare) Bill 2013 | yes | no hit | no code match |
| 44 | r5634 | Social Services Legislation Amendment (Enhanced Welfare Payment Integrity) Bill 2016 | yes | no hit | no code match |
| 44 | r5592 | Income Tax (Attribution Managed Investment Trusts—Offsets) Bill 2015 | yes | no hit | yes |
| 44 | r5629 | Primary Industries Levies and Charges Collection Amendment Bill 2016 | yes | yes | no code match |
| 44 | r5589 | Australian Crime Commission (National Policing Information Charges) Bill 2015 | yes | yes | yes |
| 44 | s1029 | Courts Administration Legislation Amendment Bill 2015 | yes | yes | yes |
| 45 | r6262 | Corporations (Fees) Amendment (Registries Modernisation) Bill 2019 | yes | no hit | no code match |
| 45 | s1189 | Social Security Amendment (A Fair Go for Age Pensioners) Bill 2019 | yes | no hit | no code match |
| 45 | r6315 | Social Services Legislation Amendment (Energy Assistance Payment) Bill 2019 | yes | no hit | yes |
| 45 | r6238 | Offshore Petroleum and Greenhouse Gas Storage (Regulatory Levies) Amendment (Regulations References) Bill 2018 | yes | no hit | no code match |
| 45 | r6218 | International Human Rights and Corruption (Magnitsky Sanctions) Bill 2018 | yes | no hit | no code match |
| 46 | r6815 | Migration Amendment (Protecting Migrant Workers) Bill 2021 | yes | yes | no code match |
| 46 | r6848 | Social Media (Protecting Australians from Censorship) Bill 2022 | yes | no hit | no code match |
| 46 | r6856 | Public Sector Superannuation Legislation Amendment Bill 2022 | yes | no hit | no code match |
| 46 | r6838 | Treasury Laws Amendment (Tax Concession for Australian Medical Innovations) Bill 2022 | yes | yes | no code match |
| 46 | r6803 | Financial Sector Reform (Hayne Royal Commission Response No. 3) Bill 2021 | yes | yes | no code match |
| 47 | r7310 | Social Security Legislation Amendment (Technical Changes) Bill 2025 | yes | no hit | yes |
| 47 | r7289 | Commonwealth Entities (Payment Surcharges) Tax (Imposition) Bill 2024 | yes | no hit | yes |
| 47 | r7262 | Food and Grocery (Mandatory) Code of Conduct Bill 2024 | yes | no hit | no code match |
| 47 | r7255 | Security of Critical Infrastructure and Other Legislation Amendment (Enhanced Response and Prevention) Bill 2024 | yes | yes | yes |
| 47 | r7280 | Electoral Legislation Amendment (Electoral Reform) Bill 2024 | yes | yes | yes |
| 48 | r7491 | Health Insurance Amendment (Incentive Payments and Other Measures) Bill 2026 | yes | yes | no code match |
| 48 | r7493 | Treasury Laws Amendment (Tax Reform No. 1) Bill 2026 | yes | yes | yes |
| 48 | r7484 | Appropriation Bill (No. 2) 2026-2027 | yes | no hit | yes |
| 48 | r7494 | Workplace Relations Legislation Amendment (Building Cooperative Workplaces No. 1) Bill 2026 | yes | yes | yes |
| 48 | r7488 | Human Rights Bill 2026 | yes | no hit | no code match |

### Verification and remaining unknowns

The document’s tables were generated from the captured read-only export and bounded probe responses. Reviewed sum checks, before/after sample outcomes, source links, cost arithmetic and git diff. No application tests are appropriate for a document-only scope. A database count is not a claim that the portal currently exposes every row.

Remaining measured-scope limits are explicit: full per-bill EM/digest availability census; exact missing-bill identities behind unresolved title groups; stage recovery for federal second-reading speeches; state registry API/party completeness; and independent holdout validation. These are named implementation deliverables, not hidden assumptions or zero-coverage claims.

Snapshot evidence SHA-256 (`db.json`, metadata/aggregate export): `d1820a4120e746c81bb522133883e5fe8059f0c9aece7b5fd833606b3a42c2b5`.
