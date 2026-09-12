# Three Queensland invitation venues

Three existing MLCIP invitations gain verified venue markers: Wynnum Manly District Cricket Club at Carmichael Park ($1,000,000), Kele Park Sporting Precinct Upgrades ($1,300,000), and Cloncurry Pump Track & Skate Park at Mary Kathleen Memorial Park ($1,700,000). The original 14 November 2025 amounts and **Awaiting Application** statuses are preserved. These are location additions, not new funding, awarded grants, payments or completed projects.

## Evidence and limits

The original departmental PDF rows on pages 160–161 were independently re-extracted from the archived original bytes. Brisbane Council's downloaded park record and the cricket club's primary contact page agree on the Carmichael Park venue address. The Council's December 2025 application submission lists proposed LED lighting, with scope adjustments possible during application.

Rockhampton Council identifies Kele Park and provides its explicit venue marker. The location addition does not adopt later component descriptions or mixed funding envelopes from a separate agenda. Cloncurry Council identifies the proposed skate park and pump track inside Mary Kathleen Memorial Park and records concept design; potential lighting remains uncertain. Both markers identify venues, not surveyed works footprints.

Direct HTTP requests returned 403 for some Council pages. Their rendered official pages were independently read; the archived structured extracts and public hash scopes explicitly distinguish those extracts from original HTML bytes. Original PDF and successful HTML/JSON downloads retain their full-byte hashes. The independently collected evidence is under `/Users/jake/.cache/opax/maintenance/location-publication-20260912T2135`.

Each point was checked against all 150 AEC March 2025 polygons, transforming WGS84 to GDA94 and using the appropriate local MGA projection for boundary distances:

| Invitation | Venue-point electorate | Nearest boundary |
| --- | --- | ---: |
| 087 — Wynnum Manly | Bonner | 2,404 m |
| 088 — Kele Park | Capricornia | 1,014 m |
| 091 — Cloncurry | Kennedy | 192,942 m |

These electorate labels describe points only; no invitation amount is allocated to an electorate. An initial reviewer draft misassociated IDs by list order. It was rejected before publication and retained as superseded evidence. The corrected executable check keys each point by its original ID/title/coordinates, and a separate implementation reproduced all results.

Kumbartcho (089) was already mapped with the same point and a recorded award association. The duplicate candidate was excluded before mutation; the existing record and association are preserved exactly. Fernvale (090) still lacks an independently checked official point. Neither is counted as a new mapped venue or marked newly published by this tranche.

## Delivery and validation

The map grows from 15 to 18 located invitation records, representing $19,097,000 of the existing invitation values. All 226 active invitations still total $559,241,712. The separate 89 published awards still total $242,781,386; award mapping remains seven records and nine sites. No funding totals change.

Existing catalogue entries gain venue evidence, and three derived venue notes are published to the shared corpus with `counts_as_award=false` and `counts_as_invitation=false`. The common source reader makes them accessible to search, Ask, documents, voice and MCP. The retrieval cache epoch advances. Original funding resources remain separate.

Validation includes source reconciliation, independent candidate review, the 449-test portal suite, type/stamp checks and a deployment dry run. Browser checks cover all three records at mobile, tablet and desktop widths in Chromium and WebKit: selected invitation stage, exact amounts, named venues, 2025 electorate labels, original source pages, map markers and overflow. Public catalogue search, exact corpus body/metadata readback and direct shared-KB retrieval are verified after publication. Queue tasks become done only after the live release checks. No paid generation calls are used; WebKit checks are not a physical iPhone test.
