# Loop 1 — readable phone receipts and donor names

Baseline: inspected Liberal, Labor, One Nation and Greens at 390×844. The map's existing open profile dominates the first screen. Donor names were reduced to fragments; receipts were 27 tightly packed rows with almost every percentage absent. Funding tiles and source notes were small.

Implemented newest-ten-year phone disclosure with a count-aware Show all control, newest-first ordering, a percentage on every row, a one/two-line legend, linked full-width receipt rows, wrapping donor names with reserved amounts, and smaller, more orderly funding tiles. The scale stays constant when older years open.

## Harsh review and corrections

- First pass gave each receipt two 44px source links, making ten years needlessly tall. Fixed before completing this loop: one source link covers the entire row (minimum 56px), with the year and total above the bar and percentage.
- Creditors still inherited the same damaging truncation as donors. Fixed before completing this loop: party creditors now wrap and keep amounts on their own side.
- Desktop donor and creditor charts are now too stretched horizontally. Restore a denser desktop arrangement in loop 3.
- Funding prose and mentions still use too much small sans text; section hierarchy is inconsistent. Address in loop 2.
- The existing map profile is crowded and scrolls internally; graph internals remain outside scope. Its initial open state is included in captures.

## Verification

Passed `node --check portal/public/app.js` and `git diff --check`. No Worker changes.

Captured and inspected the entire scroll path plus expanded/oldest receipt states for all four parties at 360×780, 390×844, 430×932 and 1280×900. Every capture was reviewed in the per-page contact sheets. PNGs: requested scratchpad, `page-party-loop1-<party>-section<N>-<width>.png`, `expanded`, `oldest`, and `sheet`. All 16 document-overflow checks passed.

Used an isolated static server rooted in this worktree, headless Chrome with ANGLE/SwiftShader, local static exports, and live read-only APIs cached in the capture server. The first proxy attempt returned upstream 403s; switching its HTTP transport to curl restored real search results and the final matrix was recaptured. The server rejects all `/api/ask` requests and any `nocache` parameter. No generation or deployment.
