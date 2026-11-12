# Three data correctness fixes, 12 November 2026

Base: `c37df29d334008d98dfe13c82fa03b3b8eb42fbd`, branch `im/data-small`.
Local commits: `86fd85779c7558a80222c0f9f2a86fb9cb21c547` (interests), `643c2c8bb743bc7ac034e144888638bbf83e4fca` (agency metadata), `07913a484b51455d2263e29ce5c50e9d646cf47b` (annual-report dates).

No source requests, deployments, production writes or pushes. The desktop source-access ledger was checked. Its paused entries remain unchanged. All exports used committed public data as retained inputs. The local interests DB predates those inputs (latest document update 3 September 2026), and the local Transparency Portal acquisition cache is absent. Both exporters now support `--from-export` to replay retained projections without advancing source dates or reducing coverage. This mode cannot reconstruct uncapped interests or replace an acquisition snapshot.

The interests exporter now writes null for missing holders in bucket items, person ties, donor ties and recent declarations. It handles both missing DB values and the literal placeholder already stored by loaders. The shared table reader, register JSON API, declared-interests tool, local table SQL exporter, TypeScript shapes and iOS decoder contract accept null. Older cached placeholders also decode as absent. The table displays "Not stated"; other pages omit the holder label.

Every count below is a holder field occurrence, so a declaration repeated in different serving projections is counted separately. All 3,336 old placeholders became null. All other JSON values, source dates, descriptions, links, totals and ordering are unchanged. The retained directory still represents 320 people and 10,381 declarations; it serves 6,871 bucket preview items.

| Holder field | Before: placeholder | After: placeholder | Converted to null |
| --- | ---: | ---: | ---: |
| `buckets.shareholdings.items[].holder` | 190 | 0 | 190 |
| `buckets.real_estate.items[].holder` | 312 | 0 | 312 |
| `buckets.trusts.items[].holder` | 137 | 0 | 137 |
| `buckets.directorships.items[].holder` | 56 | 0 | 56 |
| `buckets.gifts.items[].holder` | 296 | 0 | 296 |
| `buckets.travel.items[].holder` | 253 | 0 | 253 |
| `buckets.memberships.items[].holder` | 646 | 0 | 646 |
| `buckets.liabilities.items[].holder` | 320 | 0 | 320 |
| `buckets.other.items[].holder` | 816 | 0 | 816 |
| `ties[].register.holder` | 105 | 0 | 105 |
| `ties-by-donor.donors.*[].holder` | 105 | 0 | 105 |
| `recent.items[].holder` | 100 | 0 | 100 |
| Total | 3,336 | 0 | 3,336 |

The supplier exporter already joins contracts to supplier identities within ABN boundaries and carries the ABR organisation record in `identity`. `build_agencies()` dropped that object when projecting each agency's supplier rows. It now copies identity from the same supplier profile, preserving the existing supplier ID, name and ABN. Agency rows display the recorded legal name, ABN record link, kind and ABR type code where available. Same-name suppliers with different ABNs remain separate; a business-register URL that disagrees with the row's ABN is not linked.

| Agency supplier metadata | Before: rows carrying field | After: rows carrying field | Agencies gaining field | Still unavailable in input |
| --- | ---: | ---: | ---: | ---: |
| Legal name | 0 | 31,570 | 164 | 7,483 |
| ABN record URL | 0 | 34,236 | 164 | 4,817 |
| ABR type | 0 | 31,570 | 164 | 7,483 |
| Kind | 0 | 39,053 | 164 | 0 |

The metadata loss affected 39,053 supplier-agency rows across all 164 agencies. An exhaustive comparison against the base proves that identity is the only added JSON value on agency rows. The 108,607 contracts, all supplier and agency totals, and every contract field are unchanged.

The Transparency Portal parser previously copied publication-date components into ISO order without validating the calendar. Most validation messages use month/day/year, but the three below use an unambiguous day/month/year. The source parser now validates dates and uses day-first only when the first component cannot be a month. Ambiguous dates retain the previous month-first interpretation. The exporter also reparses invalid dates in older snapshots, including retained public projections, through that same source parser. Invalid dates fall back to null rather than an invented day.

The raw messages are unavailable locally. The exact date components below are recovered by reversing the old parser's lossless formatting of the retained values. The requested `git log` searches for annual reports and invalid dates were run; the three records were located by validating the retained annual-report index.

| Body, 2024-25 report | Retained source components | Before | After |
| --- | --- | --- | --- |
| National Commission for Aboriginal and Torres Strait Islander Children and Young People | `21/05/2026` | `2026-21-05` | `2026-05-21` |
| Office of the Auditing and Assurance Standards Board | `21/05/2026` | `2026-21-05` | `2026-05-21` |
| Royal Australian Air Force Welfare Trust Fund | `25/05/2026` | `2026-25-05` | `2026-05-25` |

Invalid annual-report publication dates: 3 before, 0 after. Only these three date values change in the annual-report index; its manifest content hash is updated. All 238 bodies, 1,378 report references, 646 headline rows, 12,919 KMP rows and 5,505 supplier rows are retained. The three report detail projections, compact annual-report index, search records and search dates were rebuilt. Search coverage stays at 333,015 records.

The complete [regeneration inventory](2026-11-12-data-small-assets.tsv) lists each file and its size in bytes, including unchanged exporter outputs and ignored build products. The committed search manifest changes from version `bd3fa7afce2b7350` to `d1c0154ed85f028a`.

| Regenerated group | Files written | Total bytes after | Tracked files changed |
| --- | ---: | ---: | ---: |
| Interests directory | 323 | 1,366,712 | 178 |
| Agency directory and index | 165 | 52,013,716 | 164 |
| Annual-report export | 18 | 13,843,946 | 2 |
| Affected report detail files and compact index | 4 | 268,750 | 0, ignored build products |
| Search catalogue and manifest | 1,626 | 279,894,964 | 1 |
| Interests SQL chunks and SQL manifest | 4 | 3,209,196 | 0, ignored build products |
| HTML and table-entry asset stamps | 2 | 217,849 | 2 |

Unrelated release-build changes were restored: party membership data, the agency top-suppliers cache, the grants-map licence and voice assets. The new voice SDK chunk produced by the build was removed.

Regression tests exercise real retained interest records in the exporter, table/API and record tool; all real supplier-agency identity pairs; conflicting ABNs with the same name; the three real bad date components; ambiguous dates, impossible dates and leap days; and the report projections. Synthetic DB fixtures use invented member names.

Additional checks found two existing standalone `100%` descriptions in the retained `n-corrine-mcmillan.json` register. Their descriptions and positions are identical to the base. `validate_data.py interests` checks every item in a changed file, so changing its holder values exposes these older parser defects. They are retained rather than silently merging source descriptions without the acquisition input. The annual-report and supplier validation groups pass. The repository source-access guard reports 2,823 findings across 16 unchanged files, with zero findings on changed files. No source-access implementation changed in this lane.

The offline re-export commands, from the repository root, were:

```sh
python3 scripts/export_interests.py --from-export portal/public/interests --out portal/public/interests
python3 scripts/export_agencies.py
python3 scripts/export_annual_reports.py --from-export portal/public/annual-reports
```

The Python regression command was:

```sh
uv run --with pytest pytest tests/test_interests_export.py tests/test_interests_cleanup.py tests/test_interests_fetch.py tests/test_agencies.py tests/test_suppliers.py tests/test_transparency_dates.py tests/test_transparency_names.py tests/test_opax_db_override.py -q
```

It passes 113 tests and 43 subtests. The first portal run used the system Python and failed three Python-backed suites because `openpyxl` was absent; one additional test still expected the retired holder labels. After updating that expectation and using the project's Python environment, all four suites pass in isolation (25 tests). The complete portal rerun uses `uv run --project .. --with pytest npm test` from `portal/`, so its Python subprocesses see the same declared dependencies as the exporters.

| Gate or check | Result |
| --- | --- |
| `npm ci --no-audit --no-fund` | Pass, 237 packages installed |
| `npx wrangler types` | Pass; tracked generated types unchanged |
| `npm run build:release` | Pass, including final rebuild after reader changes |
| `npx tsc --noEmit` | Pass, including final check |
| Full `npm test` in the project Python environment | Pass, 4,729 tests, 0 failures, 212.3 seconds |
| Python regression command above | Pass, 113 tests and 43 subtests |
| Four previously failing portal suites, isolated retry | Pass, 25 tests |
| `node scripts/stamp_assets.mjs --check` | Pass; 100 header rules |
| `git diff --check` | Pass |
| Exhaustive comparison of interest, agency and annual-report JSON values against the base | Pass; only the requested holder, identity and three publication-date fields change |
| Regeneration inventory | Pass; all 2,142 listed file sizes verified |
| Local interests table projection | Pass; 6,871 rows, 3,026 null holders, zero placeholder holders |
| `validate_data.py annual-reports` and `suppliers` | Pass |
| `validate_data.py interests`, before committing the changed files | Fails on the two retained standalone `100%` descriptions described above |
| Repository source-access guard | Fails on 2,823 findings in 16 unchanged files; none on this lane's changed files |

The portal has no lint script. Device checks were not part of this desktop lane. The requested three fixes are complete; the retained interest-description defects and existing source-access guard findings remain for separate work.
