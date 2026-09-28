# OPAX charity and tax data: ACNC register, ACNC Annual Information Statements, ATO Corporate Tax Transparency

Status 2026-09-29: three additive tables (`ext_acnc_charities`, `ext_acnc_ais`, `ext_ato_tax_transparency`), keyed
by ABN, loaded from data.gov.au by `parli/ingest/acnc_ato.py`; joined by ABN to the organisations OPAX already
shows (suppliers, grant recipients, donors, lobbying clients, FITS registrants) by `scripts/export_tax_charity.py`;
shown as a "Charity and tax transparency" block on donor, supplier and grant-recipient pages by
`portal/public/tax-charity.js`. Relational data and static JSON only: nothing is written to the knowledge box.

What a reader sees, where the data has a row for the organisation's ABN:

- **Registered charity** (ACNC register): size (Small / Medium / Large), Public Benevolent Institution (PBI) and
  Health Promotion Charity (HPC) where the register says so, registration date, the ACNC's name for it, and a
  link to the ACNC Charity Register.
- **Revenue and government share** (ACNC AIS, latest year): total revenue, revenue from government and its share
  of total revenue, two earlier years under "Earlier years".
- **ATO Corporate Tax Transparency** (latest year the ABN is listed): total income, taxable income, tax payable,
  and every earlier year in a table.
- Every figure is attributed on the page ("Source: ATO Corporate Tax Transparency 2023-24 ↗ (CC BY 3.0 AU)")
  with a link to the publisher's record, and the publisher's own caveat prints under the figures.

## 1. Sources and licences (verified 2026-09-29)

| | Dataset on data.gov.au | Publisher | What OPAX loads |
|---|---|---|---|
| Register | `b050b242-4487-4306-abf5-07ca073e5594` (`acnc-register`), CSV resource `8fb32972-…`, 15.1 MB, updated weekly | ACNC | 66,399 rows; 65,792 loaded (the 607 without an ABN are charities whose ABN is withheld) |
| AIS | one package per year, 2013 to 2024, found by `package_search` on organisation `acnc` and the year in the title; CSV from 2019, XLSX before | ACNC | the latest 3 years by default (`--ais-years`): 2024 53,697 rows, 2023 53,198, 2022 52,744 |
| ATO | `c2524c87-cea4-4636-acac-599a82048a26` (`corporate-transparency`), one XLSX a year, 2013-14 to 2023-24 | ATO | every year: 28,645 rows in total |

Resource URLs are never stored: the loader asks the CKAN API (`package_show`, `package_search`) on every run.

**Licence, as each publisher states it.** CKAN record first, then the publisher's own page.

- **ACNC register: CC BY 3.0 AU** (dataset record: `license_id: cc-by`, "Creative Commons Attribution 3.0 Australia",
  http://creativecommons.org/licenses/by/3.0/au/).
- **ACNC AIS: a Creative Commons Attribution licence on every year, at different versions**, as the records say:
  2013, 2014, 2023 CC BY 3.0 AU; 2015 CC BY 4.0; 2016 to 2022 CC BY 2.5 AU (`cc-by-2.5`). The loader stores each
  year's own licence on its rows and the page shows the licence of the year it displays.
- **AIS 2024: `notspecified` on data.gov.au, and it always has been** (the package's activity log, back to
  2026-06-11, never carries a licence). This is the one the vetting flagged. Resolved from the ACNC's own copyright
  statement, https://www.acnc.gov.au/copyright (fetched 2026-09-29): *"All material presented on this website is
  provided under a Creative Commons licence, the current version of which is the Creative Commons Attribution 4.0
  International Licence (CC BY 4.0), with the exception of: the Commonwealth Coat of Arms; the ACNC logo; ACNC forms
  without the ACNC logo, and content supplied by third parties."* Attribution line: *"© Commonwealth of Australia
  2018"*. The loader records 2024 as CC BY 4.0 with `licence_note` saying the dataset record states no licence and
  the ACNC statement was used. Two caveats, honestly: the statement is about "this website", and the datasets are
  hosted on data.gov.au; and the ACNC's disclaimer page (https://www.acnc.gov.au/disclaimer) says *"The information
  on this website is for personal, non-commercial use only."*, which sits oddly beside CC BY. Every other ACNC
  dataset carries an explicit CC BY licence on its record, so AIS 2024 is the same series under the same
  publisher; but if that reading is not comfortable, leave 2024 out with `--ais-years 2023,2022` (the page then shows
  2023) or leave AIS out entirely with `--only register,ato`. The explanatory-notes PDFs (register user guide, Dec
  2024; AIS 2024 notes, v2.0, 6 March 2026) contain no licence text.
- **ATO Corporate Tax Transparency: CC BY 3.0 AU** (dataset record `license_id: cc-by`; the vetting report's "ATO CC
  BY" is the 3.0 AU version). The ATO's website copyright notice (https://www.ato.gov.au/about-ato/using-our-website/copyright-notice)
  is more permissive still: *"You are free to copy, adapt, modify, transmit and distribute this material as you
  wish (but not in any way that suggests the ATO or the Commonwealth endorses you or any of your services or
  products)."* The page therefore says "Source: ATO Corporate Tax Transparency 2023-24 (CC BY 3.0 AU)" and never
  presents the figures as the ATO's view.

A package with any licence other than an attribution-only CC BY, or with none and no publisher statement to fall
back on, is not loaded (`ckan_licence`). The publisher-statement fallback applies only where the record states no
licence; a record naming another licence (share-alike, say) is refused, not relabelled.

## 2. Tables

All three carry `source`, `source_url` (the publisher's record: the ACNC Charity Register search for the ABN, or
the data.gov.au resource page for that ATO year), `dataset_url`, `resource_id`, `licence`, `licence_url`,
`licence_note`, `snapshot_date` (the resource's last-modified on data.gov.au), `dataset_modified` (CKAN
`metadata_modified`, which `--check-updated` compares) and `ingested_at`.

- `ext_acnc_charities` (source `acnc_register`): `abn`, `legal_name`, `other_names`, `size`, `pbi`, `hpc`,
  `advocacy` (the "promote or oppose a change to law, government policy or practice" purpose; loaded, not shown on
  any page), `purposes`, `beneficiaries`, `operating_states`, `operating_countries`, `town`, `state`, `postcode`,
  `website`, `registration_date`, `established_date`, `financial_year_end`, `responsible_persons`. No
  responsible-person names are in the bulk file.
- `ext_acnc_ais` (source `acnc_ais`, one row per charity per `ais_year`): `charity_name`, `registration_status`,
  `size`, `basic_religious_charity`, `ais_received`, `fin_report_from/to`, `cash_or_accrual`,
  `revenue_from_government`, `donations_and_bequests`, `revenue_goods_services`, `revenue_investments`,
  `all_other_revenue`, `total_revenue`, `other_income`, `total_gross_income`, `employee_expenses`,
  `total_expenses`, `net_surplus`, `total_assets`, `total_liabilities`, `net_assets`, `fte_staff`, `volunteers`,
  `kmp_count`, `kmp_paid`. Reporting groups (ABN `91111111xxx`, 296 to 328 a year) are skipped.
- `ext_ato_tax_transparency` (source `ato_tax_transparency`, one row per entity per `income_year`): `abn`
  (NULL where the ATO publishes none: 36 of the 4,214 rows in the 2023-24 workbook, mostly foreign entities or
  special-purpose vehicles, so they cannot be joined), `entity_name`, `total_income`, `taxable_income`, `tax_payable`, `prrt_payable`, `section`
  (`income_tax`, or `prrt_only` for an entity on the PRRT tab with no income tax row).

Definitions, from the publishers:

- AIS `revenue_from_government`: *"all types of funding and financial assistance provided by Commonwealth, state,
  territory or local governments in the reporting period such as: general purpose government grants or funding;
  revenue received under a contract with government to provide specified services; government procurement;
  government rebates, supplements, subsidies or funded programs."* `total_revenue` is the five revenue lines
  (government, donations and bequests, goods and services, investments, all other revenue) and excludes
  `other_income`; `total_gross_income` adds it. **OPAX's government share is `revenue_from_government / total_revenue`.**
- ATO `total_income` is label 6S, `taxable_income` label 7T, `tax_payable` label T5 of the company tax return,
  `prrt_payable` label 25I of the PRRT return.

## 3. Rules that keep the figures honest

**ATO: tax payable is not tax paid, and a blank is not a zero.** From the ATO's "Report of entity tax information"
page (https://www.ato.gov.au/businesses-and-organisations/corporate-tax-measures-and-assurance/large-business/corporate-tax-transparency/report-of-entity-tax-information):

- *"If an entity's relevant labels show an amount of zero or less, we leave that field blank."* Blank taxable
  income or tax payable is stored as NULL, exported as an absent key, and shown as the word "blank" with a tooltip
  ("The ATO leaves a field blank when the amount is zero or less"). It is never written as `$0`.
- *"Tax payable ... is determined by multiplying the taxable income by the 30% corporate tax rate and then
  deducting tax offsets and credits, such as the research and development (R&D) incentive and franking credits.
  Some corporate tax entities will have an amount of taxable income but no income tax payable due to these offsets
  and credits."* Australia Post's 2023-24 row (taxable income $154,003, tax payable blank) is such a case.
- *"The figures ... in themselves do not indicate if an entity is paying a high or low rate of tax."* and *"There
  are genuine reasons why corporations may not pay income tax, for example, due to operating losses, deducting losses
  from prior years, or expensing projects in a start-up phase."* The page prints a short version of these under the
  figures (`CAVEATS.ato` in the exporter, carried in `index.json`), and the figures are never turned into a rate or
  a verdict: no "effective tax rate", no percentage, no comparison across entities.
- The report is entity level, not group level (*"Entities listed ... may be part of a large economic group"*), and
  the figures *"cannot be taken as the final tax position of an entity"*.
- The 2023-24 workbook also lists late lodgers for 2021-22 (9) and 2022-23 (79), and the 2016-17 file 43 for
  2015-16 (the ATO's Information sheet says so). Rows keep the workbook's own `Income year`, and **an ATO file
  replaces only its own rows (`resource_id`), never every row of an income year**. (The first version replaced by
  income year and let the 2022-23 load delete the 79.)
- "The latest year listed under this ABN. The 2023-24 report has no entry under it" is all the page says about an
  entity that dropped out of the report: the same company can appear under a new ABN (Mineralogy Pty Ltd is listed to
  2017-18; Mineralogy International Limited, a different ABN, from 2018-19) or without an ABN.

**AIS: zeros are not always figures.** 8,449 AIS 2024 rows are basic religious charities, which the ACNC says do
not provide financial information; the dataset carries `0` as total revenue for 7,829 of them (7,817 with every money column zero). The table keeps
what the dataset says (`basic_religious_charity = 1` beside the zeros); **the export drops the money fields for a
basic religious charity with no positive revenue** and the page says "A basic religious charity: no financial
information is reported to the ACNC." A non-religious row with revenue 0 reads "The dataset shows $0 revenue", not
"reported no revenue": a reported zero and no figure look alike in the file. Small charities report fewer items
and have no financial-report period, so their revenue reads "(AIS 2024)" rather than "(year to 30 June 2024)".
Charities that have had their information withheld are excluded from the datasets by the ACNC.

**Register status.** The register dataset lists currently registered charities. A charity that appears only in an
AIS file is described from that file ("In the ACNC 2024 Annual Information Statement dataset (status there:
Voluntarily Revoked ...). Not in the current Charity Register dataset.") and is never called a registered charity.
**DGR status is not in the ACNC dataset** (PBI and HPC are), so the page does not state it and says why; it is on
ABN Lookup and in the ABN Bulk Extract (`ext_common` ABR `names` carries DGR fund names but not the endorsement
dates), and is not loaded.

**Size thresholds changed in 2022** (small under $250,000 before, under $500,000 after; large $1m, then $3m); the
size is the register's, as at its last update.

## 4. Join rules

The join is **by ABN only**. No name is matched to a charity or a taxpayer.

| OPAX entity set | ABN comes from | Rule |
|---|---|---|
| Suppliers | `abn` on the profiles in `portal/public/suppliers/*.json` | the supplier's own ABN |
| Grant recipients | `abn` in `portal/public/grants/*/shard-*.json` | the recipient's own ABN (federal awards detail pages, QLD rows) |
| Donors | donor node label (and its aliases) in `graph/money*.json`, plus `access.json` keys -> `ext_donor_entities` via `ext_donor_aliases` -> `ext_donor_entities.abn` | a label that reaches one entity with one ABN is linked; an entity with no ABN (554 of 963 labels, including every individual) or two ABNs is not ("no match on ambiguity"); a label with no entity (6) is not |
| Lobbying clients | `ext_lobbyist_clients.client_abn` (federal 2,093 rows, NSW 4,559; QLD, SA, VIC, WA publish none) | the register's own ABN |
| FITS registrants | `ext_fits_registrants.abn` | the register's own ABN |

A donor's ABN came from the ABN Bulk Extract match in `parli.ingest.donor_entities`, so a wrong entity ABN would
attach a wrong row. The block therefore prints the publisher's own name ("ACNC name: COTTON AUSTRALIA LIMITED",
"ATO name: WOOLWORTHS GROUP LIMITED") so a mismatch is visible to a reader.

**`names.json`** is how a page that only knows a name finds an ABN (donor pages): `{normName(name): abn}` for donor
labels and aliases, lobbying clients and FITS registrants (individuals excluded). A key is dropped if it maps to
two ABNs (2 were), and single generic words ("Australia", "Group", "Bank") are never keys. Suppliers and recipients
without an ABN get no block; they are never looked up by name.

Match counts (2026-09-29 run, scratch database built from the real downloads and the desktop's entity tables):

| Entity set | ABNs | With a row | Charity | AIS | ATO |
|---|---:|---:|---:|---:|---:|
| Suppliers | 17,095 (of 21,458 profiles) | 1,709 | 1,200 | 995 | 497 |
| Grant recipients | 7,575 (of 10,028 files) | 3,434 | 3,203 | 2,638 | 169 |
| Donors | 403 (of 963 labels) | 118 | 16 | 13 | 102 |
| Lobbying clients | 4,421 | 1,246 | 680 | 597 | 555 |
| FITS registrants | 76 | 13 | 6 | 6 | 7 |
| **Written** (union) | | **5,291** | 4,161 | 3,476 | 1,055 |

## 5. Static output

`portal/public/entities/tax-charity/`: `index.json` (about 10 KB: sources, per-year licences and record links,
caveat sentences, counts; every page that shows the block fetches it), `names.json` (60 KB, donor pages only), and
100 shards `<dd>.json` by the last two digits of the ABN (largest 29.5 KB, 2.0 MB in all). A page fetches the index
and one shard; the shard is cached for the next organisation on the page. Record shape and the meaning of an absent
key are in the header of `scripts/export_tax_charity.py`. The output is deterministic (sorted keys, no run-time
stamp: `data_as_of` is the newest `ingested_at`), so an unchanged database rewrites identical bytes and a weekly run
that changed nothing leaves no diff to commit or deploy.

## 6. Refresh: weekly, `--check-updated`

The ACNC refreshes the register and every AIS package weekly; the ATO report changes yearly (the 2023-24 report's
record on data.gov.au is dated 2025-10-01). Weekly, from the repo root, on the box that holds `parli.db` (the loader takes the path from `--db` or
`OPAX_DB`; with neither it goes through ssh to the desktop like the other ext loaders):

```
OPAX_DB=/path/to/parli.db .venv/bin/python -m parli.ingest.acnc_ato --check-updated
OPAX_DB=/path/to/parli.db .venv/bin/python scripts/export_tax_charity.py --db "$OPAX_DB" --portal portal/public
git status --short portal/public/entities/tax-charity   # empty when nothing changed: nothing to commit, nothing to redeploy
```

Order: after the donor-entity, grant-recipient and supplier exports (the export reads the current
`portal/public/suppliers`, `grants`, `graph/money*.json`), before the portal deploy.

- `--check-updated` compares each dataset's CKAN `metadata_modified` with the value stored on the rows already
  loaded and reloads only what is newer; the rest is not downloaded. It prints `CHANGED=<n>`. All AIS packages
  are touched weekly, so in practice the register and the three AIS years reload each week (about 130 MB and one
  minute; the cached file per resource is replaced, nothing else is kept). The 11 ATO years reload only when the
  ATO package changes.
- `--status` prints what CKAN offers against what is loaded and writes nothing; `--dry-run` downloads and parses
  and writes nothing; `--only register,ais,ato`, `--ais-years N|all|2023,2024`, `--refresh` (ignore cached
  downloads), `--allow-shrink`.
- **Staged replace with a guard.** Rows are built in memory, then each dataset (the register; an AIS year; an ATO
  resource) is replaced in one transaction (`ExtWriter`: DELETE, INSERT and the `ext_ingest_log` line together),
  so a failed run leaves the old rows. A new set that is empty is always refused; one under 90% of the loaded rows
  is refused unless `--allow-shrink`. The exporter has the same two guards against the published ABN count.
- Exit codes: `0` loaded or up to date; `1` CKAN offered nothing usable; `2` a dataset failed (the others still
  load). A file whose columns are not the ones the loader maps (AIS 2013 is a different layout with no
  `total revenue` column, verified) is skipped with a warning, not a failure, so `--ais-years all` does not fail
  every week. AIS 2016 and 2018 (XLSX) load through the same code: 49,181 and 50,168 rows.
- Needs `requests` and `openpyxl` (both in `pyproject.toml`; the bootstrap checks `openpyxl`).

Tests: `python -m unittest discover -s tests -p "test_acnc_ato.py"` (23), `-p "test_export_tax_charity.py"` (15),
`node --test test/tax-charity.test.mjs` in `portal/` (18: wording, escaping, mounting, wiring, and the committed
export's shape).

## 7. Not done

- Money answers (`/api/ask` fact sheet in the Worker) do not use these figures yet; the JSON is static and could be
  read by the Worker the way `fits.json` is.
- ASIC former names for donor-entity aliasing (vetting item, separate).
- DGR endorsement (from the ABN Bulk Extract) is not loaded; see section 3.
- The register's `advocacy` flag, purposes and beneficiaries are loaded but no page shows them.
- AIS 2013 (different layout) is not loaded; the AIS programs and group-members files are not loaded.
- ATO rows without an ABN cannot be joined.
- Nothing is shown on person pages: a politician's own finances are a different dataset.
