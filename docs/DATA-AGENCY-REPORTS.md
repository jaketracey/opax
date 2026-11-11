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
`not_found`. Scanned pages without a text layer are not read (no OCR).

Rules for readers: no adding, subtracting, converting or rounding; no totals of a gender
split; no allegations, subjects of investigations or findings about any person; labels and
figures are the report's own.

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
* 36 documents read, 797 figures. Not read: the NT ICAC annual report and the NSW ICAC
  assumed identities return (scans without a text layer).
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
that year term; its publisher copy is in the first intake. The other 167 catalogued
reports (health services, water corporations, catchment authorities, cemetery trusts,
arts and sport bodies and others) are the next waves.

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

