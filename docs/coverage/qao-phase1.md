# QAO reports to Parliament, phase 1 — 10 October 2026

The accepted catalogue is staged locally on `web/qao-audit-reports`. The
orchestrator owns merge and promotion. This lane makes no push, deploy,
production D1/KB/Cloudflare/refresh-box change or `parli.db` write.
Coverage remains **partial: report index + HTML recommendations**.

The [QAO index](https://www.qao.qld.gov.au/reports-resources/reports-parliament)
advertised 30 pages. All **296 unique reports / 296 listed** reconcile, with
report years **2008 through 2026–27** and displayed tabled dates
**17 April 2008 through 7 July 2026**. Dates come from the labelled HTML date,
not the UTC machine timestamp, which sometimes falls on the preceding day.
All 30 listing pages were rechecked against the saved membership and paging
edges during fix round 1. This proves the observed index, not every historical
QAO report.

The accepted resumable source run made **299 requests in 596.44 seconds**
(9m 56s). The three initial held parsing attempts used 14, 15 and 21 requests;
five source probes bring this lane's total to **354 QAO requests**. Each run
stays below the 800-request ceiling. Robots allowed the pages and specified no
crawl delay; minimum request spacing was two seconds. No 429, 5xx or challenge
was observed. Policy pages are reread on resume. Fix round 1 replayed
hash-verified report
HTML with no report refetches; policies and all listing pages required **32
requests over 82.43 seconds**, bringing the lane total to 386 QAO requests.
No challenge or backoff response appeared. New/resumed acquisition rechecks
all listing membership before acceptance, including non-first-page changes.

The corrected catalogue has **647 HTML recommendations in 100 reports**:
645 have source numbers; two in Report 12: 2025–26 have no published numbers
and retain null numbers with an explicit label. The original 545 count gained
110 recovered recommendations, then lost eight under a new licence hold.
Ordered lists, numbered paragraphs, legacy sections and REC/table number cells
preserve QAO's
words, punctuation and numbers; formatting is simplified, with supporting
lists and source type/start/value markers retained. Each block reconciles
parsed numbers and stated counts; an unexplained discrepancy holds the run.
Entity response columns and hidden HTML comments are excluded.
Recommendations 1–3 of Report 14: 2016–17 have no visible HTML addressee; their
addressee stays unknown. The hidden commented-out introduction is not used.
Twenty-three reports identify audited public bodies in their HTML scope;
unpublished names stay unknown. Agency links require an exact, unambiguous name
and a verified Queensland source jurisdiction. The existing registry covers the
Commonwealth, so its three same-name Department of Education collisions stay
plain text. There are no verified agency links in this snapshot. No person
profiles, joins or search rows are created.

The [copyright policy](https://www.qao.qld.gov.au/copyright) grants CC BY 4.0
unless otherwise noted, with State of Queensland attribution and the copyright
notice retained. Every report page was checked. Unknown licensing notices and
third-party
captions fail closed. Two body holds are recorded:
**Report 9: 2022–23, Protecting our threatened animals and plants**
(`qao-2022-23-9`) credits a third-party wildlife image to Bruce Thomson under
an Auswildlife.com licence. The report's entire body projection, including
recommendations and body-derived auditees, is withheld conservatively. Index
metadata and authoritative/PDF links remain for both held reports.
**Report 1: 2023–24, Managing invasive species** (`qao-2023-24-1`) credits a
bitou bush photo supplied by the Department of Agriculture and Fisheries
without an explicit reuse grant. Its body is also withheld, including eight
recommendations previously exported. Images and logos are never
exported. Per-report notices and body-skipped flags are in the detail chunks.

The [public export](../../portal/public/audit/manifest.json) is **six files /
925,495 bytes**: `manifest.json`, `index.json`, `ready.json` and three report
chunks. The asset budget is 40 files / 10,000,000 bytes. The audit sitemap adds
one file / 27,037 bytes and contains exactly 296 report ids; combined data and
audit sitemap are seven files / 952,532 bytes. Every report has its QAO URL.
The attribution block carries the State of Queensland notice, CC BY 4.0 link,
changes, exceptions and no-endorsement wording. Raw receipts and the accepted
snapshot are gitignored inside `scripts/state/qao/` in this worktree.

Search includes one **audit report** row per report, with title, report number,
year, tabled date, sectors, public auditees and QAO URL. Recommendation bodies
and copyright-credit names are excluded from search. Search catalogue bytes
were **211,122,963 before / 211,329,016 after**, a **206,053-byte (0.10%)**
increase. Its size remains reasonable for this small metadata addition.

Validation completed locally:

- Node 24; `npm ci`, then `npm run build:search` before the portal tests.
  The fix-round node gate uses a default `python3` with neither `requests` nor
  `bs4` importable. Audit node tests read static fixtures; loader tests run
  separately (**12 passed**), with no Python packages added to CI.
  Shared WORDS transport imports `requests` only when instantiated, so existing
  stubbed FRL/Acts tests also run with the clean default Python.
- `node --test test/*.test.mjs`: **1,087 passed, zero failed**, under the host's
  required network namespace. QAO tests cover stubbed HTTP paging/resume,
  shrink/empty protection, licence exceptions, response exclusion, raw-receipt
  hashes, budget, filters, SSR facts, SourceLine, authoritative links, noindex
  404s, sitemap/search counts and absence of person links.
- `npx tsc --noEmit`, `npm run check`, privacy, asset stamps and portrait
  identity checks passed. Search/crawl, social, grants-map, analytics, voice and
  staging graph build steps passed; Wrangler's real Worker bundle also ran
  locally. No deploy command was run. Unrelated graph build output was restored.
- `validate_data.py audit` passed. Offline VM tests: 67 validator tests (one
  existing skip), five FRL refresh tests and two QAO refresh tests passed.
- Local `wrangler dev` and `curl`, inside `unshare -rn`: `/audit`,
  `/audit/qao-2026-27-1`, `/sitemap.xml` and `/sitemaps/audit-1.xml` returned 200;
  `/audit/not-a-report` returned 404 with header and HTML noindex. Rendered
  details contain the exact tabled-date label, QAO's numbered text, one
  SourceLine, authoritative/PDF links and no person anchors. The encoded id
  alias returned 301 to the decoded canonical path, and the detail canonical
  tag matched that path.
- `votes.json` is byte-identical, `_meta.schema` 1:
  `a77128dc0e1e1b3fdaa4bf84501e2c94af3125dea3cf0b2dffbc688a49d68546`.

Encoded audit id aliases and trailing slashes redirect with 301 to the
decoded, validated canonical path; canonical metadata uses that same id.
Current `origin/main` (`3790ecdf`) is merged, including the sponsor-person
change, and the resolved entry page is restamped.

The weekly `audit` group remains inert until merged with this first catalogue.
It checks tracked publication before acquisition/export, uses 20:00–08:00
Brisbane quiet hours, preserves the accepted snapshot on a hold, validates
against HEAD and uses the keep-if-unchanged export sweep. Operational wiring is
documented in [nightly refresh](../operations/nightly-refresh.md).

Phase 2 acquires licence-reviewed PDF bodies, retaining document hashes,
original wording, page references, redactions and OCR confidence. It extracts
auditees and recommendations absent from HTML without reconstructing withheld
material. Entity responses remain separate source records, attributed to their
public body and linked to the relevant recommendation only where the source
establishes that relationship. The app lane adds a read-only audit directory
and detail reader using a bounded static catalogue and its allowlist/schema
contract. No model summaries are part of this plan.

Jake/orchestrator: merge and promotion remain yours. Phase 1 needs no further
input. Review the document-level rights scope before any phase 2 acquisition;
both reports with image-credit notices stay held unless reuse is cleared. No
deployment or production refresh is requested by this receipt.
