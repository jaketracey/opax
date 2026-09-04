# Loop 1 — phone filters and first capture corrections

Implemented a native modal bottom sheet with a labelled heading, 44px controls, a scrolling field area and pinned Reset / Apply footer. Changes remain drafts until Apply. Close, backdrop and Escape discard drafts and return focus. Active filter removal remains outside the query row. Desktop uses a centred, two-column dialog.

The pager now gives every number a 44px target and puts Previous / Next on a separate phone row. The baseline's 360px horizontal overflow is gone.

## Capture review

Reviewed the complete 33-image matrix: housing top, results bar / histogram, passages, briefs, pager, sheet top and foot at 360×780, 390×844, 430×932 and 1280×900; Westpac, hospitality filtered to 1998–2006 and keyword nonsense at 390px. Files: `page-search-loop1-<state>-<width>.png` in the requested scratchpad.

Two findings corrected before closing this loop:

- A fast cached answer could arrive before retrieval made its rail visible. Measuring the hidden rail incorrectly unfolded it. Defer fold measurement until the rail is visible.
- At 360px, Export sat alone below the results actions. Give the three controls a shared grid with a shrinkable sort field.

Remaining problems are substantial: histogram dates are minuscule; neither scale nor interaction is explained. Passage text is sans and clipped after three lines. Metadata repeats dates already embedded in fallback titles. Briefs are shaded slabs within the result. Zero results adds a redundant summary above an oversized empty card. These are loop 2's content work. The 360px query field cuts off the final letters of the housing query; address query density in the polish pass.

## Evidence and limits

`node --check portal/public/app.js` and `git diff --check` pass. Final width diagnostics show no document overflow at any target size. The capture server is bound specifically to `127.0.0.1:18769` and serves this worktree's `portal/public`. Earlier captures on a conflicted local port were replaced and are not evidence.

Retrieval and briefs use the live free APIs, cached locally for repeatability. All ask requests are intercepted with an explicitly labelled local summary fixture, with no paid network request. The fixture tests layout, not the quality of a generated answer. No deploy or configuration changes.
