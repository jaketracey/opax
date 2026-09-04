# Loop 3 — phone rhythm, reflow and accessibility

The phone query now gets a full-width row, with labelled Search and Filters controls beneath. The summary preview is shorter and its disclosure remains reversible. Results and pager spacing follow the same rhythm. Exact years use native labelled selects; the histogram marks a selected band with an underline as well as a wash. Focus outlines, status announcements, busy state and reduced-motion overrides are scoped to Search.

Filter drafts survive cancellation correctly, browser Back restores the URL's filters, and returning to a blank search clears stale controls and cancels ownership of pending results. A speaker-only first search works. Resizing recalculates passage and summary folds. Retrieval errors are visible rather than left in the screen-reader-only status region.

## Capture critique and corrections

Reviewed the final top, results, chart, pager, passages, briefs, expanded passages, summary/source disclosures and filter sheet at 360×780, 390×844, 430×932 and 1280×900. Repeated Westpac, hospitality with 1998–2006, and a zero-result query at 390px. Additional captures cover a selected year band, a 390×480 sheet, 200% text and a simulated retrieval failure.

The worst findings were fixed before closing this loop:

1. The expanded summary inherited a rule hiding its Show less control. A scoped ready-state override keeps the button visible and focused; both expansion and collapse are tested.
2. Native dialog tabbing briefly escaped to the document. Explicit first/last focus wrapping now contains Tab and Shift+Tab; Escape restores the initiating button and discards drafts.
3. At 200% text, the footer overflowed and year values were clipped. The footer now permits wrapped labels in bounded columns; year fields become a single column when text needs more room. The Apply row remains visible on a 480px-high viewport while fields scroll.

Remaining visual tradeoffs: long official bill headings can occupy four or five phone lines. Summary-source metadata sometimes wraps to preserve 44px links. Both are preferable to truncating evidence or shrinking targets. Enlarged text requires more scrolling, including within the sheet. Native select menus, the virtual keyboard and safe-area behaviour still need a physical-phone check.

## Verification

- JavaScript syntax, whitespace checks and Worker TypeScript: pass.
- Interaction checks: filter drafting, cancellation, application, history, pagination, passage/summary disclosure, resize, year bands, empty recovery and first search pass.
- All visible Search targets in the 390px interaction audit meet 44×44px.
- Short-screen Apply visibility, 200% text reflow, sheet overflow and simulated error visibility: pass.
- Final four-size matrix: no horizontal document overflow or JavaScript errors.
- Worker classification transformation: topic union, deduplication, absent labels, preserved metadata and one retrieval request pass.

Final loop captures use `page-search-loop3-<state>-<width>.png` in the requested scratchpad. Live retrieval supplies result data; local intercepted summary fixtures prevent paid generation. Real resource labels augment the capture-only payload until the Worker is deployed separately. No deployment was performed.
