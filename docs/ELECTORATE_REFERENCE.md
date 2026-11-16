# Electorate reference implementation

Implemented 9 September 2026. Funding is outside this feature. The design and later phases are in [ELECTORATES.md](ELECTORATES.md).

## Delivered

- `/subject/electorate`: searchable directory with parliament, chamber, state, source status, party and results filters, all encoded in the URL.
- `/subject/electorate/<slug>`: dated representatives, historical representation lookup (`?asof=YYYY-MM-DD`), election timeline with complete imported candidate lists and primary/TCP counts, boundary outline, Census context, related upper-house constituencies and source/download links.
- Parliamentarian profiles show compact electorate links under the name and in Quick Facts, including historical representation. The header prefers verified current seats when available. Recorded affiliation labels link only to a unique electorate in the stated jurisdiction, chamber and state; missing historical seats and conflicting source labels remain text. Reciprocal person links and directory entries support verified representatives below the speech export's inclusion threshold. Their speech totals remain unknown, rather than being presented as zero. Existing person URLs and speech counts are preserved.
- Worker metadata, canonical URLs, factual prerendering, share-card metadata, sitemap entries and genuine unknown-electorate 404s.
- Additive SQLite reference storage, portable JSON bundles, transactional imports, temporal lookup helpers, source-key crosswalks and immutable static releases. No production database has been migrated or changed by this implementation.

## Initial data coverage

The manifest contains machine-readable per-jurisdiction coverage, source checksums and independent observation dates. The initial release includes **625 constituencies**, including historical federal seats and statewide upper houses; **459 federal House contests**; **659 federal House service periods**; **151 Census profiles**; and **354 representatives in 254 dated constituency rosters**.

| Jurisdiction | Registry | Verified roster | Election results / service history |
| --- | --- | --- | --- |
| Federal | 176 current/historical House identities and 8 Senate constituencies | 150 representatives and 76 senators, APH-reconciled OPAX snapshot checked 4 September 2026 | House: 2019, 2022, 2025 general elections; seven by-elections through Farrer on 9 May 2026. OpenAustralia House service periods overlapping the post-1993 record. Senate history/results pending. |
| Victoria | 88 Assembly districts and 8 Council regions | 128 members, official Parliament directory fetched 9 September 2026 | Results and historical service pending. |
| NSW | 93 Assembly districts and statewide Council | Pending | Pending |
| Queensland | 93 Assembly districts | Pending | Pending |
| SA | 47 Assembly districts and statewide Council | Pending | Pending |
| WA | 59 Assembly districts and statewide Council | Pending | Pending |
| Tasmania | 5 Assembly divisions and 15 Council divisions | Pending | Pending |
| ACT / NT | 5 multi-member ACT districts / 25 NT districts | Pending | Pending |

NSW, Queensland and SA roster endpoints returned HTTP 403 during implementation. No old open-ended `members` rows are promoted to verified current membership to fill those gaps. State result ingestion and earlier federal elections remain backfill work; the schema, generic importer and UI already accept additional contests and dated rosters.

Federal display polygons are the AEC's **2025-election** boundaries. ABS CED/SED outlines are **2025 statistical geography**, not authoritative address allocation. Earlier official boundary versions and legal effective dates are not yet established, so `boundary_at` correctly returns unmatched outside explicitly dated data. State `status=current` means included in the released source geography; subsequent legal changes require verification. Historical lifecycle dates remain null where unverified.

Tasmania's ABS SED units intersect Assembly and Council boundaries. The builder unions their component geometries separately for each chamber and preserves component-code crosswalks. A source code can therefore legitimately resolve to both chambers. Victorian Assembly-to-Council relationships come from the ABS labels. Statewide relationships describe the relevant upper-house constituency, not a statistical overlap calculation.

Census indicators retain the original 2021 geography and the existing OPAX importer definitions (`parli/ingest/abs_profiles.py`). No redistribution or current-population estimate is implied. Postcode lookup, precise point-in-polygon lookup, full STV count ingestion, turnout/TPP backfill, historical boundary reconstruction, electorate-scoped Hansard/Ask and inferred place mentions are not enabled.

## Refresh and export

Python 3.11+ is required. Install project dependencies, including the optional geometry extra:

```sh
pip install -e '.[electorates]'
```

Create a read-only bootstrap snapshot on the data host. The date must be the date of an actual APH reconciliation, not the date the command is run. The snapshot command checks no roster itself.

```sh
python scripts/snapshot_electorates.py \
  --db /path/to/parli.db \
  --federal-roster-verified-as-of 2026-09-04 \
  --out .cache/electorates/legacy.json

python -m parli.ingest.electorates \
  --legacy .cache/electorates/legacy.json \
  --cache .cache/electorates \
  --out .cache/electorates/bundle.json \
  --as-of 2026-09-09

python scripts/export_electorates.py \
  --bundle .cache/electorates/bundle.json \
  --out-dir portal/public/electorates \
  --as-of 2026-09-09
```

Person linking alone can be re-run on the published release without the database or the other source fetches. `reference.json` is the builder's whole bundle; the script undoes and repeats `Builder.history()`, refusing a `representatives.csv` whose digest differs from the one the release recorded:

```sh
python scripts/relink_electorate_people.py \
  --cache .cache/electorates \
  --out-dir portal/public/electorates \
  --generated 2026-11-11
```

Use `--refresh` on the builder to fetch sources again. Cached-source observation dates remain their original fetch dates; a rebuild does not make an old roster fresh. Raw response bodies are retained under `.cache/electorates/raw/<sha256>`. The fixed election list and reviewed statewide configurations require deliberate updates after new elections or structural changes. A changed roster count fails closed for review.

For database ingestion, add `--db /path/to/staging.db` to the exporter. It upserts only `ext_electorate_*` tables, validates the **combined** state in one transaction, and exports that combined state. A rejected batch rolls back all changed rows. Existing tables, donor/funding data and the production database are untouched unless an operator explicitly targets that database. Repeated imports are idempotent. The importer is an upsert, not an implicit source-wide deletion: withdrawing an erroneous fact needs an explicit reviewed correction. Omitting it from a later bundle does not delete it.

The exporter writes an immutable content-addressed directory and atomically replaces `manifest.json` last. It refuses to overwrite a release with different bytes; bump `EXPORT_VERSION` when changing exported layouts. Keep previously published releases available while readers finish using them. Unpublished development releases can be discarded before the first deployment. Publish through OPAX's existing reviewed deployment workflow; building this feature does not deploy it.

## Consumer contract (version 1)

Fetch `/electorates/manifest.json` once, then follow its `index_url`, `people_url`, `crosswalk_url` and `reference_url`. All URLs in that manifest belong to the same release. `files` provides a SHA-256 per release asset; `generated`, `schema_version`, `release_id`, `coverage` and `sources` describe that release.

- **Electorate:** opaque `electorate_id`, stored `slug`, `name`, `jurisdiction`, `chamber`, `state_code`, latest sourced `capacity`, `kind`, source `status`, nullable lifecycle dates and sources. Directory records add canonical `url`, `detail_url`, latest observed representatives and independent coverage counts.
- **Boundary:** `boundary_version_id`, electorate foreign key, `geometry_kind` (`official`, `statistical`, `unavailable`), vintage, capacity, nullable half-open legal effective interval, CRS, simplified geometry, original source URL and optional applicable election date. Never use display geometry for precise allocation. A redistribution/version is distinct from electorate identity.
- **Key:** `(source, source_key, vintage)` → electorate and optional boundary. Scope by jurisdiction/chamber when needed. AEC DivisionIDs and ABS codes are separate namespaces. Corangamite's reviewed 207→328 AEC code change retains one electorate ID; arbitrary matching names never trigger this merge. New/re-established seats and new geography vintages need reviewed crosswalks, not automatic name merges.
- **Person:** canonical `person_id`, optional `legacy_person_id`, display name, aliases and sources. A federal service record (OpenAustralia `representatives.csv`, which prints legal names and leaves its person count empty) finds its OpenAustralia person in the pinned `people.csv` (exact name or alternate name, else a unique first and last name). When the members table holds that person (OPAX pid 10000 plus the count, OpenAustralia `lib/person.rb`), the record joins them: 'William Richard Shorten' is 10580 'Bill Shorten', with the legal name and the `people.csv` names as aliases. Otherwise only unambiguous, jurisdiction-scoped name matches join, never a member whose OpenAustralia id is another person's, and only exact names when two different people share a first and last name. A person the members table does not hold (most members who left before 1998, such as Alan Gordon Griffiths, OpenAustralia 10268) stays standalone with no `legacy_person_id`. Candidacies link to the one holder of the same seat whose name or alias agrees on first and last name; unresolved candidates retain standalone candidacy records. This is not a complete historical speaker-alias reconciliation.
- **Representation:** `representation_id`, person/electorate keys, start/end with precision, source reasons, party periods and `observed_through` for open source records. Dates follow the source's service-record conventions; they do not come from first/last speeches. A roster is a separate observation (`as_of`, `complete`, `capacity`, member list, source).
- **Election / contest:** one election event with actual polling day and kind, then a contest per electorate/chamber. Candidate IDs are contest-scoped; each vote row identifies `kind`, count, denominator and sources. Additional count stages may use `round`/`vote_type`. Party-at-election remains separate from current party. No single-winner assumption in storage or UI.
- **Demographics / relations:** retain their own reference year, geography vintage and evidence; missing data remains missing.

Portable bundles contain arrays named `sources`, `electorates`, `boundaries`, `keys`, `people`, `terms`, `rosters`, `elections`, `contests`, `demographics`, `relations`, plus `schema_version` and `coverage`. SQLite stores each group in `ext_electorate_<group>` with indexed foreign keys and JSON documents for source-specific evidence; JSON carries the same schema as static exports. Source-specific imports can therefore be staged without introducing a second shape for consumers.

```python
import json
from parli.electorates import Registry

registry = Registry(json.load(open('reference.json')))
match = registry.resolve(source='aec_division', source_id='328', jurisdiction='federal')
eid = match['matches'][0]['electorate_id']
people = registry.representatives_at(eid, '2026-09-04')
boundary = registry.boundary_at(eid, '2026-09-04')  # unmatched until legal dates are verified
contest = registry.latest_prior_contest(eid, '2025-05-04')
```

`resolve` and `boundary_at` return `matched`, `ambiguous` or `unmatched`. `representatives_at` prefers a roster for the exact requested day; otherwise it uses precise source periods, bounded by the observation date for open periods. Missing service evidence returns `unknown`, not vacant. A complete empty roster establishes vacancy only for its observation date. `latest_prior_contest` is strictly before the requested day and explicitly limited to indexed contests.

## Verification

```sh
python -m pytest tests/test_electorates.py -q
node --test portal/test/electorates.test.mjs
node scripts/stamp_assets.mjs
npm --prefix portal run check
```

Browser checks exercised directory search, navigation, historical-date changes and back navigation, a five-member Council constituency, reciprocal person links, unknown-seat handling and a 390px viewport without overflow. Worker checks verified metadata/canonical URLs, 404 responses and sitemap coverage. Browser API requests were stubbed for the unrelated speech/search services because this checkout has no live search credentials.

## Houses whose term has ended: `dissolved_for`

The field and file names say "dissolved" for every way a house ends before an election. The Victorian Legislative Assembly was not dissolved: its term **expired** on 3 November 2026 under the Constitution Act 1975 s 38(1), and reader-facing text says "until the Assembly expired on 3 November". The Legislative Council ended with it (s 28(2)); it has no record of its own, and pages read its state from the Assembly's rows ("until the Council expired on 3 November"). The names stay because shipped app builds decode them.

A lower house whose term has ended for an election has no members until the result is declared, though the roster still lists who held each seat. Readers must not call those people members, so the index and each detail file say so.

- **Contract.** A row of a house that a reviewed dissolution record names (today: every `vic_la` row) always carries the key. `dissolved_for: "YYYY-MM-DD"` is the election day while the house has ended and its new members are not yet loaded; `dissolved_for: null` means the house is sitting. A row with no key is one the pipeline cannot speak for, or a release from before the field: readers decide from their own election record.
- **Written** from `scripts/hubs/electorate-dissolutions.json` (reviewed: jurisdiction, chamber, `dissolved_on`). The election day and the source link are read from the election file it names, so each is stated once. The value is the election day from `dissolved_on` onwards.
- **Cleared** only by the post-result roster reload, shown to the pipeline in one of two ways.
  - **The reviewed record (how a state house clears).** The bundle has no state contests or terms, so it cannot see a state result itself. After the declaration, a person sets `seated_on` on the dissolution record (the day from which the parliament's own member list is the new house) and runs the hand export of the reloaded roster. The field becomes null on the first export whose roster for the seat is complete and dated `seated_on` or later. `seated_on` alone, or a roster refetched before that day, keeps the field.
  - **The result itself**, where the bundle holds it: a contest at that election with an elected candidate linked to a person, a complete roster dated election day or later, and that roster seating the winner.
- **Overdue reminder.** The nightly warns (never fails) while a house is still published as dissolved more than four weeks after its election day: `export_electorates.py --overdue`. It stops when the field clears.
- **Published by the nightly**, not by hand: `scripts/export_electorates.py --republish` re-reads the published release's own bundle (`reference.json`), with no fetch and no database, and writes a new release only when a row's value or the records changed. `scripts/vm/validate_data.py electorates` recomputes every row from the release's bundle and refuses a value that differs.
- **Old app builds.** The app's decoders ignore keys they do not name; `scripts/ci/app-data-guard.sh` checks the published release against each build still in use.

## Seats vacant when a term ended: vacancy records

A roster lists who held a seat on its date. It cannot say the seat has since fallen vacant, and a dissolved house is not refetched before its election, so a seat that was vacant when the term ended would keep its last member as its representative. A reviewed vacancy record corrects that.

- **Record.** `scripts/hubs/electorate-vacancies.json`, one entry per seat: jurisdiction, chamber, electorate, `as_of` (the day the term ended; it must be the `dissolved_on` of a dissolution record for that house, `at: "expiry"`), the last member (the release's person id and name, the roster's party, the parliament's party label, and the start and end of service as the parliament's member page gives them), each source with the date it was read, the sha256 of the bytes and what it says, and the review date. No cause is recorded.
- **Written** by every export, including the nightly `--republish` (`parli.electorates.apply_vacancies`), as rows of the kinds the bundle already holds: a complete roster observation dated `as_of` with no members (marked `vacant_at`), the last member's closed service record (a term with no `end_reason`), and the sources. The index row then has `representatives: []`, `representation_status: "verified"` and `representation_as_of` the day the term ended; the person's entry in `people.json` has `current: false` and the dated period. No field is added to the index or to `people.json`.
- **Refused** when the record no longer matches the bundle: the seat's newest roster before `as_of` must list the last member alone, and the service must end after that roster and on or before `as_of`. The export stops and names the record. Once the seat has a later roster (the post-election reload) the record is superseded and skipped; remove it then.
- **Readers.** `portal/public/seat-vacancy.js` reads a vacancy from the release and words what the release alone knows: "Last member: <name>, to <date>." beside the vacancy sentence on the electorate page and the election hub's seat page, and "Member for <seat>, <year> to <date>" on the last member's person page (header and title). The vacancy sentence itself, and every other rule for the ended houses, stay in `portal/public/vic-term.js`. Its hand list `VIC_VACANT_AT_EXPIRY` now repeats what the release records (the Brunswick row has no representative) and can be replaced by the row in a follow-up. The election hub's built seat has `members: []` and a `vacancy` object (`scripts/build_vic_election.mjs`). Descriptions, share cards and structured data name nobody. The app endpoint `/api/app/v1/vic-election` keeps its shape: the shipped decoders require a named member on a district row and at least one member on a seat, so for a vacant seat it sends the last member, which the apps print under "Last held by". The member-name search returns nothing for that seat.
- **First use.** Brunswick (Victorian Legislative Assembly), vacant when the Assembly expired on 3 November 2026. The Parliament of Victoria member page, read 16 November 2026, gives Brunswick service from 24 November 2018 to 19 September 2026; the VEC by-election list, read the same day, shows no Brunswick by-election.
- **Checks.** `scripts/test_electorate_vacancy.py` (the record, the export, and that no other row of the published release changed) and `portal/test/seat-vacancy.test.mjs` (the pages, the finder, the app endpoint, and a snapshot of every other Victorian seat page).
