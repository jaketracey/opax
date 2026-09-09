# Grants research and parliamentary representation

The new `/reports/grants-allocation` experience compares MLCI invitations with published awards and links every project to its source. Parliamentary profiles show jurisdiction, chamber and recorded representation where a conservative identity match is available.

## Source snapshots and interpretation

- Departmental response to Senator Canavan, MLCIP list dated 14 November 2025: 227 project invitations. Excluding the $1,656,000 withdrawn Coolgardie proposal leaves 226 and exactly $559,241,712. These are invitations, including projects awaiting applications; they are not payments or awarded grants.
- GrantConnect program GO7867: 89 published awards, $242,781,386 in the 9 September 2026 source snapshot. Only 22 have detailed delivery-state records and individual notice URLs; missing states remain unknown. Never add this total to invitation allocations.
- AEC 2025 seat status fact sheet: all 150 seats, using the notional pre-election baseline, including non-classic seats. Bullwinkel is 3.35, Bradfield 3.40 and Dunkley 6.77 percentage points. This is not current incumbency or the election result.
- Centre for Public Integrity, *Public money, political advantage?*, 8 September 2026: attributed Table 3 comparison. Its four by-election substitutions and Brisbane exception are not included in the AEC picker. Opax has not independently reproduced the project-to-seat comparison.
- Parliamentary roster: 983 of 1,557 profiles receive recorded representation by exact normalised full name, jurisdiction and chamber. Person ID alone and roster service dates are not trusted. Past seats remain explicitly historical/recorded.

Original URLs and PDF hashes are in `portal/public/research/mlci.json`. Raw PDFs, extracted text, database exports and publication receipts are retained at `/Users/jake/.cache/opax/acquisition/mlci-20260909/`. Rebuild using `scripts/build_grants_research.py --sources <source-directory> --output portal/public/research/mlci.json`, then `scripts/enrich_profile_jurisdictions.py` with the members export, public directory and research JSON. The builder deliberately fails if source totals change.

## Corpus access

`scripts/publish_grants_research.py` creates deterministic resources in the existing KB, checks the source identity, and reads every body back before writing a verified receipt. It makes no model calls. On 9 September all 1,451 records passed: 227 invitations, 89 awards, 150 electoral baselines, 983 roster affiliations and two research notes. All award source fields are retained in corpus metadata, including the recorded selection method (22 awards) and delivery postcode (21); these fields are also in searchable text with no electorate inference. The CPI note is a short attributed summary with the original report linked, not a copy of the full PDF.

Live retrieval found the Chisholm Cricket project, CPI note, Bullwinkel baseline and David Pocock roster entry. Live counters at verification showed 620,066 resources; the manifest distinguishes this tranche from 242 other records added since the previous snapshot. Existing collected-source counts and enrichment relationship totals are separate from live KB resource totals.

Access includes unified search, individual source pages, Ask/citations, Similar, report retrieval and corpus statistics. The public catalogue includes project/source totals, the CPI reference, seat baselines and representation in person entries. Specific document filters distinguish invitations, awards, election baselines, representation and research notes. Public routes and metadata recognise their slugs, rather than calling them speeches by an unknown speaker. Corpus cache epoch: `2026-09-09-grants-research-2`.

Ask and report prompts preserve the distinction between original document wording and Opax's structured descriptions. Invitations and awards are not added to money-map receipt flows or treated as payments. A future electorate allocation requires project-site evidence, not recipient postcode inference. The report generator preserves the curated comparison entry when rebuilding its index.

## Pending Codex enrichment

The authoritative new queue is **desktop:/home/jake/.cache/autoresearch/mlci-20260909/enrichment-queue.sqlite**. The local copy is a preparation snapshot, not a second work queue. `scripts/queue_grants_enrichment.py` creates stable source-hashed tasks and supersedes pending inputs when the source changes. Re-running the same inputs adds nothing.

There are 890 pending tasks: 226 actual project locations; 89 invitation-to-award matches; 574 missing parliamentary representations; one reconciliation of CPI's baseline adjustments. Twenty-two old award inputs were superseded when specific notice URLs became available. Existing speech/release queues are unchanged. The existing hourly **Track Opax enrichment** follow-up now processes up to five source-research tasks per run using Codex, with no paid external model calls.

Each task carries its evidence requirements. Claim pending tasks transactionally, storing worker and status; store findings in `evidence_json` with original URLs, exact excerpts, method and unresolved candidates. A proposed match goes to `review`, not `done`. Verify identity, location, source date and applicable boundary before publication. Preserve unresolved and multi-site cases. Queue completion is not claimed here.

## Validation

Data checks reconcile all amounts and seat counts, distinguish AEC notional margins from by-election substitutions, reject cross-jurisdiction namesakes and prevent roster tenure inference. Browser checks cover chart lenses, state/stage filters, seat selection and compact layouts. The test Ask answer retrieved both program totals and cited them while keeping the stages separate. Public research summaries must not be presented as verbatim departmental wording.
