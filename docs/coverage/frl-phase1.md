# FRL instruments phase 1 — held implementation, 9 October 2026

This branch implements metadata ingestion, a bounded export, server-rendered
instrument directory/detail pages and held weekly refresh wiring. **Phase 1 is
not complete:** there is no accepted comprehensive snapshot or public catalogue.
Do not merge, push or deploy this branch until acquisition and the release gate
finish and Jake approves the source. The orchestrator owns promotion.

## Acquisition evidence

- Scope: `collection eq 'LegislativeInstrument' and isInForce eq true`.
- Live scope count: **24,146**; the 8 October coverage audit counted 24,142.
- Cached expanded title records: **5,299 unique ids**, in 53 checkpoint pages,
  **7,984,390 bytes**. These are incomplete acquisition evidence, not a snapshot.
- Accepted comprehensive snapshot/export: **0 rows; 0 catalogue files/bytes**.
- Source HTTP attempts: **105**, including policy/schema probes, timeouts,
  source failures and backoff retries. Acquisition/inspection lasted about
  **38 minutes 6 seconds**, from the first robots receipt at 21:19:27 UTC to the
  held run at 21:57:33 UTC on 8 October (9 October in Melbourne). This is elapsed
  evidence time across diagnostic/resume attempts, not a completed-run receipt.
- Evidence and checkpoints are gitignored under `scripts/state/frl/` in this
  worktree. No production, desktop DB, D1, KB or refresh-box writes occurred.

The website robots policy requires a ten-second delay. The API host's robots
path returned 404. The reuse guidance prefers subsequent incremental website
crawls outside **08:00–20:00 UTC+10**. This lane conservatively observes that
window for API acquisition too, including a stop if it begins mid-run. No source
requests were made after the busy window began. The next quiet period begins at
**21:00 Melbourne / 10:00 UTC on 9 October**. Jake was asked whether this initial,
metadata-only API run may continue during the busy period; no answer has been
assumed. The weekly implementation keeps the quiet-hours guard.

## API defects and implemented safeguards

Unbounded version expansion and several smaller/filtered expansion variants
returned transport timeouts. Combined latest/current filtering and combined
relationship expansion returned HTTP 400. An id range filter also returned 400.
Plain title pages and administering-department expansion work. A bounded
`versions($top=1)` expansion returns one version, which can be historical.

An expanded page at offset 5,200 returned only 99 parents against the same scope
count. The previous reconciliation rejected the resulting duplicate instead of
writing a partial snapshot. The corrected loader independently enumerates plain
title pages with `$orderby=id`, `$top=100` and fixed `$skip` increments of 100.
Expanded navigation metadata is matched by explicit id. It preserves every
returned field and identifies missing expansions without asserting empty
relationships. Plain unique ids must match the source count before and after
acquisition. Empty snapshots and shrinkage exceeding 2% are refused.

Interrupted pages resume from the checkpoint. Completed checkpoints are cleared
for the next weekly acquisition, even if the count is unchanged. A count/scope
change requires a fresh checkpoint directory; the existing evidence is retained.
Each run is capped at 600 HTTP attempts, with at least two seconds between API
requests and backoff for 429, 5xx and transport failures.

## Export and web contracts

The exporter plans all assets before writing, refuses empty/shrunk snapshots,
and enforces **400 files / 25,000,000 bytes**. Year chunks contain up to 512
records, with shared field/string dictionaries preserving source values. The
incomplete sample is used only for size assessment: its packed size is
4,003,015 bytes, projecting roughly 18.2 MB for the full count. That estimate is
not an attested final asset budget.

Every record carries the publisher's `/{frl-id}/latest` canonical URL. Pages
label Made, Registered (as-made registration) and Commenced separately; version
start/status dates never stand in for commencement. The API supplies no
whole-instrument commencement date in this scope, so it stays unknown. Returned
version flags are shown verbatim without calling a historical row current.
The authoritative FRL latest link supplies the legal text. OPAX displays metadata
only, with no summaries, bodies, inferred legal relationships, person entities,
person joins or person search rows. Private names remain within verbatim titles.
Sitemap URLs and entries use FRL ids only, with the export date as lastmod.

FRL attribution includes the required full download date, source and CC BY 4.0
links, modifications, no endorsement, and the Coat of Arms/marked third-party
exceptions. Sources/licence pages and `docs/COVERAGE.md` describe the partial,
held metadata lane. The weekly `instruments` group uses the existing export and
keep-if-unchanged guards; it never opens a DB or talks to the KB.

Global search was skipped: the freshly rebuilt catalogue is already
**211,122,963 bytes** (version assets plus manifest), before and after these
changes. Adding 24,000 instrument title rows would enlarge that general-purpose
catalogue. The directory supports its own title/portfolio/type/year/status
filters. The build exposed an existing one-row interests difference from the
checked-in search manifest; that unrelated manifest change is excluded.

## Validation and remaining gate

Eight offline Python tests cover ordered paging/count reconciliation, missing
expanded parents, resume/idempotence, fresh weekly metadata, moving counts,
empty/shrink refusal, request backoff/budget and export budget/preservation.
The portal suite has **940 tests: 939 pass and one release-gate failure**, because
the complete accepted export does not yet exist. TypeScript and the deploy
workflow's build/stamping/privacy/photo checks pass; `wrangler deploy` was not
run. The held wiring passes shell syntax checks.

The full asset-tree watcher produces `spawn EBADF` on this Mac. The actual portal
Worker runs in local Wrangler with a smaller copied asset set. Curl verifies
`/instruments`, a detail page, the instrument sitemap and a noindex 404 with an
explicit **offline fixture**, not a live source catalogue. Chrome verifies the
mobile drawer, desktop/mobile layouts and absence of person links/overflow.
The fixture exists only under gitignored local test state.

`votes.json` remains byte-identical, `_meta.schema` 1, SHA-256
`a77128dc0e1e1b3fdaa4bf84501e2c94af3125dea3cf0b2dffbc688a49d68546`.

Resume in the quiet period (or after Jake answers the initial-run timing
question), reconcile the complete title set, export, update coverage counts and
years, rebuild crawl/search, and rerun all gates against actual source records.
Then commit the catalogue locally for source review; the orchestrator alone
merges after Jake approves it.

## Phase 2

Consult the publisher before a full crawl and review document-level licences and
third-party restrictions before downloading PDF, Word, EPUB or HTML bodies.
Acquire complete version history and current/latest metadata with a permitted,
reconciled access method; retain registration/version ids and supplied
repeal/disallowance/supersession relationships without inference. Build a sourced
version reader that clearly distinguishes as-made, compilation and authoritative
text. A separate app lane adds an iOS instruments list/detail and its export
contract, with device validation; no native work belongs to this lane.
