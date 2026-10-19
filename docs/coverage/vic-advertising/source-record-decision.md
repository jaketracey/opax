# Authorised source-record text — staged follow-up

Based on current main `4ec9603d33233d1559993810021bc37607a3a234`, fast-forwarded
before changes. The existing advertising register is live via `61a9cb859`.
This expanded source-text projection is staged only and awaits orchestrator
approval. No source acquisition, re-promotion, push or deployment occurred.

19 Oct 2026, Jake: grant recipients and private names inside authorised source records stay published as public record (12 Oct decision, c3a0c09b2); no person entities, profiles or identity joins are created for private individuals; privacy reviews do not reopen this.

The policy now distinguishes source-record text from entity fields. It keeps
advertiser descriptions, campaign titles, periods, notes and amount annotations
as published inside the authorised report. No name detector or narrative
allowlist removes source text. Organisation fields and media-channel facets
remain restricted to reviewed organisations/category labels. Individual and
sole-trader suppliers remain **individual supplier (withheld)** because those
are entity fields. This does not conflict with keeping names inside record text.

**40 advertiser descriptions and nine campaign tables are restored.** Those
nine tables add **45 cells**, bringing staging to **1,239 observations**, including
1,035 campaign-cost cells from 207 tables. The previous 1,194 observations keep
the same amounts and GST basis. All **62/62 reconciliation checks** and their
receipt bytes are unchanged: 42 source-total identities, 16 exact component
checks, four within printed precision. No totals or campaign costs are invented.

**Thirty attachments remain held** for robots/file-rights reasons. One
percentage table is non-monetary and plans are inventory-only. No name-only
table or narrative-field holds remain in the expanded stage. Source and licence
receipts and original source bytes are unchanged; there were no new requests.

The page and shared DataTable show descriptions and campaign titles as plain
text; the separate source column links to the publisher. Source-record text
can match table search and appear in CSV and future app data, with no person
entities, profiles, person links, person-name facets, name-search entity nodes
or cross-record identity joins. Directory joins inspect only the organisation
field. Tests include an invented person and a deliberately misleading directory
entry, and verify that a matching record does not become a person entity.

The shared register route/asset is reused. The existing approved v1 public
asset remains byte-identical and readable; this stage uses policy v2. The new
`review.json` is **pending**, with all eight current digests, the decision note,
and `reviewed_commit: null`. The promoter was called only with `--dry-run`,
which correctly refuses pending review. No public advertising JSON was written.

**59 Python tests** pass: 23 advertising, 14 promoter, 12 GFS and 10 tax
expenditures. **101 Node tests** pass, covering advertising, shared register,
GFS, tax expenditures and navigation. `npm ci` preceded Node tests. TypeScript,
`npm run -s check`, original-source dry run, Wrangler deploy dry run and
`git diff --check` pass. Navigation's offline fixture link is removed after QA.
`votes.json` is schema 1 and byte-identical to current main; its hash remains
`9b7fc46c65185223d70a49b1bd8ee807327473330b02392963aa320b191b7a93`.

Fresh 390/1440 top/table screenshots in `portal/private/vic-advertising/` are
labelled staged previews. Both layouts render 1,239 cells; all ten latest
advertiser descriptions match the source, with zero links inside descriptions.
At 390 the table itself and its container/scroll width are all **350 px**;
all amount cells fit, including without JavaScript. No page errors.
[Validation and screenshot hashes](source-record-validation.json).
