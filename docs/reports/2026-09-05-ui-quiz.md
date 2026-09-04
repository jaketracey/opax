# The Record Quiz redesign

## What shipped

### `3fa6148` — Redesign The Record Quiz around interactive data rounds

- Removed the quiz's inner card, border, bronze top rule and narrow 40rem frame. The quiz now uses the dialog's paper and padding as its surface, with a 68rem desktop measure and no extra horizontal padding on phones.
- Added the opening deck picker for Money, Words or Mixed and a choice of 8 or 12 questions.
- Added seven playable answer forms: multiple choice, true or false, higher or lower, tap-to-order, figure slider, year ruler and portrait comparison.
- Added tick-rule progress, points, a bronze streak multiplier capped at ×4, graded slider/year scoring, per-answer fact/why/provenance reveals, and correct/wrong feedback motion.
- Added a closing ledger with points, rank, accuracy, best streak, every correct answer and its proof link, plus Play again, Change deck and clipboard-only Copy your result actions.
- Added digit selection, Enter confirmation, native arrow-key slider/ruler control, focus management, 44px controls and a complete reduced-motion mode.
- Made each replay use a fresh seed and reject the immediately previous round signature.
- Made proof links close the modal before the shell navigates to the cited OPAX route.
- Expanded static loading to the parliamentarian roster and year briefs. No API is required to build a complete round.
- Added `portal/test/quiz.test.mjs`, which builds every template against the shipped JSON, verifies every portrait file, validates question contracts and checks 8/12-question Money, Words and Mixed rounds at several seeds.

### `9aec3b1` — Polish quiz dialog states and responsive verification harness

- Put `qz-test.html` inside the same `.game-dialog`, `.game-dialog-head` and `.game-dialog-body` shell as Explore, including the real close-control treatment.
- Tightened the 390px opening layout so deck, length and start controls appear together; retained explanatory deck copy at larger widths.
- Changed the desktop result recap into a two-column ledger so its actions remain visible.
- Reset dialog scroll at the start of questions and results, while moving focus without unintended scroll jumps.
- Corrected endpoint label anchoring on slider reveals and contained the live-region box so neither can create mobile horizontal overflow.
- Tightened money distractor validation so numeric alternatives are real figures from the same data and within one order of magnitude.

## Question templates and data

| Template | Form | Deck | Shipped data read |
|---|---|---|---|
| `money-industry-most` | Multiple choice | Money | Donor nodes in `graph/money.json`, aggregated by industry |
| `money-industry-magnitude` | Multiple choice figures | Money | Real industry totals from `graph/money.json`; peer totals supply every alternative |
| `money-party-from-industry` | Multiple choice | Money | Donor industries plus donor-to-party edges in `graph/money.json` |
| `money-true-false` | True or false | Money | Methodology, exclusions and donor count in `graph/money.json` metadata |
| `money-donor-higher-lower` | Higher or lower | Money | Two real donor lifetime totals from `graph/money.json` |
| `money-donor-order` | Tap to order | Money | Three donors from one industry in `graph/money.json` |
| `money-donor-figure` | Log figure slider | Money | One donor answer and the real min/max totals of its industry in `graph/money.json` |
| `money-top-donor-in-report` | Multiple choice | Money | `stats.donations.top_donors` in the six shipped topic reports |
| `money-party-peak-year` | Year ruler | Money | Party `byYear` disclosure totals in `graph/money.json`; incomplete 2025 is excluded |
| `words-portrait-topic` | Portrait comparison | Words | Report `stats.top_speakers`, joined to `parliamentarians.json` and `/photos/<pid>.webp` |
| `words-peak-year` | Year ruler | Words | Report `stats.timeline`; the possibly partial final year is excluded |
| `words-topic-higher-lower` | Higher or lower | Words | Real `stats.speech_count` values from two topic reports |
| `words-year-order` | Tap to order | Words | Three real year counts from one report `stats.timeline` |
| `words-topic-figure` | Log figure slider | Words | A report speech count, bounded by the smallest/largest real report counts |
| `words-year-voice` | Portrait comparison | Words | `/years/<year>.json` voice samples, joined to `parliamentarians.json` and shipped portraits |
| `words-record-true-false` | True or false | Words | Collection/source facts in `corpus.json` |
| `words-biggest-source` | Multiple choice | Words | Real document totals from three `corpus.json` sources |

All generators remain pure. Choice alternatives, order values and range bounds are selected from the same loaded records as their answer. Each question returns the shared question contract plus only the form-specific fields needed to render it.

## Scoring and interaction

- Ordinary choices and exact orderings are worth 100 base points.
- Figure guesses score 100 within 10%, 75 within 25%, 40 within 50%, and 10 otherwise. A guess within 25% continues the streak.
- Year guesses score 100 exact, 50 one year away, 25 two years away, and zero after that. Only the exact year continues the streak.
- Consecutive correct answers apply ×1, ×2, ×3 and then ×4 to the base points. A miss resets the next multiplier to ×1.

## Deliberately not used

- `/api/matrix`, `/api/topics` and `/api/tide` are not round dependencies. The two former live-matrix templates were replaced by static report/year forms so every template can be validated from shipped files and the quiz remains complete on a plain static server.
- `/api/search` is never called by the quiz. It appears only as the destination of a year-voice proof link after a player chooses to leave the quiz. `/api/ask` was never called.
- Register-of-interests data was left out because it does not fit either selected deck as directly as donations or parliamentary speech, and adding a third subject area would dilute the ten-minute deck choice.
- Report quotes were not turned into unattributed quote guessing: the portrait comparisons provide the requested people interaction without stripping a quotation from its surrounding speech.
- No sound was added, as required.
- No deploy was performed and `portal/wrangler.jsonc` was not changed.

## Verification

Commands run successfully:

```text
node --check portal/public/quiz.js
node --check portal/public/app.js
node portal/test/quiz.test.mjs
git diff --check
```

The Node test reports 17 validated templates and complete Money, Words and Mixed rounds at 8 and 12 questions across three fixed seeds.

The headless Chromium pass also verified:

- zero console errors and zero HTTP errors;
- no horizontal overflow at 390px on opening, all captured question forms, reveal or result;
- every visible quiz button/range control is at least 44px high;
- number keys select, Enter confirms, and arrow keys change measured answers;
- `prefers-reduced-motion: reduce` removes answer animation and progress transitions;
- the result returns to scroll position zero with all eight recap entries.

Final screenshots are in:

`/private/tmp/claude-501/-Users-jake-Projects-opax/c097728b-8dc8-4ab0-90d6-0b7645b85942/scratchpad/`

At each of 390px and 1280px:

- `quiz-<width>-opening.png`
- `quiz-<width>-question-portrait.png`
- `quiz-<width>-question-order.png`
- `quiz-<width>-question-slider.png`
- `quiz-<width>-reveal.png`
- `quiz-<width>-closing.png`

## Check by eye on the live site

- Open The Record Quiz from Explore and confirm the production dialog width, sticky close button and backdrop feel continuous with the quiz surface.
- Follow one proof link from a reveal and one from the final recap; confirm the dialog closes and the SPA displays the donor, party, report, methods or filtered search route.
- Scan several random Words rounds for portrait crops and name joins, especially state/federal names near the edge of roster coverage.
- Play a 12-question round on a short phone and confirm the dialog's native vertical scrolling remains comfortable through a long reveal and the closing recap.
- Confirm Merriweather and Public Sans load before judging final line breaks; the harness screenshots used the production font imports.
- Confirm the first live load of the 29 small year files is acceptable through the production CDN and cache.

## Commit summary

- `3fa6148` delivers the redesigned game, pure generators and real-data Node coverage.
- `9aec3b1` delivers responsive polish, the real-dialog harness and fixes from headless visual QA.
