# Reports, interactive: loop 2 (2026-09-05)

## People and parties

- "Who does the talking": a speaker with no portrait is a blank circle, never
  initials (the house rule from the donor pages the same day).
- "Where the parties stand": the party chip is a link to the party's page.

## The map on a phone

On a phone the subject page's mini map opened its detail card on load, docked
over most of the plate, which hid the opening reveal (close on the subject, a
beat, then out to the parties it gave to). New map option `openCard` (default
true): a silent selection (the `focus` seed, `handle.select`) lights and frames
the node but leaves the card closed; a reader's own tap still opens it. The
subject page passes `openCard: !matchMedia("(max-width: 720px)").matches`, the
map's own phone breakpoint. The report's embedded map has no focus seed and is
unaffected.

## Checks

- Phone-width CDP capture (390x844, touch emulation) of a donor page: the
  subject is lit with its flows and no card is open.
- Desktop unchanged: the card still opens on load.
