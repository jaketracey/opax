# Bills phase 1c, portal side: the bill page and its five touchpoints (branch `bills-ui`)

Five commits on top of the live site's branch, confined to `portal/public/app.js`
(a new `openBill`/`openBillsIndex` route pair and renderers, plus hooks inside
`renderPersonVotes`, the party page, the document page and the bills list),
an appended `/* ==== bills-ui ==== */` section of `portal/public/style.css`,
a new panel in `portal/public/index.html`, and the year-bills strip in
`portal/public/timemachine.js`. Nothing was deployed, `CACHE_EPOCH` was never
touched, and no paid model calls were made — the fixture's summaries and
speech briefs are `null` throughout, which is the honest state of the
register today. `portal/src/index.ts` and `scripts/` were left to the
exposure agent.

## What's built

- **`/bill/<key>`**: long title in the serif, sponsor with party chip and
  portfolio (or, for the 335+10 bills whose `portfolio` field is actually the
  register's private-member notation, the sponsor read out of it properly),
  a dated status line, the summary card (three sentences, "what it changes",
  "who is affected", the "Written by a model … not the record" attribution
  and the official source links), a status timeline as a hairline ruler,
  divisions with paired aye/no bars per party and each opening its own page
  in the record, speeches with speaker/party/date/brief, and an Act with its
  FRL link. Empty and unknown states say plainly what's missing: "No summary
  yet", "No divisions recorded", "No bill with this identifier".
- **`/bills`**: the same directory renderer the encyclopedia uses — search by
  name, filters for parliament, status and year, sortable, honest fineprint
  about what's counted.
- **Person pages**: each named bill in "Voted for / against" is a 44px
  disclosure holding the three sentences and a "Bill page" link, or the
  dated status line when nothing is written yet. A bill the register can't
  match is left exactly as it was — a missing or slow index costs a reader
  nothing.
- **Party pages**: "Bills they divided on" — the party's own ayes and noes on
  each bill it divided on, one entry per bill (every division under it),
  newest first, ten with "show more".
- **Document pages**: a quiet panel under the header when a speech's debate
  title matches a bill in `index.json` exactly, carrying the bill's status
  and first summary sentence.
- **Time Machine**: a year's "Bills of the year" — introduced, passed or
  assented in it, from the index's own dates, spread across the year rather
  than clustered at its start.

Matching is the registry's rule throughout: full normalised title, no fuzzy
fallback.

## The three loops

Each loop captured phone widths (360, 390, 430) plus a 1280 desktop check
across eleven-to-twelve scenes — the bill page in three states (summary,
rich divisions, empty), the unknown-key page, the list plain and filtered,
a person's disclosure, a party's block, a document's panel, and the Time
Machine's year and bills views — headless, reduced motion, with console-error
and tap-target diagnostics. Full critiques are in `docs/reports/2026-09-05-
bills-ui-loop{1,2,3}.md`; in short:

- **Loop 1** (`7a34acfa`): stopped the list repeating "no summary yet" on
  every one of 5,313 rows; split a row's title from its facts; fixed three
  cut-off filter labels at 360px; read the `(s) WILKIE, Andrew, MP`
  portfolio notation as a sponsor instead of inventing a department; gave a
  division's party split real bars instead of a two-line caveat repeated
  under every one; and set TheyVoteForYou's editorial notes (sometimes
  700 characters long) apart from the actual motion put.
- **Loop 2** (`919b967`): found that TheyVoteForYou records the same
  division several times — the Medibank Private Sale Bill's 28 raw division
  rows are 8 real divisions, the rest exact duplicates including nine copies
  of a "this is a duplicate" note. Rows identical in day, stage and counts
  are folded to one, on both the bill page and the party page. Also: ten
  bills with unseparated co-sponsors ("(s) PHELPS, Kerryn, MPWILKIE,
  Andrew, MP…") now list each member properly title-cased; a division with
  no recorded motion now heads on its stage rather than "Question not
  recorded"; `PRES` reads as "Presiding officer" not a party; a 0-vote party
  bar now sits in a visible empty track instead of drawing nothing.
- **Loop 3** (`d7395d1`): found the same duplicate-bookkeeping defect twice
  more. The register logs a stage on every sitting day it stood before the
  house, so a debate spanning a week of sittings printed as that many rows —
  25 rows for one bill's passage became 8 real entries once same-stage runs
  are folded to a dated span, the same collapse loop 2 did for divisions.
  The bills list still asserted the Medibank bill's un-folded count ("28
  divisions") right next to a bill page that says 8 — the list can't fold
  without opening all 5,313 files, so it now says "28 division records" and
  explains what that number is instead of asserting one the next page
  denies (the real fix belongs in the projection). A division's heading
  repeated the page's own H1 (loop 2's fix was scoped to the party page
  only) and then, once removed, exposed the record's stage name buried a
  second time inside the question text. The record's flattened Markdown
  notes left dangling "(Read more … here. )" citations, now kept as real
  links. A party's own vote figures were landing visually attached to the
  next party's name because the grid received its cells in source order.
  Smaller fixes: the 44px floor reached a button loop 1's fix didn't cover;
  the document panel's repeat-guard read only the headline element and
  missed the subject line where the actual repeat occurs; a party dividing
  twice on one bill printed that bill's name as a heading twice; a long
  portfolio couldn't share a line with its status; and the Time Machine's
  own read of the portfolio field never learned loop 1's lesson about
  private-member notation.

Twelve loop-3 scenes were recaptured after the fixes to confirm the
collapses held and nothing regressed; the party page was re-shot separately
against the fixture's actual two-division duplicate (COAG Reform Fund
Amendment (No Electric Vehicle Taxes) Bill 2020) to check the
one-bill-one-entry grouping directly. Confirmed clean: `node --check` passes
on both `app.js` and `timemachine.js`, no horizontal overflow or console
errors at any width, no new sub-44px targets. Left alone, and documented as
such in the loop 3 critique: `.source-title` link text and checkbox filters
run 18–24px as pre-existing shared site furniture, not this branch's work.

## What's not here

Summaries and speech briefs are `null` in every fixture bill — that's the
summaries agent's and the registry's data, not a defect of this branch.
`index.json`'s division count is the register's raw row count, not the
folded one the bill page computes; the loop 3 critique flags this as the
one fix that has to land in the projection (`scripts/export_bills.py`), not
here. At merge, the exposure agent's own `portal/public/bills` replaces the
scaffolding fixture this branch built against and committed for its own use.

## Commits

- `b2f82e2` — fixture and contract copied in to build against
- `4848915` — the bill page, the bill list, and the five touchpoints
- `7a34acfa` — loop 1 fixes
- `919b967` — loop 2 fixes (division deduplication, co-sponsor parsing)
- `d7395d1` — loop 3 fixes (stage-run deduplication, note links, party grid order)
