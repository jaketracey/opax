# Ask and chat — three improvement loops

Completed on `page-ask`, exclusively in this worktree. No deployment, paid generation, CACHE_EPOCH change, knowledge-box change, Worker change or static-data change.

## Delivered

- **Loop 1 — reading and layout:** constrained serif answer measure, paragraph and heading rhythm, 44px two-row phone actions, sentence-case source disclosure, date ruler inside Sources, sans questions and serif chat answers, pinned phone composer with safe-area clearance.
- **Loop 2 — evidence and content:** bronze superscript citation controls mapped from explicit response character ranges; source units with serif title, party/speaker/parliament/date and two-line passage; all cited sources retained in chat; “also retrieved” collapsed separately; three wrapping follow-ups on both Ask and chat with a quiet fade. The stamp says “Viewed” because cached content is not newly generated.
- **Loop 3 — interaction and accessibility:** source focus and “Back to answer”, on-stage pending loader and cleanup, composer visual-viewport handling, constrained options scrolling, readable ruler dates without overlapping invisible targets, reduced-motion checks, narrower desktop sources and 44px source metadata links.

Only the permitted Ask/chat functions and adjacent helpers were edited in app.js. Shared renderers retain their original behaviour when no Ask/chat evidence or passage option is supplied. HTML edits are confined to panel-ask. Existing CSS rules are unchanged; overrides sit beneath the single requested page banner.

## Verification and evidence

`node --check portal/public/app.js` and `git diff --check` passed in every loop. No Worker changes required TypeScript compilation.

Headless Chrome served this worktree's `portal/public` directory, with ANGLE/SwiftShader available for the existing loader. Captures were reviewed at 360×780, 390×844, 430×932 and 1280×900: **44 in loop 1, 72 in loop 2, 95 in loop 3**, plus contact sheets. Final evidence includes answer paragraphs, actions, cited/retrieved list sections, options, citation round trips, Ask/chat suggestions, chat pending/completed states, reduced motion and shorter viewports.

All 12 citation controls passed destination and return-focus checks. Seeded chat and reload preserve citations; all 11 cited sources remain separate from the seven retrieved-only sources. Invalid ranges produce no invented links. Shared plain-answer rendering remains unchanged. No browser exceptions were recorded in the interaction check. All four layouts report no horizontal document overflow; phone composer bottoms match viewport heights. Follow-up animation is `none` under reduced motion.

Captures: `/private/tmp/claude-501/-Users-jake-Projects-opax/c097728b-8dc8-4ab0-90d6-0b7645b85942/scratchpad/page-ask-loop<N>-<what>-<width>.png`.

Local reproducibility: `/private/tmp/page-ask/serve.py`, `capture.py`, `check.py`, `ask.json` and `ask-headers`. The server binds port 8876 and serves only this worktree. `python3 /private/tmp/page-ask/capture.py 3` repeats the final matrix; `python3 /private/tmp/page-ask/check.py` repeats interaction checks.

## Cost boundary and remaining limits

The exact question “What has parliament said about gambling?” was requested once through the normal live API path and returned **x-opax-cache: HIT**, cached at `2026-09-04T13:41:55.834Z`. No nocache parameter/header was used.

The Worker explicitly bypasses caching for contextual chat turns. Therefore the follow-up was exercised with a **local replay fixture**, using text from that cached answer, and deterministic local suggestion fixtures. All browser ask/follow-up requests were intercepted; no contextual chat or follow-up generation was sent live. A real generated follow-up was deliberately skipped to honour the no-paid-calls boundary.

Literal model-written [n] markers without explicit range evidence remain unlinked: guessing their source mapping would risk false attribution. Generic source titles and missing parties were not rewritten. Native copy/export prompts and shared site chrome were not redesigned. No new images were introduced.

## Check on a real phone

- Open and dismiss the keyboard in Safari and Chrome; scroll with browser chrome expanded/collapsed, then rotate. Confirm the composer stays above the keyboard and the last suggestion remains reachable.
- Tap a citation, read its passage, use Back to answer, and repeat using VoiceOver/TalkBack. Check focus and announcement order.
- Check two-line passages, metadata, 44px targets and ruler dates with larger system text and high device pixel ratio.
- Open the options popover, scroll to its last filter, and verify touch scrolling stays within it.
- Enable Reduce Motion and verify suggestions appear immediately; check the pending illustration on a physical device using intercepted/replayed data if the zero-cost boundary still applies.

## Commits

- `8f8a428` — loop 1: improve Ask reading and phone chat layout
- `890fb64` — loop 2: connect citations and improve sources and follow-ups
- Final loop commit: `loop 3: polish Ask navigation and chat accessibility` (includes LOOP3.md and this report).
