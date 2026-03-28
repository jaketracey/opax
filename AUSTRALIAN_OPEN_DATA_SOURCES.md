# Australian Political Transparency Platform: Open Data Sources

Comprehensive research into all available open data sources for building a political transparency platform that exposes where words and actions diverge, where money influences decisions, and where governance blind spots exist.

---

## 1. PLANNING & DEVELOPMENT

### 1.1 PlanningAlerts.org.au (OpenAustralia Foundation)

- **URL:** https://www.planningalerts.org.au
- **API Docs:** https://www.planningalerts.org.au/api/developer
- **GitHub:** https://github.com/openaustralia/planningalerts
- **API Base URL:** `https://api.planningalerts.org.au/`
- **Auth:** API key required (register for account)
- **Formats:** JSON, GeoJSON, GeoRSS (change file extension: `.json`, `.geojson`, `.rss`)
- **Rate Limits:**
  - Community Plan (free): 100,000 applications/day via 1,000 requests
  - Standard Plan ($3,850 AUD/month): 500,000 applications/day via 5,000 requests
  - Trial: 1 request/day for 14 days
  - Exceeding limits returns HTTP 429 with `retry-after` header

**Endpoints:**
| Endpoint | Parameters |
|----------|------------|
| `/applications.json` (by location) | `key`, `lat`, `lng`, `radius` (metres) |
| `/applications.json` (by area) | `key`, `bottom_left_lat`, `bottom_left_lng`, `top_right_lat`, `top_right_lng` |
| `/authorities/{name}/applications.json` | `key`, authority short name |
| `/applications.json` (by postcode) | `key`, `postcode` |
| `/applications.json` (by suburb) | `key`, `suburb`, `state`, `postcode` |
| `/applications.json` (bulk all) | `key`, `since_id` |
| `/applications.json` (bulk by date) | `key`, `date_scraped` (ISO 8601) |

**Pagination:** `page` (default 1), `count` (default/max 100). Bulk API returns up to 1,000 records (Premium only).

**Coverage:** ~86-89% of Australia's population across 195-212 planning authorities. Data updated daily.

**Privacy Note:** API does not return personal information, user comments, or names associated with applications.

**Transparency Value:** Link development approvals to geographic areas, cross-reference with developer donations to local councils and state parties, identify rezoning patterns near donor-connected properties.

### 1.2 NSW Planning Portal API

- **URL:** https://www.planningportal.nsw.gov.au/API
- **Details:** NSW-specific planning application data with API access
- **Transparency Value:** State-level planning approval data for Australia's most populous state.

---

## 2. PARLIAMENTARY DATA

### 2.1 OpenAustralia API (Federal Hansard)

- **URL:** https://www.openaustralia.org.au/api/
- **API Base URL:** `http://www.openaustralia.org.au/api/{function}?key={key}&output={output}`
- **Auth:** API key (free for low-volume non-commercial use)
- **Formats:** XML, JavaScript/JSON, PHP serialized, RABX
- **License:** CC 3.0 Attribution-NonCommercial-NoDerivs (parliamentary material)

**Endpoints:**
| Endpoint | Purpose |
|----------|---------|
| `getDivisions` | Electoral divisions list |
| `getRepresentative` | House member details |
| `getRepresentatives` | House members list |
| `getSenator` | Senate member details |
| `getSenators` | All senators list |
| `getDebates` | House/Senate debates |
| `getHansard` | Combined parliamentary data |
| `getComments` | User comments |

**Coverage:** All Hansard for House of Representatives and Senate from 2006 onwards (excluding written questions, petitions, and divisions).

**Transparency Value:** Search what MPs said on any topic, track consistency of statements over time, compare rhetoric to voting records.

### 2.2 They Vote For You (Voting Records)

- **URL:** https://theyvoteforyou.org.au/
- **API Docs:** https://theyvoteforyou.org.au/help/data
- **API Base URL:** REST API returning JSON
- **Auth:** API key (auto-generated on signup)

**Key Endpoints:**
| Endpoint | Purpose | Parameters |
|----------|---------|------------|
| `/api/v1/people.json` | Current MPs | name, electorate, party, house |
| `/api/v1/divisions.json` | Formal votes/divisions | `start_date`, `end_date`, `house` |
| `/api/v1/policies` | Policy positions | Groups of votes on issues |

**Max Results:** 100 per request.

**Transparency Value:** CRITICAL for the platform. Shows exactly how every MP voted on every division. Cross-reference votes with donation sources to expose where money may influence decisions. Policy groupings show stance on issues vs. public statements.

### 2.3 ParlInfo (Parliament of Australia)

- **URL:** https://parlinfo.aph.gov.au/
- **Access:** Web search interface; no dedicated bulk API
- **Coverage:** Hansard, committee reports, bills, Senate Estimates transcripts (back to 1988)
- **Workaround:** Use GLAM Workbench for bulk harvesting (see 2.5)

**Transparency Value:** Access Senate Estimates transcripts where ministers and officials are questioned on spending and decisions. Search for specific topics across all parliamentary records.

### 2.4 Parliamentary Services Public API

- **URL:** https://parliament-api-docs.readthedocs.io/
- **Coverage:** Documented endpoints for NSW and South Australia parliaments
- **Access:** REST API

**Transparency Value:** Programmatic access to state-level parliamentary data.

### 2.5 GLAM Workbench (Hansard Bulk Data)

- **URL:** https://glam-workbench.github.io/hansard/
- **GitHub:** https://github.com/GLAM-Workbench/australian-commonwealth-hansard
- **Format:** XML files, Jupyter notebooks for harvesting
- **Coverage:** Both houses, 1901-1980 and 1998-2005 (gap 1981-1997)
- **Creator:** Tim Sherratt

**Transparency Value:** Large-scale text analysis of parliamentary debates. NLP/sentiment analysis on historical political speech. Track how political language evolves.

### 2.6 Senate Estimates Transcripts

- **URL:** https://www.aph.gov.au/Parliamentary_Business/Hansard/Estimates_Transcript_Schedule
- **URL:** https://www.aph.gov.au/Parliamentary_Business/Senate_estimates
- **Format:** HTML/PDF transcripts
- **Coverage:** Estimates hearings; daily summaries available

**Transparency Value:** Where government spending is scrutinised. Extract commitments made by officials, compare to actual outcomes.

### 2.7 Register of Members' Interests

- **URL:** https://www.aph.gov.au/Senators_and_Members/Members/Register
- **Format:** Published statements (PDF)
- **Coverage:** Current (48th) Parliament and previous parliaments

**Transparency Value:** CRITICAL. Shows MPs' financial interests, property holdings, shareholdings, directorships. Cross-reference with voting records and policy positions to identify conflicts of interest.

---

## 3. STATE PARLIAMENTS

### 3.1 NSW Parliament Hansard API

- **URL:** https://www.parliament.nsw.gov.au/hansard/Pages/Hansard-API.aspx
- **Also on Data.NSW:** https://data.nsw.gov.au/data/dataset/hansard-api
- **Coverage:** September 1991 to present
- **Format:** XML, PDF
- **Endpoints:** Hansards by year, by date, by speaker, by bill, table of contents, daily fragments

**Transparency Value:** Full state parliamentary record for NSW, searchable by speaker or bill.

### 3.2 Queensland Parliament Open API

- **URL:** https://www.parliament.qld.gov.au/Work-of-the-Assembly/Open-Data
- **API Base URL:** `https://data.parliament.qld.gov.au/api`
- **Versioning:** `/api/{endpoint}?api-version={version}`
- **License:** CC BY-ND 4.0
- **Datasets:** Members, Petitions, Divisions, Broadcasting

**Transparency Value:** QLD parliamentary voting and membership data. Cross-reference with QLD donation and lobbyist data.

### 3.3 South Australia Parliament API

- **URL:** https://parliament-api-docs.readthedocs.io/en/latest/south-australia/
- **Format:** OpenAPI specification available

### 3.4 Victoria Parliament

- **Notes:** No dedicated public API identified. Hansard available via parliament.vic.gov.au website.

---

## 4. ELECTORAL & DONATION DATA

### 4.1 AEC Transparency Register (Federal Donations)

- **URL:** https://transparency.aec.gov.au/
- **Contact:** fad@aec.gov.au | 02 6271 4552
- **Format:** Downloadable data (CSV); web search with filters
- **Bulk Download:** "Download All Disclosure Data" option available

**Data Available:**
| Category | Details |
|----------|---------|
| Register of Entities | Political parties, significant third parties, associated entities, third parties |
| Annual Returns | Published first business day in February; donations, expenditure, MP data |
| Election Returns | Published 24 weeks after polling day; candidate/Senate group data |
| Referendum Returns | Published 24 weeks after voting day |
| Annual Donor Returns | Individual donor records |

**Transparency Value:** FOUNDATIONAL. Shows who donates to whom. Cross-reference donors with: company directors (ASIC), planning applicants (PlanningAlerts), government contracts (AusTender), lobbyist registers. This is how you trace money to policy.

### 4.2 AEC Election Results (Booth-Level)

- **URL:** https://results.aec.gov.au/ (Tally Room archive)
- **Downloads:** https://www.aec.gov.au/Elections/federal_elections/2022/downloads.htm
- **Historical:** https://www.aec.gov.au/elections/federal_elections/Stats_CDRom.htm (digital form since 1993)
- **Format:** CSV downloads; XML via Media Feed (EML schema)
- **Media Feed:** Real-time results via FTP (register: mediafeed@aec.gov.au)

**Data Granularity:** National, state, divisional, and polling place (booth) level for House and Senate.

**Transparency Value:** Booth-level results reveal hyperlocal voting patterns. Correlate with demographics (ABS Census), planning applications, and socioeconomic data to understand what drives voter behaviour.

### 4.3 AEC Redistribution & GIS Data

- **URL:** https://www.aec.gov.au/electorates/gis/gis_datadownload.htm
- **Formats:** TAB, MapInfo MID/MIF, ESRI Shapefiles
- **Terms:** Must agree to data licence before download
- **Coverage:** Current and historical boundary data per state

**Transparency Value:** Map electoral boundaries geospatially. Overlay with planning data, demographic data, donation patterns. Analyse gerrymandering effects.

### 4.4 AEC Enrolment Statistics

- **URL:** https://www.aec.gov.au/enrolling_to_vote/enrolment_stats/
- **Coverage:** Monthly by state/division; quarterly by division/age/gender
- **Format:** Published tables on website (downloadable)
- **Informal Voting:** Published per electorate (e.g., ~5.5% nationally in 2025)

**Transparency Value:** Track democratic participation. Identify electorates with low enrolment or high informal voting. Correlate with socioeconomic factors.

### 4.5 NSW Electoral Commission Disclosures

- **URL:** https://elections.nsw.gov.au/funding-and-disclosure/disclosures/view-disclosures
- **Coverage:** Since 1 July 2008
- **Access:** Search and view online

**Transparency Value:** NSW state-level donations data. Link to NSW planning decisions and state government contracts.

### 4.6 Victorian Electoral Commission Disclosures

- **URL:** https://vec.vic.gov.au/disclosures
- **Coverage:** From 2018 onwards (legislation enacted then)
- **Access:** No account needed to view public donation information

### 4.7 Queensland Electoral Commission

- **URL:** https://www.ecq.qld.gov.au/
- **Notes:** Third parties spending >$1,000 must provide returns; donors of >$1,000 must submit returns

---

## 5. GOVERNMENT SPENDING & CONTRACTS

### 5.1 AusTender (Federal Contracts) - OCDS API

- **URL:** https://www.tenders.gov.au/
- **API Base URL:** `https://api.tenders.gov.au/ocds/`
- **API Docs (Swagger):** https://app.swaggerhub.com/apis/austender/ocds-api/1.1#/
- **GitHub:** https://github.com/austender/austender-ocds-api
- **Auth:** None required
- **Format:** JSON (OCDS - Open Contracting Data Standard compliant)
- **Coverage:** Contracts from 1 January 2013 onwards; 450,000+ contracts

**Endpoints:**
| Endpoint | Purpose |
|----------|---------|
| `findById/{contractID}` | Search by Contract Notice ID |
| `findByDates/contractPublished/{start}/{end}` | By published date |
| `findByDates/contractStart/{start}/{end}` | By start date |
| `findByDates/contractEnd/{start}/{end}` | By end date |
| `findByDates/contractLastModified/{start}/{end}` | By modified date |

**Date Format:** ISO 8601 (`yyyy-mm-ddThh:mi:ssZ`)

**Thresholds:** NCEs report contracts >= $10,000; prescribed CCEs report >= $400,000.

**Transparency Value:** CRITICAL. Cross-reference contract recipients with political donors (AEC), company directors (ASIC), and lobbyist clients to expose potential pay-to-play patterns.

### 5.2 AusTender Reports

- **URL:** https://www.tenders.gov.au/reports/list
- **Format:** Web reports, downloadable
- **Coverage:** Statistical reports on procurement

### 5.3 GrantConnect (Federal Grants)

- **URL:** https://www.grants.gov.au/
- **Help:** https://help.grants.gov.au/
- **Auth:** Registration required for downloads
- **Contact:** GrantConnect@Finance.gov.au
- **API:** No public bulk API identified; web interface with search

**Data:** Grant opportunities, awards (must be published within 21 days of agreement), agency-level reporting.

**Transparency Value:** Track where taxpayer money flows as grants. Cross-reference grant recipients with donors and lobbyists. Identify grants to marginal electorates (pork-barrelling detection).

### 5.4 Federal Budget Data (data.gov.au)

- **URL:** https://data.gov.au/ (search for "budget")
- **Format:** CSV, XLSX via data.gov.au
- **Coverage:** Federal budget papers and underlying data

**Transparency Value:** Track budget promises vs. actual expenditure. Compare budget allocations across electorates.

---

## 6. COMPANY & BUSINESS DATA

### 6.1 ASIC Company Dataset (via data.gov.au)

- **URL:** https://data.gov.au/data/dataset/asic-companies
- **Direct ASIC page:** https://www.asic.gov.au/online-services/search-asic-registers/data-gov-au/
- **Format:** CSV (ZIP downloads); API via data.gov.au CKAN API
- **Update Frequency:** Weekly (every Tuesday)
- **Note:** XLSX no longer supported via CKAN API since Dec 2021

**Fields:** Company Name, ACN, Type, Class, Sub Class, Status, Date of Registration, Date of Deregistration (from March 2025), Previous State Registration, ABN, Current Name, Modified flag.

**Related Datasets:**
- ASIC Business Names: https://data.gov.au/data/dataset/asic-business-names
- ASIC Registered Auditors: https://data.gov.au/data/dataset/asic-registered-auditor
- ASIC SMSF Auditors: https://data.gov.au/data/dataset/asic-smsf

**Transparency Value:** CRITICAL for entity resolution. Link company directors who donate to parties with companies that receive government contracts. Trace corporate structures behind political donors.

### 6.2 ABN Lookup Web Services

- **URL:** https://abr.business.gov.au/Tools/WebServices
- **User Guide:** https://abr.business.gov.au/Documentation/Default
- **Methods:** https://abr.business.gov.au/Documentation/WebServiceMethods
- **JSON endpoint:** https://abr.business.gov.au/json/
- **Auth:** Free; requires GUID (register at https://abr.business.gov.au/Documentation/WebServiceRegistration)
- **Protocols:** SOAP, HTTP GET/POST, limited JSON
- **Sample Code:** Available in VB, C#, Java, PHP, Python, MS Access, Excel

**Transparency Value:** Verify business entities. Link ABNs across datasets (donations, contracts, planning applications). Identify shell companies or related entities.

### 6.3 ASIC Connect (Real-Time Search)

- **URL:** https://asicconnect.asic.gov.au/public/
- **Note:** Real-time data (more current than weekly data.gov.au dumps)
- **Access:** Web search interface

---

## 7. LOBBYIST REGISTERS

### 7.1 Federal Register of Lobbyists

- **URL:** https://lobbyists.ag.gov.au/register
- **Administrator:** Attorney-General's Department
- **Access:** Publicly searchable web register
- **API:** No public API identified
- **Limitation:** Only covers third-party lobbyists (~20% of all lobbyists); in-house lobbyists excluded

**Data Available:** Registered lobbyist organisations, individual lobbyists, their clients.

**Transparency Value:** Cross-reference lobbyist clients with government contract winners and political donors. Limited by scope (only third-party lobbyists).

### 7.2 NSW Register of Third-Party Lobbyists

- **URL:** https://elections.nsw.gov.au/funding-and-disclosure/public-register-and-lists/register-of-third-party-lobbyists
- **Open Data:** https://data.nsw.gov.au/data/dataset/register-of-third-party-lobbyists
- **Fields:** Lobbyist names, business contacts, individuals engaged in lobbying, management/financial interest holders, client names, client ABNs

### 7.3 Victoria Register of Lobbyists

- **URL:** https://www.lobbyists.vic.gov.au/
- **Coverage:** Active lobbyists and government affairs directors
- **Note:** Victoria requires both consulting and in-house lobbyist registration

### 7.4 Queensland Lobbyist Register

- **URL:** https://lobbyists.integrity.qld.gov.au/
- **Key Feature:** Lobbyists must report contact with government/opposition representatives MONTHLY
- **Contact Log:** Downloadable log of meetings including ministers, senior advisors, and bureaucrats
- **Scope:** Goes far beyond ministerial diaries

**Transparency Value:** Queensland's is the GOLD STANDARD. Downloadable contact logs showing who met whom and about what. Cross-reference with subsequent policy decisions and contract awards.

### 7.5 Queensland Ministerial Diaries

- **URL:** https://www.premiers.qld.gov.au/publications/categories/policies-and-codes/handbooks/ministerial-handbook/ethics/ministerialdiaries.aspx
- **Requirement:** Must include attendee details and subject matter for registered lobbyist meetings
- **Also Published In:** ACT, NSW, Victoria (Commonwealth does NOT require ministerial diary publication)

---

## 8. FREEDOM OF INFORMATION

### 8.1 Right To Know (FOI Platform)

- **URL:** https://www.righttoknow.org.au/
- **GitHub:** https://github.com/openaustralia/righttoknow
- **Platform:** Alaveteli (open source)
- **Coverage:** 9 jurisdictions (Federal + all states/territories)
- **Operator:** OpenAustralia Foundation

**Features:** Submit FOI requests, browse all published requests and responses, archived permanently.

**Transparency Value:** Searchable archive of all FOI requests and government responses. Mining this data reveals what information governments resist releasing and what patterns emerge in disclosure.

### 8.2 Federal Agency Disclosure Logs

Every Australian Government agency must publish FOI response details under Section 11C(3) of the FOI Act 1982 (since 1 May 2011).

**Key Agency Logs:**
| Agency | URL |
|--------|-----|
| Attorney-General's | https://www.ag.gov.au/rights-and-protections/freedom-information/freedom-information-disclosure-log |
| DFAT | https://www.dfat.gov.au/about-us/corporate/freedom-of-information/foi-disclosure-log |
| Home Affairs | https://www.homeaffairs.gov.au/access-and-accountability/freedom-of-information/disclosure-logs |
| Treasury | https://treasury.gov.au/the-department/accountability-reporting/foi |
| Federal Court | https://www.fedcourt.gov.au/disclosurelog |

**Transparency Value:** Aggregate FOI logs across agencies to identify patterns in what information is being requested and released.

---

## 9. CORRUPTION COMMISSIONS & INTEGRITY

### 9.1 National Anti-Corruption Commission (NACC)

- **URL:** https://www.nacc.gov.au/
- **Commenced:** 1 July 2023
- **Data:** Weekly "Fast Facts" on operational activity; Annual Reports
- **Stats (Oct 2025):** 6,000+ referrals received, 32 preliminary + 38 corruption investigations, 11 convictions
- **Annual Report 2024-25:** Published and available on website (PDF)

**Transparency Value:** Track federal corruption investigations. Monitor referral volumes and outcomes over time.

### 9.2 NSW ICAC

- **URL:** https://www.icac.nsw.gov.au/
- **Reports:** https://www.icac.nsw.gov.au/investigations/investigation-reports
- **Format:** Investigation reports published on website (PDF/HTML)
- **API:** None identified

### 9.3 Victoria IBAC

- **URL:** https://www.ibac.vic.gov.au/
- **Key Feature:** Public corruption and misconduct allegations dashboard (interactive, searchable)
- **Financial Data:** Available via Victorian Government Data Directory (https://discover.data.vic.gov.au/)
- **Coverage:** Annual reports 2015-16 through present

**Transparency Value:** IBAC's public dashboard is uniquely useful - allows searching corruption allegations across Victoria's public sector.

### 9.4 Queensland CCC

- **URL:** https://www.ccc.qld.gov.au/
- **Reports:** Investigation reports published on website

### 9.5 Other State/Territory Commissions

- **WA CCC:** https://www.ccc.wa.gov.au/
- **SA ICAC:** https://www.icac.sa.gov.au/
- **Tas Integrity Commission:** https://www.integrity.tas.gov.au/
- **ACT Integrity Commission:** https://www.integrity.act.gov.au/
- **NT ICAC:** https://icac.nt.gov.au/

---

## 10. LEGAL & COURT DECISIONS

### 10.1 AustLII (Australasian Legal Information Institute)

- **URL:** https://www.austlii.edu.au/
- **All Databases:** https://www.austlii.edu.au/databases.html
- **Access:** Free, web-based
- **Coverage:** Full-text databases of most Australian decisions and legislation (federal + state/territory)
- **API:** No public REST API; web scraping may be needed

**Transparency Value:** Access court decisions involving government entities, corruption cases, judicial review of administrative decisions.

### 10.2 BarNet JADE

- **URL:** https://jade.io/
- **Coverage:** 240,000+ Australian decisions and legislation
- **API:** Direct URL access for content: `https://jade.io/content/ext/mnc/{year}/{court}/{number}`
- **Features:** Free; daily email alerts; tagging/highlighting/annotating
- **Format:** HTML

**Transparency Value:** Track legal challenges to government decisions. Monitor outcomes of corruption-related cases.

### 10.3 Federal Court

- **URL:** https://www.fedcourt.gov.au/digital-law-library/judgments/latest
- **Coverage:** Judgments from February 1977 (via AustLII); latest week on court website
- **Publishing:** Within 24 hours of availability (1 hour for high-profile cases)

### 10.4 Administrative Review Tribunal (formerly AAT)

- **URL:** https://www.art.gov.au/
- **eCase Search:** https://online.aat.gov.au/ecasearch
- **Coverage:** Applications from 18 March 2013 onwards
- **Published Decisions:** On AustLII (since 1976)
- **Jurisdictions Covered:** FOI, General, NDIS, Small Business Taxation, Taxation & Commercial, Veterans' Appeals
- **Excluded:** Migration & Protection, Security, Social Services & Child Support

**Transparency Value:** AAT/ART decisions reveal government overreach and bad decision-making patterns. FOI jurisdiction decisions show what agencies resist disclosing.

### 10.5 Royal Commission Reports

- **URL:** https://www.royalcommission.gov.au/ (commissions from post-Jan 2015)
- **National Archives:** Permanent records transferred to National Archives of Australia
- **Parliament List:** https://www.aph.gov.au/About_Parliament/Parliamentary_Departments/Parliamentary_Library/Browse_by_Topic/law/royalcommissions (all since 1902)
- **Also:** AustLII, Internet Archive for historical reports

---

## 11. ECONOMIC & STATISTICAL DATA

### 11.1 ABS Data API (SDMX)

- **URL:** https://www.abs.gov.au/about/data-services/application-programming-interfaces-apis
- **API Base URL:** `https://data.api.abs.gov.au/rest/data/` (changed Nov 2024)
- **Standard:** SDMX 2.1 compliant
- **Formats:** XML (default), JSON, CSV
- **OpenAPI spec:** https://api.gov.au/assets/APIs/abs/DataAPI.openapi.html
- **Auth:** None required
- **Data Explorer (human-readable):** Available on ABS website

**Available Data:**
- Census data (demographics, socioeconomics per geographic area)
- SEIFA indexes (socioeconomic advantage/disadvantage by area)
- Labour force statistics
- CPI, economic indicators
- Population statistics

### 11.2 ABS Indicator API

- **URL:** https://www.abs.gov.au/about/data-services/application-programming-interfaces-apis/indicator-api
- **Purpose:** Headline economic statistics
- **Data:** Key economic indicators, published after embargo lift (11:30am Canberra time)

**Transparency Value:** Overlay economic and demographic data with electoral, spending, and planning data. SEIFA indexes per electorate reveal whether government spending targets need or political advantage.

### 11.3 Reserve Bank of Australia (RBA)

- **URL:** https://www.rba.gov.au/statistics/
- **Statistical Tables:** https://www.rba.gov.au/statistics/tables/
- **Historical Data:** https://www.rba.gov.au/statistics/historical-data.html
- **Programmatic Access:**
  - No official REST API
  - R package `readrba`: Download RBA data in tidy data frames
  - Python: `raustats` package
  - DBnomics: https://db.nomics.world/RBA
  - Third-party Exchange Rate API: https://www.exchangeratesapi.com.au/

**Data:** Interest rates, exchange rates, money/credit statistics, assets/liabilities, economic forecasts.

**Transparency Value:** Economic context for political decisions. Track whether policy announcements align with economic reality.

### 11.4 Bureau of Meteorology (BOM)

- **URL:** https://www.bom.gov.au/resources/data-services
- **Data Feeds:** https://www.bom.gov.au/catalogue/data-feeds.shtml
- **New API:** `api.weather.bom.gov.au` (reverse-engineered; no official documentation yet)
- **Space Weather API:** https://sws-data.sws.bom.gov.au/ (requires API key)
- **Third-Party Access:**
  - Python: `weather-au` package (PyPI)
  - R: `weatherOz` package (rOpenSci)
  - Open-Meteo BOM API: https://open-meteo.com/en/docs/bom-api
- **Format:** Real-time products via web and anonymous FTP (free, non-commercial)

**Transparency Value:** Climate and disaster data for context around emergency spending, infrastructure decisions, and environmental policy.

### 11.5 AIHW (Australian Institute of Health and Welfare)

- **URL:** https://www.aihw.gov.au/reports-data
- **MyHospitals API:** https://www.aihw.gov.au/reports-data/myhospitals/content/api
  - Open and free, no authentication required
  - Returns JSON (default) or CSV
- **Data Collections:** 150+ datasets (housing, homelessness, health, disability, cancer, hospitals, drugs, mortality)
- **Download Formats:** SAS data cubes, Excel spreadsheets

**Transparency Value:** Health outcomes data per region. Compare health spending decisions with actual health outcomes. Identify areas where rhetoric ("investing in health") diverges from reality.

---

## 12. MEDIA & PUBLIC DISCOURSE

### 12.1 ABC News RSS Feeds

- **Main Feed:** https://www.abc.net.au/news/feed/2942460/rss.xml
- **Topic Feeds:** Use ContentID from website meta data (e.g., `https://www.abc.net.au/news/feed/{ContentID}/rss.xml`)
- **Categories:** Weather, Cricket, Health, World News, Emergency, Science, Lifestyle, etc.
- **No official REST API;** RSS is primary mechanism
- **Tip:** Search HTML source for `coremedia://collection/` or `coremedia://dynamiccollection/` IDs to find topic-specific feeds

### 12.2 Google Trends API (Alpha)

- **URL:** https://developers.google.com/search/apis/trends
- **Launched:** July 2025 (alpha)
- **Features:** Compare dozens of terms (vs. 5 in web UI); filter by country/region/metro/city
- **Access:** First official sanctioned API from Google for trend data

**Transparency Value:** Track public interest in political issues, scandals, policy topics. Correlate search trends with political events and media coverage.

### 12.3 Reddit Data

- **Subreddits:** r/australia, r/AustralianPolitics
- **Official API:** Reddit API (requires registration; rate-limited)
- **Third-Party:** Apify Reddit scraper, Pushshift (historical)
- **Data:** Posts, comments, vote counts, timestamps

**Transparency Value:** Gauge public sentiment on political issues. Track how political narratives spread.

---

## 13. OPEN DATA PORTALS

### 13.1 data.gov.au (Federal)

- **URL:** https://data.gov.au/
- **API:** CKAN-based API
- **Coverage:** 30,000+ public datasets from federal, state, and local government
- **Key datasets for transparency:**
  - ASIC company data (weekly)
  - AusTender contract data
  - AEC electoral data
  - Various agency performance data

### 13.2 Data.NSW

- **URL:** https://data.nsw.gov.au/
- **Key datasets:** Lobbyist register, Hansard API, planning data

### 13.3 Data.QLD

- **URL:** https://www.data.qld.gov.au/
- **Key datasets:** Lobbyist contact logs, ministerial diaries, various government data

### 13.4 Data.VIC

- **URL:** https://discover.data.vic.gov.au/
- **Key datasets:** IBAC data, government performance data

---

## 14. CROSS-REFERENCING STRATEGY

The real power of this platform comes from LINKING these datasets. Here are the key cross-reference chains:

### Money Trail: Donations -> Decisions -> Contracts
```
AEC Donations Data (who donates)
    -> ASIC Company Data (who are the donors' companies)
    -> ABN Lookup (verify entities)
    -> AusTender Contracts (did donors' companies get contracts?)
    -> GrantConnect (did donors receive grants?)
    -> PlanningAlerts (did donors get planning approvals?)
    -> They Vote For You (did recipients vote in donors' interest?)
```

### Lobbying -> Policy Pipeline
```
Lobbyist Registers (who lobbied whom)
    -> QLD Contact Logs (specific meetings)
    -> Ministerial Diaries (QLD/NSW/VIC/ACT)
    -> Hansard (subsequent policy announcements)
    -> They Vote For You (subsequent votes)
    -> AusTender/GrantConnect (subsequent contracts/grants)
```

### Rhetoric vs. Reality
```
OpenAustralia Hansard (what MPs said)
    -> They Vote For You (how they actually voted)
    -> AEC Donations (who funds them)
    -> Register of Interests (personal financial interests)
    -> ABS Data (did promises translate to outcomes?)
    -> AIHW Data (health outcomes vs. health promises)
```

### Planning Corruption Detection
```
PlanningAlerts (development applications)
    -> ASIC Company Data (who owns the developer)
    -> AEC Donations (did developer donate to council/state party?)
    -> Lobbyist Registers (did developer lobby?)
    -> FOI Logs (what was requested about the development?)
    -> Court Decisions (any legal challenges?)
```

### Democratic Health Index
```
AEC Enrolment Stats (participation rates)
    -> AEC Informal Voting (disengagement indicator)
    -> ABS Census/SEIFA (socioeconomic context)
    -> AEC Booth Results (hyperlocal voting patterns)
    -> AEC GIS Boundaries (geographic mapping)
    -> BOM/Environmental Data (environmental justice overlay)
```

---

## 15. TECHNICAL NOTES

### Entity Resolution Challenge
The biggest technical challenge is linking entities across datasets. Key identifiers:
- **ABN** (Australian Business Number): Links ASIC, ABN Lookup, AusTender, some donation records
- **ACN** (Australian Company Number): Links ASIC company records
- **Person Names**: Fuzzy matching needed across donations, lobbyist registers, company directors, MPs
- **Geographic Coordinates**: Links PlanningAlerts, AEC booth data, ABS Census data

### Recommended Data Pipeline
1. **Ingest Layer:** Scheduled scrapers/API callers for each data source
2. **Entity Resolution Layer:** Fuzzy matching + ABN/ACN linking to build a unified entity graph
3. **Storage:** Graph database (Neo4j) for relationship mapping + PostgreSQL/PostGIS for geospatial
4. **Analysis Layer:** Cross-reference engine that identifies suspicious patterns
5. **Presentation Layer:** Public-facing dashboards with drill-down capability

### Data Freshness
| Source | Update Frequency |
|--------|-----------------|
| PlanningAlerts | Daily |
| ASIC Company Data | Weekly (Tuesdays) |
| AEC Donations | Annually (February) + post-election |
| AusTender | Continuous |
| ABS Data API | Per release schedule |
| Lobbyist Registers | Varies (QLD monthly) |
| Hansard | Per sitting day |
| They Vote For You | Per sitting day |

---

## 16. SUMMARY TABLE

| # | Source | API | Format | Free | Key Value |
|---|--------|-----|--------|------|-----------|
| 1 | PlanningAlerts | REST | JSON/GeoJSON/RSS | Freemium | Planning approvals geographic data |
| 2 | OpenAustralia | REST | XML/JSON | Yes | Federal Hansard searchable |
| 3 | They Vote For You | REST | JSON | Yes | MP voting records |
| 4 | AEC Transparency | Download | CSV | Yes | Political donations |
| 5 | AEC Results | Download/FTP | CSV/XML | Yes | Booth-level election results |
| 6 | AEC GIS | Download | Shapefile/TAB | Yes | Electoral boundaries |
| 7 | AusTender OCDS | REST | JSON | Yes | Government contracts |
| 8 | GrantConnect | Web | HTML | Yes* | Government grants |
| 9 | ASIC Companies | CKAN API | CSV | Yes | Company/director data |
| 10 | ABN Lookup | SOAP/HTTP | XML/JSON | Yes | Business verification |
| 11 | Federal Lobbyists | Web | HTML | Yes | Lobbyist-client links |
| 12 | QLD Lobbyist Register | Download | Varies | Yes | Contact logs (gold standard) |
| 13 | NSW Lobbyist Register | Open Data | CSV | Yes | Third-party lobbyist data |
| 14 | ABS Data API | REST (SDMX) | XML/JSON/CSV | Yes | Census, economic, demographic |
| 15 | RBA Statistics | Download | CSV/XLS | Yes | Economic data |
| 16 | AIHW MyHospitals | REST | JSON/CSV | Yes | Health system data |
| 17 | BOM | FTP/Web | Various | Yes | Climate/weather data |
| 18 | Right To Know | Web | HTML | Yes | FOI request archive |
| 19 | ParlInfo | Web | HTML/PDF | Yes | Parliamentary records |
| 20 | NSW Hansard API | REST | XML/PDF | Yes | NSW parliamentary record |
| 21 | QLD Parliament API | REST | JSON | Yes | QLD members, divisions |
| 22 | AustLII | Web | HTML | Yes | Court decisions |
| 23 | JADE | Web/URL | HTML | Yes | Enhanced case law |
| 24 | NACC | Web | PDF/HTML | Yes | Corruption commission data |
| 25 | IBAC Dashboard | Web | Interactive | Yes | VIC corruption allegations |
| 26 | Register of Interests | Web | PDF | Yes | MP financial interests |
| 27 | ABC RSS | RSS | XML | Yes | News feed |
| 28 | Google Trends API | REST | JSON | Alpha | Search interest data |
| 29 | data.gov.au | CKAN | Various | Yes | 30,000+ government datasets |
| 30 | Ministerial Diaries | Web | PDF/HTML | Yes | QLD/NSW/VIC/ACT only |

*GrantConnect requires registration for downloads
