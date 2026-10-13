# Reviewed hub data promotion

Prepared **14 October 2026** on `coverage/promote-hubs`. The reviewed static
assets are committed for the next deployment. Both hubs return 200 in the local
Worker using files from `portal/public`, and existing Victorian person pages show
the gifts section for all **38** exactly linked office holders. No push, deploy, source acquisition, KB or production D1 write.

| Hub | Snapshot | Promoted counts | Public asset | Bytes |
| --- | --- | --- | --- | ---: |
| Budget | 13 Oct 2026 Sydney / 12 Oct UTC | 13 Budget releases; 851 licensed document links; 805 fiscal observations; 2,347 native measure rows counted; 267 portfolio entries, 15 with links | `portal/public/budget/data.json` | 3,807,095 |
| Victorian gifts | 14 Oct 2026 Sydney / 13 Oct UTC | 3 periods; 6 tables; 282 entries (235 ministers, 47 parliamentary secretaries); 275 exact roster links, 7 unlinked source rows | `portal/public/vic-gifts/data.json` | 380,437 |

Budget measures remain a count in the existing Worker contract, with the full
rows retained in staged data. The one restricted document and all **38 held PBS
indexes** are excluded from the public asset. Its 267 portfolio entries comprise
15 accessible index links and 252 unlinked availability records; the latter remain
absent from rendered lists. The final output contains **zero held IDs or URLs**.

The promoter reconciles inventory counts, releases, document IDs, formats,
licences and all required current-year fiscal metrics. Every fiscal and measure
row must join a cleared document with identical source URL, release, snapshot,
hash and licence. Document and publication-grant hashes join the committed
acquisition ledger. Budget originals are retained in the desktop acquisition
cache rather than the repo; promotion verifies reviewed ledger hashes without
re-fetching them. The checked staged hub must equal the existing budget projection;
publication then removes every access/licence-held index. Before writing, a final
scan rejects any held item, ID or URL anywhere in the output, including nested
receipts and incidental references. Reviewed staged bytes and input hashes remain
unchanged.

For gifts it reconciles every period/register file, table and role count, totals
and linked/unlinked counts; checks every retained snapshot's actual bytes against
its receipt; joins period and copyright receipts; rejects collection stops and
held periods/rows; reparses source HTML and the applicable linked licence offline;
and recomputes every unique exact Victorian roster link. The checked hub must
match the source-derived projection. Givers remain plain record strings.

Both inputs must match their explicit approved `review.json` hashes. Each output
is one atomic JSON asset including a `promotion` manifest with counts, UTC snapshot
date, input SHA-256, input-file hashes and the reviewed commit. Failed checks name
the guard, exit nonzero and leave that hub's asset untouched. The other hub is
independent. New periods flow on the next nightly run after their staged snapshot
and updated review receipt are reviewed and merged.

[Nightly wiring diff](nightly-wiring.diff): promotion runs after the existing
static exports and before validation. `budget` and `vic-gifts` are separate tracked
data groups, so commit allowlisting, validation and rollback include both assets.
Validation regenerates expected bytes offline and compares the public asset.
The sitemap follows the existing audit/instruments pattern: only promoted hubs
with rows passing their Worker serving guards are listed, dated to the snapshot.

[Browser receipt](browser-results.json): actual Miniflare Worker, disk-backed
public assets, external requests disabled; 390/1440, no overflow or page errors,
JavaScript-disabled tables, and Jacinta Allan's 32-entry sourced person section.

- Budget: [390](budget-390.png), [1440](budget-1440.png).
- Victorian gifts: [390](vic-gifts-390.png), [1440](vic-gifts-1440.png).

Fix round 1 removes the held PBS indexes reported on `6e1518251`. The output
scan also rejects a held ID or URL referenced through another field and leaves
an existing asset byte-identical on failure. Tests cover held access and licence
indexes in reviewed staged input, leaked references and a missing prior asset.

Fix gates passed: **12 promoter tests**, **312 nightly checks**, **32 targeted
Worker/crawl tests**, TypeScript and `check`. Public-asset validation and the
promotion dry run also passed. Gates and new asset counts/hashes are recorded in
[fix-round1-validation.json](fix-round1-validation.json). Targeted Worker/crawl
checks exercise the promoted assets and all 38 linked Victorian person pages.
The initial promotion's full 2,000-test desktop run is retained separately in
[the original validation receipt](validation.json); it predates this fix.

The promoter compares `votes.json` before and after running; this fix additionally
requires exact bytes against `6e1518251` and `origin/main`.
