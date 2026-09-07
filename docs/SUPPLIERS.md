# Commonwealth supplier profiles

The supplier directory and profiles follow every supplier in the collected
Commonwealth AusTender corpus. They use `ext_contracts_current`, one row per
contract at its latest recorded amendment value. State contracts are deliberately
outside these totals, including Queensland rows in the shared supplier register.
The older `contracts` table supplements CN lineages absent from the current
corpus so historical discovery cards have a profile to open. Current rows win
when a CN base exists in both sources. Within the legacy table, only the highest
numeric amendment suffix is retained. Supplemental records have no fabricated
publication date and are explicitly marked `source_table: "contracts"`.

## Refresh

From the repository root:

```sh
python3 scripts/export_suppliers.py --ssh desktop --output portal/public
python3 -m unittest discover -s tests -p test_suppliers.py
```

The exporter streams its Python source and the local published
`portal/public/graph/money.json` to the database host. It opens the source database
with `mode=ro`, enables `query_only` and reads under one snapshot transaction. It
does not install code, rebuild registers or write source data. Keep the local money
graph current before exporting so funding links resolve to published donor pages.
An empty supplier register fails the export instead of silently publishing an
empty directory during an upstream rebuild.

## Static data contract

- `/suppliers.json`: `{meta, suppliers}`. Every directory row carries `id`,
  `canonical_id`, `name`, `abn`, `aliases`, `total`, `count`, `agency_count`,
  `first_year`, `last_year`, `profile_path`, `money_node_ids`, and `lookup_names`.
  `lookup_names` contains established linked donor labels for unique route
  lookup; `aliases` remains actual supplier source spellings.
- `/suppliers/<two hexadecimal characters>.json`: `{profiles: {[id]: profile}}`.
  The directory's `profile_path` is this data URL, not an HTML route.
- `/subject/supplier/<id>` is the stable profile route. A name-based route can
  resolve only when the exact case-insensitive name/alias is unique. Names shared
  by multiple supplier identities must offer a choice, not pick one silently.
- A profile includes all current contract records, all observed federal aliases,
  agency and start-year breakdowns, undated totals, available ABR identity fields,
  and evidence-backed `donor_links`. No contract list is truncated. Descriptions
  longer than 2,000 characters are explicitly marked as truncated excerpts.

Public IDs are a SHA-256-derived opaque ID of the source register's canonical
supplier ID (or conservative name-only/ABN fallback). `canonical_id` preserves the original value (such as `abn:...`) for
existing money-graph `contracts.rid` links. Source ABNs take precedence over name
keys. A name key cannot merge different source ABNs or override an absent or
conflicting registry ABN. When a new source row has no usable register key, an
ABN or exact normalized-name fallback still produces a navigable profile and is
counted in `meta.unresolved_contract_rows`.

`money_node_ids` enables reverse donor-to-supplier navigation. Links use the
published graph's existing supplier ID, or an existing canonical donor match
whose method is `abn` or `name_exact` and whose donor label uniquely resolves to a
published node. Known ABN disagreement blocks a link. The exporter performs no
new fuzzy name matching and does not infer ownership or corporate-group ties.

## Interpretation

Values are recorded contract award values, not spending or payments. An amended
contract contributes its latest recorded value once. The metadata states the
collected publication window; this is not complete lifetime procurement history.
Calendar years use recorded contract start dates, which can precede publication
or be scheduled in the future. Invalid dates, missing dates and 1900 placeholder
dates remain in undated totals, so charts still reconcile to the full value.

The official AusTender register is linked from each notice. These are register
links, not fabricated individual notice URLs: use the displayed CN number to
locate the source. ABNs link to ABR when present. ABR labels and source identity
methods are preserved as evidence, not refreshed or independently certified by
this export.

Funding and contract values are separate flows and must not be added together.
An identity connection does not establish influence, misconduct or that a
contract funded a political payment.

## Validation and size

The snapshot generated 2026-09-07 contains 20,641 supplier profiles and 82,915
contracts: 67,209 current rows plus 15,706 legacy CN bases absent from the current
corpus. The legacy supplement adds 6,821 rows requiring a name-only fallback;
those profiles do not invent ABNs. There are 116 suppliers linked to published
funding nodes. Every profile is stored in one of 256 bounded shards; live
metadata is authoritative after refreshes.

Tests cover amendment-safe totals, complete contract lists, agency/year/undated
reconciliation, source-specific keys, current-over-legacy precedence, amendment suffix ordering, stable IDs, conflicting and absent ABNs,
ambiguous donor names, conservative donor links, shard reachability, placeholder
dates and source read-only enforcement.
