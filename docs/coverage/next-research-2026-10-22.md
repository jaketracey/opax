# Next queue research: 22 October 2026 Melbourne

Research only: no dataset files, data-row endpoints or attachments were downloaded,
ingested, staged or published. The [receipt ledger](next-receipts-2026-10-22.json)
records **64 sequential GETs across 14 hosts: 55 HTTP 200s, four 302s, two 404s,
two 403/challenges and one DNS error without an HTTP response**. Requests ran on
21 October UTC, 22 October in Melbourne, using
`OPAXBot/1.0 (+https://opax.com.au/about; corrections@opax.com.au)` from
`parli/ingest/user-agent.json`. Robots was checked before any other request on
each host. The measured minimum interval between starts was **5.110138 seconds**,
with no overlapping requests; the ACT hosts' 20-second and Queensland/NT data
portals' 10-second crawl delays were also observed. No proxy, automatic redirect,
alternate identity, browser, archive or Firecrawl was used. The four ACT page
redirects were inspected, then their permitted destinations requested separately.
Each challenge stopped its host; unsuccessful bodies were hashed and
discarded. Successful HTML, robots and catalogue/schema metadata bodies, and the
acquisition script, remain private outside Git at
`/Users/jake/.cache/opax/coverage-next-research-2026-10-22/`. Only findings and receipts are committed.
Fix 1 appends six requests to the original 58, leaving those original receipts
unchanged: fresh robots checks on dataACT and Tenders ACT, the invoice page
redirect and destination, invoice schema metadata, and the bare contract-search
page. The new run has a minimum start interval of **5.110173 seconds**, no
overlap and one 403/challenge on Tenders ACT. That host stopped before any
terms/copyright request. Its challenge body was discarded. Fix 1 successful
responses and acquisition code are in the private evidence directory
`fix-1/` beneath the path above.

Scores follow [COVERAGE.md](../COVERAGE.md#next): public interest × data
availability × licence clarity, each 1–5. These are **twelve assessed candidates**, not
replacements for delivered sources or permission to retry held files. A=5 means
an official structured endpoint/download with a stable dataset/resource ID;
it does not claim fresh file-byte access, unique row keys or complete holdings.
L=5 below rests on an explicit dataset/resource grant, rather than a general
website policy. The ledger adds **31 offline path checks**, labelled
`requested: false`, to the relevant source receipts. Each source above 60 has
its actual publisher-specified JSON endpoint or original CSV href checked
against the current policy on that exact host. No download response or unknown
redirect destination is inferred from this check. NSW certificate files under
`/sites/default/files/noindex/` are disallowed, so that candidate has A=2.

| Rank | Candidate / gap | I × A × L | Evidence, limits and cadence |
| --- | --- | --- | --- |
| 1 | ACT Notifiable Invoices Register, catalogued July 2015–September 2026; procurement/payment disclosures, not yet | 4 × 5 × 5 = 100 | [Official register][act-invoices] and [schema/licence metadata][act-invoices-meta], 200; dataset-specific **CC BY 4.0**, stable ID `kzmf-7uhp`, and the page's exact `/resource/kzmf-7uhp.json` endpoint, robots-allowed and unrequested. Publisher says the regime covers all Territory entities and invoices valued at **$25,000 or more**, published within 21 days after the month paid. This is paid-invoice disclosure, not all spending, a contract award or a guarantee each payment amount exceeds the invoice threshold. Data updated 20 October 2026; metadata says monthly. Eight schema fields include supplier name/ABN, reporting entity, description, invoice-received/payment dates, payment amount and contract number. Start with this source among the assessed candidates, on the cost judgement below. Later acquire and validate month coverage, grain, duplicates, notices and date caveats; no inferred invoice ID or cross-record private identity join. Names and ABNs of sole traders remain only inside authorised source records, with no private-person profiles or name-search entities. |
| 2 | ACT Contracts Register, fixed 2000–2016 snapshot; government contracts, not yet | 4 × 5 × 5 = 100 | [Official register][act-contracts] and [schema/licence metadata][act-contracts-meta], 200. Explicit **CC BY 4.0**, stable dataset ID `8wge-3sy9`, and publisher-specified `/resource/8wge-3sy9.json`, robots-allowed. Schema includes Contract Number, contractor, agency, amount, GST, execution/expiry dates and confidentiality fields. Strong jurisdictional interest reflects the multi-agency historical register, not current spending coverage. Publisher describes a fixed historical snapshot with no updates. Later acquisition may use that permitted endpoint with attribution and retained notices; establish actual date bounds, row-key uniqueness and amendment/panel treatment before projection. Contract values are not payments; no supplier or private-person profiles or identity joins. |
| 3 | ACT 2021–22 Budget Review Infrastructure Investment Program; budget papers, not yet | 3 × 5 × 5 = 75 | [Official table][act-infrastructure] and [metadata][act-infrastructure-meta], 200. Dataset **CC BY 3.0 AU**, ID `93pb-g3pq`; publisher-specified `/resource/93pb-g3pq.json` is robots-allowed. Schema lists projects, directorates, classifications, priorities, five annual financing columns for 2021–22 to 2025–26, and total budgeted financing, in **$'000**. This is the historical review vintage, last data update 23 March 2022, not current expenditure. One historical acquisition; preserve estimates, units and vintage, test published totals and duplicate project labels, and do not add overlapping chart/table views. Recheck corrections before acquisition; no nightly schedule. |
| 4 | ACT COVID-19 Business Support Grant payment amounts, FY2021–22; grants, not yet | 3 × 5 × 5 = 75 | [Official payment dataset][act-grants] and [metadata][act-grants-meta], 200. Dataset **CC BY 3.0 AU**, ID `9qtv-yi86`; publisher-specified `/resource/9qtv-yi86.json` is robots-allowed. Schema lists application outcome, employing status, industry classifications, total paid and payment components. Metadata bounds coverage to August 2021–June 2022 and says once off. Scope is published funded-payment records only, not unsuccessful applications or an inferred recipient register. Historical acquisition; establish the source grain and funded-outcome boundary, then reconcile component/total relationships only where supported. No row, award count, total or recipient identity is inferred from metadata. |
| 5 | South Australia Police 2025–26 consultancies and contractors; government contracts/disclosures, not yet | 3 × 5 × 5 = 75 | [Annual reporting dataset][sapol], [consultancies resource][sapol-consultancies] and [contractors resource][sapol-contractors], 200. Dataset and resource **CC BY 4.0**; two stable resource UUIDs and original same-host CSV hrefs, both robots-allowed. Resource pages updated 14 October 2026; filenames identify 2025–26, with file contents unverified. Bounded agency disclosure, not an SA-wide contract register. Annual; later acquire only these two originals, check file notices, periods, units, categories and published controls, and distinguish consultancy/contractor expenditure from contract notices and payments. No police operational, complaint, workforce or case records are proposed. |
| 6 | SA Multicultural Grants 2014–15, funded awards; grants, partial | 3 × 5 × 5 = 75 | [Dataset][sa-multicultural] and [resource][sa-multicultural-resource], 200; explicit dataset/resource **CC BY 4.0**, resource ID `f5100cc5-bf3e-4b0c-8631-ea3faedc5e17`. The published original CSV href is same-host and robots-allowed. Description identifies organisation, project purpose, location and funded amount. This is a separate Multicultural Affairs programme, not the LIVE Grants SA 2016–18 series. Catalogue marks it inactive, with 2014–15 coverage; resource last updated 7 July 2016. One historical acquisition, checking corrections first; verify funded-award boundaries, year, file notices and published totals. Retain names inside authorised source records only; no applicant reconstruction or identity joins. |
| 7 | Tasmania 2026–27 budget papers; budget papers, not yet | 4 × 3 × 2 = 24 | [Treasury index][tas-budget], 200, with stable PDF and Word-document links. No structured spreadsheet verified. Its footer-linked copyright page returned **403/challenge**, so no applicable reuse grant was established and that host stopped. Annual; retain the access/rights hold. The failed guessed `www.budget.tas.gov.au` robots URL was a DNS discovery error, not a content request; the canonical Treasury URL came from the pre-existing COVERAGE source registry. Neither failing host/path was retried. |
| 8 | NSW Premier's Department historical advertising compliance certificates; advertising, not yet | 3 × 2 × 4 = 24 | [Department index][nsw-advertising], [all-government hub][nsw-advertising-hub] and [NSW terms][nsw-terms], 200. Website **CC BY 4.0 with exceptions**; document notices unreviewed. The department index publishes certificate PDFs, including two Australia Day files under robots-disallowed `noindex/`; other historical PDF paths are allowed. No PDF requested. The newer hub supplies a dynamic campaign table, not a verified structured export. These are compliance certificates, not actual advertising expenditure. Campaign/event cadence; rights and permitted complete-file discovery first, with A capped at 2. No form submission or widget/backend request. |
| 9 | ACT 2026–27 budget tables; budget papers, not yet | 4 × 5 × 1 = 20 | [Papers page][act-budget] and [budget-specific copyright][act-budget-terms], 200. A named XLSX on the Treasury host is robots-allowed, but the **specific notice limits use to personal/non-commercial internal purposes and requires permission for further publication/commercialisation**. The general ACT website CC BY policy does not override it. Annual; hold reuse pending a grant applicable to this workbook. No workbook request. |
| 10 | NT budget/open-data tables; budget papers, not yet | 4 × 1 × 2 = 8 | `https://budget.nt.gov.au/robots.txt` returned 404; this run conservatively made no content request there. The separate official [NT open-data catalogue search][nt-budget-search] returned 200 but no datasets for “budget”; its robots permits catalogue discovery and disallows `/api/`. No table, stable resource ID or applicable grant established. Annual budget cadence; source and rights discovery remain necessary, without treating a failed search as proof no data exists. |
| 11 | Tenders ACT contract search; government contracts, not yet | 4 × 1 × 2 = 8 | Catalogue-published [bare search route][tenders-search]. Host robots returned 200 and allows that route, but the single ordinary GET returned **403/challenge**. Host stopped immediately; no challenge body, search form use, query endpoint, contract detail or terms/copyright request. Robots separately disallows `/contract/view`. No permitted bulk download or applicable reuse grant established. Actual blocked access gives A=1, below the A=2 ceiling for a reachable search widget. Licence clarity remains 2; general ACT website terms do not clear this host. Access and rights held; publication cadence unverified. |
| 12 | WA government advertising expenditure discovery; advertising, not yet | 4 × 1 × 1 = 4 | [DPC policy index][wa-advertising] and [WA.gov.au terms][wa-terms], 200. The checked index establishes advertising policy links, not an expenditure series or structured download. Terms restrict commercial reuse and automated monitoring/copying; no applicable open grant found. No further WA request after reading those terms. Annual expenditure cadence remains unverified; hold route and rights discovery. The existing WA budget hold was not retried. |

The first five are the refreshed queue. The two 100-point sources both serve
multi-entity ACT procurement accountability but describe different grains and
periods. The contracts snapshot has the longer historical span; the invoice
register adds paid-invoice disclosure. Metadata does not establish a decisive
breadth advantage. With that breadth judgement tied, **estimated interpretation
and projection cost** favours invoices: eight fields rather than the historical
register's 25, and no panel-value or contract-amendment treatment needed for the
initial invoice view. This is a schema-based cost judgement, not a measured row
count, transfer size or performance comparison. Update dates describe scope
and do not decide ties.

At 75, retain the reviewer's order: **ACT infrastructure, ACT COVID business
payments, SAPOL, SA multicultural**. Infrastructure spans projects/directorates;
business payments span the Territory programme's industries/employing categories;
SAPOL is one agency's two disclosure resources; multicultural grants are the
smaller bounded programme. That is a breadth ordering, with no freshness
preference or quantified acquisition-cost claim. Interest 3 reflects those
bounded scopes. No source is marked covered and no row count is estimated.

## Current ACT procurement comparison

The saved catalogue already named both current procurement leads. Fix 1 assesses
them alongside the historical snapshot rather than treating the stale adjacent
`pfs5-8d64` table as evidence about current ACT procurement elsewhere.

The invoices register scores **4 × 5 × 5 = 100**, tying the snapshot. Its own
schema metadata specifies CC BY 4.0 and catalogues July 2015–September 2026,
last data update 20 October 2026. The official page publishes the exact JSON
resource path; the fresh dataACT policy allows it. No data request was made.
The threshold applies to **invoice value**, while the schema labels its amount
field **Payment Amount**. Do not silently apply a $25,000 filter to payment rows,
treat contract numbers as invoice IDs, infer complete expenditure, or add
contract values to invoice payments. Preserve missing/non-uniform received-date
caveats, reporting-entity changes and the source's payment/reporting periods.
The description discusses a Procurement Unique Identifier, but the checked
eight-column schema has no separate field with that name; do not invent one or
an associated join. Actual row bounds, completeness and uniqueness remain for a
later acquisition to validate.

Supplier names and ABNs can identify sole traders. Under the unchanged shared
guard and the 19 October decision, those authorised source-record values may
remain inside their records. Do not create private-person profiles, name-search
entities or cross-record identity joins, including joins based on a sole
trader's ABN. This is application of the existing decision, not a new names
exclusion or reopening of the publication policy.

Tenders ACT scores **4 × 1 × 2 = 8**. Its fresh robots permits the bare
`/contract/search` route and excludes contract detail pages. The permitted bare
page returned 403/challenge at **2026-10-21T21:54:17.586953+00:00**, response
SHA-256 `0879a28f6e8554727bc2f0bec7688c6f8d17687a576aa46dcca23c3705dc91cb`.
The mandatory stop prevented a subsequent terms/copyright request, even though
no robots exclusion of a terms path had been established. No term, grant,
search-widget behaviour, permitted bulk route or update cadence was verified
from that challenge. A search widget alone would merit A=2 at most; actual
refused access here merits A=1 and unverified licence L=2. No form submission,
query endpoint, detail path, alternate host or refusal workaround was used.
The separately licensed dataACT invoices register does not clear this host.

## Queensland portal finding

The original BP3/BP4 download and Treasury consultancy holds remain. Fresh
`www.data.qld.gov.au/robots.txt` still disallows `/api/`, `/storage/`,
`/en/storage/` and `/ckan-*-attachments-*/`, with a ten-second crawl delay.
The four previously captured attachment redirect destinations were checked
offline against this policy and remain disallowed. No original was retried,
no redirect destination requested, and no blocked API path visited.

There **is a publisher-linked, robots-permitted alternative path**: all three
checked resource pages publish `/datastore/dump/<resource UUID>` links for CSV,
TSV, JSON and XML. For example, BP3 links
`https://www.data.qld.gov.au/datastore/dump/aa894f86-6f57-4e81-8f95-8c1541bcd819?bom=True`.
The ledger records the exact hrefs and allowed decisions, not requests to those
downloads. The linked Data API routes remain disallowed. The resource pages and
the portal's footer-linked [Queensland copyright terms][qld-terms] do not name
a separate budget/consultancy file host that resolves the attachment restriction.
No alternate host was tried.

**Keep the source holds:** each of BP3, BP4 and the 2025–26 consultancy resource
explicitly reports `Datastore contains all records of source file False`.
The CSV/TSV/JSON/XML links do not establish complete originals, dictionaries,
notes, file notices or numerical reconciliation. No dump, API data or cached
copy was acquired. This is new lawful path evidence, not evidence that the
existing complete-original hold is resolved, and neither held Queensland source
is re-ranked. If a later lane considers a partial DataStore scope, it must
define and validate that scope separately rather than substitute it for the
held originals. Research-only authority does not authorise that download here.

## Recommended first acquisition

Recommend **rank 1, ACT Notifiable Invoices Register, 100, among the twelve
assessed candidates**. Its dataset-specific CC BY 4.0 grant, stable ID, official
schema and exact robots-permitted JSON path support a lawful first acquisition
now, with attribution and retained notices. It ties the historical contracts
snapshot on score; the comparable-breadth and lower estimated interpretation
cost judgement above places invoices first. The snapshot remains rank 2 and
remains a lawful separate historical acquisition. This recommendation does not
claim an exhaustive comparison of all procurement sources or successful data
access. A later authorised lane must recheck policy, acquire with the same
pacing/refusal stops, validate coverage, record grain, dates and amounts, and
review the projection. No new private-person entities or identity joins.

The adjacent ACT register `pfs5-8d64` says “2016 - present” and monthly updates,
but its descriptor's last data update is 25 July 2017. It is **not** included as
current coverage or a second ranked candidate. The SA Housing Trust community
housing contributions dataset was also inspected: it describes contributions
received from rental income, not awarded grants. It is excluded from the grant
queue despite its CSV and CC BY metadata. The SA catalogue search for lobbyist
data supplied no dedicated candidate; no register contents were requested.

## Holds

Existing holds below retain their supplied scope and reasons. None was retried;
the sole reassessment is the explicitly requested Queensland portal policy and
permitted metadata check above, which did not retry any held download.

| Candidate | Carry / new | Evidence and next decision |
| --- | --- | --- |
| APH estimates | Carried, not retried | Supplied 403 hold. No APH request, including robots. |
| AIHW | Carried, not retried | 15 October robots 403/challenge; no request. |
| Queensland Cabinet historical diaries | Carried, not retried | Earlier 200 challenge markup; zero historical rows and current rights unverified. Portal metadata does not clear Cabinet access. |
| PM&C FOI; DFAT, DSS and Infrastructure FOI | Carried, not retried | PM&C challenge and the other departments' timeouts remain. No request. |
| PBO and APSC | Carried, not retried | Robots timeouts on 15 October. No robots, content or alternative-host request. |
| Commonwealth Finance advertising | Carried, not retried | Earlier robots timeout and stream reset; no Finance request. |
| Queensland election results / ECQ | Carried, not retried | Supplied access hold; exact old receipt still unavailable in this baseline. No ECQ request. |
| Productivity Commission RoGS | Carried, not retried | Robots excludes linked data-downloads path. No request or alternative route. |
| QAO PDF bodies; VAGO report bodies | Carried, not retried | QAO document-specific restrictions and VAGO commercial restriction unchanged. No request. |
| NSW budget | Carried, not retried | Robots redirect to a separate host; route and rights unresolved. No request. |
| NSW Audit Office | Carried, not retried | 21 October footer/sitemap/policy review found no applicable reuse grant; score 32 and rights hold unchanged. No Audit Office request. |
| NSW CBP full awards export | Carried, not retried | Score 24; only first recipient pages and an unlinked CSV control verified. Query pagination remains disallowed. No CBP, widget or API request. |
| data.gov.au | Carried, not retried | 21 October robots `Disallow: /` remains the supplied restriction. No robots, catalogue, API or alternative host requested. |
| WA budget | Carried, not retried | Robots 302 to an HTTP page-not-found URL, with no usable policy. No budget host or content request. |
| ACT Assembly lobbyist contents | Carried, not retried | No Assembly-specific grant established. No Assembly request; separate dataACT grants do not clear it. |
| Victorian budget attachments | Carried, not retried | S3 policy and file notices unverified. No budget, S3 or attachment request. |
| Queensland BP3/BP4 and Treasury consultancy | Carried original-file holds; policy/metadata only reassessed | Five earlier BP3/BP4 original-download 302s; four known targets disallowed, one target unrecorded. Consultancy stayed unattempted under the same portal hold. No held original or target retried. Permitted dump hrefs do not resolve publisher-stated DataStore incompleteness. |
| SA function/economic-type workbook | Carried, not retried | 4,774 staged cells remain held for unit-scale conflict and five of 353 diagnostics outside rounding. No file or substitute request. |
| SA Premier's Community Initiatives Fund | Carried, not retried | Five successful-award originals returned 404; zero awards staged. No retry, alternative URL or unsuccessful-resource request. |
| FRL instrument bodies and full versions | Carried, not retried | Accepted metadata catalogue does not clear phase 2 bodies/full history; seven API gaps retained. No FRL request. |
| Federal budget restricted section and 38 portfolio indexes | Carried, not retried | Existing document-rights/access holds remain separate from the live reviewed budget asset. No portfolio requests. |
| Tasmanian and ACT bill bodies | Carried, not retried | Live metadata does not clear document rights. No parliament/body requests. |
| Victorian advertising attachments | Carried, not retried | All 30 attachment access/file-rights holds remain. No Victorian advertising request. |
| NSW historical divisions | Carried, not retried | Permitted bulk/XML route and licence checks remain prerequisites. No parliamentary request. |
| External ABS resource linked from SA expenses workbook | Carried scope exclusion | Outside the selected SA workbook scope; its grant does not clear a different publisher. No ABS request; LIVE ABS delivery unchanged. |
| Tasmania budget copyright | New access/rights hold | `https://www.tas.gov.au/stds/codi.htm`, **403/challenge**, response completed **2026-10-21T21:21:20.537921+00:00**, SHA-256 `a7cdc371726cee8fe8992963e3d86ac1256dcaf54c097f4dc30f294d9bda2e61`. Host stopped immediately; challenge body not retained. No alternate terms route tried. |
| Tenders ACT contract search | Fix 1 new access/rights hold | `https://www.tenders.act.gov.au/contract/search`, **403/challenge**, completed **2026-10-21T21:54:17.586953+00:00**, SHA-256 `0879a28f6e8554727bc2f0bec7688c6f8d17687a576aa46dcca23c3705dc91cb`. Stopped immediately after the first page request; body discarded, no subsequent terms/copyright, form, query, detail or alternate-host request. Score 8; reuse grant and bulk availability unverified. |
| Guessed Tasmania budget host | New route discovery failure | `https://www.budget.tas.gov.au/robots.txt`, DNS error without HTTP at **2026-10-21T21:19:04.279770+00:00**; zero response bytes, SHA-256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`. No retry. Canonical Treasury source was already named in COVERAGE.md. |
| ACT current budget workbook | New rights hold | Budget-specific personal/non-commercial internal-use notice prevents assuming the general ACT CC BY grant. No workbook requested. |
| WA advertising | New rights/discovery hold | Restrictive WA.gov.au terms; no verified expenditure download. No further WA request after terms. |
| NT budget tables | New route/licence discovery hold | Budget-host robots 404; no content there. Separate official catalogue found no budget datasets; no API or file requested. |
| NSW advertising certificate files | New partial access/file-rights hold | Two linked certificates sit under robots-disallowed `noindex/`; other paths are permitted, but document notices and a complete export remain unverified. No PDF or form request. |

The supplied 21 October LIVE deliveries, all earlier holds, the shared guards and
the 19 October authorised-source-record decision remain unchanged. No ingest,
staging, public asset, production check, push or deployment formed part of this
research.

[act-contracts]: https://www.data.act.gov.au/Government-and-Transparency/Contracts-Register-2000-to-2016/8wge-3sy9
[act-contracts-meta]: https://www.data.act.gov.au/api/views/8wge-3sy9.json
[act-infrastructure]: https://www.data.act.gov.au/Government-and-Transparency/Budget-review-2021-2022-Infrastructure-Investment-/93pb-g3pq
[act-infrastructure-meta]: https://www.data.act.gov.au/api/views/93pb-g3pq.json
[act-grants]: https://www.data.act.gov.au/Government-and-Transparency/COVID-19-Business-Support-Grant-Payment-Outcomes/9qtv-yi86
[act-grants-meta]: https://www.data.act.gov.au/api/views/9qtv-yi86.json
[sapol]: https://data.sa.gov.au/data/dataset/annual-reporting-data
[sapol-consultancies]: https://data.sa.gov.au/data/dataset/annual-reporting-data/resource/cb229568-d75b-41b1-996b-823e0bbc7349
[sapol-contractors]: https://data.sa.gov.au/data/dataset/annual-reporting-data/resource/d4470618-b2b4-46f4-8ac4-455a4cc22d07
[sa-multicultural]: https://data.sa.gov.au/data/dataset/multicultural-grants-2014-2015
[sa-multicultural-resource]: https://data.sa.gov.au/data/dataset/multicultural-grants-2014-2015/resource/f5100cc5-bf3e-4b0c-8631-ea3faedc5e17
[tas-budget]: https://www.treasury.tas.gov.au/Budget-and-Financial-Management/2026-27-tasmanian-budget
[nsw-advertising]: https://www.nsw.gov.au/departments-and-agencies/premiers-department/access-to-information/advertising-compliance-certificates
[nsw-advertising-hub]: https://www.nsw.gov.au/nsw-government/access-nsw-government-information/advertising-compliance-certificates
[nsw-terms]: https://www.nsw.gov.au/nsw-government/about-website/copyright
[act-budget]: https://www.treasury.act.gov.au/budget/budget-2026-27/budget-papers-and-statements
[act-budget-terms]: https://www.treasury.act.gov.au/budget/budget-2026-27/copyright
[wa-advertising]: https://www.wa.gov.au/organisation/department-of-the-premier-and-cabinet/government-campaign-advertising-policy-overview
[wa-terms]: https://www.wa.gov.au/terms-of-use
[nt-budget-search]: https://data.nt.gov.au/dataset?q=budget
[qld-terms]: https://www.qld.gov.au/legal/copyright

[act-invoices]: https://www.data.act.gov.au/Government-and-Transparency/Notifiable-Invoices-Register/kzmf-7uhp
[act-invoices-meta]: https://www.data.act.gov.au/api/views/kzmf-7uhp.json
[tenders-search]: https://www.tenders.act.gov.au/contract/search
