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

Python 3.10+ is required. Install project dependencies, including the optional geometry extra:

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

Use `--refresh` on the builder to fetch sources again. Cached-source observation dates remain their original fetch dates; a rebuild does not make an old roster fresh. Raw response bodies are retained under `.cache/electorates/raw/<sha256>`. The fixed election list and reviewed statewide configurations require deliberate updates after new elections or structural changes. A changed roster count fails closed for review.

For database ingestion, add `--db /path/to/staging.db` to the exporter. It upserts only `ext_electorate_*` tables, validates the **combined** state in one transaction, and exports that combined state. A rejected batch rolls back all changed rows. Existing tables, donor/funding data and the production database are untouched unless an operator explicitly targets that database. Repeated imports are idempotent. The importer is an upsert, not an implicit source-wide deletion: withdrawing an erroneous fact needs an explicit reviewed correction. Omitting it from a later bundle does not delete it.

The exporter writes an immutable content-addressed directory and atomically replaces `manifest.json` last. It refuses to overwrite a release with different bytes; bump `EXPORT_VERSION` when changing exported layouts. Keep previously published releases available while readers finish using them. Unpublished development releases can be discarded before the first deployment. Publish through OPAX's existing reviewed deployment workflow; building this feature does not deploy it.

## Consumer contract (version 1)

Fetch `/electorates/manifest.json` once, then follow its `index_url`, `people_url`, `crosswalk_url` and `reference_url`. All URLs in that manifest belong to the same release. `files` provides a SHA-256 per release asset; `generated`, `schema_version`, `release_id`, `coverage` and `sources` describe that release.

- **Electorate:** opaque `electorate_id`, stored `slug`, `name`, `jurisdiction`, `chamber`, `state_code`, latest sourced `capacity`, `kind`, source `status`, nullable lifecycle dates and sources. Directory records add canonical `url`, `detail_url`, latest observed representatives and independent coverage counts.
- **Boundary:** `boundary_version_id`, electorate foreign key, `geometry_kind` (`official`, `statistical`, `unavailable`), vintage, capacity, nullable half-open legal effective interval, CRS, simplified geometry, original source URL and optional applicable election date. Never use display geometry for precise allocation. A redistribution/version is distinct from electorate identity.
- **Key:** `(source, source_key, vintage)` → electorate and optional boundary. Scope by jurisdiction/chamber when needed. AEC DivisionIDs and ABS codes are separate namespaces. Corangamite's reviewed 207→328 AEC code change retains one electorate ID; arbitrary matching names never trigger this merge. New/re-established seats and new geography vintages need reviewed crosswalks, not automatic name merges.
- **Person:** canonical `person_id`, optional `legacy_person_id`, display name, reviewed aliases and sources. Only unambiguous, jurisdiction-scoped name matches are bridged during bootstrap; five reviewed federal legal-name/display-name aliases are explicit in the builder. Unresolved candidates retain standalone candidacy records. This is not a complete historical speaker-alias reconciliation.
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
