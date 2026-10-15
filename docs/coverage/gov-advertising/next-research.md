# Next queue research — 16 October 2026 Melbourne

Research only: no candidate dataset files were downloaded or ingested. The
[28-request receipt ledger](next-receipts.json) records 21 HTTP 200s, two 404s,
two 301s, one 403/challenge and two timeouts without HTTP responses. Requests
were sequential, using the shared OPAXBot identity, with a minimum **5.1001
seconds between starts**. No proxy, automatic redirect, alternate identity,
browser source acquisition, archive or Firecrawl was used. A refusal stopped
that host; no challenge/error response body was saved. Successful research
pages are private local evidence, outside public assets and Git.

The five ranked candidates and scoring rationale are in [COVERAGE.md](../../COVERAGE.md#next).
Scores use public interest × availability × licence clarity, each 1–5.
Website grants with document exceptions score 4, not blanket file clearance.

| Rank | Candidate | Score | Evidence and limits |
| --- | --- | --- | --- |
| 1 | ABS annual Government Finance Statistics | 5 × 5 × 4 = 100 | [2024–25 release](https://www.abs.gov.au/statistics/economy/government/government-finance-statistics-annual/latest-release) and [terms](https://www.abs.gov.au/website-privacy-copyright-and-disclaimer#copyright-and-creative-commons) both 200. Official download links include XLSX government/sector tables. Website CC BY 4.0 excludes branding, third-party material and microdata. Keep workbook-specific notices, consolidation levels, units and revisions. Annual cadence. |
| 2 | Treasury Tax Expenditures and Insights Statement | 5 × 4 × 4 = 80 | [2025–26 publication](https://treasury.gov.au/publication/p2025-721342) and [terms](https://treasury.gov.au/copyright-disclaimer) both 200. PDF/Word and Excel chart-data links, not a verified full machine-readable concession register. CC BY 4.0 website grant excludes branding and third-party material. Estimated revenue forgone is distinct from spending; concessions cannot be assumed additive. Annual cadence. |
| 3 | Victorian advertising | 4 × 4 × 4 = 64 | [Index](https://www.vic.gov.au/advertising-plans-and-spend), [2023–24 report landing](https://www.vic.gov.au/victorian-government-advertising-report-2023-24) and [copyright](https://www.vic.gov.au/copyright) all 200. Stable report/plan pages and document links. CC BY 4.0 website grant with third-party/branding exceptions; check every report/table imprint. Campaign and non-campaign expenditure stay distinct. Annual cadence. |
| 4 | NSW audit metadata | 4 × 4 × 2 = 32 | [Report index](https://www.audit.nsw.gov.au/our-work/reports) 200. The guessed `/copyright` route returned 404; footer supplied no applicable open licence. Metadata first, after actual policy discovery. This separate audit host does not inherit the NSW portal grant. Tabling/event cadence. |
| 5 | NSW Community Building Partnership programme/round metadata | 4 × 2 × 4 = 32 | The [old successful-grants path](https://www.nsw.gov.au/projects/community-building-partnership/successful-grants) returns 301 to the [current programme page](https://www.nsw.gov.au/grants-and-funding/community-building-partnership), which returned 200 after the same-host robots check. [NSW terms](https://www.nsw.gov.au/nsw-government/about-website/copyright) returned 200: CC BY 4.0 with explicit exceptions. The page's dynamic grant search does not prove an accessible award-row endpoint or historical completeness. Research that endpoint first; availability deliberately scores 2. No SmartyGrants account or application data requested. Round/event cadence. |

The tie at 32 favours the broader audit catalogue. Zero rows are estimated from
HTML link counts. No source is marked covered by this research.

| Additional candidate | Evidence / hold |
| --- | --- |
| Productivity Commission RoGS | [Landing](https://www.pc.gov.au/ongoing/report-on-government-services/) and [CC BY 4.0 terms](https://www.pc.gov.au/copyright/) returned 200. The linked `/ongoing/report-on-government-services/2026/data-downloads/` path is disallowed by robots `/*/data`. It was **not requested**; no attempt was made to acquire the files through another route or host. Robots SHA-256 `182b2f309787309a9283113fa91453f7a8fbe859bb5de6d705f9dfdbc18a60e8`. Hold dataset access. |
| PBO election commitments | `https://www.pbo.gov.au/robots.txt` timed out at 21:21:09 UTC on 15 Oct. Zero response bytes, no HTTP status. No publication or licence page requested. Hold access/rights verification; previous search-index data-portal discovery is not clearance. |
| APSC workforce aggregates | `https://www.apsc.gov.au/robots.txt` timed out at 21:21:46 UTC. No employment release or licence page requested. Hold access/rights verification; no employee records proposed. |
| AIHW health expenditure | `https://www.aihw.gov.au/robots.txt` returned 403 and challenge markup at **21:26:39 UTC**, response SHA-256 `e8af0e1c359ff60f1d882a98d97009ddd9535c41bf9eec71629507b7ee62e425`. Stopped immediately; no copyright/report page requested and no challenge body retained. |
| VAGO audit bodies | [Homepage](https://www.audit.vic.gov.au/) and [copyright](https://www.audit.vic.gov.au/copyright) returned 200; policy prohibits reproduction/reuse for commercial purposes. Permission needed before body reuse. `/reports` returned 404, not a challenge. Do not borrow another Victorian publisher's open grant. |
| NSW budget | `https://www.budget.nsw.gov.au/robots.txt` returned 301 to a separate redirects host. No usable robots policy established, redirect not followed, no budget content requested. Hold route/terms discovery; this is not a claim of a challenge or prohibition on reuse. |

Earlier holds are carried in COVERAGE.md: QAO PDFs need document-level rights
clearance; Queensland Cabinet supplied challenge markup; PM&C FOI challenged,
with DFAT/DSS/Infrastructure timeouts in the other lane's handoff; ECQ remains
access-held as supplied by the orchestrator, without an exact receipt in this
baseline. None was retried here. New research holds supplement those existing
items rather than replacing or silently clearing them.
