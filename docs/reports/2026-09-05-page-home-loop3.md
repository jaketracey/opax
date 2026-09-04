# Loop 3 — density, motion and accessibility

Kept the declaration caveat visible and moved the complete provenance text into a native disclosure. Raised money-card row targets to 44px, let long party names wrap, increased small card annotations, strengthened scoped focus rings and kept the report strip's next tile visible. Added explicit reduced-motion overrides for the home UI; the existing map engine already responds to the system preference.

## Final capture critique

- Headlines, declaration reading text and section titles use the serif; metadata remains quiet sans. The initial news rail is still a substantial six-story read at 360px, but every story is a single coherent unit.
- Date rules and full-width quotes work. Six declarations are intentionally long because quotes and source links are retained, rather than truncated. The provenance disclosure removes the largest avoidable wall of text.
- Reports now take one strip on phones and a three-column grid on desktop. Native scrolling and keyboard focus reach the final report without document overflow.
- The grown money card remains inside its host, with scrolling available through its final actions. It is dense; at 360px long party names take two lines. Its close button is at the top of the scrollable card, so a reader at the bottom must scroll back up to close it.
- The miniature map's labels still compete in some orientations. Label layout belongs to the graph engine, which is outside this worktree's editing boundary. The readable industry links and full-map action provide the alternative.
- Some long suggested questions retain the shared renderer's 60-character truncation. The buttons now wrap and meet the target requirement, but changing the shared renderer is outside the allowed app.js functions.

The post-capture audit found two remaining target misses: the disclosure's provenance link and a 40px-wide encyclopedia arrow. Both now measure 44px. Full-size desktop review also caught the media promo wrapping to two lines; its description was shortened.

## Verification

`node --check portal/public/app.js` and `git diff --check` pass. No Worker changes, so no Worker type-check was needed. The original CSS is byte-for-byte unchanged before the single appended banner. Changes in app.js remain in home renderers and helpers directly beneath them.

The requested four-viewport matrix covers every section, top, footer, both map open states, the bottom of the grown card, expanded news, open provenance and the final report. Follow-up captures verify corrected targets, keyboard focus and normal/reduced map motion. In all four viewports: no document overflow; news expands 6 → 12 → 6; six declarations group under four dates; all six 200px portraits load at 48px with alt attributes; the money card stays inside its host and its rows/close control meet 44px. Reduced-motion map images 700ms apart are pixel-identical. The last report is fully visible when focused by keyboard.

All assets came from this worktree's static server, with live read-only API data. The proxy blocked asks and `nocache`; no generated answer, deployment, epoch/configuration update, graph edit or static-data change occurred.
