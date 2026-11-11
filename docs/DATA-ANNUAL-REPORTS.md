# Commonwealth entity annual reports

Commonwealth entities publish their annual reports as typed tables on the
Transparency Portal (Department of Finance), as the PGPA Rule requires. OPAX loads
those tables and publishes them as static JSON. Ask and the MCP read them through
the `annual_reports` tool.

## Source

* API: `https://previewapi.transparency.gov.au/delivery/items`. This is the Portal's
  production delivery API, despite the host name. It has no robots file and needs no
  key. Requests use the OPAXBot identity through `parli.ingest.http`, paced 1.5
  seconds apart, with a 1,500-request ceiling for each run. A 403 or challenge
  pauses the source (exit 4) and the last good export stays in place.
* Only items whose `workflow_step` is `published` are used.
* Typed tables cover **2022-23 to 2025-26**. For **2018-19 to 2021-22** the Portal
  published the same tables only as files on its Data sets page: one ZIP per year
  for 2018-19 to 2020-21 and one CSV per table for 2021-22. Those files are pinned
  in `parli/ingest/transparency_legacy.py`; key management personnel, senior
  executive and highly paid bands, and (2020-21 and 2021-22 only) organisations paid
  are loaded from them, cited to the asset URL, the CSV name and the line number.
  Headline figures (expenses, staff numbers, contract totals) for those years sit in
  wide files with mixed units and are not loaded.
* Licence: Non-corporate Commonwealth entity material is CC BY 4.0 (Department of
  Finance attribution). Corporate entities and companies keep copyright in their
  own material. Each table carries its licence and the original API item URL.

## Loader and export

* `parli/ingest/transparency_portal.py fetch|build|refresh`. Raw pages go to
  `~/.cache/autoresearch/transparency/raw/<stamp>/` (outside git; override with
  `OPAX_TRANSPARENCY_CACHE`). `build` writes `snapshot.json` and refuses to
  publish when the body count or the key management personnel row count falls
  more than 10% against the previous snapshot.
* `parli/ingest/transparency_legacy.py fetch|build|refresh`: downloads any pinned
  data file not yet in `~/.cache/autoresearch/transparency/legacy/` (8 files, once),
  then writes `legacy-snapshot.json`. Placeholder lines, notes and sub-headings
  inside a table are skipped, as is the list of entities that published no table.
  Older entity names are matched to a Portal body only on an exact name, the name
  without a trailing bracket, or a listed alternative name; 7 names stay as published.
* `scripts/export_annual_reports.py` writes `portal/public/annual-reports/`:
  * `index.json`: bodies (type, portfolio by year, AusTender agency ID where the
    name matches exactly), reports by year, headline figures for each body and
    year, caveats and counts.
  * `remuneration-<year>.json`: key management personnel rows, table total lines
    (kind `kmp_total`, including "Grand Total" and footnoted "Total1"), lines that
    name no one (kind `kmp_other`: a bare number or a band label inside a key
    management personnel table), senior executive and highly paid bands. Neither
    `kmp_total` nor `kmp_other` rows are people.
  * `suppliers-<year>.json`: organisations paid for consultancy and
    non-consultancy contracts, with ABN where published.
  * `manifest.json`: counts and file hashes.
* Weekly refresh: the `transparency_portal`, `transparency_legacy` and `x_annual_reports` steps in
  `scripts/weekly_refresh.sh` (both STALE_OK). The `annual-reports` data group is
  checked by `scripts/vm/validate_data.py`.

## Figures shown as published

OPAX does not adjust published figures. It flags them:

* Names: a footnote reference that an entity attached to a person's name
  ("Christine Holgate1", "Jane Cutler 1", "Nell Greenwood*", "Adrian Collette AM¹",
  "Brian Hickey[1]", "Jenet Connell(d)") is removed from `name`, and the cell as
  published is kept in `name_as_published` (`footnote_free_name` in
  `parli/ingest/transparency_portal.py`, used by both loaders and the export).
  Symbols, superscripts and bracketed references are always removed; plain trailing
  digits only from a written name of two or more words, never from a numbered
  placeholder such as "Name Withheld 5".

* `components_do_not_sum_to_total`: the published components of a key management
  personnel row differ from its published total by more than half a per cent (smaller
  gaps are rounding, often to the nearest thousand).
* `scale_check`: a spend figure looks as if it was entered in dollars in a
  thousands-of-dollars field (average per contract over $5m for consultancy or
  $50m for non-consultancy, or 100 times the body's own figure in another year).
  Flagged rows are left out of `compare` rankings and named in the notes.
* Contract spend is in $'000 GST inclusive, except the 2020-21 organisations-paid
  file, which states dollars; those rows carry `expenditure_dollars` instead. Income statement figures are in
  $'000. The 2024 non-corporate income table states no unit; it is taken as
  $'000 from the template and marked `unit_basis`.
* Spend above departmental expenses is not always an error, because
  administered spend sits outside the departmental income statement.

## Tool

`annual_reports` views: `remuneration` (people, by body, person, position,
minimum total, year), `bands`, `profile` (headline figures for one body),
`compare` (rank bodies on one metric in one year), `suppliers` (by organisation
or ABN), `kmp_counts` (bodies ranked by how many key management personnel rows
each published in one year; counts of published disclosure rows, not distinct
people) and `top_by_year` (one body's largest key management personnel total in
each year, oldest first, optionally by position, as one side-by-side comparison
that is never added across years; bodies whose names extend the named body, such
as "Department of Health and Aged Care", fill only the years it has no rows for,
and the notes say the Portal lists them separately). Every row cites the original
Portal item. State and territory agencies
are not covered, and an empty result does not establish that a payment or
person does not exist.

Tests: `portal/test/annual-reports-tool.test.mjs` (contract and Ask/MCP parity),
`portal/test/annual-reports-answer.test.mjs` (the final claim audit over these rows)
and `tests/test_transparency_names.py` (name footnotes).
