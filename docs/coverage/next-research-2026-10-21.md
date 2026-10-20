# Next queue research: 21 October 2026 Melbourne

Research only: no dataset or attachment downloads, ingestion, staging or public
assets. The [compact receipt ledger](next-receipts-2026-10-21.json) uses the
16 October array/receipt format: **64 requests, 61 HTTP 200s, two 404s and one
302** across 11 hosts. All were sequential GETs with
`OPAXBot/1.0 (+https://opax.com.au/about; corrections@opax.com.au)` from
`parli/ingest/user-agent.json`, at least **5.110449 seconds between starts**.
Queensland’s data portal received at least 10 seconds and the ACT Assembly at
least 20 seconds, as their robots policies require. Robots was the first request
on every host; disallowed paths were not requested. No proxy, browser, archive,
Firecrawl, alternate identity or automatic redirect was used. No forms,
accounts, logins or messages to people. There was no actual OPAX 403, challenge,
reset or timeout; any such response would stop that host without a retry.
Only successful research page bodies were retained as private evidence outside
Git; unsuccessful response bodies were discarded after hashing. Research ran
20 October UTC, 21 October in Melbourne. The ledger records both request and
response UTC times, status and SHA-256; no fetched page bodies are committed.

Scores follow [COVERAGE.md](../COVERAGE.md#next): public interest × availability
× licence clarity, each 1–5. A dataset-specific applicable open grant scores
L=5; a website grant with exceptions scores L=4. A=5 means published structured
downloads and stable resource IDs, not a fresh file-byte/reconciliation check.
No file was requested to improve a score. No source is marked covered. The
nine new candidates below supplement the two reassessed carries. Within the
100 tie, the full Budget Statements table set is broader than one historical
expenses workbook. Within 75, the multi-year agency expenditure series precedes
the bounded grant programme, then the smaller historical fund. Scores do not
remove the licence-before-ingest gate or the shared publication guards.

| Rank | Candidate / gap | I × A × L | Evidence, limits and cadence |
| --- | --- | --- | --- |
| 1 | South Australian 2015–16 Budget Statements tables; state budget papers, not yet | 4 × 5 × 5 = 100 | [Dataset](https://data.sa.gov.au/data/dataset/budget-2015-16-data) and [Table 1.3 resource](https://data.sa.gov.au/data/dataset/budget-2015-16-data/resource/36aa6d87-bb0d-46c8-b9c6-561b64044890), 200. Dataset and resource explicitly identify CC BY 4.0; 117 published XLSX resource entries with stable UUIDs. [Publisher terms](https://data.sa.gov.au/copyright), 200; specific data licences prevail. This is a historical budget vintage, not the current budget. One bounded historical acquisition, starting with Table 1.3; review workbook notices, units, estimates versus actuals and published controls before any later staging. Catalogue says update frequency never; check corrections before a historical run. Current-year discovery stays separate. |
| 2 | South Australian general government expenses by function and economic type; public finance, partial national coverage | 4 × 5 × 5 = 100 | [Dataset](https://data.sa.gov.au/data/dataset/general-government-sector-expenses-by-function-and-by-economic-type) and [direct workbook resource](https://data.sa.gov.au/data/dataset/general-government-sector-expenses-by-function-and-by-economic-type/resource/3f756590-9e67-4a05-97a0-f594247d2c72), 200; dataset CC BY 4.0 and resource attribution licence. Stable same-host XLSX download, four-digit Government Purpose Classification and Economic Type Framework, $million. Resource warns it is for interest, should not be relied on and is subject to revision. The separate ABS link is outside this scope. Bounded historical workbook only; preserve the warning and revisions, and establish its actual year range from the file. Its filename indicates 2012–13 to 2015–16; the catalogue’s broader 2005–2016 range is not verified file coverage. Catalogue says annual, last updated March 2017; no current series or additional ABS holdings claimed. |
| 3 | Queensland 2026–27 Capital Statement and Budget Measures; state budget papers, not yet | 4 × 4 × 5 = 80 | [BP3](https://www.data.qld.gov.au/dataset/2026-27-state-budget-budget-paper-3-capital-statement) and [BP4](https://www.data.qld.gov.au/dataset/2026-27-state-budget-budget-paper-4-budget-measures), plus their CSV resource pages, 200. Dataset and resource CC BY 4.0; five published CSV resources comprise two data files and dictionaries/notes. Exact same-host download paths are robots-permitted. Publisher metadata conflicts: archive-success entries coexist with historical QA 403s, and DataStore completeness is false; availability stays at 4. Annual budget vintages; each listed resource says not-updated. In a later authorised lane, use each exact original CSV once after robots/rights checks and stop at any refusal. Retain dictionaries, units, measure types and revisions; reconcile to the budget papers. No DataStore substitute, file reachability claim or download in this pass. |
| 4 | Queensland Treasury annual consultancy expenditure; government contracts/disclosures, partial | 3 × 5 × 5 = 75 | [Dataset](https://www.data.qld.gov.au/dataset/consultancy-spending-qld-treasury) and [2025–26 resource](https://www.data.qld.gov.au/dataset/consultancy-spending-qld-treasury/resource/83b7da5a-7f96-4ce6-a2a6-e1c084cb212b), 200; explicit dataset and resource CC BY 4.0, stable CSV UUIDs. Published annual links span 2012–13 to 2025–26; 2015–16 has the catalogue format label CSV VALIDATION SCHEMA; its file content is unverified. Latest publisher success is 11 September 2026, after its older QA 404; no file fetched. Annual agency disclosure, interest 3 for the single-agency scope. Start with 2025–26 and verify categories, totals, fields and file rights. Keep expenditure separate from contract notices and payments; do not imply state-wide coverage or infer comparable 2015–16 expenditure from that format label. |
| 5 | Grants SA funded projects, 2016–17 and 2017–18; SA grants, not yet | 3 × 5 × 5 = 75 | [Dataset](https://data.sa.gov.au/data/dataset/grants-sa-funded-projects-2016-2017) and [2016–17 resource](https://data.sa.gov.au/data/dataset/grants-sa-funded-projects-2016-2017/resource/0760d21e-8344-4462-b305-2f7f92f22f72), 200; dataset and resource CC BY 4.0. Two same-host CSV downloads with stable UUIDs. Published description lists organisation, project, region and funding; no award rows extracted. One historical programme acquisition, interest 3 for the bounded programme. Preserve published amounts and descriptions, then reconcile each file’s year and totals. Catalogue says annual but was last updated August 2018; do not treat it as current SA-wide awards. Names remain within authorised source records. |
| 6 | SA Premier’s Community Initiatives Fund, successful awards only; SA grants, not yet | 3 × 5 × 5 = 75 | [Dataset](https://data.sa.gov.au/data/dataset/premier-s-community-initiatives-fund), 200; explicit CC BY 4.0, stable XLS resources for 2008–09 to 2012–13. Narrow historical fund, interest 3. Applicant/unsuccessful sheets are outside the proposed award scope. Catalogue says annual, last updated March 2015. First establish the successful-award file boundaries and totals; no present-day coverage claimed. |
| 7 | Victorian 2026–27 budget papers; state budget papers, not yet | 4 × 3 × 4 = 48 | [Papers](https://www.budget.vic.gov.au/budget-papers) and [copyright](https://www.budget.vic.gov.au/copyright), 200. Publisher CC BY 4.0 has images/branding/third-party exceptions. Published links are heterogeneous PDF/DOCX files on S3, with no XLSX/CSV found on that page. S3 robots and file rights were not checked; no attachment requested. The budget host’s file-path robots exclusions do not establish S3 permission. Annual; resolve the actual file-host policy and document notices first. |
| 8 | NSW Audit Office catalogue; audit reports, not yet; carried rank 4 | 4 × 4 × 2 = 32 | [Catalogue](https://www.audit.nsw.gov.au/our-work/reports), [sitemap](https://www.audit.nsw.gov.au/sitemap.xml), footer-linked privacy/access pages and [policy list](https://www.audit.nsw.gov.au/who-we-are/our-accountability/access-our-information/how-to-access-our-information/policies), all 200. No applicable reproduction or open reuse grant found. GIPA publication/access is not a reuse licence. Licence clarity remains 2. Tabling/event cadence; publisher rights discovery remains necessary. |
| 9 | ACT lobbyist register; lobbyist registers, not yet | 4 × 4 × 2 = 32 | [Register index](https://www.parliament.act.gov.au/functions/tru/act-register-of-lobbyists), 200; links to a consolidated list and registration categories. No reuse terms link or applicable grant established from this page. Stable HTML discovery merits availability 4, not clearance of register contents. Event/change cadence; find Assembly-specific terms before list acquisition. No private-person entities or identity joins. |
| 10 | NSW Community Building Partnership; grants, not yet; carried rank 5 | 4 × 2 × 4 = 32 | [Programme](https://www.nsw.gov.au/grants-and-funding/community-building-partnership), four round pages, [2025 recipients](https://www.nsw.gov.au/grants-and-funding/community-building-partnership/community-building-partnership-2025/recipients) and [2023 recipients](https://www.nsw.gov.au/grants-and-funding/community-building-partnership/community-building-partnership-2023-round/recipients), 200. Each recipient page server-renders the first 50 entries, with a CSV button but no download href. Full-round export endpoint not verified; query pagination is robots-disallowed. [NSW CC BY 4.0](https://www.nsw.gov.au/nsw-government/about-website/copyright) has exceptions, so L=4; incomplete access keeps A=2. Round/event cadence; resolve a published permitted export without widget/API calls. |
| 11 | Western Australian budget papers; state budget papers, not yet | 4 × 1 × 2 = 8 | [Robots](https://www.ourstatebudget.wa.gov.au/robots.txt) returned 302 to an HTTP page-not-found URL. No usable robots policy, source content or reuse grant established; no redirect followed. Annual; publisher route/policy discovery remains held. This was not a 403 or challenge. |


The first five rows form the refreshed queue. The former 16 October ranks 1–3
are delivered according to the supplied delivery record: ABS GFS on 17 and
20 October, Treasury tax expenditures on 18 October, Victorian advertising on
19 October. No production verification was requested or performed in this lane.

## NSW Audit Office: licence finding

The actual catalogue footer links to privacy and access-to-information pages,
with no copyright, disclaimer or terms link. The permitted sitemap contains no
copyright/disclaimer/terms route. The linked privacy policy regulates collection
and disclosure of visitor information. Access information and the policy list
explain publication under the GIPA Act; neither supplies a reproduction licence.
**No applicable reuse grant was found on the publisher pages checked.** This is
not proof that no grant exists elsewhere, and the previous guessed `/copyright`
404 was not retried. NSW portal CC BY terms do not transfer to this separate
publisher. Keep **4 × 4 × 2 = 32**, with rights held. Catalogue filters and
pagination include disallowed query paths and were not requested.

## Community Building Partnership: endpoint finding

The permitted NSW grant sitemap exposed the 2022, 2023, 2025 and 2026 round
pages. The 2023 and 2025 pages link to public `/recipients` pages, both 200;
these are server-rendered records, beyond the main programme’s loading widget.
They show the first 50 recipients of publisher-stated totals 1,218 and 1,463
respectively. These are publisher page statements, not downloaded dataset counts
or a completeness assertion. The 2023 page separately states 1,221 applications
approved; retain that discrepancy for later reconciliation.

Each page shows an **Export as CSV button**, but it is a `type="button"` control
without an href or published export URL in the returned HTML. No linked award
CSV, XLSX or successful-project PDF download was verified on the pages checked.
The page’s generic Download as PDF control also has no document URL. Query-based
pagination would conflict with NSW robots `Disallow: /*?*`; it was not requested.
No widget scripts, inferred backend endpoint, API, query pagination or
SmartyGrants account/application content was requested. The Data.NSW CBP entry
links only to the old successful-grants landing URL already checked on
16 October; it is not an award file, and that redirect was not retried.

**A published permitted full-round download remains unverified.** Keep
**4 × 2 × 4 = 32** for the complete award lane. The first HTML page is a useful
bounded discovery finding, not authority to reconstruct the full register
through a disallowed route. The 2026 programme says results are anticipated in
January 2027; do not infer that round’s awards from application material.

## File findings and recommended next source

Recommend **rank 1, South Australian 2015–16 Budget Statements tables**. The
publisher explicitly releases this dataset for programmatic budget analysis.
The dataset and sampled Table 1.3 resource specify CC BY 4.0; the same-host
workbook URL is allowed by the checked robots policy. The publisher’s copyright
page says specific data licences prevail and specifies attribution by agency,
jurisdiction, dataset title, source date and URL. Its linked disclaimer requires
independent accuracy/completeness verification; the linked legacy
`/termsandconditions` returned 404, not a refusal. No narrower condition was
found on the checked dataset/resource pages. There is an applicable grant for
an ordinary first acquisition now, preserving attribution and file notices;
this research does not authorise or perform that acquisition. Start with the
named Table 1.3 workbook, then verify its rights and values. This is an archival
budget vintage and no current-year, complete-file or live-download claim.

Rank 2 is restricted to the direct SA expenses workbook. Its description calls
the data more detailed than the reported ABS/Final Budget Outcome data, but also
says it should not be relied on, is for interest and is subject to revision.
Preserve that warning; it cannot become an unqualified reconciliation control.
The dataset’s second resource is an external ABS landing page, not another
cleared SA workbook; no ABS request was made in this pass.

Rank 3 has dataset/resource CC BY 4.0 and published original CSV URLs under
`www.data.qld.gov.au/dataset/.../resource/.../download/`, allowed by the checked
robots policy. Both resource pages contain positive publisher archive checks
alongside same-day historical QA 403 entries, and `Datastore contains all records
of source file` is false. Those are publisher metadata, **not OPAX response
receipts or a new host refusal**. Availability is therefore 4 rather than 5.
No original CSV, cached alternative, DataStore dump or API was requested. A later
lane must test the exact original URLs and stop at its first refusal. BP4’s
resource description also says “2025-27 Budget” where the dataset description
says 2025–26; preserve and resolve the publisher discrepancy, not an OPAX fix.

Rank 4’s older publisher QA 404 predates its later successful check on
11 September; that is not fresh file proof. Do not count the 2015–16 resource’s validation-schema
format label as verified expenditure data. Ranks 4–6 have interest 3 because they are bounded
agency/programme disclosures, rather than whole-government budget accounts.
All file and row rights checks remain work for a separately authorised ingest.

## Holds

| Candidate | Carry / new | Evidence and next decision |
| --- | --- | --- |
| APH estimates | Carried, not retried | Supplied 403 hold. No APH request, including robots. Retain publisher access and rights hold. |
| AIHW | Carried, not retried | 15 October robots 403/challenge in the [previous ledger](gov-advertising/next-receipts.json). No request today. |
| Queensland Cabinet diaries | Carried, not retried | Earlier 200 challenge markup; no Cabinet request. The separately published Treasury budget/consultancy datasets do not clear Cabinet access. |
| PM&C FOI; DFAT, DSS and Infrastructure FOI | Carried, not retried | PM&C challenge and the other departments’ timeouts in the existing handoff. No request today. |
| PBO and APSC | Carried, not retried | Robots timeouts on 15 October. No content, robots or alternative-host request today. |
| Commonwealth Finance advertising | Carried, not retried | Earlier robots timeout and stream reset. No Finance request. |
| Queensland election results / ECQ | Carried, not retried | Existing orchestrator-supplied access hold; exact prior receipt remains unavailable in this baseline. No ECQ request. |
| Productivity Commission RoGS | Carried, not retried | Earlier robots exclusion of the linked data-downloads path. No request or alternate route. |
| QAO PDF bodies; VAGO report bodies | Carried, not retried | QAO document-specific restrictions and VAGO commercial restriction remain. Separate website grants do not clear these bodies. |
| NSW budget | Carried, not retried | Earlier robots redirect to a separate host; no request today. |
| NSW Audit Office | Carried, reassessed | No applicable reuse grant found through actual footer, sitemap or linked information/policy pages. Score remains 32. |
| NSW CBP full awards export | Carried, reassessed | First recipient pages and CSV control found, but no permitted published full-round file endpoint verified. No API/query workaround. Score remains 32. |
| data.gov.au | Carried restriction, robots reconfirmed | Robots 200, SHA-256 `386123441968e1a8e8633f4226f026dfe42bfffc8e4b033972d47b7cfb37f8e7`, `Disallow: /`. No catalogue, dataset, API or alternative host requested. |
| WA budget | New route/policy hold | Robots 302 at 21:19:53 UTC on 20 October, SHA-256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`; Location is an HTTP page-not-found URL. No usable robots policy or content request; no redirect followed. |
| ACT lobbyist contents | New rights hold | Public index checked; no applicable Assembly-specific grant established. Government-wide terms cannot be assumed. |
| Victorian budget attachments | New file-access/rights verification hold | S3 links published, but S3 robots and document notices unverified. No file or S3 request; no claim that the budget host’s exclusions settle a different host. |
| Queensland BP3/BP4 download proof | New verification limit, not a host refusal | Publisher checks conflict and DataStore completeness is false. Original download links and CC BY 4.0 established; file responses/rights imprints not tested. No actual OPAX 403 or bypass. |
| External ABS resource linked from SA GFS | Outside the selected workbook scope | SA’s grant does not clear a different publisher. No ABS request or inherited-licence claim. Existing delivered ABS lane is unchanged. |

No source was silently released from an earlier hold. The refreshed table is a
research priority list; source permissions, current robots, document notices,
source hashes, totals and the unchanged publication guards still govern any
future acquisition. No ingest, staging, public export, push or deployment took
place.
