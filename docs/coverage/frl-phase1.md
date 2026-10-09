# FRL instruments phase 1 — held implementation, 9 October 2026

This branch implements metadata ingestion, a bounded export, server-rendered
instrument directory/detail pages and held weekly refresh wiring. **Phase 1 is
not complete:** there is no accepted comprehensive snapshot or public catalogue.
Jake approved the source on 9 October. The code is safe to merge before data exists;
the catalogue stays hidden and weekly bootstrap is held until its first accepted
export is tracked on main. The separate release gate must pass before catalogue
promotion. The orchestrator owns merging and promotion; no push or deploy occurs
in this lane.

## Acquisition evidence

- Scope: `collection eq 'LegislativeInstrument' and isInForce eq true`.
- Latest observed scope count: **24,149**; the second authorised run began at
  24,148. The 8 October coverage audit counted 24,142.
- Retained checkpoint: **8,597 unique plain titles / 8,499 fully expanded ids**,
  **178 files / 20,062,089 bytes**. This is evidence, not an accepted snapshot.
- Accepted comprehensive snapshot/export: **0 rows; 0 catalogue files/bytes**.
- Second authorised run: **224 attempts / 69m 25s**, no HTTP 429/503 or Retry-After
  demands. It held when all three expanded reads at offset 8,500 reported 24,149,
  differing from the initial 24,148. Forty gap probes recorded one missing row on
  page 5,200 (position 5,238) and two on page 8,500. The temporary wrapper and its
  bytecode were removed; no busy-hours override remains in the default path.
- Evidence and checkpoints are gitignored under `scripts/state/frl/` in this
  worktree. No production, desktop DB, D1, KB or refresh-box writes occurred.

The website robots policy requires a ten-second delay. The API host's robots
path returned 404. The reuse guidance prefers subsequent incremental website
crawls outside **08:00–20:00 UTC+10**. This lane conservatively observes that
window for API acquisition too. The review identified that the final hour was inside
Melbourne's AEDT busy period; round 1 now blocks both timezone readings before every
request, including policy probes. The next quiet period begins at
**21:00 Melbourne / 10:00 UTC on 9 October**. Jake explicitly authorised two one-off busy-hours attempts on 9 October. Neither
produced a snapshot. Tonight's 21:07 Melbourne run uses the default quiet guard,
with no override. The weekly implementation keeps the same quiet-hours checks.

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
Expanded navigation metadata is matched by explicit id. Round 1 retries any omitted
parent or field up to three times and holds publication if it remains missing. Only
explicit source-returned empty arrays count as empty relationships. Final unique ids must cover the final count minus the permitted, evidenced gaps;
net count drift is bounded to 50. Empty snapshots and shrinkage exceeding 2% are refused.

Interrupted acquisitions keep the same query fingerprint across quiet windows
when the initial count anchor drifts by at most 50. Later windows re-enumerate
membership and reuse matching complete expansion bodies by id, so unchanged counts
cannot hide different members. Fully specified schema-3 checkpoints migrate only
through this fresh membership pass; other legacy/mismatched/completed checkpoints
rotate automatically. Start, per-page and end counts are recorded. After paging,
a bounded tail sweep fetches newly returned ids individually and scans earlier id
pages if necessary to find insertions before the current offset. Final count
changes require another sweep; missing metadata or unreconciled totals still hold.

The default minimum spacing is ten seconds for every request. The computed cap is
initially 696 attempts at 24,149 titles (hard maximum 900), including 40 gap probes, 100 planned tail
requests and 10% retry headroom. Far-back prefix recovery can re-cost its work up
to 300 tail attempts while respecting 900 overall and any lower caller cap. Retry-After is honoured; repeated 429/503 or a third
Retry-After demand stops cleanly. A 60-second deadline margin and 45-second request
timeout stop collection before 08:00 Melbourne. The run logs its forecast against
the remaining quiet window. Today’s checkpoint can retain validated expanded
metadata for tonight, but every plain membership page is read again.

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

Round 1 passes **944/944 default Node tests with no catalogue**. The separate
`check:instruments-release` gate exits 1 with "complete catalogue absent", as expected.
Offline Python gates pass: **23/23** loader/export tests, **48/48** keep-if-unchanged
checks, and **64** validation tests (**63 pass, one existing skip**). TypeScript passes.
The stale registry-order test now compares the validator with `data_groups.sh`.
No publisher requests or data acquisition occur in round 1. Initial implementation
build and UI validation evidence below used local fixtures; no deployment occurred.

The full asset-tree watcher produces `spawn EBADF` on this Mac. The actual portal
Worker runs in local Wrangler with a smaller copied asset set. Curl verifies
`/instruments`, a detail page, the instrument sitemap and a noindex 404 with an
explicit **offline fixture**, not a live source catalogue. Chrome verifies the
mobile drawer, desktop/mobile layouts and absence of person links/overflow.
The fixture exists only under gitignored local test state.

`votes.json` remains byte-identical, `_meta.schema` 1, SHA-256
`a77128dc0e1e1b3fdaa4bf84501e2c94af3125dea3cf0b2dffbc688a49d68546`.

Resume in a later acquisition round after 21:00 Melbourne, reconcile the complete title set, export, update coverage counts and
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

## Round 1: offline review fixes

This round makes no publisher requests and acquires no data. The release check is
`cd portal && npm run check:instruments-release`, separate from the default Node suite.
The default suite is valid without an FRL catalogue. Routes return noindex 404s until
it is complete; navigation, llms discovery and the instruments sitemap type are held.
Parsed manifest/index assets are cached per Worker isolate for five minutes. The detail
page has one authoritative link and separate source/OPAX metadata blocks. Licence copy
allows a historical returned version. Attribution uses the latest download receipt.

In the later acquisition round after 21:00 Melbourne on 9 October, use the existing
`scripts/state/frl/checkpoint-bounded` checkpoint path. Its legacy configuration lacks
a quiet-window stamp and complete scope fingerprint. It will automatically move to
`checkpoint-bounded.previous`, and **none of its 5,299 rows will be reused**. The run
reads policy receipts and a fresh count, then starts plain/expanded id-ordered paging
at offset zero, retries missing expansions, checks the final count, stages the snapshot
and exports only after full reconciliation. At the last count of 24,146: 242 page pairs,
four policy reads and two count reads = **490 requests without retries**, bounded at
600 attempts. Expect roughly **50–70 minutes**, allowing for plain-page reads beyond
the cached expanded-page median of 9.92 seconds. This is an estimate, not a run receipt.
Round 2 adds individual recovery: if the known 99-parent expansion at offset 5,200
persists on all three page reads, the missing id is fetched from its own single-title
endpoint. With a successful individual response, the revised completion estimate is
**493 requests**: 490 base requests, two extra page reads and one individual read.
The duration estimate remains about 50–70 minutes. Any failed individual response or
more than 50 recovery ids holds publication. Shared spacing, quiet hours and the
600-attempt cap apply to these reads too. Requested/recovered ids and source responses
are recorded under `individual-fetches.json`, including held-run evidence; the final
run receipt lists the ids. No acquisition is started or scheduled in either fix round.

## Round 3: merge readiness

Jake approved the source. This round changes code only and makes zero publisher
requests. Static instruments anchors are removed from every shipped HTML file;
desktop and drawer navigation insert the entry only after a complete `ready.json`
flag. The exporter writes this tiny count/date flag within the existing asset budget,
and validation checks it against the full manifest.

Weekly acquisition and export skip until the catalogue directory is tracked in HEAD
on main. Nightly commit staging refreshes its directory allowlist and includes new
and deleted chunks without staging unrelated files. Five offline Git fixture tests
exercise these production shell blocks. Default all-group validation reports
`SKIP instruments (no catalogue)` for an unpublished missing catalogue; explicit
validation and deletion of an already tracked catalogue remain failures. Weekly
Acts ingestion now shares the FRL transport's quiet-window checks before its first
request, after spacing and on retries; busy hours exit 3 as STALE.

Validation: **946/946 Node tests pass without a catalogue**, **32/32 loader/export
tests pass**, and **120 VM Python tests run (119 pass, one existing clean-tree skip)**:
48 keep-if-unchanged, 67 data-validation and 5 refresh fixture tests. TypeScript and
shell syntax checks pass. The separate release gate exits 1 with "complete catalogue
absent", as expected. `votes.json` remains byte-identical to `origin/main`, schema 1.

## Plain-page gap recovery

The authorised one-off morning run stopped after 110 requests / 31m 52s, with
5,200 unique titles and complete expanded metadata against FRL's count of 24,148.
The non-final plain page at offset 5,200 was short; no snapshot/export was published.
There were no HTTP 429/503 responses or Retry-After waits. Its checkpoint evidence
is retained locally; the temporary override was removed and the default guard stayed
unchanged.

The loader now probes short non-final pages using overlapping ten-row windows,
single positions, neighbour boundaries and a reverse-id listing projected to id.
It never guesses an FRL id. Each candidate needs its own scoped, fully expanded
entity response. Forty probe attempts, including transport retries, is the maximum;
the strategy/limits are fingerprinted, so the morning checkpoint starts fresh.
Unresolved plain-title gaps may be published only up to ten rows **and** 0.05% of
the source count. Count, exported rows, the gap and its page offsets are explicit in
snapshot evidence, manifest and readiness flag. A small directory note identifies
the shortfall. Each exported title still requires complete expansions, and detail
pages contain no gap note. Sitemap counts use exported ids only.

Step 1 is committed only after offline validation: 947/947 Node tests, 42/42
loader/export tests and 120 VM Python tests (119 pass, one existing clean-tree
skip). TypeScript passes, and schema-1 `votes.json` remains byte-identical.
No publisher requests occur during this code/test step.

## Quiet-window completion round

This code-only round records count drift and tail-sweep evidence in the snapshot,
manifest and tiny readiness flag. Publication requires complete expanded metadata
for every exported id, unique rows at least final count minus evidenced gaps,
absolute drift at most 50, and at most 10 gaps / 0.05% of the final count. Insertion
stubs cover both sides of the current offset, individual recovery of shifted
parents, an end-receipt registration, drift 51, the computed cap, and clean dawn
stop followed by same-scope resume. All verification is offline; no publisher
requests, push or deploy are authorised in this round.

Validation: **948/948 default Node tests without a catalogue**, **60/60 loader/export
tests**, and **120 VM Python tests (119 passed, one existing clean-tree skip)**.
TypeScript and asset stamps pass; `votes.json` remains byte-identical, schema 1.
The separate release gate remains held because the catalogue is absent. No
publisher requests were made. The retained 85 expanded pages / 8,499 ids qualify
for metadata migration with a fresh membership pass. Tonight is expected to use
about 450–500 attempts / 2¼–2¾ hours if those source fields still match and response
times resemble today. A full fresh bootstrap is roughly 540–600 attempts / about
three hours; the initial cap is 696 and any re-costed prefix backfill is capped at
900. Both fit the 21:07–08:00 Melbourne quiet interval under those assumptions.
