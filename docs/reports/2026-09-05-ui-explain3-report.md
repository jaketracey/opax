# Explain this flow — phone polish report

## Outcome

The five-step scene now fits the actual phone plate instead of leaving a blank lower third, preserves readable hierarchy down to 360×780, and has a verified mobile motion lifecycle. The narrative title, deck and step rail remain visible below the sticky stage on the initial 390×844 view. Desktop keeps the established split-stage layout.

## Loop 1 — framing, gauge and label ladders

- Reframed the phone stage to `clamp(276px, 38dvh, 350px)` and fitted the camera to that shorter plate. The receipt clouds, outer rings and lower annotations remain inside the engraved frame at 360, 390 and 430px.
- Moved the receiver gauge note to a dedicated lower-edge caption so it never covers Labor, Liberal, or another recipient label.
- Reduced seven phone destinations to the five largest plus `+2 smaller`, with 11px opaque-backed labels and enough vertical separation to keep ribbons and rings readable.
- Corrected the first capture's edge crop and label density before committing the loop.

## Loop 2 — history, close clearance and citations

- Rebuilt the phone histogram as taller filled slivers, raised election and peak labels to 11px, and made the completed run resolve to the peak year and amount rather than giving a tiny terminal year the loudest type.
- Increased the top-right label clearance from the close control and added a narrow-only heading cap for the long Westpac source name.
- Widened and separated citation cards. Six same-year sources fit in six legible lanes at 360px without clustering or collision.
- Corrected the first capture's 360px heading contact and sub-pixel citation-lane contact before committing the loop.

## Loop 3 — limits, touch and motion lifecycle

- Raised both disclosure annotations to 11px, gave the state/federal note a paper ground, and anchored it beside the crossed arc.
- Made short narrative links at least 44×44px on phones; final diagnostics report no undersized dialog targets.
- Made the narrow-screen frame gate explicit at `1000 / 30`. Under the 390×844 SwiftShader probe, the scene rendered at 14.34fps with a 49.4ms minimum interval, safely below the 30fps ceiling.
- Confirmed a hidden tab adds zero rendered frames, visibility restoration resumes the loop, and closing adds zero frames.
- Found and fixed a disposal exception on non-mesh scene nodes. The repeated close probe confirmed the renderer is stopped and its canvas is removed.
- Verified both flow directions in reduced motion: all five step captures were pixel-identical over 600ms and retained the same peak, destinations, citations and disclosure information.

## Final phone critique

1. **Who gives:** the cloud and ranked rings now use the full plate without cropping. At 360px the long Westpac heading takes two lines and the five-label ladder is dense, but every label remains distinct; adding more labels would be a regression.
2. **How much, and when:** the histogram reads without deliberate squinting, and the peak owns the hierarchy. Ten 11px election labels across the 296px stage are the practical limit; another year should reduce tick density rather than shrink type.
3. **Where it lands:** the gauge caption has a clean lower-edge home. Minor ribbons still converge tightly near the receiver, but their quietness reflects their shares and the separate landing rings keep them traceable.
4. **What parliament said:** six same-year dates fit and remain individually highlightable. Full citation titles correctly stay in the narrative rather than overloading the stage.
5. **What this cannot prove:** the threshold card and state/federal note are now separate, readable statements. The latter wraps to three short lines at 360px and is the busiest remaining annotation, but it no longer floats away from the cross or touches another object.

Across the final 30 phone captures there are zero computed label overlaps, zero scene labels below 11px, zero undersized modal targets, zero horizontal dialog overflow, and a 14.4px minimum gap between the top-right label and close control. Lines intended as visible rules are at least one CSS pixel or filled geometry; the histogram no longer depends on one-pixel WebGL line segments.

## Verification and evidence

- Rebuilt `portal/public/explain.js` from `portal/graph/explain.ts` after every loop.
- Passed `npx tsc --noEmit -p .`, `node --check portal/public/explain.js`, and `git diff --check` after each loop.
- Confirmed `portal/wrangler.jsonc` has no diff; `CACHE_EPOCH` was not touched.
- Captured 90 standard phone screenshots: all five steps, both the Westpac donor and Liberal party routes, at 360×780, 390×844 and 430×932 in each loop.
- Captured 10 additional 390×844 reduced-motion screenshots and 10 final 1280×900 desktop-regression screenshots.
- All captures used WebGL through ANGLE/SwiftShader and are stored in `/private/tmp/claude-501/-Users-jake-Projects-opax/c097728b-8dc8-4ab0-90d6-0b7645b85942/scratchpad/` under the requested `explain3-loop<N>-<page>-step<K>-<width>.png` pattern.
- The final desktop matrix has no scene-label collision or dialog overflow; the split composition and information hierarchy are unchanged.

The local Wrangler shell logged unrelated 502s from background stats/search/matrix requests because those remote services were not present in the test environment. The Explain modal itself loaded from its real donor/party routes, and the visual, WebGL, geometry, motion and disposal checks completed.

## Paid asks

Zero. Every `/api/ask` request from step 4 was intercepted in the capture harness and answered with a deterministic six-source local stream. No request reached the paid endpoint.

## Check on a real phone

- On Safari and Chrome, scroll each viewport with browser chrome expanded and collapsed; confirm the sticky-stage handoff and pinned footer do not jump.
- Check the 360px state/federal note and the Westpac five-label ladder at device pixel ratio 2 or 3 and with modest text scaling.
- Watch the full history run on a fast physical device to confirm its perceptual pace at the enforced 30fps ceiling, then background and restore the tab.
- Enable the operating system's Reduce Motion setting and confirm each step appears immediately as the same informative still.
- Let step 4 use one approved real answer to check organic citation counts, longer dates/titles, focus highlighting and touch scrolling; this run deliberately used six same-year local citations.
- Rotate once to landscape and back, then close and reopen the modal to exercise camera resizing and WebGL cleanup under a real mobile GPU.

## Commits

- `91807a8` — loop 1: reframe phone flows and labels
- `28d8a42` — loop 2: strengthen history and citation cards
- `0a80b91` — loop 3: harden phone motion and cleanup
