# Victorian advertising: review round 1

19 October 2026 Melbourne. Staged only; no promotion, push, deployment or source
requests in this round. The unpublished lane was rebased onto
`567e8698b56133f41ec1f9057ed55440e69548c7` and its single commit rewritten.

- `scripts/gov_advertising/privacy.py:39` implements default-deny review of every
  report-derived text role against the shared reviewed labels/organisations.
  `victoria.py:63` sanitizes every extracted table before staging; line 73
  repeats review at the projection boundary. Unknown narrative is held in full,
  with only a hash, reason and coordinates retained in staged hold receipts.
- `stage_victoria.py:55` reviews publication titles; lines 105–106 review GST and
  scope text. Lines 139–144 write the hash-only hold ledger and policy receipt.
  `scripts/promote_hub_data.py:49` binds both to the eight-input review contract.
- `portal/src/gov-advertising.ts:59` independently validates report text before
  serving; line 124 sanitizes the table projection. Line 139 formats plain
  snapshot dates while source JSON/CSV timestamps and hashes remain complete.
  Cards have one source/licence receipt each (line 160) and the page has one
  source block (line 170), with no stacked receipts above the lede.
- `docs/COVERAGE.md:252` and Next #3 (line 402) record the regenerated staged
  projection. Main's tax-expenditure “live 18 Oct 2026” and NSW divisions through
  15 Oct wording are preserved.

**40 advertiser descriptions** are now held, alongside 206 campaign titles,
15 amount annotations, 14 notes and four period strings: **279 field holds**.
The previous nine campaign-table holds and 30 attachment holds remain. No text
was removed by hand from the data: the parser/policy regenerated tables and the
public projection from unchanged private originals. **1,194 cells and all 62
reconciliation checks remain** (42 source-total identities, 16 exact component
checks, four within printed precision). No figure or total was invented.

The invented-person fixture verifies source-table and projection sanitization,
app-asset bytes, filtered SSR, actual shared-table hydration, CSV, table search,
sitemap and local MCP output. Existing supplier and licence holds still pass.
**58 Python tests** pass (22 advertising, 14 promoter, 12 GFS, 10 tax), together
with **100 Node tests** covering advertising, shared register, GFS, tax and
navigation. The initial navigation attempt lacked generated calendar assets;
the final run used offline private fixtures, with its temporary local asset
link removed after testing. No release/nightly build was run.

`npm ci` preceded Node testing. TypeScript, `npm run -s check`, the original-source
verification dry run, Wrangler deploy dry run and `git diff --check` pass.
The reviewed promoter dry run intentionally refuses the pending review receipt;
no public advertising asset exists. `votes.json` is byte-identical to current
`origin/main`.

The four screenshots were retaken in `portal/private/vic-advertising/` at
390 and 1440 (top and table). The phone table itself is **350 px**, with a
350 px container/scroll width; all amount cells fit, including without JS.
No page errors. [Checks and screenshot hashes](validation.json).

History audit: `git log -p origin/main..HEAD` was checked with fixed-string grep
against the private reviewer-pattern receipt. **0 matches**, across the single
rewritten branch commit. Only the count is recorded; the patterns and original
text remain in ignored private evidence.
