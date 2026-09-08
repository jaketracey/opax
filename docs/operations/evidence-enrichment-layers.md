# Evidence enrichment delivery

Goal: deliver organisation/program mentions, supplier identity resolution, inspectable relationship evidence, and places/electorates across the available corpus; expose the resulting connections in Opax and refresh corpus statistics.

## Completion requirements

- Scan the full authoritative speech and official release corpus with resumable progress; connect supported organisation/program mentions to known identities.
- Resolve supplier identities using validated ABNs and unique aliases; retain ambiguity and reject conflicting ABNs. Preserve source identities and provenance rather than destructively merging records.
- Store each relationship with its source record, exact supporting text or source fields, method, and confidence. Generated prose is not source evidence.
- Link explicit place/electorate mentions and structured locations; distinguish speaker representation, recipient address and delivery location. Postcodes crossing electorates retain all candidate areas and allocation ratios.
- Publish usable connections on the relevant profiles/map experiences, refresh corpus statistics, validate representative records and false-positive cases, and verify production.

## Current work

Clean worktree: `/tmp/opax-evidence-layers`. Source database is read-only on desktop. Enrichment lives in a separate SQLite database and can be rebuilt without modifying the source corpus.

2026-09-08 source inventory: 1,310,477 speeches; 21,234 official releases; 152,206 supplier identities; 40,902 donor identities; 132,630 grant recipient identities; 8,150 detailed grant records; 2,358 postcode/electorate mappings. These are source database counts, not claims about published or indexed coverage.

## First pilot and corrections

The first 200-record pilot extracted 1,121 mentions (8 program mentions) and surfaced an existing bad legal-identity row: a private contractor canonical name carried a government department ABN/legal name. The extractor now quarantines conflicting canonical/legal names, excludes individuals and unknown kinds from organisation matching, and requires alias name compatibility. These are heuristic conservative gates; the full output still needs review before publication.

Eight regression tests cover ABN checksums, conflicting identities, ambiguous aliases, source offsets, sentence boundaries, generic labels, duplicate evidence and split-postcode location roles. The second 200-record pilot is running in `/home/jake/.cache/autoresearch/evidence-layers-v2-pilot.sqlite` on desktop (local process session 93894). Do not publish pilot outputs as full-corpus results.

Remaining: audit second pilot and alias conflicts; scan all records; add place coverage beyond existing postcode mappings; review supplier identity candidates using Codex; expose evidence-backed profiles/map links; update published corpus stats; verify production and full coverage. The goal remains incomplete.

Second pilot completed: 244 exact organisation/program mentions in 200 records; 3,005 review-only identity candidates; 11,863 conflicting source names quarantined. Structured-location build: 1,928 grant delivery postcode overlaps; 9,859 recipient address overlaps; 202,632 registered-address overlaps. These overlap counts are edges and may include multiple electorates per address.

Full extraction launched on desktop as PID 918738, output `/home/jake/.cache/autoresearch/evidence-layers-full.sqlite`, log `/home/jake/.cache/autoresearch/evidence-layers-full.log`. Verify the PID/process and SQLite progress on continuation; do not infer completion from the log or restart merely because observation expires.

## Profile and map integration (local, not shipped)

Added a reusable evidence panel for supplier and donor profiles, an on-demand source-excerpt panel on Money Map donor cards, and `/connections.html` for searching organisations, programs and electorates. The exporter writes hashed lookup/shard files so profile pages do not download the whole directory. ABN-based lookups also require the profile name to map to that identity.

Publication gates now reject generic aliases and loose aliases lacking canonical-name equivalence (e.g. “our community”, “the farm”, and “Australian Public Service” for the Commission). Pilot export: 77 entities, 111 entity-record matches, 80 candidate record matches withheld. Export refuses incomplete corpus runs unless explicitly invoked for preview. Preview assets remain on desktop under `/home/jake/.cache/autoresearch/evidence-preview`; they are NOT in public assets.

Validation: 10 Python enrichment/export tests and 15 UI/router tests pass. Map bundles rebuild. Graph TypeScript checking reports eight existing undefined-Vector3 errors in `graph/explain.ts`; the file is byte-identical to origin/main (verified with cmp), and no new errors were reported in changed files. Full graph check remains unresolved for release.

Next: verify PID 918738 and extraction progress; inspect a broader sample through the publication gates; finish supplier candidate decisions and place coverage; render the new UI at mobile/tablet sizes; export full completed data, refresh corpus stats, PR/release and production verification. No completion claim yet.

## Identity, locations and browser verification

- `review_evidence_identities.py` produced `/home/jake/.cache/autoresearch/evidence-identity-decisions.sqlite`: 1,230 accepted exact full-name links; 1,775 unresolved. Checks include source ABN disagreement and the same full name held by competing ABNs. All decisions retain source register fields.
- `build_place_evidence.py` completed `/home/jake/.cache/autoresearch/evidence-places.sqlite`: 230,007 grant rows processed; 254,751 postcode/electorate overlaps; 213,821 recorded-place links; 206,206 programme links. Its programme checkpoint is complete. 822 speaker/electorate associations come from federal speech fields, not unreliable roster tenure dates. Old grant electorate fields were postcode-backfilled, so new links explicitly retain postcode ambiguity.
- Additional mentions pass is RUNNING as desktop PID 949793. Files: `evidence-additional-mentions.sqlite` / `.log` in `/home/jake/.cache/autoresearch/`. This scans names made unambiguous by accepted identities and programmes newly discovered in grant fields. Primary scan PID 918738 also remains live. At last check primary had passed 684,500 speeches and additional had passed 476,000 speeches; both have completed all official releases.
- Exporter now requires primary, additional, programme and identity coverage before allowing a full export. Arguments: `--source .../parli.db --evidence .../evidence-layers-full.sqlite --places .../evidence-places.sqlite --decisions .../evidence-identity-decisions.sqlite --additional .../evidence-additional-mentions.sqlite --output <NEW EMPTY DIRECTORY>`. Use a fresh output directory to prevent old identity shards surviving a later export. Refresh the exporter and `evidence_quality.py` on desktop before final export; latest changes are still local.
- The local preview at `/tmp/opax-evidence-ui-preview` contains PILOT text matches plus full grant-place data; never copy it to production. Its server is local exec session 72684, port 8794. Test harness `/tmp/check-opax-evidence.cjs` uses bundled Playwright. Chromium and WebKit both passed 390/768/1280 widths with zero page errors and zero horizontal overflow after fixing nested definition-list grids. Screenshots are `/tmp/opax-evidence-{chromium,webkit}-{390,768,1280}.png`. The Mac is locked; native CUA cannot run, so headless browser testing is used.
- 12 Python tests and 15 UI/router tests pass. Fixed the eight pre-existing graph array-index type errors by documenting/asserting the existing construction invariants; the full graph TypeScript check now passes. Rebuild map bundles after subsequent evidence module changes.

Still required: complete both scans; full data export with latest gates; review larger filtered output and recovered identity samples; validate source excerpts/offsets, location boundaries and new links; finish release gating/updated corpus statistics; ship and verify profiles, Money Map cards, connections directory and data in production. Full goal remains active.


## Publication review and source audit

Two bounded semantic reviews checked the top 300 organisation entries (900 excerpts) in `evidence-review-20260908-b`. Seventy-seven ambiguous bare phrases are withheld by publication gates; complete legal names remain eligible. Findings and source examples are in `alias-quality-review.json` and `alias-quality-review-second.json`. Export now prefers a publishable complete name before deduplicating entity/record matches, so an earlier incidental phrase cannot hide a later valid mention. Fifteen Python tests pass, including that regression.

The first preview source audit verified 38,999 excerpts and 69 postcode links. The larger partial snapshot verified 85,885 excerpts and 9,760 postcode links without errors. These are previews, not publication totals. `scripts/audit_evidence_export.py` checks every exported excerpt against source fields/text positions and hashes, totals and directory/shard identity sets. Final export must pass it again.

Additional mentions scan has finished; primary scan has passed 1.30m speeches as of 09:21 UTC. Baseline production Worker before this release is `c63368c1-d817-4022-85ae-fc3be6c6fdda`. No release made yet. Source stats UI separates collected corpus enrichment from live searchable coverage.
