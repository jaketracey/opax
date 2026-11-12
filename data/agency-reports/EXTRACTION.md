# Reading figures from agency annual reports

How the files in `data/agency-reports/facts/` are written. Each file holds figures read
from one document in `data/agency-reports/intake-*.json`, and every figure must pass
`python -m parli.ingest.agency_reports verify --id <report_id>`.

## Inputs

* The document's page text: `~/.cache/autoresearch/agency-reports/text/<sha256>.json`, a JSON
  list with one string per physical PDF page (page 1 first). Use these page numbers, not
  the numbers printed in the footer.
* The intake row (report id, agency, year, edition, links to existing OPAX data).

## Output file

`data/agency-reports/facts/<report_id>.json`:

```json
{
  "report_id": "nsw-nsw-ombudsman-2025-26-annual-report",
  "read_by": "extraction lane, 2026-11-11",
  "pages_read": "all",
  "not_found": ["head_remuneration"],
  "facts": [
    {
      "metric": "staff_fte",
      "label_as_published": "Total",
      "column_as_published": "2026",
      "value": 254.9,
      "value_as_published": "254.9",
      "unit": "fte",
      "period": "as at 30 June 2026",
      "page": 59,
      "quote": "Total 250.1 254.9"
    }
  ]
}
```

Fields:

* `metric`: one of the keys in `METRICS` in `parli/ingest/agency_reports.py`.
* `label_as_published`: the row or heading label exactly as printed on that page.
* `value_as_published`: the figure exactly as printed (`"$1,234"`, `"254.9"`, `"12"`).
  `value` is that same number with no scaling or rounding: `"$1.2m"` is `1.2` with unit
  `millions_of_dollars`; `"$'000 4,512"` is `4512` with unit `thousands_of_dollars`.
  Use `null` for `value` when the figure is a band or range ("$400,000 to $419,999"), and
  keep the text in `value_as_published`.
* `unit`: dollars, thousands_of_dollars, millions_of_dollars, people, fte, count,
  percent, days. Take it from the table heading or column; never guess.
* `period`: the reporting year or date the figure is for, in the report's words.
* `column_as_published`: when a table has columns for several years, the heading of the
  column the value comes from (always the latest year unless a fact says otherwise).
* `page`: physical PDF page (1-based) whose text contains the quote.
* `quote`: a short verbatim span of that page's text (at most 320 characters) that
  contains `value_as_published`, ideally with its label. Whitespace and line breaks are
  normalised by the checker, so a table row reads "Total 250.1 254.9".
* Extra fields by metric: `executive_band` needs `band` (and `count` as the value);
  `named_remuneration` needs `name` and `position` exactly as printed; `consultancy`
  needs `counterparty` (and `purpose` when printed). Each extra text field must appear
  on the cited page.
* Names stay exactly as the report prints them, including individuals in executive,
  remuneration and consultancy tables (Jake's ruling on PR #278). Do not drop, initial
  or redact a printed name, and do not add a name the report does not print.

## What to read

Read the whole document. Record the figures the metrics name, as the report states them:

* Pay: the agency head's or accountable officer's remuneration (amount or band); every
  row of a senior executive band table (count per band for the latest year; a gender
  split is fine as separate facts only if no total is printed); total executive or key
  management personnel remuneration; averages where printed; a named person's
  remuneration only where the report prints the name, position and amount together.
* Workforce: total FTE and headcount for the latest year.
* Money: total expenses, total income or revenue, employee expenses, net result, total
  consultancy spend, and each consultancy row of a "consultancies valued at $10,000 or
  greater" style table (Victorian reports).
* Oversight and integrity bodies: matters, complaints or notifications received;
  investigations commenced and finalised; public hearings; briefs or referrals to a
  prosecutor; recommendations made. Use `operational_other` for at most ten further
  headline figures the report itself highlights, with their own label.

## What not to do

* Do not add, subtract, convert or round. Do not total a gender split or a set of rows.
* Do not record allegations, the subject of an investigation, or findings about any
  person. Integrity findings live in the integrity dataset, quoted there.
* Do not characterise anything. The label and figure are the report's.
* Commonwealth reports linked to the Transparency Portal (`portal_body_id` in the intake
  row) already have pay, staff numbers, expenses and consultancy figures in OPAX. Record
  only operational figures for those; the checker rejects the rest.
* A figure you cannot find goes in `not_found` by metric name, not in `facts`.
* Scanned pages without a text layer are not read (no OCR).
