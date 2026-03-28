# Australian State Parliament Data Sources

Research conducted 2026-03-28 for OPAX (Open Parliamentary Accountability eXchange).
This document covers programmatic data access for Victoria, South Australia, Western Australia,
and state electoral commission donation data for NSW, VIC, and QLD.

---

## 1. VICTORIA

### 1.1 Hansard (parliament.vic.gov.au)

- **URL:** https://www.parliament.vic.gov.au/hansard
- **Search:** https://hansard.parliament.vic.gov.au/
- **Browse:** https://www.parliament.vic.gov.au/parliamentary-activity/hansard/hansard-debate/
- **API:** None. No REST API, no bulk download, no XML/JSON feed.
- **Formats:** PDF only (daily PDFs per sitting day)
- **Coverage:** Progressive publishing 2018-present; Hansard and Argus PDFs 1851-present
- **Authentication:** None needed for public access
- **Programmatic access:** Scraping required. PDFs available at predictable URLs under
  `parliament.vic.gov.au/globalassets/hansard-daily-pdfs/`. URL pattern is not fully
  predictable (contains internal IDs like `hansard-2145855009-34426`).
- **Publication timeline:** Speech within 3 hours, proof version 4 hours after sitting ends,
  final version 5 working days later.

**Assessment:** POOR for programmatic access. PDF-only with no structured data output.
Will require PDF parsing (e.g., pdfplumber) or scraping the web search interface.
The search interface at hansard.parliament.vic.gov.au uses jQuery and loads member data
from `raw_memberdata.txt` -- this could be scraped for member metadata.

### 1.2 Voting/Division Records

- **URL:** https://www.parliament.vic.gov.au/parliamentary-activity/minutes-and-votes/
- **Format:** PDF (Minutes of Proceedings / Votes and Proceedings)
- **Coverage:** Current and historical parliaments
- **API:** None
- **Programmatic access:** PDF scraping required. Divisions are summarised in Hansard
  and recorded in Minutes. No structured data export.

**Assessment:** POOR. PDF-only. Division records embedded in minutes documents.
Consider using TheyVoteForYou (theyvoteforyou.org.au) which covers some Victorian
state divisions via OpenAustralia, though coverage of state parliaments is limited.

### 1.3 Victorian Electoral Commission (VEC) - Donation Disclosures

- **URL:** https://vec.vic.gov.au/disclosures
- **Disclosures Portal:** https://disclosures.vec.vic.gov.au/public-donations/
- **Annual Returns:** https://disclosures.vec.vic.gov.au/public-annual-returns/
- **Nominated Entities:** https://disclosures.vec.vic.gov.au/public-nominated-entities/
- **API:** None identified
- **Formats:** Web portal with search; no CSV/bulk download confirmed
- **Coverage:** 2018-present (FY 2020-21 through 2025-26 visible in portal)
- **Disclosure threshold:** $1,240 or more, within 21 days
- **Authentication:** None needed to view public data
- **Contact:** disclosures@vec.vic.gov.au

**Assessment:** MODERATE. Searchable web portal but no confirmed bulk CSV export.
Will likely need to scrape the portal or contact VEC to request data extracts.
The portal filters by financial year and shows donor/recipient details.

### 1.4 IBAC (Independent Broad-based Anti-corruption Commission)

- **URL:** https://www.ibac.vic.gov.au/
- **Allegations Dashboard:** https://www.ibac.vic.gov.au/public-sector-allegations-dashboard
- **Investigation Reports:** https://www.ibac.vic.gov.au/investigations
- **Data on DataVic:** https://discover.data.vic.gov.au/ (search for IBAC)
- **API:** No direct API. DataVic portal uses CKAN API (https://discover.data.vic.gov.au/dataset/datavic-open-data-api-version-2-1-0)
- **Dashboard format:** Interactive web dashboard (likely Power BI or similar)
- **Coverage:** Allegations data from 1 July 2018 to 31 December 2023 (periodically updated)
- **Data scope:** De-identified allegations of corrupt conduct and police misconduct;
  filterable by sector, organisation type, organisation name, local council,
  category of alleged behaviour, and function/activity type.
  Excludes organisations with fewer than 50 employees (privacy).
- **Authentication:** DataVic API requires API key generation

**Assessment:** MODERATE. The allegations dashboard is uniquely valuable but is an
interactive web tool, not a downloadable dataset. Reports are PDF. DataVic CKAN API
could be checked for structured IBAC datasets. Dashboard data may need scraping.

---

## 2. SOUTH AUSTRALIA

### 2.1 Parliament Hansard API (CONFIRMED WORKING)

- **Swagger Docs:** https://hansardsearch.parliament.sa.gov.au/docs/api/index.html
- **OpenAPI Spec:** https://hansardsearch.parliament.sa.gov.au/docs/api/v1/swagger.json
- **ReadTheDocs:** https://parliament-api-docs.readthedocs.io/en/latest/south-australia/
- **R Package:** https://github.com/jonocarroll/SAHansard
- **API Base URL:** `https://hansardsearch.parliament.sa.gov.au/api/`
- **Authentication:** None required
- **Formats:** JSON, XML, HTML, PDF
- **Coverage:** 1st Parliament (1857) through 55th Parliament (current, 2022-present)

**API Endpoints (all tested and working 2026-03-28):**

| Endpoint | Method | Description | Response |
|----------|--------|-------------|----------|
| `/api/hansard/houses?api-version=1` | GET | List chambers | JSON array: lh (House of Assembly), uh (Legislative Council), eca/ecb (Estimates Committees) |
| `/api/hansard/parliaments?api-version=1` | GET | All parliaments & sessions | JSON array with dates, session numbers |
| `/api/hansard/events/{year}?api-version=1` | GET | All sitting days for a year | JSON with PDF/TOC URLs per day |
| `/api/hansard/events?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD` | GET | Sitting days in date range | JSON |
| `/api/hansard/{houseCode}/{date}/pdf?api-version=1` | GET | Full day PDF | Binary PDF |
| `/api/hansard/{houseCode}/{date}/toc?api-version=1` | GET | Table of contents with speakers | JSON with subject names, speaker details, links to each subject |
| `/api/hansard/{houseCode}/{date}/subject/{index}?contentType=text/json` | GET | Individual subject/speech content | JSON, XML, or HTML (set via contentType param) |
| `/api/hansard/indicies/{houseCode}/{parliamentNumber}/{sessionNumber}/members` | GET | Member sessional index | JSON |
| `/api/hansard/indicies/{houseCode}/{parliamentNumber}/{sessionNumber}/subjects` | GET | Subject sessional index | JSON |
| `/api/parliaments?api-version=1` | GET | Parliament metadata | JSON |
| `/api/chamber?api-version=1` | GET | Chamber list | JSON (paginated) |

**House codes:** `lh` = House of Assembly, `uh` = Legislative Council,
`eca` = Estimates Committee A, `ecb` = Estimates Committee B,
`ecaatq` / `ecbatq` = Estimates Committee Answers to Questions

**Test results (2026-03-28):**
- `/api/hansard/houses` -- returned 6 house objects
- `/api/hansard/parliaments` -- returned all 55 parliaments from 1857 to present
- `/api/hansard/events/2025` -- returned 106 sitting day events with PDF and TOC URLs
- `/api/hansard/lh/2025-11-27/toc` -- returned full table of contents with 88 subjects,
  speaker names, electorates, timestamps, and links to JSON/XML/HTML content

**Assessment:** EXCELLENT. Best state Hansard API in Australia. Fully functional,
unauthenticated, returns structured JSON with speaker metadata. Covers all the way
back to 1857. Should be the first state ingestor built for OPAX.

### 2.2 SA ICAC (Independent Commission Against Corruption)

- **URL:** https://www.icac.sa.gov.au/
- **Investigation Reports:** https://www.icac.sa.gov.au/investigations
- **All Reports:** https://www.icac.sa.gov.au/publications/all-reports
- **Annual Reports:** https://www.icac.sa.gov.au/publications/annual-reports
- **Open Data (data.sa.gov.au):**
  - Public Complaints: https://data.sa.gov.au/data/dataset/icac-reporting-data-public-complaints
    - CSV: `public-complaints.xlsx` (mislabeled as CSV, actually XLSX)
    - PDF: `public-complaints.pdf`
    - Coverage: FY 2022-23
    - License: CC BY 4.0
  - Workforce Statistics: https://data.sa.gov.au/data/dataset/icac-reporting-data-workforce-statistics
  - Consultants Disclosure: https://data.sa.gov.au/data/dataset/icac-reporting-data-consultants-disclosure
  - Annual Report Data: https://data.sa.gov.au/data/dataset/icac-annual-report-2023-24
  - Reporting under other acts: https://data.sa.gov.au/data/dataset/icac-and-opi-annual-report-data-reporting-required-by-any-other-act
- **API:** Data.SA uses CKAN API (https://data.sa.gov.au/data/api/3/)
- **Authentication:** None for public datasets

**Assessment:** MODERATE. Structured datasets on data.sa.gov.au (CKAN) with
CSV/XLSX downloads. Investigation reports are PDF/HTML on icac.sa.gov.au.
Limited scope -- mainly annual report statistics, not case-level data.

---

## 3. WESTERN AUSTRALIA

### 3.1 Parliament Hansard

- **Search:** https://www.parliament.wa.gov.au/hansard/search
- **Advanced Search:** https://www.parliament.wa.gov.au/hansard/hansard.nsf/NewAdvancedSearch
- **Calendar:** https://www.parliament.wa.gov.au/hansard/search/calendar
- **Daily Transcripts (LC):** https://www.parliament.wa.gov.au/hansard/hansard.nsf/screenDailyTranscriptsLC
- **Daily Transcripts (LA):** https://www.parliament.wa.gov.au/hansard/hansard.nsf/screenDailyTranscriptsLA
- **API:** None
- **Formats:** PDF (daily downloads), HTML (individual speeches via web)
- **Coverage:** 1870 to present (search); August 2000 to present (refined search)
- **Authentication:** None

**PDF Download URL Pattern:**
```
https://www.parliament.wa.gov.au/hansard/daily/{chamber}/{date}/pdf/download
```
Where `{chamber}` = `uh` (Legislative Council) or `lh` (Legislative Assembly),
and `{date}` = `YYYY-MM-DD`.

Also available per-extract:
```
https://www.parliament.wa.gov.au/hansard/daily/{chamber}/{date}/extract/{number}/download/pdf
```

**Assessment:** POOR-MODERATE. No API, but the PDF URL pattern is predictable and
could support automated downloading by date. Individual extracts are also addressable.
The advanced search covers back to 1870, but only as web results -- bulk access
requires systematic PDF downloading. The older Lotus Notes-based system
(hansard.nsf) may have additional scraping challenges.

### 3.2 WA CCC (Corruption and Crime Commission)

- **URL:** https://www.ccc.wa.gov.au/
- **Reports:** https://www.ccc.wa.gov.au/investigations/reports
- **Recent Reports:** https://www.ccc.wa.gov.au/recent-reports
- **Annual Reports:** https://www.ccc.wa.gov.au/media/annual-reports
- **Resources:** https://www.ccc.wa.gov.au/about-us/resources
- **API:** None
- **Formats:** PDF reports, web pages
- **Coverage:** Established 1 January 2004; reports from 2004-present
- **Authentication:** None
- **Open Data:** Not found on data.wa.gov.au

**Assessment:** POOR. PDF reports only. No structured data, no API, no open data
portal presence. Would require PDF scraping and manual cataloguing.

### 3.3 WA Electoral Commission (WAEC) - Donation Disclosures

- **URL:** https://www.elections.wa.gov.au/funding-and-disclosure
- **Online Disclosure System:** https://disclosures.elections.wa.gov.au/
- **Returns and Reports:** https://www.elections.wa.gov.au/returns-and-reports
- **API:** None identified
- **Formats:** Web search portal; returns viewable online. PDF for individual returns.
  Submissions accepted in Excel/CSV format, suggesting structured data exists internally.
- **Coverage:** Annual returns published yearly. 2024-25 annual returns published
  (21 parties, 8 associated entities, $15.1M total disclosed).
- **Disclosure threshold:** >$2,600 (2024-25); >$2,700 (2025-26)
- **Contact:** fad@waec.wa.gov.au

**Assessment:** POOR-MODERATE. Searchable web portal with individual return viewing.
No bulk CSV export confirmed. The fact that data is submitted in Excel/CSV suggests
bulk data could potentially be obtained via formal request.

---

## 4. STATE ELECTORAL COMMISSIONS - DONATION DATA

### 4.1 NSW Electoral Commission

- **URL:** https://elections.nsw.gov.au/electoral-funding
- **View Disclosures:** https://elections.nsw.gov.au/electoral-funding/disclosures/view-disclosures
- **Data.NSW:** https://data.nsw.gov.au/data/organization/nsw-electoral-commission
- **API:** None for donation data specifically
- **Formats:** Disclosures published as PDFs in portal. Some election transaction data
  on Data.NSW in CSV format (2015 election data only -- very limited).
- **Coverage:** Since 1 July 2008. Half-yearly disclosure periods.
  Latest: 1 Jul - 31 Dec 2025 (due 11 Feb 2026).
- **Authentication:** None for viewing; registration for detailed reports.
- **Data.NSW CSV datasets (limited):**
  - SGE 2015 Pre-poll Election transaction data (CSV, updated Jul 2016)
  - SGE 2015 Postal Vote Election transaction data (CSV, updated Jul 2016)
  - SGE 2015 iVote Election transaction data (CSV, updated Jul 2016)
  These are election logistics data, NOT donation/funding data.

**Assessment:** POOR for programmatic donation data access. Disclosures are published
as PDFs, not CSV. Data.NSW has minimal electoral commission content (only 2015
election transaction data). The view-disclosures portal would need scraping.
NSW is surprisingly bad given it has the best lobbyist register (CSV on data.nsw.gov.au).

### 4.2 Victorian Electoral Commission (VEC)

- **URL:** https://vec.vic.gov.au/disclosures
- **Portal:** https://disclosures.vec.vic.gov.au/public-donations/
- **Funding Register:** https://vec.vic.gov.au/candidates-and-parties/funding/funding-register
- **API:** None identified
- **Formats:** Web portal search. No confirmed CSV/bulk export.
- **Coverage:** 2018-present (FY 2020-21 through 2025-26)
- **Disclosure threshold:** $1,240+, within 21 days
- **Authentication:** None for public viewing

**Assessment:** MODERATE. Better than NSW in that the portal is searchable and
shows recent-year data. But still no confirmed bulk data export. Contact
disclosures@vec.vic.gov.au to ask about data extracts.

### 4.3 Queensland ECQ (Electoral Commission of Queensland)

- **URL:** https://www.ecq.qld.gov.au/donations-and-expenditure-disclosure
- **Published Returns:** https://www.ecq.qld.gov.au/donations-and-expenditure-disclosure/disclosure-of-political-donations-and-electoral-expenditure/published-disclosure-returns
- **Electronic Disclosure System (EDS):** https://disclosures.ecq.qld.gov.au/
- **EDS Map View:** https://disclosures.ecq.qld.gov.au/Map
- **Open Data Portal:** https://www.data.qld.gov.au/dataset/electronic-disclosure-system-state-and-local-election-funding-and-donations
- **Download Help:** https://helpcentre.disclosures.ecq.qld.gov.au/hc/en-us/articles/115002782947-Downloading-Data
- **API:** None dedicated, but CKAN API via data.qld.gov.au
- **Formats:** CSV and PDF downloads available from EDS. Interactive map visualisation.
- **Coverage:** Ongoing; donations >$1,000 must be disclosed.
  Returns published as submitted.
- **Authentication:** None for public data
- **Note:** data.qld.gov.au dataset page last updated Jan 2019; EDS itself is more current.

**Assessment:** GOOD. Best state electoral commission for data access. The EDS supports
CSV download of reports. The data.qld.gov.au dataset provides CKAN API access.
Interactive maps add visualisation. CSV export is confirmed in the help documentation.
Priority target for OPAX ingestor.

---

## 5. SUMMARY AND PRIORITY RANKING

### Data Access Quality by Source

| Source | API | Structured Data | Bulk Download | Overall |
|--------|-----|----------------|---------------|---------|
| SA Hansard | REST (JSON/XML) | Yes | Yes (by date) | EXCELLENT |
| QLD ECQ Donations | CKAN | CSV | Yes | GOOD |
| IBAC Dashboard | None (interactive) | Partial | No | MODERATE |
| VEC Donations | None | Web portal | No (unconfirmed) | MODERATE |
| SA ICAC (data.sa) | CKAN | CSV/XLSX | Yes | MODERATE |
| WA Hansard | None | PDF | Predictable URLs | POOR-MODERATE |
| WA Electoral | None | Web portal | No | POOR-MODERATE |
| VIC Hansard | None | PDF only | No | POOR |
| VIC Divisions | None | PDF only | No | POOR |
| NSW Donations | None | PDF only | No | POOR |
| WA CCC | None | PDF only | No | POOR |

### Recommended Ingestor Build Order

1. **SA Hansard API** -- Fully working REST API, no auth, JSON/XML, 1857-present.
   Build this first as a model for other state ingestors.

2. **QLD ECQ Donations** -- CSV downloads confirmed, CKAN API on data.qld.gov.au.
   Pairs well with existing QLD Parliament Open API work.

3. **IBAC Allegations Dashboard** -- Unique corruption data. Investigate if underlying
   data can be extracted from dashboard or obtained via DataVic CKAN API.

4. **VIC Hansard Scraper** -- PDF scraping pipeline. High value but high effort.
   Consider if OpenAustralia covers any VIC state data first.

5. **SA ICAC Data** -- Small CSV datasets on data.sa.gov.au, low effort to ingest.

6. **WA Hansard PDFs** -- Predictable URL patterns make bulk download feasible.

7. **VEC/NSW/WAEC Donations** -- Web portal scraping needed for all three.
   Low priority until scraping infrastructure is built.

8. **WA CCC Reports** -- PDF-only, lowest priority.

---

## 6. KEY URLS QUICK REFERENCE

### APIs (Working)
```
SA Hansard:   https://hansardsearch.parliament.sa.gov.au/api/
SA Swagger:   https://hansardsearch.parliament.sa.gov.au/docs/api/v1/swagger.json
Data.SA CKAN: https://data.sa.gov.au/data/api/3/
DataVic CKAN: https://discover.data.vic.gov.au/
Data.QLD CKAN: https://www.data.qld.gov.au/
```

### Donation Portals
```
VEC:  https://disclosures.vec.vic.gov.au/public-donations/
NSW:  https://elections.nsw.gov.au/electoral-funding/disclosures/view-disclosures
QLD:  https://disclosures.ecq.qld.gov.au/
WAEC: https://disclosures.elections.wa.gov.au/
```

### Integrity Bodies
```
IBAC (VIC):  https://www.ibac.vic.gov.au/public-sector-allegations-dashboard
SA ICAC:     https://www.icac.sa.gov.au/
WA CCC:      https://www.ccc.wa.gov.au/investigations/reports
```

### Hansard Search
```
VIC: https://hansard.parliament.vic.gov.au/
SA:  https://hansardsearch.parliament.sa.gov.au/
WA:  https://www.parliament.wa.gov.au/hansard/search
```
