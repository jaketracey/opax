# Government finance app plan

Plan only. This lane changes no app code or native API contract.

1. Add a Money entry opening `/register/government-finance` in the existing web reader after the orchestrator promotes the reviewed snapshot. No app-specific source fetches.
2. For a later native view, agree a versioned, read-only export contract using release, level of government, jurisdiction, sector, measure, reference year, published value, unit, prices basis and source-cell provenance. Keep the release distinct from the reference year so revised figures remain attributable.
3. Use selectors for ABS-published consolidation groups; never sum across levels, jurisdictions or sectors. Render unavailable and suppressed values distinctly from zero. Preserve net debt's published L2 definition, original AUD million values and lowercase m/bn display.
4. Carry original workbook links, sheet/cell, release date, snapshot SHA-256 and the per-file licence into every detail view and export. Exclude held files at the export boundary. Leave jurisdiction labels unlinked until an exact supported route exists.
5. Verify VoiceOver, Dynamic Type, small-phone tables, offline/stale snapshots, revisions and no-cross-level totals with fixtures before any native release. No Ask, generation, voice, authentication or production data writes are required for this register.

Promotion remains the orchestrator's reviewed nightly action through `scripts/promote_hub_data.py`; this plan does not authorise a live write.
