# Historical grant venue evidence

`portal/public/research/grants-history.json` is a selected, independently checked sample of 11 existing GrantConnect awards, published from 24 May 2018 to 10 May 2024. It contains one venue marker per award, across six states and three programs. It is not complete or representative of national grants. The sample's current recorded award value is $84,307,200; this is not a payment or expenditure total.

## Dates and money

The timeline includes a record from its GrantConnect publication date. Values are those on the individual notices retrieved on 9 September 2026 and may include later amendments. It must not be described as the amount paid, spent or known at the selected historical date. Approval dates, corpus notice versions and last-updated provenance are retained separately. Amounts belong to award records, never individual site markers.

## Locations

Every notice explicitly names the funded venue. Those identities and physical locations were independently checked against original council or venue-operator sources. Two points come from council destination markers; Hands Oval uses the destination coordinates in the official AFL venue map, rather than its map viewport centre.

Eight points use named OpenStreetMap facility polygons matched to the original venue identity and location. The representative point was checked to lie inside its named facility polygon. The raw geometry, OSM object IDs, primary site evidence, source hashes and original notices are retained in the acquisition archive. Source object URLs, bounds, checks and attribution are also present in the JSON.

These are venue-level points, not surveyed funded-work footprints. For example, the Qantas Founders Museum point identifies the museum complex rather than tracing its airpark roof; Melville Oval contains several funded facilities. This evidence is never a reason to allocate the whole award value to the marker's electoral division.

Every point was tested against the national AEC 2025 electoral boundary file (`AUS-March-2025-esri.zip`, GDA94 / EPSG:4283; SHA-256 `bdc0393d8448477bf187ac84473978330f776b5ea2ed6343f7eb891187263a09`). These are **2025 divisions of present-day venue points**, not the divisions at the time of historical awards. Tench Reserve's boat-ramp point is approximately four metres from a division boundary; that proximity makes a whole-project or whole-grant electorate assignment particularly inappropriate.

## Reuse and attribution

OSM-derived geometry must retain **© OpenStreetMap contributors**, linked to <https://www.openstreetmap.org/copyright>. OpenStreetMap data is available under the Open Database Licence (ODbL); the licence and source object are identified for each derived geometry. Do not remove this attribution from a distributed map, extracted dataset or derivative database. Original award and council/venue documents remain linked and retain their own terms. The artifact contains short attributed evidence excerpts and structured facts, not copies of those documents.

## Corpus and further review

All 11 underlying awards already existed in the desktop corpus. The new location evidence was published as 11 separate **derived research notes**, with canonical GA IDs, original award links and `counts_as_award: false`. Original awards and raw award counts were not changed. Each note was read back from the shared knowledge base, and direct retrieval found the Tench Reserve and Carnegie notes.

A final completeness check found that the separate MLCI map's source awards and invitations were already in the shared corpus, but its newly verified venue evidence was missing. Seven additional derived research notes now cover all **seven MLCI awards, nine venue points and six verified invitation links**. Each invitation retains its own ID, title, allocation, snapshot status and original source alongside the later award. Invitation and award amounts are not added, and broader later award scopes are not silently assigned to the original invitation. The Jerrabomberra award remains unlinked to an invitation.

Across the historical and MLCI maps, **18 derived venue-evidence notes covering 20 venue points** are now published and read back from the shared knowledge base. They are classified as research notes, not new awards or invitations; raw award and invitation records/counts are unchanged. Direct retrieval also returned the new David Campese Oval and Pambula notes, including the Pambula invitation linkage. MLCI note payloads, read-back receipts and retrieval results are retained separately at `~/.cache/opax/acquisition/mlci-20260909/map-review-20260909/`.

Four unresolved candidates were added to the established desktop `project_location` queue: Brighton Oval (GA60561), Blackwood Hub (GA121745), Fritsch Holzer stadium and sportsground (GA231243), and Frankston Basketball Stadium (GA383105). They are pending further evidence and are not plotted. Fritsch Holzer's general park-centre pin was specifically rejected because the award includes the adjacent school's stadium and sportsground.

Acquisition evidence and receipts are retained at `~/.cache/opax/acquisition/mlci-20260909/history-review-20260909/`. Run `python scripts/validate_grants_history.py`; with the archive available, pass `--source-notices <archive>/awards.json` to reconcile amounts, activity, dates, recipient and program against the fresh original notices.
