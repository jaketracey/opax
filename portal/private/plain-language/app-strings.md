# App strings that describe our pipeline (read-only inventory)

Source: `origin/ios/app` at `62d6bf44f`, `mobile/`. This is read-only. iOS 1.0 is in App Review, so nothing in `mobile/` has been changed. These are suggestions for a later build, using the same rule as the web sweep:

- hide an empty section where possible;
- otherwise use one short plain line about the subject, not about OPAX's process;
- keep methodology notes, but simplify the wording.

Out of scope: tests, fixtures, e2e and the dev-only Workbench screen (`mobile/src/workbench/`, which isn't in the release bundle per `metro.config.js`). No user-facing Kotlin or Swift strings in `mobile/modules/opax-voice` matched.

Left alone on purpose:
- fetch-failure errors ("… could not be loaded. Try again.") and loading labels;
- "Account sync" / "Sync conversations" (a user feature, not the data pipeline);
- "Export practice plan" (a user action);
- "Government exposure draft, not yet introduced" (describes the bill);
- BibTeX/RIS citation lines "via OPAX corpus v…" (a version stamp for reproducibility).

## Shared notices (used on many screens)

| mobile/FILE:LINE | old text | suggested text |
| --- | --- | --- |
| mobile/src/features/CatalogNotice.tsx:7 | Some rows in this export could not be read. | Some records could not be read. |
| mobile/src/features/CatalogState.tsx:74 | Some rows in this export could not be read. | Some records could not be read. |
| mobile/src/features/Search.tsx:360 | Some rows in this export could not be read. | Some records could not be read. |
| mobile/src/features/Search.tsx:916 | Some rows in this export could not be read. | Some records could not be read. |
| mobile/src/features/bills/BillsList.tsx:313 | Some rows in this export could not be read. | Some records could not be read. |
| mobile/src/features/directories/DirectoryScreen.tsx:434 | Some rows in this export could not be read. | Some records could not be read. |
| mobile/src/features/directories/DivisionHistory.tsx:197 | Some rows in this export could not be read. | Some records could not be read. |
| mobile/src/features/your-mp/Evidence.tsx:63 | Some rows in this export could not be read. | Some records could not be read. |
| mobile/src/api/catalogs.ts:751 | Some rows in this export could not be read. | Some records could not be read. |
| mobile/src/features/CatalogNotice.tsx:22 | The latest public export could not be read. Showing the saved copy. | The latest records could not be read. Showing the saved copy. |
| mobile/src/features/CatalogNotice.tsx:23 | The latest public export could not be loaded. Showing the saved copy. | The latest records could not be loaded. Showing the saved copy. |
| mobile/src/features/RecordStatus.tsx:27 | The latest public export could not be read. Showing the saved copy. | The latest records could not be read. Showing the saved copy. |
| mobile/src/features/RecordStatus.tsx:29 | The latest public export could not be loaded. Showing the saved copy. | The latest records could not be loaded. Showing the saved copy. |
| mobile/src/features/search/present.ts:98 | The latest public export could not be read. Showing the saved copy. | The latest records could not be read. Showing the saved copy. |
| mobile/src/features/search/present.ts:99 | The latest public export could not be loaded. Showing the saved copy. | The latest records could not be loaded. Showing the saved copy. |
| mobile/src/features/your-mp/Evidence.tsx:66 | The latest public export could not be read. Showing the saved copy. | The latest records could not be read. Showing the saved copy. |
| mobile/src/features/your-mp/Evidence.tsx:68 | The latest public export could not be loaded. Showing the saved copy. | The latest records could not be loaded. Showing the saved copy. |
| mobile/src/api/catalogs.ts:922 | The seat release does not match its manifest. | The electorate records are out of step. Try again shortly. |
| mobile/src/api/selectors.ts:1331 | The seat release does not match its manifest. | The electorate records are out of step. Try again shortly. |
| mobile/src/features/directories/data.ts:105 | The electorate release does not match its manifest. | The electorate records are out of step. Try again shortly. |
| mobile/src/api/catalogs.ts:1146 | The person release does not match its manifest. | The people records are out of step. Try again shortly. |
| mobile/src/api/selectors.ts:310 | The person release does not match its manifest. | The people records are out of step. Try again shortly. |
| mobile/src/design/format.ts:310 | OPAX indexed speeches (source label for "parli.db speeches") | OPAX parliamentary speeches |

## Directories (people, parties, electorates)

| mobile/FILE:LINE | old text | suggested text |
| --- | --- | --- |
| mobile/src/features/directories/DirectoryScreen.tsx:133 | From the member roster. Speech total not yet indexed | From the member roster. No speech count yet |
| mobile/src/features/directories/DirectoryScreen.tsx:176 | Representation not yet verified | Member not confirmed |
| mobile/src/features/directories/DirectoryScreen.tsx:178 | {n} elections indexed | {n} elections |
| mobile/src/features/directories/DirectoryScreen.tsx:179 | Results not yet indexed | No election results yet |
| mobile/src/features/directories/model.ts:484 | Most elections indexed (sort option) | Most elections |
| mobile/src/features/directories/notes.ts:5 | Speech counts follow the site’s corpus rule (speeches since the 1993 election, 200+ characters, procedural rows removed). | Speech counts include speeches since the 1993 election of 200 or more characters, with procedural rows removed. |
| mobile/src/features/directories/notes.ts:13 | A missing representative or result means it has not been verified in this release. | A missing representative or result has not been confirmed yet. |

## Electorate page

| mobile/FILE:LINE | old text | suggested text |
| --- | --- | --- |
| mobile/src/features/directories/ElectorateHistory.tsx:131 | Representation has not yet been verified for this date. | No confirmed member for this date. |
| mobile/src/features/directories/ElectorateHistory.tsx:157 | Historical service has not yet been imported. | section hidden (drop the empty state); if it must stay: "No service history for this electorate yet." |
| mobile/src/features/directories/ElectorateHistory.tsx:215 | … their speeches, divisions and other indexed records. | … their speeches, divisions and other records. |

## Your MP

| mobile/FILE:LINE | old text | suggested text |
| --- | --- | --- |
| mobile/src/features/YourMP.tsx:291 | No matching electorate or member in this release. | No matching electorate or member. |
| mobile/src/features/YourMP.tsx:693 | OPAX does not yet have a verified roster of {jurisdiction} members. | No confirmed member list for {jurisdiction} yet. |
| mobile/src/features/your-mp/Evidence.tsx:338 | This release does not link this person's {section}. See the record on opax.com.au. | The app does not show this person's {section} yet. See the record on opax.com.au. |

## Person page

| mobile/FILE:LINE | old text | suggested text |
| --- | --- | --- |
| mobile/src/features/Person.tsx:74 | No readable record was found for this person. Some rows in the latest public export were unreadable. | No record could be shown for this person. Some records could not be read. |
| mobile/src/features/people/FinancialBlocks.tsx:48 | No readable record was found for this person. Some rows in the latest public export were unreadable. | No record could be shown for this person. Some records could not be read. |
| mobile/src/features/people/FinancialBlocks.tsx:173 | No readable record was found for this person. Some rows in the latest public export were unreadable. | No record could be shown for this person. Some records could not be read. |
| mobile/src/features/people/FinancialBlocks.tsx:49 | This release does not link this person's salary entitlements. See the record on opax.com.au. | The app does not show this person's salary entitlements yet. See the record on opax.com.au. |
| mobile/src/features/people/FinancialBlocks.tsx:175 | This release does not link party receipts for this person's party. See the record on opax.com.au. | The app does not show party receipts for this person's party yet. See the record on opax.com.au. |
| mobile/src/features/Person.tsx:537 | Category definition not held. | hide the line; if it must stay: "No definition for this category." |
| mobile/src/features/Person.tsx:602 | No declared organisation ties are held in this register file. | No declared organisation ties. |
| mobile/src/features/Person.tsx:653 | No current electorate observation is held in this release. | No current electorate recorded. |
| mobile/src/features/people/PartyDepth.tsx:95 | No disclosed meetings match this party in this export. | No disclosed meetings match this party. |
| mobile/src/features/people/PartyDepth.tsx:115 | No registered lobbying client match is held for this party in this export. | No registered lobbying client matches this party. |
| mobile/src/features/people/Sections.tsx:282 | OPAX topic labels on indexed speeches (citation) | OPAX topic labels on speeches |
| mobile/src/features/people/Sections.tsx:305 | Latest indexed speeches | Latest speeches |
| mobile/src/features/people/Sections.tsx:371 | No mentions found in the indexed record. | No mentions in the record. |
| mobile/src/features/people/Sections.tsx:375 | OPAX indexed parliamentary record; each row opens its source record (citation) | OPAX parliamentary record; each row opens its source record |
| mobile/src/features/people/Sections.tsx:380 | Newest results within the indexed retrieval window. | Newest matching results. Older speeches may not appear here. |

## Bills and divisions

| mobile/FILE:LINE | old text | suggested text |
| --- | --- | --- |
| mobile/src/features/bills/BillDetail.tsx:1106 | OPAX indexed parliamentary record (citation) | OPAX parliamentary record |
| mobile/src/features/directories/DivisionHistory.tsx:183 | {n} division records loaded (screen-reader announcement) | {n} divisions shown |
| mobile/src/features/directories/DivisionHistory.tsx:268 | {loaded} of {total} bill files loaded; {failed} unavailable | Divisions from {loaded} of {total} bills; {failed} unavailable |

## Today and recent records

| mobile/FILE:LINE | old text | suggested text |
| --- | --- | --- |
| mobile/src/features/records/RecentRecords.tsx:45 | Newly indexed (section title) | New in OPAX |
| mobile/src/features/records/RecentRecords.tsx:53 | Loading newly indexed records | Loading new records |
| mobile/src/features/records/RecentRecords.tsx:63 | Indexed {date} | Added {date} |
| mobile/src/features/records/RecentRecords.tsx:64 | Indexed date not published | Date added not recorded |
| mobile/src/features/records/RecentRecords.tsx:72 | No newly indexed records are available. | section hidden; if it must stay: "No new records yet." |
| mobile/src/features/records/RecentRecords.tsx:76 | About indexed dates (sheet title) | About dates added |
| mobile/src/features/records/RecentRecords.tsx:86 | Newly indexed records. The indexed date is when the record entered OPAX, rather than when it was published. | Records added recently. The date is when the record was added to OPAX, not when it was published. |
| mobile/src/features/today/ExploreGrid.tsx:90 | Newly indexed records | New records |

## Search and Ask filters

Match the web's replacement for "Record type" (suggested: "Type").

| mobile/FILE:LINE | old text | suggested text |
| --- | --- | --- |
| mobile/src/features/search/FiltersSheet.tsx:39 | Unavailable record types are shown in the list. Choose people, interests, expenses or pay from Search kind. | Some types are not in this list. Choose people, interests, expenses or pay from Search kind. |
| mobile/src/features/search/FiltersSheet.tsx:194 | Record type (filter label) | Type |
| mobile/src/features/search/contracts.ts:14 | Record type (column option) | Type |
| mobile/src/features/search/contracts.ts:171 | record type (filter chip) | type |
| mobile/src/features/ask/model.ts:305 | Record type (filter chip key) | Type |
| mobile/src/features/search/Results.tsx:506 | No indexed speech uses that phrase. Hansard is literal: … | No speech in the record uses that phrase. Hansard is literal: … |

## Explore (Tide, Matrix, Time machine, Quiz)

| mobile/FILE:LINE | old text | suggested text |
| --- | --- | --- |
| mobile/src/features/explore/Tide.tsx:100 | Shares of labelled speeches, not the whole corpus | Shares of labelled speeches, not every speech |
| mobile/src/features/explore/model.ts:220 | Machine-written from the {n} passages the knowledge box retrieved for {year} so far, {cited} of them cited. … | Machine-written from {n} passages found for {year}, {cited} of them cited. … |
| mobile/src/features/explore/model.ts:221 | Machine-written from what the knowledge box had retrieved for {year} so far. A reading aid, not the record. | Machine-written from the passages found for {year}. A reading aid, not the record. |
| mobile/src/features/explore/model.ts:292 | A machine pass is still labelling the corpus by subject, so every number here is a floor and shares will settle as it runs. … | Not every speech has a topic label yet, so every number here is a floor and shares may shift. … |
| mobile/src/features/explore/model.ts:294 | Labels are applied so far; the coverage rule shows how much of the indexed speech record has been reached. | Not every speech is labelled yet; the coverage rule shows how many are. |
| mobile/src/features/explore/model.ts:296 | … The AEC export aggregates party recipients; … A machine pass is still labelling the corpus by subject, so speech counts are floors and shares will settle as it runs. … | … AEC data groups party recipients; … Not every speech has a topic label yet, so speech counts are floors and shares may shift. … |
| mobile/src/features/explore/PhotoCredits.tsx:53 | OPAX year photograph manifest (citation) | OPAX year photographs |
| mobile/src/features/explore/YearPictures.tsx:10 | OPAX year photograph manifest (citation) | OPAX year photographs |
| mobile/src/features/explore/Quiz.tsx:164 | OPAX static quiz exports (citation) | OPAX quiz questions |

## Reports, topics and stats

| mobile/FILE:LINE | old text | suggested text |
| --- | --- | --- |
| mobile/src/features/reports/ReportPage.tsx:58 | Labelled so far, not the whole record: the labeller is still working through the corpus, so a bar is a floor. | Not every speech has a label yet, so a bar is a floor. |
| mobile/src/features/reports/ReportPage.tsx:60 | A machine pass is still labelling the corpus by subject, so speech counts are floors and shares will settle as it runs. | Not every speech has a topic label yet, so speech counts are floors and shares may shift. |
| mobile/src/features/reports/TopicPage.tsx:238 | … labelled to date. The labelling pass is still running. | … labelled to date. Not every speech is labelled yet. |
| mobile/src/features/reports/TopicsIndex.tsx:23 | … scaled to the topic’s own peak. The labelling pass is still running. | … scaled to the topic’s own peak. Not every speech is labelled yet. |
| mobile/src/features/reports/TopicsIndex.tsx:137 | Not yet labelled (section title) | No labelled speeches yet |
| mobile/src/features/reports/Stats.tsx:65 | passages indexed | passages |
| mobile/src/features/reports/Stats.tsx:69 | speeches indexed | speeches |
| mobile/src/features/reports/Stats.tsx:108 | OPAX corpus manifest (citation) | OPAX record summary |
| mobile/src/features/reports/Stats.tsx:109 | Corpus version {version} | Snapshot {version} |
| mobile/src/features/reports/TodayReports.tsx:102 | OPAX corpus manifest (citation) | OPAX record summary |
| mobile/src/features/reports/TodayReports.tsx:106 | Sources cover different periods and record types. … | Sources cover different periods and kinds of record. … |

## Money (grants, programs, leads, declarations)

| mobile/FILE:LINE | old text | suggested text |
| --- | --- | --- |
| mobile/src/features/money-public/Grants.tsx:148 | Programs in the available export. Open a program to see its listed awards for {seat}. | Grant programs for {seat}. Open a program to see its listed awards. |
| mobile/src/features/money-public/Grants.tsx:270 | No matching federal division is recorded in the grant export. This is not a zero total. | No matching federal division in the grant records. This is not a zero total. |
| mobile/src/features/money-public/Program.tsx:59 | Program not found in the available export. | Program not found. |
| mobile/src/features/money-public/Program.tsx:143 | {listed} of {available} program grants listed in the export. | {listed} of {available} program grants listed. |
| mobile/src/features/money-public/Program.tsx:176 | {listed} of {available} program grants listed in the export. | {listed} of {available} program grants listed. |
| mobile/src/features/money-public/parts.tsx:302 | No matching records in the available export. | No matching records. |
| mobile/src/features/money-public/attribution.ts:12 | … the combined export does not publish one verified licence. | … OPAX publishes no single licence for the combined records. |
| mobile/src/features/money-public/attribution.ts:40 | Connections are derived from the collected Hansard, press release and Queensland grant corpus. | Connections come from the collected Hansard, press release and Queensland grant records. |
| mobile/src/features/leads/LeadDetail.tsx:80 | This lead is not in the current export. | This lead is no longer listed. |
| mobile/src/features/leads/Leads.tsx:156 | No leads of this kind are in this export. | No leads of this kind. |
| mobile/src/features/declarations/Declarations.tsx:52 | This export holds the newest {rows} of {available} dated register alterations. … use exact normalised names. | Showing the newest {rows} of {available} dated register changes. … use exact name matches, ignoring case and spacing. |

## Sources and licences

| mobile/FILE:LINE | old text | suggested text |
| --- | --- | --- |
| mobile/src/features/sources/datasets.ts:47 | … describe the labelled record, with the labelling pass still running. … | … describe the labelled record, and not every speech is labelled yet. … |
| mobile/src/features/sources/datasets.ts:48 | Homepage previews are copied from OPAX’s static homepage. The export supplies no snapshot date. | Homepage previews are copied from OPAX’s homepage. No snapshot date is given. |
| mobile/src/features/sources/datasets.ts:350 | OPAX’s access export joins the published diary disclosures to the guarded parliamentary roster. … | OPAX joins the published diary disclosures to the parliamentary roster. … |
| mobile/src/features/sources/datasets.ts:370 | OPAX’s access export does not publish one combined reuse licence. Check the original register’s terms before reuse. | OPAX publishes no single reuse licence for these records. Check the original register’s terms before reuse. |
| mobile/src/features/sources/datasets.ts:398 | … The news export does not publish a reuse licence. … | … OPAX publishes no reuse licence for these headlines. … |
