# Topic pages and topics index — three-loop report

Implemented and committed on `page-topic`, entirely within `/Users/jake/Projects/opax/.claude/worktrees/page-topic`. Not deployed.

## Delivered

- **Loop 1 — mobile reading order:** moved the editable ask field, search and standing-report link immediately below counts; removed the redundant topic infobox. Party/parliament names wrap, decade labels remain complete, coverage reads as a caption. Arc years use serif figures above entries on phones and in the desktop margin. Briefs are unboxed serif reading text, separated by hairlines.
- **Loop 2 — data and content:** render 30 passages immediately after search returns, then read briefs serially in batches of 24 and 6. “Show 30 more” appends passages and requests only that slice’s briefs. Chronology resets to 30, reuses loaded briefs, and handles in-flight order changes. Speaker/party and parliament/date have distinct lines. All 21 index topics have counts, one-line canonical taxonomy descriptions and small tide sparks from one free read.
- **Loop 3 — polish and accessibility:** darker bronze controls, visible focus outlines, 44px targets, explicit reduced-motion rules, clearer captions, and top shortcuts to the arc and available money section. Spark scaling preserves relative values. Optional report failures no longer prematurely suppress topic counts.

## Verification

`node --check portal/public/app.js` and `git diff --check` passed each loop. No Worker or module changes required a TypeScript build.

Headless Chrome loaded the worktree’s static `portal/public` through a local server. Free API reads were proxied to `https://opax.com.au` and cached locally. The proxy rejects ask/nocache paths. No paid generation calls were made; the ask form was inspected and focused but not submitted. The external Explain flow was not opened.

Reviewed 56 loop-1 captures, 72 loop-2 captures and 88 loop-3 captures, including final footer, focus and jump states. The matrix covers housing, gambling and the index at 360×780, 390×844, 430×932 and 1280×900. No horizontal page overflow was detected. Loop reviews document findings and the corrections made before each commit.

Behavioral probes held back brief responses to prove immediate passage rendering, then verified batches `[24, 6]`, next-slice-only reads, ascending oldest dates, loaded-brief reuse, focus on the first added item and exhaustion at 153 housing matches. Rapid toggling during a pending request still used only `[24, 6]`; 503 brief responses retained passages. All 21 index rows exceeded 44px. Topic buttons, navigation links, source/speaker links and bar links met 44×44 across the four widths. Both section jumps transferred focus to their heading. Mock briefs were confined to behavioral tests; the main captures used live retrieval responses.

AST comparison verified JavaScript edits are confined to the allowed topic functions and one directly adjacent taxonomy-description helper. Original CSS remains byte-for-byte intact, followed by the single requested banner and scoped overrides. `index.html`, Worker endpoints, `CACHE_EPOCH`, knowledge-box configuration, graph code and static data were untouched. Existing untracked logs and node_modules were left alone.

## Evidence and limits

Captures and reusable capture/probe scripts are in:

`/private/tmp/claude-501/-Users-jake-Projects-opax/c097728b-8dc8-4ab0-90d6-0b7645b85942/scratchpad/`

Image names use `page-topic-loop<N>-<what>-<width>.png`; diagnostic JSON sits alongside them. The local server runs on port 8793 when started with `page_topic_server.py`.

The search request still retrieves up to 200 matches; progressive rendering and brief reads are client-side. Oldest means oldest within that returned window, not the entire corpus. The live sample returned 153 housing and 114 gambling matches. Missing briefs retain passages; missing debate names retain the source title. Housing has no money section under the existing industry mapping, which was deliberately preserved. Long taxonomy descriptions visually ellipsise to one line on phones; their full text remains in the accessible link name and title. Descriptions mirror the canonical taxonomy and must be kept in sync if it changes. No endpoint changes were necessary.

## Check on a real phone

- Safari and Chrome: focus the ask field with the keyboard open; verify report links remain easy to reach.
- Tap “Show 30 more” and switch chronology on a slow connection; check reading position while real briefs arrive.
- Use VoiceOver/TalkBack to check source links, chronology state, full index descriptions and section-jump focus.
- Check enlarged text, reduced motion, browser chrome expansion/collapse and rotation, particularly long party names at 360px.

## Commits

- `4511a2d` — loop 1: restore mobile topic reading order and typography
- `f07ddf0` — loop 2: progressively enrich topic arcs and add taxonomy index rows
- `b93944c` — loop 3: polish topic controls, navigation and accessibility
