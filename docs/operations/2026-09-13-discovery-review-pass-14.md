# Discovery review pass 14 — see and share the matching receipts

## Reproduced problem

At 390px the first receipt sat 1,072px below the top of the viewport, after a 480px filter toolbar. The selected total did not appear until 920px. Changing the Queensland Tabcorp selection from Labor to LNP correctly changed $12,100 to $11,990, but the URL still named Labor. Reloading restored the old party and amount.

## Result

The receipt list now starts with its jurisdiction, recipient, other active selections and total. Filters sit in a native disclosure, collapsed initially on mobile and tablet and open on desktop. The exact donor remains visible with a removal control. The same 390px example shows its first receipt at 675px, about 397px sooner, with the amount and selection above it.

Filter changes update the page URL. Exact donor and party IDs, industry, search text, jurisdiction, return years and minimum amount survive reload and browser back/forward. View and sort order also round-trip. Copy link shares the same selection; if clipboard access fails, a selected, labelled URL field allows manual copying. Export and copying are unavailable during loading, invalid selections and errors. An asynchronous clipboard response cannot overwrite a newer selection.

Text and year keystrokes form one history entry per editing session. Invalid intermediate years do not start that entry or replace the last valid URL. Native details and existing controls retain keyboard operation and touch targets. No new fonts, colours, source records, amounts, aggregation or ranking rules were introduced.

## Validation

- 455 portal tests, type checks and asset stamps; production dry-run.
- Eight local Chromium/WebKit cases at 320, 390, 768 and 1440px: initial selection, mobile disclosure, amount/CSV equality, copied exact donor, URL updates, back/forward, reload, view/sort, donor removal, search, invalid year, clear, jurisdiction and duplicate parameters.
- Two additional Chromium/WebKit cases: failed initial fetch hides figures and disables copying/export; retry restores exact scope; typing a year/search retains the previous history entry; clipboard failure produces the correct selectable link and later edits hide it.
- Independent Codex review passed arithmetic preservation, exact IDs, malformed links, mobile placement, history, retry and stale-copy guards.
- The fresh base includes the September 13 corpus refresh. Its existing corpus test still expected September 9 and 620,066 resources. Updated the date, resource total and NSW release count (5,185) to the already committed snapshot; retained exact source-tranche and breakdown-sum checks. Corpus data is unchanged.

Final browser results, release identifiers and public asset hashes are archived in `/Users/jake/.cache/opax/discovery-reviews/pass-14-20260913/release-verified.json`.

## Limits and next pass

A URL represents the last valid selection while a year is incomplete. A jurisdiction change updates the URL after its data successfully loads; errors allow a retry and never show old amounts. The native filter disclosure keeps its current open/closed state while resizing, and resets to the viewport default when the route remounts. This is browser WebKit coverage, not a physical iPhone test.

The existing data is a published receipt selection, not the complete donor universe or necessarily gifts. Financial-year-start and polling-year conventions remain visible. One discovery pass remains: evaluate new named-person questions and follow-ups against original recorded speaking turns; do not present speculation as an actual position.
