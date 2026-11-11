# Integrity commission reports

Australia's anti-corruption and integrity commissions publish investigation reports,
special reports, public inquiry reports, prevention and research reports, and public
statements. OPAX loads them as official-report data: each report with its type and
date, the bodies and public roles it names as investigated, its findings or opinions
quoted in the commission's own words and labels, its numbered recommendations, and
any agency response or implementation document the commission publishes. Ask and the
MCP read them through the `integrity_reports` tool.

Victoria's IBAC uses the same schema, exporter, tool and validator (adapter
`vic_ibac`), read from the copies tabled in the Parliament of Victoria. Royal
commissions and other inquiries are a separate dataset
(`portal/public/royal-commissions/`) and are not part of this one.

## Rules the data follows

* Official public sources only: the commission's own site, or a Parliament or
  archive copy of the same document. Every finding, recommendation and response
  cites the document, URL and page (PDF links open at `#page=N`).
* Findings are the commission's own conclusions, in its own words and with its own
  label (for example "serious corrupt conduct", "opinion of serious misconduct",
  "Determination"). Allegations, submissions, the scope of an investigation and
  "may have occurred" wording are not findings. Each item's text must appear
  verbatim on the cited page, or the build fails.
* Finding kinds: `finding`, `opinion` (WA, Qld style), `no_finding` (an express
  statement that no finding or opinion is made, or that conduct was not
  established), `prosecution_statement` (NSW section 74A(2) statements), `other`.
  A finding of corrupt conduct or misconduct is not a finding of criminal guilt.
  Statutory terms differ between commissions, so counts are not comparable.
* Names appear only as the report prints them. Pseudonyms stay pseudonyms (records
  note where a report says it uses them). OPAX adds no names and builds no person
  pages from this data.
* Unknown stays unknown. Each list carries a status: `extracted`, `stated_none` (the
  report says it makes none) or `not_extracted` (OPAX did not read it; unknown, not
  absent). Responses: `published`, `none_found`, `not_checked`.
* Report types: `investigation_report`, `special_report`, `public_inquiry_report`,
  `prevention_research_report`, `statement`, `other` (annual reports and similar).
  The commission's own label is kept in `type_as_published`. NACC and SA ICAC
  statements are labelled `statement`, never reports.
* Dates carry their basis: `tabled`, `published` or `dated` (the date printed on the
  report). Undated reports stay undated.

## Source access

Requests use the honest OPAXBot identity through `parli.ingest.http`, paced at the
greater of each adapter's interval and the host's robots.txt crawl-delay, with a
request ceiling per run. robots.txt is read with an RFC 9309 parser (wildcards,
blank lines inside groups). A 401, 403 or challenge pauses the body (exit 4) and its
last snapshot stays. OPAX does not change identity, browser fingerprint or route to
get past a refusal; refusing hosts are recorded as gaps below.

## Coverage by commission

Counts are what OPAX extracted on 11 November 2026, not what each commission has
published in total.

| Commission | Reports and statements | Dates | Findings (reports with) | Recommendations (reports with) | Responses (reports with) | Source |
| --- | --- | --- | --- | --- | --- | --- |
| NACC (Cth) | 8 | 2024-10-09 to 2026-05-13 | 19 (8) | 4 (2) | 0 (0) | Manual supplement (8 reports); automated gap |
| IBAC (Vic) | 91 | 2013-10-15 to 2026-10-15 | 0 (0) | 110 (22) | 4 (3) | Parliament of Victoria tabled copies; Sandon progress report from the manual supplement |
| NSW ICAC (NSW) | 233 | 1994-03-01 to 2026-08-28 | 104 (27) | 340 (25) | 102 (27) | www.icac.nsw.gov.au |
| Qld CCC (Qld) | 107 | 1991-04-18 to 2026-11-09 | 1 (1) | 121 (9) | 4 (4) | www.ccc.qld.gov.au |
| WA CCC (WA) | 147 | 2004-12-17 to 2026-10-01 | 113 (53) | 148 (45) | 21 (20) | www.ccc.wa.gov.au |
| SA ICAC (SA) | 137 | 2014-10-30 to 2026-10-26 | 16 (2) | 353 (17) | 1 (1) | icac.sa.gov.au |
| Tas Integrity Commission (Tas) | 2 | 2025-12-02 to 2026-10-29 | 46 (1) | 92 (1) | 1 (1) | Manual supplement (2); automated gap |
| ACT Integrity Commission (ACT) | 12 | 2022-02-03 to 2026-07-23 | 15 (12) | 0 (0) | 0 (0) | www.integrity.act.gov.au |
| NT ICAC (NT) | 1 | 2026-10-22 to 2026-10-22 | 0 (0) | 0 (0) | 0 (0) | Manual supplement (1); automated gap |
| **Total** | 738 | | 314 | 1168 | 133 | |

### Gaps and limits

* **NACC (Cth).** www.nacc.gov.au gave OPAXBot no response on 11 November 2026
  (HTTP/1.1 timeouts, HTTP/2 stream resets at the Akamai edge), and
  webarchive.nla.gov.au answered 403. Automated collection stays paused. Eight
  investigation reports are included from the manual supplement (below). Later
  reports and NACC statements are not included.
* **Tasmania.** www.integrity.tas.gov.au (Cloudflare) answered 403. The Karamu
  report (No. 1 of 2025) and the 2025-26 annual report are included from the manual
  supplement. Earlier tabled investigation reports are not included. Parliament of
  Tasmania tabled paper lists are rendered by a script from a separate data service
  that is not built yet.
* **NT.** icac.nt.gov.au and parliament.nt.gov.au answered with a Cloudflare
  challenge, and Territory Stories disallows PDFs in robots.txt. The 2025-26 annual
  report (Tabled Paper 877) is included from the manual supplement. Investigation
  reports and public statements are not included; Tabled Papers 875 and 876 are
  still to be supplied.
* **IBAC (Vic).** www.ibac.vic.gov.au answered OPAXBot with HTTP 403 (CloudFront) on
  11 November 2026, for its pages and its robots.txt. OPAX reads IBAC's reports from
  the copies tabled in the Parliament of Victoria (tabled documents database), with the
  Government's tabled responses attached by operation name. Publications IBAC does not
  table (research and prevention reports, recommendation-progress pages, agency
  responses published only on its site) are not loaded. Some tabled papers have no
  online document; the Special report on Operation Sandon is one ("available upon
  request" from the Parliament), so its recommendations are not loaded. The Victorian
  Government's Operation Sandon January 2025 progress report is attached to that record
  as a government response (`progress_report`) from the manual supplement; it is the
  Government's progress report to IBAC, not an IBAC report, and it is undated beyond
  "January 2025", so its date is left empty. Findings and opinions are not extracted:
  IBAC states them in narrative form and OPAX does not label them by inference.
* **NSW ICAC.** robots.txt disallows `/reports`; investigation pages and
  `/ArticleDocuments` PDFs are allowed and used. Reports made public before 2016 are
  not online (the ICAC keeps a summary only), so those records hold the summary.
  Action plans and progress reports are listed as documents; their per-recommendation
  status is not parsed. Scanned PDFs are not OCRed.
* **Qld CCC.** Many 1991 to 2011 pages link no report document. Findings are
  extracted only where a report states it makes no finding about any person
  (section 48B); older reports state outcomes in narrative form. The Fitzgerald
  Inquiry report is a commission of inquiry and is excluded. Two summary-style
  reports (misuse of public monies 2010, Forensics 2002) set commentary between
  their numbered recommendations, so those recommendations are not extracted.
* **WA CCC.** Only the reports listing is covered (not annual or quarterly reports or
  media releases). Opinions are extracted only where stated in a sentence on one page.
* **SA ICAC.** The Office for Public Integrity publishes only annual reports, which
  are excluded. Since October 2021 the Commission does not make findings of corrupt
  conduct. Findings are extracted only from Oakden (2018) and Gillman (2015).
* **ACT.** Confidential reports to Assembly committees are not published. The
  Commission's reports quote numbered recommendations of other bodies but make none
  of their own in numbered form; those are not recorded. Ministerial responses go to
  the Assembly and are not loaded.
* No OCR anywhere except to confirm the identity of the NT scan (first three pages).

Each body's full gap list is in `index.json` (`bodies[].gaps`) and in `view=bodies`.

### Rights

| Commission | Terms | How OPAX uses the material |
| --- | --- | --- |
| NACC | CC BY 4.0 (page 2 of each report), except the Coat of Arms, logo, third-party material, trade marks and images | Verbatim extracts with attribution |
| IBAC | IBAC copyright in each report; tabled copies published by the Parliament of Victoria (https://www.parliament.vic.gov.au/copyright/). The Sandon progress report carries no reuse notice | Short verbatim recommendations with citations and links; the Sandon progress report is listed and linked only |
| NSW ICAC | Copyright, all rights reserved apart from fair dealing | Short verbatim findings and recommendations with citations and links (needs Jake's confirmation; see follow-ups) |
| Qld CCC | Website material CC BY 4.0 unless otherwise noted | Verbatim extracts with attribution |
| WA CCC | Commission copyright in each report; fair dealing only; no website licence page | Short verbatim extracts with citations and links |
| SA ICAC | Copyright; no open licence | Short verbatim extracts with citations and links |
| Tas | Commission copyright; reuse under the Tasmanian Government terms (https://www.tas.gov.au/codi) | Verbatim extracts with attribution |
| ACT | Commission copyright; unaltered reproduction for personal, educational or non-commercial use with attribution | Verbatim extracts with attribution |
| NT | Reproduction reserved except as copyright law permits; Territory Stories attribution to Library & Archives NT | Metadata and citation only (no text) |

## Manual publisher-download supplement

Where a commission's host does not answer OPAXBot, the OPAX maintainer may download
reports in a browser from the publisher's own site and supply byte-identical copies
with a manifest (source URL, sha256, page count, reuse terms). The first supply is
dated 11 November 2026: eight NACC investigation reports, the Tasmanian Karamu report
and 2025-26 annual report, the NT 2025-26 annual report, and the Victorian Government's
Operation Sandon January 2025 progress report (www.vic.gov.au; recorded in
`vic_ibac.MANUAL_RESPONSES` as a response on the IBAC Sandon record, with its sha256,
and read from `<cache>/manual/vic_ibac/`).

* `python -m parli.ingest.integrity.manual build --intake <dir>` checks each file's
  sha256 against the manifest, copies it to `<cache>/manual/<body>/` (outside git),
  reads the text, and writes `parli/ingest/integrity/manual-supplement.json`
  (committed: extracted records and citations only, never the PDFs).
* Findings and recommendations are cut from the page text by anchors and must be
  verbatim on the cited page. NACC findings are the Commissioner's conclusions in the
  Findings or Determination sections; submissions reproduced in a report (for
  example the Pentecost appendix) are not findings. Karamu findings are the systemic
  "Findings" paragraphs of each chapter (the report states it made no findings about
  individual misconduct) and its 92 recommendations come from Appendix 2.
* Each record and document carries `acquisition: "manual publisher download supplied
  by the OPAX maintainer, 11 Nov 2026"`, and citations point at the publisher URL.
  The tool marks these rows and says coverage for that commission is partial.
* `run.py` merges supplement records into the body's snapshot on every refresh, so the
  weekly refresh never needs the files and never fetches a refusing host by another
  route. Source access settings are unchanged and the automated gap notes stay. If an
  adapter later loads the same document (same sha256 or URL), the adapter record is
  kept and a note records the match.
* Annual reports are `other`, with no findings or recommendations.

## Public hearing transcripts (12 November 2026 intake)

The OPAX maintainer supplied 486 publisher PDFs of public hearing transcripts with a manifest
(publisher URL, SHA-256, bytes, page count, rights and orders). `python -m
parli.ingest.integrity.transcripts build --intake <dir>` checks every file against the
manifest (all matched), copies it to `<cache>/manual/transcripts/<sha256>.pdf` (never
committed, never fetched by the refresh), checks the hearing date on the transcript's first
pages, and writes `parli/ingest/integrity/transcripts.json`: metadata, citations and rights
only. No transcript text is committed or published.

| Commission | Transcripts | Cases |
| --- | --- | --- |
| NSW ICAC | 256 | Operations Navarra, Rosny, Scandi and Wyvern (current public inquiries) |
| NSW LECC | 24 | Operations Almas, Brugge, Corwen, Cusco, Gennaker, Makalu (opening address), Mantus |
| Qld CCC | 160 | Belcarra, Taskforce Flaxton, Impala, Grand, Tesco, a 2009 misuse of public monies investigation, separation issues in the public sector, the escort agency inquiry |
| ACT Integrity Commission | 17 | Operation Kingfisher |
| IBAC | 17 | Operation Gloucester (each carries IBAC's suppression order link) |
| WA CCC | 9 | Public examinations into the Parliamentary Commissioner for Administrative Investigations |
| SA ICAC | 3 | Review of Legislative Schemes hearings |

Rules:

* Every transcript carries the label "Hearing transcript: evidence, not findings". What a
  witness, counsel or a commissioner says in a hearing is evidence, submission or
  questioning; only a report states findings.
* Titles are neutral: case, document type and date (with the ICAC transcript page range, and
  "part n of m" where one day has several documents). The publisher's own link label, which
  for the Qld CCC often names the witness, is kept as `title_as_listed` in the registry for
  provenance only: it is left out of the public files and tool rows and never used for search.
* Dates: 482 are read on the transcript itself (`date_quote`, `date_page`). Two listings
  differ from the cover (ICAC Wyvern, listed 31 October 2025, dated 30 October; LECC
  Gennaker, listed 4 December 2019, dated 5 December); the cover date is used and the
  difference noted. Four keep the publisher's listing date (`date_basis:
  publisher_listing`): three LECC scans without a text layer and one Flaxton cover whose
  date is garbled in its text layer.
* Publisher redactions: five transcripts are the publisher's redacted editions
  (`publisher_redacted`). No corrected editions were supplied in this intake.
* Rights and orders travel with each transcript (`rights`, `reuse_status`, `copyright_url`,
  `terms_url`, `orders`). OPAX links the publisher's copy and republishes no text.
* The 21 Qld CCC public forum transcripts the publisher authorises for viewing only are
  listed as links (`publisher_view_only`), not supplied, read or indexed.

The export writes `transcripts-<body>.json` (cases and transcripts, newest first), adds a
`transcripts` block to `index.json`, and gives each report whose operation had these hearings
a `transcripts` summary (ACT Kingfisher, Qld Impala, Flaxton, Belcarra and Tesco, IBAC
Gloucester). The `integrity_reports` tool's `view=transcripts` lists them by body, operation,
words and `since`/`until`.

## Coverage still open

* NT Tabled Papers 875 and 876 (Territory Stories).
* Tasmanian historic tabled investigation reports.
* Remaining Commonwealth royal commission volumes (royal commissions dataset).
* SA Royal Commission into Domestic, Family and Sexual Violence (royal commissions dataset).
* Tasmanian Commission of Inquiry into child sexual abuse volumes (royal commissions dataset).
* NSW Special Commission of Inquiry into Healthcare Funding (royal commissions dataset).
* IBAC publications that are not tabled, and the Special report on Operation Sandon
  itself (no online tabled copy; www.ibac.vic.gov.au refuses OPAXBot).
* Per-recommendation status in the Operation Sandon progress report (listed as a
  document; status not parsed).

## Code and files

* Adapters: `parli/ingest/integrity/<body>.py` (`nacc`, `nsw_icac`, `vic_ibac`, `qld_ccc`,
  `wa_ccc`, `sa_icac`, `tas_ic`, `act_ic`, `nt_icac`), shared code in `common.py`.
  Each exports `BODY`, `GAPS`, `MIN_RECORDS`, optional `KNOWN_GAP`, and
  `collect(client)`.
* Runner: `python -m parli.ingest.integrity.run refresh [--body X] [--offline]`.
  Raw HTML, PDFs and text go to `~/.cache/autoresearch/integrity-commissions/`
  (override with `OPAX_INTEGRITY_CACHE`); snapshots to `snapshots/<body>.json`, with
  duplicate-id, minimum-record and 10% shrink guards (exit 3 holds a body). Bodies
  marked `KNOWN_GAP` are reported as gaps and do not change the exit code.
* Exporter: `scripts/export_integrity_reports.py` reads every schema-1 snapshot and
  writes `portal/public/integrity-reports/`: `index.json` (meta and caveats, bodies
  with coverage, licence and gaps, one summary row per report), `reports-<body>.json`
  (full records) and `manifest.json` (counts and hashes). It refuses a record without
  citations or labels and a body that shrinks more than 10%.
* Weekly refresh: `integrity_reports` and `x_integrity_reports` steps in
  `scripts/weekly_refresh.sh` (both STALE_OK). Data group `integrity-reports`,
  checked by `scripts/vm/validate_data.py`.
* Tool: `portal/src/tools/integrity-reports.ts`. Views `reports`, `report`
  (`part=findings|recommendations|responses|documents`), `findings`,
  `recommendations`, `bodies`. Registered since
  `structured-tools-11-integrity-reports` (now `structured-tools-12-royal-commissions`).
* Tests: `tests/test_integrity_*.py` (offline fixtures; the network is blocked) and
  `portal/test/integrity-reports-tool.test.mjs`.

## Record schema (shared with IBAC)

```
id, body, jurisdiction, title, operation, report_type, type_as_published,
date, date_basis, page_url, pdf_url, summary,
documents[]       {role, title, url, status, sha256?, bytes?, pages?, acquisition?}
subjects[]        {name, kind: body|public_role, cite}
findings[]        {n, label, kind, text, cite}
recommendations[] {number, text, cite}
responses[]       {kind, title, url, date, recommendation?, status_as_published?, text?, cite?}
findings_status, recommendations_status, responses_status, notes[],
acquisition?, rights?
cite = {url, document, page?, section?}
```

`id` is `<body prefix>-<date or "undated">-<slug>`. A snapshot is
`{schema: 1, body, name, short, jurisdiction, site, licence, built_at, gaps, counts, records}`.
