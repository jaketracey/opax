# Jabiru invitation venue evidence

The grants report can locate the two Jabiru Swimming Pool invitations at the actual pool venue: the $250,000 sanitation upgrade and the $375,000 gym refurbishment. Their source snapshot remains 14 November 2025, with status **Awaiting Application**. No award, payment or completed work is inferred.

West Arnhem Regional Council's 4 June 2025 announcement corroborates the exact works and amounts. Its facility directory identifies 56 Kinchela Road; Tourism NT names the same pool and supplies the venue marker at -12.675365, 132.8320834. The public Tourism NT map implementation anchors its named venue information window to that point. This is a venue marker, not a surveyed construction footprint.

The WGS84 point was transformed to GDA94 and tested against all 150 polygons in the official March 2025 AEC archive. Exactly one division contains it: Lingiari. The nearest boundary is 67,454 metres away, measured in MGA zone 53. The electorate label describes only the venue point; neither invitation's value is allocated to that point or division.

## Publication surfaces

- The report's reviewed location dataset adds invitations `mlci-invitation-067` and `mlci-invitation-070`. The mapped invitation count rises from six to eight, and the mapped invitation value from $11,070,000 to $11,695,000. All original invitation and award totals remain unchanged.
- Existing invitation catalogue entries gain verified venue/address/2025 electorate search terms. Their links explicitly select the invitation stage and project; unlocated invitations open the list. Previously their links could land on the default award view.
- Two separate derived venue notes are published through `scripts/publish_grant_venue_notes.py`. They retain source identity, snapshot, location citations, evidence hashes and boundary method. Both `counts_as_award` and `counts_as_invitation` are false. Existing canonical resources are untouched.
- The shared corpus cache epoch advances so new retrieval can see the notes. Ask is not called during publication validation; it uses the same corpus resources as document search.

## Verification

Independent Codex source review passed the original departmental PDF rows, Council evidence, Tourism NT marker semantics and AEC polygon result. The other three tasks from the bounded research batch remain review candidates; no unverified coordinate was published.

Focused checks cover source totals and stage separation, verified versus unresolved locations, search by venue and electorate, exact invitation links, and the publishing helper's explicit selection and invalid-input rejection. Browser checks use Chromium and WebKit at 390, 768 and 1440 pixels, verifying both invitation amounts, source links, location evidence and lack of horizontal overflow. Production receipts and screenshots are retained in `/Users/jake/.cache/opax/maintenance/research-batch-20260912T1630/`.

The desktop tasks are marked done only after publication and live readback. WebKit viewport testing is not a physical iPhone test. This selected venue sample cannot establish nationwide distribution, spending by electorate or political favouritism.

## Source-link follow-up

The first production probe found that `/api/resource/grant-site-evidence-mlci-invitation-067` returned `400 bad slug`, despite successful KB publication and search. The public document whitelist omitted venue notes; the seven earlier award venue notes had the same limitation. The document endpoint and voice/MCP reader now accept only `grant-site-evidence-ga<digits>` and `grant-site-evidence-mlci-invitation-<three digits>`. Arbitrary slugs remain rejected. The source-body tests now exercise the actual production whitelist instead of stubbing it to always pass. The source/voice checks and real community MCP HTTP roundtrip pass. The MCP schema also accepts the canonical research records already supported by the document endpoint. Queue completion waits for the corrected public source links to pass live verification.
