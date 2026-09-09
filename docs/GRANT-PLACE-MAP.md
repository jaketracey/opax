# Grant project map and historical exploration

`/reports/grants-allocation` follows published grant awards and project invitations. It does not establish that funding was paid or works completed.

## Releases and coverage

- `portal/public/research/mlci.json` remains the complete captured program snapshot: 89 published awards and 226 active invitations (one withdrawn invitation excluded).
- `grant-locations.json` adds checked venue evidence to seven awards at nine sites and six invitations. Unlocated funding records stay available in List view.
- `grants-history.json` adds a deliberately checked selection of 11 earlier awards, published 2018–2024, at 11 venues across six states and three programs. It is not a representative or complete national historical sample.
- Invitations, program awards, and the earlier sample are separate collections. Never add invitation and award amounts together.

Each record has an original funding link, publication date, current recorded value, and venue evidence. Coordinates identify a verified venue, not necessarily the entire funded works footprint. An organisation's office, postcode centroid, map viewport centre, or unverified model suggestion cannot be used as a project location. A grant with multiple pins remains one monetary record; no per-site amount is inferred.

The year slider includes notices first published through the selected calendar year. Values are from the current retrieved notices and may include later amendments. It is not a snapshot of what was known or paid at that time. The map keeps its position while the year changes. Electorate labels use 2025 boundaries, including for older awards; they do not allocate the whole grant to that seat.

## Implementation and checks

The module exposes a synchronous destroy handle with a `ready` promise. The shell destroys it on route changes and rejects stale imports; data loads, timers, and map observers are cancelled. Map pins and the equivalent record list support keyboard use, and closing details returns focus.

`portal/grants-map/index.js` bundles Leaflet locally using `npm run build:grants-map` from `portal/`. Both deploy commands run this build. Only raster background tiles load from OpenStreetMap; no external scripts are required. Preserve visible OpenStreetMap attribution and the geometry licence/provenance included with historical records. Automated viewport tests must stub public OSM tiles rather than bulk-fetch them.

Run:

```
python3 scripts/validate_grant_locations.py
python3 scripts/validate_grants_history.py
node --test portal/test/grants-map.test.mjs portal/test/grants-research.test.mjs
```

The data validators reconcile unique records, source evidence, dates, location status and record-based totals. Fresh acquisition validation may also compare archived original notices. New records must have `record_type`, record and site `verification.status = verified`, finite coordinates, original source URLs, checked dates and evidence hashes. Keep pending candidates in the enrichment queue until verified.

Build your ballot is a separate `/explore?game=ballot` module using the AEC-sourced 2025 House candidates already in the electorate exports. It keeps the original candidate order, lets the reader arrange preferences, and downloads an explicitly historical practice plan. Preferences stay in module memory; the feature makes no candidate recommendations or paid model calls.
