# Electorate foundation for OPAX

Design and rollout plan, 9 September 2026. The initial registry, representation model, federal election timelines and electorate pages are implemented. See [ELECTORATE_REFERENCE.md](ELECTORATE_REFERENCE.md) for the delivered scope, exact data coverage, refresh commands and consumer contract. Later stages below remain planned. The original design was based on a read-only audit of the code, committed portal exports and `desktop`'s `parli.db`.

Make an electorate a durable entity with a directory and subject page, joined to dated representation, elections, boundary versions and Census context. The foundation should answer **what is this electorate, who represents it now, who represented it before, and how has it changed?**

Scope revised at the user's direction: Jake owns the funding work in parallel. Funding ingestion, attribution, comparisons, grant/donor enrichment and funding UI are outside this workstream. The foundation publishes stable electorate and boundary identifiers, dated representation and election records that his work can consume independently. Funding readiness is not a release dependency.

## 1. What already exists

| Component | Audit finding | Consequence |
| --- | --- | --- |
| `electorates` | 302 rows: 151 federal result summaries for each of 2019 and 2022. Key is `(electorate_name, year)`. | This is an election-summary table, not an electorate register. It lacks election IDs, chambers, boundary versions and candidate results. |
| `postcode_electorates` | 2,358 mappings across all states/territories. No source/version/date columns. | Cannot establish the boundary vintage or quality of a mapping from this table alone. |
| `electorate_demographics` | 151 federal Census 2021 profiles. Population, income, unemployment, tenure, university and Indigenous indicators are populated in all 151 rows. | Useful enrichment, subject to checking indicator definitions and attaching the correct Census geography. |
| `members` | 2,682 rows. The export's federal current-member predicate selects 150 representatives and 76 senators. Other open-ended rows are not a current roster; all 124 QLD rows have no end date. | Reuse identifiers and verified current observations, but build proper seat tenures before presenting history. |
| `parliamentarians.json` | A speech-derived directory: five-speech minimum, names as URLs, 313 name entries flagged current in the committed export. | It contains aliases and omits people without sufficient indexed speeches. It cannot be the complete population of representatives. |

Evidence: [`aec_results.py`](../parli/ingest/aec_results.py), [`schema.py`](../parli/schema.py), [`export_parliamentarians.py`](../scripts/export_parliamentarians.py), [`DATA-MEMBERS.md`](DATA-MEMBERS.md), [`qld_parliament.py`](../parli/ingest/qld_parliament.py), and the committed [`parliamentarians.json`](../portal/public/parliamentarians.json). Database counts were queried on 9 September; the directory observations describe the committed export.

### Foundation problems to address

1. **Electorate names are being used as identity.** The existing result and demographic tables key by name/year. These cannot distinguish same-named seats across jurisdictions/chambers or preserve boundary versions and re-established electorates.
2. **Member dates are not seat tenures.** Existing imports commonly retain only the latest electorate. `DATA-MEMBERS.md` records approximate exit dates and erroneous historical entry dates. QLD's detail importer takes only the latest `Electorate` and `PoliticalParty` activity even though its source response has activity histories.
3. **The person directory depends on speech coverage.** A representative needs a page and an electorate relationship even before their first indexed speech. Several speech-name aliases can identify one person; joins need a canonical person key.
4. **The postcode mapping has no dated provenance.** It can suggest lookup candidates, but must be validated against a sourced geography before becoming a definitive lookup. The existing parser does not retain supplied ratios, and a fallback uses equal fractions over a hardcoded QLD list.
5. **Electorate is not yet a search facet.** ARAG speech exports put it in extra metadata. Search and Ask currently filter by speaker, party, state, topic and year, so electorate-scoped retrieval requires explicit indexing and query support.

## 2. The user experience

Add **Electorates** alongside Parliamentarians, Parties and Donors, using the existing `/subject/` navigation, directory renderer and shareable filters.

- Directory: `/subject/electorate`.
- Subject: `/subject/electorate/federal-house-qld-brisbane`, using a stored, unique slug. Internal identity is an opaque stable ID, not this name.
- A state electorate has a separate page and identifier even when its name matches a federal seat.
- Include all registered seats within the released geography coverage, even when OPAX has no speeches or election history for them.
- Show jurisdiction, chamber, current representative(s), party, latest election, historical coverage and a small boundary outline in the directory. Search names and aliases; postcode lookup returns all plausible seats rather than one guessed answer.

### Electorate page, in reading order

| Section | What the reader sees |
| --- | --- |
| Identity and representation | Name, parliament/chamber, state, map, current member(s) with person links, current party, verified-as-of date, and current/vacant/abolished status. An as-of control reveals historical representation without relabelling it current. |
| Representation and elections | Aligned timelines for members, party changes, elections/by-elections and boundary changes. Each election expands into candidates, votes, percentages, preferences, turnout and sources. |
| Local context | Population, age, income, unemployment, rent/ownership, education and other validated Census indicators, with Census year and geography vintage. |
| In parliament | Speeches and divisions of representatives during their verified service in this seat. Separate a later section for speeches explicitly about the place. |
| Related electorates | Federal/state/upper-house constituencies covering the area, plus predecessor and successor seats. |
| Sources and coverage | Dates checked, source links, missing years, approximation methods and historical boundaries. |

On a multi-member electorate, lead with **Representatives** and the elected party composition. Do not manufacture a single holder or a marginal/safe label. Statewide upper-house constituencies and Senate constituencies can use the same underlying model, with chamber-appropriate labels. A local lower-house page may link to its upper-house representatives, clearly labelled as a different constituency.

The directory should filter by jurisdiction, chamber, state, current/historical status, representative and party, with the selected as-of date reflected in the URL. Electoral history and Census downloads can be provided as JSON/CSV without requiring a funding interface. Empty states should distinguish an unfilled seat, missing source coverage and no indexed parliamentary material.

## 3. Identity, history and storage

Use additive `ext_*` tables in `parli.db`, consistent with the existing ingestion architecture. The following are logical table groups; migrations can split their child records without changing these contracts.

| Proposed table/group | Grain and essential fields |
| --- | --- |
| `ext_electorates` | One legal seat identity: `electorate_id`, unique `slug`, `jurisdiction`, `chamber`, `state_code`, `kind`, `name`, establishment/abolition dates and source. Seat capacity belongs to its dated configuration. |
| `ext_electorate_keys` / aliases | Source and scoped identifier/name → electorate, with validity dates. AEC, ABS and state commission codes are distinct namespaces. An ABS key includes geography vintage. |
| `ext_electorate_versions` | One boundary/configuration period: electorate, `boundary_version_id`, capacity, determined date, effective dates, first applicable election, CRS, source geometry, simplified display geometry and source checksum. |
| `ext_electorate_relations` | Dated renamed-from, predecessor/successor and spatial-overlap relationships. Preserve multiple predecessors and successors; spatial overlap is a distinct relationship from legal continuity. |
| `ext_people` / `ext_person_keys` | Canonical person identity and verified mappings to legacy `members.person_id`, parliamentary IDs and speaker aliases. Name-based public URLs remain supported as aliases. Unresolved mappings remain explicit. |
| `ext_representation_terms` | Person → electorate for a particular service interval, election/appointment that began it, start/end reasons, source, and date precision. Separate returning/non-contiguous service intervals. |
| `ext_person_party_periods` | Dated party affiliation, scoped to parliamentary service where necessary. Preserve party-at-election on candidacy separately. |
| `ext_elections` / contests | Election event → chamber/electorate contest, with actual poll date, general/by-election/supplementary type, boundary version, vacancies, voting system, final/provisional status and source. Year alone is not a key. |
| `ext_candidacies` / result rows | Candidate-in-contest, source candidate ID, optional verified person link, ballot/group order, party at election and elected status. Votes carry count type, round/stage, geography, vote type and denominator. |
| `ext_electorate_demographics` | Electorate geography vintage + reference year + indicator: value, unit, numerator/denominator where applicable, source and aggregation method. |

All imported facts carry source URL, source record key, fetched timestamp and source revision/checksum. Derived facts additionally carry the rule/method version and evidence keys. Preserve raw source files. Stage and validate a refresh before an atomic replacement scoped to the source **and election/period**; do not let an election refresh erase another election's history. Reuse `ExtWriter`/`ext_ingest_log` plumbing while preserving canonical identities across source refreshes.

### Identity and temporal rules

- A normal redistribution creates a boundary version, not automatically a new electorate. A renamed or re-established seat requires a source-supported identity/lineage decision; equal names do not prove continuity. Keep historical URLs usable.
- Keep boundary determination, electoral effective date, polling day and representative service dates separate. A proposed boundary must not change who is shown as representing the existing seat.
- Use half-open internal service/affiliation intervals (`start <= date < end`), normalising source date conventions. Unknown endpoints stay unknown with precision flags. A null end date means open-ended data, not verified current membership. Store independent dated current-roster observations.
- Derive current and historical party composition from service and party intervals. A defection changes party affiliation without inventing an election. An election winner is not necessarily today's holder.
- Do not derive exact tenure from the first/last speech, latest-member snapshots, or a broad first-service/last-service CSV. APH explicitly says its summary CSV omits gaps in service; biographies provide individual periods. [APH Handbook help](https://www.aph.gov.au/Help/Handbook_Online_Help).
- Keep candidate records even when they do not resolve to an OPAX person. Newly elected representatives get roster-backed person pages even before their first indexed speech.
- Permit multiple concurrent representatives up to the dated constituency capacity, including vacancies and replacements. Do not apply single-member overlap rules to Senate, ACT, Tasmanian Assembly or other multi-member contests.
- Store first preferences, TCP, TPP and preference distributions as different result types. Preserve raw counts and denominators, including exhausted votes where relevant. STV transfer values/counts may require decimal precision. A notional result on new boundaries is a distinct derived result, not a historical election.

## 4. Contract for Jake's parallel work

Publish this contract with the first registry export, so consumers can integrate before the full profile UI or historical backfill is finished. This design describes the intended contract; the implemented version-1 fields and lookup behaviours are documented in [ELECTORATE_REFERENCE.md](ELECTORATE_REFERENCE.md).

| Foundation output | Consumer contract |
| --- | --- |
| Electorate register | `electorate_id`, `slug`, canonical `url`, `name`, `jurisdiction`, `chamber`, `state_code`, `kind`, lifecycle dates and status. IDs remain stable across imports and ordinary redistributions. |
| Boundary register | `boundary_version_id`, `electorate_id`, effective interval, applicable election IDs, capacity, source URL/checksum, CRS and geometry asset reference. Determined/proposed boundaries remain distinguishable from effective boundaries. |
| Source-key crosswalk | `(source, source_id, geography_vintage, jurisdiction, chamber)` resolves to an electorate and, where applicable, a boundary version. Return `matched`, `ambiguous` or `unmatched`; include candidate IDs and evidence. Never silently choose the first name/postcode match. |
| Representation | `representation_id`, `electorate_id`, canonical `person_id`, service interval and precision, party periods, source and roster-verification date. Current membership is a verified observation, not just a null end date. |
| Election history | `election_id`, `contest_id`, `electorate_id`, `boundary_version_id`, poll date, final/provisional status, count types and candidate results. A latest-prior-contest lookup is scoped by electorate/chamber/date and explicitly reports missing coverage. |
| Release manifest | `schema_version`, `release_id`, generation timestamp, source/checksum references, coverage per jurisdiction/period and asset locations. Consumers can pin a reproducible release. |

Provide reusable offline lookups for source-key resolution, effective boundary at a date, representatives at a date and latest prior contest. Do not require a new hosted API for these functions; start with Python helpers and static exports. A later API can wrap the same contract.

An electorate can keep its ID while its boundaries change. Consumers retaining historical joins store both IDs and the foundation release they used. Source corrections retain canonical IDs; an actual identity merge/split publishes explicit redirects or replacement relationships rather than silently reusing an ID. Unknown service dates or boundary coverage remain explicit in lookup responses.

Jake's implementation owns funding records, monetary allocation methods, source reconciliation, comparisons and funding exports/UI. This proposal does not prescribe their schema or change their files. The foundation provides the reference records and canonical page URLs those features can link to. Electorate pages can accept a later independently loaded funding section without requiring it for rendering or release.

Keep `parli/ingest/grants.py`, `parli/ingest/grantconnect.py`, `scripts/grantconnect_details.py`, `scripts/export_grants.py`, `portal/public/grants.js` and grant assets outside this workstream. In shared routing/navigation files, make focused electorate additions so the two branches can merge without restructuring Jake's feature.

## 5. Enrichments within the foundation

| Priority | Enrichment | Existing foundation and implementation rule |
| --- | --- | --- |
| First release | Census context | Reuse the 151 profiles after checking definitions and matching their 2021 geography. Expand to state seats from ABS. Counts can sometimes be reaggregated using an appropriate correspondence; medians must not be averaged into new seats. |
| First release | Representative links | Canonical links to current and historical parliamentarians, with dated party affiliation and portraits where already available. Roster-only people need valid profiles and clear parliamentary-record coverage. |
| First release | Historical boundary context | Boundary outline, effective dates, redistribution events and source-backed predecessor/successor relationships. Keep source geometry separate from simplified display geometry. |
| Next | Representative speeches and votes | Resolve person + service dates + chamber. A member's whole career does not belong to their latest seat. Show coverage and link to existing person and division pages. |
| Next | Related electorates and geographic lookup | Compute federal/state/upper-house overlaps per boundary vintage. Postcode search yields candidates; an adequately precise point can resolve a seat. Return ambiguity at boundaries or where precision is insufficient. |
| Later | Local issues in the parliamentary record | Separate "said by this electorate's representatives" from "about this electorate". Place mentions need disambiguation for seat names that are also people, suburbs or other places. |

Existing expenses, interests and access material remains reachable through person pages. New direct organisation/funding relationships belong to the separate funding workstream.

## 6. Data sources and initial coverage

Build the schema for federal plus all eight state/territory jurisdictions. Release pages with explicit coverage; do not suggest all jurisdictions have the same speech, demographic or historical election coverage.

| Data | Initial source |
| --- | --- |
| Federal candidates and results | [AEC House downloads](https://results.aec.gov.au/31496/Website/HouseDownloadsMenu-31496-Csv.htm), [Senate downloads](https://results.aec.gov.au/31496/Website/SenateDownloadsMenu-31496-Csv.htm), and [election/by-election archives](https://results.aec.gov.au/). Store source event and candidate IDs. |
| State/territory election backfill | [The Tally Room repository](https://www.tallyroom.com.au/data) offers standardised candidates, polling places and results across all eight jurisdictions. Latest listed datasets are free; historical collections require its advertised Patreon access. Confirm dataset reuse terms before redistribution; access alone is not a licence. |
| Official state results | [ECQ public XML/archive documentation](https://www.ecq.qld.gov.au/__data/assets/pdf_file/0020/80057/XML-Feed-Overview.pdf); [NSW Parliament Excel supplement](https://www.parliament.nsw.gov.au/parliamentary-business/research-and-library/research-publications-data/2023-nsw-election-analysis-with-supplement-2025); [VEC result tables/Excel](https://www.vec.vic.gov.au/results/state-election-results/2022-state-election-results); [ECSA results](https://result.ecsa.sa.gov.au/). Adapter completeness must be measured per contest and count type. |
| Current and historical representation | Official parliamentary rosters and individual service histories. Reuse the federal APH reconciliation and QLD member API adapter, extending QLD to preserve all electorate/party activities and fetch former-member details. Inventory NSW/VIC/SA history formats as each adapter is built. Election results validate elected membership but do not supply every later party change or replacement. |
| Boundaries | [AEC official federal GIS](https://www.aec.gov.au/Electorates/gis/gis_datadownload.htm); state electoral/spatial agencies, including [VEC's Vicmap direction](https://www.vec.vic.gov.au/electoral-boundaries/download-boundary-maps). Use [ABS downloads](https://www.abs.gov.au/statistics/standards/australian-statistical-geography-standard-asgs/edition-3-july-2021-june-2026/access-and-downloads/digital-boundary-files) for consistent statistical geography and Census joins. |

ABS boundaries are Mesh Block approximations, not exact electoral boundaries. Keep their identifiers and vintages alongside the official polygons rather than treating the two geometries as interchangeable. [ABS SED definition](https://www.abs.gov.au/statistics/standards/australian-statistical-geography-standard-asgs/edition-3-july-2021-june-2026/non-abs-structures/state-electoral-divisions).

Start with complete current federal identities and verified representation, then ingest full candidate results for 2019, 2022 and the latest completed election, including intervening by-elections. Include the historical seat identities and boundary versions those events require. The existing summaries are reconciliation inputs, not the final result store. Backfill earlier elections and service histories towards OPAX's 1993 corpus floor as source coverage permits; show missing intervals explicitly. History coverage follows available parliamentary/electoral sources and does not depend on a funding period.

## 7. Fit with the existing application

Keep the current architecture: ingestion and spatial processing on the data host; deterministic static exports; Cloudflare serving assets and search/Ask requests. The electorate feature does not require a new runtime database or GIS service.

Proposed files and responsibilities:

| Location | Change |
| --- | --- |
| `parli/ingest/electorates.py` and source adapters | Register identities, aliases, boundaries, source keys and event-scoped election imports. Preserve legacy tables during migration. |
| `parli/ingest/representation.py` | Canonical person bridge, official roster snapshots, service terms and party periods. Validate seat capacities and dates. |
| `scripts/export_electorates.py` | Write a complete small directory, lazy per-electorate details and independently loadable geometry/history files. Include schema version, generation and source coverage. |
| `scripts/export_parliamentarians.py` | Add canonical person keys and representation links. Support roster-only people while retaining existing speech-name links and corpus statistics. |
| `portal/public/electorates.js` | Lazy-loaded subject-page sections, election/representation timeline and directory-specific data helpers. Reuse visual styles and accessibility patterns. |
| `portal/public/app.js` / `index.html` | Add directory kind, route dispatch, navigation, autocomplete and reciprocal person/electorate links. Include URL query changes in page refresh keys and cancel stale loads. |
| `portal/src/index.ts` | Add the electorate kind to both routing and metadata, asset loaders, canonical resolution, prerendered factual summary, share card and sitemap. A verified abolished seat remains a valid page; an unknown ID returns 404. |
| `parli/ingest/arag_sync.py` + portal search/Ask | Add a verified `represented_electorate` facet from person/service joins. Wire it through validation, query construction, URLs, cache identity and tests. |

Suggested assets: `/electorates/index.json`, `/electorates/<id>.json`, `/electorates/geometry/<boundary-version>.json`, `/electorates/crosswalk.json` and `/electorates/manifest.json`. Split large historical crosswalks/results into lazy assets as needed. Keep geometry and full historical candidate lists out of the directory. Generate related assets from a consistent release manifest; validate IDs, references and coverage before publishing them together.

The first registry export should include the shared contract before the profile UI is complete. Consumers can start from its stable IDs and crosswalks. Building current profiles must not require complete historic election or Hansard coverage.

Existing ARAG speech data stores `electorate` only as extra metadata, not as a searchable classification. Initially link to representative pages and their existing record. Build dated speech/division associations before enabling an electorate-wide parliamentary record. Add scoped Ask only after the `represented_electorate` facet is indexed and its filters, cache keys and date behaviour are validated. Keep representation-based filtering distinct from place-mention search.

## 8. Build order and release checks

| Stage | Deliverable | Acceptance |
| --- | --- | --- |
| 1. Reference contract and registry | Federal identities, source crosswalks, boundary versions, lifecycle/lineage, canonical URLs and versioned exports. Publish the contract for parallel consumers. | Source seat counts reconcile per chamber/date; keys distinguish same-named seats; effective/proposed boundaries and ambiguity are explicit. No funding dependency. |
| 2. Representation and first entity pages | Canonical person bridge, verified current roster, dated service/party history, electorate directory/pages and Census context. | Roster-only people, vacancies, abolished seats and missing history have valid pages/states; existing person URLs still resolve. |
| 3. Election timelines and core jurisdictions | Full federal candidate-result history for the initial window; QLD, NSW, VIC and SA registry/representation/election adapters; multi-member and statewide constituency presentation. | Contest results reconcile with sources; elections and by-elections coexist; every launched jurisdiction declares current and historical coverage. |
| 4. Parliamentary record and expansion | Dated representative speeches/votes, scoped search/Ask, older electoral history and WA/TAS/ACT/NT adapters. Related-area lookup and local-place mentions can follow. | No whole-career misattribution to the latest seat; each source and jurisdiction has independent coverage and evidence. |

Meaningful automated checks should cover:

- Identical names across jurisdictions/chambers, renames/re-establishment, election and by-election in one year, plus a future boundary that is not yet applicable.
- Stable electorate/person IDs across repeat imports and source corrections; explicit replacement relationships for identity merges/splits; reproducible manifest/crosswalk exports.
- Returning members, seat changes, party changes, vacancies, unknown dates, multi-member terms, and a current member with zero indexed speeches.
- A postcode split across seats, an ambiguous point on a boundary, official versus ABS statistical geometry, and lookup dates outside available boundary coverage.
- TCP versus TPP, uncontested contests, exhausted preferences, STV elected candidates/transfer precision, and final versus provisional results.
- Census vintage/indicator definitions, unknown versus zero data, and representative speech/vote joins that respect service dates and chamber.
- Route metadata, directory/subject links, old person URLs, browser back/forward, narrow screens, keyboard timeline controls and a text/table alternative to every map/chart.
- Contract lookups working from static exports without a funding table, grant asset or completed profile UI.

Refresh rosters regularly and after elections, vacancies and party changes; election data at finalisation/corrections; boundaries when determined and again when effective. Publish corrections through versioned foundation releases, preserving stable identities. Each source adapter can refresh independently while the manifest records exactly which data versions are included.

**Recommended first implementation:** publish the electorate registry, source crosswalk and boundary contract, then add dated representation and first-class profile pages with election timelines. This provides a useful entity foundation for OPAX and lets Jake integrate his funding work independently.
