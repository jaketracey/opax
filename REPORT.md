# Person entry pages — three improvement loops

Implemented on branch `page-person` in the assigned worktree. Nothing was deployed. No paid generation requests were made; the capture proxy rejected `/api/ask` and `nocache`. Only person-page JavaScript, appended page-scoped CSS and these reports changed. Worker endpoints, `CACHE_EPOCH`, knowledge-box configuration, shared graph modules and static data were untouched.

## Delivered

- **Loop 1 — rhythm and wayfinding** (`3cb5101`): compact available-section jump row after quick facts, nearby money-map link and labelled ask field, consistent serif headings, complete phone topic labels, 44px era controls, stacked votes, flowing organisation declarations and suppression of empty news.
- **Loop 2 — data and content** (`ab36997`): newest-sorted speaker retrieval, optional existing machine briefs through `/api/brief`, explicit Passage fallback, full-row speech links, honest retrieval captions, visible Just declared link and restrained four-line previews. Empty-era legends disappear.
- **Loop 3 — polish and accessibility** (`loop 3: polish person page typography and accessible controls`): auxiliary section/mention typography, readable fine print, equal-width vote totals, clean register metadata, larger source targets, keyboard focus preservation and reduced-motion treatment.

Portrait and quick facts remain as supplied. Existing linked bill names and the votes method accordion were retained and styled. No new endpoint was needed.

## Evidence and checks

Every loop covers Pauline Hanson, Jo Briskey, Anne Ruston and Philip Donato at **360×780, 390×844, 430×932 and 1280×900**. Baseline reading covered all four at 390px. Captures include the full page in overlapping viewports, open register and vote-method disclosures, and Then/Now states. Every contact sheet was visually reviewed, with full-size inspection of problem areas; loop notes record the defects and corrections.

Evidence directory:

`/private/tmp/claude-501/-Users-jake-Projects-opax/c097728b-8dc8-4ab0-90d6-0b7645b85942/scratchpad/`

Use `page-person-loop<N>-diagnostics.json` for the canonical capture list and `page-person-loop<N>-<person>-review-<width>.png` for complete contact sheets. Additional loop-3 interaction and state JSON files record target sizing, focused navigation, reduced motion, unavailable briefs, empty topics, retrieval failure and document navigation.

`node --check portal/public/app.js` and `git diff --check` passed per loop. No Worker edits required TypeScript checks. Final CSS verification confirms existing rules were not edited. Browser checks found no horizontal overflow or undersized measured primary controls at any requested width.

## Limits and real-phone checks

Machine briefs are shown only when already available; none were generated. The newest search is bounded by the existing indexed retrieval window, which the caption discloses. Missing retrieval falls back to the existing sample with a different heading. Source passages can include procedural speech. Shared expense chart labels remain compact because their renderer is outside this change's boundary.

On a real phone, check the jump row under quick facts; all five destinations on Hanson and Briskey, with absent sections omitted on Ruston and Donato; complete topic names with readable counts; switching Then/Now; bill-link tapping; opening long register categories and their source links; and tapping any part of a speech row. Check sticky-header clearance, keyboard focus, reduced-motion settings, and ordinary cached ask navigation. The ask submission was intentionally not exercised by the capture harness.
