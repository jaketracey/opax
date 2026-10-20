# Queensland budget app plan

Plan only; no app code, native API contract, simulator run or build in this lane.
The five original CSVs are held: their permitted portal URLs redirect, with four
captured targets excluded by robots. No Queensland budget rows are available.

After original access, dictionary/notes review, numerical reconciliation and an
explicit annual promotion through `scripts/promote_hub_data.py`, reuse the
existing Budget web destination. The first app surface is a signed-out link to
the Queensland 2026–27 section within `/budget`. Keep Queensland and federal
vintages distinct; do not combine their figures or imply a national total.

The lede should explain that BP3 is the capital program, while BP4 sets out new
policy measures and their estimated revenue, expense or capital impacts. These
papers describe a particular Budget vintage. ABS GFS is a separate statistical
series with its own classifications, consolidation and revisions.

A later native view could reuse a reviewed static projection: capital records
filtered by published agency; measure records filtered by published portfolio,
type and fiscal year. Preserve each exact published project/measure name,
original location fields, source resource UUID and row, snapshot SHA-256,
vintage, fiscal period, original value/code, unit and basis. Show only published
totals; keep any component sums solely in internal reconciliation evidence.
Do not infer a savings category from the sign of an amount.

Every visible block and export must carry the source dataset, resource,
2026–27 vintage, snapshot date, licence and attribution, with dictionary
definitions available alongside the records. Use lowercase m and bn for money,
while preserving original units in the receipt/export. Held or mismatched
licences must remove the whole file from every projection.

Only exact existing agency/place routes may be linked. Private names remain
inside authorised source record text; no person profiles, entities, name facets
or identity joins. Non-partisan wording must describe figures as published
estimates. Use the shared web DataTable for long lists, with server-rendered
records and independently verified 390/1440 fitting before enabling the link.

Publication remains a reviewed annual opt-in. Nightly stays off. Earlier
vintages, revised files, native charts and further source acquisition require
separate evidence and review; this plan does not clear the current access hold.
