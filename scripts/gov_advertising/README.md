# Government advertising staging

## Victorian extension (19 October 2026)

The federal adapter below is retained from `coverage/gov-advertising`. Victoria
uses this same register, source/agency/campaign/category/amount contract, shared
DataTable and canonical `/register/gov-advertising` route. Schema 2 adds separate
table grains, report vintage, media channel, raw amount/unit and campaign-period
notes; it never manufactures a total from the selected cells.

`acquire.py` permits only the Victorian advertising index and its published
advertising links, plus robots/copyright. Requests use OPAXBot, are sequential,
and wait at least 5.1 seconds after completion. Source refusals persistently stop
the ledger and retain only compact receipts. Document extension families are
held under the current robots policy, including uppercase variants. No file
download, URL-case substitution, proxy or alternate identity is a workaround.
The one uppercase plan acquired before that family hold is quarantined.

`python3 -m scripts.gov_advertising.stage_victoria` rebuilds staged inventory,
table coordinates/hashes, reconciliation and `hub.json` from private originals.
It checks the linked website grant before extracting numerical tables. Plans,
percentages and all attachment content are excluded from
the public projection. Jake's 19 Oct 2026 decision keeps names in authorised report descriptions,
campaign titles, periods, notes and annotations as source-record text.
`portal/src/gov-advertising-privacy.json` and `privacy.py` now review only
organisation/entity and facet fields; they create no person entities, links,
name-search nodes or identity joins. Campaign text is plain text, with a separate
original-source link. Individual/sole-trader suppliers remain withheld.
`privacy-holds.json` retains hash-only receipts for entity/facet holds; it is
empty for the current source. The nine former name-only table holds are released;
30 attachment holds remain for robots/file rights. Never infer an amount.

`python3 -m scripts.gov_advertising.victoria --dry-run --verify-originals`
checks every retained original/table/heading hash and the exact projection with
zero writes. Omit `--verify-originals` in a checkout without the private cache.

`vic-advertising` is an explicit opt-in in `promote_hub_data.py`, targeting the
single `gov-advertising/data.json` asset. It is not a default/nightly hub.
`data/staged/vic-advertising/review.json` is **approved** against
`d4930f08d3cbe29a548ebf7644cf0cc8bf082d75` after Codex r3 APPROVE, binding
the same eight exact input digests. Explicit local promotion wrote the expanded
1,239-cell asset with 62/62 checks on 19 October; deployment is pending. The
promoter dry run and public-byte check pass. Future input changes still require
explicit orchestrator approval. No nightly, push or deployment occurs here.

The Worker never reads staging. For labelled, local QA only:

```sh
cd portal
OPAX_ADVERTISING_PREVIEW=staged node test/vic-advertising-browser.mjs
```

This harness explicitly injects the staged bytes through a local ASSETS stub,
blocks outbound network and production routes, tests the actual Worker and
shared table, and saves 390/1440 top/table screenshots and geometry receipts in
`portal/private/vic-advertising/`. It never creates a public asset. The app is
[plan only](../../docs/coverage/gov-advertising/app-plan.md).

## Parked federal adapter

This lane is held at Finance's robots policy. There is no automatic Finance
collector or claim to parse an unseen PDF. `probe.py` is read-only source research;
it uses the shared OPAX identity, checks robots, spaces requests at least five
seconds apart, never follows redirects automatically, and stops each refused host.
It retains no challenge/error pages. Research HTML is kept only in ignored
`portal/private/gov-advertising/research/`.

`python3 -m scripts.gov_advertising.stage` rebuilds **staged** `hub.json` offline.
Currently it produces zero rows and omits all seven held report leads entirely.
It never writes public JSON, D1 or KB data. The unit tests use a synthetic CSV
table transcription; it has no individual names.

Once access is resolved through the publisher, a fresh permitted acquisition
must establish the complete annual inventory and applicable document imprints.
Store original bytes and their successful source/robots receipts in this
checkout's staging area. A human review must record the exact grant and terms,
copyright receipt/hash, exclusions, and the document hash to which it applies.
Unverified grants, restrictive terms and challenge/error responses stay held.

For each approved report, supply a reviewed CSV transcription with columns
`financial_year,entity,campaign,total,source_locator`; optional category columns
are `media,campaign_development,gst,other`. Include a page/table and row coordinate
for every campaign. Store both original and transcription hashes. Explicitly
set the published unit multiplier, GST basis, expenditure scope and the report's
own total/reference. Do not invent a total by adding non-exhaustive categories.
Rounding tolerances need a published note and must stay within the reported
precision. One reviewed document per financial year prevents PDF/DOCX duplicate
counting. Private people remain outside entity/search projections; review
campaign and agency fields before approving a report.

Promotion is deliberately **not enabled** while all reports are held. Do not
copy `hub.json` into `portal/public`. A later reviewed change must register the
new hub with `scripts/promote_hub_data.py`, join all source/robots/licence receipts,
rebuild this projection, require a non-empty reconciled result and reviewed input
digests, and preserve the last approved asset on any failed gate. The Worker
already reads the future `/gov-advertising/data.json` location. No nightly change
or nightly invocation is part of this lane.

Offline gates:

```sh
python3 -m unittest discover -s tests -p test_gov_advertising.py
cd portal
node --test test/gov-advertising.test.mjs test/register-tables.test.mjs
node test/gov-advertising-browser.mjs
npx tsc --noEmit -p .
npm run -s check
npx wrangler deploy --dry-run --env ''
```

The browser check uses the local Worker with external network denied and no
production bindings. It saves the actual held page at 390/1440 and separately
labelled synthetic fixture previews under `portal/private/gov-advertising/`.

For promoted-asset QA, start isolated local `wrangler dev` on port 8990+ with
read-only access to the public advertising asset and frontend files, then run:

```sh
cd portal
node test/vic-advertising-promoted-browser.mjs
```

The harness rejects non-local origins, checks exact served asset bytes, opens
the Public money menu link at 390/1440, verifies phone table geometry and saves
fresh top/table screenshots without the pre-promotion banner. See
[local promotion evidence](../../docs/coverage/vic-advertising/promotion.md).
