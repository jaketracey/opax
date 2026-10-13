**Release build timing and equivalence — 13 October 2026**

Base/input SHA: `3496488eb3e0efc0e61891c67349cffdcfa1f778`. Branch: `web/deploy-speed`. Mac: Apple M4 Max, Node v24.21.0, `nice -n 10`. No push, production deployment or workflow dispatch was performed.

The old `npm run build:release` was run before changing its existing builders. The new full-SQL build and CI metadata-only build used the same checkout path and original committed public/generated inputs, restored before each run. This also avoids esbuild absolute-path differences in voice chunks. Timings cover each Node sub-script, using an external preload timer; total timings additionally include npm/process overhead. Privacy rows combine the sweep and donor-index scripts. The four independent build rows overlap in the new pipeline. Warm cache rows include checksum validation and copying.

| Sub-script | Old Mac seconds | New CI-mode Mac seconds, warm cache |
|---|---:|---:|
| `build:methods` | 0.41 | 0.41 |
| `build:privacy (before derived builds)` | 90.95 | 57.68 |
| `build:tokens` | <0.01 | <0.01 |
| `build_passage_names` | 0.01 | 0.01 |
| `build_search_catalog` | 48.85 | 29.37 |
| `build:growth` | 35.81 | 36.43 |
| `build:hubs` | 0.71 | 0.72 |
| `build_crawl_catalog` | 6.56 | 2.21 |
| `build:vic-election` | 0.16 | 0.16 |
| `build:tables / load_tables` | 21.51 | 2.54 |
| `build:social` | 1.73 | 1.86 |
| `build:grants-map` | 0.03 | 0.04 |
| `build:analytics` | 0.03 | 0.06 |
| `build:voice` | 0.06 | 0.10 |
| `stamp_assets` | 1.60 | 1.72 |
| `photo_identity --deploy` | 0.12 | 0.04 |
| `build:privacy (final)` | 99.47 | 66.84 |

| Complete local run | Seconds |
|---|---:|
| Old release, full SQL | 309.95 |
| New release, full SQL, cold caches | 225.70 |
| New CI release, metadata-only, warm caches | 201.72 |
| New CI release, metadata-only, cold caches (estimated by replacing the full-SQL stage with the measured metadata stage) | 205.94 |

The primary improvement replaces oldest-key Map iteration with bulk eviction in the bounded 4,096-entry SHA-256 memo. Keys, SHA-256 values, the 256-character retention limit and every privacy decision are unchanged. No decisions are memoised by this change. The early sweep falls from 90.95 to 57.68 seconds, the final sweep from 99.47 to 66.84, and search from 48.85 to 29.37.

`load_tables.mjs --metadata-only`, or `OPAX_TABLE_METADATA_ONLY=1`, builds the same identity policy and writes only `portal/src/table-registry-fingerprint.json` and `portal/public/table-private-identities.json`. It does not project table rows or create, write or remove SQL. CI sets this mode. SQL remains the local default; `npm run build:tables -- --sql` overrides the CI environment for the held reload lane. There is no reload step in this production workflow. The avoided output is 89 SQL chunks, 145,297,014 SQL bytes (138.57 MiB), plus the manifest. The new full-SQL stage itself takes 22.30 seconds, while metadata-only takes 2.54 seconds.

Both privacy runs remain necessary. The first sanitises incoming source exports and refreshes the registry before search hashes, crawl fingerprints, growth projections and private SQL are derived. A final sweep cannot recompute an already-derived fingerprint or sanitise private SQL. A regression test runs the actual crawl builder on invented raw private text and proves that a final-only sweep leaves a different bill fingerprint from the sanitise-first pipeline. The final run sanitises newly written search, growth, hubs, election and social JSON after all writers, stamp and photo steps. Staging retains its graph build and final barrier. No policy or publication coverage is removed.

Social, grants-map, analytics and voice run concurrently with disjoint outputs (`social/`, grants-map bundle/license, analytics/events/ga bundles, and voice/assets/chunks respectively). The release waits for all children to settle and fails before stamp/deploy if any child fails.

Passage names and crawl outputs use [actions/cache](https://github.com/actions/cache) with exact committed-input hashes and no stale restore keys. Caches live outside public assets. At the original build position, the wrapper additionally verifies its actual input digest, exact Node version/platform, complete output inventory and every output SHA-256; missing or damaged entries rebuild. Crawl uses a conservative input superset covering transitive code and earlier generated inputs. Restored public assets still pass through the final sweep. Both warm-cache hits were observed; payload size is about 9 MiB. Cache reuse is modest here, and a nightly source refresh normally invalidates crawl.

**Equivalence evidence**

- Old versus new full-SQL release: **27,296 files compared, zero differences** — 27,203 files under `portal/public`, all three generated `portal/src` JSON files, and 90 files under `portal/private/dt-api` (89 SQL chunks plus manifest). The comparison checks both path sets and raw SHA-256 hashes, with no content normalisation.
- Old versus new warm-cache CI release: **27,206 public/generated source files compared, zero differences**. No `private/dt-api` directory was produced. Both table metadata files match byte for byte.
- Full-output inventory digest, old and new: `3543859257c3c928fa19dee556c717f87d9a50b9094cb8b1f1832cae4d29f1b8`.
- Public/generated source inventory digest, old and new CI mode: `b33a702a496a51d4b4f8e5d3e02684662fae0877c319d6953dfa7913a0d5f321`.
- Before versus after the privacy tests, targeted tests, check and dry-run: **27,206 files compared, zero differences**. `test:privacy` is read-only with respect to release outputs and performs no release rebuild; `deploy:built` retains the unchanged placeholder check, privacy gate and Wrangler chain.
- Tests verify byte-identical table metadata across modes, absence of SQL writes, explicit SQL override, changed-input invalidation, damaged/missing cache fallback, concurrency completion/failure handling, hash-memo eviction and privacy ordering.

**Gates and CI projection**

123 existing targeted tests, eight additional build-script checks and all 28 mandatory privacy tests pass (159 unique tests, including the deploy coverage guard). `npm run check` passes; `npx wrangler deploy --dry-run --env ''` passes and exits without uploading. Triggers, permissions, secrets, `skip_tests` handling and the complete restamp-commit step are byte-identical to the base workflow. The orchestrator's ship script was not changed. The full suite remains the orchestrator's ship gate.

[CI run 38344913815](https://github.com/jaketracey/opax/actions/runs/38344913815) at `f38a55251af278a2fd5cef0f9be811304e5d5784` took 648 seconds for the build, 252 for deploy, and 940 for the job. No new CI duration was measured live. Scaling the local build ratio by `648 / 309.95 = 2.091`, allowing five seconds for the new cache actions, and holding deploy and other steps constant gives:

| Projected CI, with `skip_tests=true` as in the supplied run | Warm caches | Cold caches |
|---|---:|---:|
| Build step | 427 s (7.1 min) | 436 s (7.3 min) |
| Whole job | 719 s (12.0 min) | 728 s (12.1 min) |

Expect roughly **12 minutes instead of 15 minutes 40 seconds**, with normal runner/network variation. CI will use metadata-only tables, concurrent independent builds, exact-key deterministic caches and faster hash memo eviction. Both privacy barriers, `test:privacy`, the exact-SHA test-skipping workflow and restamp commit remain in place. Actual Wrangler upload time was not measured or changed by dispatching a deploy.

Machine-readable measurements and inventory digests: [deploy-speed-2026-10-13.json](deploy-speed-2026-10-13.json).

**Fast privacy matcher integration**

The integration merges main `b69257a871c1f46dd6632c586cb17094d5843189` and the approved matcher `af8bc8c52a52d6b2d0f01c3002156dc8e24a775f`. The original timing table above describes the earlier benchmark commit. Table builds now also emit the server-only `portal/src/table-identity-prefilter.generated.mjs` in both SQL and metadata-only modes, using the matcher's unchanged `identityPrefilterModule` serializer. Its prefilter, complete SHA registry, binding and fingerprint all come from the same policy.

The reported `d2fae609…` binding belongs to the metadata test's three invented identities. Adding a hard-coded write to the release module let that fixture replace the 17,518-entry release bundle, whose fingerprint is `f620d6a1…`. The runtime correctly failed closed against this mismatch. The bundle destination now follows the fingerprint destination, so fixture output stays in its temporary directory. The regression test compares both modes' module bytes, rejects the fixture binding against the release registry and verifies that neither mode alters the release bundle.

`tableRows().policy` and `tableIdentityIndex()` produce identical registries and identical modules from the captured inputs. Both modes reproduce the fetched matcher branch's committed module byte for byte (SHA-256 `aac68d10b85f0ac8b7eed261e2f763e9cf8ffa25ca060a0be2e594f71d410653`). The worker test harness also retains main's execution-context hooks alongside the matcher's fixture bundle injection.

A fresh comparison runs the matcher's original loader and serial release pipeline against the integrated release pipeline in the same checkout, restoring the same merged inputs before each run. All **27,301 output files** match exactly: 27,206 public files, five generated source files including the private module and its declaration, and 90 SQL/manifest files. The real metadata-only build matches all **27,211 public/generated source files**, produces no SQL and emits the identical private module. All 27,211 files remain unchanged after local gates. `votes.json` remains byte-identical to captured main (SHA-256 `a77128dc0e1e1b3fdaa4bf84501e2c94af3125dea3cf0b2dffbc688a49d68546`).

All 154 table/privacy tests pass with zero failures or skips. The integrated `build:release`, `check` and local Wrangler dry-run pass. The complete desktop merge-gate record is retained separately under ignored `.ops/gate-cache/` for the final candidate. No upstream push or production deployment is part of this integration.

[Integration evidence](deploy-speed-matcher-integration-2026-10-13.json).

The first complete desktop run exposed an unrelated reviewer-login test comparing real elapsed request times within 25 ms during scheduler contention. Its timing case now uses a controlled performance clock and delayed-email timers, retaining the original 95 ms minimum and 25 ms equivalence assertions and adding an exact 100 ms floor assertion. All 43 reviewer-login tests pass locally. Authentication implementation and binding logic are unchanged; the final candidate reruns the complete desktop gate. The gate runner is pinned to the coherent committed tools at `e52c6380be`, and selects all 185 application test files.
