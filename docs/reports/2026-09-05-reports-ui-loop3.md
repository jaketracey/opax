# Loop 3 — the page meets the reports it was built for

Loops 1 and 2 were read against a fixture: `indigenous.json` with the v2 fields
invented and marked as invented. This loop is the first against the reports the
core agent actually generates — First Nations and housing, both `version: 2`,
both roughly 135 KB. A fixture can only be wrong in the ways its author
imagined, and the real files were wrong in ways he had not.

## Fixed from loop 2

1. **One league table, not two.** The money part's "Most speeches on this topic"
   stands down when a v2 report carries its own `voices`. Confirmed on housing:
   the money part now heads "Speeches per year", "Donations per financial year"
   and "Largest donors", and nothing else ranks speakers.
2. **The corpus totals took their own line.** "How much record this reads" under
   "The money beside the words", because a speech count is not money.
3. **A position's window is scope, not utterance.** "Their position in the debate
   now", with a citation from before the window saying so.
4. **The chip's tally is a column of its own**, so a wrapping name can no longer
   push an interpunct to the head of a line.
5. **The window line frames the lede** rather than opening it.

## What the real reports broke

Eight faults, in the order they cost the reader most. All eight are fixed; the
figures below are after.

1. **The tide strip lost half its bars.** `over_time.tide[].decade` arrives as
   its own display label — "1993–99", "2020–26" — not as the key the Worker
   uses, so a key lookup matched only "2000s" and "2010s". The two decades that
   dropped are the first and the last: exactly the pair the report's claim about
   movement rests on, and the strip quietly drew a shorter, flatter history than
   the data holds. It now matches a label, a key or a leading year. Four bars on
   both reports at every width.
2. **A figure's basis line was not English.** `denominator` is usually a phrase,
   so the ratio assembled as "4.6 of population of Queensland per cent" and
   "24,561 of students students". The count line is drawn only when the
   denominator is genuinely a count; when it is a phrase, the tile's own label
   already says it. And a figure measured across nine years now reads "over
   1996-97 to 2004-05" rather than as at a range.
3. **A fold claimed more evidence than the answer used.** Each essay folded
   twenty speeches under an answer built from five to eleven. The generator
   marks the difference with `cited`; the summary now reads "Sources: 9 cited, 11
   more retrieved", the cited speeches lead, and the rest sit under a line that
   names them as the rest.
4. **A figure tile was mostly citation.** An estimates record titles itself in
   two hundred characters, which drew nine lines of underlined link beneath a
   two-word number and stretched its half of the grid to twice the height of the
   figures beside it. The tile cites the speaker and the date; the whole title is
   on the link and one tap away. Tile heights across a grid are now within 8px of
   each other on First Nations, 60px on housing.
5. **Four hundred source rows were built before a reader opened one fold.**
   Thirteen folds of twenty, plus 190 deduplicated at the foot, each with a
   portrait to look up. They are built on first open now; a superscript that
   jumps into a fold fills it first.
6. **A run of speeches repeated its debate under every speaker.** Eight rows,
   eight copies of "Inquiries Amendment (Yoorrook Justice Commission Records and
   Other Matters) Bill 2024 - Second reading". A run says it once, and the row
   that changes debates says the new one.
7. **An era said its span twice, the second time in machine.** "1993–2009 ·
   1993-01-01–2009-12-31".
8. **The chips cost a line each to procedure.** Five of the eight First Nations
   debates end in "- Second reading", which is where in the machinery the debate
   was reached, not what was argued. Dropped from the chip, kept in the tooltip
   and the accessible name. The block fell from 545px to 485px at 360.

## Critique of the fixed page

Three faults remain, and two of the three are not mine to fix.

1. **Not one citation appears anywhere on the page.** The whole superscript
   apparatus — true superscripts, the invisible 44px halo, tapping one to open
   the fold and reveal that speech with a way back to the sentence — is wired and
   never fires, because the generated `answer` and `lede.text` carry no `[n]`
   markers. A reader gets prose, then a fold, and no way to tell which speech
   backs which sentence. The page converts plain "[n]" markers automatically, so
   this is one line in the generator; asked of the core agent.
2. **A source row is a pointer, not evidence.** The v2 source objects carry
   slug, title, speaker, party, state, date and cited, but no passage. The rows
   under `over_time.key_moments` do carry `brief`, and they read completely —
   portrait, name, parliament, date, the passage, "Read the speech". Everywhere
   else the row can only say that a named person spoke in a named debate on a
   date, which is the one thing the fold exists to save the reader looking up.
   `snippet` on each source would fix it with no page change; asked of the core
   agent.
3. **The head is two and a half screens before the first essay.** 1858px at 360:
   a 760-character lede, the window line, the fold, the nav, the part heading,
   the note, and 485px of chips for eight debates. Every part of that is
   something the reader asked for, and the chips are the shape of the argument.
   But eight full-width chips on a phone is the largest single block on the page
   before any argument starts, and it is worth watching if a future report
   discovers twelve.

## What was checked

Headless Chrome over CDP against a static server rooted in this worktree, with
an overlay directory carrying the two generated reports. `/api/*` is refused by
the server, so nothing here can reach the live index and no generation call is
possible. The harness forces `prefers-color-scheme: light`: Chrome's automatic
dark mode had been repainting the capture without changing a single computed
style, so the desktop strips of the first run were a browser artefact, not the
page.

At 360×780, 390×844, 430×932 and 1280×900, on both generated reports and on
gambling as the v1 control:

| check | First Nations | housing | gambling (v1) |
| --- | --- | --- | --- |
| horizontal scroll | none | none | none |
| console errors from the page | none | none | none |
| tide bars | 4 | 4 | n/a |
| targets under 44px | 0 | 0 | 25 (pre-existing) |
| nav band / pinned at 4000px | 45px / 60px | 45px / 60px | n/a |
| v2 parts shown | 4 of 4 | 4 of 4 | none |
| v1 layers shown | none | none | all |

The only console line at any width is a 403 on `/api/stats`, which is the
harness refusing the site-wide statistics call; it appears identically on the v1
control. The only targets under 44px are the v1 page's own party chips and the
year columns inside the money charts, both drawn for the homepage and topic
pages as well and outside this page's boundary.

Captures: `final-<report>-<width>-<part>.png`, with `fold-open-390-*.png` for a
source fold opened, and region captures of the figures, the tide and the voices.
