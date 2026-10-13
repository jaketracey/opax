# QAO phase 2 — 12 October 2026

All **296 reports / 296 listed** have full-PDF hashes, URLs, page counts and
per-report rights receipts. Coverage stays **partial: index + 647 HTML
recommendations in 100 reports**. **Zero PDF bodies are cleared.** The document imprints
govern the PDFs: **176 PDFs use CC BY-NC-ND 4.0**, **113
require prior written permission**, and **7 have no cleared document grant**.
The final notice pass found 21 separate imprint permission blocks among reports
previously held with an unverified grant; they remain held with a more precise reason.
Every report also has an uncleared notice. The complete
[per-report receipt](qao-phase2-receipt.json) records notice page references and
SHA-256s; full notice text stays in local review receipts, outside public assets.
The report index remains complete. The **647 phase-1 HTML recommendations stay
available**, with `html` provenance. The 12 October orchestrator decision treats
the HTML report pages as separate website material under S81's CC BY 4.0 grant;
PDF notices govern PDF material, not the separate HTML pages. Phase 1 checked
every page. Its two image-credit exceptions still hold those pages' text.
Every detail has one SourceLine naming “Source: Queensland Audit Office report
page, CC BY 4.0”. Each full-PDF link shows that document's own terms, with its
reason in the held-body note. The PDF holds and per-report receipts are unchanged.
The reader's held-body note is one sentence about that PDF's licence: NC-ND,
written permission, or unverified terms. JSON-LD says only “PDF body held” about
the body. Privacy, source-text and redaction hold details remain in internal
snapshots and the rights receipt; the public catalogue excludes those fields.
The shared publication boundary still withholds names, using a neutral label.

Overlapping holds: restrictive PDF terms **289**; uncleared rights notices
**296**; document grant not verified **7**; at least one unusable text-layer
page **245**; published redaction geometry requiring review **7**; conservative
local PDF donor-text holds **116**; original phase-1 rights holds **2**.
These counts are not additive. Reports 9: 2022–23 and 1: 2023–24 stay held.
The 116 privacy holds concern PDF text. HTML recommendations and metadata titles
pass through the shared publication boundary used by main; any altered HTML text
is marked. A PDF privacy hold does not suppress otherwise cleared HTML text.
No OCR ran. No covered or withheld text was reconstructed. Text under a detected
redaction is discarded before a page receipt is retained. Other source words,
line breaks and published redactions remain verbatim in authorised text units.

The deterministic loader is [qao_bodies.py](../../parli/ingest/qao_bodies.py),
beside the phase-1 loader. It checks policies and live membership, rejects empty
catalogues and any loss of accepted report IDs, validates page sequences and
saved text hashes, and reuses receipts for unchanged PDFs. Full report links
outrank “Report on a page”: **47 phase-1 PDF links were corrected**. One source
page was refetched because its original title differed from phase 1's already
privacy-filtered title. The publisher title had not changed. The shared
publication boundary keeps that title filtered and explicitly marks it in the
catalogue and detail reader. No report was added or lost.
All paths stay inside this checkout. The PDF library is locked in `pyproject.toml`
and `uv.lock`; the standard `uv sync --frozen` installs it. A source challenge stops the run; retries
are counted, paced and bounded. There were **489 counted source requests**:
32 in the initial held index check, 33 in reconciliation, 328 in PDF acquisition,
and 96 in full-report link correction. The three timed acquisition runs total
**976.54 seconds (16m 16.54s)**; the initial 32-request held check was not timed.
Offline page and redaction review took **518.30 seconds**. Robots and the
copyright policy were reread per source run; request spacing was at least two
seconds. The highest individual run used 328 requests, below the 800 ceiling.
No challenge was bypassed.

The recommendation extractor reads the PDF recommendations section, numbers
and source-published public addressees, retaining `pdf p.N` provenance. HTML
recommendations retain `html`. Both sources are compared only after clearance;
HTML wins and differences are explicit receipts. **HTML recommendations: 647;
PDF recommendations added:
0. HTML/PDF comparisons: 0; mismatches recorded: 0.** This is an unperformed
comparison under rights holds, not evidence of agreement.

Response letters are separate source records with a public body, source text,
PDF page range and explicit recommendation numbers. Unattributed pages stay
held. A person's name followed by a department cannot become a body field;
unpublished addressees stay unknown. There are no signatory names, IDs, profile
links or search rows. Signatures stay only in verbatim response text.
**Response records exported: 0.** The synthetic cleared fixture tests
recommendations, response text and privacy boundaries without releasing held
source content.

KB paragraphs use the existing bill-text resource envelope: `slug`, `title`,
`texts.body` in `PLAIN` format, `origin`, `usermetadata.classifications`, and
`extra.metadata`. The new kind is `audit_report`; state is `qld`. Every unit
carries report ID, PDF page, section heading, QAO URL, document hash, unit-text hash, PDF URL,
page count and licence. Response appendices never enter body paragraphs.
**KB units: 0; JSONL bytes: 0**, empty-file SHA-256
`e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`.
`staging/kb/qao-bodies.jsonl` and `counts.json` were produced for review, then
retained at `scripts/state/qao/kb/` before `staging/` cleanup. There is no remote
KB client or upload operation.

Audit assets were **6 files / 925,593 bytes before** (this branch's starting
tracked files, including the existing privacy-filtered title), and were **6 files /
2,259,431 bytes after** the HTML projection. The licence-only reader correction
reduces the public catalogue to **6 files / 1,068,002 bytes**, within
**150 files / 30,000,000 bytes**. The audit sitemap adds one file / 27,037 bytes:
**7 files / 1,095,039 bytes combined**. The per-report rights receipt is unchanged.
Before the HTML projection correction, this lane was 6 files / 1,714,381 bytes.
The corrected projection restores the separately licensed HTML recommendations.
Responses use individual report chunks read only on the detail route; the
metadata directory filters their boolean presence. The detail reader includes
numbered recommendations with provenance and collapsed verbatim entity
responses with PDF references. Held pages explain the holds and preserve their
QAO and full-PDF links. SSR uses `prerenderBlock()`, with one shared SourceLine,
the existing design tokens, and no added accent or uppercase treatment.

Weekly integration is documented in
[nightly refresh](../operations/nightly-refresh.md). Both the loader and a
phase-2 catalogue must be tracked before the body step activates. Rights,
shrink, privacy and source-refusal failures keep the accepted export. Newly
tabled reports pass the same review. Nothing was run on the refresh box.

Validation receipts are local under `scripts/state/qao/`:

- Node 24.21.0, `npm ci`, and `build:search` before tests. The final
  The original rights-stage `node --test test/*.test.mjs` passed **1,414 / 1,414**,
  in **568.45 seconds**. The projection-update gate results follow below.
- Stubbed-HTTP/body-loader tests **28 / 28**; phase-1 loader **14 / 14**;
  weekly bootstrap/held wiring **3 / 3**; export validators **66 passed,
  1 existing skip**. Rights, no-text-layer, shrink, provenance, response attribution,
  signatures, redaction geometry, budget, resumability and idempotence are covered.
- `npx tsc --noEmit`, `npm run check`, `build:release` and
  `build:release:staging` pass. The latter includes the graph build. No
  `wrangler deploy` ran. `uv lock --check` passes with the PDF library locked.
- Local `wrangler dev --local` runs under `unshare`: actual `/audit` and two
  actual held details return 200. A synthetic cleared report exercises PDF-only
  recommendations and collapsed response letters; a held detail remains 200.
  Bad IDs return **404**, with both header and HTML **noindex**. Every checked
  page has one SourceLine. Workers were stopped and their owned scratch removed.
- The final privacy sweep covers **313 JSON/JSONL files**: exported metadata,
  retained PDF text receipts, both snapshots, retained KB files, this per-report
  receipt and the new source fixtures. Findings: **0 donor-identity files,
  0 person fields, 0 signatory fields**. Identities are derived in memory;
  diagnostics show counts. Signatures remain only inside verbatim fixture text.
- `votes.json` is byte-identical to starting HEAD, schema **1**, SHA-256
  `a77128dc0e1e1b3fdaa4bf84501e2c94af3125dea3cf0b2dffbc688a49d68546`.
  `git diff --check` passes. All **296 temporary PDFs / 1,380,997,428 bytes**
  were deleted; **296 extracted receipts / 74,499,238 bytes** remain locally.

The 12 October HTML projection update passes all gates: **1,417 / 1,417 Node
tests** in **691.36 seconds**, **20 / 20 focused audit tests**, **28 / 28 body
loader tests**, **14 / 14 phase-1 loader tests**, **3 / 3 weekly tests**, and
**66 validator passes / 1 existing skip**. `build:search` ran through both
`build:release:staging` and `build:release` before the full suite. Both builds,
`npx tsc --noEmit`, `npm run check`, export validation and the final privacy
sweep pass. The sweep covers 313 JSON/JSONL files with zero donor identities,
person fields or signatory fields. Actual local Worker checks under `unshare`
cover `/audit`, a detail with HTML recommendations and PDF terms, the original
page hold, and a bad ID returning 404/noindex. There is one SourceLine per page.
All 296 PDF rights receipts, hold counts and document licences are identical
to the preceding commit, and the 47 corrected links are unchanged. This
projection update made **zero new QAO requests**. Votes remain byte-identical
at schema 1. HTML recommendation privacy changes: **0**; existing filtered
titles: **1**. No request to QAO was sent; the uncommitted draft is in the
completion reply.

The licence-only reader correction passes **1,418 / 1,418 Node tests** in
**669.63 seconds**, **42 / 42 loader tests**, and **70 Python validation/weekly
tests with one existing skip**. `build:search`, both release builds,
`npx tsc --noEmit`, `npm run check` and export validation pass. Local Wrangler
checks cover the directory, six actual details including all three licence
variants and the reported example, and a bad ID returning 404/noindex. Audit
content and JSON-LD contain no internal hold wording. The 313-file privacy
sweep has zero identity, person-field or signatory-field findings. The rights
receipt and votes are byte-identical; recommendations and PDF links are
unchanged. Re-export is byte-idempotent. No new QAO requests were made, and
owned local Worker state and empty staging were removed.

The native app work remains a plan: both iOS and Android would read a bounded
schema-1 manifest with `phase: 2`, count/listed reconciliation, a validated report
ID lookup, metadata index and detail chunks. The native allowlist would add only
`/audit/manifest.json`, `/audit/index.json`, `/audit/reports-N.json` and validated
`/audit/responses-{report-id}.json`. Details carry rights status, hash, page
count, PDF URL, source provenance, optional privacy-filtered-title flag and
optional response chunk/count. Readers
must suppress held bodies, fetch responses only on details, keep source/page
links, and create no person or signatory entities. The same 150-file / 30 MB
budget bounds the catalogue. There is no native implementation in this lane;
`votes.json` remains byte-identical at schema 1.

Jake/orchestrator: document-level reproduction clearance is needed before any
PDF body, PDF recommendation or response can be released. The website CC BY 4.0 policy
clears the separately reviewed HTML pages; it does not clear these PDFs.
Pages lacking usable source text need an
alternative publisher text layer; this loader must not OCR them. Review the
per-report rights receipt before merge or any KB publication. This lane made
no push, merge, deploy, production D1/KB/Cloudflare/refresh-box change or
`parli.db` write, and made no model calls.
One pre-existing title filter remains on `qao-2015-16-14`; the source link and
filter marker make it reviewable if a donor-registry correction is wanted.
