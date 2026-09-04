# Party entry pages — three improvement loops

Implemented and committed on `page-party`, entirely in `/Users/jake/Projects/opax/.claude/worktrees/page-party`. Nothing was deployed.

## What changed

**Loop 1 — phone readability (`4e3c7d5`)**

- Receipts show the newest ten years on phones, with Show all 27 years / Show newest 10 years. Desktop keeps the full history.
- Every row shows its total and not-itemised percentage. One linked row opens the AEC source; bars keep the same scale when expanded.
- The legend fits one line at 390/430px and two at 360px.
- Donor and creditor names wrap, with amounts always visible. Funding tiles and their notes have a clearer phone layout.

**Loop 2 — people and context (`6cff51a`)**

- Added sitting-member and historical-speaker counts from parliamentarians.json, deduplicated by member ID. Current affiliation drives sitting counts; speech-party history drives speaker counts.
- Added working party-filtered people-directory links through directoryHash.
- Added quiet industry dot labels through barList's existing options; donor names remain links to donor entries.
- Added a party-only mentions renderer with stored /api/brief summaries, passage fallbacks, source links, and empty/error/stale-response handling.
- Funding headings, benefits and parliamentary reading text use the site's serif register.

**Loop 3 — density and accessibility (`a95e1c3`)**

- Restored compact desktop bar layouts and aligned the third phone tile's number with its label.
- Bounded long passage fallbacks while preserving complete stored briefs.
- Added explicit focus styling and 44×44px minimum link targets in the redesigned sections.
- Removed invisible receipt-table tab stops while preserving its accessible data.
- Added scoped reduced-motion rules and guarded detached funding renders.

## Verification and evidence

Each loop passed `node --check portal/public/app.js` and `git diff --check`. No Worker changes were needed, so the conditional Worker TypeScript check did not apply.

For each loop, captured and inspected Liberal, Labor, One Nation and Greens at **360×780, 390×844, 430×932 and 1280×900**: top, complete scroll path, every distinct section and expanded/oldest receipts. The map's default open detail card is included. Final keyboard-expanded captures were also reviewed at native phone width.

The final checks confirmed:

- No document overflow or donor/amount collisions across all 16 party/size combinations.
- 14px receipt figures, 13px percentage labels, ten collapsed phone rows, 27 expanded rows, and 27 desktop rows.
- Keyboard expansion retains focus and collapse restores ten rows.
- All four directory links apply the correct party filter; leading donor links open their actual entries.
- No invisible table links and no undersized visible links in the redesigned sections at 390px.
- No running animations in those sections under reduced motion; normal-motion layout also checked.
- Stored briefs were present for 4/5 Liberal mentions, 4/5 Labor, 2/5 One Nation and 5/5 Greens. Missing briefs retained retrieved passages.
- Focused data checks covered receipt ordering and clamping, short histories, duplicate member IDs, historical party membership, escaped briefs, missing briefs and stale navigation.

Evidence directory:

`/private/tmp/claude-501/-Users-jake-Projects-opax/c097728b-8dc8-4ab0-90d6-0b7645b85942/scratchpad/`

Files use `page-party-loop<N>-<party>-<state>-<width>.png`; per-page `sheet` images collect the complete scroll review. JSON files record the matrices, geometry and interactions. `party-server.py`, `party-capture.py`, `party-interactions.py`, `party-geometry.py` and `party-verify.cjs` preserve the local verification harness.

The browser connector was unavailable. Captures used isolated headless Chrome with ANGLE/SwiftShader against a static server rooted in this worktree. The server forwarded free live API reads and cached them locally; it rejected every ask endpoint and nocache request. No ask-driven view was opened and no generation call was made.

## Scope and remaining limits

No requested content improvement was skipped. Counts are explicitly **directory counts**, not an uncapped census: its five-speech floor, 1993 start and 4 September 2026 snapshot are disclosed. Identical member IDs are counted once; different people without a shared ID are not guessed to be the same person. The directory's existing filter includes historical party membership, so it is not a current-only members list.

The shared 3D map and global chrome retain their existing behavior. Its dense open card still occupies much of the first phone scroll; map-internal controls were outside the redesigned-section target audit. Full stored briefs can be several paragraphs' worth of phone height. These are the main remaining density limits.

Only party rendering paths in app.js and appended, scoped CSS were changed. barList itself, existing CSS rules, index.html, Worker endpoints, CACHE_EPOCH, knowledge-box configuration, graph files, other modules and static exports were not changed. Pre-existing untracked logs and node_modules were left alone.

## Check on a real phone

- In Safari and Chrome, expand and collapse years, rotate, and return from a donor or filtered directory. Check scroll position and focus with browser chrome expanded/collapsed.
- At 360px and increased text size, read the percentage column, longest Labor donor names, industry labels and funding source note.
- With VoiceOver or TalkBack, confirm the toggle announces expansion, receipt links announce the complete figures, and the accessible table can be read without invisible keyboard links.
- Check the unchanged map's internal scroll, close control and late-loading focus behavior on a real GPU; avoid its ask actions unless using an approved cached path.
- Confirm the directory snapshot is refreshed through the normal data pipeline before treating sitting counts as current beyond this snapshot.

## Commit summary

- `4e3c7d5` — loop 1: phone receipts, names and figures.
- `6cff51a` — loop 2: members, industries and stored briefs.
- `a95e1c3` — loop 3: typography, density and keyboard access.
- This report is recorded in a separate documentation commit after the three implementation loops.
