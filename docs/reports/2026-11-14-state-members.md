# State electorate members: baseline and delivery report

Baseline recorded before code changes from the local read-only OPAX database and published electorate release `9e281b4ef4edbd38` (generated 2026-11-12). Raw snapshots and acquisition evidence are outside the repository in `~/opax-work/evidence/im-state-members/`. No database writes or production requests were made.

The review-round results at the end supersede the initial delivery counts and provenance labels.

## Baseline

| Jurisdiction | House | Current electorates | Member places | Filled on pages | Held dated open people | Held matched electorates | Held matched people |
|---|---|---:|---:|---:|---:|---:|---:|
| act | act_la | 5 | 25 | 0 | 0 | 0 | 0 |
| federal | representatives | 150 | 150 | 150 | 0 | 0 | 0 |
| federal | senate | 8 | 76 | 8 | 0 | 0 | 0 |
| nsw | nsw_la | 93 | 93 | 0 | 90 | 89 | 90 |
| nsw | nsw_lc | 1 | 42 | 0 | 29 | 0 | 0 |
| nt | nt_la | 25 | 25 | 0 | 0 | 0 | 0 |
| qld | qld_la | 93 | 93 | 0 | 96 | 77 | 79 |
| sa | sa_ha | 47 | 47 | 0 | 47 | 41 | 44 |
| sa | sa_lc | 1 | 22 | 0 | 19 | 0 | 0 |
| tas | tas_ha | 5 | 35 | 0 | 0 | 0 | 0 |
| tas | tas_lc | 15 | 15 | 0 | 0 | 0 | 0 |
| vic | vic_la | 88 | 88 | 88 | 74 | 73 | 73 |
| vic | vic_lc | 8 | 40 | 8 | 36 | 0 | 0 |
| wa | wa_la | 59 | 59 | 0 | 0 | 0 | 0 |
| wa | wa_lc | 1 | 37 | 0 | 0 | 0 | 0 |

The audit headline includes statewide Council constituencies in NSW, SA and WA, and Tasmania's Council divisions. Lower-house electorates and member places are reported separately above.

The snapshot script reads `members` and `electorate_demographics` only. `Builder.legacy()` constructs federal observations; `Builder.victoria()` constructs Victorian observations. Neither imports `ext_state_roster`. The exporter correctly reads only the bundle's dated roster observations, so none of the held state roster rows can reach these pages.

Held Wikidata rows are term and party bindings, not one row per current person. Duplicate bindings must be collapsed by person and seat. An undated term cannot establish current membership. Even dated open terms can be stale, including people at more than one seat or more people than a seat allows. They need explicit conflict review, and must retain their original observation date.

Exact normalised district matching below ignores case, apostrophe forms and hyphens, and expands the whole token Mt to Mount. It does not guess renamed or missing electorates.

- `act_la`: no eligible held match for Brindabella, Ginninderra, Yerrabi, Kurrajong, Murrumbidgee; unmatched held districts: none; over-capacity matches: {}.
- `nsw_la`: no eligible held match for Castle Hill, Holsworthy, Dubbo, Kellyville; unmatched held districts: none; over-capacity matches: {"epping": 2}.
- `nsw_lc`: no eligible held match for New South Wales; unmatched held districts: (missing), Legislative Council district of New South Wales; over-capacity matches: {}.
- `nt_la`: no eligible held match for Port Darwin, Sanderson, Braitling, Araluen, Wanguri, Karama, Spillett, Namatjira, Casuarina, Arafura, Drysdale, Nelson, Katherine, Arnhem, Mulka, Goyder, Daly, Gwoja, Fong Lim, Brennan, Barkly, Johnston, Fannie Bay, Blain, Nightcliff; unmatched held districts: none; over-capacity matches: {}.
- `qld_la`: no eligible held match for Capalaba, Stafford, Sandgate, Townsville, Gregory, Bundaberg, Mackay, Burleigh, Hervey Bay, Keppel, South Brisbane, Mirani, Thuringowa, Redcliffe, Barron River, Maryborough; unmatched held districts: (missing); over-capacity matches: {"ipswich west": 2, "mulgrave": 2}.
- `sa_ha`: no eligible held match for Mount Gambier, Stuart, Light, Schubert, Torrens, Florey; unmatched held districts: (missing), Frome; over-capacity matches: {"colton": 2, "mackillop": 2, "playford": 2}.
- `sa_lc`: no eligible held match for South Australia; unmatched held districts: (missing); over-capacity matches: {}.
- `tas_ha`: no eligible held match for Braddon, Clark, Lyons, Franklin, Bass; unmatched held districts: none; over-capacity matches: {}.
- `tas_lc`: no eligible held match for Huon, Pembroke, Derwent, Nelson, Prosser, Murchison, Rumney, Launceston, Windermere, Elwick, Hobart, Montgomery, Rosevears, Mersey, McIntyre; unmatched held districts: none; over-capacity matches: {}.
- `wa_la`: no eligible held match for Balcatta, Armadale, Forrestfield, Darling Range, Maylands, Belmont, Mount Lawley, Scarborough, Southern River, Fremantle, Kimberley, Collie-Preston, Bicton, Riverton, Girrawheen, Bibra Lake, Baldivis, Bunbury, Rockingham, Thornlie, Bateman, Joondalup, Pilbara, Swan Hills, Albany, West Swan, Mid-West, Kalamunda, Roe, Cannington, Mandurah, Oakford, Dawesville, Bassendean, Midland, Cottesloe, Cockburn, Carine, Kwinana, Butler, Warren-Blackwood, Central Wheatbelt, Nedlands, Mindarie, Landsdale, Perth, Vasse, Kingsley, Morley, Kalgoorlie, Geraldton, Victoria Park, Jandakot, South Perth, Murray-Wellington, Wanneroo, Hillarys, Churchlands, Secret Harbour; unmatched held districts: none; over-capacity matches: {}.
- `wa_lc`: no eligible held match for Western Australia; unmatched held districts: none; over-capacity matches: {}.

Person links require a unique full-name or reviewed-alias match within the same jurisdiction. Surname-only and ambiguous names cannot justify an identity join. The held roster QIDs can supply stable identities when the person catalog has no matching profile.

State contest timelines remain outside this change. Empty state contest arrays describe missing coverage. State division party labels are also outside this change.

## Initial delivery, superseded by review round 1

Published local release `d2423b2d3f8ba6f6`. The table uses the audit's electorate inventory, including upper houses. A filled electorate has at least one named member; the NSW Council is partial.

| Jurisdiction | Electorates | Filled before | Filled after | Still empty | Reason |
|---|---:|---:|---:|---:|---|
| ACT | 5 | 0 | 5 | 0 | None |
| NSW | 94 | 0 | 89 | 5 | Five Assembly seats lack an unambiguous held row; official list refused |
| NT | 25 | 0 | 0 | 25 | Official list refused; no held roster |
| QLD | 93 | 0 | 93 | 0 | None; retained the held official list date |
| SA | 48 | 0 | 48 | 0 | None |
| TAS | 20 | 0 | 20 | 0 | None |
| WA | 60 | 0 | 0 | 60 | Official list refused; no held roster |

Lower-house member places count every ACT and Tasmanian Assembly member separately:

| Jurisdiction | Electorates | Member places | Filled before | Filled after | Unfilled, reviewed |
|---|---:|---:|---:|---:|---:|
| ACT | 5 | 25 | 0 | 25 | 0 |
| NSW | 93 | 93 | 0 | 88 | 5 |
| NT | 25 | 25 | 0 | 0 | 25 |
| QLD | 93 | 93 | 0 | 93 | 0 |
| SA | 47 | 47 | 0 | 47 | 0 |
| TAS | 5 | 35 | 0 | 35 | 0 |
| WA | 59 | 59 | 0 | 0 | 59 |

The release names 366 members across 255 formerly empty electorates. Ninety electorates remain empty with reviewed exceptions. The separate NSW Council exception records 41 listed members against capacity 42; it does not assert a vacancy. All 327 lower-house electorates either have their required members or an exact reviewed exception. ACT has five members per electorate; Tasmania's Assembly has seven. The exceptions include no invented members or start dates.

NSW's empty Assembly electorates are Castle Hill, Dubbo, Epping, Holsworthy and Kellyville. Epping has conflicting held open-term claims. The others have no matching eligible held term. WA and NT have no held roster in this local database.

### Source observations

- ACT, SA and Tasmania: official lists fetched on 14 November 2026 in Australia/Sydney, with UTC response instants and source SHA-256 digests retained. Every imported member has a full name, the supplied party label, electorate, house, observation date and source URL. A separate `party_canonical` uses existing OPAX rules for links and grouping; source labels are unchanged. ACT and Tasmania list every member of each multi-member electorate. SA includes both houses; Tasmania includes its Council divisions.
- Queensland: the already-held official member photosheet observation of 2 June 2026, covering every Assembly electorate. It takes precedence over newer open Wikidata terms because those can still name former members. No fresh verification is claimed.
- NSW Assembly: non-conflicting dated open terms from OPAX's held Wikidata roster, observed on 21 September 2026. Missing parties remain unknown. These observations are not a claim of fresh official verification.
- NSW Council: the already-held official list dated 25 September 2026, retained as a partial observation.

The main builder now imports the state observations. Database snapshots carry `ext_state_roster` when present, with pinned OPAX bindings available for offline replay. The standalone updater reads only local inputs, logs every unresolved electorate and identity join, and exports a reproducible release. Person links use existing unique full-name or reviewed-alias identities where available; ambiguous identities retain a distinct source identity rather than guessing. The public person-path index and party membership projection were rebuilt to include reference-only members. No speeches were attributed or legacy database records changed. The new rosters are explicitly marked `observation_only`, and the historical speech enrichment routines skip them.

`data/state-members/join-audit.json` retains 109 join diagnostics: 35 ambiguous person identity; retained separate source identity, 68 no electorate match, 6 roster exceeds capacity. Many diagnostics concern superseded Wikidata rows, not gaps in the final official lists. All official member rows found an electorate.

### Refusals

All requests used User-Agent `opax-improve-audit`; acquisition was sequential and throttled. Refusal bodies and all successful raw responses are under `~/opax-work/evidence/im-state-members/`, outside the repository. Each refused jurisdiction was stopped without trying another endpoint or host.

| Jurisdiction | Requested list | Result | Response SHA-256 |
|---|---|---|---|
| NSW | https://www.parliament.nsw.gov.au/members/Pages/all-members.aspx | HTTP 403 | `85caf85dc14f64b9b8ba03f552fd5b22ecdd1b14cab782be937dce96da05cbcc` |
| QLD | https://www.parliament.qld.gov.au/Members/Current-Members | HTTP 403 | `1a857f35d68f91e3c6bc7302ec30dde4468a7aac38bc60055e6ac508fc8f6034` |
| WA | https://www.parliament.wa.gov.au/Parliament/Memblist.nsf/WAllMembersFlat | HTTP 403 | `a0e49aebfc7ea7d964d2ec97d1ee4e12c91ca75236db92961d41e3f8f2efb3bb` |
| NT | https://parliament.nt.gov.au/members | HTTP 403 | `3f12c72b1865d1be372febf39582a617e39467cd31217cb40a189c8780ba6c2f` |

Tasmania returned ordinary page-not-found responses before its linked current member directories and spreadsheets were fetched successfully. SA's Assembly page embeds its public contact directory; the directory configuration identifies the member-list API used here. No challenge was worked around.

### Protected output

All 96 Victorian and 184 federal electorate detail files are byte-identical to release `9e281b4ef4edbd38`, including their original immutable detail URLs. Their index summary bytes and exported person rows are identical too. The new release includes identical copies for consumers reading a single release. The Census tool reads those copies; its independent gold fixture changes only the release identifier.

SHA-256 over each jurisdiction's canonical sorted mapping of detail filename to file SHA-256:

- vic: `8b4e9f4d9a92351ccbfeba17ba80a793aa9f20d6bb815135b3a4fbaabbe08726`.
- federal: `f7d1a4a05634db2e3dd9b862426a5fcbfdfdf84e97dffb46b0dba4bf7627f39c`.

`data/state-members/parity.json` also records summary and person-row digests. `test_victorian_and_federal_detail_summary_and_people_bytes_are_unchanged` compares the actual bytes; export aborts if a protected detail differs.

### Scope observations

F20 remains open: the state electorate contest arrays are unchanged. Current-member lists do not supply election timelines or service start dates. F9 remains open: official current-list party labels vary by parliament and source, including abbreviations and branch names. This change preserves them and does not alter state division labels.

### Acceptance and gates

- Measurement before code: committed as `f824594e6515e7873ad3c59eec3e44992a10e8f2`; initial base `00150690c7c7b8b8f1888a29c805c0090d6cbcce`.
- Dated joins and official gap filling: local release above, with all raw evidence retained outside the repository and reviewed exceptions for refused or unresolved seats. Full fresh official coverage of every jurisdiction is not achieved because NSW, Queensland, WA and NT refused acquisition.
- Complete multi-member lists, exact normalisation, no duplicate current seats, sources and protected bytes: covered by Python tests and rendered portal checks.
- No production writes, pushes, messages, APH/ParlInfo requests or SSH commands were made. Commits remain local on `im/state-members`.

| Gate | Result |
|---|---|
| Initial `cat /proc/loadavg` | Five-minute load 6.96, below 40. New heavy checks waited when shared load exceeded 40. |
| Roster/electorate Python checks on the final data and lookup rules | 192 passed, 77 subtests passed. Includes coverage/exceptions, normalisation, sources, multiple-seat rejection, offline replay, party-label preservation and protected bytes. |
| Extended Python roster/replay suite | 283 passed, 14,198 subtests passed. Includes the large witness-split replay; current-only observations do not alter historical speech attribution. |
| `npx tsc --noEmit` from `portal/` | Passed. Worker types were generated locally with `npx wrangler types`. |
| `npm test -- --test-concurrency=4` from `portal/` | 4,906 passed, zero failed, one skipped, across 4,907 tests. |
| Focused electorate, roster-party and directory regressions | 74 passed, zero skipped. Queensland interest-link checks also passed. |
| `python3 scripts/vm/validate_data.py electorates` | Passed; release files match manifest digests. |
| `node scripts/stamp_assets.mjs --check` | Passed. |
| `git diff --check` | Passed. |

Earlier trials identified missing generated Worker types and local assets, preserved-URL reader compatibility, party lookup consistency and current observations leaking into historical enrichment. These were corrected and rerun. An early Python trial also lost an intermediate release during cleanup; the successful replay held its inputs fixed. Raw logs remain outside the repository with the acquisition evidence.

The remaining limitation is source access: NSW and Queensland retain the held observation dates above, while WA and NT remain empty. No refusal was bypassed. State timelines and division party labels remain outside scope; the division-party projection is unchanged.


## Review round 1, 14 November 2026

Reviewed implementation base: `747459809b152556b8f9dd3239fa264dd12b2528`. Local electorate release: `99e8ac162f6c3fdd`. No new source requests were made in this round. All acquisition refusals remain in force.

The first delivery incorrectly named the holder of an open pre-2023 Hornsby term. The new NSW rule withdraws unsupported claims. NSW Assembly seats named fall from 88 to 29. Every surviving member has a held seat term starting on or after 25 March 2023, satisfying rule (a). `data/state-members/nsw-assembly-review.json` lists all 93 seats and the surviving names, QIDs, term dates and source URLs.

Rule (b) admits no seats. The read-only local `parli.db` has no NSW election/by-election item table, its analysis cache has no election entries, and the retained state-member evidence contains no complete by-election check or 2023 seat-win dataset. `reviews.json` explicitly marks that coverage as not held. An empty events array is never interpreted as no by-elections. This is an exception reason, not an assertion about what elections actually occurred. No new Wikidata or parliament fetch was substituted.

Hornsby remains empty: its old term starts in 2011, while the prospective successor's held rows have neither district nor start date. Epping remains empty because its two open seat claims conflict. Wahroonga remains empty as requested: its held row starts on 25 March 2023 and meets rule (a), but the review disputes current membership and held evidence cannot settle that concern. No resignation or replacement is asserted. All remaining unsupported seats have exact reviewed exceptions.

| Jurisdiction | Electorates | Filled before original work | Initial delivery | After review | Still empty |
|---|---:|---:|---:|---:|---:|
| ACT | 5 | 0 | 5 | 5 | 0 |
| NSW | 94 | 0 | 89 | 30 | 64 |
| NT | 25 | 0 | 0 | 0 | 25 |
| QLD | 93 | 0 | 93 | 93 | 0 |
| SA | 48 | 0 | 48 | 48 | 0 |
| TAS | 20 | 0 | 20 | 20 | 0 |
| WA | 60 | 0 | 0 | 0 | 60 |

The current release names 307 members across 196 electorates. There are 149 empty electorates and one partial NSW Council, making 150 reviewed exceptions. ACT retains all 25 members, five per electorate. Tasmania retains all 35 Assembly members, seven per electorate, and 15 Council members. NSW Council retains its dated 41-member observation; its unfilled capacity is not asserted to be a vacancy. Victoria and federal detail files, index summaries and exported person rows remain byte-identical to the baseline, covering 280 detail files.

| Review item | Result and evidence |
|---|---|
| P1, stale NSW terms | Done. All 29 named Assembly members carry exported `current_evidence` for rule (a). Rule (b) requires a held seat win and complete dated check; missing evidence cannot pass. Over-capacity claims are rejected before eligibility filtering. The Hornsby-shaped regression combines an old open term with a null-district, undated successor. |
| P2, verification language | Done. All imported observations export `listed` or `partial`, never `verified`. Source/date provenance reaches the directory, electorate profile, person rows and server metadata. The wording is "Listed as at <date>, from <source>". Protected federal/Victorian output is unchanged. |
| P3, gap explanations | Done. Every reviewed exception is exported on its electorate. Empty pages explain "The current member list is not held: the official list refused access." The partial Council explains that the complete list is not held. Future-date queries retain their separate unknown-date wording. |
| P3, Tasmanian Council date | Done. The dated source URL identifies 25 August 2026, which is now the list date. The original 14 November retrieval instant and the separate directory cross-check remain retained. No service start date is created. |
| P3, SA whitespace | Done. Preferred and legal names collapse whitespace in parsing; all four affected Council display names and additional legal-name aliases are normalised. |
| P3, surname profile links | Done. Read-only `members` and indexed `speeches` queries are summarised in `reviews.json`. `qld_martin` has 66 database speech rows, `qld_lee` 54, `qld_smith` 179, `sa_brown` 241 and `qld_field` 39. Those state IDs are narrower than the public surname profiles: Martin, Lee, Smith and Brown have multiple jurisdictions and identities, so all four are unlinked on electorate pages and directory rows. Field has a reviewed own-house service scope matching the database and retains its link. Reverse person lookup also excludes blocked profiles. No historical speech attribution was changed. |
| P3, cross-jurisdiction IDs | Follow-up recorded. The existing roster aliases are name strings scoped by jurisdiction, and cannot express person-ID equivalence across jurisdictions. `reviews.json` records the six requested pairs: Bridget Archer, Gavin Pearce, Brian Mitchell, Michael Ferguson, Janelle Saffin and Nick Champion. Their links already share names, but IDs are not merged; doing so would change protected federal person rows. |

F20 state timelines and F9 division party labels remain unchanged. Raw evidence and gate logs are outside the repo under `~/opax-work/evidence/im-state-members/`, with this round's filenames prefixed `review-1-`.


### Review-round regression and gate evidence

The implementation at `747459809b152556b8f9dd3239fa264dd12b2528` was copied to an isolated evidence directory, with the new regression tests and current data. The working checkout was not reverted. Four Python tests fail against that implementation: the stale open term plus null-district successor, observed status/provenance, dated-document provenance, and SA whitespace. Three browser tests also fail: listing provenance across views, refusal explanations, and mixed surname links. All seven fail on their intended behavioural assertions. Logs are `review-1-revert-python.log` and `review-1-revert-browser.log`.

| Gate | Result |
|---|---|
| Initial `cat /proc/loadavg` | Five-minute load 23.30. Full checks waited while load was above 40; the full Python gate started at 37.06 and the portal gate at 30.93. |
| `.venv/bin/python -m pytest -q tests/test_state_members.py` | 46 passed. |
| Roster/electorate Python gate, the same focused modules as the first delivery | 199 passed, 77 subtests passed. Includes normalisation, NSW evidence rules, exceptions, all multi-member seats, no duplicate current seats, offline replay, historical attribution guards and protected bytes. |
| `npx tsc --noEmit` from `portal/` | Passed. |
| `npm test -- --test-concurrency=4` from `portal/` | 4,910 passed, zero failed, one skipped, across 4,911 tests. The existing workflow execution test skips because PyYAML is unavailable; its static workflow checks passed. |
| Focused portal checks at concurrency four | 83 passed, zero failed or skipped. Includes directory/profile/person/server provenance, exceptions, links, party count parity and Census reader compatibility. |
| `python3 scripts/vm/validate_data.py electorates` | Passed. |
| `node scripts/stamp_assets.mjs --check` | Passed. |
| `git diff --check` | Passed. |

The first TypeScript trial needed the new helper's declaration. An initial server test expected an HTML rewriter stub to transform the shell; it now tests the actual server metadata. Stamping also exposed the existing header-rule limit; the small provenance helper uses the default short cache, like the date formatter, while the electorate entry module remains content-stamped. Corrected checks passed. No division-party projection changed.
