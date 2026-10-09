# FRL instruments phase 1 — accepted metadata catalogue, 9 October 2026

Jake approved the source on 9 October. The first catalogue is acquired, reconciled,
exported and validated locally on `web/frl-instruments`. The orchestrator owns the
merge and promotion; this lane performs no push, deploy or production writes.
Coverage remains **partial: metadata only**. No document bodies or summaries were
acquired, and the API exposes only one bounded returned version per title here.

## Accepted acquisition

- Scope: `collection eq 'LegislativeInstrument' and isInForce eq true`.
- **24,143 unique, fully expanded titles / 24,150 listed by FRL**. Seven rows could
  not be retrieved from its API. Unique ids plus the evidenced gap reconcile exactly.
- Checkpoint count anchor: **24,148**; final count: **24,150**; recorded drift: **+2**.
  Tonight's opening and ending counts were both 24,150. Every page has a count
  receipt. Three final pages were swept again; no new ids or prefix backfill were
  needed, and the end count remained stable.
- Unresolved offsets: **5,200 (1), 8,500 (2), 10,000 (1), 18,000 (1), 20,800 (1),
  21,300 (1)**. Forty gap-probe attempts were used. The seven-row allowance is
  below both ten rows and 0.05%; it never permits missing expansion fields on an
  exported title. No individual recovery was required in this run.
- Run: **21:11:42–23:37:10 Melbourne, 9 October**; **468 attempts / 2h 25m 29s**.
  Nineteen transport timeouts recovered through bounded backoff. HTTP 429: **0**;
  HTTP 503: **0**; Retry-After waits: **0**. Initial computed cap: **696**, ceiling 900.
- The normal quiet-window guard was used with **no override**. Website Crawl-delay
  and every publisher request use at least ten-second spacing; the window is the
  intersection of fixed UTC+10 and Melbourne quiet hours, with a deadline margin
  before 08:00 local. No temporary override wrapper remains.
- The fully specified earlier checkpoint was migrated through fresh membership
  reads. Matching complete metadata was reused by id, with no old offset or gap
  allowance trusted across windows. The default guard and weekly path are unchanged.
- Snapshot: **36,092,996 bytes**, gitignored inside `scripts/state/frl/` with
  checkpoints, policy/count/probe/tail receipts and test/curl evidence. No desktop
  DB, D1, KB, Cloudflare production or refresh-box writes occurred.

## Export and web contract

The catalogue has **107 files / 19,758,968 bytes** under
`portal/public/instruments/`, including a **465-byte `ready.json`**. Catalogue year
buckets cover **1920–2026**. The complete flag carries source count, actual exported
count, count anchor/end, drift, seven gaps with offsets, export date and tail sweep.
The instruments sitemap adds one file: **2,269,552 bytes / 24,143 id-only URLs**.
Together the new asset files total **108 / 22,028,520 bytes**, within 400 files and
25,000,000 bytes. The exporter validates its full plan before writing.

Every row retains the supplied public title metadata, department/portfolio arrays
and one API-returned version, plus a separate OPAX canonical FRL link. Dates are
labelled Made, Registered and Commenced; no version start is inferred as commencement.
Returned current/latest flags are preserved without asserting that an earlier
returned version is current or latest. The authoritative FRL latest link supplies
legal text. OPAX shows metadata only, with no summaries or legal-text bodies.
Private names remain within verbatim authorised titles; no person entities, joins,
search rows or links from titles are created. Sitemap fields contain ids only.

The directory filters title, portfolio, type, commencement year and status. Its
small note states “FRL listed 24,150; 7 could not be retrieved from its API”. Detail
pages carry source facts, one authoritative link and CC BY 4.0 attribution dated to
the latest download, **9 October 2026**, with source/licence links, modifications,
no endorsement and Coat of Arms/marked-third-party exceptions. Parsed catalogue
metadata is cached per isolate. Navigation fetches the tiny complete ready flag.
Unknown ids or missing/incomplete catalogues return noindex 404s.

Global instrument search remains omitted: the existing general search catalogue is
**211,122,963 bytes** before and after this lane. The directory provides its own
filters. The unrelated pre-existing one-row interests manifest difference exposed
by rebuilding search is excluded from these commits.

Weekly wiring stays inert until this accepted directory is tracked on main. The
existing guard skips acquisition/export before that point. Nightly group staging
handles new/deleted chunks. Acts and instruments share the normal quiet guard;
bodies/version history remain outside the weekly metadata group.

## Validation

`origin/main` **a3aa6532** is merged locally as **bd04b284**. Both the new passage,
search-toolbar and division Markdown work and the FRL changes are retained; the
people group includes `portal/src/passage-names.json`.

- Search rebuilt and **1,039/1,039 default Node tests passed without a catalogue
  before any publisher request**. After export, **1,039/1,039** pass again.
- The explicit instruments release gate passes against the actual catalogue.
- Offline Python: **60/60** loader/export; **120 VM checks (119 pass, one existing
  clean-tree skip)**; **8/8** passage-text checks. All use stubs/fixtures.
- TypeScript passes. `votes.json` is byte-identical to origin/main, schema 1,
  SHA-256 `a77128dc0e1e1b3fdaa4bf84501e2c94af3125dea3cf0b2dffbc688a49d68546`.
- Local Wrangler runs the actual portal Worker and full accepted catalogue using a
  smaller copied static asset set to avoid the Mac's full-tree watcher limitation.
  Curl: `/instruments` **200**; `/instrument/F1997B02175` **200**, with SSR facts,
  attribution and authoritative FRL link; `/sitemaps/instruments-1.xml` **200**;
  `/instrument/F9999L99999` **404 + noindex**; ready flag **200 + complete**.
  No person links appear in the instrument HTML. The actual locally served
  navigation script reads the actual flag and inserts both desktop and drawer
  anchors. This is local verification; no production deployment is claimed.

## Phase 2

Consult the publisher before a full crawl. Review document-level licences,
Coat of Arms and third-party restrictions before PDF, Word, EPUB or HTML bodies.
Acquire complete version history and current/latest supplementation through a
permitted, reconciled method, preserving source registration/version ids and
supplied repeal, supersession and disallowance relationships without inference.
A sourced reader will distinguish as-made, compilation and authoritative text.
A later app lane adds an iOS instruments list/detail and its export contract,
with device validation. This lane performs no native or simulator work.

## Historical review notes

The earlier-round notes below preserve review decisions and estimates. Their
interrupted-run counts and acquisition estimates are superseded by the accepted
receipt above.

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
