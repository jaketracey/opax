# Document page — three completed loops

Completed locally on `page-doc` in `/Users/jake/Projects/opax/.claude/worktrees/page-doc`. Nothing was deployed. No paid generation or ask calls were made; the capture server blocked ask/followup endpoints. `CACHE_EPOCH`, Wrangler configuration, knowledge-box configuration, Worker code, other pages, `parli/` and static data were not changed.

## Changes per loop

1. **Reading and controls:** source-line paragraphs, 17px Merriweather phone reading text with a 62ch maximum measure, a prominent normal-path Ask link, two toolbar rows at normal phone sizes, 44px controls and one quiet research line. Long debate headers gain full width; citations use plain text and hairline separation instead of nested panels.
2. **Content and discovery:** an exact-identity timestamped opening-banner guard; conservative sentence-boundary chair/interjection styling; bracketed committee context separated from spoken words. Source `textContent` remains byte-for-byte equal to the API text, including whitespace. Topics become accessible sentence-case chips. Similar opens up to three unique results inline, with stored `/api/brief` summaries or labelled source-passage fallbacks, retry and protection against late responses after navigation. Correct committee chamber wording and neutral handling of Senate affiliation metadata.
3. **Polish and accessibility:** serif section headings, a legible summary disclaimer, quieter machine-summary labelling, tabular numbers, explicit focus rings, close controls and Escape with focus restoration, reduced-motion overrides and text-size-aware toolbar/header reflow. Related results avoid repeating the same speaker name.

## Verification and evidence

Read the recent Explain implementation reports before using the same static-server/headless-Chrome approach. Actual live read-only API responses supplied:

- `speech-1286344`: Philip Donato, NSW, Cost of Living, 19 March 2025; malformed timestamp banner and no paragraph delimiters.
- `speech-773946`: Kim Carr, federal Senate, Housing and Accommodation Affordability, 10 August 2006; stored machine summary, topic and extensive source paragraphs.
- `speech-424631`: Watt, Senate committee, 9 February 2026; stored summary, long debate heading and short intervention.

Each loop passed `node --check portal/public/app.js` and `git diff --check`. No Worker changes, so TypeScript compilation was not required. Renderer checks cover verbatim output, unrelated/quoted banners, CRLF/newlines, chair calls, abbreviations, HTML-like text and committee context. Browser checks cover loading, failure/retry, empty results, missing briefs, stale requests, close/focus, Escape, keyboard focus and 200% text. No page errors or ask requests were observed in the interaction probe. All 12 final document/viewport combinations had zero horizontal overflow and no document links/buttons smaller than 44px.

There are 207 final loop images (48 + 60 + 99), plus 12 baseline captures, in:

`/private/tmp/claude-501/-Users-jake-Projects-opax/c097728b-8dc8-4ab0-90d6-0b7645b85942/scratchpad/`

Names follow `page-doc-loop<N>-<what>-<width>.png`; per-loop geometry JSON and the capture/interaction/renderer scripts are alongside them. Captures include top, every page section present, open citations and inline similar results, plus explicit synthetic edge-state images. The chair-call fixture is synthetic; the three document pages and normal similar-result lists use real API data. Screenshots were inspected as contact sheets and selected full-size views. See `LOOP1.md`, `LOOP2.md` and `LOOP3.md` for critiques and fixes.

An automated boundary comparison confirms that all pre-existing CSS is unchanged, with overrides under the one required banner; HTML edits stay inside `#panel-doc`; JavaScript edits stay in the document rendering/toolbar block. Pre-existing untracked logs and `portal/node_modules` were left alone.

## Deliberate limits

Previous/next in a debate is skipped. Search provides relevance/date ordering over a potentially truncated retrieval window, not guaranteed turn sequence; adjacent IDs would be a guess. There is no new endpoint.

Paragraphs follow actual source line structure. The NSW sample has none, so this change does not invent editorial paragraph breaks. Source typos, malformed time spacing and concatenation artefacts remain unchanged. Only confidently identified banners/calls receive special styling. Similar results may be tangential; known topic filtering narrows the search but does not prove substantive relevance. The Ask link uses the existing normal cached route; no answer was opened or generated during testing.

## Check on a real phone

- Read a long speech in Safari and Chrome with browser chrome expanded/collapsed; check serif comfort, paragraph gaps and the long committee heading.
- Use system text scaling, landscape rotation and Reduce Motion; confirm controls reflow and remain reachable.
- Use VoiceOver/TalkBack to open and close citations/similar results, follow a topic, and check focus restoration and source/summary separation.
- Select and copy a speech passage and the longer BibTeX/RIS citations; confirm the byline and chair-call presentation do not confuse selection.
- Check normal cached Ask navigation separately without forcing regeneration.

## Commits

- `fa64b84` — loop 1: improve document reading and mobile controls
- `3698cb8` — loop 2: preserve speech structure and add inline related reading
- Final loop commit — loop 3: polish document typography and accessible interactions (includes this report and `LOOP3.md`).
