# Bills UI — loop 3 critique

Twelve scenes at 360×780, 390×844, 430×932 and 1280×900, captured from
`portal/public` in this worktree with the exposure agent's projection in
`portal/public/bills`. Reduced motion on, overlapping scroll positions, contact
sheets and `bills-loop3-diagnostics*.json` in the scratchpad.

Nothing overflows horizontally at any width, no scene throws, and every
touchpoint still renders. The loop 2 collapses hold: the Medibank bill shows
eight divisions, the sponsors read as people, the notes are notes.

Loop 3 found the same defect loop 2 fixed, twice more — once in a section loop 2
did not look at, and once on a page that contradicts the one loop 2 fixed.

## Nine second readings in the Senate, and there was one

The Climate Change Regulatory Authority bill's "How it moved" ran to twenty-five
rows. Nine of them read "Second reading · Senate", one under another. Five read
"Committee · Senate". Four read "Third reading · Senate", two of those on the
same day. The Marriage Amendment bill: twenty-two rows, six second readings in
the Senate and six more in the House.

The register records a stage on every day it was before the house, so a debate
adjourned and resumed across seven sitting days arrives as seven rows. Printed
one under another they are not seven records of one debate, they are seven
second readings, and a reader counting them counts nine. That is exactly what
the duplicated divisions did in loop 2: the source's bookkeeping set on the page
as parliament's actions.

A run of one stage in one chamber is now one entry carrying its span and how
many dates it stands for. Twenty-five rows become eight, twenty-two become ten,
and the story the page tells — introduced in the House, passed to the Senate,
committee, third reading, lapsed — is legible in one screen instead of three.
The ruler above still draws every recorded date as its own tick, so the density
moves to where density belongs rather than disappearing.

Two smaller things fell out of the same section. "Royal assent · Assent" said
the same word twice, because with no chamber to name the register writes the
stage into the house field. And a span set inline came apart at the dash in a
six-character column — "25 Nov 2009 –" on one line, "1 Dec 2009" on the next.

## The list still publishes the number the bill page folds away

`/bills` says the Medibank Private Sale Bill has **28 divisions**. Its bill page
says eight. Sorted by "Most divisions" the list ranks every bill on the inflated
count, so the ordering itself is built out of duplicate rows.

The list cannot fold: folding needs each division's day, stage and counts, which
live in the per-bill files, and the list would have to open 5,313 of them. So it
stops asserting a count the next page denies. A row now reads "28 division
records", the fineprint says once that a division record is a row in the
register rather than a separate vote of the house, and the sort is named for
what it sorts. The honest repair is upstream — `index.json` should carry the
folded count — and that belongs to the projection, not to this branch.

## The heading was the bill's own title, then the stage under it

Every division on a bill page opened with the page's own H1: "Medibank Private
Sale Bill 2006 – In Committee – Abolish the private health insurance rebate",
three lines of serif of which the first line and a half were already the
headline eight hundred pixels up. Loop 2 wrote the strip for the party page and
scoped it there.

Taking the title off exposed the next repetition: the record writes
"&lt;Bill&gt; – &lt;Stage&gt; – &lt;Question&gt;", and 164 of the fixture's 209
title-prefixed questions carry the division's own stage in that middle segment,
so the heading read "Second Reading – Read a second time" directly above a meta
line reading "Second reading · Senate · 4 Dec 2006". Both come off. The heading
is the question, the meta is the stage, and the division is three lines shorter.

## Every "here" pointed nowhere

The record's notes are Markdown, and flattening them to text left sentences like
"(Read more about these types of motions here. )" — a pointer with nothing
behind it, four times inside one note on the Declaration of Urgency. Thirty-three
of the fixture's 857 divisions carry prose in that state. The same flattening
glued a quotation onto its next bracket: `known as "the guillotine"(Read more`.

Those links are the record citing itself — the motion, the member who moved it,
the division this one follows — so they are kept as links, relative ones
resolved against the site the field came from, and only the formatting marks are
dropped. Emphasis wrapped around a whole link left an orphan mark on each side
of it; the glued bracket gets its space; the stray one inside a closing bracket
goes.

One thing in those notes is the source's own and stays: "…through parliament.
Background to the bill The bill was introduced…" is a heading run into its body
in the record itself, with no punctuation between them and no newline to
recover. Inventing a full stop there would be writing into the record.

## The count sat nearer the party it does not describe

A party's figures were reading two rows below their own name and directly above
the next party's: "Liberal / [ayes] / [noes] / 0–22 / Labor". The stylesheet had
said name and figures on one line since loop 1; the markup handed the grid its
cells in the order party, bars, figures, and a grid places what it is given in
the order it is given. Two characters of source order cost the reader the
association the whole block exists to make. Fixed in the markup, and every cell
is placed by hand at the width where the layout has three columns.

## Smaller, and each one a fix that stopped short

- The 44px floor reached the bill panel and not the button this branch puts
  inside a person's disclosure. "Bill page" measured 37.8px at every width. It
  is the same shared class loop 1 named; scoping the fix to `#panel-bill` left
  this one behind.
- The document panel still printed the bill's title under a header that already
  is it. The guard was there and read the wrong element: under a named speaker
  the headline is the speaker, and the bill's title is the subject line beneath.
  It reads both now.
- On a party page a bill it divided on twice was its name set as a heading twice
  running. One bill is one entry; the divisions sit under it.
- A wrapped list row opened on a separator: "Passed" alone, then "· 2022 ·
  Infrastructure, Transport, Regional Development and Communications". Loop 1
  gave the row's facts their own line by making the box a flex container, which
  made each fact a flex item, so a long portfolio could not share the line and
  the whole run dropped below the status.
- "Bills of the year" gave 2001 eight bills from three weeks in March and 2015
  eight bills from a single day, 25 February. Loop 1 asked for the year's news
  rather than its first February; preferring the finished bills only narrowed
  the window, because taking the head of 154 bills sorted by date is still the
  head. Eight rows out of a year are now spread across it: 2015 reads February
  to December. The note said "8 are listed, the 154 that finished first", which
  parses as if 154 were listed.
- The Time Machine reads the same index as the portal and never learned loop 1's
  lesson about the portfolio field, so a private member's bill reaching a year's
  eight would have named a department called "(s) BANDT, Adam, MP".

## Left alone, and why

- `.source-title` links measure 20–24px inside their rows, and the checkbox
  filters are 18px. Both are shared site furniture used by every directory and
  result list on the site; the rows around them clear 44px. Moving them is not
  this branch's work.
- The person page's "Full record on They Vote For You" button is 37.8px. It is
  pre-existing furniture on a page this branch only decorates.
- A speech the record leaves unattributed shows "Speech on 28 Oct 2009" with no
  party chip and no date beside it, so the list has two row shapes. The
  alternative was nine rows reading "Speaker not named", which loop 1 rejected.
- "Show more" on the party block could not be exercised: the 200-file fixture
  yields three divisions for the Greens, well under the ten-row threshold.
