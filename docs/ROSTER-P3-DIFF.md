# Roster witness-split diff against main

Baseline: `origin/main (44b44b2f790e9bf18c028afa90a986ca69b6d738)`. Every field of every record is compared; metadata is excluded.

| Category | Changed records | Sample |
|---|---:|---|
| witness split | 0 | — |
| mix-up corrected | 0 | — |
| witness-dominated | 0 | — |
| spans parliaments | 0 | — |
| alias normalisation | 0 | — |
| clean record changed | 0 | — |

**0 changed; 1700 exactly unchanged; zero clean record changed is required.**

Categories are exclusive. Witness splits must exactly reproduce the shared scoped resolver, conserve aggregate counts, keep witnesses unattributed and enforce an own-house retrieval scope. This checks consistency with the resolver; correctness depends on the reviewed source evidence. Other changes retain the existing evidence categories.

| Party rows / facet | Main | Split | Change |
|---|---:|---:|---:|
| Total rows with party | 1074 | 1074 | +0 |
| SA rows with party | 74 | 74 | +0 |
| SA Labor | 33 | 33 | +0 |
| SA Liberal | 35 | 35 | +0 |
| QLD rows with party | 97 | 97 | +0 |
| QLD Labor | 44 | 44 | +0 |
| QLD LNP | 47 | 47 | +0 |
| QLD Independent | 2 | 2 | +0 |

Party facets include both `party` and `parties`, matching the website. These are transcript-directory rows, not unique people or current seats.

## Every changed record

| Print | Category | Changed fields | Evidence permitting change |
|---|---|---|---|

Offline own-house, in-service counts are pending, with no number published. The original aggregate remains under `transcript`; separated witnesses have no MP identity, party or seat. The nightly SQL export computes the exact partition before resolving identity.
