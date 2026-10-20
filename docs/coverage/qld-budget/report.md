# Queensland 2026–27 budget papers: held acquisition

Checked **21 October 2026 Melbourne** (20 October UTC), in `coverage/qld-budget`, based on `445c325ec31b7d058b596de888b27cb26b0dd648`. **Inventory staged; data held.** No original CSV bytes were acquired, so there are zero source rows and zero tidy observations. No Queensland web table, public asset, search entry or MCP record has been created. No push, deploy, nightly, KB or D1 write.

## Access and licence finding

The [receipt ledger](../../../data/staged/qld-budget/receipts.json) contains **13 sequential GETs: eight HTTP 200s and five HTTP 302s**. Robots was first, followed by the two datasets, five resource pages and one request for each exact original CSV URL. All requests used `OPAXBot/1.0 (+https://opax.com.au/about; corrections@opax.com.au)`, no proxy and no automatic redirects. Minimum completion-to-next-request spacing was **10.100100 seconds**. There were **no 403s, challenges, resets or timeouts**. Historical publisher QA 403 metadata is not an OPAX refusal.

All five exact original downloads returned **302**. Four captured `Location` values point under `/ckan-opendata-attachments-prod/`, which the robots rule `Disallow: /ckan-*-attachments-*/` excludes. **No redirect target was requested.** The initial BP3 dictionary/notes redirect target was not captured by the first receipt implementation; it remains unknown. That original was not requested again. No other agent, proxy, archive, Firecrawl, DataStore, API, cached-copy substitute or bulk endpoint was used. Only successful robots/dataset/resource HTML is retained privately; redirect bodies were hashed and discarded. Receipt hashes are response hashes, **not CSV file hashes**.

Both dataset pages and every resource page explicitly state [Creative Commons Attribution 4.0](https://creativecommons.org/licenses/by/4.0/). This is an applicable dataset/resource grant, not an inference from a government-wide default. The terms URL is `https://creativecommons.org/licenses/by/4.0/`. Attribution retained per resource: “© The State of Queensland 1995-2026. Queensland Treasury, [published resource title]. Source: [dataset URL]. Snapshot: [UTC time]. Licensed under CC BY 4.0.” This is the OPAX attribution wording, using the publisher’s footer and resource title; the pages do not prescribe a separate dataset-specific formula.

**File-specific rights review is incomplete:** neither dictionary nor either notes file could be read. No exception or numerical basis is assumed absent. Every file stays held, including both data CSVs. The published `not-updated` cadence belongs to each fixed annual vintage; no nightly loader is added.

## Five-resource inventory

The [machine-readable inventory](../../../data/staged/qld-budget/inventory.json) retains exact dataset, resource and original download URLs, resource-page receipts, download-response receipts, all published column labels, licence evidence, unknown row counts and null file hashes. Columns below are **resource-page metadata**, not verified CSV headers. All have format **CSV** and budget vintage **2026–27**.

| Paper / published resource | Resource UUID | Columns from resource metadata | Source row count / file SHA-256 |
| --- | --- | --- | --- |
| BP3 · [Capital Statement - Budget Paper 3 (2026-27)](https://www.data.qld.gov.au/dataset/2026-27-state-budget-budget-paper-3-capital-statement/resource/aa894f86-6f57-4e81-8f95-8c1541bcd819) | `aa894f86-6f57-4e81-8f95-8c1541bcd819` | Portfolio; Agency; Asset Type; Header 1; Header 2; Header 3; Project Name; SA4 Name; Total Estimated Cost; Expenditure to 30-06-26; Budget 2026-27; Post 2026-27; Latitude; Longitude | Unknown / unavailable; held after 302 |
| BP3 · [Data Dictionary and Explanatory Notes, Capital Statement, Budget Paper 3 (2026-27)](https://www.data.qld.gov.au/dataset/2026-27-state-budget-budget-paper-3-capital-statement/resource/bb5d4369-f12b-4f1a-80f0-60325565a710) | `bb5d4369-f12b-4f1a-80f0-60325565a710` | Column; Type; Description; Explanatory Notes | Unknown / unavailable; held after 302 |
| BP4 · [Budget Measures, Budget Paper 4 (2026-27)](https://www.data.qld.gov.au/dataset/2026-27-state-budget-budget-paper-4-budget-measures/resource/1eb033d0-a344-4c24-821a-96fc0a0d57fa) | `1eb033d0-a344-4c24-821a-96fc0a0d57fa` | ID; Report Title; Section; Department; Measure; 2025-26 ($'000); 2026-27  ($'000); 2027-28  ($'000); 2028-29  ($'000); 2029-30  ($'000) | Unknown / unavailable; held after 302 |
| BP4 · [Data Dictionary, Budget Measures, Budget Paper 4 (2026-27)](https://www.data.qld.gov.au/dataset/2026-27-state-budget-budget-paper-4-budget-measures/resource/da5e8180-1ab7-407d-a01e-f38d35f2db99) | `da5e8180-1ab7-407d-a01e-f38d35f2db99` | Column; Type; Description | Unknown / unavailable; held after 302 |
| BP4 · [Explanatory Notes, Budget Measures, Budget Paper 4 (2026-27)](https://www.data.qld.gov.au/dataset/2026-27-state-budget-budget-paper-4-budget-measures/resource/28333519-6495-4055-9662-c23889518030) | `28333519-6495-4055-9662-c23889518030` | Explanatory Note Type; Description | Unknown / unavailable; held after 302 |

BP3 data metadata distinguishes lifetime **Total Estimated Cost**, **Expenditure to 30-06-26**, **Budget 2026-27** and **Post 2026-27**. These are different periods/bases; neither lifetime cost nor post-budget expenditure is treated as a single fiscal year. BP3 units remain unverified until its dictionary is accessible. BP4 data metadata lists **2025–26 to 2029–30**, in **$'000**; dictionary definitions, section/type values, published controls and source row counts remain unverified. Dictionaries and notes themselves have no verified fiscal-year content.

The BP4 dataset description says new decisions since the **2025–26 Budget**; its principal resource description says **2025–27 Budget**. Both descriptions are retained. The discrepancy is unresolved; it is not silently corrected or used to infer values.

## Download receipts

| Resource UUID | HTTP | Response UTC | Response SHA-256 |
| --- | --- | --- | --- |
| `aa894f86-6f57-4e81-8f95-8c1541bcd819` | 302 | 2026-10-20T22:09:58.309887+00:00 | `ef7871c7be88c3ef0a237302d3634175c9979a8a918dc02a1c75b6fb2878a1fb` |
| `bb5d4369-f12b-4f1a-80f0-60325565a710` | 302 | 2026-10-20T22:09:05.290836+00:00 | `635451072ea14628b215bdf124f50e0d1a82422827385b24d3bae2594e420319` |
| `1eb033d0-a344-4c24-821a-96fc0a0d57fa` | 302 | 2026-10-20T22:10:08.566789+00:00 | `369f6e248ffaf9b15dee8eff6601f85b60a055ddc9a052b66d22795a6aac4806` |
| `da5e8180-1ab7-407d-a01e-f38d35f2db99` | 302 | 2026-10-20T22:09:37.395893+00:00 | `e7a27fc5107b73abc1516eb46be2e46d154c1e18f972ad7f0d0b76bfe443b9b5` |
| `28333519-6495-4055-9662-c23889518030` | 302 | 2026-10-20T22:09:48.070137+00:00 | `2cf66824ca57d16252c2d5fceab73aceb093a0e0bcd1d660fad6350bc71865dc` |

## Staging, reconciliation and surfaces

`series.jsonl` is empty. [Reconciliation](../../../data/staged/qld-budget/reconciliation.json) explicitly records **not-run**, with no checks or sums: no original values or published total rows are available. No totals, fiscal amounts, measure-type mapping, location joins or private-person entities have been inferred from metadata. No held material reaches the page, CSV export, search catalogue or `/mcp`; existing portal source/public assets remain byte-identical to the lane base.

The federal hub’s document rights/receipt joins, `projection()` and server-rendered shared DataTable are the reuse path. Once authorised original access and file notices are resolved, extend **`/budget`** with a separately labelled Queensland vintage, capital program by published agency and measures by published portfolio/type. BP3 describes capital planning/projects; BP4 describes new policy measure impacts. ABS GFS is a separate statistical series of government finances, with different classifications, consolidation and revision bases. No new top-level budget system or empty numerical surface is created in this held lane.

Any future publication must use **`scripts/promote_hub_data.py`**, with an explicit reviewed annual opt-in and exact reviewed input hashes, like ABS GFS and tax expenditures. The held inventory has no `hub.json`, approved review or promoter registration. Existing promoter defaults and nightly are unchanged. [App plan only](app-plan.md).

## Validation

Validation results and artifact hashes are recorded in [validation.json](validation.json). The required CSV parser fixtures, numerical reconciliation, two-table 390/1440 fitting, and file-licence projection tests are **not run / not implemented** because no official CSV or definitions were accessible. Offline tests cover the actual held-source gate, robots wildcard decisions, refusal/challenge persistence, no automatic redirects, one-request-only behaviour and absence of held inputs from public consumers.

Screenshots in `portal/private/qld-budget/budget-baseline-390.png` and `budget-baseline-1440.png` show the **unchanged federal `/budget` baseline**, from the local Worker and existing public asset. They do not demonstrate Queensland table rendering. No production Ask, generation, voice or auth route was driven. Source acquisition is finished and all five files remain held.
