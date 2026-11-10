| Dataset or binding audited at `afee1d28e` | Existing Ask registry reach | Existing additional MCP / KB reach | Gap and lane action |
|---|---|---|---|
| `bills/` | `find_records(kind=bill)`, `count_records`, `division` bill links | KB bill text through `search_records`, `read_record` | Federal lifecycle already exposed; retain it |
| `bills-act/`, `bills-tas/` | None; the catalogue builder only loads `bills/` | No state-bill detail handler | Add legislation list and detail |
| `instruments/` | `kind=instrument` is accepted, but the catalogue builder adds no instrument records | No detail | Add metadata search and decoded detail |
| `budget/` | None | No budget KB route identified | Expose 805 aggregates and cleared document links; measure lines absent |
| `sa-budget/` | None | None | Expose 447 published historical cells |
| `tax-expenditures/` | None | None | Expose published Treasury cells, retaining suppression markers |
| `government-finance/` | None | None | Expose balance-sheet and function cells with dimensions |
| `gov-advertising/` | `campaign_spend`, plus `find_records` campaign fallback | Same registry | Expose all five row kinds, detail and pagination |
| `sa-grants/` | None; `grants` covers federal and Queensland | None | Expose cleared award rows |
| `vic-gifts/` | None | None | Expose published gifts with missing values preserved |
| `suppliers/`, `suppliers.json` | `contracts`; `find_records(kind=supplier/contract)` | Same registry | Add explicit profile identifiers, contract detail and cross-record joins |
| `agencies/`, `agencies.json` | `contracts`; `find_records(kind=agency)` | Same registry | Add profile detail |
| `entities/tax-charity/` | None | None | Add ABN-based tax and charity detail |
| `evidence/` | None | `find_connections` searches index names only | Add bounded evidence excerpts and source links |
| `graph/money*.json`, `donor-index.json`, `donor-disclosures.json` | `money_totals`, other Ask money tools; `find_records` donor/receipt entries | Same registry | Add explicit supplier-to-donor profile connections |
| `graph/grants.*.json`, `grants/` | `grants` summaries, table rows and `find_records` | `read_grant_recipient`, `read_grant_program` | Already exposed; reuse authoritative identity joins |
| `graph/campaigners.json` | `find_records(kind=campaigner)` through catalogue builder | Same registry | Already discoverable |
| `graph/aec-extras.json` | No registry reader; limited debt-basis handling in `ask-money.ts` outside registry | No direct tool | Party-return headlines and latest creditor details remain a gap |
| `graph/party-members.json`, `party-speeches.json` | No direct tool | None | Derived party membership and speech summaries; underlying people and speech tools exist |
| `growth/` (`donors.json`, `agencies/`, `sponsors/`) | No direct loading; derived donor/agency/bill-sponsor discovery modules | None | Derived views; underlying registers already exposed |
| `years/` | No direct tool; Ask searches speeches instead | None | Published generated year briefs and ranked voices remain a documented gap |
| `mixed-speakers/` | Ask speech presentation and attribution helpers, outside registry | Public resource presentation | Attribution correction metadata, not an independent dataset |
| `reports/` | Catalogue loading gated by reports flag | App-only JSON allowance; reports disabled in config | Respect existing publication gate; do not expose disabled reports |
| `audit/` | `find_records(kind=audit report)` title/metadata only | Same registry | Recommendation bodies remain a gap |
| `research/` | MLCI invitations and analysis in catalogue; grant-location/history helpers indirect | KB research slugs and grant material | Existing limited reach; no new research-analysis claims |
| `electorates/` | `electorates`, grant electorate loaders | Same registry | Already exposed |
| `divisions/`, `votes.json` | `division`, `count_records`, Ask member votes | `read_record` division detail | Already exposed |
| `interests/` | `declared_interests`, `find_records` | Same registry | Already exposed |
| `expenses.json`, `expense-categories.json` | `member_expenses`, catalogue expense summaries | Same registry | Already exposed; expenses were not a gap |
| `pay.json` | `parliamentary_pay`, catalogue pay | Same registry | Already exposed |
| `parliamentarians.json`, `speakers.json` | Ask people tools and registry validation | `person_quotes` roster | Already exposed |
| `access.json`, `fits.json` | `find_records(kind=access)` via catalogue | Same registry | Already discoverable |
| `corpus.json` | Ask coverage outside registry | `corpus_coverage` | Existing coverage; use its warnings |
| `ask-statute-titles.json` | Bill-title resolution helper | Indirect | Code-owned helper outside this lane |
| `discovery.json`, `suggestions.json`, `profile-links.json`, `seo-links.json` | Navigation and identity links, some catalogue pages | Indirect | Derived navigation, not new source data |
| `search-catalog/` | `find_records` reads manifest and generated token/record shards | `search_records` unified search | Only manifest present in checkout; generated release shards are not checked in |
| `data/held-back-transcripts.json`, `data/chair-role-transcripts.json` | Speech attribution/holdback policy | Public resource policy | Controls; never promote held-back text as evidence |
| `seo/`, `social/`, `video/` | Catalogue sitting/video and derived discovery where built | Unified search | Derived presentation; no independent financial register |
| `chunks/`, `fonts/`, `photos/`, `voice-assets/`, HTML/CSS/JS/SVG and root assets | Presentation assets | Presentation assets | Not source datasets |
| `ASSETS` (portal production and staging) | Every registry asset loader | Registry and public routes | Static JSON is the principal public source |
| `TABLE_DB` D1 (portal production and staging) | `contracts`, `grants` through in-process table API | Same registry and public table API | Includes instrument table, previously unreachable through registry |
| `COMMUNITY_DB` D1 | No citizen-record retrieval | MCP authentication, limits; Ask monitoring/budgets | Operational/member data, not public source records |
| `GENERATION_CACHE` KV | Ask cache, no dataset tool | Indirect cached public routes | Operational cache, not a register |
| `ARAG_KB_ID`, `ARAG_KB_TOKEN`, `ARAG_ZONE` | Ask `search`, `find_quotes`, speech counts and resource reads outside registry | Separate `search_records`, `read_record`, `person_quotes` | Add shared corpus search/detail for Hansard, releases and committee turns |
| R2 / Vectorize (portal config) | No bindings declared | None | No binding to expose |
| `STAGING_API` service | Staging forwards document search to portal | Public-route forwarding | Routing adapter, not another corpus |
| `enrich.DB` D1, `enrich.AI`, KB secrets | No portal access to enrichment queue | None | Operational enrichment state; published output goes to KB |

# Ask r3 data report

Audit: local source, asset shapes, catalogue builder, tool handlers and both Wrangler configs. No production requests, local harness or evals. The audit preceded implementation and stayed within the 30-minute cap. The baseline report and failing `politician.said`, `trend.year_debates` and state-register examples were inspected read-only.

Added four tools, bringing the shared registry from 11 to 15 entries. `TOOL_REGISTRY_VERSION` is `structured-tools-7-public-records`. Ask receives its existing read-only KB adapter through the registry; MCP receives a small adapter restricted to `/find` and whitelisted public speech/release slugs. No generation endpoint, credential or arbitrary URL is exposed to callers. The existing MCP tools remain available.

| New tool or selection | Data reached | Example call | Example returned row |
|---|---|---|---|
| `corpus_records` speeches | Original KB speech bodies; member, subject, machine-topic label, jurisdiction and inclusive date filters | `{"kind":"speech","query":"housing","speaker":"David Shoebridge","since":"2026-10-01"}` | Unit fixture: `record_id=speech-1`, speaker David Shoebridge, date 2026-10-09, excerpt “Housing requires sustained public investment.”; citation points at the fixture original. This is a shape example, not a claim about a live speech. |
| `corpus_records` releases | Existing public `press-pmt/nsw/qld/vic/tre-*` KB bodies | `{"kind":"press_release","query":"energy"}` | Same bounded row shape: release slug, title, collaborator where established, date, verbatim source-body excerpt and original source URL. No live KB request was made. |
| `corpus_records` committee | Federal committee turns in the KB, including witnesses | `{"kind":"speech","query":"gambling","venue":"committee"}` | Unit witness fixture returns `speaker=null`, witness attribution, committee chamber and source-body excerpt; it is not assigned to an MP. |
| `legislation` state bills | 262 ACT and 157 Tasmania registry records before the existing serving checks | `{"kind":"state_bill","jurisdiction":"tas","query":"Conversion Practices"}` | `au-tas-2026-45`, Conversion Practices Prohibition Bill 2026 (45 of 2026), Dr Rosalie Woodruff MP, introduced 2026-09-10, before Parliament, observed 2026-10-14. |
| `legislation` instruments | 24,106 exported in-force FRL titles, compact index and decoded source chunks | `{"kind":"instrument","query":"Housing Australia"}` | `F2023L01466`, Housing Australia Future Fund Investment Mandate Direction 2023, Finance portfolio, InForce; original `https://www.legislation.gov.au/F2023L01466/latest`. |
| `public_finances`, `federal_budget` | 805 aggregate cells plus cleared source-paper metadata | `{"dataset":"federal_budget","query":"net debt","financial_year":"2025-26"}` | Net debt 620345 AUD million, estimate, BP1 release 2025-26, Table 9.2, PDF p.280; the paper URL accompanies the row. `view=documents` lists cleared original papers. |
| `public_finances`, `sa_budget` | 447 reviewed historical SA cells | `{"dataset":"sa_budget","query":"operating balance"}` | Net operating balance, fiscal year 2013-14, actual, -1071 AUD million, 2015-16 Budget vintage, `SOKGGSBI!B6`. |
| `public_finances`, `tax_expenditures` | 2,444 Treasury revenue-forgone cells before serving checks | `{"dataset":"tax_expenditures","query":"election candidates"}` | A1, deduction for expenses incurred by election candidates, 2021-22, 3 AUD million, `Revenue forgone estimates!C2`. |
| `public_finances`, `government_finance` | 3,906 finance cells and 4,340 function cells before serving checks | `{"dataset":"government_finance","query":"education"}` | School education operating expenses, all levels of government, Australia, general government, 2015-16, 46744 AUD million; original workbook, sheet and cell retained. |
| `public_finances`, `advertising` | 1,239 rows across all five advertising row kinds | `{"dataset":"advertising","query":"campaign","financial_year":"2024-25"}` | Victorian Government campaign advertising, category row, 7,630,000,000 cents, source value $76.3 million, excluding GST; not an additional campaign-cost total. |
| `public_finances`, `sa_grants` | 677 reviewed Grants SA awards | `{"dataset":"sa_grants","query":"Aboriginal Legal Rights"}` | Aboriginal Legal Rights Movement, AVS Child and Young People Justice project, $19,828, 2016-17, Statewide, original CSV row 2. |
| `public_finances`, `vic_gifts` | 282 rows in three reviewed ministerial register periods | `{"dataset":"vic_gifts","entity":"Jacinta Allan"}` | Victorian Racing Club 2025 2026 (Complimentary), giver Victorian Racing Club, Premier, February-June 2026 register; date and estimated value remain null. |
| `entity_profile` supplier/agency | Published directories, detailed contracts, buying agencies, suppliers and explicit federal funding links | `{"kind":"supplier","query":"Thales Australia Limited"}` | `s-7beabf1d435fa3f04dbd`, ABN 66008642751, $9,926,396,799.80 across 1,020 contracts. Follow `section=receipts`: Labor $88,032 across five receipt records; these are disclosed receipts, not necessarily gifts. |
| `entity_profile` connection | Audited entity index and evidence shards | `{"kind":"connection","record_id":"9711b04a397f288fa1502b1e","section":"evidence"}` | Woollahra Colleagues Rugby Union Football Club, `mentions`, dated source excerpt, source ID and an explicit provenance status. Missing original URLs are not presented as available. |
| `entity_profile` tax/charity | ABN-only ATO, ACNC statements and charity registration shards | `{"kind":"tax_charity","record_id":"18151340608"}` | 2024-25 corporate tax row: total income $270,656,218, taxable income $5,342,647, tax payable $1,602,794; original ATO dataset resource URL. Payable is not paid. |

Every list row contains a follow-up identifier or arguments. For example, `legislation({kind:"state_bill",record_id:"au-tas-2026-45",jurisdiction:"tas"})` opens its stages and held-document links, and `public_finances({dataset:"sa_grants",record_id:"v20261020234500-0"})` opens the first row in that exact export snapshot. Financial IDs are deliberately snapshot-scoped so an old ID cannot silently select a changed row after an export refresh. Source stages carry their own citations. Dataset or register links are labelled as provenance when an individual source-record URL is absent.

Search limits are at most eight rows (five for corpus search), default five (three for corpus search). Corpus search performs one ranked lookup and at most six original-record reads, returning only source-body text. Named-member speech excerpts are restricted to the first speaking turn; ambiguous roster names do not widen the search. Detail provides at most 4,000 characters with text offsets; SA Hansard is limited to 120 words and cannot page through the body. Other nested metadata is bounded, with a full-record pointer. Final results are limited to 14,000 UTF-8 bytes to leave room inside Ask's 16 KiB result cap. Oversized lists return a continuation offset.

Remaining gaps and reasons:

- Federal budget measure lines: the export advertises `measure_count=2347`, but contains no measure rows. The tool exposes aggregates and cleared paper links and explicitly says it cannot retrieve individual measure lines. Acquiring or publishing those lines is outside a loader-only change.
- Other state bill sets: no other state bill exports are present. Federal bill lifecycle and vote tools remain available, with no changes to bill-title/date code.
- `years/` briefs and voices, `growth/` and party speech summaries: these are generated/editorial views, not original record bodies. They remain outside the new tools; the baseline's year-review capability still needs a dedicated, clearly labelled reader if the lead wants those generated summaries used as evidence.
- Queensland Audit Office recommendation bodies remain unexposed; title discovery already exists. Committee material present in the KB is covered by `corpus_records`, rather than conflating audit recommendations with hearings.
- AEC extra party-return/creditor detail is not added. Existing receipt totals cover the principal money questions; debt stocks need a separate, precise basis and must not be described as new loans.
- Reports remain gated off (`REPORTS_ENABLED=false`); the app JSON compatibility exception does not authorise making disabled reports generally discoverable.
- Operational KV/D1/enrichment data and rendering assets are not public citizen-record datasets. No R2 or Vectorize binding exists in either Wrangler config.

Data defects and limits observed:

- Most newly exposed snapshots are from October 2026; ACT status lists include an earlier 1 October status date. A snapshot date is not a current-status guarantee.
- The SA budget is specifically the 2015-16 Budget vintage. SA grants cover only 2016-17 and 2017-18, with five unavailable original files recorded as holds. Held cells with unclear scales remain excluded.
- Federal budget measure counts have no matching public measure array. Several documents/portfolio links are metadata only; the tool does not claim to have their text.
- Instrument manifest: 24,113 source titles, 24,106 exports and seven unresolved source gaps. In-force status includes instruments not yet commenced; the version slice is not complete history.
- Victorian gifts often omit individual dates, values and actions. They remain null, never zero or inferred from the register period.
- Advertising totals, categories and campaign-cost lines overlap and use different reporting grains and GST bases. They are returned as separate source rows and never added together.
- Evidence excerpts sometimes lack original URLs. Some AusTender links lead only to the source register, and some grant links lead only to the dataset; those limitations are explicit. Profile contract and grant listings can be partial even where their published aggregate summaries are complete.
- The corpus manifest records transcription joins, thin mid-2022 to mid-2025 federal Hansard coverage and incomplete topic labels. Original text is used for quotes; machine summaries never fill a missing source body. No remote corpus health or freshness claim was made.
- Search catalogue release shards are generated and absent from this checkout. New static-register tests use actual checked-in assets directly, so they do not require building the catalogue or contacting production.

Validation:

- `npm run typecheck`: pass. Local Wrangler type generation was required because this worktree initially lacked the ignored `worker-configuration.d.ts`; no config or generated type file is committed.
- `node --test test/public-record-tools.test.mjs`: 60/60 pass. Every new dataset selection has a happy path using real public asset shapes, an empty result, invalid input rejected before a read, and citation checks. KB tests use the repository's resource fixture shape, with no network access.
- Existing registry, bill lifecycle and authenticated MCP checks were run together with the new tests: the first combined run passed 99/99. Three additional robustness cases were subsequently added and passed in the final new-tool run and full suite.
- `npm test` was run once after implementation: 4,233 tests, 4,163 pass, 67 fail, three skipped, approximately 116 seconds. All 60 new tests passed in this run. The full gate is not clean in this checkout.
- Full-suite failures include missing ignored `search-catalog/752b21989ec4cc16/*`, `crawl/*` and `hubs/*` release outputs. Their dependent search, sitemap, navigation and route assertions fail with unavailable data. Python-backed GFS, SA budget and Victorian advertising tests also lack `openpyxl`. No release outputs, dependencies, unrelated tests or fixtures were changed to mask these failures.
- Two model-budget assertions (`null !== 'spent'` and no outbound request) were checked independently using the unchanged source and tests extracted from base `afee1d28e`, sharing the same assets and dependencies. Both failures reproduce on the base; its third model-budget test passes. This was a unit-test comparison, not a local Ask harness or eval run.
- `git diff --check`: pass. No local harness, research evals, question/grader edits, production requests, pushes, rebases, merges or deployments.

The lead still owns the post-merge 150-question gate. This lane does not claim that gate, live corpus freshness, or all full-suite failures have been independently classified against the base.
