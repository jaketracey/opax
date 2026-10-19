# Plain-language sweep: visitor-facing strings (web)

Branch `web/plain-language`, 19 Oct 2026. It was triggered by the electorate page line "Census indicators have not yet been imported for this electorate." Every visible line that described how OPAX builds its data, rather than the record itself, was removed or rewritten.

**Totals:** 220 lines of text changed, and 13 empty sections are now hidden, heading and all. After merging the 19 Oct batch, 15 more lines changed and 1 more section is hidden (audit report "Entities audited") (see the last section). Line numbers are as they stand on the branch.

**How each line was handled**
1. Empty sections are hidden completely, heading and all.
2. Where a section has to stay, it gets one short line about the subject, for example "No earlier service records for this electorate yet."
3. Methodology and source notes are kept with the same meaning, in simpler words. Examples: counts are a floor, older years are undercounted, a missing bill was not necessarily left unvoted.
4. Australian English and no em dashes. `aria-label` and status text match the visible copy.

**Hidden sections (13)**
- Electorate page: Census context, and Election timeline.
- Person page: "What they talk about", when there are no topic-labelled speeches.
- Topic page: "The arc of this debate", together with its jump link.
- Agency growth module: "Largest grants from …", when the agency has no awards.
- Crawl person page (Worker): Declared interests, and Bills sponsored.
- Crawl bill page (Worker): Plain-language summary, Other bills from this sponsor, and Other bills in this portfolio.
- Government advertising page, before any register is cleared: Totals by financial year, Totals by entity and year, and Reported campaigns with its empty table. The notice and the "not zero spending" note stay.

**Kept on purpose**
- "… could not be loaded. Try again" errors. They describe the visitor's request, and the loading-states sweep set them.
- Loading messages.
- Corpus version stamps in citations, export headers and the stats page. Searches are reproducible from them.
- CSV "Export" buttons and the "Exported <date>" lines inside downloaded files, because those are visitor features.
- Licence text quoted from a source.
- The Methods page's "Corpus construction" section.
- Model prompts, MCP tool descriptions, emails and social posts. None had visitor-facing pipeline lines.
- `donor-disclosure.js` "N more return references in the data export". It is compiled into the money map bundle; change it with a graph rebuild if wanted.
- The developer harness pages `datatable-workbench.html` and `st-test.html`, which visitors don't reach.

**Notes**
- `portal/public/corpus.json` source names and coverage are shown on /stats and in /llms.txt. The nightly manifest updater (`scripts/update_corpus_manifest.py`, `plain_coverage`) now writes them in plain wording itself. A merge that brings back the old wording is rewritten by the next nightly run, with no CACHE_EPOCH bump.
- The money map bundle (`public/money-map.js`, `public/chunks/`) was rebuilt with `npm run build:graph` so the evidence panel carries the new copy. The only differences are the evidence text and the chunk names. The shared chunk also changed one person-slug map's key order, from current inputs.
- The app (`mobile/`) is unchanged; suggestions are in `app-strings.md`.
- A guard test, `portal/test/plain-language.test.mjs`, fails if these words come back in page scripts, static pages or Worker-rendered pages.

## Electorates

### Electorates (directory and electorate pages)

| File:line | Old text | New text |
|---|---|---|
| portal/public/electorates.js:210 | Census context: "Census indicators have not yet been imported for this electorate." | section hidden (heading and all) when there is no census data |
| portal/public/electorates.js:203 | Election timeline: "Election results have not yet been imported for this electorate." | section hidden (heading and all) when there are no results |
| portal/public/electorates.js:209 | Historical service has not yet been imported. | No earlier service records for this electorate yet. (kept: the section holds the "On a date" form) |
| portal/public/electorates.js:204 | N indexed contests; gaps are missing coverage. | N contests recorded; any gaps are missing records. |
| portal/public/electorates.js:195 | Representation has not yet been verified for this date. | No confirmed representative for this date. |
| portal/public/electorates.js:195 | Conflicting service records require review. | The service records for this date conflict. |
| portal/public/electorates.js:201 | Representation is shown only as recorded in the dated release. | Representation is shown only as the dated records give it. |
| portal/public/electorates.js:160 | · Boundary version not yet indexed | · Boundary not recorded |
| portal/public/electorates.js:103 | N elections indexed | N elections recorded |
| portal/public/electorates.js:103 | Results not yet indexed | No election results yet |
| portal/public/electorates.js:105 | A missing representative or result means it has not been verified in this release. | A missing representative or result means the records do not confirm one yet. |
| portal/public/electorates.js:98 | Sort: Most elections indexed | Sort: Most elections |

## People and parties

### Person pages

| File:line | Old text | New text |
|---|---|---|
| portal/public/app.js:5662 | Latest exported bill votes (vote table caption) | Latest bill votes |
| portal/public/app.js:5688 | This list covers votes available in the published export. A bill missing here was not necessarily unvoted on. | This list covers the votes OPAX holds. A bill missing here was not necessarily unvoted on. |
| portal/public/app.js:5718 | What they talk about: "No topic-labelled speeches are held for this person yet. Their other records below remain available." | section hidden |
| portal/public/app.js:5749 | No topic-labelled speeches are held for this era yet. | No topic-labelled speeches in this period yet. |
| portal/public/app.js:6182 | Not in the record: no indexed speeches under this name | No speeches in the record under this name |
| portal/public/app.js:6190 | …so a person may be indexed under a fuller or shorter form of this name. | …so a person may appear under a fuller or shorter form of this name. |
| portal/public/app.js:6249 | Indexed speeches (fact label) | Speeches in the record |
| portal/public/app.js:6465 | Hearings indexed (witness fact label) | Hearings |
| portal/public/app.js:6505 | Latest indexed speeches / Indexed speeches (and "evidence") | Latest speeches / Speeches (and "Evidence") |
| portal/public/app.js:6520 | The most recent sitting week found in this person's indexed speeches, not necessarily the current calendar week. | The most recent sitting week in this person's speeches, not necessarily the current calendar week. |
| portal/public/app.js:6520 | Newest results within the indexed retrieval window; this week may contain further speeches. | The newest matches the search returns; this week may contain further speeches. |
| portal/public/app.js:6520 | Newest retrieval is unavailable; this is a sample of indexed matches. | The newest matches are unavailable; this is a sample of matching speeches. |
| portal/public/app.js:5231 | …the six lobbyist registers; name matching is exact after normalisation, so a company using several trading names may be under-counted. | …the six lobbyist registers; names must match exactly, so a company using several trading names may be under-counted. |

### Interests registers

| File:line | Old text | New text |
|---|---|---|
| portal/public/app.js:4090 | No dated alterations are available in the current export. | No dated alterations in the registers yet. |

### Declared interests

| File:line | Old text | New text |
|---|---|---|
| portal/public/index.html:967 | …the lobbyist registers and FITS use exact normalised names. | …the lobbyist registers and FITS match names exactly once case, punctuation and company suffixes such as Pty Ltd are set aside. |

### Crawl pages: person (seo-content.ts)

| File:line | Old text | New text |
|---|---|---|
| portal/src/seo-content.ts:187 | Parliamentarian data export (link label) | Parliamentarian data (JSON) |
| portal/src/seo-content.ts:195 | Latest exported bill votes (table caption) | Latest bill votes |
| portal/src/seo-content.ts:198 | This list covers votes available in the published export. Only formal divisions … | This list covers the votes in OPAX’s published data. Only formal divisions … |
| portal/src/seo-content.ts:199 | OPAX recorded-vote export / OPAX bill-vote export (link labels) | OPAX recorded-vote data / OPAX bill-vote data |
| portal/src/seo-content.ts:203 | Declared interests heading + "No register of interests in this export." | section hidden (heading only when a register exists) |
| portal/src/seo-content.ts:227 | Bills sponsored heading + "No sponsored bills recorded in this export." | section hidden when no sponsored bills |

## Bills and divisions

### Bills and divisions

| File:line | Old text | New text |
|---|---|---|
| portal/public/app.js:9013 | No Act matched to this bill yet. | No Act recorded for this bill yet. |
| portal/public/app.js:13096 | The member list could not load just now; the counts and the party split are from the published export. | The member list could not load just now; the counts and the party split are unaffected. |
| portal/public/app.js:13175 | The names are read from the division's own record in the OPAX index; the export lists only the counts. | The names come from the division's own record; the tally lists only the counts. |

### Bill pages: bill text

| File:line | Old text | New text |
|---|---|---|
| portal/public/bill-text.js:92 | This version is not yet available to read on Opax. | No readable text for this version yet. |
| portal/public/bill-text.js:189 | Full text has not been published on Opax for this bill. The original source may have the document. | No full text for this bill yet. The original source may have the document. |

### Crawl pages: bill and division (seo-content.ts)

| File:line | Old text | New text |
|---|---|---|
| portal/src/seo-content.ts:247 | Plain-language summary heading + "No machine-written summary in this export." | section hidden when no summary |
| portal/src/seo-content.ts:251 | Other bills from this sponsor / Other bills in this portfolio + "No other bills with this recorded field in the export." | section hidden when empty (each of the two) |
| portal/src/seo-content.ts:267 | Per-member votes and party tallies are not present in this export. Consult the original division record. | No per-member votes or party tallies here. See the original division record. |
| portal/src/seo-content.ts:271 | Party affiliation is not recorded for {n} members in this export. | Party affiliation is not recorded for {n} members. |

## Topics and Explore

### Topics

| File:line | Old text | New text |
|---|---|---|
| portal/public/app.js:6671 | How much of the indexed speech record carries a topic label (caption and aria-label) | How much of the speech record carries a topic label |
| portal/public/app.js:6679 | …(N of M indexed speeches) (title tooltip) | …(N of M speeches) |
| portal/public/app.js:6711 | Topic labels cover this share of each decade's indexed speeches: | Topic labels cover this share of each decade's speeches: |
| portal/public/app.js:6807 | N labelled speeches in the window | N labelled speeches in this view |
| portal/public/app.js:6828 | The arc of this debate: "No dated, labelled speeches are in the search window yet." | section hidden (its "Jump to the debate" link is removed too, app.js:7077) |
| portal/public/app.js:6897 | The window is the search index's newest labelled matches, not the whole debate. | This view shows the newest labelled matches, not the whole debate. |
| portal/public/app.js:6982 | …labelled to date. The labelling pass is still running. | …labelled to date. Not every speech has a topic label yet, so this count is a floor. |
| portal/public/app.js:7045 | The labelling pass has not reached this debate yet. Search the record for X instead. | No speeches carry this label yet. Search the record for X instead. |
| portal/public/app.js:7155 | (About these numbers) …The labelling pass is still running. | …Not every speech has a topic label yet. |

### Explore: words and dollars

| File:line | Old text | New text |
|---|---|---|
| portal/public/wordsdollars.js:336 | A machine pass is still labelling the corpus by subject, so speech counts are floors and shares will settle as it runs. | Not every speech carries a topic label yet, so speech counts are floors and shares may shift as more are labelled. |
| portal/public/wordsdollars.js:371 | The AEC export aggregates party recipients; money to independents is not separated here. | Donations here are grouped by party, so money to independents is not separated. |
| portal/public/wordsdollars.js:372 | Nothing disclosed to <party> from these donors in the export. | Nothing disclosed to <party> from these donors. |
| portal/public/wordsdollars.js:438 | ; the labelling pass has not reached the <topic> debate yet. | ; no <topic> speeches carry a topic label yet. |
| portal/public/wordsdollars.js:459 | …so shares are early and will move as the pass runs. | …so shares are early and may shift as more are labelled. |

### Explore: topic matrix and tide

| File:line | Old text | New text |
|---|---|---|
| portal/public/matrix.js:246 | A machine pass is still labelling the corpus by subject, so every number here is a floor and shares will settle as it runs. | Not every speech carries a topic label yet, so every number here is a floor and shares may shift as more are labelled. |
| portal/public/matrix.js:300 | The labelling pass has not reached this debate yet. | No labelled speeches on this debate yet. |
| portal/public/tide.js:30 | …with the labelled speech record held for that decade, never with the whole corpus. | …with that decade's labelled speeches, never with every speech. |
| portal/public/tide.js:105 | Labels are applied so far; the coverage rule shows how much of the indexed speech record has been reached. | Not every speech is labelled yet; the coverage rule shows how much of each decade's speech record carries a label. |

### Explore: then and now

| File:line | Old text | New text |
|---|---|---|
| portal/public/thenvsnow.js:489 | The corpus is still loading toward the present and a machine labelling pass is still running, so a quiet era can be a gap in what is loaded so far rather than silence. | Recent years are not fully covered yet and not every speech carries a topic label, so a quiet era can be a gap in the record rather than silence. |
| portal/public/thenvsnow.js:713 | The loaded record has little from <speaker> on <phrase> in these years. | The record has little from <speaker> on <phrase> in these years. |
| portal/public/thenvsnow.js:714 | The corpus is still loading toward the present, so a quiet era can be a loading gap, not silence. | Recent years are not fully covered yet, so a quiet era can be a gap in the record, not silence. |
| portal/public/thenvsnow.js:766 | “<name>” is not in the indexed speaker list; | “<name>” is not in the speaker list; |

### Explore: time machine

| File:line | Old text | New text |
|---|---|---|
| portal/public/timemachine.js:1513 | The archive is still being digitised, oldest first. | Recent years are not fully searchable yet. |
| portal/public/timemachine.js:1516 | All N records are in the index. The numbers panel uses the complete historical dataset; the live quotes, the year in brief and the voices are built year by year. | All N records are searchable. The numbers panel covers every year; the live quotes, the year in brief and the voices come from the searchable speeches. |
| portal/public/timemachine.js:1517 | About P% of N records are searchable so far, and more arrive every day. The numbers panel uses the complete historical dataset, so it works for every year; the live quotes, the year in brief and the voices catch up year by year. | About P% of N records are searchable so far. The numbers panel covers every year; the live quotes, the year in brief and the voices fill in as more years become searchable. |
| portal/public/timemachine.js:1657 | Written by a language model from the passages the knowledge box retrieved for <year>. | Written by a language model from the passages found for <year>. |
| portal/public/timemachine.js:1695 | From the N passages the knowledge box retrieved for <year> so far, C of them cited. | Written from N passages found for <year>; C of them are cited. |
| portal/public/timemachine.js:1696 | From what the knowledge box had retrieved for <year> so far. | Written from the passages found for <year>. |
| portal/public/timemachine.js:1782 | …debates, so far. … Who dominates those debates in the index, not who spoke most in parliament. | …debates. … Who dominates the matching speeches, not who spoke most in parliament. |
| portal/public/timemachine.js:1826 | The topic lens only sees speeches a still-running machine labelling pass has reached, on top of an archive that is itself still loading. A quiet result here means the machines have not caught up with this year… | The topic lens only sees speeches that carry a topic label, and not every speech has one yet. A quiet result here means the labels have not caught up with this year… |
| portal/public/timemachine.js:1849 | The time machine hasn’t reached <year> yet. | <year> is not searchable yet. |
| portal/public/timemachine.js:1854 | It’s about P% of the way through. | About P% of the archive is searchable so far. |
| portal/public/timemachine.js:1856 | …(see the numbers). The record is being shelved oldest-first, and the live quotes for this year are still on the trolley. | …(see the numbers). The live quotes for this year are not searchable yet. |
| portal/public/timemachine.js:1857 | The record is being shelved oldest-first, and the live quotes for this year are still on the trolley. … Parliament wasn’t silent. We just haven’t caught up. | The live quotes for this year are not searchable yet. … Parliament wasn’t silent. |
| portal/public/timemachine.js:1960 | That’s every <topic>-labelled speech the machine has shelved for <year> so far. The archive and the topic labeller are both still running, so more may arrive. | That’s every <topic>-labelled speech for <year> so far. Not every speech carries a topic label yet, so more may appear. |
| portal/public/timemachine.js:1961 | That’s everything the machine has shelved for <year> so far. The archive loads oldest-first, and more of <year> arrives every day. | That’s every speech found for <year> so far. More of <year> may appear as the record fills in. |

### Explore: quiz

| File:line | Old text | New text |
|---|---|---|
| portal/public/quiz.js:651 | Several state parliaments appear alongside federal chambers in the corpus manifest. | Several state parliaments appear alongside the federal chambers in OPAX's source list. |
| portal/public/quiz.js:658 | False — N are collected | False: N are collected |
| portal/public/quiz.js:659 | The corpus manifest puts the collection comfortably above that mark. | OPAX's source counts put the collection comfortably above that mark. |
| portal/public/quiz.js:671 | Source: OPAX corpus manifest | Source: OPAX source counts |
| portal/public/quiz.js:698 | Source: OPAX corpus | Source: OPAX source counts |
| portal/public/quiz.js:146 | Disclosure data export (proof link label) | Disclosure data download |

## Directories

### Directories

| File:line | Old text | New text |
|---|---|---|
| portal/public/app.js:7639 | From the member roster / Speech total not yet indexed | From the member roster / No speech total yet |
| portal/public/app.js:7639 | Count pending exact export / Own-house, in-service speeches | No exact count yet / Own-house, in-service speeches |
| portal/public/app.js:7670-7674 | Speech counts follow the site's corpus rule (…) and are counted from the corpus itself, so they can run ahead of what the index has loaded so far. Split records show a pending count until an exact export counts only the MP's own-house, in-service speeches. Speakers with fewer than N indexed speeches […] are not listed from the speech export. Verified representatives are included independently of that threshold; their missing speech totals are labelled explicitly. | Speech counts follow the site's speech rule (…) and count the whole record, so they can be higher than what search returns for now. Where a member's speeches are shared with others, the row has no exact count until only the MP's own-house, in-service speeches are counted. Speakers with fewer than N speeches […] are not listed. Verified representatives are listed whatever their speech count; where their speech total is missing, the row says so. |
| portal/public/app.js:7765 | Speech counts are the index's live party labels; a speech with no party label… | Speech counts use each speech's party label; a speech with no party label… |
| portal/public/app.js:7899 | Donors directory: …name matching is exact after normalisation, so a company… | …names must match exactly, so a company… |

### Crawl pages: directories, contracts, money (seo-content.ts, seo-schema.ts)

| File:line | Old text | New text |
|---|---|---|
| portal/src/seo-content.ts:289 | Parliamentarians in the exported parliamentary record, with speeches, votes and declared interests. | Parliamentarians in the parliamentary record, with speeches, votes and declared interests. |
| portal/src/seo-content.ts:321 | Entries from the published data exports, with original sources on each profile. | Entries from published records, with original sources on each profile. |
| portal/src/seo-content.ts:339 | Exported {date}. Source: … | Updated {date}. Source: … |
| portal/src/seo-content.ts:367 | … donor-to-party aggregates in this map export. {n} parties. Export date: {date}. Coverage: … (fallback "See the source export") | … donor-to-party totals on this map. {n} parties. Updated {date}. Coverage: … (fallback "See the source") |
| portal/src/seo-schema.ts:158 | Australian parliamentary records and public disclosure data exported by OPAX. (Dataset JSON-LD) | Australian parliamentary records and public disclosure data published by OPAX. |

## Search results

### Search results: person speech counts (scripts/build_search_catalog.mjs)

| File:line | Old text | New text |
|---|---|---|
| scripts/build_search_catalog.mjs:77 | Count pending exact export; own-house, in-service speeches. | No exact speech count yet; own-house, in-service speeches only. |
| scripts/build_search_catalog.mjs:77 | N indexed speeches. | N speeches in the record. |

## Search, documents and Ask

### Search

| File:line | Old text | New text |
|---|---|---|
| portal/public/app.js:12110 | Record type (active filter chip) | Type |
| portal/public/app.js:12612 | No indexed speech uses that phrase. Hansard is literal… | No speech in the record uses that phrase. Hansard is literal… |
| portal/public/app.js:12986 | # filters: … · record type: … (CSV export header) | # filters: … · type: … |

### Documents

| File:line | Old text | New text |
|---|---|---|
| portal/public/app.js:13352 | No document with this identifier. It may not be indexed yet. | No document with this identifier. The link may be old, or the record may not be published yet. |

### Ask

| File:line | Old text | New text |
|---|---|---|
| portal/public/app.js:10089 | · Records indexed under X (answer stamp) | · Records filed under X |
| portal/public/app.js:11833 | N of M collected documents indexed, with more added daily. Answers may be incomplete while indexing runs. | N of M documents searchable so far, with more added daily. Answers may be incomplete until the rest are in. |

### Ask and search

| File:line | Old text | New text |
|---|---|---|
| portal/public/index.html:297 | and currently draw on the speech corpus. | and currently draw on parliamentary speeches. |
| portal/public/index.html:417 | Record type (search filter label) | Type |
| portal/public/index.html:497 | Record type: Group the different datasets (sort option) | Type: Group by kind of record |
| portal/public/ui-workbench.html:100 | Remove the record type filter, Speeches / Record type (example chip) | Remove the type filter, Speeches / Type |

### Ask count answers

| File:line | Old text | New text |
|---|---|---|
| portal/src/agentic-ask.ts:197 | … chamber speeches labelled {topic} indexed under {party} … (count answer lead line) | … recorded under {party} … |
| portal/src/agentic-tools.ts:126 | … indexed under {party} … (count result scope line) | … recorded under {party} … |

## Money, grants and connections

### Money: suppliers, agencies, grants

| File:line | Old text | New text |
|---|---|---|
| portal/public/growth-modules.js:138 | Exact normalised name, and matching ABN where both registers carry one. Organisation records only. | Exact name match, ignoring case, spacing and punctuation, plus a matching ABN where both registers carry one. Organisation records only. |
| portal/public/suppliers.js:236 | No agency breakdown is available in this export. | No agency breakdown for this supplier. |
| portal/public/suppliers.js:305 | This supplier is not in the current export. | No supplier has this address. |
| portal/public/suppliers.js:313 | This supplier profile is not available in the current export. | No contract records for this supplier. |
| portal/public/suppliers.js:346 | The party breakdown is not available in this map export. | No party breakdown for these receipts. |
| portal/public/suppliers.js:346 | This recorded identity is not present in the current map export. | This identity is not on the money map. |
| portal/public/supplier-growth.js:38 | Largest other suppliers in this agency export, by recorded award value. | Largest other suppliers to this agency, by recorded award value. |
| portal/public/supplier-growth.js:40 | Largest grants from <agency> + No awards from this agency in the published sample. | section hidden (agencyGrantsHTML returns nothing when no awards) |
| portal/public/supplier-growth.js:43 | Each listed recipient’s largest exported awards only; | Each listed recipient’s largest awards in the sample only; |
| portal/public/grant-recipient.js:133 | The N largest of M <records> are published in this recipient file. K further rows are included in the total but are not available individually here. | The N largest of M <records> are listed here. K more are included in the total but are not listed individually. |
| portal/public/grant-recipient.js:134 | All N <records> in this recipient file, largest value first. | All N <records> for this recipient, largest value first. |
| portal/public/grant-recipient.js:166 | Agency, program and electorate lists are the largest entries published in this file. | Agency, program and electorate lists show the largest entries only. |
| portal/public/grant-recipient.js:242 | This recipient is not listed in the published file for this jurisdiction. | No grant records for this recipient in this jurisdiction. |

### Money: map, ledger, explain

| File:line | Old text | New text |
|---|---|---|
| portal/public/map-research.js:9 | Record type / All record types (filter) | Type / All types |
| portal/public/map-research.js:17 | Values remain separate by record type; | Values stay separate for each kind of record; |
| portal/public/money-records.js:2 | Record type (CSV/table column) | Type |
| portal/public/register-tables.js:10 | Record type (column and facet label) | Type |
| portal/public/ledger.js:221 | This link requests an unsupported record type. | This link asks for an unsupported kind of record. |
| portal/public/money-explain.js:540 | OPAX’s federal export keeps the amount and the year but not that label | OPAX’s federal data keeps the amount and the year but not that label |
| portal/public/money-explain.js:648 | OPAX holds these <receipts> by year in its export; | OPAX holds these <receipts> by year; |
| portal/public/money-explain.js:385 | The other parties in this file, largest first | The other parties in these records, largest first |
| portal/public/money-explain.js:506 | No disclosed money matches this flow in the file. | No disclosed money matches this flow. |
| portal/public/money-explain.js:538 | Every line in this file is a <noun> … ; the file holds no other kinds of receipt. | Every line here is a <noun> … ; no other kinds of receipt are included. |
| portal/public/money-explain.js:606 | …of all money disclosed to <party> in this file for <years> | …of all money disclosed to <party> in these records for <years> |
| portal/public/money-explain.js:610 | …disclosed money to parties in this file | …disclosed money to parties in these records |
| portal/public/money-explain.js:686 | The years this file covers / The <register> file covers <coverage>. | The years covered / The <register> records cover <coverage>. |
| portal/public/money-explain.js:785 | Every figure on this page is summed from the year cells of this file… | Every figure on this page is summed from the yearly totals in these records… |
| portal/public/money-explain.js:855 | Or start with one of the largest named flows in this file. | Or start with one of the largest named flows. |

### Connections and evidence

| File:line | Old text | New text |
|---|---|---|
| portal/public/evidence.js:35 | Search the indexed speeches | Search the speeches |
| portal/public/evidence.js:36 | Postcode overlap; the precise address has not been located. | Postcode overlap; the exact address is not known. |
| portal/public/evidence.js:40 | Coverage includes some records not yet in search. | Some of these records are not searchable yet. |
| portal/public/evidence.js:75 | This dataset includes collected material that is not yet searchable in the live index. | Some of these records are not searchable yet. |
| portal/public/evidence.js:75 | Unresolved identities are held for review. | Unconfirmed matches are left out until reviewed. |

## Registers and hubs

### Registers: government advertising (gov-advertising.ts)

| File:line | Old text | New text |
|---|---|---|
| portal/src/gov-advertising.ts:200 | Source verification pending (heading) + "{robots timeout reason} No campaign rows have been published." | No federal advertising figures yet + "The Department of Finance reports and their reuse terms have not been checked, so no campaign figures are shown. This does not mean expenditure was zero." (the reason moved inside the Access receipt fold) |
| portal/src/gov-advertising.ts:203 | Totals by financial year, Totals by entity and year, Reported campaigns (empty table) on the held page | section hidden (all three, when no register is cleared) |
| portal/src/gov-advertising.ts:198 | Not available — no campaign report is cleared in this snapshot. This does not mean expenditure was zero. | No campaign figures yet. This does not mean expenditure was zero. |
| portal/src/gov-advertising.ts:181 | The reviewed register is temporarily unavailable. | The advertising register is temporarily unavailable. |
| portal/src/gov-advertising.ts:183 | No cleared and reconciled campaign snapshot is available. | No campaign advertising figures yet. |

### Registers: other (instruments, state bills, Vic gifts, budget, finance, tax)

| File:line | Old text | New text |
|---|---|---|
| portal/src/instruments.ts:55 | Instrument catalogue not yet available (title and heading) / Instrument metadata is not yet available. | Legislative instruments / No legislative instruments here yet. |
| portal/src/instruments.ts:77 | The Register listed {n} titles; {k} could not be retrieved from its API. (method note, kept) | The Register listed {n} titles; {k} could not be read from the Register. |
| portal/src/state-bills.ts:83 | One jurisdiction is unavailable in this snapshot. | Bills from one jurisdiction are not shown yet. |
| portal/src/state-bills.ts:83 | Bill text, explanatory material and source summaries are held pending applicable document rights. (licence note, kept) | Bill text, explanatory material and source summaries are not shown until their reuse rights are confirmed. |
| portal/src/vic-gifts.ts:75 | This register is awaiting a reviewed data load. / The register is awaiting a reviewed data load. | No Victorian gifts and hospitality entries here yet. |
| portal/src/vic-gifts.ts:82 | This period is not in the reviewed snapshot. | This period is not in the register. |
| portal/src/budget.ts:63 | No cleared figure available | No figure for this year yet. |
| portal/src/government-finance.ts:59, 61 | The reviewed government finance snapshot is unavailable. | Government finance figures are temporarily unavailable. |
| portal/src/tax-expenditures.ts:71, 73 | The reviewed tax expenditure snapshot is unavailable. | Tax expenditure figures are temporarily unavailable. |

### Sitting-week and estimates hubs (hubs.ts)

| File:line | Old text | New text |
|---|---|---|
| portal/src/hubs.ts:118 | Exported division records (source line) | Division records |
| portal/src/hubs.ts:121 | Federal divisions in OPAX's published record currently run to {date}; divisions held after that date will appear here once the record is updated. | Federal divisions on record run to {date}; later divisions will appear here. |
| portal/src/hubs.ts:121 | Federal divisions are not available in this OPAX export; they will appear here once the record is updated. | No federal divisions on record yet. |
| portal/src/hubs.ts:122 | Absence from this export does not establish that no divisions were held. (method note, kept) | A division missing here does not mean none was held. |
| portal/src/hubs.ts:140 | Counts cover the available exports; gaps in those exports remain. (method note, kept) | Counts cover the published records; gaps in them remain. |
| portal/src/hubs.ts:142 | Future agreements beyond the export date are excluded. (method note, kept) | Agreements dated after that update are excluded. |

### Victorian election hub data (scripts/build_vic_election.mjs → public/hubs/vic-election-2026.json `speech_gap`)

The hub page does not render `speech_gap`. It is a value in a public JSON file.

| File:line | Old text | New text |
|---|---|---|
| scripts/build_vic_election.mjs:76 | No speech count is available for this member in the export. | No speech count for this member. |
| scripts/build_vic_election.mjs:76 | The exported speech aggregate cannot isolate Victorian speeches from other parliamentary records. | This speech count cannot be split from speeches in other parliaments. |

## Reports

### Reports

| File:line | Old text | New text |
|---|---|---|
| portal/public/app.js:13596 | No reports published yet. They are generated from the corpus and will appear here. | No reports published yet. |
| portal/public/app.js:14490 | Labelled so far, not the whole record: the labeller is still working through the corpus, so a bar is a floor. | Labelled so far, not the whole record: not every speech has a topic label yet, so a bar is a floor. |
| portal/public/app.js:14988 | The cited analysis for this investigation is generated from the full speech corpus, which is currently indexing. It will appear here automatically. | No cited analysis for this report yet. |

## Stats, About, Methods and Privacy

### Stats and meta descriptions

| File:line | Old text | New text |
|---|---|---|
| portal/public/app.js:15126 | speeches indexed (stat tile) | speeches in the record |
| portal/public/app.js:15127 | documents in the index | documents in the record |
| portal/public/app.js:15128 | passages indexed | searchable passages |
| portal/public/app.js:15151 | Read from the live index, refreshed every five minutes (Live badge tooltip) | Counted live, refreshed every five minutes |
| portal/public/app.js:15221 | N documents · M passages indexed · growing daily | N documents · M searchable passages · growing daily |
| portal/public/app.js:15224 | Figures marked live are read from the index itself and refresh every five minutes; the rest are from the corpus manifest. | Figures marked live are counted from the record and refresh every five minutes; the rest are updated less often. |
| portal/public/app.js:15296 | (meta description, methods) How the OPAX corpus is built, its known limits, and how to cite an answer or a speech. | How OPAX collects the record, its known limits, and how to cite an answer or a speech. |
| portal/public/app.js:15297 | (meta description, stats) Live counts for every collection in the OPAX index. | Live counts for every collection in OPAX. |

### Stats page

| File:line | Old text | New text |
|---|---|---|
| portal/public/index.html:974 | The corpus in numbers | The record in numbers |
| portal/public/index.html:981 | aria-label: Share of collected speeches indexed | aria-label: Share of collected documents searchable so far |
| portal/public/index.html:991 | In the live index | Searchable now |
| portal/public/index.html:287 | Sources loaded | Sources |
| portal/public/index.html:1010 | …is separate from corpus document totals. | …is separate from the document totals above. |
| portal/public/index.html:1011 | How the corpus is collected and what is known to be missing: | How the record is collected and what is known to be missing: |

### About page

| File:line | Old text | New text |
|---|---|---|
| portal/public/index.html:1057 | put a question to the speech corpus | put a question to the speech record |
| portal/public/index.html:1088 | share the corpus's citation and search plumbing, so they are counted here | are searched and cited the same way as speeches, so they are counted here |
| portal/public/index.html:1097 | machine-readable manifest: corpus.json | machine-readable source counts: corpus.json |
| portal/public/index.html:1101 | Every federal donation disclosed to the AEC since 1998 is loaded — 199,233 rows — and the | OPAX holds every federal donation disclosed to the AEC since 1998, 199,233 rows, and the |
| portal/public/index.html:1126 | …Western Australia) are loaded in full | …Western Australia) are held in full |
| portal/public/index.html:1147 | state divisions parsed from New South Wales, Victorian and Queensland Hansard, 1998 to today — is a citable document in the search index in its own right | state divisions read from New South Wales, Victorian and Queensland Hansard, 1998 to today, is a citable, searchable document in its own right |
| portal/public/index.html:1162 | Two gaps in the underlying speech corpus shape… | Two gaps in the speech record shape… |
| portal/public/index.html:1163 | There is no Senate Hansard in the corpus at all for 2014 to 2022 | There is no Senate Hansard on OPAX at all for 2014 to 2022 |
| portal/public/index.html:1168 | both close only as more Hansard is loaded. | both close only as more Hansard is added. |
| portal/public/index.html:1199 | 1,557 names appear as speakers in the corpus since 1993 | 1,557 names appear as speakers in the record since 1993 |
| portal/public/index.html:1201 | 551 official portraits from Parliament House, fetched through OpenAustralia | 551 official portraits from Parliament House, obtained through OpenAustralia |
| portal/public/index.html:1209 | They are not in OPAX's ask-and-search index: | They are not searchable through Ask or Search: |
| portal/public/index.html:1225 | the hosting platform's own labeller … The pass is still running: a speech with no topic chip yet has simply not been reached, not been checked and found to have none. | the hosting platform's own labelling … Labelling is not finished: a speech with no topic chip may simply not be labelled yet, rather than checked and found to have none. |
| portal/public/index.html:1229 | the six standing reports retrieve live from the corpus for every section | the six standing reports draw live on the record for every section |
| portal/public/index.html:1263 | The corpus's own technical limits — what Hansard is and is not, where coverage is thin, which members' records are unreliable — are on the methods page | The record's own technical limits, such as what Hansard is and is not, where coverage is thin and which members' records are unreliable, are on the methods page |
| portal/public/index.html:1282 | Progress Agentic RAG … holds the corpus. Every speech, bill, division and statement is indexed in a knowledge box | … holds the record. Every speech, bill, division and statement is held in a knowledge box |

### Methods page (generated section, see note)

| File:line | Old text | New text |
|---|---|---|
| portal/public/index.html:1415 | Not held. There is no Victorian register… | Not covered. There is no Victorian register… |
| portal/public/index.html:1484 | …reason and notes. In this release, Victorian state seats have no published Census profiles, so their ranking is unavailable. | …reason and notes. Victorian state seats have no published Census profiles yet, so their ranking is unavailable. |

### Privacy and support

| File:line | Old text | New text |
|---|---|---|
| portal/public/index.html:1684 | PostHog's ingestion service in the United States | PostHog's servers in the United States |
| portal/public/index.html:1332 | where the code, the ingestion scripts and the issue tracker all live | where the code, the collection scripts and the issue tracker all live |

### Stats page and llms.txt: source coverage (record summary file)

These values are read from `portal/public/corpus.json` and shown in the stats page source table and in `/llms.txt`.

| File:line | Old text | New text |
|---|---|---|
| portal/public/corpus.json:108 | Queensland Government ministerial statements: 7–21 Sep 2026 refresh | 7–21 Sep 2026 |
| portal/public/corpus.json:113 | Victorian Premier releases: 7–21 Sep 2026 refresh | 7–21 Sep 2026 |
| portal/public/corpus.json:118 | Australian Treasury ministerial releases: 7–21 Sep 2026 refresh | 7–21 Sep 2026 |
| portal/public/corpus.json:133 | Original federal bill text versions: Complete source versions; historical import verified | Complete source versions, checked against the originals |
| portal/public/corpus.json:136 (public file only, not rendered on a page) | News articles are excluded from ingestion and retrieval; headline links are external only. | News articles are not included; headline links go to the original outlet. |

## Meta descriptions, share cards and Worker errors

### Worker meta and share cards (index.ts)

| File:line | Old text | New text |
|---|---|---|
| portal/src/index.ts:3727 | How the OPAX corpus is built from Hansard and electoral disclosures, its known limits, and how to cite an answer or a speech. (Methods meta description) | The sources behind the OPAX record, from Hansard to electoral disclosures, with its known limits and how to cite an answer or a speech. |
| portal/src/index.ts:3731 | Live counts for every collection in the OPAX index: speeches, divisions, bills and official statements, by parliament and year. (Sources and coverage meta) | Live counts for every collection in the OPAX record: speeches, divisions, bills and official statements, by parliament and year. |
| portal/src/index.ts:4746 | Representation is not yet verified in this release. (electorate meta, prerender and share card) | No verified representative for this electorate yet. |
| portal/src/index.ts:4752 | {n} indexed election contests. (electorate meta and JSON-LD) | {n} election contest(s) on record. |
| portal/src/index.ts:4758 | {n} indexed election contests · {STATE} (electorate share card) | {n} election contest(s) · {STATE} |
| portal/src/index.ts:4929 | Speech totals are not yet in the directory. (roster-only person meta and card) | No speech count for them yet. |
| portal/src/index.ts:4941 | Count pending exact export; only own-house, in-service speeches in the {chamber}. (person meta) | No exact speech count yet; it will count only speeches they gave in the {chamber} while in office. |
| portal/src/index.ts:4470 | The agency index is temporarily unavailable. Please try again. | The agency list is temporarily unavailable. Please try again. |
| portal/src/index.ts:4474 | The supplier index is temporarily unavailable. Please try again. | The supplier list is temporarily unavailable. Please try again. |
| portal/src/index.ts:5122 | This supplier is not in the current OPAX contract index. Browse the government supplier directory. | This supplier is not in the OPAX contract records. Browse the government supplier directory. |
| portal/src/index.ts:5122 | The supplier index could not be loaded. Please try again. | Supplier records could not be loaded. Please try again. |
| portal/src/index.ts:5430 | {headline}, issued by {speaker} on {date}. Official source text indexed by OPAX. (release meta fallback) | {headline}, issued by {speaker} on {date}. Official source text. |

### Error text the web shows from the Worker (index.ts)

| File:line | Old text | New text |
|---|---|---|
| portal/src/index.ts:604 | Use up to 16 search words, or narrow the record type to documents. (shown in the search status line) | Use up to 16 search words, or limit the search to documents. |
| portal/src/index.ts:1471 | The parliamentarian index is temporarily unavailable. Please try again. (Ask error) | The parliamentarian list is temporarily unavailable. Please try again. |
| portal/src/index.ts:2749 | News articles are no longer part of the corpus (document page, old news links) | News articles are no longer part of the record |
| portal/src/index.ts:5918 | Corpus guide unavailable (llms.txt 503 body) | Site guide unavailable |

## llms.txt

### llms.txt (scripts/build_crawl_catalog.mjs, served at /llms.txt)

| File:line | Old text | New text |
|---|---|---|
| scripts/build_crawl_catalog.mjs:62 | Corpus snapshot: {version}. Export dates describe snapshots, not live coverage. | Record snapshot: {version}. Dates on data files mark a snapshot, not live coverage. |
| scripts/build_crawl_catalog.mjs:68 | ## Corpus and coverage | ## Record and coverage |
| scripts/build_crawl_catalog.mjs:70 | [Corpus manifest](/corpus.json): Snapshot {version}; {n} indexed resources. | [Record summary](/corpus.json): Snapshot {version}; {n} documents. |
| scripts/build_crawl_catalog.mjs:71 | [Corpus statistics](/stats) | [Record statistics](/stats) |
| scripts/build_crawl_catalog.mjs:72 | [Federal grants export](/graph/grants.federal.json): Export {date}; | [Federal grants data](/graph/grants.federal.json): Snapshot {date}; |
| scripts/build_crawl_catalog.mjs:73 | [Queensland grants export](/graph/grants.qld.json): Export {date}; | [Queensland grants data](/graph/grants.qld.json): Snapshot {date}; |
| scripts/build_crawl_catalog.mjs:87 | … State of Queensland attribution. The app reader remains planned. | … State of Queensland attribution. (planned-feature sentence removed) |
| scripts/build_crawl_catalog.mjs:95 | Canonical discovery URLs, grouped by type with record dates and counted export-date fallbacks. | Canonical discovery URLs, grouped by type with record dates, or the snapshot date where a record has none. |

### llms.txt (Victorian election entry)

| File:line | Old text | New text |
|---|---|---|
| portal/public/vic-election.js:32 | …sitting members and exported parliamentary records. | …sitting members and parliamentary records. |

## Added after merging 19 Oct batch

The batch's new copy (the GO7867 invited projects and CPI note, the grants-allocation takedown, the authorisation restyle, the CPI mobile layout) was swept with the same rules. Nearly all of it was already plain: loading text, errors, licence and source notes were left as they are. The audit report lines came from the control hub. The manifest wording is the generator fix for the hand edits above.

No `ballot.js` strings were changed on this branch, so there are no "(tool being removed)" rows.

### Search results: GO7867 program summary (scripts/build_search_catalog.mjs)

| File:line | Old text | New text |
|---|---|---|
| scripts/build_search_catalog.mjs:173 | … N published awards total $X in Opax at <date>. | … N published awards total $X on record at <date>. |

### Audit reports (portal/src/audit.ts, /audit and /audit/<id>)

The template serves only QAO today. The publisher's short name and website now come from one constant (`PUBLISHER`), so another collection can reuse the lines.

| File:line | Old text | New text |
|---|---|---|
| portal/src/audit.ts:120 | PDF body held: QAO's terms for this PDF (CC BY-NC-ND 4.0) don't allow us to reproduce it here. (separate line under "Full report (PDF): CC BY-NC-ND 4.0") | Full report (PDF) on qao.qld.gov.au (CC BY-NC-ND 4.0, so we link to it rather than reproduce it). (one line, with the link) |
| portal/src/audit.ts:57 | PDF body held: QAO's terms for this PDF require QAO's written permission. | Full report (PDF) on qao.qld.gov.au (reuse needs QAO's written permission, so we link to it rather than reproduce it). |
| portal/src/audit.ts:58 | PDF body held: we couldn't confirm QAO's terms for this PDF. | Full report (PDF) on qao.qld.gov.au (QAO's reuse terms for it aren't confirmed, so we link to it rather than reproduce it). |
| portal/src/audit.ts:50 | Full report (PDF): reuse grant unverified (source sheet) | Full report (PDF): reuse terms not confirmed |
| portal/src/audit.ts:65 | Entities audited + "Not named on the report's web page." | section hidden (shown when the report page names entities) |
| portal/src/audit.ts:71 | Source: html (under every recommendation) | Source: the report's web page |
| portal/src/audit.ts:105 | … PDF body held. (report meta description) | … Full report on qao.qld.gov.au. |
| portal/src/audit.ts:105 | Report page text held after its source review. (meta description) | Recommendations on qao.qld.gov.au. |
| portal/src/audit.ts:108 | This report page has an uncleared copyright exception, so its recommendations are not reproduced here. Read QAO's report for the original text. | The recommendations are on qao.qld.gov.au. QAO's copyright terms for this report page don't allow us to reproduce them. |
| portal/src/audit.ts:42 | This report page has an uncleared copyright exception. (source sheet note) | QAO's copyright terms for this report page don't allow us to reproduce it. |
| portal/src/audit.ts:117 | Responses are held with the PDF body. | Any entity responses are in the full report on qao.qld.gov.au. |
| portal/src/audit.ts:117 | No separately attributed responses are available. | No entity responses are listed separately in this report. |
| portal/src/audit.ts:95 | N cleared PDF bodies, M held PDF bodies and K entity responses. (/audit meta description) | Full text of N reports here and M on qao.qld.gov.au, with K entity responses. |

### Government advertising (portal/src/gov-advertising.ts)

Found when the guard test was extended to the register pages.

| File:line | Old text | New text |
|---|---|---|
| portal/src/gov-advertising.ts:172 | Filter by record type before interpreting results | Filter by type before reading the results |

### Stats page and llms.txt: source names (record summary file)

| File:line | Old text | New text |
|---|---|---|
| portal/public/corpus.json:121 | GrantConnect award notices (recent refresh) | GrantConnect award notices (recent window) |
