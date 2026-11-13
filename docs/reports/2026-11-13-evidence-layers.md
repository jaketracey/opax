# Evidence layers waiting for inputs, 13 November 2026

Read-only diagnosis of backlog item 13. Baseline: `origin/main` at `6e1deea78`. Sources: the repo and its history, the latest nightly status (`origin/nightly-status`, a single force-pushed commit, so history comes from the nightly commit messages on `main`), and the retired evidence files on the desktop, read with `ls`, `stat` and `sqlite3 -readonly`. The refresh box, AWS and production were not touched. Nothing was copied or changed.

## Summary

The four missing inputs are the evidence sidecar databases behind the published connections data (`portal/public/evidence`): `evidence-layers-full.sqlite`, `evidence-places.sqlite`, `evidence-identity-decisions.sqlite` and `evidence-additional-mentions.sqlite`. They were built once, by hand, on the desktop on 8 September and published the same day (#96). No scheduled job has ever produced them. The 29 September move to the refresh box did not carry them over, and the nightly evidence step added on 10 October expects them on the box. Every acquisition night since, it reports `evidence: waiting for inputs (missing: …)` and keeps its catch-up marker. That is why the warning repeats nightly and not only on Sundays.

The backlog's "since 8 Sep" is when the data froze. The warning itself started when the step reached the box. The first nightly commit carrying it is `e482ece32` (14 October), and 34 nightly commits through `d57d24a60` (13 November) carry it.

Copying the old files to the box would not clear the warning. They match an 8 September corpus with no retained snapshot, so readiness would report `mismatch` instead of `missing`. The way to clear it is a rebuild, using the builder that is already merged and switched off (`scripts/vm/build_evidence_bundle.py`, `OPAX_EVIDENCE_BUILD=1`). Two publication-guard rules would also hold back any rebuilt export (see "Blockers in the guard").

## The four inputs

| Input | Layer it feeds | Producer | When it stopped and why | What users miss |
|---|---|---|---|---|
| `evidence-layers-full.sqlite` (2,211,057,664 bytes) | The primary layer. It holds the organisation, programme and electorate mentions in speeches and official releases, the register identities and aliases, the address postcode links, and the identity candidates. Its output is the entity directory (`index.json`), the name and ABN lookup shards, the "Parliamentary record" and "Official release" excerpts, and the registered-address places. | `scripts/build_evidence_layers.py`, run once by hand on the desktop. It finished at 09:20 UTC on 8 Sep after 1,310,477 speeches (last rowid 1,317,595) and 21,234 releases (last rowid 41,562). | It was never scheduled. The 8 Sep publication was a one-off, `transfer_state.sh` copies only `parli.db`, the KB checkpoint and the fetcher caches, and nobody has provisioned the box. A rebuild is needed because the corpus and the registers have both moved on (see "How stale"). | Connections from any speech or release recorded after the 8 Sep scan. Organisations added to the supplier, donor or grant-recipient registers since then have no connections entry, so their profile has no "Across the record" panel and `/connections` cannot find them. The Ask `entity_profile` (connection), voice `find_connections` and MCP connection search tools answer from the 8 Sep set. Known damaged excerpts also stay published (for example "ransport Legislation Committee" and "We know perso", still in shards `53.json` and `25.json`), because the passage-text cleaning only runs at export time. |
| `evidence-places.sqlite` (1,004,138,496 bytes plus a 1,230,668,752-byte WAL) | The places layer. It holds the grant postcode/electorate overlaps, recorded places and programme links (`grant_postcode_overlaps` 254,751, `recorded_place` 213,821, `grant_program` 206,206), plus the `representatives` table. Its output is the electorate, place and programme entries, the "Grant record" excerpts and their programme, place and recipient links, and "Speakers recorded for this electorate". | `scripts/build_place_evidence.py` on the desktop on 8 Sep, covering 230,007 grants (programme checkpoint at rowid 269,990). | Same as the row above. The grant side is not stale yet: the grants table in the desktop's retired copy still has 230,007 rows with max rowid 269,990, because the grants fetch has been paused since the source returned HTTP 403. | Little on grants today. The electorate speaker lists stop at 8 Sep speeches. |
| `evidence-identity-decisions.sqlite` (3,076,096 bytes) | Identity decisions: 3,005 decisions on the primary layer's 3,005 `same_identity_candidate` rows (1,230 accepted, 1,775 unresolved). Their output is the redirects that merge source names into ABN-validated identities, "How the identities connect", `identity-links.json`, and the "reviewed identity matches" figure. | `scripts/review_evidence_identities.py` on the desktop on 8 Sep. It is rule-based (exact full name, validated ABN, no competing ABN), with no model call. | Same as the first row. It must be rebuilt after the primary layer, because readiness requires the decision count to equal the primary's candidate count. | No identity matches for register rows added since 8 Sep. Profiles for those names cannot merge their source records. |
| `evidence-additional-mentions.sqlite` (447,434,752 bytes) | Additional mentions: a second scan of all speeches and releases for 3,878 names that only became unambiguous after the identity review, and for programmes named in grant fields. Its output is extra excerpts and record counts on those entities. | `scripts/build_additional_mentions.py` on the desktop on 8 Sep, with the same coverage as the primary layer. | Same as the first row. It depends on the primary layer, the decisions and the places layer. | The same freshness gap as the primary layer, for these names. |

The source (`parli.db`) is the fifth input. It exists on the box, so the status names only the four sidecars. The message uses the default paths, which shows no `OPAX_EVIDENCE_*` overrides are set. It is also the non-build branch of `scripts/vm/evidence_refresh.sh`, which shows `OPAX_EVIDENCE_BUILD` is not enabled.

## Timeline

| Date | Event |
|---|---|
| 8 Sep | Pilots, then full scans, run by hand from copies of the builder scripts in the desktop's cache folder. All four sidecars complete by 19:20 AEST. The final export passes its source audit (109,533 excerpts, 13,081 address links), ships in `46222cc38` (#96) and is recorded in `corpus.json` `enrichment`. |
| 28 to 29 Sep | Cutover to the refresh box. `transfer_state.sh` moves `parli.db`, the KB checkpoint and `CACHE_DIRS` (Hansard, bills, IPEA, state Hansards, TVFY), but not the sidecars. The desktop's daily refresh is retired (`MIGRATED_TO_VM`). |
| 10 Oct | The nightly evidence step lands (`11845876f`, `9723e7c1f`, `7b32514c2`). It exports weekly on Sundays, plus a one-time catch-up. With missing inputs it warns, keeps the catch-up marker and skips the export. Provisioning is documented in `docs/operations/evidence-provisioning.md` and recorded there as "undecided". |
| 10 to 13 Oct | Hand edits to the shipped evidence tree (donor withholding and its removal: `e06c942b6`, `6b513b433`, `6575e2aec`, `bf8954a11`, `c3a0c09b2`). The 11 Oct lookup rebuild adds 837,658 bytes. The script that made it was deleted on 13 Oct. |
| 14 Oct | First nightly commit carrying the waiting line (`e482ece32`). |
| 19 to 20 Oct | #190 and #192 add the opt-in frozen-bundle builder and its alerting. It stays off "until a supervised build passes the existing publication guards". #197 makes the scans 2.27 times faster. Its own note: "Full-bundle runtime remains unproven". |
| to 13 Nov | No supervised build is recorded in the repo or the ops notes. The warning repeats every night. |

## How stale the published data is

- **Corpus.** The desktop's retired `parli.db` (newest speeches dated 24 Sep, last written 10 Nov) already has 6,040 speeches beyond the scan checkpoint: NSW 2,752, Victoria 1,446, federal 1,341, Queensland 501. It also has 505 release rows above the checkpoint rowid (306 net). The box has added more since the cutover: federal Hansard to 29 Oct, NSW to 12 Nov, ACT to 29 Oct. Excluding three bulk index-load nights, the nightly commit lines since 29 Sep report about 9,800 speech and 974 release resources. These are search-index counts, so they are indicative rather than database row counts. The box's own row counts were not measured.
- **Registers.** In the retired copy, suppliers number 152,328 against 152,206 identities in the sidecar, grant recipients 132,519 against 132,630, and grant detail rows 9,425 against 8,150 in the 8 Sep inventory. The box's registers have been refreshed since and were not measured.
- **Dating.** `/connections`, the profile panels and the stats page show no snapshot date. Only the About coverage row says "Snapshot: 2026-09-08", and `stats.json` carries `generated_at`. The stats page shows "1,310,477 speech records" with no "as at" date.

## Blockers in the guard (`scripts/vm/evidence_guard.py`)

Any rebuilt export would also be held at publication today, even with perfect inputs:

1. **The byte ceiling is below the shipped tree.** `MAX_BYTES = 163,453,646` is the exact size of the 8 Sep tree. The 11 to 13 Oct hand edits, mostly the 11 Oct lookup rebuild, took the shipped tree to 164,138,847 bytes. The budget is `min(MAX_BYTES, HEAD)`, so a new export must be no larger than the 8 Sep tree. Any growth from new entities, aliases or year buckets is refused.
2. **Excerpt displacement counts as loss.** The exporter keeps the 12 most recent excerpts per entity (sorted by date, newest first). The guard refuses if any existing (entity, excerpt) ID vanishes. Two months of new mentions will push older excerpts out of the 12 for active entities, so a current rebuild is very likely to be held. The runbook already notes this ("new records displacing any old excerpt also hold the whole export"). Excerpt IDs themselves are content hashes, so they are stable across rebuilds of unchanged rows.

## Smallest fix per input

The four sidecars are one chain (primary, then decisions, then additional, with places alongside), and `build_evidence_bundle.py` already builds and audits them together against one frozen source. The smallest real fix is therefore one supervised bundle build, not four separate jobs.

| Input | Smallest fix | Where it runs | Size |
|---|---|---|---|
| `evidence-layers-full` | Rebuild with `build_evidence_layers.py` inside one supervised bundle build against the box's live `parli.db`. It cannot be reused. | First a one-off backfill on the box in a held maintenance window (`ec2.sh start --maintenance`), then monthly. | M |
| `evidence-places` | Rebuild in the same bundle (a few minutes for 230,007 grants). The old file might still match the box's grant table, but the bundle pairs all four sidecars with one source, so a separate reuse path saves little. | Same bundle | S |
| `evidence-identity-decisions` | Rebuild in the same bundle (seconds, rule-based, no model spend). | Same bundle | S |
| `evidence-additional-mentions` | Rebuild in the same bundle. This is a second full speech scan. | Same bundle | M |
| Prerequisite: guard | Re-baseline the byte ceiling with explicit headroom, and allow an excerpt to rotate out of the 12-per-entity window when that entity's record count grew. Keep refusing lost entities and any other excerpt loss. | Code change on `main`, with tests in `scripts/vm/test_evidence_refresh.py` and `test_nightly.sh` | S to M |
| Prerequisite: run time | Run the build outside the nightly's limits. The 13 Nov nightly ran 5 h 46 min against `TimeoutStartSec=6h`, and the builder's default budget is 90 min. Use the held window for the backfill. After that, schedule a monthly run that does not share the nightly's 6-hour cap. | Box, monthly | M |

Run-time estimate, unmeasured: #197's box sample scanned 2,000 speeches plus 20 releases in 4.46 s. Linear extrapolation to about 1.33 million speeches gives about 50 minutes for the primary scan alone. The additional pass is a second scan of the same size. Then come the four-table source copy, the export and the full source audit. Expect the whole build to exceed the 90-minute default. On the first run, use `--keep-audited-candidate` to measure time, disk and the guard result without publishing.

Disk: the bundle needs the four sidecars (about 3.4 GiB at their 8 Sep sizes, plus WAL growth while building), a four-table copy of the source (unmeasured, dominated by `speeches`) and the builder's 5 GiB reserve plus 1 GiB of headroom. The runbook records a 100 GiB root volume (verified 19 Oct). This lane could not check current free space on the box.

**Freeze option (drop the layer's refresh), size S.** Keep the 8 Sep snapshot as published. Show "Snapshot 8 Sep 2026" on `/connections`, in the profile evidence panels and on the stats card. Turn the nightly warning into an info line such as "evidence: frozen at the 8 Sep 2026 snapshot, inputs not provisioned". Clear the catch-up marker so the readiness probe runs only on Sundays (or skip it when no inputs are configured). The damaged excerpts stay. The date label is worth doing on either path, because the pages give readers no date today.

Options ruled out:
- **Copy the 8 Sep sidecars to the box.** No snapshot of the 8 Sep corpus was found. The desktop holds only its working copy and a 28 Sep transfer archive, so readiness would report `mismatch`.
- **Build on the desktop.** Its corpus stops at 24 Sep, so the result would be about 6,000 speeches fresher and then frozen again. It would still need a transfer to the box and desktop capacity.

## Decisions for the project owner

- **Rebuild or freeze.** Rebuilding means the guard changes above: letting the public evidence tree grow past the 8 Sep byte ceiling, and letting excerpts rotate. Freezing means accepting a dated, static connections layer.
- **Starting the box** for a held maintenance window. Starting it is reserved. The build uses a few extra instance-hours of the existing instance and no new resources.
- **Disk.** If the first build shows the bundle does not fit beside the live `parli.db`, a volume resize is spend plus an account change.
- **Paused source.** The grants fetch (`grants_fetch`, www.grants.gov.au, HTTP 403, permission requested) is the reason the places layer has no new grants. No rebuild changes that until access returns.
- **No model or API spend.** The identity review is rule-based.
