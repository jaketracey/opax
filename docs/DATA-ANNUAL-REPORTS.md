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
* Typed tables cover **2022-23 to 2025-26**. The Portal publishes 2018-19 to 2021-22
  only as CSV and ZIP files on its Data sets page. Those years are not loaded yet.
* Licence: Non-corporate Commonwealth entity material is CC BY 4.0 (Department of
  Finance attribution). Corporate entities and companies keep copyright in their
  own material. Each table carries its licence and the original API item URL.

## Loader and export

* `parli/ingest/transparency_portal.py fetch|build|refresh`. Raw pages go to
  `~/.cache/autoresearch/transparency/raw/<stamp>/` (outside git; override with
  `OPAX_TRANSPARENCY_CACHE`). `build` writes `snapshot.json` and refuses to
  publish when the body count or the key management personnel row count falls
  more than 10% against the previous snapshot.
* `scripts/export_annual_reports.py` writes `portal/public/annual-reports/`:
  * `index.json`: bodies (type, portfolio by year, AusTender agency ID where the
    name matches exactly), reports by year, headline figures for each body and
    year, caveats and counts.
  * `remuneration-<year>.json`: key management personnel rows, table total lines
    (kind `kmp_total`, never people), senior executive and highly paid bands.
  * `suppliers-<year>.json`: organisations paid for consultancy and
    non-consultancy contracts, with ABN where published.
  * `manifest.json`: counts and file hashes.
* Weekly refresh: the `transparency_portal` and `x_annual_reports` steps in
  `scripts/weekly_refresh.sh` (both STALE_OK). The `annual-reports` data group is
  checked by `scripts/vm/validate_data.py`.

## Figures shown as published

OPAX does not adjust published figures. It flags them:

* `components_do_not_sum_to_total`: the published components of a key management
  personnel row do not add to its published total.
* `scale_check`: a spend figure looks as if it was entered in dollars in a
  thousands-of-dollars field (average per contract over $5m for consultancy or
  $50m for non-consultancy, or 100 times the body's own figure in another year).
  Flagged rows are left out of `compare` rankings and named in the notes.
* Contract spend is in $'000 GST inclusive. Income statement figures are in
  $'000. The 2024 non-corporate income table states no unit; it is taken as
  $'000 from the template and marked `unit_basis`.
* Spend above departmental expenses is not always an error, because
  administered spend sits outside the departmental income statement.

## Tool

`annual_reports` views: `remuneration` (people, by body, person, position,
minimum total, year), `bands`, `profile` (headline figures for one body),
`compare` (rank bodies on one metric in one year), `suppliers` (by organisation
or ABN). Every row cites the original Portal item. State and territory agencies
are not covered, and an empty result does not establish that a payment or
person does not exist.

Tests: `portal/test/annual-reports-tool.test.mjs` (contract and Ask/MCP parity).
