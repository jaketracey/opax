# Data correctness review correction, round 1

Review base: `8e888a338`. Current main `496fbe4dc` is merged in `96204eb7e`.
The compatibility correction is `9933cc0b1e6117fcf17e483aea40403a9edc8972`.
Only the supplied Git origin was fetched. No publisher source requests,
production writes, deployments or pushes were made. Paused sources remain
paused. The interests correction replays the retained exports and preserves
their coverage, source dates, text and ordering.

The original change made shared interest holders nullable without checking the
released app. That was incompatible with iOS 1.1.3. Its decoder requires a
non-empty string in bucket items, person ties, recent declarations and donor
ties. The correction restores the established `"unspecified"` wire value for
missing holders. This is the smallest compatible change: the existing web
display adapter already treats that value as absent, so no new field, versioned
endpoint or released-app change is needed. The released app's holder display
also omits this value (`DeclaredInterests.tsx` at `eb6fd2dce`).

Web tables say "Not stated" or omit the holder label. The web register API,
declared-interests tool and local table SQL retain nullable display values.
The search builder now uses the same display adapter, so it cannot copy the
legacy wire placeholder into reader-facing search snippets. The iOS API
contract explicitly distinguishes shared wire strings from web projections.

| Shared holder field | Nulls in reviewed branch | Nulls after correction | Compatible missing-holder strings |
| --- | ---: | ---: | ---: |
| Bucket items | 3,026 | 0 | 3,026 |
| `ties[].register.holder` | 105 | 0 | 105 |
| Recent declarations | 100 | 0 | 100 |
| Donor ties | 105 | 0 | 105 |
| Total | 3,336 | 0 | 3,336 |

`portal/test/fixtures/ios-1.1.3/` pins the actual decoder declarations from
`eb6fd2dce:mobile/src/api/catalog-decoders.ts`, plus that release's validation,
identifier, error and donor privacy helpers. The declaration block and four
helper files were compared with `git show` and match verbatim, apart from the
provenance comment and local adapter imports. No decoder is stubbed or relaxed.
The fixture makes CI independent of the app branch and network availability.

The compatibility test runs those decoders against all 320 regenerated member
registers, the index, all 300 recent declarations and all 272 donor ties. It
also rejects silent row quarantine, injects null into each of the four holder
fields to prove it detects this regression, checks all four wire fields remain
non-empty strings, renders every register's web table and checks the regenerated
interest search snippets for leaked placeholders. The existing register API and
record-tool tests exercise their nullable web projections against retained data.

The merge conflicts were resolved by replacing the conflicting app-script stamp
with a regeneration marker and running `node scripts/stamp_assets.mjs`, then
`--check`, and by running `node scripts/build_search_catalog.mjs` to replace the
conflicting search manifest. Neither generated file was selected from a merge
side. The final release build rebuilds the combined data and stamps again.

All 164 agency profile files, with 39,053 supplier rows, and all 18 annual-report
export files were compared with the reviewed commit using their Git blob hashes.
They are byte-for-byte identical. The existing exhaustive agency join tests and
three real bad-date regression tests remain in place.

The [round 1 file inventory](2026-11-12-data-small-r1-assets.tsv) records current
sizes and comparisons with the reviewed commit. The round 0 report is retained
as history and explicitly points to this correction.

| Inventory group | Files | Current bytes | Tracked files changed from review |
| --- | ---: | ---: | ---: |
| Replayed interest exports | 323 | 1,396,736 | 171 |
| Retained agency profiles and index | 165 | 52,013,716 | 0 |
| Retained annual-report exports | 18 | 13,843,946 | 0 |
| Affected report projections and annual-report compact index | 4 | 268,750 | 0, ignored build products |
| Regenerated search catalogue and manifest | 1,626 | 279,895,308 | 1 |
| Interests SQL chunks and SQL manifest | 4 | 3,209,196 | 0, ignored build products |
| Asset-stamp entries | 2 | 217,849 | 1 |

The wire correction affects 169 member-register files plus the recent and
donor-ties files. It restores 30,024 bytes of compatible holder strings. It does
not change any other interest JSON value. Unrelated tracked build changes to
party membership data, the agency top-suppliers cache, the grants-map licence
and voice assets were restored after the release build.

The requested gates all pass on the merged code:

| Gate | Result |
| --- | --- |
| `npx wrangler types` | Pass; tracked generated types unchanged |
| `npm run build:release` | Pass; combined catalogue and stamps regenerated |
| `npx tsc --noEmit` | Pass |
| `uv run --project .. --with pytest npm test`, from `portal/` | Pass, 4,778 tests, zero failures, 112.0 seconds |
| Exporter Python regression command below | Pass, 113 tests and 43 subtests |
| Focused released-decoder compatibility suite | Pass, all five tests |
| Combined focused register, API, tool and compatibility tests | Pass, 35 tests |
| Asset stamps `--check`, including after the full gates | Pass |
| `git diff --check` | Pass |
| Post-gate file inventory check | Pass, all 2,142 sizes verified |

The Python gate, from the repository root, was:

```sh
uv run --with pytest pytest tests/test_interests_export.py tests/test_interests_cleanup.py tests/test_interests_fetch.py tests/test_agencies.py tests/test_suppliers.py tests/test_transparency_dates.py tests/test_transparency_names.py tests/test_opax_db_override.py -q
```

After those gates, the source diff, decoder fixture and current data were
reviewed against each acceptance item:

| Acceptance item | Self-review result | Proof |
| --- | --- | --- |
| 1. Released-app compatibility and plain web display | Done. All four shared holder fields are required non-empty strings again. Only web projections normalise the compatibility sentinel to absence. Search uses that same adapter. | `interests-ios-1.1.3-compat.test.mjs`: all four wire-field checks, all-register web rendering and regenerated search-snippet check; `register-tables.test.mjs` and `record-service-interests-grants.test.mjs`: web API/tool null projection checks. |
| 2. Exact 1.1.3 decoder regression test | Done. The frozen `eb6fd2dce` rules accept 320/320 registers, 300/300 recent declarations and 272/272 donor ties, without quarantining any declaration or donor group. Null mutations in all four holder positions still fail. | The five-test compatibility suite; post-gate byte comparison of the fixture declaration block and helper files against `git show eb6fd2dce`. |
| 3. Merge current main and regenerate conflicts | Done. `96204eb7e` merges `496fbe4dc`. Both conflicted generated files were rebuilt from combined inputs. | `git merge-base --is-ancestor origin/main HEAD`; regenerated search catalogue tested by the full suite; `stamp_assets.mjs --check` after the gates. |
| 4. Retain supplier metadata and date repairs exactly | Done. All 164 agency profile files, their index and all 18 annual-report export files retain their reviewed Git blob hashes. Supplier row count remains 39,053. | Post-gate blob comparison to `8e888a338`; `tests/test_agencies.py` exhaustive identity/totals reconciliation; `tests/test_transparency_dates.py` and `portal/test/official-reports.test.mjs` real-date/projection checks. |

No additional acceptance issue was found in that self-review. The older
standalone `100%` descriptions and unrelated source-access findings documented
in round 0 are outside this correction. No device or production checks were
run in this desktop lane.
