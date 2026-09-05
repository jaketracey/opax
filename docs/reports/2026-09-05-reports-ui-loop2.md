# Loop 2 — the ten faults, and what the fixed page showed next

## Fixed from loop 1

1. **The nav now holds.** It moved out of the head and became a direct child of
   the article, so its containing block is the whole report. Measured at 360 and
   390: pinned at 60px (the header height app.js measures over the CSS estimate)
   at scroll positions 1500, 4000 and the foot of the page. At 1280 it is static
   and scrolls away, as intended. The band is 45px — 44px of button and one
   hairline.
2. **A source row leads with what the record has.** With a named speaker it is
   the portrait, the name and the party chip; without one it is the title the
   record itself wrote, with no empty portrait circle and no party chip attached
   to nobody.
3. **The date is lifted out of the title.** A record whose `date` field is null
   carries the date at the end of its title in ISO. That trailing date is taken
   off and set the way every other date on the site is set. A leading segment
   that merely looks like a name is left alone: guessing there would eat a
   subject that is genuinely the record's.
4. **The provenance line moved to the foot**, beside the download of the data it
   describes. A v1 report keeps it under the title.
5. **Fold summaries are sentence case.** "Sources (3)", not "SOURCES (3)".
6. **The discovered debates fit one line each**, roughly halving what they cost
   before the first essay.
7. **"Read the speech" underlines its own text** instead of ruling under a 44px
   box.
8. **The tile's source link stands on its own line**, with its trailing ISO date
   read out loud: "Anthony Albanese, 12 Feb 2020".
9. **Source-row links clear 44px.**
10. **The first era has air** under the part heading.

The window the report covers also moved above the lede rather than below it:
which two spans are being compared is what a reader needs before the first
sentence, and it keeps the lede's own note and sources beside the lede.

## Critique of the fixed page

1. **The money part says the same thing twice, with different numbers.** "Who
   does the talking · Across the whole record" and the money part's "Most
   speeches on this topic" rank the same people from different counts. Two
   contradictory league tables on one page is worse than either alone; the
   voices block is the better one, so the bar list should stand down when a v2
   report carries `voices`.
2. **"The money beside the words" heads two corpus totals that are not money.**
   The speech and speaker counts answer how much record the report read. They
   need their own line of labelling.
3. **A position's window can contradict its citation.** "Stated since July 2024"
   sits above "Andrew Bartlett, 13 Feb 2008". The window says where the party
   stands in the recent debate; the date says when the clearest statement of it
   was made. Written as an assertion about when it was said, one of them is
   false. It has to be scope, not utterance, and a citation from before the
   window opens has to say so.
4. **The chip separator wraps to the next line.** When a long debate name wraps,
   the interpunct leads the second line: "· 212 speeches".
5. **The window line sits too tight against the lede.** It takes a top margin
   and no bottom one, so it reads as the lede's first line rather than as the
   frame around it.

## What was checked

At 360×780, 390×844, 430×932 and 1280×900, on the v2 fixture and on housing as
the v1 control.

| check | result |
| --- | --- |
| horizontal overflow | none at any width |
| console errors and warnings | none |
| nav pinned at foot of page (360, 390) | 60px |
| source-row and party links under 44px | none |
| v1 control: brief, figures, positions, moments, sections | 1, 2, 2, 3, 3 |
| v1 control: v2 parts shown | none |

The only remaining targets under 44px are the year columns inside the money
charts, which `columnChart` draws for the homepage and topic pages as well.
They are outside this page's boundary and were not touched.

Captures: `reports-ui-loop2-v2-<width>-<part>.png`, v1 control
`reports-ui-loop2-v1-housing-<width>-<part>.png`.
