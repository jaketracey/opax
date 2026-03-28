# OPAX Additional Data Sources: Governance Accountability & Transparency

Research completed 2026-03-28. Focused on sources that expose governance failures, accountability gaps, and corruption patterns.

---

## 1. Royal Commissions (Last 20 Years)

Royal Commissions are the most powerful investigative tool in Australian governance. Their findings expose systemic failures, name responsible individuals, and generate recommendations that can be tracked against parliamentary action (or inaction).

### Complete List of Federal Royal Commissions (2005-2024)

| # | Royal Commission | Dates | Commissioner(s) | Recommendations | Report URL |
|---|-----------------|-------|-----------------|-----------------|------------|
| 1 | **AWB Oil-For-Food Inquiry** | Nov 2005 – Nov 2006 | TRH Cole | Multiple | [ParlInfo 5 volumes](https://parlinfo.aph.gov.au/parlInfo/search/display/display.w3p;query=Id%3A%22publications%2Ftabledpapers%2F33299%22) |
| 2 | **Equine Influenza Inquiry** | Sep 2007 – Jun 2008 | Ian Callinan AC | Multiple | [ParlInfo](https://parlinfo.aph.gov.au/parlInfo/search/display/display.w3p;query=Id%3A%22publications%2Ftabledpapers%2F40573%22) |
| 3 | **Institutional Child Sexual Abuse** | Jan 2013 – Dec 2017 | Justice Peter McClellan + 5 commissioners | **409** | [childabuseroyalcommission.gov.au](https://www.childabuseroyalcommission.gov.au/final-report) (17 volumes) |
| 4 | **Home Insulation Program** | Dec 2013 – Aug 2014 | Ian Hanger AM | Multiple | [ParlInfo](https://parlinfo.aph.gov.au/parlInfo/search/display/display.w3p;query=Id%3A%22publications%2Ftabledpapers%2Fadfaac79-2e7c-496f-872c-a7e275c1843b%22) |
| 5 | **Trade Union Governance & Corruption** | Mar 2014 – Dec 2015 | Dyson Heydon AC QC | Multiple (6 volumes) | [royalcommission.gov.au/trade-union](https://www.royalcommission.gov.au/trade-union/final-report) |
| 6 | **NT Child Detention** | Aug 2016 – Nov 2017 | Margaret White AO, Michael Gooda | Multiple | [ParlInfo](https://parlinfo.aph.gov.au/) |
| 7 | **Banking/Financial Services (Hayne)** | Dec 2017 – Feb 2019 | Kenneth Hayne AC QC | **76** | [royalcommission.gov.au/banking](https://www.royalcommission.gov.au/banking/final-report) |
| 8 | **Aged Care Quality & Safety** | Oct 2018 – Feb 2021 | Tony Pagone QC, Lynelle Briggs AO | **148** | [royalcommission.gov.au/aged-care](https://www.royalcommission.gov.au/aged-care/final-report) (5 volumes) |
| 9 | **Disability (DRC)** | Apr 2019 – Sep 2023 | Ron Sackville AO QC + 6 commissioners | **222** | [disability.royalcommission.gov.au](https://disability.royalcommission.gov.au/publications/final-report) (12 volumes) |
| 10 | **Natural Disaster Arrangements** | Feb 2020 – Oct 2020 | Mark Binskin AC + 2 commissioners | **80** | [naturaldisaster.royalcommission.gov.au](https://naturaldisaster.royalcommission.gov.au/publications/html-report) |
| 11 | **Defence & Veteran Suicide** | Jul 2021 – Sep 2024 | Naguib Kaldas APM + 2 commissioners | **122** | [defenceveteransuicide.royalcommission.gov.au](https://defenceveteransuicide.royalcommission.gov.au/publications/final-report) (7 volumes, 3000+ pages) |
| 12 | **Robodebt Scheme** | Aug 2022 – Jul 2023 | Catherine Holmes AC SC | **57** | [robodebt.royalcommission.gov.au](https://robodebt.royalcommission.gov.au/publications/report) |

**Total recommendations across all commissions: 1,100+**

### Where Reports Are Published

- **Official portal (post-2015):** https://www.royalcommission.gov.au/recent
- **Each commission has its own subdomain:** `{name}.royalcommission.gov.au`
- **ParlInfo (tabled papers):** All reports are tabled in Parliament and accessible via ParlInfo
- **AustLII archive:** https://www.austlii.edu.au/au/special/royalc/ and https://www.austlii.edu.au/cgi-bin/viewdb/au/other/cth/AURoyalC/
- **National Archives:** Permanent records transferred after commission concludes
- **APH complete list (1902-present):** https://www.aph.gov.au/About_Parliament/Parliamentary_Departments/Parliamentary_Library/Browse_by_Topic/law/royalcommissions

### Data Format
- **Reports:** PDF and HTML (most post-2018 commissions provide HTML versions)
- **Transcripts:** Some commissions published hearing transcripts on their websites; availability varies. The Robodebt commission did not provide bulk transcript downloads.
- **No API or structured database** for Royal Commission data exists

### Recommendation Implementation Tracking

| Commission | Tracker | Who Tracks |
|-----------|---------|------------|
| Child Sexual Abuse | [childsafety.gov.au/royal-commission](https://www.childsafety.gov.au/royal-commission) | National Office for Child Safety (annual reports 2018-2022) |
| Banking (Hayne) | [MinterEllison tracker](https://www.minterellison.com/articles/status-update-implementation-of-the-76-hayne-recommendations) | MinterEllison (76 recs, last updated Sep 2022) |
| Aged Care | [igac.gov.au](https://www.igac.gov.au/) | Inspector-General of Aged Care (statutory progress reports) |
| Disability (DRC) | [health.gov.au/our-work/disability-royal-commission-response](https://www.health.gov.au/our-work/disability-royal-commission-response) | Dept of Health, Disability and Ageing |
| Robodebt | [pmc.gov.au](https://www.pmc.gov.au/resources/government-response-royal-commission-robodebt-scheme) | PM&C (57 recs accepted) |
| Defence/Veteran Suicide | [dva.gov.au](https://www.dva.gov.au/documents-and-publications/governments-response-royal-commissions-final-report) | DVA (104 of 122 accepted/in-principle) |

### OPAX Integration Strategy
- **Scrape recommendation lists** from each commission's final report
- **Track implementation** by cross-referencing with: Hansard (debates on implementation), legislation (bills passed), budget papers (funding allocated)
- **Priority: HIGH** — This is the single most powerful accountability dataset. 1,100+ recommendations from independent commissioners, many of which go unimplemented.

---

## 2. Senate Estimates Transcripts

Senate Estimates hearings are where government departments are grilled on spending. They produce some of the most revealing exchanges in Australian politics.

### Access Points

| Source | URL | Coverage |
|--------|-----|----------|
| APH Estimates Schedule | https://www.aph.gov.au/Parliamentary_Business/Hansard/Estimates_Transcript_Schedule | Recent rounds |
| APH Senate Estimates | https://www.aph.gov.au/Parliamentary_Business/Senate_estimates | Current estimates info |
| ParlInfo (Dataset: commsen) | https://parlinfo.aph.gov.au/ | Back to 1988 |
| GLAM Workbench | https://glam-workbench.github.io/hansard/ | Jupyter notebooks for harvesting |

### ParlInfo OAI-PMH Endpoint

- **Endpoint URL:** `https://parlinfo.aph.gov.au/parlInfo/OAI/OAI.w3p?verb=Identify`
- **Status:** Not confirmed working as of March 2026. ParlInfo's primary interface is web-based search.
- **The OAI-PMH protocol** would allow metadata harvesting but ParlInfo's implementation appears limited or undocumented.

### Bulk Download Strategy

1. **GLAM Workbench notebooks** (Tim Sherratt) can harvest XML from ParlInfo by extracting sitting days and XML file lists from search results: https://github.com/GLAM-Workbench/australian-commonwealth-hansard
2. **ParlInfo search URLs** can be constructed programmatically: `parlinfo.aph.gov.au/parlInfo/search/display/display.w3p;query=Dataset:commsen;...`
3. **ParlWork API** (newer): https://parlwork.aph.gov.au/ — provides committee details and may offer better programmatic access
4. **Scraping approach:** Build targeted scrapers for committee transcript pages, paginating through date ranges

### Data Format
- HTML transcripts (viewable in browser)
- Some PDF versions available
- XML via ParlInfo (when accessible)

### OPAX Value
- Extract commitments made by ministers/officials during estimates
- Track whether those commitments were fulfilled
- Identify departments that repeatedly avoid answering questions
- Cross-reference spending claims with ANAO audit findings

**Priority: HIGH** — Senate Estimates is the primary spending accountability mechanism.

---

## 3. Federal Court / High Court Decisions

### AustLII

- **URL:** https://www.austlii.edu.au/
- **Scale:** 1,061 databases, 1,502,739+ cases and decisions (as of March 2026)
- **Database codes:** `au/cases/cth/HCA` (High Court), `au/cases/cth/FCA` (Federal Court), etc.
- **CGI API:** `https://www.austlii.edu.au/cgi-bin/sinosrch.cgi` — undocumented search API
- **IMPORTANT: AustLII prohibits scraping/crawling/API access** without written agreement. Automated access will be blocked.
- **Contact for data agreements:** AustLII directly (may grant access for research purposes)

### Open Australian Legal Corpus (Alternative)

- **URL:** https://huggingface.co/datasets/umarbutler/open-australian-legal-corpus
- **Also:** https://huggingface.co/datasets/isaacus/open-australian-legal-corpus
- **Size:** 229,122 texts, 60M+ lines, 1.4B tokens
- **Coverage:** Every in-force statute and regulation in Commonwealth, NSW, QLD, WA, SA, TAS, Norfolk Island + thousands of bills + hundreds of thousands of court/tribunal decisions
- **Sources:** Federal Register of Legislation, Federal Court, High Court, NSW Caselaw, NSW/QLD/WA/SA/TAS Legislation
- **Format:** Plain text on HuggingFace (Parquet)
- **License:** Open source (most allow commercial use)
- **Creator:** Umar Butler — GitHub repo allows community contributions of additional scrapers
- **Blog:** https://umarbutler.com/how-i-built-the-largest-open-database-of-australian-law/

### Python Libraries

| Library | URL | Status | Scope |
|---------|-----|--------|-------|
| `legaldata` | https://github.com/dylanhogg/legaldata | Last updated 2020 | Crawls legislation.com.au and austlii.edu.au (Acts only) |
| AustLII scraper | https://gitlab.com/legalinformatics/austlii-scraper | Varies | Treaty texts from AustLII |
| `nswcaselaw` | https://github.com/Sydney-Informatics-Hub/nswcaselaw | Active | NSW CaseLaw judgments with filtering |
| OLEXI MCP Server | https://glama.ai/mcp/servers/@mickey-mikey/olexi-mcp | 2026 | MCP server for Australian law queries |

### Federal Court RSS Feed

- **Judgments RSS:** `https://www.judgments.fedcourt.gov.au/rss/fca-judgments`
- **Coverage:** All published judgments (within 24 hours, 1 hour for high-profile)
- **Format:** RSS/XML
- **Subscriptions portal:** https://www.fedcourt.gov.au/services/subscriptions
- **Also available:** Email alerts by National Practice Area, daily court lists, case tracking via Commonwealth Courts Portal

### BarNet JADE

- **URL:** https://jade.io/
- **Scale:** 240,000+ decisions and legislation
- **Direct URL access:** `https://jade.io/content/ext/mnc/{year}/{court}/{number}`
- **Alerts:** Daily email or RSS feed
- **Free access**

### Key Political Cases to Track
- Section 44 citizenship eligibility cases
- Election challenges and disputes
- Judicial review of government decisions (esp. immigration, FOI)
- NACC referrals and prosecutions

**Priority: HIGH** — The Open Australian Legal Corpus is the best entry point. Federal Court RSS for real-time monitoring.

---

## 4. Auditor-General Reports (ANAO)

### Source Details

- **URL:** https://www.anao.gov.au/
- **Reports portal:** https://www.anao.gov.au/pubs
- **Performance audits:** https://www.anao.gov.au/pubs/performance-audit
- **Performance statements audits:** https://www.anao.gov.au/pubs/performance-statements-audit

### Report Types

| Type | Description | Value |
|------|-------------|-------|
| Performance Audits | Assess efficiency, effectiveness, economy of government programs | **CRITICAL** — directly exposes waste |
| Financial Statement Audits | Verify financial reporting accuracy | Moderate |
| Performance Statements Audits | Audit annual performance statements | Moderate |
| Information Reports | Research and insights | Context |
| Assurance Reviews | Targeted reviews of specific areas | High |

### Programmatic Access

- **No public API identified**
- **No bulk download facility**
- **No RSS feed confirmed** (the ANAO website does not appear to offer RSS)
- **Reports are published as HTML pages with PDF downloads**
- **Web scraping approach:** The `/pubs` endpoint supports filtering by report type, year, and keyword. Pages follow predictable URL patterns.
- **data.gov.au:** No structured ANAO dataset found on data.gov.au

### Scraping Strategy

1. Crawl `https://www.anao.gov.au/pubs?page={n}` for report listings
2. Extract: title, date, report number, report type, department audited, key findings
3. Download PDFs for full-text analysis
4. Build a structured database of all audit findings and recommendations

### Notable Recent ANAO Reports (governance failures)

- Management of the Australian Government's Register of Lobbyists (audited lobbyist system itself)
- Data Management in the APS
- Various procurement and grant administration audits
- COVID-19 response spending audits

### OPAX Value
- Track which departments are repeatedly flagged for waste/mismanagement
- Cross-reference audit findings with minister responsible, departmental spending (budget papers), and AusTender contracts
- Monitor whether ANAO recommendations are implemented

**Priority: HIGH** — Performance audits are the government's own admission of failure. No one else is systematically tracking implementation.

---

## 5. Freedom of Information (FOI) Disclosure Logs

### Aggregated Data

| Source | URL | Format | Notes |
|--------|-----|--------|-------|
| **data.gov.au FOI log index** | https://data.gov.au/data/dataset/list-of-known-foi-disclosure-logs | CSV (19.6 KB) | List of all agencies with links to their disclosure logs. Updated monthly. CC-BY-3.0 |
| **Right To Know** | https://www.righttoknow.org.au/ | HTML (searchable) | Archive of FOI requests and responses across 9 jurisdictions. Run by OpenAustralia Foundation. |

### Key Agency Disclosure Logs

| Agency | URL |
|--------|-----|
| Attorney-General's | https://www.ag.gov.au/rights-and-protections/freedom-information/freedom-information-disclosure-log |
| DFAT | https://www.dfat.gov.au/about-us/corporate/freedom-of-information/foi-disclosure-log |
| Home Affairs | https://www.homeaffairs.gov.au/access-and-accountability/freedom-of-information/disclosure-logs |
| Treasury | https://treasury.gov.au/the-department/accountability-reporting/foi |
| Health | https://www.health.gov.au/resources/foi-disclosure-log |
| PM&C | https://www.pmc.gov.au/about-us/accountability-and-reporting/information-and-privacy/foi-disclosure-logs |
| OAIC | https://www.oaic.gov.au/about-the-OAIC/access-our-information/our-foi-disclosure-log |
| Federal Court | https://www.fedcourt.gov.au/disclosurelog |

### Legal Requirement
Under Section 11C(3) of the FOI Act 1982 (since 1 May 2011), every Commonwealth agency must publish details of information released through FOI on their website.

### Programmatic Access
- **No unified API** across agencies
- **Each agency has a different format** (some HTML tables, some PDFs, some link lists)
- **Right To Know** (Alaveteli platform) is the best single source for browsing. GitHub: https://github.com/openaustralia/righttoknow
- **Scraping required** for bulk analysis across agencies

### OPAX Value
- Mine patterns in what agencies resist disclosing
- Identify politically sensitive topics by FOI request frequency
- Track time-to-response and refusal rates by agency
- Cross-reference FOI topics with concurrent political events

**Priority: MEDIUM** — High value but fragmented access. Right To Know is best starting point.

---

## 6. Political Donations — Additional Sources

### Major Reform: Electoral Reform Act 2025 (Commencing 1 July 2026)

The Electoral Legislation Amendment (Electoral Reform) Act 2025 received Royal Assent on 20 February 2025. Key changes effective **1 July 2026**:

| Change | Current | New (from 1 Jul 2026) |
|--------|---------|----------------------|
| Disclosure threshold | $16,900 | **$5,000** |
| Disclosure timing (non-election) | Annual | **By 21st of following month** |
| Disclosure timing (election period) | Annual | **Within 7 days** |
| Disclosure timing (expedited period) | Annual | **Within 24 hours** |
| AEC publication (election) | Delayed | **Within 24 hours of receipt** |
| AEC publication (non-election) | Delayed | **Within 10 days of receipt** |
| Annual donation cap per recipient | None | **$50,000** |
| State/territory cap per year | None | **$250,000** |
| Overall cap per year | None | **$1.6 million** |

- **AEC FAD Reform page:** https://www.aec.gov.au/FADReform/
- **Detailed changes PDF:** https://aec.gov.au/FADReform/files/Changes-to-Funding-and-Disclosure-Explained-Oct-2025.pdf
- **APH research brief:** https://www.aph.gov.au/About_Parliament/Parliamentary_departments/Parliamentary_Library/Research/Policy_Briefs/2025-26/Electoralfinance

**OPAX Impact:** This is transformative. Near-real-time donation data at a much lower threshold. OPAX should build automated ingestion from the AEC Transparency Register starting July 2026.

### Dark Money / Associated Entities

| Source | URL | Coverage |
|--------|-----|----------|
| **GetUp Dark Money Tracker** | https://darkmoney.getup.org.au/ | Maps undisclosed donations via affiliated entities |
| **Centre for Public Integrity** | https://publicintegrity.org.au/ | Research on $1.2B in donations over 22 years; associated entities analysis |
| **Transparency International Australia** | https://transparency.org.au/ | AEC data analysis, dark money reporting |
| **Australia Institute** | https://australiainstitute.org.au/ | Hidden corporate political expenditure research |

**Key finding:** Major parties collected **$130M+ in dark money** (undisclosed sources) in 2024-25 alone. Associated entities (party-linked shell companies) are the primary vehicle — Labor received 33% of income from associated entities ($120M, 1998-2021), Liberals 42% ($140M).

### State-Level Donation Data

| State | Electoral Commission | URL | Format | Notes |
|-------|---------------------|-----|--------|-------|
| **NSW** | NSW Electoral Commission | https://elections.nsw.gov.au/funding-and-disclosure/disclosures/view-disclosures | Web search | Since 1 Jul 2008 |
| **VIC** | Victorian Electoral Commission | https://www.vec.vic.gov.au/candidates-and-parties/political-donations | Web (VEC Disclosures) | Since 2018 |
| **QLD** | Electoral Commission QLD | https://www.ecq.qld.gov.au/donations-and-expenditure-disclosure | CSV/Excel/PDF export | Real-time via EDS |
| **SA** | SA Electoral Commission | N/A | N/A | **Banned most donations from 1 Jul 2025** (first jurisdiction globally) |
| **WA** | WA Electoral Commission | https://www.wa.gov.au/organisation/western-australian-electoral-commission | Web search | Annual/election returns |
| **TAS** | Tasmanian Electoral Commission | https://www.tec.tas.gov.au/ | Web | Limited |
| **ACT** | ACT Electoral Commission | https://www.elections.act.gov.au/ | Web | Has disclosure scheme |
| **NT** | NT Electoral Commission | https://ntec.nt.gov.au/ | Web | Limited |

**Priority: HIGH** — The July 2026 reforms are a game-changer. Build the pipeline now.

---

## 7. Lobbyist Meeting Records

### Federal Level

- **URL:** https://lobbyists.ag.gov.au/register
- **Administrator:** Attorney-General's Department
- **Access:** Web-based, JS-rendered (requires headless scraping)
- **Limitation:** Only covers third-party lobbyists (~20% of all lobbying). In-house lobbyists excluded.
- **ANAO audit:** The ANAO has audited the register itself — [Management of the Australian Government's Register of Lobbyists](https://www.anao.gov.au/work/performance-audit/management-the-australian-governments-register-lobbyists)
- **No meeting records published** at federal level (unlike QLD)

### State-Level Contact Logs

| State | Source | URL | Contact Logs? | Format |
|-------|--------|-----|---------------|--------|
| **QLD** (GOLD STANDARD) | Integrity Commissioner | https://lobbyists.integrity.qld.gov.au/ | **Yes — monthly, searchable for 10 years** | Downloadable |
| **QLD Ministerial Diaries** | Dept of Premier | https://www.premiers.qld.gov.au/ | **Yes** | Published online |
| **NSW** | NSW Electoral Commission | https://data.nsw.gov.au/data/dataset/register-of-third-party-lobbyists | Partial | CSV on data.nsw.gov.au |
| **VIC** | VIC Lobbyist Register | https://www.lobbyists.vic.gov.au/ | Limited | Web search |
| **ACT** | ACT Integrity Commission | https://www.integrity.act.gov.au/ | Ministerial diaries published | Web |
| **SA** | SA Lobbyist Register | https://lobbyists.sa.gov.au/ | Limited | Web |
| **WA** | WA Public Sector Commission | https://www.wa.gov.au/ | Limited | Web |

### Jurisdiction Comparison (APGRA)
- **Reference:** https://www.apgra.org.au/lobbyist-registers-and-requirements-by-jurisdiction/

### OPAX Value
- QLD contact logs are the only comprehensive source of who-met-whom data
- Cross-reference lobbyist clients with: AusTender contracts, AEC donations, Hansard mentions
- Federal register is weak — track campaign for ministerial diary publication at Commonwealth level

**Priority: MEDIUM-HIGH** — QLD is high value; federal data is limited but still useful for entity mapping.

---

## 8. Government Contracts (AusTender)

### AusTender OCDS API

- **URL:** https://www.tenders.gov.au/
- **API Base:** `https://api.tenders.gov.au/ocds/`
- **Swagger Docs:** https://app.swaggerhub.com/apis/austender/ocds-api/1.1
- **GitHub:** https://github.com/austender/austender-ocds-api
- **Auth:** None required
- **Format:** JSON (Open Contracting Data Standard)
- **Coverage:** 450,000+ contracts from 1 January 2013
- **Historical data on data.gov.au:** https://data.gov.au/data/dataset/historical-australian-government-contract-data

### API Endpoints

| Endpoint | Purpose |
|----------|---------|
| `findById/{contractID}` | Single contract by ID |
| `findByDates/contractPublished/{start}/{end}` | By publication date |
| `findByDates/contractStart/{start}/{end}` | By start date |
| `findByDates/contractEnd/{start}/{end}` | By end date |
| `findByDates/contractLastModified/{start}/{end}` | By modification date |

### Cross-Reference Strategy: Contractors to Donors

This requires entity resolution across datasets:

```
AusTender (contractor ABN/name)
  -> ASIC Company Data (company directors, ACN)
  -> ABN Lookup (entity verification)
  -> AEC Transparency Register (donation records by entity name/ABN)
  -> Lobbyist Register (are contractors also lobbyist clients?)
```

The AusTender API does not natively link to donation data, but OPAX can build this cross-reference using ABN/company name matching.

### Related: GrantConnect

- **URL:** https://www.grants.gov.au/
- **No public API** — requires registration
- **Contact:** GrantConnect@Finance.gov.au
- **Value:** Track grant distribution across electorates (pork-barrelling detection)

**Priority: HIGH** — Already have API access. Entity resolution is the technical challenge.

---

## 9. Parliamentary Registers of Interests

### Current Status

| Register | URL | Format |
|----------|-----|--------|
| **House of Representatives (48th Parliament)** | https://www.aph.gov.au/Senators_and_Members/Members/Register | PDF statements |
| **Senate** | https://www.aph.gov.au/Parliamentary_Business/Committees/Senate/Senators_Interests/Senators_Interests_Register | PDF statements |
| **Previous Parliaments** | Links from the above pages | PDF statements |

### Structured Data Availability

- **No API, no CSV, no structured data** from Parliament
- The Parliament has confirmed via FOI that the data "is not stored elsewhere as a structured dataset"
- **OpenAustralia** made the Register available online for the first time in 2008
- The UK equivalent (UK Parliament) publishes as open data — Australia lags significantly

### PDF Extraction Strategy

1. Download all PDF statements from APH website
2. Use PDF parsing (pdfplumber, Camelot, or LLM-based extraction) to extract structured fields:
   - Shareholdings
   - Property interests
   - Directorships
   - Gifts and hospitality
   - Travel sponsored by third parties
   - Liabilities
3. Build a structured database linking each MP to their declared interests
4. Cross-reference with: voting records (TheyVoteForYou), AusTender contracts, ASIC directorships

### OPAX Value
- This is the conflict-of-interest detection layer
- MP votes on mining legislation while holding mining shares
- MP receives sponsored travel from industry body, then advocates for their position
- Compare declared interests with ASIC records (are undeclared directorships visible?)

**Priority: HIGH** — Requires PDF extraction work but extremely high accountability value.

---

## 10. Additional High-Value Sources

### 10.1 Corruption Commissions (Already Documented)

Key additions to existing documentation:

| Commission | Key Data Point |
|-----------|---------------|
| **NACC** (nacc.gov.au) | 6,000+ referrals, 32 preliminary + 38 corruption investigations, 11 convictions (as of Oct 2025) |
| **NSW ICAC** | 35% more investigations in 2024-25 than previous year |
| **VIC IBAC** | Interactive public dashboard of corruption allegations |

### 10.2 Administrative Review Tribunal (formerly AAT)

- **URL:** https://www.art.gov.au/
- **eCase Search:** https://online.aat.gov.au/ecasearch (applications from 18 Mar 2013)
- **Value:** FOI jurisdiction decisions show what agencies resist disclosing
- **Priority: MEDIUM**

### 10.3 Inspector-General Reports

| Inspector-General | URL | Value |
|------------------|-----|-------|
| Inspector-General of Aged Care | https://www.igac.gov.au/ | Tracks Royal Commission implementation |
| Inspector-General of Intelligence & Security | https://www.igis.gov.au/ | Oversight of intelligence agencies |
| Commonwealth Ombudsman | https://www.ombudsman.gov.au/ | Complaint data, own-motion investigations |

**Priority: MEDIUM**

### 10.4 PM Transcripts (GLAM Workbench)

- **URL:** https://glam-workbench.net/pm-transcripts/
- **Coverage:** Prime Ministerial transcripts, press conferences, speeches
- **Format:** Jupyter notebooks for harvesting
- **Priority: MEDIUM** — Useful for tracking PM commitments vs outcomes

---

## Priority Summary

| Priority | Source | Programmatic Access | Effort |
|----------|--------|-------------------|--------|
| **HIGH** | Royal Commission Recommendations (1,100+) | Scrape HTML/PDF reports | Medium |
| **HIGH** | AEC Real-Time Disclosures (from Jul 2026) | API (Transparency Register) | Low (when live) |
| **HIGH** | Senate Estimates Transcripts | ParlInfo scrape / GLAM notebooks | High |
| **HIGH** | Open Australian Legal Corpus | HuggingFace download | Low |
| **HIGH** | ANAO Performance Audit Reports | Web scrape | Medium |
| **HIGH** | AusTender Contracts <-> Donors | OCDS API + entity resolution | High |
| **HIGH** | Register of Members' Interests | PDF extraction | High |
| **HIGH** | State Donation Data (esp. QLD CSV) | Mixed (CSV/scrape) | Medium |
| **MEDIUM-HIGH** | QLD Lobbyist Contact Logs | Download | Low |
| **MEDIUM** | FOI Disclosure Logs | Scrape per-agency | High |
| **MEDIUM** | Dark Money Trackers (GetUp, CPI) | Web scrape | Low |
| **MEDIUM** | Federal Court RSS | RSS feed | Low |
| **MEDIUM** | Corruption Commission Reports | Web scrape | Medium |
| **LOW** | AustLII Direct (needs written agreement) | Restricted | High |
| **LOW** | PM Transcripts | GLAM notebooks | Low |

---

## Recommended Implementation Order

### Phase 1: Quick Wins (Low Effort, High Value)
1. Download Open Australian Legal Corpus from HuggingFace
2. Subscribe to Federal Court RSS feed
3. Download QLD lobbyist contact logs
4. Download QLD Electoral Commission CSV data
5. Build Royal Commission recommendations index from HTML reports

### Phase 2: API Integration (Medium Effort)
6. Build AusTender OCDS ingestion pipeline
7. Prepare for AEC real-time disclosure API (July 2026 launch)
8. Scrape ANAO report listings and PDFs
9. Ingest state electoral commission data (NSW, VIC, WA)

### Phase 3: Entity Resolution (High Effort, Highest Value)
10. Build cross-reference engine: Contractors <-> Donors <-> Lobbyists <-> MP Interests
11. Extract structured data from Register of Interests PDFs
12. Bulk harvest Senate Estimates transcripts via ParlInfo/GLAM

### Phase 4: Accountability Engine
13. Royal Commission recommendation tracker (recommendations -> parliamentary action -> outcomes)
14. ANAO finding tracker (audit findings -> government response -> re-audit)
15. FOI resistance tracker (aggregate disclosure logs, track refusal patterns)
