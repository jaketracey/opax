# Reports, interactive: loop 1 (2026-09-05)

Brief: "do a couple loops to make them more interactive a bit, we have the money
map graphs etc."

## The opening

The v2 lede was three attributed sentences ("Senator X told the Senate…"), which
read as a run of quotations. `gen_lede()` now writes one paragraph of three or
four sentences as an analyst's overview: what the argument is about, where the
sides stand, what is fought over now, and how it has moved across the eras. It
reads the `now` findings and the era answers together, and its citations are
still the report's own cited records, one per sentence. It paraphrases (a
quotation mark in a sentence is stripped rather than the sentence dropped for a
quotation the record does not hold verbatim), uses no dashes, and holds to about
120 to 160 words. All six reports were rebuilt as v2 with it; climate, gambling,
immigration and media had no `now`/`over_time` blocks before.

## Follow the money

A new part after "How it has moved", for the four reports whose subject has a
donor industry (`REPORT_MONEY` in app.js: gambling, property for housing,
mining & energy for climate, media & tech for media):

- the money map in mini chrome, isolated to that industry cluster, with the
  year scrubber, so the reader can watch the industry's money move and open a
  donor's or a party's card in place (no `onSelect`: the card's own "Full
  profile" link is the way out);
- links to the full map with the industry isolated and to an Ask;
- a "Words per dollar" panel for the matching topic, party by party, via a new
  `only: [topic]` option on `mountWordsDollars`.

The map mounts when the plate comes within 600px of the viewport (three.js is
half a megabyte and the money sits at the foot of a long read), pauses when
offscreen or behind a dialog, and is destroyed when another report opens. The
jump nav gains "Money" for those four reports; immigration and First Nations
have no honest industry counterpart and get no money part.

## Checks

- `node --check` on app.js and wordsdollars.js; `npm run build:graph` clean.
- Headless Chrome over CDP (`cdpshot.mjs`, swiftshader WebGL): the gambling
  report's money part draws the isolated gambling cluster flowing to the
  parties, the scrubber, both links and the single Gambling panel.
