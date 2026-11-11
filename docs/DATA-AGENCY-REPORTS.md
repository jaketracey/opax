# Agency annual reports (publisher PDFs)

Figures read from Commonwealth, state and territory agency annual reports that OPAX holds as
the publisher's own PDF. The MCP reads them through the `agency_reports` tool; the public
JSON is at `/agency-reports/`.

The tool is marked `mcpOnly`, so Ask's research loop is not offered it yet. Every tool Ask
offers adds its specification to each turn's input reserve, and the research loop reserves
each turn's ceiling against the $0.25 per-question cap (`ASK_MAX_MODEL_USD`) without
releasing it. With 34 Ask tools a run already reserves about $0.20 over four turns, so one
more tool of any size stopped the five-turn bill speech scenario (`ask-r2-said.test.mjs`,
NP-SAID-002) at the cap. Offering it to Ask is a one-line change once that budget is
revisited.

This complements two other datasets:

* `annual_reports` holds the Commonwealth's structured annual report tables from the
  Transparency Portal (key management personnel, executive bands, suppliers, headline
  figures). A Commonwealth PDF here is linked to its Portal body (`portal_body_id`) and
  carries operational figures only; the checker refuses pay, staffing and finance figures
  for a linked body, so nothing is held twice.
* `integrity_reports` holds integrity commission reports, findings and recommendations. An
  integrity commission's annual report that the integrity dataset already holds (same
  SHA-256) is registered here with `integrity_record` pointing to that record; only its
  operational counts are read here.

## Intake

Documents arrive as files, not fetches. The maintainer downloads each publisher PDF and
supplies a manifest (`opax-annual-reports-<date>/manifest.json`) with its source URL,
catalogue URL, SHA-256, size, edition and any rights notes.

    python -m parli.ingest.agency_reports stage --manifest <manifest.json>

`stage` checks every file's SHA-256 and size against the manifest before anything is kept,
copies the PDF to `~/.cache/autoresearch/agency-reports/files/<sha256>.pdf`, extracts page
text to `.../text/<sha256>.json` and writes `data/agency-reports/intake-<date>.json`. It
makes no network requests.

Editions are kept distinct, as the manifest labels them:

| edition | meaning |
| --- | --- |
| `current` | the latest year's report |
| `current_corrected` | the latest year's report, a corrected copy |
| `prior_edition` | the latest verified edition when the current year's report was not available at intake (`edition_note` says so) |
| `statutory_companion` | a separate statutory document for the same year, such as audited financial statements (`companion_of` names the report) |
| `statutory_return` | a statutory return, such as an assumed identities return |

## Reading figures

Each document's figures are in `data/agency-reports/facts/<report_id>.json`, written to the
brief in `data/agency-reports/EXTRACTION.md`. Every figure carries its metric, the label and
column as printed, the value exactly as printed, its unit, its period, the physical PDF page
and a verbatim quote of at most 320 characters that holds the value.

    python -m parli.ingest.agency_reports verify [--id <report_id>]

`verify` checks, for every figure: the metric and unit are known; the quote appears on the
cited page (whitespace normalised); the printed value is a whole figure inside the quote;
`value` is that number with no scaling; the label, column, band, name, position and
consultant appear on the page; and a Transparency Portal body carries no pay, staffing or
finance figure. A figure that cannot be quoted cleanly is dropped and its metric listed in
`not_found`. Scanned documents without a text layer are read only through the OCR path
below.

Rules for readers: no adding, subtracting, converting or rounding; no totals of a gender
split; no allegations, subjects of investigations or findings about any person; labels and
figures are the report's own.

## Scanned documents (on-device OCR)

A PDF with no text layer is read on the Mac, with nothing sent to a cloud service:

    python -m parli.ingest.agency_ocr render --id <report_id>   # pdftoppm, 300 dpi page images
    python -m parli.ingest.agency_ocr vision --id <report_id>   # Apple Vision (scripts/ocr/vision_ocr.swift)
    python -m parli.ingest.agency_ocr rows   --id <report_id>   # data/agency-reports/ocr/<report_id>.json

Vision runs `VNRecognizeTextRequest` at the accurate level with language correction off, so
figures are not rewritten from a dictionary (it has no en-AU model; en-US is its English).
Page images and raw Vision output stay in the cache beside the PDF
(`~/.cache/autoresearch/agency-reports/ocr/<sha256>/`); the committed OCR file holds each
page's text twice, in column reading order and as left-to-right rows, so a table row reads
as its label and figures. `page_text` uses it for every page that has no text layer
(the whole document for a scan, or only the image pages of a mixed PDF), so OCR figures
pass the same verbatim checks against the OCR text, and the checker asks for the
`extraction` note on any figure cited to such a page.

A local vision model is the second reader (`scripts/ocr/vlm_read.py`, loopback only; on
11 Nov 2026 Qwen3.8-Flash-Next 2.75bpw served by sushi). Every OCR figure carries
`extraction: {method: "ocr", engine, check}`, where `check` is `both_readers_agree`,
`page_image_checked` or both; the checker refuses a figure from a scanned document without
it. The tool and the public JSON say a figure came from a scan. Anything the readers or the
page image leave uncertain (chart values tied to their category only by colour, cells OCR
dropped) is left out and noted.

## Export

    python scripts/export_agency_reports.py

re-checks every figure against the page text and stops (exit 1) if any fails, then writes
`portal/public/agency-reports/`:

* `index.json`: meta (counts by jurisdiction and metric, metric and unit definitions,
  caveats) and one row per document, with its edition, status (`read`,
  `not_read_no_text`, `not_read`), figure count, `not_found`, links and rights notes.
* `facts-<jurisdiction>.json`: every figure for one jurisdiction, each with a
  page-anchored link to the publisher's PDF (`#page=N`).
* `manifest.json`: counts and file hashes.

`--skip-verify` exports on a machine without the page text cache; it is not a way past a
failing figure. The export is not part of the weekly refresh: it changes only when a new
intake or new facts land.

## Rights

OPAX publishes figures, short verbatim quotes and links, not the PDFs. Each document keeps
the rights or attribution note the intake recorded (for example the Northern Territory's
reserved reproduction and Territory Stories attribution).

## Intake of 11 November 2026

38 documents (39 files with the AGOR roster), all hashes verified:

* Commonwealth 5 (Finance, Treasury and the APSC linked to the Portal; the NACC linked to
  both the Portal and the integrity dataset; the Inspector of the NACC read in full).
* NSW 20, Victoria 6, and one each from Qld, WA, SA (plus its financial statements), Tas,
  ACT and NT integrity commissions.
* 36 documents read, 797 figures, at intake. The NT ICAC annual report and the NSW ICAC
  assumed identities return are scans without a text layer; they were read later the same
  day by on-device OCR (26 and 4 figures).
* IBAC and WA CCC are 2024-25 editions (`prior_edition`): their 2025-26 reports were not
  available at intake.

## Victorian tabled reports, 11 November 2026 (OPAXBot)

`python -m parli.ingest.agency_catalogue vic` lists the papers the Parliament of Victoria's
tabled documents database types as annual reports (filter `tabled-type=49`) and titles
for 2025-26: 212 papers tabled or released from 1 July to 11 November 2026, 189 of them
annual reports (the rest are statutory reports under particular Acts). The API ignores
its sort and date parameters, so the year term and the document-type filter do the
selecting. `catalogue-vic-2026-11-11.json` keeps the list.

`fetch` took 22 of them (the remaining departments, Victoria Police, the Ombudsman,
Integrity Oversight Victoria, the VPSC, OVIC, the Commission for Children and Young
People, TAC, WorkSafe, VMIA, VFMC, TCV, SRLA, Development Victoria, Parks Victoria,
Melbourne Water, the VGCCC and Victoria Legal Aid) from the Parliament's tabled copies with
OPAXBot (`intake-2026-11-11-vic-tabled-wave2.json`, `acquisition: "OPAXBot fetch"`); 651
figures read. The Department of Education's 2025-26 report is not in the database under
that year term; its publisher copy is in the first intake.

A third batch took 30 regulators, statutory authorities and service bodies the same way
(`intake-2026-11-11-vic-tabled-wave3.json`): the ESC, Energy Safe Victoria, the Building
and Plumbing Commission (VBA), Consumer Affairs Victoria, the Health Complaints and
Disability Services Commissioners, the Mental Health Tribunal, the Social Services
Regulator, the VLSB+C, the LHLA, Infrastructure Victoria, the VCAA, VIT, VRQA, Respect
Victoria, the First Peoples' Assembly, Cenitex, Ambulance Victoria, VICSES, Triple Zero
Victoria, VicTrack, V/Line, Ports Victoria, VECRA, the Judicial College, VIFM, Cladding
Safety Victoria, the PLSBA, the GMA and the VEWH; 554 figures read. Several of these
publish no financial statements of their own (their accounts sit in a department's
report), so their documents carry operational counts only. VECRA's statements cover its
first six months (1 January to 30 June 2026), as its period field says.

A fourth batch took 32 more (`intake-2026-11-11-vic-tabled-wave4.json`): the metropolitan
and large regional health services (Austin, Bayside, Monash, Eastern, Northern, Western,
Melbourne Health, the Royal Children's, the Royal Women's, the Eye and Ear, Barwon,
Grampians, Goulburn Valley, Albury Wodonga, Latrobe Regional, Mildura Base, South West
Healthcare, St Vincent's and Mercy), seven water corporations, VicHealth, Safe Transport
Victoria, Greyhound Racing Victoria, the NGV, SEC Victoria and the Australian Grand Prix
Corporation; 500 figures read. Most health services print responsible persons' pay in
bands without tying a band to the chief executive, so `head_remuneration` is usually in
`not_found` for them. Mildura Base's financial statement pages have no usable text
layer; its money figures come from the readable five-year summary.

A fifth batch took the rest (`intake-2026-11-12-vic-tabled-wave5.json`, 113 reports,
10,541 pages). The catalogue was refreshed first (`catalogue-vic-2026-11-12.json`, window
1 July to 12 November 2026): 17 annual reports had been tabled since 11 November, two of
them departments already held, so the 102 left from the fourth batch became 113. They are
the smaller rural and regional health services, Peter MacCallum, HealthShare and Oral
Health Victoria, seven water corporations, eight catchment management authorities, four
cemetery trusts, the arts, museum, library and sport trusts, the ports and rolling stock
companies, North East Link State Tolling, the VEC, AMES, the ACFE Board, VITS LanguageLoop
and others; 1,531 figures read. All 196 annual reports in the catalogue are now held; the
18 statutory reports it also lists are not part of this dataset.

Three of these reports have no text layer at all (the Victorian Convention and Event
Trust, Docklands Studios Melbourne and Melbourne Port Lessor). They were read by the OCR
path below, with each figure checked against its page image; 32 figures, and cells the
OCR misread were left out. Several others have a text layer on most pages but print some
statement pages as images or with an unreadable encoding (Mallee Track Health pp 43 to 72,
Boort District Health, Omeo District Health, Colac Area Health, South Gippsland Water
pp 86 to 129, East Gippsland Water pp 97 to 137, Mallee CMA pp 96 to 100). Their money
figures come from the readable five-year summary or are listed in `not_found`; those pages
can be read by OCR later.

Consultancy tables print each counterparty as the body names it. Where a body engaged a
sole trader, the row carries that person's name as printed in the body's own disclosure
table (Portland District Health and Alpine Health, for example); nothing else is said
about them. Where a consultancy table prints "-" for expenditure in the year, the row uses
the column the body did fill (for example the total approved fee) and names that column.

## Catalogue hosts and OPAXBot, 11 November 2026

`python -m parli.ingest.agency_catalogue probe` asked each catalogue host named in the
intake manifest for its robots.txt and catalogue page once, as OPAXBot
(`catalogue-probe-2026-11-11.json`):

| Jurisdiction | Catalogue | Result |
| --- | --- | --- |
| NSW | parliament.nsw.gov.au tabled papers | HTTP 403 (refused) |
| Vic | parliament.vic.gov.au tabled documents | answered |
| Qld | parliament.qld.gov.au tabled papers | HTTP 403 (refused) |
| WA | parliament.wa.gov.au tabled papers | HTTP 403 (refused) |
| SA | parliament.sa.gov.au tabled papers | answered |
| Tas | parliament.tas.gov.au tabled papers | answered |
| ACT | act.gov.au annual reports directory | answered |
| NT | parliament.nt.gov.au tabled papers | HTTP 403 (refused) |

Refused hosts are not tried by any other route; NSW, Qld, WA and NT agency coverage depends
on maintainer intakes or on each agency's own site answering OPAXBot.

## Commonwealth latest year against AGOR, 11 November 2026

`agor-reconciliation-2026-11-11.json` compares the AGOR register (Department of Finance,
as at 30 June 2026, from the maintainer's intake) with the Transparency Portal bodies in
the `annual_reports` dataset (snapshot 10 November 2026), counting only bodies AGOR marks
as preparing and tabling an annual report:

| AGOR class | Bodies reporting | Matched to a Portal body | With a 2025-26 report on the Portal |
| --- | --- | --- | --- |
| A. Primary body | 190 | 188 | 94 |
| B. Secondary statutory structure | 70 | 4 | 2 |
| C. Secondary non-statutory structure | 15 | 0 | 0 |

The unmatched class A bodies are the Defence and Veterans' Service Commission (created
29 September 2025) and Export Finance Australia (a name difference). The 94 class A bodies
without a 2025-26 Portal report have not yet published it there; the weekly Portal refresh
picks them up as they appear, and the file lists them for a later check. Class B and C
bodies mostly report inside a parent's annual report or outside the Portal; they are a
later wave for this dataset.

