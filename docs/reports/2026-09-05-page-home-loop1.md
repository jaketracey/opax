# Loop 1 — framing and rhythm

Read the 4 September money report and 5 September Explain loop report before starting. Baseline 360px end-to-end captures exposed small uppercase module headings, a dense state caption, shallow money plate, stacked report promos and cramped declaration text.

Changed the home module headings to the existing serif section-title style, regularised section gaps, made suggested questions and map links at least 44px tall, separated state donation links from the coverage note, and gave the money map a 320px phone plate and a 48px, content-width opening button. All CSS is appended under the page-home banner.

## Capture review

The three phone widths retain readable page gutters, map captions and controls, with no document horizontal overflow. Desktop retains the two-map composition and main/rail grid. The South Australia popover and a programmatically selected Westpac card exercise the existing map controls without navigating to an ask. The money host grows; long card content scrolls within it rather than escaping its frame.

Harsh findings from the first loop captures:

- My added module margins doubled the grid's existing gaps: too much blank paper between sections. Removed those margins and set the grid gap alone to 2.5rem.
- The money card close target was only 28px and its heading used the control font. Increased the target to 44px, reserved title clearance and used the serif. Also raised the state popover's metadata size.
- News still fragments its pivot into multiple lines; declarations repeat dates and confine prose beside portraits; reports still form a long vertical stack. These are the next loop's content work.
- The miniature map remains dense. Its engine decides label placement; readable industry chips remain the alternative to tapping tiny nodes.

## Verification

`node --check portal/public/app.js` and `git diff --check` pass. No Worker edits. Captures cover top, every visible section (continuation frames for tall sections), South Australia open, and Westpac open at 360×780, 390×844, 430×932 and 1280×900. Filenames: `page-home-loop1-<section>-<width>.png` in the requested scratchpad. Repeated captures verify the spacing and control fixes.

The initial installed Chrome capture session produced invalid viewport images; those loop-1 images were discarded and replaced using the isolated Chromium headless shell, ANGLE/SwiftShader. Static assets are from this worktree; `/api/news`, `/api/stats`, `/api/recent` and map retrievals use the live service. The local proxy blocks `/api/ask` entirely and rejects `nocache`. No generation, deployment or configuration change.
