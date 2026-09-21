# Corpus refresh — 21 September 2026

## Published refresh

The desktop source database was brought up to the latest available records using a 7–21 September lookback. The source database, static catalogue and live retrieval corpus have different coverage; source rows are not presented as unique searchable documents.

| Source | Result |
| --- | --- |
| Federal Hansard | 693 additional collected speeches; latest sitting 17 September. Three source pages returned HTTP 403. |
| NSW Hansard | 1,434 additional collected speeches; latest sitting 17 September. |
| Victoria / Queensland Hansard and Senate hearings | Checked; no new published source rows in the window. |
| Government releases | 216 new eligible resources: 17 PM transcripts, 58 NSW releases, 55 Queensland statements, 50 Victorian releases and 36 Treasury releases. Official-source, licence, date and duplicate-body gates retained. |
| Federal bills | Ten new bills and 40 changed registry entries. Existing speech briefs preserved. Refreshed original text discovery for these 50 bills found 20 additional complete versions. The targeted publication verified 29 newly created versions and 41 existing versions. |
| Recorded votes | 69 new federal divisions acquired. Publication created 90 federal documents (including source subdivisions) and 57 NSW/Victoria division documents. |
| GrantConnect | 978 new award notices; all 978 have verified retrieval-resource readbacks. Source register now contains 361,036 award notices. Award values are not described as payments. |
| AusTender | 2,043 notices fetched in the window. Rebuilt latest-notice supplier register: 869,225 contract lineages, excluding four suspect notices. |
| State donation disclosures | Queensland, Victoria and Tasmania reconciled to their fresh complete source snapshots; 375 new/changed rows inserted, 93 superseded rows archived, unchanged IDs and existing unique-name industry labels retained. WA remains research-only. |
| Lobbyist registers | Six official registers refreshed: 1,957 firms, 15,041 client links, 5,984 people and 8,345 disclosed contacts. Exact unchanged rows and stable amended register IDs retained; superseded rows archived. |
| Ministerial diaries / IPEA expenses | Fresh snapshots matched the already stored published rows. Latest IPEA quarter is 2026 Q2. No replacement of history with a partial window. |

The live corpus snapshot at **2026-09-21T12:44:46Z** contains **625,606 resources**, versus 620,767 at the start of this run. It includes 598,425 speech resources, 6,015 releases, 14,014 division documents, 1,067 grant-award resources and 1,696 complete bill-text versions. This was the initial release cut; the completed import is recorded below.

Updated static projections include bill pages, federal grants and programs, state money maps, the federal graph, supplier and agency profiles, votes, discovery cards, access links and both search catalogues. The supplier projection retains the established publication window from 8 July 2025 plus all legacy lineages, taking the latest current notice for every retained lineage. The full historical source database remains intact. This avoids a 109 MB single-agency response; every deployed asset is below 25 MiB. The graph's broader historical aggregate and the profile publication window remain separately described.

Historical grant-map **locations and reviewed matches are unchanged**. Only the corpus-context totals were refreshed: 361,036 awards and 9,425 detailed notices. No pending research candidate was promoted.

## Source limitations retained

- SA Hansard is still blocked by the source WAF (HTTP 403), with stored coverage through 12 November 2024.
- Federal interests pages returned no usable PDFs or senator records. Empty staging tables were not applied.
- New AEC annual/election/referendum source downloads contain amendments that do not match the cleaned historical table one-to-one. Both versions and a reconciliation report are retained; reviewed public donation data and AEC return projections are unchanged pending reconciliation.
- Roster acquisition does not establish current tenure; historical representation and its original snapshot dates remain intact.
- News ingestion stays disabled. No external paid model calls were used for enrichment.

## Reliability and enrichment

Victoria's release sitemap is now consumed newest first, with the refresh date applied before the cap. Its changed topic-tag shape is accepted. Treasury stops after a wholly older results page.

The live KB summary setting was changed to the schema's **no-generation provider**, and no automatic enrichment tasks are enabled. Ask's configured generation provider and credentials were preserved. Original-text publication is guarded against automatic generation, incomplete versions and mismatched source hashes.

The existing Mac Codex workers were restarted from the persistent runtime, replacing deleted temporary working-directory references in their launch agents. Fresh work is prioritised: **2,016 recent speech resources** added to speech-summary/topic queues and **216 release resources** added to the release-summary queue. Existing claimed/completed work is not reset. Repeatedly rejected rows are quarantined individually after three validation failures, retaining diagnostics; one rejected row cannot indefinitely hold a batch.

The historical source-text publisher completed its guarded import. Its immutable acquisition snapshot and per-run outcome records allow verification and safe retries. Current bill refresh is a separate, bounded key selection so the historical backlog cannot delay new bills.

## Verification and receipts

- 648 portal tests passed after regenerating the search catalogue; TypeScript, Worker bindings and asset stamp checks passed.
- 16 focused Python tests cover supplier lineage/window rules, Victoria refresh ordering/tag parsing and fresh-record priority without resetting claimed/completed work. Publication and enrichment validation tests also passed.
- Every newly created award and bill-text resource receives a source-body readback before success is recorded.
- The live award page `/doc/grantconnect-award-ga544645` was verified after the guarded publisher/route deployment (PR #178).
- Private operational receipts and immutable source archives: `~/.cache/opax/maintenance/corpus-refresh-20260921` on Mac and desktop. No API credentials are included in the repository.

## Completed bill-text import and release summaries

The follow-up live snapshot at **2026-09-21T13:31:32.575708+00:00** contains **628,657 resources**, including **4,747 complete original bill-text versions**. All 4,747 expected version slugs were reconciled against the live catalogue: no missing or unexpected versions. Every version and its original text field reports `PROCESSED`, with no pending or failed search processing.

The three source-body smoke-test publications are included among the historical receipt's existing versions. The historical import receipt contains 4,727 versions: 4,494 created with source-body readback and 233 already present with matching source identity. The separate current-bill receipt contains 70 versions: 29 created with readback and 41 already present. These overlap, so their row totals must not be added as distinct versions. Together they cover the 4,747 acquired versions. Previously reviewed notes and source-hash guards were retained. The KB no-generation summary provider and disabled automatic enrichment tasks were rechecked.

All **216 newly queued government-release summaries** are complete and each saved summary was read back from the live KB. Public document endpoints also return the summaries. One repeatedly rejected release was reviewed against its full source transcript and corrected without the unsupported numeral; its quarantine diagnostics were retained. Three older speech-summary writes that failed during temporary ingestion backpressure were returned to pending after confirming the summaries were absent. Their priorities and failure evidence were preserved. Speech-topic and speech-summary workers continue to prioritise fresh records.

Five further project-location tasks were moved to review with original council documents, source hashes, exact excerpts and unresolved alternatives. No provisional coordinates, electorates, matches, awards or payments were published.

The corpus manifest and cache epoch were refreshed. Validation: all 648 portal tests, TypeScript/binding and asset checks, complete bill-version inventory and processing reconciliation, and all 216 release-summary readbacks. Follow-up receipts: `~/.cache/opax/maintenance/enrichment-monitor-20260921T1258` and `~/.cache/opax/maintenance/research-batch-20260921T1258` on the Mac, with research evidence copied to the authoritative desktop queue archive.
