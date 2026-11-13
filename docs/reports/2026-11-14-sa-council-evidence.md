# SA Legislative Council term-start evidence

Follow-up: [orchestrator note 1](2026-11-14-roster-period-sweep.md) corrects Hood's placeholder start and records the all-house sweep. The findings below describe the initial review.

Reviewed 14 November 2026 (Australia/Sydney), on `im/sa-council-evidence` from `im/roster-periods` (`a1a7fbc4d`). Row 162 was not yet on local `main`; the branch still needs rebasing when it lands.

The base has **five**, rather than six, 2026 term starts supported only by Wikidata: Cory Bernardi, Hilton Gumbys, Rebecca Hewett, Carlos Quaremba and Melanie Selwood. Each member's SA Parliament page confirms 21 March 2026 in both its election date and current Legislative Council electoral-history row. Each now has their own primary evidence entry; the previously reviewed, agreeing Wikidata record is retained in `secondary_sources`. Bernardi's published Council affiliation also cites his own Parliament page. All held dates are unchanged.

Mira El Dannawi is the sixth Wikidata-backed start, but hers is in 2023. Her page confirms that held date and her evidence is upgraded in the same way. Benjamin Hood has a 2026 list-date placeholder rather than a Wikidata term start; his primary record disagrees with that placeholder, as detailed below. The shared `sa-council-service` entry has been removed. The common official chamber-list evidence remains valid for the list itself.

## Per-person records

| Name | Primary member record | Stated date | Held date | Matches held date | What the record says |
| --- | --- | --- | --- | --- | --- |
| Cory Bernardi | [SA Parliament](https://www.parliament.sa.gov.au/Search/Member?id=7377&type=member) | 2026-03-21 | 2026-03-21 | Y | Date Elected 21 March 2026; Electoral History 21 Mar 2026 - Current, Member, Legislative Council |
| Hilton Gumbys | [SA Parliament](https://www.parliament.sa.gov.au/Search/Member?id=7380&type=member) | 2026-03-21 | 2026-03-21 | Y | Date Elected 21 March 2026; Electoral History 21 Mar 2026 - Current, Member, Legislative Council |
| Rebecca Hewett | [SA Parliament](https://www.parliament.sa.gov.au/Search/Member?id=7376&type=member) | 2026-03-21 | 2026-03-21 | Y | Date Elected 21 March 2026; Electoral History 21 Mar 2026 - Current, Member, Legislative Council |
| Carlos Quaremba | [SA Parliament](https://www.parliament.sa.gov.au/Search/Member?id=7379&type=member) | 2026-03-21 | 2026-03-21 | Y | Date Elected 21 March 2026; Electoral History 21 Mar 2026 - Current, Member, Legislative Council |
| Melanie Selwood | [SA Parliament](https://www.parliament.sa.gov.au/Search/Member?id=7378&type=member) | 2026-03-21 | 2026-03-21 | Y | Date Elected 21 March 2026; Electoral History 21 Mar 2026 - Current, Member, Legislative Council |
| Mira El Dannawi | [SA Parliament](https://www.parliament.sa.gov.au/Search/Member?id=7122&type=member) | 2023-10-17 | 2023-10-17 | Y | Date Elected 17 October 2023; Electoral History 17 Oct 2023 - Current, Member, Legislative Council |
| Benjamin Hood | [SA Parliament](https://www.parliament.sa.gov.au/Search/Member?id=7056&type=member) | 2023-03-07 | 2026-11-13 | N | Date Elected 07 March 2023; Electoral History 07 Mar 2023 - Current, Member, Legislative Council |

## Date discrepancy for the orchestrator

**Benjamin Hood:** the member page (id 7056, displayed name Ben Hood; full name Benjamin (Ben) Robin Hood) gives 7 March 2023 for election and continuous current Council service. The accepted profile holds **13 November 2026**, the official-list observation date. It already documents a hold because six May 2023 speeches printed B.R. Hood were filed under D.G.E. Hood's id. This task leaves the placeholder, profile years and attribution unchanged. Do not describe the placeholder as a primary-confirmed election date. Resolving the existing speech attribution and changing his start remain with the orchestrator.

## Acquisition and archive

Fetched only `www.parliament.sa.gov.au`, sequentially with User-Agent `opax-improve-audit`, at least 1.1 seconds between request starts, with redirects disabled and no retries. No refusal or challenge occurred. One initial guessed biography route returned an ordinary 404; the repository's existing `/Search/Member` route then returned all seven primary pages with HTTP 200. No APH, ParlInfo, Wikidata, search-engine, ECSA or other host requests were made.

Pages and response metadata are outside the repository in `~/opax-work/evidence/im-sa-council-evidence/`. `review.json` records each person, URL, exact stated and held dates, match result, original secondary source, fetch timestamp and response hash. Each `member-<id>.meta.json` includes response status, headers, URL and SHA-256. The fetch helper and the initial 404 response are retained there too.

| Member | Archived page | SHA-256 |
| --- | --- | --- |
| Cory Bernardi | `member-7377.html` | `994cfebecdfc9c4f0d79ff44e89d2910780c89f16cd23fb2a98781f5e8e83686` |
| Hilton Gumbys | `member-7380.html` | `5f9b2ac2c07ddc76e2e3c129b1b6752eb81e5129eb0ee6295ba0307346ec1a43` |
| Rebecca Hewett | `member-7376.html` | `8812c8192f5cdb04776ea0c37fcb5f4e94a2fecb8fd176828859573d451df78e` |
| Carlos Quaremba | `member-7379.html` | `09d741a588c9e864f50ac8e6c62be78841f509dc513b8ade6623a521c718d357` |
| Melanie Selwood | `member-7378.html` | `1dbfff97b57e832118fbc97ba54bb1d134317e2ffcb6a103cf3bdbc4691e857c` |
| Mira El Dannawi | `member-7122.html` | `6b512483fe658c989ead36e1dd2ebeaadcbe05951a21d5b11d32bc6b63d9c53b` |
| Benjamin Hood | `member-7056.html` | `207347d02bf44bb7552309ee0d233526397dacdaa1e8bfb781638e260e955bda` |

## Regression coverage and gates

`scripts/test_roster_evidence.py` checks every accepted record/new-row evidence reference, its shared evidence URL and secondary sources, and all published person URLs. A single-person Wikidata entity or SA Parliament member record cannot belong to more than one member. It canonicalises wiki/entity URL spellings and query strings. The six reviewed primary/secondary source identities are also pinned by member id and Wikidata id, catching a unique citation to the wrong person as well as reuse. Whole-chamber list records can still be shared.

- Before execution, `cat /proc/loadavg` showed load5 about 25 (below 40); no load wait was needed. The Node rerun started with load5 about 16.
- `node --test --test-concurrency=4 test/*roster*.test.mjs test/*person*.test.mjs` from `portal/`: **105 passed, 0 failed, 0 skipped**. The first run had 104 passes and one failure because this fresh worktree lacked ignored search shards. `node scripts/build_search_catalog.mjs` rebuilt them offline, reproduced the tracked manifest exactly, and the full named Node suite then passed.
- `python3 scripts/roster_accept.py --check`: **842 groups applied, 25 new rows, 7 dropped rows; 0 problems**.
- The new evidence and source-profile tests passed **26/26**. Separate temporary-fixture checks rejected a shared single-person Wikidata URL in an evidence fallback and a unique incorrect primary member URL.
- All seven archived primary pages passed SHA-256 and stated-date checks (`page-verification.json`). A structured comparison with the branch base confirms every accepted start/end is exact and the published roster differs only in Bernardi's Council `source_url`.
- `git diff --check`: passed.
- `python3 -m pytest -q -p no:cacheprovider scripts/test_roster*.py tests/test_roster_profile_reconciliation.py tests/test_state_roster*.py`: **177 passed, 14,182 subtests passed**, no failures or skips, in 536.47 seconds. This includes both frozen full-export replay scenarios.

Logs are outside the repository beside the saved pages: `python-gate.log`, `node-gate.log`, `node-gate-rerun.log`, `search-build.log`, and `regression-check.log`.
