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

The live corpus snapshot at **2026-09-21T12:44:46Z** contains **625,606 resources**, versus 620,767 at the start of this run. It includes 598,425 speech resources, 6,015 releases, 14,014 division documents, 1,067 grant-award resources and 1,696 complete bill-text versions. The historical bill-text import continues after this cut; live `/api/stats` counters may exceed the versioned manifest.

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

The historical source-text publisher is resumed and independently monitored. Its immutable acquisition snapshot and per-run outcome records allow verification and safe retries. Current bill refresh is a separate, bounded key selection so the historical backlog cannot delay new bills.

## Verification and receipts

- 648 portal tests passed after regenerating the search catalogue; TypeScript, Worker bindings and asset stamp checks passed.
- 16 focused Python tests cover supplier lineage/window rules, Victoria refresh ordering/tag parsing and fresh-record priority without resetting claimed/completed work. Publication and enrichment validation tests also passed.
- Every newly created award and bill-text resource receives a source-body readback before success is recorded.
- The live award page `/doc/grantconnect-award-ga544645` was verified after the guarded publisher/route deployment (PR #178).
- Private operational receipts and immutable source archives: `~/.cache/opax/maintenance/corpus-refresh-20260921` on Mac and desktop. No API credentials are included in the repository.
