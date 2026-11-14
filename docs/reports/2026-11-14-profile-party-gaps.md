# Person-profile party gaps, 14 November 2026 (audit F8, P2)

Implementation: `e0584b22cd9096e80436563e6b3a83ccc7bee48a`. Baseline: `00150690c` on `im/party-gaps`, branched from `origin/main`. All measurements use the local read-only SQLite snapshot, the committed exports and a local Wrangler on `127.0.0.1:8918`. No production requests, SSH, production writes or messages. Counts and the complete per-profile classification are in [the audit ledger](2026-11-14-profile-party-gaps.json); public source facts are in [the reviewed evidence](../../scripts/roster_party_evidence.json).

## Measurement

The baseline has **616** of **1,565** exported profiles with no `party`, `party_now` or `parties`. Existing dated seat and chamber-list fallbacks supply **152** of these: **123** seat matches and **29** chamber-list matches. That leaves **464** without a rendered party. After this change, raw blanks are **586**, while profiles without a party after the dated fallbacks are **430**. The difference is the existing **152** fallbacks plus **four** newly exported partial service histories. Both full local HTML crawls cover **1,567** profiles, including **two** reference-only profiles, and have zero status or rendering errors. The audit checks HTML against the same helpers the app uses. [Ledger](2026-11-14-profile-party-gaps.json), [app helpers](../../portal/public/roster-party.js).

The unit below is one exported profile, not a member or a chamber membership. A profile spanning jurisdictions is counted once under Multiple. Zeros describe this export, not complete coverage of a parliament. Each cell is before → after. Classes describe the baseline cause and stay fixed for the comparison. [Ledger](2026-11-14-profile-party-gaps.json).

| Jurisdiction | Raw party blanks | (a) Held party, missing join | (b) Identity, no single party held | (c) Unresolved print | (d) Explicit Independent | HTML gaps |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Federal | 60 → 56 | 4 → 0 | 0 → 0 | 56 → 56 | 0 → 0 | 60 → 56 |
| ACT | 1 → 1 | 0 → 0 | 0 → 0 | 1 → 1 | 0 → 0 | 1 → 1 |
| NSW | 270 → 244 | 25 → 0 | 125 → 122 | 89 → 89 | 2 → 0 | 241 → 211 |
| NT | 0 → 0 | 0 → 0 | 0 → 0 | 0 → 0 | 0 → 0 | 0 → 0 |
| Queensland | 3 → 3 | 0 → 0 | 0 → 0 | 3 → 3 | 0 → 0 | 3 → 3 |
| South Australia | 19 → 19 | 0 → 0 | 0 → 0 | 19 → 19 | 0 → 0 | 19 → 19 |
| Tasmania | 0 → 0 | 0 → 0 | 0 → 0 | 0 → 0 | 0 → 0 | 0 → 0 |
| Victoria | 181 → 181 | 0 → 0 | 6 → 6 | 52 → 52 | 0 → 0 | 58 → 58 |
| Western Australia | 0 → 0 | 0 → 0 | 0 → 0 | 0 → 0 | 0 → 0 | 0 → 0 |
| Multiple | 82 → 82 | 0 → 0 | 0 → 0 | 82 → 82 | 0 → 0 | 82 → 82 |
| **Total** | **616 → 586** | **29 → 0** | **131 → 128** | **302 → 302** | **2 → 0** | **464 → 430** |

For raw-field accounting, the ledger assigns the already-working **152** fallbacks to (a): raw (a) is **181 → 155**, (b) **131 → 129**, (c) **302 → 302**, (d) **2 → 0**. Only **29** of (a) were rendered gaps. The four remaining raw blanks among the repaired profiles carry explicitly dated `affiliations` and display the period, without an undated `party` fallback. [Ledger](2026-11-14-profile-party-gaps.json).

## Repairs and sources

All **29** actionable (a) gaps are fixed. The missing export path did not join full printed names to Wikidata's held P39 service terms and their P4100 parliamentary groups. Four federal profiles also lacked the held Handbook party join. The source join now operates before the roster accept check, including when the raw SQL export loses or folds a print. It supplies only reviewed party fields; the existing overlay keeps the shipped identity and speech counts. The real local SQL export reproduces all **34** accepted repairs. [Join](../../scripts/roster_party_gaps.py), [accept list](../../scripts/roster_accept.json), [replay test](../../scripts/test_roster_party_gaps.py).

Class (b) fills are **Adam Searle**, **James Griffin** and **Leslie Williams**. Their Wikidata P102 statements supply explicit membership boundaries, intersected with the full-name, dated service in the same house already held in the state roster. Undated P102 membership, ambiguous Coalition labels, absent dates and namesakes remain held. Williams receives only the sourced Liberal period from 20 September 2020 to 31 January 2025; no party is invented for the preceding interval. [Searle](https://www.wikidata.org/wiki/Q4679743), [Griffin](https://www.wikidata.org/wiki/Q29386045), [Williams](https://www.wikidata.org/wiki/Q6531238), [extracted facts and input hashes](../../scripts/roster_party_evidence.json).

**Jihad Dib**, **Sophie Cotsis** and **Tamara Smith** also receive dated service records without an undated party. Dib's earlier seat has no party qualifier; Cotsis's earlier Council term has none; Smith's profile also contains a Council chamber for which this source supplies no service. Their own-house dated facts reach the app and server without extending to those other periods or houses. No chamber, profile, identifier, speech count or printed name is removed. [Dib](https://www.wikidata.org/wiki/Q19872872), [Cotsis](https://www.wikidata.org/wiki/Q7562979), [Smith](https://www.wikidata.org/wiki/Q19879144), [evidence](../../scripts/roster_party_evidence.json).

Class (d) is **Judy Hannan** and **Michael Regan**. Held P39/P4100 records explicitly say independent. Only these source-labelled gaps become `Independent`. The other unresolved profiles retain the honest `Party not recorded`. [Hannan](https://www.wikidata.org/wiki/Q117319799), [Regan](https://www.wikidata.org/wiki/Q21062491), [evidence](../../scripts/roster_party_evidence.json).

The new source acquisition used Wikidata's existing entity API only: seven batches containing **155** public roster identities and one party-label request, paced at least **1.1 seconds** apart with user agent `opax-improve-audit`. The held Handbook cache was read offline. No APH website or ParlInfo fetch occurred. An undistricted Council service record retains an empty seat field while its party and dates remain visible. The extracted source facts and response SHA256 hashes are committed; the unfiltered responses and names in the HTML crawl remain under ignored `dev/party-gaps/`. [Evidence and response hashes](../../scripts/roster_party_evidence.json), [offline builder](../../scripts/build_roster_party_evidence.py).

## Class (c) list and remaining evidence limits

Every one of the **302** class (c) entries is listed in the audit ledger with a SHA256 profile key, jurisdiction, before/after state and reason. No unresolved or private name is added to this report or the ledger. Keys hash the folded roster name with dots replaced by spaces, allowing local reconciliation with the export. [Complete list](2026-11-14-profile-party-gaps.json), [audit script](../../scripts/audit_profile_party_gaps.mjs).

The reasons are **264** surname or initials prints without a safe full-name identity, **30** full prints without a verified overlapping service identity in the reviewed sources, and **eight** committee-only prints with no verified parliamentary identity. The committee-only entries should not be asserted to be parliamentarians solely from testimony; they need an identity/attribution review before exclusion from the parliamentary directory. The other entries need resolution before a person-level claim or deletion is justified. All are retained, as requested. The **128** remaining (b) gaps need stronger party or date evidence; an empty party and an undated membership do not establish Independent. [Ledger](2026-11-14-profile-party-gaps.json).

Open Wikidata terms are observations through their recorded source date, not a new census of current members. Handbook party records without dates remain recorded affiliations without invented party periods. Existing current-member and official-roster fallbacks retain priority. The change preserves **1,565** exported profiles and **669,898** attributed speeches. [Roster](../../portal/public/parliamentarians.json), [evidence](../../scripts/roster_party_evidence.json).

## Reproduction and validation

```sh
# Keep snapshots and crawl output ignored: they can contain private names.
mkdir -p dev/party-gaps
git show 00150690c:portal/public/parliamentarians.json > dev/party-gaps/before.json
PY=.venv/bin/python OPAX_ROSTER_ACCEPT=1 bash scripts/vm/export_people.sh > dev/party-gaps/raw.json
# From portal/, use local bindings only:
npx wrangler dev --local --port 8918 --ip 127.0.0.1 --var INDEXNOW_ENABLED:false --var INDEXNOW_DRY_RUN:true
# From the repo root, with the matching before/after assets installed:
node scripts/measure_profile_parties.mjs http://127.0.0.1:8918 dev/party-gaps/html-after.json
node scripts/audit_profile_party_gaps.mjs dev/party-gaps/before.json portal/public/parliamentarians.json dev/party-gaps/audit.json
python3 scripts/roster_accept.py --check
```

The initial load5 was **17.28**. Required gates started below **40**; new gates waited while load5 exceeded that limit. Results below are the locally observed command output, retained under ignored `dev/party-gaps/`.

| Gate or check | Final result |
| --- | --- |
| Roster, identity, overlay, state-roster, vote-party and speech-hygiene Python suites | **271 passed, 14,219 subtests passed** |
| Real weekly export wrappers, isolated, original deadlines | **4 passed, 5 subtests passed**, 596.01 seconds |
| Final source/overlay/preservation tests after the empty-seat refinement | **76 passed, 942 subtests passed** |
| `python3 scripts/roster_accept.py --check` | **876 applied groups; zero problems** |
| Local SQL export replay of the new joins | **34/34** match the committed profiles, including the empty seat |
| Local HTML crawls plus app-helper parity | **1,567/1,567** each, **zero errors**; **464 → 430** gaps |
| Local Council page after the empty-seat refinement | **200**, dated party present, no internal chamber-code placeholder |
| `npx wrangler types`, then `npx tsc --noEmit` from `portal/` | **Pass** |
| `npm test -- --test-concurrency=4` from `portal/`, final isolated full run | **4,907 passed; zero failures; zero skips**, 278.63 seconds |
| `npm run build:search` and direct `node scripts/build_crawl_catalog.mjs` | **Pass**, local generated assets prepared |
| `node scripts/stamp_assets.mjs --check` | **Pass**; helper imports carry content hashes within the existing header-rule budget |
| `git diff --check`, identity/count/field diff review | **Pass**; only party fields and dated affiliations change on **34** profiles |

Earlier attempts are not counted as passes. The first portal attempt had **94 failures** before missing generated assets and stamps were prepared. Subsequent full attempts had **eight failures** (stale party-count/coverage/source-shape expectations plus infrastructure timeouts), then **two** existing directory-deadline failures under load. The final full run above passes with unchanged deadlines. Earlier Python attempts exposed malformed-entry handling, an isolated-fixture import and a new-test typo; all were corrected before the successful roster run. A concurrent wrapper replay exceeded its existing **300-second** scenario-A deadline; the isolated replay passes both scenarios with that deadline unchanged. Initial TypeScript compilation lacked the generated Wrangler types; compilation passes after generating them.

The required Python coverage is reproduced with:

```sh
uv run --with pytest --with pytest-subtests pytest -q \
  scripts/test_roster_fold.py scripts/test_roster_identity.py \
  scripts/test_roster_main_preservation.py scripts/test_roster_overlay.py \
  scripts/test_roster_party_gaps.py scripts/test_roster_source_profiles.py \
  scripts/test_roster_state_parties.py scripts/test_roster_witness_split.py \
  scripts/test_export_parliamentarians.py tests/test_roster_profile_reconciliation.py \
  tests/test_state_roster_pagination.py tests/test_state_rosters_party.py \
  tests/test_vote_parties.py parli/tests/test_speech_hygiene.py
# Run the slower wrapper gate alone on this shared host:
uv run --with pytest --with pytest-subtests pytest -q scripts/test_roster_export_wrappers.py
```

Acceptance review:

- Measurement and classification: complete, with counts by class and jurisdiction and full HTML/app-data parity in the ledger.
- (a): all **29** rendered join gaps repaired; the source/overlay replay reproduces every new field.
- (b): **three** sourced fills; undated or ambiguous evidence remains held.
- (c): all **302** entries listed by stable key with reasons; all profiles retained.
- (d): **two** explicitly sourced Independent records; blanks are never converted by default.
- Tests: full-name/house/date joins, conflicting identities and parties, `T Smith` and `Katter` refusals, dated switches, partial histories, source-only replay and raw/rendered count guards all pass.

The remaining **430** gaps require additional identity, party or date evidence within the source restrictions. No production action or device run was performed. The local Wrangler was stopped after verification.


## Review correction, 14 November 2026

Correction implementation: `c421a078288a683193e5c9a22ee70b1331b79400`. The review authorises publishing `im/party-gaps` to origin after the gates. This correction uses the held cache only, with no new source requests. The source input hashes are unchanged. [Evidence](../../scripts/roster_party_evidence.json), [builder](../../scripts/build_roster_party_evidence.py).

| Review item | Result | Regression that detects the reverted fault |
| --- | --- | --- |
| 1. Open membership end | James Griffin has `end: null` and `through: 2026-11-14`; the observation is displayed without an end date. | Python `test_open_membership_has_observation_but_no_end`; portal `an open membership renders an observation while a closed service keeps its end` |
| 2. Observation wording | Jihad Dib reads `service record 2023-03-25, observed through 2026-09-21`. The helper keeps `service_end` separate from `service_through`; server and browser use the observation wording. | Portal `a partial source party reaches server and app with its service dates` |
| 3. Council district | The generic Council district label is empty, while real Council regions remain available. | Python `test_generic_council_district_is_empty_but_real_regions_remain` and builder integration test |
| 4. Council end | Bronnie Taylor's held, non-deprecated P39 Council statement has the exact start `2015-03-28` and end `2024-09-16`. The exported affiliation closes on that date. A different house or start cannot supply it. | Python `test_builder_uses_held_term_end_and_cleans_council_district` and `test_held_service_end_requires_same_position_and_exact_start` |
| 5. Year-only end | A year-only membership end uses 1 January as its exclusive boundary. A 2025 end therefore labels no day after 31 December 2024. Year-only starts retain the conservative 31 December bound. | Python `test_year_only_membership_end_never_widens_the_period` |

The source for the Council end is held Wikidata statement `Q19879829$3fd85273-4dc0-78f4-8d94-4e0b0eaa336b`, from the same cached response already hashed in the evidence. No last-speech date is used as a service end. [Source identity](https://www.wikidata.org/wiki/Q19879829), [extracted statement and dates](../../scripts/roster_party_evidence.json).

The isolated regression checks restore each fault in memory and observe an assertion failure. Both the helper's observation-as-end fault and the server's old end-date wording are detected independently. The working source files are unchanged by those checks. [Python regressions](../../scripts/test_roster_party_gaps.py), [portal regressions](../../portal/test/profile-party-gaps.test.mjs).

Compared with the original baseline, the export still changes exactly **34** profiles, solely in `party`, `parties` and `affiliations`. This correction changes **two** of those exported profiles and their existing accept groups; unrelated accept groups are unchanged. The local SQL replay reproduces all **34** reviewed profiles. Profile and speech counts remain **1,565** and **669,898**. The table above and the complete audit ledger are unchanged: raw blanks **616 → 586**, HTML gaps **464 → 430**. A fresh local crawl covers **1,567** profiles with **zero** errors; direct local HTML checks also verify all three named examples. [Roster](../../portal/public/parliamentarians.json), [accept list](../../scripts/roster_accept.json), [unchanged ledger](2026-11-14-profile-party-gaps.json).

Correction output is retained in ignored `dev/party-gaps/review-*.log` files. The correction started at load5 **21.56**. The Python roster, wrapper and portal gates started at **16.15**, **15.32** and **37.50**, respectively, all below **40**. Running gates finish if load subsequently rises. Load5 rose above 40 during the portal run; no further gates started until it fell below 40 again.

| Correction gate or check | Result |
| --- | --- |
| Full Python roster selection listed above | **276 passed, 14,219 subtests passed**, 123.32 seconds |
| Isolated export-wrapper suite, original deadlines | **4 passed, 5 subtests passed**, 557.60 seconds |
| Focused portal party/profile suites | **15 passed** |
| `npx tsc --noEmit` from `portal/` | **Pass** |
| `npm test -- --test-concurrency=4` from `portal/` | **4,908 passed; zero failures; zero skips**, 355.37 seconds |
| Accept-list check | **876 applied groups; zero problems** |
| Asset-stamp check | **Pass** |
| Real local SQL export replay | **34/34** reviewed profiles match |
| Fresh local HTML crawl and app-data parity | **1,567** profiles, **430** gaps, **zero** errors; unchanged ledger |
| Direct local HTML checks | **Pass** for Griffin, Dib and Taylor; local Wrangler stopped |
| Isolated fault restoration | **Five review items detected** by assertion failures; control passes |
| Original-baseline profile/count/field comparison | **34** changed profiles; party fields only; names and speech counts preserved |

An initial focused portal invocation used an unavailable `tsx` loader and exited before running tests. The repository's normal `node --test` command passes the focused suites; no dependency or deadline was changed.

Final `git diff --check` passes. The correction and validation report are committed locally before the authorised branch push. No production action or message was sent; the local Wrangler is stopped.

## One owner for Q6207887 (14 November 2026)

Two of the 34 profiles, "Jodi McKay" and her spelling twin "Jodi Mckay", carried joins to the same Wikidata person (Q6207887), which the roster evidence-ownership guard refuses. The twin is now folded into Jodi McKay: one profile, 428 speeches, the same dated Labor service, and "Jodi Mckay" as a print whose old address redirects to her. Her accept group is the single owner, so 33 accept groups now cover the same 34 reviewed profiles. The exported roster has **1,565** rows; raw blanks stay **586** and gaps after the dated fallbacks stay **430**, because the folded row already had a party. The ledger above records the original 34-profile comparison and is unchanged. [Fold note](../ROSTER-FOLDS.md), [guard](../../scripts/test_roster_evidence.py).

## Partial histories and the roster-period audit (14 November 2026)

Two partial histories start after the member's first own-house record: Jihad Dib's Labor period from 2023-03-25 (Bankstown; his 2015 to 2023 Lakemba term has no party group in the held Wikidata service) and Leslie Williams's Liberal period from 2020-09-20 (Port Macquarie, held since 2011). `scripts/audit_roster_periods.py` now also inventories the dated house service each installed join was read from (`party-evidence/<identity>/<house>/<start>`, 31 terms, all with a corpus bound), so each partial history is a documented later period inside that service rather than an unexplained late start. Dib's Bankstown term is documented the same way. [Exceptions](../../scripts/roster_period_exceptions.json), [test](../../scripts/test_roster_periods.py).
