# Roster witness-split diff against main

Baseline: `origin/main (8e1977cfe8681e09536ac8573fadf0c825654416)`. Every field of every record is compared; metadata is excluded.

| Category | Changed records | Sample |
|---|---:|---|
| witness split | 16 | Stewart, Pugh, Walker, Bennett, Stevens |
| mix-up corrected | 0 | — |
| witness-dominated | 0 | — |
| spans parliaments | 0 | — |
| alias normalisation | 0 | — |
| clean record changed | 0 | — |

**16 changed; 1684 exactly unchanged; zero clean record changed is required.**

Categories are exclusive. Witness splits must exactly reproduce the independent scoped resolver, conserve aggregate counts, keep witnesses unattributed and enforce an own-house retrieval scope. Other changes retain the existing evidence categories.

| Party rows / facet | Main | Split | Change |
|---|---:|---:|---:|
| Total rows with party | 1058 | 1074 | +16 |
| SA rows with party | 74 | 74 | +0 |
| SA Labor | 33 | 33 | +0 |
| SA Liberal | 35 | 35 | +0 |
| QLD rows with party | 81 | 97 | +16 |
| QLD Labor | 37 | 44 | +7 |
| QLD LNP | 38 | 47 | +9 |
| QLD Independent | 1 | 2 | +1 |

Party facets include both `party` and `parties`, matching the website. These are transcript-directory rows, not unique people or current seats.

## Every changed record

| Print | Category | Changed fields | Evidence permitting change |
|---|---|---|---|
| Stewart | witness split | chambers, full, identity_evidence, party, recorded_parties, representation, separated_witnesses, speech_count_basis, speech_scope, speeches, states, transcript, witness_rows | Dated QLD Assembly identity; witness rows separate; own-house and service-date filters required; exact count pending |
| Pugh | witness split | chambers, full, identity_evidence, party, recorded_parties, representation, separated_witnesses, speech_count_basis, speech_scope, speeches, states, transcript, witness_rows | Dated QLD Assembly identity; witness rows separate; own-house and service-date filters required; exact count pending |
| Walker | witness split | chambers, full, identity_evidence, party, recorded_parties, representation, separated_witnesses, speech_count_basis, speech_scope, speeches, states, transcript, witness_rows | Dated QLD Assembly identity; witness rows separate; own-house and service-date filters required; exact count pending |
| Bennett | witness split | chambers, full, identity_evidence, party, recorded_parties, representation, separated_witnesses, speech_count_basis, speech_scope, speeches, states, transcript, witness_rows | Dated QLD Assembly identity; witness rows separate; own-house and service-date filters required; exact count pending |
| Stevens | witness split | chambers, full, identity_evidence, party, recorded_parties, representation, separated_witnesses, speech_count_basis, speech_scope, speeches, states, transcript, witness_rows | Dated QLD Assembly identity; witness rows separate; own-house and service-date filters required; exact count pending |
| Kirkland | witness split | chambers, full, identity_evidence, party, recorded_parties, representation, separated_witnesses, speech_count_basis, speech_scope, speeches, states, transcript, witness_rows | Dated QLD Assembly identity; witness rows separate; own-house and service-date filters required; exact count pending |
| Bourne | witness split | chambers, full, identity_evidence, party, recorded_parties, representation, separated_witnesses, speech_count_basis, speech_scope, speeches, states, transcript, witness_rows | Dated QLD Assembly identity; witness rows separate; own-house and service-date filters required; exact count pending |
| Sullivan | witness split | chambers, full, identity_evidence, parties, party, recorded_parties, representation, separated_witnesses, speech_count_basis, speech_scope, speeches, states, transcript, witness_rows | Dated QLD Assembly identity; witness rows separate; own-house and service-date filters required; exact count pending |
| Field | witness split | chambers, full, identity_evidence, party, recorded_parties, representation, separated_witnesses, speech_count_basis, speech_scope, speeches, states, transcript, witness_rows | Dated QLD Assembly identity; witness rows separate; own-house and service-date filters required; exact count pending |
| Young | witness split | chambers, full, identity_evidence, party, recorded_parties, representation, separated_witnesses, speech_count_basis, speech_scope, speeches, states, transcript, witness_rows | Dated QLD Assembly identity; witness rows separate; own-house and service-date filters required; exact count pending |
| Hutton | witness split | chambers, full, identity_evidence, party, recorded_parties, representation, separated_witnesses, speech_count_basis, speech_scope, speeches, states, transcript, witness_rows | Dated QLD Assembly identity; witness rows separate; own-house and service-date filters required; exact count pending |
| Robinson | witness split | chambers, full, identity_evidence, party, recorded_parties, representation, separated_witnesses, speech_count_basis, speech_scope, speeches, states, transcript, witness_rows | Dated QLD Assembly identity; witness rows separate; own-house and service-date filters required; exact count pending |
| Harper | witness split | chambers, full, identity_evidence, party, recorded_parties, representation, separated_witnesses, speech_count_basis, speech_scope, speeches, states, transcript, witness_rows | Dated QLD Assembly identity; witness rows separate; own-house and service-date filters required; exact count pending |
| Dillon | witness split | chambers, full, identity_evidence, party, recorded_parties, representation, separated_witnesses, speech_count_basis, speech_scope, speeches, states, transcript, witness_rows | Dated QLD Assembly identity; witness rows separate; own-house and service-date filters required; exact count pending |
| Hart | witness split | chambers, full, identity_evidence, party, recorded_parties, representation, separated_witnesses, speech_count_basis, speech_scope, speeches, states, transcript, witness_rows | Dated QLD Assembly identity; witness rows separate; own-house and service-date filters required; exact count pending |
| Crawford | witness split | chambers, full, identity_evidence, party, recorded_parties, representation, separated_witnesses, speech_count_basis, speech_scope, speeches, states, transcript, witness_rows | Dated QLD Assembly identity; witness rows separate; own-house and service-date filters required; exact count pending |

Offline own-house, in-service counts are pending, with no number published. The original aggregate remains under `transcript`; separated witnesses have no MP identity, party or seat. The nightly SQL export computes the exact partition before resolving identity.
