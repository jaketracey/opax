# Bills UI — loop 1 critique

Captured from `portal/public` in this worktree, served statically, with the exposure agent's projection in `portal/public/bills`. Eleven scenes at 360×780, 390×844, 430×932 and 1280×900, scrolled in overlapping viewports, reduced motion on. Contact sheets and `bills-loop1-diagnostics.json` are in the scratchpad.

Nothing overflowed horizontally at any width and no scene threw a JavaScript error. Every touchpoint rendered: the bill page, the list, the person disclosure, the party block, the document panel and the year strip. What follows is what is wrong with them.

## The list says the same thing 5,313 times

Every row ends "no summary yet", because no bill in the register has a summary yet. A fact that is true of every row is not information about any row; it is noise the eye has to step over 5,313 times to reach the figures that differ. The row should mark a summary when there is one and stay quiet when there is not, and the section note should say plainly that summaries are still being written.

The row also runs its title and its meta together on one line, so a long title ends "…Bill 2022 Lapsed · 2022 · Indigenous Australians" with no break between the bill's name and its facts. At 360 the title is already two or three lines; the meta needs its own.

Three of the four filter labels are cut off at 360 — "All parliam", "All statuse", "Newest firs". A control whose value cannot be read is not a control.

## The register's sponsors are being shown as portfolios

335 bills carry a `portfolio` of the form `(s) WILKIE, Andrew, MP`. That is the register's own notation for a private member's bill: the field names the member who introduced it, not a portfolio. The page prints it raw in the portfolio slot, so a reader sees a department called "(s) BANDT, Adam, MP". The same string, read correctly, is the one thing the page otherwise says it does not know — the sponsor, which is null on every bill in this projection.

## A division takes a whole screen to say one thing

Six divisions run to five phone screens. Three causes, in order of cost:

**The party split lists every party at equal weight.** Labor 0–22 and Family First 0–1 take the same three rows. A division decided 33–30 across four parties ends up eleven rows deep because the crossbench each has a line. The parties that carry the division should be drawn; the single-member remainder belongs on one line.

**The coverage caveat is repeated in full under every division.** "14 of these 55 votes rest on a member's earliest or current recorded party rather than one observed on or before the day" is worth saying, and worth saying with each division's own numbers, but as a two-line paragraph six times over it drowns the splits it qualifies. It should be a clause, not a paragraph.

**Some questions are not questions.** TheyVoteForYou writes editorial notes into the same field, so a division's heading can read "This is a duplicate of an earlier division available here." or a 700-character paragraph beginning "This division relates to the Policy For privatising government assets…". Set in the serif at heading size, an editorial note is presented as the motion the House divided on. The first sentence can stand as the heading; the rest is a note and should be set as one.

## Smaller things the sheets show

- Speech rows read "Speaker not named" wherever the record has no speaker — nine times in a row on the Medibank bill. The date is the only fact those rows have; it should be the link.
- The two action buttons under a bill are 37.8px tall at 360, under the register's 44px floor. They are the site's shared `.action-btn`, so the fix is scoped to this panel.
- A person's open disclosure spends three stacked lines on "Passed, as at 16 Jun 2020." and "No summary yet." Those are one sentence.
- The party block arrives after the party's mentions and news because it appends only once the bill files have been read. Its place in the column should not depend on how fast a fetch returns.
- Two divisions on the same bill appear as two identical rows on the party page — same name, same stage, same date, different outcome. Without the question there is no way to tell what the party voted on twice.
- The party block's note says "from the 2 most recent bills the register holds divisions for". Two is what this 200-file fixture could open, not a claim anyone should read as a scope.
- The document panel repeats the bill's title directly under a headline that is already the bill's title.
- The Time Machine lists the eight *earliest* of a year's 209 bills, so 2001 is eight bills from February and March. A bill finishing its passage is the year's news; an introduction in February is not.
