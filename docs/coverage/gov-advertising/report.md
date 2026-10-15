# Federal campaign advertising — held source, local register

Checked **16 October 2026 Melbourne (15 October UTC)** on
`coverage/gov-advertising`, baseline `7cf0c453f17232b8d0bba6af323db00a0989b267`.
No production source data was written, no nightly/promotion ran, and nothing was
pushed or deployed.

Finance acquisition is held. The one identifying GET to
`https://www.finance.gov.au/robots.txt` timed out; its receipt was recorded at
**2026-10-15 21:19:23 UTC**. No HTTP status or response bytes were received.
The empty-response SHA-256 is
`e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`.
The diagnostic string has a separately labelled hash; it is not a source-body
hash. See [compact receipt](../../../data/staged/gov-advertising/receipts.json).
Collection stopped before a Finance report, index, copyright page or attachment
was fetched. There was **no Finance 403, challenge or reset** in this run.

## Inventory and rights

[Inventory](../../../data/staged/gov-advertising/inventory.json) records search-index
URL/title discovery only, with no report contents transcribed from those results.
The [Finance series](https://www.finance.gov.au/publications/reports/advertising)
is a discovery lead; it is not an OPAXBot-verified page. Earlier years, the full
annual series, file formats and machine-readable tables remain unverified.

| Financial year | Annual leads | Direct PDF leads | Acquired reports | Campaign rows | Format / URL limit |
| --- | --- | --- | --- | --- | --- |
| 2018–19 | 1 | 0 | 0 | 0 | Finance report URL cited by Elections Canada in indexed official material; attachments unverified |
| 2019–20 | 1 | 0 | 0 | 0 | Title listed in the indexed Finance series; individual report URL unresolved, recorded as null |
| 2020–21 | 1 | 0 | 0 | 0 | Indexed Finance HTML landing; download formats unverified |
| 2021–22 | 1 | 0 | 0 | 0 | Indexed Finance HTML landing; download formats unverified |
| 2022–23 | 1 | 1 | 0 | 0 | Finance PDF URL discovered; no bytes fetched |
| 2023–24 | 1 | 1 | 0 | 0 | Finance PDF and report landing URLs discovered; no bytes fetched |
| 2024–25 | 1 | 1 | 0 | 0 | Finance PDF and report landing URLs discovered; no bytes fetched |
| Total | **7** | **3** | **0** | **0** | Seven report leads, not seven acquired/licensed reports |

Each lead records its source/index URL, financial year, observed format limit,
licence status and hold reason. The **applicable campaign-report licence has not
been established**: neither a document imprint nor its linked copyright policy
was reachable through this stopped run. There is no verified terms URL to assert
for this series. Grants/contract datasets, guidelines, corporate plans, the
Finance Ministers site and the Commonwealth Contracting Suite have different
scopes; none supplies this series' licence. This is **unverified clearance**,
not a finding that the campaign reports prohibit reuse. All seven leads are held.

## Staging and web

Zero real campaign rows staged. Real totals reconciliation is **not performed**;
no claim of agreement with Finance totals is made. The offline
projection (`data/staged/gov-advertising/hub.json`, parked with the code) contains no held
documents or content. No original campaign report was saved or redistributed.

The offline staging contract (`scripts/gov_advertising/README.md`, parked with the code) accepts
a reviewed table transcription only after successful source/robots receipts,
document-scoped licence approval and original/transcription hash checks. It
retains financial year, published entity/campaign, category amounts when supplied,
total, GST basis, scope, document/page/table/row references and hashes. It checks
categories when explicitly exhaustive, reconciles campaign sums to the report's
own total, bounds documented rounding allowances and rejects duplicate formats
for the same year. It is synthetic-tested; it does **not** claim to parse an
unseen Finance PDF. Real source-format/parser validation remains held.

The local Worker route `/register/gov-advertising` (parked; not on main) server-renders the held state,
unknown totals, source/access date/unverified licence, and the shared register
DataTable. No empty snapshot is copied into public assets. The reader awaits a
future approved `/gov-advertising/data.json`; invalid licence/provenance or
reconciliation fails closed. A synthetic approved fixture demonstrates year and
entity totals, category columns, search, facets, sorting, CSV and exact agency
links. Totals keep financial year, GST basis and expenditure scope separate.
Missing categories stay null. There are no private-person entities or global
name-search entries. An ambiguous or non-exact agency name remains unlinked.

Source, snapshot and licence accompany every content block and each table row's
export. Held-source access dates are labelled as access checks, not report
snapshots. Source spending is described neutrally and kept separate from
procurement commitments. The page uses existing shell/design tokens and removes
the SPA router on this server route. The shared hydration route is registered.
There is no new global navigation entry or sitemap entry while data is held.

The [app plan](app-plan.md) is documentation only. Promotion is deliberately not
registered/enabled: the later reviewed change must connect this validated,
non-empty projection to `scripts/promote_hub_data.py`, join receipts and reviewed
input digests, and preserve the previous asset on failure. No nightly code was
changed. This branch is ready for review of the held-source implementation,
not approval to publish a campaign dataset.

## Refreshed queue and access holds

[Research](next-research.md) ranks five new candidates: ABS annual Government
Finance Statistics (100), Treasury tax expenditures (80), Victorian advertising
(64), NSW audit metadata (32), NSW Community Building Partnership programme/round
metadata (32). The last source still needs an accessible award-row endpoint;
its current programme page alone does not establish award coverage.

The research made 28 sequential requests, at least 5.1001 seconds apart, with
the shared identity and robots checks. PBO and APSC timed out. **AIHW robots
returned 403/challenge** and was stopped, with hash/status/date only. RoGS data
downloads were not requested because robots excludes the path. VAGO has a
commercial reuse restriction. NSW budget's robots redirect to a separate host
was not followed. Existing QAO body, Queensland Cabinet, FOI and ECQ holds remain
listed with their reasons. No challenge, reset or terms restriction was bypassed.

## Validation

[Validation receipt](validation.json) records the gate outcomes, browser checks,
votes hash and private screenshot hashes.

- Eight targeted Python tests: parsing, missing categories, document/table hashes,
  totals, duplicates, licence/access gating, held-file exclusion, and persistent
  stop/no-body retention after a synthetic refusal/reset.
- Fifteen targeted Node tests: six advertising page/rights/query/hydration/agency
  tests and nine existing shared-register tests.
- Actual local Worker/browser checks: 390 and 1440 widths, held and separately
  labelled synthetic views, no horizontal overflow, search and filtered CSV,
  exact agency link, invalid-query response and JavaScript-disabled rendering.
  External network is denied and all production API routes are blocked locally.
- `npx tsc --noEmit -p .`, `npm run -s check`, Wrangler deploy **dry run**,
  offline stage dry run, source-access guard and `git diff --check`.
- `votes.json` remains byte-identical to the baseline, SHA-256
  `f9908e4f46f7148a82daee2d0b14c62cd7f2172ff1cd310df9a132a152970aff`.

Private local screenshots: `portal/private/gov-advertising/page-390.png` and
`page-1440.png`, plus full-page captures. `fixture-*` screenshots are explicitly
labelled synthetic; they contain no official campaign data. The browser receipt
is saved alongside them. They are intentionally ignored by Git.

Context7 MCP was unavailable. Cloudflare/Workers/Wrangler skill instructions,
current official Cloudflare documentation and installed schema/CLI types were
used for the local Worker checks. No app code, production Ask/generation/voice/
auth, production KB/D1/public JSON, volume controls, pattern process kills,
push, deployment or nightly invocation occurred.

## Merge note (orchestrator, 16 Oct 2026)

Review verdict: CHANGES. Only the docs and compact receipts were merged to main.
The code is parked on the local branch `coverage/gov-advertising` at `7fdd446a6`:
the staging scripts, the Worker route, the register-table changes, the tests and
`hub.json`. It stays there until source access, document rights and real campaign
rows clear, and until the review finding is fixed: while no cleared rows exist,
the held route must return 404 or stay unrouted, with no empty sections and no
"Not available" filler.

The orchestrator rechecked Finance once, at 08:30 AEDT on 16 Oct 2026 (21:30 UTC
on 15 Oct), with the OPAXBot user agent. The robots request got an HTTP/2 stream
reset at the Finance edge (curl error 92, INTERNAL_ERROR). It is treated as a
reset: acquisition stays stopped, and Finance goes on the outreach list.
