# State bills: app plan only

No app code, simulator, native build or app deployment was changed in this lane.

Start with a link from the app's Bills screen to `/register/state-bills`. A later
native screen can decode the two reviewed metadata assets, with jurisdiction and
Parliament/Assembly filters and a read-only bill detail. Retain stable bill keys,
source IDs, source-component receipts, licence findings and nullable dates.

Display sponsor strings exactly as published. Link only the exported, exact
jurisdiction/roster matches. Do not expand initials, surnames, titles or offices.
Separate introduction, last dated action, source-list date and acquisition time;
show date disagreements and version-index gaps. Passed, assented and commenced
are separate concepts. These sources do not establish commencement.

Open bill versions, explanatory material and related documents at their original
publisher URLs. No document body or source summary is supplied in these assets.
Require document-specific rights review before adding a native text reader.

Before native implementation, add the static paths to the app API allowlist,
document a bounded metadata contract and test offline/unavailable states,
partial jurisdiction availability, source notes and unlinked sponsors. Keep
`votes.json` at schema 1 and byte-identical for this lane.
