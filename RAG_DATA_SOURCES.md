# OPAX RAG Pipeline: Additional Data Sources

Research into structured, machine-readable data sources that would improve the quality and depth
of answers from the OPAX Retrieval-Augmented Generation system. Focused on free, open sources
that directly enhance political accountability analysis.

**Current RAG context sources:**
- 422K Hansard speeches (semantic + keyword search)
- 619K political donations (keyword matching)
- 3,634 parliamentary divisions (keyword matching)
- TheyVoteForYou policy scores (cached for 366 policies)

---

## Priority 1: HIGH-VALUE, LOW-EFFORT Additions

These sources are machine-readable, free, and would immediately improve RAG answer quality.

### 1.1 ALRC DataHub — Bill Status & Progress (1998-2022)

- **URL:** https://www.alrc.gov.au/datahub/download-the-data/
- **Format:** XLSX (easily convertible to CSV/SQLite)
- **Access:** Direct download, no auth
- **Data:** 16 datasets covering all Commonwealth Bills introduced between 39th-46th Parliaments
  - **Status of Commonwealth Bills** — one row per Bill with pass/fail status, chamber of origin, dates
  - **Progress of Commonwealth Bills** — step-by-step progress from introduction through Royal Assent
- **RAG improvement:** Answer questions like "What happened to the gambling reform bill?" or "How many bills did this government pass vs. fail?" Currently the RAG has no bill lifecycle data at all.
- **Example query improved:** "Did the anti-corruption commission bill pass?" — currently unanswerable, would become trivial.
- **Effort:** LOW — download XLSX, convert to SQLite table, add keyword search
- **Priority:** HIGH

### 1.2 AusTender OCDS API — Government Contracts

- **URL:** https://api.tenders.gov.au/ocds/
- **API Docs:** https://app.swaggerhub.com/apis/austender/ocds-api/1.1
- **Format:** JSON (OCDS standard)
- **Access:** No auth required, REST API
- **Data:** 450,000+ federal government contracts from 2013 onwards, including supplier names, amounts, agencies, dates, amendments
- **RAG improvement:** Cross-reference donation recipients with government contract winners. Answer "Did companies that donated to [party] receive government contracts?"
- **Example query improved:** "Which mining companies received government contracts after donating to the Liberal Party?" — currently impossible, would combine donations table with contracts table.
- **Effort:** MEDIUM — need to ingest contracts and build entity-matching between donor names and supplier names
- **Priority:** HIGH

### 1.3 Guardian Open Platform API — News Context

- **URL:** https://open-platform.theguardian.com/
- **Format:** JSON
- **Access:** Free API key (register at open-platform.theguardian.com), 12 calls/second, 5000/day
- **Data:** 2.7M+ articles since 1999, full body text, tags, sections. Separate Australia edition with politics section.
- **Endpoints:**
  - `/search` — full text search with section/tag filters
  - `/tags` — browse 1000+ topic tags
  - `/sections` — filter by politics, australia-news, etc.
- **RAG improvement:** Add media coverage context to RAG answers. When a user asks about a political event, retrieve relevant Guardian articles alongside Hansard speeches.
- **Example query improved:** "What was the controversy around sports rorts?" — currently limited to what MPs said in Parliament, would now include investigative journalism.
- **Effort:** LOW — simple REST API, index articles by date/topic/MP mentions
- **Priority:** HIGH

### 1.4 The Conversation Australia — Academic Analysis (RSS)

- **URL:** https://theconversation.com/au/feeds
- **Topic feed:** https://theconversation.com/topics/australian-politics-32 (RSS)
- **Format:** RSS/XML with full article text in feed
- **Access:** Free, no auth needed for RSS
- **Data:** Expert academic analysis of Australian political issues. Articles are peer-reviewed by academics and written in accessible language.
- **RAG improvement:** Provides expert, evidence-based analysis to complement raw parliamentary data. Academic context for policy debates.
- **Example query improved:** "Is the Stage 3 tax cut policy fair?" — currently can only cite what MPs said, would now include independent academic analysis.
- **Effort:** LOW — parse RSS feed, store articles in SQLite, keyword search
- **Priority:** HIGH

### 1.5 Parliamentary Library Bills Digests

- **URL:** https://www.aph.gov.au/Parliamentary_Business/Bills_Legislation/Bills_Digests
- **RSS feed:** Available via APH RSS feeds (https://www.aph.gov.au/Help/RSS_feeds)
- **Community tool:** https://github.com/richyvk/APH-rss (tracks bill status changes)
- **Format:** HTML (structured, scrapable), RSS for new digests
- **Access:** Free, public
- **Data:** Independent, non-partisan summaries of every significant bill introduced to Parliament, including purpose, background, key provisions, stakeholder views, and committee recommendations
- **RAG improvement:** Provides authoritative, neutral bill summaries. Currently RAG can only piece together bill info from speeches where MPs discuss them.
- **Example query improved:** "What does the housing affordability bill actually do?" — instead of relying on partisan MP speeches, the digest provides a neutral summary.
- **Effort:** LOW-MEDIUM — scrape HTML digests, index by bill name/topic
- **Priority:** HIGH

### 1.6 Wikidata — Structured Biographical Data for Politicians

- **URL:** https://query.wikidata.org/ (SPARQL endpoint)
- **Format:** JSON/CSV via SPARQL queries
- **Access:** Free, no auth, CC0 license
- **Data:** Rich biographical data for all Australian federal politicians:
  - Date/place of birth, education, prior occupations
  - Position held (P39) with parliamentary term, start/end dates, party, electorate
  - Links to Wikipedia, OpenAustralia, TheyVoteForYou IDs
- **RAG improvement:** Enrich MP context with background info. Answer "What did [MP] do before politics?" or "Which MPs have a legal background?"
- **Example query improved:** "Which MPs on the banking committee have worked in finance?" — currently no occupational data, Wikidata provides prior careers.
- **Effort:** LOW — one-off SPARQL harvest, store in members table as extra columns
- **Priority:** HIGH

### 1.7 AustralianPoliticians R Package Data

- **URL:** https://rohanalexander.github.io/AustralianPoliticians/
- **Format:** CSV/R data frames (easily exportable)
- **Access:** Free, open source
- **Data:** Biographical and political data for all Australian federal politicians 1901-2021, including birth/death dates, gender, party history, education, prior occupation, Wikipedia links. Sourced from Wikipedia/Wikidata with manual corrections.
- **RAG improvement:** Complements Wikidata with curated, verified Australian-specific biographical data
- **Effort:** LOW — download CSV, merge with existing members table
- **Priority:** MEDIUM (overlaps with Wikidata)

---

## Priority 2: HIGH-VALUE, MEDIUM-EFFORT Additions

### 2.1 ABS Data API — Electorate-Level Demographics

- **URL:** https://data.api.abs.gov.au/rest/data/
- **Docs:** https://www.abs.gov.au/about/data-services/application-programming-interfaces-apis
- **Format:** JSON, XML, CSV (SDMX 2.1 standard)
- **Access:** Free, no auth
- **Key datasets:**
  - **SEIFA** (Socio-Economic Indexes for Areas) — deprivation index per area/electorate
  - **Census profiles by CED** (Commonwealth Electoral Division) — demographics, income, housing, employment
  - **Labour force** — unemployment by region
  - **CPI** — cost of living indicators
- **RAG improvement:** Contextualize political claims with actual data. When an MP says "my electorate is struggling," check if SEIFA scores confirm it. When government claims employment is improving, check regional unemployment data.
- **Example query improved:** "Is the government's claim about falling unemployment accurate?" — currently can only cite other MPs' statements, would now include ABS statistics.
- **Effort:** MEDIUM — SDMX API has a learning curve, need to map ABS geographies to electorates
- **Priority:** HIGH

### 2.2 PBO Data Portal — Budget & Fiscal Analysis

- **URL:** https://www.pbo.gov.au/publications-and-data/publications
- **Data Portal:** https://www.aph.gov.au/About_Parliament/Parliamentary_Departments/Parliamentary_Budget_Office/Data_portal
- **Format:** XLSX/CSV downloads, interactive models
- **Access:** Free, public
- **Data:**
  - Revenue and expenditure analysis across government levels
  - Budget projections and debt forecasts
  - SMART tax modelling tool with demographic data
  - Budget Explainers and Budget Bites (short analyses)
- **RAG improvement:** Independent fiscal analysis to fact-check budget claims. Answer "Can the government afford this policy?" with PBO costings.
- **Example query improved:** "What is the projected budget deficit?" — currently no fiscal data, PBO provides independent projections.
- **Effort:** MEDIUM — download reports, extract structured data from XLSX, index text content
- **Priority:** HIGH

### 2.3 Parliamentary Committee Reports

- **URL:** https://www.aph.gov.au/Parliamentary_Business/Committees
- **ParlInfo:** https://parlinfo.aph.gov.au/ (search interface)
- **GLAM Workbench:** https://glam-workbench.github.io/hansard/ (bulk harvest tools)
- **Format:** HTML/XML via ParlInfo, some PDF
- **Access:** Free, public. ParlInfo has no bulk API but GLAM Workbench provides Jupyter notebooks for harvesting.
- **Data:** Committee inquiry reports, witness submissions, recommendations. Covers Senate Estimates transcripts where officials are questioned on spending.
- **RAG improvement:** Committee reports contain detailed expert evidence and recommendations on policy issues. Senate Estimates transcripts reveal what governments promised vs. what they delivered.
- **Example query improved:** "What did the banking royal commission recommend about financial advice?" — committee/inquiry reports provide authoritative findings beyond what MPs said in chamber debate.
- **Effort:** MEDIUM-HIGH — need to scrape/harvest from ParlInfo, extract text from structured HTML
- **Priority:** HIGH

### 2.4 APH e-Petitions

- **URL:** https://www.aph.gov.au/e-petitions
- **Format:** HTML (structured, scrapable)
- **Access:** Free, public
- **Data:** All petitions to Parliament including title, text, signature count, sponsoring MP, response status, government response text
- **RAG improvement:** Shows what citizens are demanding action on. Signature counts indicate public concern level. Government responses reveal official positions.
- **Example query improved:** "What is the public demanding on climate change?" — petition data with 100K+ signatures provides direct evidence of public sentiment.
- **Effort:** MEDIUM — requires scraping, no API
- **Priority:** MEDIUM

### 2.5 News APIs — Multi-Source Media Context

#### NewsAPI.org
- **URL:** https://newsapi.org/
- **Format:** JSON
- **Access:** Free tier (100 requests/day, last 30 days). Paid from $449/month for archive.
- **Data:** 150,000+ sources worldwide, filter by country=au and category=politics

#### Mediastack
- **URL:** https://mediastack.com/
- **Format:** JSON
- **Access:** Free tier (500 requests/month). Paid from $11/month.
- **Data:** Australian news from multiple publishers

#### ABC News RSS
- **URL:** https://www.abc.net.au/news/feed/2942460/rss.xml (main)
- **Politics feed:** https://www.abc.net.au/news/feed/104217372/rss.xml
- **Format:** RSS/XML
- **Access:** Free, no auth
- **Data:** Latest ABC News articles, headlines, summaries

- **RAG improvement:** Media coverage provides essential context for political events. Combine with Hansard to show what MPs said vs. how media reported it.
- **Effort:** MEDIUM — multiple APIs to integrate, need deduplication across sources
- **Priority:** MEDIUM

---

## Priority 3: MEDIUM-VALUE or HIGHER-EFFORT Additions

### 3.1 Federal Register of Legislation

- **URL:** https://www.legislation.gov.au/
- **Format:** Web interface, no public bulk API identified
- **Access:** Free, public
- **Data:** Authoritative full text of all Commonwealth legislation, including current/historical versions, explanatory memoranda, legislative lifecycle
- **RAG improvement:** When users ask about specific laws, provide the actual legislative text rather than just what MPs said about it.
- **Effort:** HIGH — no API, would need to scrape or use targeted queries
- **Priority:** MEDIUM

### 3.2 Productivity Commission — Report on Government Services

- **URL:** https://www.pc.gov.au/ongoing/report-on-government-services/
- **Format:** XLSX/CSV downloads available
- **Access:** Free, public
- **Data:** Annual report benchmarking government service delivery across health, education, justice, emergency management, housing, community services. Data at state/territory level.
- **RAG improvement:** Evidence base for "did the policy work?" questions. Tracks service outcomes over time.
- **Example query improved:** "Is hospital waiting time improving?" — Productivity Commission data provides the actual numbers.
- **Effort:** MEDIUM — download structured tables, need to normalize across years
- **Priority:** MEDIUM

### 3.3 Grattan Institute Reports & Data

- **URL:** https://grattan.edu.au/
- **GitHub:** https://github.com/grattan (38 repos)
- **R package:** https://github.com/grattan/grattandata (microdata warehouse)
- **Format:** R data frames, PDF reports, charts with downloadable CSV data
- **Access:** Free, public (reports). R package for microdata.
- **Data:** Independent policy research on budget, tax, health, education, housing, energy, transport. High-quality analysis with underlying data.
- **RAG improvement:** Expert independent analysis to complement parliamentary debate. Grattan is widely cited and respected as non-partisan.
- **Example query improved:** "Is the housing crisis getting worse?" — Grattan housing reports provide rigorous analysis beyond political rhetoric.
- **Effort:** MEDIUM — scrape report text, download chart data CSVs, R package for microdata
- **Priority:** MEDIUM

### 3.4 APO (Analysis & Policy Observatory)

- **URL:** https://apo.org.au/
- **Format:** Web search interface, no public API identified
- **Access:** Free, no login required
- **Data:** 42,000+ policy research documents from think tanks, universities, government agencies, NGOs. Curated grey literature repository.
- **RAG improvement:** One-stop shop for policy research from all major Australian think tanks. Would dramatically broaden the evidence base beyond parliamentary sources.
- **Example query improved:** "What do experts say about Australia's immigration policy?" — APO aggregates research from dozens of institutions.
- **Effort:** MEDIUM-HIGH — no API, would need scraping or partnership for data access
- **Priority:** MEDIUM

### 3.5 Google Trends API (Alpha)

- **URL:** https://developers.google.com/search/apis/trends
- **Format:** JSON
- **Access:** Alpha access by application only (launched July 2025). Need real use case and implementation timeline.
- **Data:** Search interest data over time by region/city, up to 5 years back. Daily/weekly/monthly aggregation. City-level granularity for Australia.
- **RAG improvement:** Track public interest in political issues. Show whether parliamentary activity aligns with what citizens are searching for.
- **Example query improved:** "Is gambling reform a major public concern?" — Google Trends data shows actual search volume for gambling-related terms.
- **Effort:** MEDIUM — need to apply for alpha access, then simple REST API
- **Priority:** MEDIUM

### 3.6 AIHW MyHospitals API — Health Outcomes

- **URL:** https://www.aihw.gov.au/reports-data/myhospitals/content/api
- **Format:** JSON (default) or CSV
- **Access:** Free, no auth
- **Data:** Hospital performance data including waiting times, patient experience, safety indicators, by hospital/region
- **RAG improvement:** Fact-check health policy claims with actual hospital outcome data.
- **Effort:** LOW — simple REST API, no auth
- **Priority:** LOW-MEDIUM (narrow topic scope)

### 3.7 RBA Economic Data

- **URL:** https://www.rba.gov.au/statistics/tables/
- **Python:** `raustats` package or DBnomics (https://db.nomics.world/RBA)
- **Format:** CSV/XLS downloads, or via third-party APIs
- **Access:** Free, public
- **Data:** Interest rates, exchange rates, money/credit statistics, economic forecasts
- **RAG improvement:** Economic context for political decisions. Check claims about economic performance.
- **Effort:** MEDIUM — multiple download formats, need normalization
- **Priority:** LOW-MEDIUM

---

## Priority 4: INTERNATIONAL COMPARISON & METHODOLOGY

### 4.1 UK TheyWorkForYou / UK Parliament API

- **URL (TWFY):** https://www.theyworkforyou.com/api/
- **URL (UK Parliament):** https://developer.parliament.uk/
- **Members API:** https://members-api.parliament.uk/
- **Format:** JSON, XML
- **Access:** Free, open (UK Parliament data under Open Parliament Licence)
- **Data:** Full UK Hansard, voting records, MP biographical data, financial interests, committee memberships
- **RAG improvement:** Not direct RAG content, but methodology reference. UK Parliament API is more mature than Australia's — their Members API has structured committee membership, financial interests, and photo endpoints we could replicate.
- **Effort:** N/A (reference only)
- **Priority:** LOW (methodology reference)

### 4.2 New Zealand Parliament Open Data

- **URL:** https://data.parliament.nz/
- **Format:** REST API with JSON
- **Access:** Free, API key required (register at portal)
- **Data:** NZ parliamentary data through developer portal. Similar Westminster system.
- **RAG improvement:** Comparison data for similar Westminster parliament. Could answer "How does NZ handle this differently?"
- **Effort:** MEDIUM
- **Priority:** LOW

### 4.3 IPU Parline — Global Parliamentary Data

- **URL:** https://data.ipu.org/
- **Format:** Web interface, some data export
- **Access:** Free
- **Data:** 600+ data points per parliament globally — structure, composition, gender balance, working methods
- **RAG improvement:** International benchmarking. "How does Australia's parliament compare globally on gender representation?"
- **Effort:** MEDIUM
- **Priority:** LOW

---

## Priority 5: FACT-CHECKING Sources (Limited Machine-Readability)

### 5.1 RMIT ABC Fact Check

- **URL:** https://www.rmit.edu.au/about/schools-colleges/media-and-communication/industry/rmit-information-integrity-hub/fact-checks
- **Format:** HTML articles, no API or structured data output
- **Access:** Free, public
- **Data:** Fact-check verdicts on political claims. IFCN-certified (International Fact-Checking Network).
- **RAG improvement:** Authoritative fact-check verdicts. When a user asks about a political claim, retrieve the fact-check if one exists.
- **Limitation:** No API or structured data. Would need to scrape articles and extract claim + verdict pairs.
- **Effort:** MEDIUM-HIGH — scraping + NLP to extract structured claim/verdict pairs
- **Priority:** MEDIUM

### 5.2 ClaimBuster API — Automated Claim Detection

- **URL:** https://idir.uta.edu/claimbuster/
- **Format:** JSON API
- **Access:** Free API for research use
- **Data:** AI-powered check-worthiness scoring of political claims. Can score any statement for its likelihood of being a verifiable factual claim.
- **RAG improvement:** Pre-filter Hansard speeches to identify the most check-worthy claims. Flag statements that deserve scrutiny.
- **Example:** Score each speech in the RAG results by check-worthiness, highlight the most verifiable claims.
- **Effort:** LOW-MEDIUM — API call per speech, add score as metadata
- **Priority:** LOW (enhancement, not core data)

---

## Recommended Implementation Roadmap

### Phase 1 — Quick Wins (1-2 weeks each)

| Source | Tables to Add | Integration Method |
|--------|---------------|-------------------|
| ALRC Bills Data | `bills`, `bill_progress` | Download XLSX, convert to SQLite |
| Wikidata Politicians | Enrich `members` table | SPARQL harvest, merge by name/ID |
| Guardian API | `news_articles` | REST API, index by date/topic/MP |
| The Conversation RSS | `expert_analysis` | Parse RSS, store full text |
| Bills Digests | `bill_digests` | Scrape APH pages, index by bill |
| AustralianPoliticians | Enrich `members` table | Download CSV, merge |

### Phase 2 — Medium Effort (2-4 weeks each)

| Source | Tables to Add | Integration Method |
|--------|---------------|-------------------|
| AusTender OCDS | `government_contracts` | REST API, entity matching with donors |
| ABS SEIFA/Census | `electorate_demographics` | SDMX API, map to electorates |
| PBO Data Portal | `budget_analysis` | Download XLSX, extract tables |
| e-Petitions | `petitions` | Scrape APH pages |
| Committee Reports | `committee_reports` | GLAM Workbench harvest |

### Phase 3 — Longer Term (4+ weeks)

| Source | Integration Method |
|--------|-------------------|
| News APIs (multi-source) | Aggregate from NewsAPI/Mediastack/ABC RSS |
| Grattan/APO reports | Scrape + index report text |
| Productivity Commission | Download annual report data tables |
| Google Trends | Apply for alpha API access |
| RMIT Fact Check | Scrape + NLP extraction |

---

## RAG Architecture Changes Needed

To support these new sources, the RAG pipeline (`parli/rag.py`) needs:

1. **New context retrieval functions** — `_get_bills_context()`, `_get_contracts_context()`, `_get_news_context()`, `_get_demographics_context()`
2. **Source-aware system prompt** — update `SYSTEM_PROMPT` to inform the LLM about available data types
3. **Dynamic source selection** — not every query needs every source. Detect query type and retrieve relevant sources only.
4. **Citation format expansion** — currently cites speeches by speaker/date. Need to cite bills by name, contracts by ID, articles by URL, ABS data by dataset.
5. **Context budget management** — with more sources, total context will exceed model limits. Need relevance ranking across all sources, not just within speeches.

### Suggested New `get_context()` Flow

```
question -> detect_query_type() -> select_relevant_sources()
  -> parallel retrieve from each source
  -> rank all results by relevance
  -> truncate to context budget
  -> format with source headers
```

---

## Data Licensing Summary

| Source | License | Commercial OK? | AI Training OK? |
|--------|---------|----------------|-----------------|
| ALRC DataHub | Open (gov data) | Yes | Yes |
| AusTender OCDS | Open (gov data) | Yes | Yes |
| Guardian API | Free tier, attribution required | Non-commercial | Check ToS |
| The Conversation | CC BY-ND 4.0 | With attribution | Check ToS |
| Wikidata | CC0 (public domain) | Yes | Yes |
| ABS Data API | CC BY 4.0 | Yes | Yes |
| PBO | Open (parliamentary) | Yes | Yes |
| Bills Digests | Parliamentary (CC 3.0 BY-NC-ND) | Non-commercial | Check ToS |
| AustLII | Restricted | Limited | **NO — explicitly prohibits AI use** |
| APH Hansard | CC 3.0 BY-NC-ND | Non-commercial | Check ToS |

**Important:** AustLII explicitly prohibits use for AI training/RAG. Legislation text should be sourced from the Federal Register of Legislation instead.

---

## Summary: Top 5 Sources to Add First

1. **ALRC Bills Data** — fills the biggest gap (no bill lifecycle data at all). LOW effort, HIGH impact.
2. **Guardian API** — free, structured, 2.7M articles of political journalism. LOW effort, HIGH impact.
3. **AusTender Contracts** — enables "follow the money" from donations to contracts. MEDIUM effort, HIGH impact.
4. **Wikidata/AustralianPoliticians** — enriches MP profiles with biographical detail. LOW effort, MEDIUM impact.
5. **ABS Electorate Demographics** — enables fact-checking political claims against real data. MEDIUM effort, HIGH impact.
