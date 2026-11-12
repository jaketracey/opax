# CodeQL triage, November 2026

Read-only inventory of `jaketracey/opax`, `refs/heads/main`, taken 12 November 2026 at base commit `496fbe4dc0d7c9ae9c53122ab464ba3cadeadef3`:

```sh
gh api --paginate "repos/jaketracey/opax/code-scanning/alerts?ref=refs/heads/main&state=open&per_page=100"
```

The API returned **240 open alerts: 74 high and 166 medium**, rather than the brief's 78 high. The table accounts for the complete returned inventory, including rules omitted from the brief. Counts describe existing alert instances, not distinct bugs. **38 instances are remediated in code, 36 high and 2 medium** (including two findings at an already constrained profile link); **202 are proposed for dismissal**. No alert state was changed. A fresh CodeQL run on the resulting commit is still required to confirm analyser closure.

Implementation commit: `d79885b80a1e2d48a2cb9890f59441addcf133e1`.

## One decision per rule

Paths in braces abbreviate parallel filenames. Test basenames are under `portal/test/`.

| Rule | Open | Files | Verdict | Remediated | Reason |
| --- | ---: | --- | --- | ---: | --- |
| `js/polynomial-redos` | 27 | `portal/src/{ask-money-industry,ask-money-family,ask-money-routing,ask-money,ask-money-followup,ask-scope,research-coverage,research-grounding}.ts`, `portal/src/{research-coherence,research-answer-style}.mjs`, `portal/public/datatable-query.js` | real | 27 | Request and user-text parsers had overlapping whitespace, suffix or wildcard matches. Replaced with single scans, delimiter searches, normalised whitespace and a terminal capture after bounded subject grammar. |
| `js/redos` | 2 | `portal/src/research-claim-audit.mjs` | real | 2 | Model and quoted text reached a nested adverb repetition. Tokenise whitespace and validate each word once. |
| `py/redos` | 1 | `scripts/export_expenses.py` | real | 1 | Fetched IPEA names reached nested suffix repetition. Remove postnominals by scanning tokens from the end. |
| `js/incomplete-multi-character-sanitization` | 13 | `portal/public/{act-invoices-table,sa-grants-table,sa-budget-table}.js`, `portal/src/seo-content.ts`, `scripts/{check_privacy_placeholders,propose_social_photos}.mjs`; tests: `{seo-render,ui-components,division-markdown,tax-charity}.test.mjs` | false positive (8), test-only (5) | 0 | Three table helpers use text only to select fixed column annotations and retain the escaped original markup. Two SEO helpers return labels escaped at HTML/schema output. Two privacy-audit findings return marker IDs only. Commons attribution is stored as JSON/plain caption text, with escaping in HTML renderers. Five findings only extract fixture text. |
| `js/incomplete-sanitization` | 6 | `scripts/stamp_assets.mjs`; `portal/test/{video-archive,asset-cache,identity-cache,expense-categories}.test.mjs` | real (1), test-only (5) | 1 | Asset reference matching now escapes every regex metacharacter in a filesystem filename, including backslashes. The other five findings are test matchers or expected-output formatting. |
| `js/bad-tag-filter` | 5 | `portal/test/{home-data,seo-render,agentic-tool-electorates,growth-hubs}.test.mjs` | test-only | 0 | Fixture script extraction is not a security sanitiser and never supplies served HTML. |
| `js/insecure-randomness` | 5 | `portal/public/chunks/chunk-XSTZD4LL.js` (built from Three.js `src/math/MathUtils.js`) | false positive | 0 | The five sinks are Source, Texture, Object3D, BufferGeometry and Material UUIDs for local scene identity and serialisation. No authentication, session, public capability or security decision uses them. Do not patch generated dependency code. Any use as a credential would require Web Crypto. |
| `py/clear-text-logging-sensitive-data` | 3 | `scripts/build_pay.py`, `parli/ingest/aec_results.py` | false positive | 0 | Reviewed all three logs: published parliamentary entitlement figures and names, an ingestion row count, and SQL COUNT(*). No secrets, tokens, private salary/payroll or individual postcode/address values reach these statements. Details below. |
| `js/incomplete-url-substring-sanitization` | 3 | `portal/test/{public-record-tools,catalog-swr,social-publication}.test.mjs` | test-only | 0 | These are local request stubs and call-list assertions. They do not allow, redirect or fetch a user-selected production URL. |
| `js/incomplete-hostname-regexp` | 3 | `portal/test/{home-data,ask-person-overview}.test.mjs` | test-only | 0 | Host patterns select static stub replies in offline tests; they are not production allowlists. |
| `py/incomplete-hostname-regexp` | 2 | `scripts/state_bills/stage.py`, `parli/ingest/qao_reports.py` | real | 2 | ACT bill source selection and QAO copyright exemptions consume fetched HTML. Both now parse URLs and compare exact scheme, hostname, credentials, port and path; ACT identifiers are matched on the parsed path only. |
| `js/xss-through-exception` | 2 | `portal/test/{video-archive-browser,senate-video-browser}.mjs` | test-only | 0 | Browser QA servers bind loopback and disable external network. Exception responses are not production code. Any reuse as a public server would require a plain-text content type or escaped HTML. |
| `js/client-side-unvalidated-url-redirection` | 2 | `portal/public/app.js` (`renderPayNextSteps`, `renderNoAnswer`) | real (1), false positive hardened (1) | 2 | Pay links admitted an external origin via path-prefix checking. Reuse safeAnswerLink, which parses with new URL and checks the exact origin before producing encoded local paths. The no-answer profile was already anchored to a local prefix; it now uses the same parser and a single profile path segment. |
| `js/xss` | 2 | `portal/public/app.js` (same two link assignments) | real (1), false positive hardened (1) | 2 | Same remediation as the redirection rule. Labels remain textContent; unsafe schemes, foreign hosts, credentials and URL control characters do not become links. |
| `js/double-escaping` | 1 | `portal/src/daily-post.ts` | real | 1 | Sequential decoding could reinterpret a reference created by an earlier replacement and could throw on invalid code points. The existing entities dependency now decodes exactly once. |
| `js/unvalidated-dynamic-method-call` | 1 | `portal/public/app.js` (`directory` comparator) | false positive | 0 | URL sort values are validated against spec.sorts before reading a Map whose values are application-defined comparators. The fallback is also an application-defined comparator; user input cannot name an object method. |
| `js/functionality-from-untrusted-source` | 162 | `data/staged/bills-tas/snapshots/*.html` (162 files) | false positive | 0 | All 162 refer to the same versioned jQuery CDN script in captured Parliament of Tasmania HTML. Snapshots are provenance inputs parsed with BeautifulSoup, outside the portal/public asset root. No script is executed. Rewriting source snapshots would invalidate their hashes and provenance. The class would be real if a snapshot were served as active HTML, passed to a script-enabled browser, or copied into executable assets. Any such promotion requires script removal or an explicitly pinned script plus integrity verification. |

## Python logging review

- **#101, build_pay.py:** `top` contains names and salary entitlement amounts derived from the public Parliamentary Handbook and published Remuneration Tribunal pay registry. This is a public entitlement projection, not employee payroll, bank details, tax information, payslips or an account credential. The log adds aggregate people/sitting counts and the local output filename. No sensitive value was found and the statement is unchanged.
- **#30, aec_results.py:** `ingest_postcode_mapping` returns an integer counting successful inserted public AEC postcode-to-electorate mapping rows. Only that count is interpolated. The postcode, electorate, address or record dictionary is not logged at this sink.
- **#31, aec_results.py:** `postcode_count` is the result of SQL `COUNT(*)` over `postcode_electorates`. It reveals only the dataset size. Neither individual postcodes nor addresses are interpolated.

## Archived script class

Every one of the 162 script findings is the jQuery 3.1.1 CDN reference in a captured Tasmanian bill-page source file. `scripts/state_bills/stage.py` uses BeautifulSoup to extract metadata, not a JavaScript runtime. `portal/wrangler.jsonc` serves assets only from `portal/public`; the captured HTML is under `data/staged`. The source capture stays byte-for-byte intact. No live unpinned third-party script loader occurs among these 162 alerts. This decision does not grant permission to execute archived HTML or add external script loaders to the portal. Deliberate live analytics integrations are outside this snapshot finding set.

## Validation and behaviour

`portal/test/codeql-inputs.test.mjs` exercises long failing punctuation and whitespace runs, repeated delimiters, joined adverb-like words and namespaced table keys, with an individual **50 ms** limit per adversarial call. It also checks ordinary grammar, URL origin and profile restrictions, regex-special filenames, one-pass entity decoding and the existing SEO escaping boundary. `tests/test_codeql_inputs.py` checks long fetched names under the same limit, exact ACT source hosts and QAO footer exemptions. The existing routing, scope, daily-post, link and Python source-loader suites cover normal behaviour. No input is silently truncated by these fixes.

The release build regenerates content stamps for changed browser assets. Unrelated generated record data is restored before hand-back. No deployment, production write, alert-state mutation or external message is part of this lane.

## Gates and acceptance self-review

Final portal commands used the repository virtual environment on `PATH` for Python subprocesses and Node 24.21.0. No lockfile changed.

| Gate | Result |
| --- | --- |
| `cd portal && npm ci` | Pass; installed the worktree's missing dependencies. |
| `npx wrangler types` | Pass. Generated runtime definitions are ignored. |
| `npm run build:release` | Pass. Restored unrelated record data, dependency licence line endings and the rebuilt voice dependency; refreshed the necessary browser content stamps. |
| `npx tsc --noEmit` | Pass. |
| `npm test -- --test-concurrency=3` | Pass: 4,780 tests, zero failures on the final source tree. |
| `uv run --with pytest pytest tests/test_codeql_inputs.py tests/test_state_bills.py portal/test/qao_loader_test.py scripts/test_build_pay.py -q` | Pass: 54 tests and 34 subtests. All changed Python implementation paths and the reviewed pay builder are covered. |
| `uv run --with pytest pytest` | **Fail: 2,273 passed, 32 failed** in unchanged areas listed below. The whole-repository Python gate is not green. |
| `git diff --check` | Pass. |

The first portal attempt ran before stamping completed and without the virtual environment, producing two stale-stamp failures and three missing-Python-dependency failures. Those were resolved by finishing the build/stamps and using the repository environment. Early type checks also ran before runtime/helper declarations were available; the final type check passes. Additional focused runs passed: 220 routing/scope/daily-post tests, 22 input/cache tests, and 88 input/money/coherence tests. All final long-input assertions meet the individual 50 ms limit.

The full Python failures are outside the changed implementation paths. They were inspected, with the roster-wrapper and SQLite-bundle failure classes also reproduced separately:

| Unchanged area | Observed failure class |
| --- | --- |
| `scripts/test_enrich_profile_jurisdictions.py`, `scripts/test_roster_export_wrappers.py`, `scripts/test_roster_witness_split.py` | Pinned identity/idempotence expectations differ; wrapper fixtures copy an older electorate release while their manifest selects a newer reference file that is absent from the fixture. |
| `scripts/vm/test_build_evidence_bundle.py` | SQLite cannot attach the fixture's read-only file URI in this environment. |
| `scripts/vm/test_fixture_imports.py` | The copied export fixture is missing the corrections package. |
| `tests/test_bill_lifecycle_export.py` | A suppression registry replacement is absent from the fixture's bill registry. |
| `tests/test_sa_budget.py` | A required ignored acquisition workbook is absent from the lane checkout. |
| `tests/test_seo_nightly_exports.py` | The fixture does not produce its expected division export. |
| `tests/test_source_http.py` | Existing source-policy violations in other files and a challenge-response classification mismatch. No new transport or browser-identity bypass was introduced. |

Acceptance review against the brief:

1. **Done:** all 17 rule IDs have one row, covering 240 alerts, with files, verdicts, counts and reasons. The read-only inventory was checked against the document.
2. **Done in code:** 38 alert instances are remediated, including the 36 high instances requiring a fix or hardening. Remaining high instances have a traced false-positive or test-only rationale. The new Node and Python input regressions exercise the changed parsing, URLs, entity decoding and filename escaping; long adversarial calls assert less than 50 ms. A fresh CodeQL analysis remains required to confirm closure.
3. **Done:** each of the three Python logs was traced to its value producer. Only public entitlement data or aggregate counts reach these logs; no sensitive value needed removal.
4. **Done:** all 162 script alerts are offline source snapshots. Their common CDN reference and non-executing parse path were verified. The class decision states what would make it real; no executable unpinned loader exists in this alert set.
5. **Done:** 202 unique dismissal proposals match inventory alert numbers: 179 false positive and 23 used in tests. None was applied.
6. **Done for the portal:** normal routing and page tests stay green; unrelated tracked build output is restored. Apart from `app.js` and `datatable-query.js`, browser-file changes contain content stamps only. **Not done: a green whole-repository Python gate**, for the unrelated failures above. No deployment, production write or alert-state change occurred.


## Proposed dismissals

GitHub reasons below use the UI wording: `false positive`, `used in tests`, `won't fix`. There are no `won't fix` proposals. Each line is a proposal for orchestrator review, not an applied dismissal.

- #30 | `py/clear-text-logging-sensitive-data` | false positive | Logs only the integer count returned by postcode mapping ingestion, not postcode or address values.
- #31 | `py/clear-text-logging-sensitive-data` | false positive | Logs only SQL COUNT(*) over postcode mappings, not postcode or address values.
- #41 | `js/unvalidated-dynamic-method-call` | false positive | Comparator comes from a Map of application-defined functions; query sort is checked against that closed list.
- #99 | `js/incomplete-multi-character-sanitization` | false positive | Commons attribution becomes JSON and plain social caption text, not executable HTML; renderers escape text at output.
- #100 | `js/incomplete-url-substring-sanitization` | used in tests | Offline HTTP stub or assertion filter; no production URL validation.
- #101 | `py/clear-text-logging-sensitive-data` | false positive | Logs public parliamentary salary entitlements and public member names from the Handbook and published pay registry, not private payroll.
- #105 | `js/incomplete-multi-character-sanitization` | used in tests | Test-only text or script extraction; no untrusted HTML is served by this helper.
- #107 | `js/incomplete-sanitization` | used in tests | Test-only fixture matching or expected-output formatting; no production escaping boundary.
- #108 | `js/incomplete-sanitization` | used in tests | Test-only fixture matching or expected-output formatting; no production escaping boundary.
- #109 | `js/incomplete-sanitization` | used in tests | Test-only fixture matching or expected-output formatting; no production escaping boundary.
- #110 | `js/incomplete-multi-character-sanitization` | false positive | Privacy placeholder audit returns marker IDs only, never HTML; style stripping is not a security sanitiser.
- #111 | `js/incomplete-multi-character-sanitization` | false positive | Privacy placeholder audit returns marker IDs only, never HTML; comment stripping is not a security sanitiser.
- #112 | `js/incomplete-multi-character-sanitization` | used in tests | Test-only text or script extraction; no untrusted HTML is served by this helper.
- #113 | `js/incomplete-multi-character-sanitization` | used in tests | Test-only text or script extraction; no untrusted HTML is served by this helper.
- #120 | `js/bad-tag-filter` | used in tests | Test harness extracts fixture scripts; the result is not an HTML sanitiser or served markup.
- #121 | `js/incomplete-multi-character-sanitization` | used in tests | Test-only text or script extraction; no untrusted HTML is served by this helper.
- #124 | `js/incomplete-hostname-regexp` | used in tests | Offline fixture matcher selects stub responses, with no production URL trust decision.
- #125 | `js/incomplete-hostname-regexp` | used in tests | Offline fixture matcher selects stub responses, with no production URL trust decision.
- #132 | `js/incomplete-sanitization` | used in tests | Test-only fixture matching or expected-output formatting; no production escaping boundary.
- #134 | `js/bad-tag-filter` | used in tests | Test harness extracts fixture scripts; the result is not an HTML sanitiser or served markup.
- #142 | `js/bad-tag-filter` | used in tests | Test harness extracts fixture scripts; the result is not an HTML sanitiser or served markup.
- #143 | `js/incomplete-multi-character-sanitization` | false positive | Breadcrumb extraction returns label data; final HTML escapes it and schema JSON escapes markup delimiters.
- #144 | `js/incomplete-multi-character-sanitization` | false positive | Heading extraction returns plain label data; final HTML escapes it and schema JSON escapes markup delimiters.
- #160 | `js/incomplete-url-substring-sanitization` | used in tests | Offline HTTP stub or assertion filter; no production URL validation.
- #167 | `js/functionality-from-untrusted-source` | false positive | Immutable source HTML snapshot parsed offline; its script is never executed or included in served assets.
- #168 | `js/functionality-from-untrusted-source` | false positive | Immutable source HTML snapshot parsed offline; its script is never executed or included in served assets.
- #169 | `js/functionality-from-untrusted-source` | false positive | Immutable source HTML snapshot parsed offline; its script is never executed or included in served assets.
- #170 | `js/functionality-from-untrusted-source` | false positive | Immutable source HTML snapshot parsed offline; its script is never executed or included in served assets.
- #171 | `js/functionality-from-untrusted-source` | false positive | Immutable source HTML snapshot parsed offline; its script is never executed or included in served assets.
- #172 | `js/functionality-from-untrusted-source` | false positive | Immutable source HTML snapshot parsed offline; its script is never executed or included in served assets.
- #173 | `js/functionality-from-untrusted-source` | false positive | Immutable source HTML snapshot parsed offline; its script is never executed or included in served assets.
- #174 | `js/functionality-from-untrusted-source` | false positive | Immutable source HTML snapshot parsed offline; its script is never executed or included in served assets.
- #175 | `js/functionality-from-untrusted-source` | false positive | Immutable source HTML snapshot parsed offline; its script is never executed or included in served assets.
- #176 | `js/functionality-from-untrusted-source` | false positive | Immutable source HTML snapshot parsed offline; its script is never executed or included in served assets.
- #177 | `js/functionality-from-untrusted-source` | false positive | Immutable source HTML snapshot parsed offline; its script is never executed or included in served assets.
- #178 | `js/functionality-from-untrusted-source` | false positive | Immutable source HTML snapshot parsed offline; its script is never executed or included in served assets.
- #179 | `js/functionality-from-untrusted-source` | false positive | Immutable source HTML snapshot parsed offline; its script is never executed or included in served assets.
- #180 | `js/functionality-from-untrusted-source` | false positive | Immutable source HTML snapshot parsed offline; its script is never executed or included in served assets.
- #181 | `js/functionality-from-untrusted-source` | false positive | Immutable source HTML snapshot parsed offline; its script is never executed or included in served assets.
- #182 | `js/functionality-from-untrusted-source` | false positive | Immutable source HTML snapshot parsed offline; its script is never executed or included in served assets.
- #183 | `js/functionality-from-untrusted-source` | false positive | Immutable source HTML snapshot parsed offline; its script is never executed or included in served assets.
- #184 | `js/functionality-from-untrusted-source` | false positive | Immutable source HTML snapshot parsed offline; its script is never executed or included in served assets.
- #185 | `js/functionality-from-untrusted-source` | false positive | Immutable source HTML snapshot parsed offline; its script is never executed or included in served assets.
- #186 | `js/functionality-from-untrusted-source` | false positive | Immutable source HTML snapshot parsed offline; its script is never executed or included in served assets.
- #187 | `js/functionality-from-untrusted-source` | false positive | Immutable source HTML snapshot parsed offline; its script is never executed or included in served assets.
- #188 | `js/functionality-from-untrusted-source` | false positive | Immutable source HTML snapshot parsed offline; its script is never executed or included in served assets.
- #189 | `js/functionality-from-untrusted-source` | false positive | Immutable source HTML snapshot parsed offline; its script is never executed or included in served assets.
- #190 | `js/functionality-from-untrusted-source` | false positive | Immutable source HTML snapshot parsed offline; its script is never executed or included in served assets.
- #191 | `js/functionality-from-untrusted-source` | false positive | Immutable source HTML snapshot parsed offline; its script is never executed or included in served assets.
- #192 | `js/functionality-from-untrusted-source` | false positive | Immutable source HTML snapshot parsed offline; its script is never executed or included in served assets.
- #193 | `js/functionality-from-untrusted-source` | false positive | Immutable source HTML snapshot parsed offline; its script is never executed or included in served assets.
- #194 | `js/functionality-from-untrusted-source` | false positive | Immutable source HTML snapshot parsed offline; its script is never executed or included in served assets.
- #195 | `js/functionality-from-untrusted-source` | false positive | Immutable source HTML snapshot parsed offline; its script is never executed or included in served assets.
- #196 | `js/functionality-from-untrusted-source` | false positive | Immutable source HTML snapshot parsed offline; its script is never executed or included in served assets.
- #197 | `js/functionality-from-untrusted-source` | false positive | Immutable source HTML snapshot parsed offline; its script is never executed or included in served assets.
- #198 | `js/functionality-from-untrusted-source` | false positive | Immutable source HTML snapshot parsed offline; its script is never executed or included in served assets.
- #199 | `js/functionality-from-untrusted-source` | false positive | Immutable source HTML snapshot parsed offline; its script is never executed or included in served assets.
- #200 | `js/functionality-from-untrusted-source` | false positive | Immutable source HTML snapshot parsed offline; its script is never executed or included in served assets.
- #201 | `js/functionality-from-untrusted-source` | false positive | Immutable source HTML snapshot parsed offline; its script is never executed or included in served assets.
- #202 | `js/functionality-from-untrusted-source` | false positive | Immutable source HTML snapshot parsed offline; its script is never executed or included in served assets.
- #203 | `js/functionality-from-untrusted-source` | false positive | Immutable source HTML snapshot parsed offline; its script is never executed or included in served assets.
- #204 | `js/functionality-from-untrusted-source` | false positive | Immutable source HTML snapshot parsed offline; its script is never executed or included in served assets.
- #205 | `js/functionality-from-untrusted-source` | false positive | Immutable source HTML snapshot parsed offline; its script is never executed or included in served assets.
- #206 | `js/functionality-from-untrusted-source` | false positive | Immutable source HTML snapshot parsed offline; its script is never executed or included in served assets.
- #207 | `js/functionality-from-untrusted-source` | false positive | Immutable source HTML snapshot parsed offline; its script is never executed or included in served assets.
- #208 | `js/functionality-from-untrusted-source` | false positive | Immutable source HTML snapshot parsed offline; its script is never executed or included in served assets.
- #209 | `js/functionality-from-untrusted-source` | false positive | Immutable source HTML snapshot parsed offline; its script is never executed or included in served assets.
- #210 | `js/functionality-from-untrusted-source` | false positive | Immutable source HTML snapshot parsed offline; its script is never executed or included in served assets.
- #211 | `js/functionality-from-untrusted-source` | false positive | Immutable source HTML snapshot parsed offline; its script is never executed or included in served assets.
- #212 | `js/functionality-from-untrusted-source` | false positive | Immutable source HTML snapshot parsed offline; its script is never executed or included in served assets.
- #213 | `js/functionality-from-untrusted-source` | false positive | Immutable source HTML snapshot parsed offline; its script is never executed or included in served assets.
- #214 | `js/functionality-from-untrusted-source` | false positive | Immutable source HTML snapshot parsed offline; its script is never executed or included in served assets.
- #215 | `js/functionality-from-untrusted-source` | false positive | Immutable source HTML snapshot parsed offline; its script is never executed or included in served assets.
- #216 | `js/functionality-from-untrusted-source` | false positive | Immutable source HTML snapshot parsed offline; its script is never executed or included in served assets.
- #217 | `js/functionality-from-untrusted-source` | false positive | Immutable source HTML snapshot parsed offline; its script is never executed or included in served assets.
- #218 | `js/functionality-from-untrusted-source` | false positive | Immutable source HTML snapshot parsed offline; its script is never executed or included in served assets.
- #219 | `js/functionality-from-untrusted-source` | false positive | Immutable source HTML snapshot parsed offline; its script is never executed or included in served assets.
- #220 | `js/functionality-from-untrusted-source` | false positive | Immutable source HTML snapshot parsed offline; its script is never executed or included in served assets.
- #221 | `js/functionality-from-untrusted-source` | false positive | Immutable source HTML snapshot parsed offline; its script is never executed or included in served assets.
- #222 | `js/functionality-from-untrusted-source` | false positive | Immutable source HTML snapshot parsed offline; its script is never executed or included in served assets.
- #223 | `js/functionality-from-untrusted-source` | false positive | Immutable source HTML snapshot parsed offline; its script is never executed or included in served assets.
- #224 | `js/functionality-from-untrusted-source` | false positive | Immutable source HTML snapshot parsed offline; its script is never executed or included in served assets.
- #225 | `js/functionality-from-untrusted-source` | false positive | Immutable source HTML snapshot parsed offline; its script is never executed or included in served assets.
- #226 | `js/functionality-from-untrusted-source` | false positive | Immutable source HTML snapshot parsed offline; its script is never executed or included in served assets.
- #227 | `js/functionality-from-untrusted-source` | false positive | Immutable source HTML snapshot parsed offline; its script is never executed or included in served assets.
- #228 | `js/functionality-from-untrusted-source` | false positive | Immutable source HTML snapshot parsed offline; its script is never executed or included in served assets.
- #229 | `js/functionality-from-untrusted-source` | false positive | Immutable source HTML snapshot parsed offline; its script is never executed or included in served assets.
- #230 | `js/functionality-from-untrusted-source` | false positive | Immutable source HTML snapshot parsed offline; its script is never executed or included in served assets.
- #231 | `js/functionality-from-untrusted-source` | false positive | Immutable source HTML snapshot parsed offline; its script is never executed or included in served assets.
- #232 | `js/functionality-from-untrusted-source` | false positive | Immutable source HTML snapshot parsed offline; its script is never executed or included in served assets.
- #233 | `js/functionality-from-untrusted-source` | false positive | Immutable source HTML snapshot parsed offline; its script is never executed or included in served assets.
- #234 | `js/functionality-from-untrusted-source` | false positive | Immutable source HTML snapshot parsed offline; its script is never executed or included in served assets.
- #235 | `js/functionality-from-untrusted-source` | false positive | Immutable source HTML snapshot parsed offline; its script is never executed or included in served assets.
- #236 | `js/functionality-from-untrusted-source` | false positive | Immutable source HTML snapshot parsed offline; its script is never executed or included in served assets.
- #237 | `js/functionality-from-untrusted-source` | false positive | Immutable source HTML snapshot parsed offline; its script is never executed or included in served assets.
- #238 | `js/functionality-from-untrusted-source` | false positive | Immutable source HTML snapshot parsed offline; its script is never executed or included in served assets.
- #239 | `js/functionality-from-untrusted-source` | false positive | Immutable source HTML snapshot parsed offline; its script is never executed or included in served assets.
- #240 | `js/functionality-from-untrusted-source` | false positive | Immutable source HTML snapshot parsed offline; its script is never executed or included in served assets.
- #241 | `js/functionality-from-untrusted-source` | false positive | Immutable source HTML snapshot parsed offline; its script is never executed or included in served assets.
- #242 | `js/functionality-from-untrusted-source` | false positive | Immutable source HTML snapshot parsed offline; its script is never executed or included in served assets.
- #243 | `js/functionality-from-untrusted-source` | false positive | Immutable source HTML snapshot parsed offline; its script is never executed or included in served assets.
- #244 | `js/functionality-from-untrusted-source` | false positive | Immutable source HTML snapshot parsed offline; its script is never executed or included in served assets.
- #245 | `js/functionality-from-untrusted-source` | false positive | Immutable source HTML snapshot parsed offline; its script is never executed or included in served assets.
- #246 | `js/functionality-from-untrusted-source` | false positive | Immutable source HTML snapshot parsed offline; its script is never executed or included in served assets.
- #247 | `js/functionality-from-untrusted-source` | false positive | Immutable source HTML snapshot parsed offline; its script is never executed or included in served assets.
- #248 | `js/functionality-from-untrusted-source` | false positive | Immutable source HTML snapshot parsed offline; its script is never executed or included in served assets.
- #249 | `js/functionality-from-untrusted-source` | false positive | Immutable source HTML snapshot parsed offline; its script is never executed or included in served assets.
- #250 | `js/functionality-from-untrusted-source` | false positive | Immutable source HTML snapshot parsed offline; its script is never executed or included in served assets.
- #251 | `js/functionality-from-untrusted-source` | false positive | Immutable source HTML snapshot parsed offline; its script is never executed or included in served assets.
- #252 | `js/functionality-from-untrusted-source` | false positive | Immutable source HTML snapshot parsed offline; its script is never executed or included in served assets.
- #253 | `js/functionality-from-untrusted-source` | false positive | Immutable source HTML snapshot parsed offline; its script is never executed or included in served assets.
- #254 | `js/functionality-from-untrusted-source` | false positive | Immutable source HTML snapshot parsed offline; its script is never executed or included in served assets.
- #255 | `js/functionality-from-untrusted-source` | false positive | Immutable source HTML snapshot parsed offline; its script is never executed or included in served assets.
- #256 | `js/functionality-from-untrusted-source` | false positive | Immutable source HTML snapshot parsed offline; its script is never executed or included in served assets.
- #257 | `js/functionality-from-untrusted-source` | false positive | Immutable source HTML snapshot parsed offline; its script is never executed or included in served assets.
- #258 | `js/functionality-from-untrusted-source` | false positive | Immutable source HTML snapshot parsed offline; its script is never executed or included in served assets.
- #259 | `js/functionality-from-untrusted-source` | false positive | Immutable source HTML snapshot parsed offline; its script is never executed or included in served assets.
- #260 | `js/functionality-from-untrusted-source` | false positive | Immutable source HTML snapshot parsed offline; its script is never executed or included in served assets.
- #261 | `js/functionality-from-untrusted-source` | false positive | Immutable source HTML snapshot parsed offline; its script is never executed or included in served assets.
- #262 | `js/functionality-from-untrusted-source` | false positive | Immutable source HTML snapshot parsed offline; its script is never executed or included in served assets.
- #263 | `js/functionality-from-untrusted-source` | false positive | Immutable source HTML snapshot parsed offline; its script is never executed or included in served assets.
- #264 | `js/functionality-from-untrusted-source` | false positive | Immutable source HTML snapshot parsed offline; its script is never executed or included in served assets.
- #265 | `js/functionality-from-untrusted-source` | false positive | Immutable source HTML snapshot parsed offline; its script is never executed or included in served assets.
- #266 | `js/functionality-from-untrusted-source` | false positive | Immutable source HTML snapshot parsed offline; its script is never executed or included in served assets.
- #267 | `js/functionality-from-untrusted-source` | false positive | Immutable source HTML snapshot parsed offline; its script is never executed or included in served assets.
- #268 | `js/functionality-from-untrusted-source` | false positive | Immutable source HTML snapshot parsed offline; its script is never executed or included in served assets.
- #269 | `js/functionality-from-untrusted-source` | false positive | Immutable source HTML snapshot parsed offline; its script is never executed or included in served assets.
- #270 | `js/functionality-from-untrusted-source` | false positive | Immutable source HTML snapshot parsed offline; its script is never executed or included in served assets.
- #271 | `js/functionality-from-untrusted-source` | false positive | Immutable source HTML snapshot parsed offline; its script is never executed or included in served assets.
- #272 | `js/functionality-from-untrusted-source` | false positive | Immutable source HTML snapshot parsed offline; its script is never executed or included in served assets.
- #273 | `js/functionality-from-untrusted-source` | false positive | Immutable source HTML snapshot parsed offline; its script is never executed or included in served assets.
- #274 | `js/functionality-from-untrusted-source` | false positive | Immutable source HTML snapshot parsed offline; its script is never executed or included in served assets.
- #275 | `js/functionality-from-untrusted-source` | false positive | Immutable source HTML snapshot parsed offline; its script is never executed or included in served assets.
- #276 | `js/functionality-from-untrusted-source` | false positive | Immutable source HTML snapshot parsed offline; its script is never executed or included in served assets.
- #277 | `js/functionality-from-untrusted-source` | false positive | Immutable source HTML snapshot parsed offline; its script is never executed or included in served assets.
- #278 | `js/functionality-from-untrusted-source` | false positive | Immutable source HTML snapshot parsed offline; its script is never executed or included in served assets.
- #279 | `js/functionality-from-untrusted-source` | false positive | Immutable source HTML snapshot parsed offline; its script is never executed or included in served assets.
- #280 | `js/functionality-from-untrusted-source` | false positive | Immutable source HTML snapshot parsed offline; its script is never executed or included in served assets.
- #281 | `js/functionality-from-untrusted-source` | false positive | Immutable source HTML snapshot parsed offline; its script is never executed or included in served assets.
- #282 | `js/functionality-from-untrusted-source` | false positive | Immutable source HTML snapshot parsed offline; its script is never executed or included in served assets.
- #283 | `js/functionality-from-untrusted-source` | false positive | Immutable source HTML snapshot parsed offline; its script is never executed or included in served assets.
- #284 | `js/functionality-from-untrusted-source` | false positive | Immutable source HTML snapshot parsed offline; its script is never executed or included in served assets.
- #285 | `js/functionality-from-untrusted-source` | false positive | Immutable source HTML snapshot parsed offline; its script is never executed or included in served assets.
- #286 | `js/functionality-from-untrusted-source` | false positive | Immutable source HTML snapshot parsed offline; its script is never executed or included in served assets.
- #287 | `js/functionality-from-untrusted-source` | false positive | Immutable source HTML snapshot parsed offline; its script is never executed or included in served assets.
- #288 | `js/functionality-from-untrusted-source` | false positive | Immutable source HTML snapshot parsed offline; its script is never executed or included in served assets.
- #289 | `js/functionality-from-untrusted-source` | false positive | Immutable source HTML snapshot parsed offline; its script is never executed or included in served assets.
- #290 | `js/functionality-from-untrusted-source` | false positive | Immutable source HTML snapshot parsed offline; its script is never executed or included in served assets.
- #291 | `js/functionality-from-untrusted-source` | false positive | Immutable source HTML snapshot parsed offline; its script is never executed or included in served assets.
- #292 | `js/functionality-from-untrusted-source` | false positive | Immutable source HTML snapshot parsed offline; its script is never executed or included in served assets.
- #293 | `js/functionality-from-untrusted-source` | false positive | Immutable source HTML snapshot parsed offline; its script is never executed or included in served assets.
- #294 | `js/functionality-from-untrusted-source` | false positive | Immutable source HTML snapshot parsed offline; its script is never executed or included in served assets.
- #295 | `js/functionality-from-untrusted-source` | false positive | Immutable source HTML snapshot parsed offline; its script is never executed or included in served assets.
- #296 | `js/functionality-from-untrusted-source` | false positive | Immutable source HTML snapshot parsed offline; its script is never executed or included in served assets.
- #297 | `js/functionality-from-untrusted-source` | false positive | Immutable source HTML snapshot parsed offline; its script is never executed or included in served assets.
- #298 | `js/functionality-from-untrusted-source` | false positive | Immutable source HTML snapshot parsed offline; its script is never executed or included in served assets.
- #299 | `js/functionality-from-untrusted-source` | false positive | Immutable source HTML snapshot parsed offline; its script is never executed or included in served assets.
- #300 | `js/functionality-from-untrusted-source` | false positive | Immutable source HTML snapshot parsed offline; its script is never executed or included in served assets.
- #301 | `js/functionality-from-untrusted-source` | false positive | Immutable source HTML snapshot parsed offline; its script is never executed or included in served assets.
- #302 | `js/functionality-from-untrusted-source` | false positive | Immutable source HTML snapshot parsed offline; its script is never executed or included in served assets.
- #303 | `js/functionality-from-untrusted-source` | false positive | Immutable source HTML snapshot parsed offline; its script is never executed or included in served assets.
- #304 | `js/functionality-from-untrusted-source` | false positive | Immutable source HTML snapshot parsed offline; its script is never executed or included in served assets.
- #305 | `js/functionality-from-untrusted-source` | false positive | Immutable source HTML snapshot parsed offline; its script is never executed or included in served assets.
- #306 | `js/functionality-from-untrusted-source` | false positive | Immutable source HTML snapshot parsed offline; its script is never executed or included in served assets.
- #307 | `js/functionality-from-untrusted-source` | false positive | Immutable source HTML snapshot parsed offline; its script is never executed or included in served assets.
- #308 | `js/functionality-from-untrusted-source` | false positive | Immutable source HTML snapshot parsed offline; its script is never executed or included in served assets.
- #309 | `js/functionality-from-untrusted-source` | false positive | Immutable source HTML snapshot parsed offline; its script is never executed or included in served assets.
- #310 | `js/functionality-from-untrusted-source` | false positive | Immutable source HTML snapshot parsed offline; its script is never executed or included in served assets.
- #311 | `js/functionality-from-untrusted-source` | false positive | Immutable source HTML snapshot parsed offline; its script is never executed or included in served assets.
- #312 | `js/functionality-from-untrusted-source` | false positive | Immutable source HTML snapshot parsed offline; its script is never executed or included in served assets.
- #313 | `js/functionality-from-untrusted-source` | false positive | Immutable source HTML snapshot parsed offline; its script is never executed or included in served assets.
- #314 | `js/functionality-from-untrusted-source` | false positive | Immutable source HTML snapshot parsed offline; its script is never executed or included in served assets.
- #315 | `js/functionality-from-untrusted-source` | false positive | Immutable source HTML snapshot parsed offline; its script is never executed or included in served assets.
- #316 | `js/functionality-from-untrusted-source` | false positive | Immutable source HTML snapshot parsed offline; its script is never executed or included in served assets.
- #317 | `js/functionality-from-untrusted-source` | false positive | Immutable source HTML snapshot parsed offline; its script is never executed or included in served assets.
- #318 | `js/functionality-from-untrusted-source` | false positive | Immutable source HTML snapshot parsed offline; its script is never executed or included in served assets.
- #319 | `js/functionality-from-untrusted-source` | false positive | Immutable source HTML snapshot parsed offline; its script is never executed or included in served assets.
- #320 | `js/functionality-from-untrusted-source` | false positive | Immutable source HTML snapshot parsed offline; its script is never executed or included in served assets.
- #321 | `js/functionality-from-untrusted-source` | false positive | Immutable source HTML snapshot parsed offline; its script is never executed or included in served assets.
- #322 | `js/functionality-from-untrusted-source` | false positive | Immutable source HTML snapshot parsed offline; its script is never executed or included in served assets.
- #323 | `js/functionality-from-untrusted-source` | false positive | Immutable source HTML snapshot parsed offline; its script is never executed or included in served assets.
- #324 | `js/functionality-from-untrusted-source` | false positive | Immutable source HTML snapshot parsed offline; its script is never executed or included in served assets.
- #325 | `js/functionality-from-untrusted-source` | false positive | Immutable source HTML snapshot parsed offline; its script is never executed or included in served assets.
- #326 | `js/functionality-from-untrusted-source` | false positive | Immutable source HTML snapshot parsed offline; its script is never executed or included in served assets.
- #327 | `js/functionality-from-untrusted-source` | false positive | Immutable source HTML snapshot parsed offline; its script is never executed or included in served assets.
- #328 | `js/functionality-from-untrusted-source` | false positive | Immutable source HTML snapshot parsed offline; its script is never executed or included in served assets.
- #329 | `js/bad-tag-filter` | used in tests | Test harness extracts fixture scripts; the result is not an HTML sanitiser or served markup.
- #330 | `js/incomplete-multi-character-sanitization` | used in tests | Test-only text or script extraction; no untrusted HTML is served by this helper.
- #331 | `js/xss-through-exception` | used in tests | Loopback-only browser QA server, with outbound network disabled; not production response handling.
- #332 | `js/xss-through-exception` | used in tests | Loopback-only browser QA server, with outbound network disabled; not production response handling.
- #333 | `js/incomplete-sanitization` | used in tests | Test-only fixture matching or expected-output formatting; no production escaping boundary.
- #334 | `js/insecure-randomness` | false positive | Three.js UUID identifies a local rendering object, never a token, credential or authorisation decision.
- #335 | `js/insecure-randomness` | false positive | Three.js UUID identifies a local rendering object, never a token, credential or authorisation decision.
- #336 | `js/insecure-randomness` | false positive | Three.js UUID identifies a local rendering object, never a token, credential or authorisation decision.
- #337 | `js/insecure-randomness` | false positive | Three.js UUID identifies a local rendering object, never a token, credential or authorisation decision.
- #338 | `js/insecure-randomness` | false positive | Three.js UUID identifies a local rendering object, never a token, credential or authorisation decision.
- #339 | `js/incomplete-multi-character-sanitization` | false positive | Stripped text only selects a fixed column key; emitted cell content was already escaped by dataTableHTML.
- #340 | `js/incomplete-multi-character-sanitization` | false positive | Stripped text only selects a fixed column key; emitted cell content was already escaped by dataTableHTML.
- #346 | `js/incomplete-multi-character-sanitization` | false positive | Stripped text only selects a fixed column key; emitted cell content was already escaped by dataTableHTML.
- #357 | `js/bad-tag-filter` | used in tests | Test harness extracts fixture scripts; the result is not an HTML sanitiser or served markup.
- #358 | `js/incomplete-hostname-regexp` | used in tests | Offline fixture matcher selects stub responses, with no production URL trust decision.
- #359 | `js/incomplete-url-substring-sanitization` | used in tests | Offline HTTP stub or assertion filter; no production URL validation.

Proposed dismissals: **202** (179 false positive, 23 used in tests, 0 won't fix).
