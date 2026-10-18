# Victorian government advertising — promoted, deploy pending

Checked **19 October 2026 Melbourne** on `coverage/vic-advertising`, baseline
`567e8698b56133f41ec1f9057ed55440e69548c7`. No push, deploy, nightly, production
Ask/generation/voice/auth or KB/D1 write occurred. Initial review was staged only.
The orchestrator approved `961e07ac9` after reviews r1 + r2 and its unchanged eight
inputs were promoted locally on 19 October: [promotion and local verification](promotion.md).
Deployment remains pending; no production publication is claimed.

## Inventory and licence finding

The current [official index](https://www.vic.gov.au/advertising-plans-and-spend)
lists annual reports for **2009–10 through 2024–25**, alongside published plans
and campaign summaries. [Full URL/format/year/rights inventory](inventory.md),
[machine inventory](../../../data/staged/vic-advertising/inventory.json) and
[receipts](../../../data/staged/vic-advertising/receipts.json) retain **95 linked
items: 65 HTML pages, 13 Word attachments and 17 PDFs**. This is bounded to the
current index and its linked advertising pages, not every departmental annual
report or an assertion that every year has a published plan. Mirrored formats
are inventoried separately and never double-ingested. Retrospective tables
reach **2008–09**; that does not establish possession of that year's report.

There are **217 source tables**: 207 campaign cost tables, four advertiser
campaign summaries, three historical campaign/non-campaign expenditure tables,
two annual-total time series and one percentage table. Plans are inventory-only;
they are not expenditure. Report year, observed financial year and snapshot
vintage remain distinct.

The [copyright page](https://www.vic.gov.au/copyright) returned 200, SHA-256
`e035f491dd7362a20c701d05774351fc4e69acb0ba468332d7b63668550d1237`.
Its CC BY 4.0 website-material grant applies to the selected publisher-authored
HTML numerical tables and advertiser/campaign descriptions. No contrary
table-specific notice was found in the selected HTML. Required attribution:
**© Copyright State Government of Victoria**. Changes are table transcription,
normalisation, private-name withholding and formatting, with numerical source values retained. Images, branding,
the Victorian Coat of Arms, government logo, third-party content and campaign
creative are excluded. This scope finding does **not** clear any attachment's
document-specific rights; those remain unverified and held.

The report identifies the contracted media provider as supplying underlying
expenditure data. The selected material is DPC's published numerical report
table and publisher-authored advertiser descriptions, not the contractor's
creative or media assets. No separate contractor copyright claim was found
on these tables; this is the bounded website-grant scope finding, not a grant
over all material supplied by that provider.

## Source access and holds

**69 sequential OPAXBot requests**, all 200, minimum completion-to-next-request
spacing **5.100054 seconds**. No refusal, challenge or reset occurred. Identity:
`OPAXBot/1.0 (+https://opax.com.au/about; corrections@opax.com.au)`.
No alternative identity, proxy, browser acquisition, archive, Firecrawl,
off-host request or source API was used. Publisher scripts were not executed.

The current robots policy excludes document paths such as lowercase PDF, Word,
spreadsheet and CSV extensions; the `.doc` prefix also matches `.docx`. No
excluded URL was requested. One exact index-linked uppercase `.DOCX` **plan**
was acquired before the first blocked document was encountered. It is
quarantined: zero contents ingested or exported. Thereafter the collector holds
the entire excluded document-extension family, including uppercase variants;
no URL case was changed and no alternative attachment URL was requested.
**All 30 attachments remain held**, including that plan and format mirrors.

**Nine exhibition campaign tables** are held as a source group because their
titles can identify private people. Original titles are absent from staged and
public projections; only a safe hold label and original heading hash remain.
Every report-derived narrative field now passes through the same default-deny
privacy review before staging and again at the public projection boundary.
Only exact reviewed organisation names and published labels, plus structured
amounts/dates, survive. **40 advertiser descriptions** are withheld in full,
alongside **206 campaign titles, 15 amount annotations, 14 notes and four period
strings**. These **279 field holds** contain only coordinates, a reason and the
original text's hash; raw text remains in the ignored acquisition cache. The
nine source-table holds remain in place. The Worker independently rejects
unreviewed text before SSR, CSV, hydration or search. The invented-person test
also checks the shared future app asset, sitemap and local MCP output.

One percentage table is inventoried but is not monetary expenditure. There
are no real supplier fields in this projection. Unknown, individual or
sole-trader suppliers default to **individual supplier (withheld)**; synthetic
tests prove the raw name cannot reach the page, CSV or table search.

## Staged observations and reconciliation

**1,194 cells across 17 financial years, 2008–09 to 2024–25**, drawn from 15 HTML
sources and 207 expenditure tables. These are observations, not unique campaigns:

| Grain | Cells | Scope |
| --- | ---: | --- |
| Campaign cost category | 990 | 198 source campaign tables, 2017–18 and 2018–19; five categories per table |
| Advertiser campaign summary | 40 | Ten advertisers each in 2017–18, 2018–19, 2023–24 and 2024–25 |
| Historical expenditure category / department-agency split | 58 | Source year and table retained |
| Media channel | 64 | Eight media channels per published year, 2017–18 to 2024–25 |
| Published total | 42 | Source totals only, at each table/report vintage |

Numerical source amounts, AUD/AUD million units, exact published GST wording,
structured campaign periods, URLs, table/row/column coordinates and original
document/table SHA-256s are retained. Unreviewed narrative footnotes and amount
annotations are replaced by safe labels; their hashes remain in the hold ledger.
Original table hashes are distinct from the sanitized transcription hashes. A missing GST statement
is explicitly labelled **not stated**. **35 missing/included-cost cells** retain
null amounts; reviewed missing codes remain literal, and unreviewed included-cost prose is withheld. None is converted to zero. Source
amounts with spaced thousands separators keep their original text.

**62 checks pass:** 42 published totals match the original cells; 20 component
comparisons comprise **16 exact** and **four within printed precision**. The
latter have differences of $100,000, −$100,000, $1 and $1. OPAX calculates the
half-unit bound from printed cell precision; it is not a publisher rounding
statement. Every difference and bound is recorded in
[reconciliation.json](../../../data/staged/vic-advertising/reconciliation.json).
No figure is adjusted, and tables without a published total are not summed.
Different tables/vintages may disagree; this does not claim agreement between
the historical page and every retrospective annual chart.

## Web, app and promotion boundary

The parked federal implementation is reused, including its contract, held
state, source/rights guards, shared register DataTable and synthetic tests.
There is **one** canonical route and future asset:
`/register/gov-advertising` and `/gov-advertising/data.json`.
Victorian schema 2 adds jurisdiction, separate source grains and report vintage;
it does not create another advertising register. The lede separates reported
media expenditure from procurement commitments and production costs. Latest
advertiser totals do not acquire separate campaign costs; source descriptions
are withheld pending private-name review. Wording is non-partisan, with no party/government comparisons.

The route server-renders latest published totals, ten latest departments/agencies,
the full table, licence/source blocks and reconciliation. Each card has one
source/licence receipt and the page has one source block. Snapshot dates display
as plain dates; complete timestamps remain unchanged in provenance and CSV.
It uses existing tokens and lowercase m/bn money formatting. Search, facets,
sorting and CSV use the common register adapter. Phone rows fit the table's own
container; figures do not require sideways scrolling. There are no global
private-name entities, supplier profiles or source-to-person joins.

`promote_hub_data.py vic-advertising` is an annual, explicit opt-in targeting the
same shared asset; default/nightly hubs are unchanged. It rebuilds the
projection, joins source and policy receipts, checks eight input hashes (including the shared privacy policy and hash-only hold ledger), requires
nonempty data and an approved review receipt, and preserves an existing asset
on failure. **review.json is approved** against
`961e07ac91cf5fc9ba21c5f6588f96170f715886`, recording the orchestrator's exact
approval and eight unchanged input digests. The reviewed promoter wrote
`portal/public/gov-advertising/data.json` (3,410,870 bytes, 1,194 rows).
Its dry run and public-byte check pass. The Money → Public money link opens
from cleared promoted data in local Wrangler; deployment is pending.

The original browser harness explicitly injects staged bytes into a local ASSETS
stub for pre-promotion QA. The promoted harness verifies the actual public asset
through local Wrangler on port 8990; the four latest screenshots have no staged
banner. A private asset directory links the promoted bytes and frontend files,
limiting the macOS asset watcher's file descriptors. The Worker has no staging
fallback. Local evidence is not production publication proof.
The app remains [plan only](../gov-advertising/app-plan.md); no native build,
API allowlist change or app release was performed.

## Validation and local evidence

Targeted Python and Node tests cover official-layout synthetic tables, units,
source years versus upload dates, total checks, missing markers, GST wording,
held-file and supplier exclusion, persistent refusal stops, review gating,
query validation, SSR and shared hydration. **58 Python tests (22 advertising, 14 promoter, 12 GFS, 10 tax expenditures)
and 100 Node tests pass**, including shared register, GFS, tax and navigation.
The initial navigation attempt lacked generated calendar assets; its final run
used offline private fixtures with a temporary local asset link, removed after
testing. [Validation receipt](validation.json). Existing promoter tests protect the
other hubs. TypeScript, `npm run -s check`, staged/original dry run, Wrangler
deploy **dry run**, and `git diff --check` are the delivery gates.

Actual Worker/Chrome checks cover 390 and 1440, CSV, filtering, JavaScript-disabled
SSR and the closed readiness gate with no asset. At 390 the table and its own
container are both **350 px**, including all amount cells. No horizontal overflow
or page errors. [Validation receipt](validation.json).

Private, ignored evidence in `portal/private/vic-advertising/`:

- `advertising-390-top.png`, `advertising-390-table.png`
- `advertising-1440-top.png`, `advertising-1440-table.png`
- `browser-results.json`, `check.log`, `wrangler-dry-run.log`, retained originals

`votes.json` remains byte-identical to `origin/main` and the starting checkout,
SHA-256 `9b7fc46c65185223d70a49b1bd8ee807327473330b02392963aa320b191b7a93`.
Context7 MCP was unavailable; relevant skills, current official Cloudflare docs,
installed schema and generated Worker types were used. No pattern kills,
volume controls, pushes or deployment occurred.
