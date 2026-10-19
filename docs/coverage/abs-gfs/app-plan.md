# Government finance app plan

Plan only. This lane changes no app code or native API contract.

1. Add a Money entry opening `/register/government-finance` in the existing web reader after the orchestrator ships the reviewed code and locally promoted snapshot. No app-specific source fetches.
2. For a later native view, agree a versioned, read-only export contract using release, level of government, jurisdiction, sector, measure, reference year, published value, unit, prices basis and source-cell provenance. Keep the release distinct from the reference year so revised figures remain attributable.
3. Use selectors for ABS-published consolidation groups; never sum across levels, jurisdictions or sectors. Render unavailable and suppressed values distinctly from zero. Preserve net debt's published L2 definition, original AUD million values and lowercase m/bn display.
4. Carry original workbook links, sheet/cell, release date, snapshot SHA-256 and the per-file licence into every detail view and export. Exclude held files at the export boundary. Leave jurisdiction labels unlinked until an exact supported route exists.
5. Verify VoiceOver, Dynamic Type, small-phone tables, offline/stale snapshots, revisions and no-cross-level totals with fixtures before any native release. No Ask, generation, voice, authentication or production data writes are required for this register.

The reviewed public asset is promoted locally through `scripts/promote_hub_data.py`; GFS is annual and stays outside nightly. Future snapshots require another explicit reviewed re-promotion. Shipping remains with the orchestrator; this app plan does not authorise a deployment or database write.

## Function extension (20 October 2026; plan only)

- Extend the same GFS web-reader entry to the Spending by function section after reviewed promotion and deployment. No native code or contract change in this lane.
- A later native contract should keep `measure`, `classification`, `function_level`, `division`, `group`, `function_as_published`, `division_code`, `group_code` and `code_status`, alongside existing release, dimensions, unit, basis and original-cell receipts. The current workbooks do not publish numeric codes: keep them null. Preserve combined groups and the education cube's own School education label.
- Show the latest published division split and published Total Expenses, then year-by-year rows with separate division/group/education-series filters. Never add these overlapping rows or derive an all-level total. Show State and local education-only coverage explicitly; ACT education remains State.
- Use the already published consolidated education cells: transfers are not additional spending to add across levels. Keep the private-expenditure/GDP table and non-expense education tables out of this view.
- Verify VoiceOver source disclosures, Dynamic Type, 390px-equivalent table containment, lowercase m/bn, null versus zero, stale snapshots and the explicit reviewed annual promotion boundary before native delivery.
