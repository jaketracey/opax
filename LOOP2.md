# Loop 2 — members, industries and parliamentary briefs

Added the party-only members row from parliamentarians.json, using current party for sitting members and historical party labels for recorded speakers. Deduplicating by member ID is essential: Liberal has 61 current-name rows but 37 distinct people. The directory link uses directoryHash("person", { party }) and intentionally opens its existing historical-party filter, not a new current-only filter.

| Party | Sitting members in directory | Recorded speakers |
| --- | ---: | ---: |
| Liberal | 37 | 251 |
| Labor | 124 | 354 |
| One Nation | 6 | 6 |
| Greens | 10 | 30 |

Counts describe the directory snapshot, not an uncapped census of every historical member. The page discloses the five-speech floor and snapshot date. A member who changed parties can appear in the current count without having spoken for that party in the indexed record.

Donor rows now carry quiet bronze-dot industry labels using barList's existing detail option. The amount stays visible and the name remains a donor link. Funding/associated-entity headings use the existing serif section-title treatment. Benefits and parliamentary reading text use the site's serif.

Party mentions now retrieve stored /api/brief summaries, label them Machine brief and retain passages when no brief exists. Search/error/empty states are explicit; stale responses cannot repaint a different party. No generation endpoint or Worker change was needed.

## Harsh review and corrections

- The first members layout broke into uneven lines and the methodology paragraph overwhelmed the row. Fixed: two deliberate phone columns, a separate 44px directory link and shorter provenance wording.
- Short speech titles allowed metadata to run alongside them. Fixed: metadata has its own block beneath every title.
- One Nation's fallback passages are too long after removing the shared clamp. Restore a bounded excerpt in loop 3 while retaining complete stored briefs.
- Desktop bar rows still waste width and vertical space. Address with desktop-only density rules in loop 3.
- Existing hidden receipt tables expose many invisible source links to keyboard navigation. Remove these duplicate tab stops in loop 3; retain the accessible table data.
- The initial map card remains crowded; no graph files were changed.

## Verification

Passed node syntax and git whitespace checks. Focused isolated checks passed receipt ordering, 10/27-year boundaries, clamping, duplicate member identities, historical party matching, directory URLs, escaped brief content, missing-brief fallback and stale-route guarding. Two initial harness assertions were corrected (a regex matched the rows container, and the VM needed URLSearchParams); neither was an application failure.

Re-captured and inspected all sections and expanded/oldest receipt states for Liberal, Labor, One Nation and Greens at all four requested sizes. Evidence is in `page-party-loop2-*.png` and `page-party-loop2-checks.json` in the requested scratchpad. All 16 overflow checks passed. Actual stored briefs and actual missing-brief passages appear in the matrix. The capture proxy rejects ask/nocache requests; no paid call or deployment.
