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
