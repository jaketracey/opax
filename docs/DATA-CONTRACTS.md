# Commonwealth contracts: AusTender, keyed by ABN, on the money map

Government contracts are the other direction of money between companies and
politics. Saab Australia gave parties about $357k over eight years and holds
$122m of Defence contracts; the money map used to leave it off because its
donations never reached the top 250. This pipeline loads every AusTender
contract notice with the supplier's ABN, resolves suppliers to the donor
register, and puts a second public-money hub on the map beside the grants hub.

## Source

AusTender's OCDS feed, `https://api.tenders.gov.au/ocds/findByDates/contractPublished/{from}/{to}`,
no key, CC BY 3.0 AU. A response carries at most 100 releases and a `links.next`
cursor for the rest; a window with nothing published is an HTTP 400 "No Records
found". Each release is one contract notice: the supplier party with an `AU-ABN`
additional identifier and address, the buying agency and its ABN, the contract's
value, period, UNSPSC category and procurement method. A variation is a notice of
its own ("CN1234-A2") whose value is the contract's new total.

The earlier loader (`parli.ingest.austender`, table `contracts`) asked for a week
at a time and never followed the cursor, so it held 18,042 notices for $46B and
no ABNs. AusTender publishes roughly 250 notices a working day.

## Tables (parli.db on the desktop box)

| Table | Module | What |
|---|---|---|
| `ext_contracts` | `parli.ingest.austender_full` | one row per notice, every field above; `parent_cn` on a variation |
| `ext_contract_fetch_log` | same | one row per day fetched, so a rerun resumes; the last two days are always refetched |
| `ext_contracts_current` | `parli.ingest.contract_suppliers` | one row per contract: the latest notice in its lineage, `original_amount` from the first |
| `ext_contract_suppliers` | same | one row per supplier (ABN, else ABR-matched name, else name) with the ABR legal name and a `donor_entity_id` link |
| `ext_contract_supplier_keys` | same | (source, abn or name) -> supplier_id, for the exporters |
| `ext_state_contracts`, `ext_state_contract_files` | `parli.ingest.qld_contracts` | Queensland's contract disclosure rows and the files they came from |

Supplier resolution climbs the same ladder as grants (`parli.ingest.grant_recipients`):
the ABN against `ext_donor_entities.abn`, then the exact and rule-normalised
names, then any registered name of the ABN in the ABN Bulk Extract. Individuals,
undisclosed and government suppliers are never linked.

## On the money map (`scripts/export_money_graph.py`)

- **A second way onto the map.** After the top 250 donors by lifetime receipts,
  any donor entity holding at least `PUBLIC_MONEY_FLOOR` ($10m) in contracts and
  grants resolved to the same entity joins, up to `PUBLIC_MONEY_EXTRA_CAP` (250).
  Those nodes carry `via: "public_money"` and `publicMoney`; the card says so.
  `meta.donor_nodes_by_total` is the old 250, `meta.donors_via_public_money` the rest.
- **A contracts hub.** `grantor:contracts` ("Commonwealth contracts", kind
  `grantor`, `flow: "contracts"`) sits at the centre with the grants hub; one
  flow per donor that holds contracts, `grant: true, flow: "contracts"`; the
  donor carries a `contracts` block shaped like `grants` (totals, byYear on the
  financial year the contract started, top agencies, `rid` = supplier_id).
- Never summed with donations. Node totals stay donations only; the legend's
  one "Public money" chip switches both hubs.

The portal (`portal/graph/index.ts`) shows both rows under "Public money
received", links a contracts row to the Discover page's supplier search, and the
hub card to "Follow the big contracts". `graph/smoke-test.mjs` checks both hubs.

## Runbook

```
# desktop, background, ~4 h for 2007 to today; resumable
cd ~/opax-sync && nohup env PYTHONPATH=. python3 -m parli.ingest.austender_full --db ~/.cache/autoresearch/parli.db > /tmp/austender.log 2>&1 &
# Queensland's disclosure files (~15 min, cached)
PYTHONPATH=. ~/opax/.venv/bin/python -m parli.ingest.qld_contracts --db ~/.cache/autoresearch/parli.db
# then, and after every fetch or state load
PYTHONPATH=. python3 -m parli.ingest.contract_suppliers --db ~/.cache/autoresearch/parli.db --abr-dir ~/.cache/autoresearch/abr
# from the Mac
ssh desktop python3 - < scripts/export_money_graph.py > portal/public/graph/money.json
ssh desktop python3 - qld < scripts/export_state_money.py > portal/public/graph/money.qld.json
cd portal && node graph/smoke-test.mjs && npm run build:graph
```

## Queensland

`parli.ingest.qld_contracts` catalogues every data.qld.gov.au dataset whose
title or tags say "contract disclosure" (about 370 datasets, 926 CSV/XLSX/XLS
files, one per agency and financial year, contracts of $10,000 and over) and
writes `ext_state_contracts` (jurisdiction `qld`), mapping the drifting headers
by their words (supplier, ABN where published, agency, description, award
date, value, variation, procurement method, reference). Files are cached under
`~/.cache/autoresearch/qld_contracts`; `ext_state_contract_files` records each
file's header, row count and status, so an unmapped file is visible. Run it
with the desktop's `~/opax/.venv/bin/python` (openpyxl for the spreadsheets).

A variation row in these registers restates the contract's whole value (Queensland
Rail's $10.4B service contract appears on every variation), so
`ext_state_contracts_current` keeps one row per contract: rows sharing an agency and
reference number fold to the largest value, and rows without a reference fold by
agency, supplier and description when any of them is a variation (976,659 rows
became 930,171 contracts and the summed value fell from $378B to $245B).
Everything downstream reads the folded table.

`contract_suppliers` folds the state rows in beside the federal ones (per-source
totals `federal_*` and `qld_*`; keys carry a `source`), and
`scripts/export_state_money.py` draws a "Queensland contracts" hub on the
Queensland map exactly as the federal exporter draws the Commonwealth one.

## Not yet

NSW (buy.nsw.gov.au refuses plain fetches; needs a browser or Firecrawl),
Victoria (Buying for Victoria disclosures) and SA (Tenders and Contracts) would
give those maps a contracts hub the same way. The discovery page's "companies
in both" still matches by name against the old `contracts` table; it can move
to `ext_contract_suppliers` and match by ABN.
