# Time Machine: mobile UI and year enrichment (branch `ui-timemachine`)

Three commits on top of the live site's branch, confined to
`portal/public/timemachine.js` (which carries its own CSS), a new script
`scripts/generate_years.py`, and new static JSON under `portal/public/years/`.
Nothing was deployed; `CACHE_EPOCH`, the knowledge-box configuration and the
Worker are untouched. `node --check portal/public/timemachine.js` passes.

## What changed

### The dialog at 390 px

- **Cards are one unit each.** Portrait (32 px), name and party on one line;
  the date, the parliament ("Federal parliament", "Victorian parliament") and
  the record's own heading ("Bills", "Questions without Notice") as a quiet
  second line (dropped when it repeats the debate); the debate name as an
  italic serif line instead of an uppercase pill; then the machine summary
  where one exists (labelled "Machine summary", sans, never in quotes) or
  the opening passage in serif quotes; then a bronze-underlined "Read the
  speech" link. The serif "Alan Cadman — 2001-09-20" title and the wrapped
  meta line starting with a stray "·" are gone. Cards are a ruled list
  (hairline between entries), not bordered boxes.
- **Passages end at a sentence.** `passage()` skips a mid-sentence opening
  when the next sentence starts within 160 characters and stops at the last
  full stop that fits 260 characters (stretching to 320 to reach one). Only
  when no sentence boundary falls inside the budget does an ellipsis remain.
- **Scrubber labels never collide.** Labels exist for every five-year mark
  and both ends; `layoutTickLabels()` shows a label only when it clears every
  placed label by 36 px, recomputed by a `ResizeObserver`. At 390 px the
  ruler reads 1998 · 2005 · 2010 · 2015 · 2020 · 2026; a desktop track shows
  every mark. The current year's label is set darker when it is shown, and
  the hero year sits directly above the ruler.
- **Thumb and rail match the site's range sliders.** 28 px paper thumb with
  a 2 px bronze-ink border and the inset wash ring, a 3 px `--line-strong`
  rail with a bronze fill, `:active` scale and the navy double ring on
  keyboard focus. The scrubber pads itself by 16 px so the thumb and the end
  labels stay inside the box.
- **Targets are 44 px.** Prev/next circles 44 × 44; "Take me somewhere" is a
  quiet bronze link under the scrubber with a 44 px hit height instead of a
  pill crowding the year; the topic select is 44 px tall with a hairline
  underline and a CSS-drawn chevron (no `data:` URI, CSP-safe); the host's
  close button already had a 44 px hit area, and the module enlarges its
  glyph while mounted (`#dialog-tm .game-close`).
- **No horizontal scroll.** The module drops its own side padding inside
  the dialog (the body already pads 1.4 rem), so the column is 307 px wide
  at 390 px instead of 275, and `scrollWidth` equals the viewport at 390,
  430 and 1280.
- **Eyebrows.** The uppercase "PARLIAMENT IN" is now an italic serif line;
  the "IN BRIEF" kicker is a plain italic "Machine summary" prefix; the
  topic chips are gone. No new uppercase labels were added.
- **Also removed:** the footer emoji, and the "N× more airtime for X than Y"
  callout (two arbitrary tracked topics compared is not a finding); the
  "⬆ 2001" record callout now prints the plain year.

### Content

Each year opens with **The year in brief** and **Voices of the year**, then
the debates, then the numbers (phone order; on a desktop the record stays in
the left column and the tallies in the right).

- **The year in brief.** One grounded, cited `/ask` per year, filtered to the
  year with the Worker's own `created` since/until grammar, asked once and
  shipped as `portal/public/years/{year}.json` with every retrieved source
  (slug, speaker, party, state, date, `cited` flag), the prompt variant used,
  token counts and a coverage sentence. The question names the year's
  curated debates so retrieval lands on them: "What were the main debates in
  the Australian parliament in 2001, and what positions did members and
  parties take? Debates that year included The Tampa affair, September 11,
  The Ansett collapse and Poker machines." On a phone the opening sentences
  show and the rest waits behind "Read the rest"; a desktop shows it all.
  Under it: "Machine-written from the 20 passages the knowledge box
  retrieved for 2001 so far, 6 of them cited. A reading aid, not the record:
  check any claim against the speeches." and a "The speeches it drew on (20)"
  disclosure listing each speech as a link with party, date, parliament and
  a "cited" mark. `[n]` markers are not wired (the site's rule).
- **Voices of the year.** The dialog's four curated probes for the year run
  through the live `/api/search` at `top_k=50&per=50`, de-duplicated by
  speech, tallied by speaker and party. Rendered as a bar list of up to six
  speakers with two or more speeches (portrait, name, party, count, bronze
  bar proportional to the top), a "By party" line, and fineprint that states
  the denominator, how many rows carry a party label, and that presiding
  officers' rows are excluded when they were. The section hides when fewer
  than three speakers qualify (none do today). Every figure's provenance is
  in the JSON (`voices.method`, `voices.coverage`, per-probe retrieved
  counts, `unlabelled_party`, `bare_surnames_skipped`,
  `presiding_rows_skipped`, `presiding_excluded`).
- **Honesty guards found while building.** (1) The openaustralia House feed
  attributes members' speeches to the Speaker: "Milton Dick" topped 2023 to
  2026 with a Matters of Public Importance speech and the Governor-General's
  speech. Presiding officers are excluded from the ranking for their years in
  the chair only (Peter Slipper's 2001 speeches still count); the list and
  years are in `PRESIDING` in the script. (2) Bare surnames ("Smith") can be
  several people; they stay in the party tally and out of the ranking.
  (3) State-parliament rows often carry no party label (2024: 123 of 150
  rows), so the fineprint prints the labelled count. (4) A single retrieved
  speech is not a voice; only repeat appearances rank.
- The module fetches `/years/index.json` once and then one small file per
  year (cached in memory); a missing year simply hides both sections.

## Cost incurred

| Item | Calls | Tokens | Cost |
| --- | ---: | ---: | ---: |
| Year briefs (`/ask`, BYOK DeepSeek via the OpenRouter preset, reasoning off) | 29 | 236,677 in / 12,916 out | about $0.12 at list price ($0.44 / $1.32 per 1M) |
| Voices (`/api/search`, retrieval only) | 116, run twice | none | $0 (search rate limit only; results now warm in the edge cache) |

No enrichment (DA) task was started and no `/ask` is made from the browser;
the dialog's own per-year calls are unchanged (`/api/search` probes and one
`/api/brief`) plus two tiny static files.

## How to regenerate

```
.venv/bin/python scripts/generate_years.py --dry-run     # the plan, no calls
.venv/bin/python scripts/generate_years.py               # only years without a brief (none today)
.venv/bin/python scripts/generate_years.py --voices-only # re-tally voices, free
.venv/bin/python scripts/generate_years.py --force 2001  # re-ask one year (about $0.008)
```

A year that already has a brief is never asked again without `--force`, so
the default run is a no-op once the files exist. Re-run `--voices-only`
after the bulk load or a re-sync changes what the search windows hold; re-ask
(`--force`, all years about $0.25) when the corpus for a year grows enough
that the brief reads thin. The curated probes are parsed from
`YEAR_TOPICS` in `timemachine.js`, so editing a year's debates there and
re-running keeps the two in step. After regenerating: `cd portal && npx
wrangler deploy` (static assets; no `CACHE_EPOCH` bump needed for these
files).

## Renders checked

Headless Chrome over CDP, mobile emulation, worktree served locally with
`/api/*` proxied to the live site (`tm_server.py`, `tm_shot.mjs` in the
scratchpad `/private/tmp/claude-501/-Users-jake-Projects-opax/c097728b-8dc8-4ab0-90d6-0b7645b85942/scratchpad`).

| Render | File (in the scratchpad) |
| --- | --- |
| Before, 390 px, folds 0-1 | `before-390-0.png`, `before-390-1.png` |
| After, 390 px, 2001, folds 0-2 | `after2-390-0.png` … `after2-390-2.png` |
| After, 430 px, 2001 | `after2-430-0.png`, `after2-430-1.png` |
| After, 1280 px, 2001, folds 0-2 | `after2-1280-0.png` … `after2-1280-2.png` |
| 2026 at 390 px (state records, no party labels, machine summaries) | `y2026-390-0.png`, `y2026-390-1.png` |
| 2024 at 390 px (six machine summaries, Victorian and Queensland rows) | `final-2024-390-0.png` … `final-2024-390-2.png` |
| Topic lens empty state (Gambling, 2001) at 390 px | `lens-390-0.png`, `lens-390-1.png` |
| Standalone harness `tm-test.html`, full page at 390 px | `harness-390.png` |

Measured at 390 px in the final render: viewport and document scroll width
both 390; visible ruler labels at x = 41, 110, 159, 208, 257, 316 (32 px
wide, no overlaps); thumb 28 × 28; prev/next 44 × 44; close 44 × 44; "Take me
somewhere" 44 px tall; topic select 44 px tall; no page errors.

## Not done / worth knowing

- The playful empty-state copy ("still on the trolley") and the numbers
  panel's copy were left as they were; only the emoji and the ratio callout
  went.
- The keyboard focus ring on the thumb is styled but was not screenshotted
  (headless focus-visible is unreliable); the rule mirrors the site's
  `input[type=range]:focus-visible` treatment.
- `/api/brief` returned no summaries for the 2001 sample speeches (the
  summaries pass has not reached them), so 2001 renders passages while 2024
  renders six summaries; both paths are exercised in the renders above.
