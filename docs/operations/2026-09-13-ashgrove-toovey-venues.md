# Ashgrove and Toovey Street venue evidence

Two existing MLCIP invitations now have independently checked venue markers in the grants report, catalogue and shared corpus:

| Original invitation | Snapshot value | Named venue | AEC 2025 point label |
| --- | ---: | --- | --- |
| `mlci-invitation-094` — Valley District Cricket Club | $2,700,000 | Ashgrove Sportsground | Ryan |
| `mlci-invitation-097` — 2 Toovey Street Caboolture Upgrades | $3,000,000 | Toovey Street community precinct | Longman |

Both retain **Awaiting Application**, the 14 November 2025 invitation snapshot and their original amounts. Neither is an award, payment or completion claim. The 25 previously mapped records, including the Kumbartcho/GA578157 association, are unchanged. Mapped invitation coverage rises from 18 to 20 records ($19.097m to $24.797m); original funding totals and award coverage are unchanged.

## Primary-source review

- Departmental page 161 independently re-extracted from the archived original PDF, SHA-256 `ab8b21ad90b571e810951a30269cd223c3e16c843354b4ecd851d91f34b2f52b`. Structured rows preserve identity, amount, LGA and status.
- Brisbane Council MLCIP sponsorship schedule, page 4: Valley District Cricket Club, $2.7m, proposed new indoor facilities. The club contact page gives Yoku Road, Ashgrove. Council park record D0186 provides the Ashgrove Sportsground marker and park boundary, with the park address 258 Acacia Drive.
- A separate Council Safer Suburbs CCTV grant links the club to Ashgrove Sportsground. This is venue-identity evidence only: its $10,000 and CCTV scope are not merged with the MLCIP invitation.
- The City of Moreton Bay project page provides the Toovey Street precinct marker at 1–11 Toovey Street, Caboolture. Preserve the discrepancy with the original “2 Toovey Street” title. The page's “2024 Federal Election commitment” wording is an unresolved date anomaly, not a verified election date.
- Moreton's current rendered page was independently read; direct HTML fetch returned 403. The structured extraction and the reused original HTML from 12 September have separate hashes and explicit provenance.

All exact URLs, extracts, hashes, retrieval distinctions and limitations are included with the new records. Markers locate venues, not surveyed indoor facilities or individual buildings. The final works footprints remain unresolved.

## Boundary and publication checks

Root and an independent Codex reviewer checked both points against all 150 AEC March 2025 division polygons (archive SHA-256 `bdc0393d8448477bf187ac84473978330f776b5ea2ed6343f7eb891187263a09`). WGS84 points were transformed to GDA94; distances were measured in MGA zone 56. The Ashgrove marker is 176.146 m inside Ryan, and the entire official D0186 park polygon is contained in Ryan. The Toovey marker is 9,313.499 m inside Longman. These labels do not allocate invitation values to seats.

Final independent candidate review: `PASS_WITH_VENUE_ONLY_LIMITS`, SHA-256 `f787154393370aae22e87498f33df3bcd01fb7d90ad8bd6e67b965460aff3df0`.

Validation: source/coverage validator, 455 existing tests, TypeScript and asset stamps, deployment dry run, and 12 local Chromium/WebKit cases at 390, 768 and 1440 pixels. Browser checks cover original amounts, invitation stage, one result/marker, venue/address/electorate, original source link, no horizontal overflow and no JavaScript errors. Production repeats the browser matrix and checks exact public asset bytes, catalogue links, corpus body/metadata and shared-source retrieval. New generation calls are not part of validation.

Derived corpus notes use `grant-site-evidence-mlci-invitation-094` and `grant-site-evidence-mlci-invitation-097`. Each is linked to the canonical invitation, counts as neither a new invitation nor an award, and receives exact body/metadata readback. Queue tasks move from review to done only after public deployment and retrieval verification.

Evidence archive: `/Users/jake/.cache/opax/maintenance/location-publication-20260913T0038/`.
