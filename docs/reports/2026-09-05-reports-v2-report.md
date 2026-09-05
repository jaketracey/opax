# Reports v2: the two exemplars

**Branch** `reports-core`. **Generator** `scripts/generate_reports.py`,
**validator** `scripts/validate_reports.py`, **design** `docs/REPORTS-V2.md`.
Nothing was deployed; `CACHE_EPOCH` and the knowledge-box configuration were
not touched.

## What the two reports now contain

| | First Nations (`indigenous`) | Housing (`housing`) |
| --- | --- | --- |
| debates discovered in the window | 8 | 8 |
| `now` sections | 8 | 8 |
| eras | 3 | 3 |
| tide decades | 4 | 4 |
| key speeches | 8 | 6 |
| key figures kept | 5 | 5 |
| key figures dropped | 15 | 5 |
| party positions | 3 | 3 |
| voices (now / all time) | 8 / 8 | 8 / 8 |
| refusals | 0 | 0 |
| cited sources per `now` section | 3 to 11 | 4 to 11 |

Every v1 field survives in both files, so the live report page keeps working
until the v2 page lands: `brief`, the three unfiltered `sections`, `stats` and
`key_moments` are all still there and were not re-asked.

## Paid calls

This session used **27** asks against the 150 the task allows, on top of
whatever the interrupted session had already spent (its own state files record
retrieval, not asks; the resumption note's rule of thumb was that two thirds of
the budget was gone, which puts the total near 127).

| run | calls |
| --- | --- |
| `indigenous --only stats`, first attempt | 1 |
| `indigenous --only stats`, after the stricter base rule | 2 |
| `housing --only now`, after the debate dedup | 8 |
| `housing --only now`, after the attribution rule | 8 |
| `housing --only now --redo 3` | 1 |
| `housing --only lede` | 1 |
| `housing --only stats` × 3, ending with the merged pool | 5 |
| pytest, validation, every catalog page and passage read | 0 |

A whole report is 12 to 14 calls. A single bad section is now 1.

## What changed in the generator, and why

1. **Duplicate debates.** Housing spent two of its eight sections on the same
   NSW planning bill and printed nearly the same answer twice.
   `dedupe_subjects()` folds a debate whose subject words all sit inside a
   bigger one's; the freed slot went to the Strata Schemes bill, a real housing
   debate with 41 speeches.
2. **Off-topic headings.** `Energy policy` is a 42-speech group inside the
   housing label and answered with electricity prices and renewables. A
   heading that names no bill and carries none of the report's own words is
   now anchored to the report's subject, and the section answers with gas
   connections in new homes and the seven-star thermal standard.
3. **One member's words.** A section reported Labor's characterisation of the
   coalition as the coalition's own position. The window prompt now requires a
   claim about another party to be reported as that member's claim.
4. **"The same parliament."** One answer put a Victorian opposition member in
   the New South Wales chamber. The prompt now bans the phrase and the redone
   section names both parliaments correctly.
5. **Tautological and baseless figures.** A denominator that only repeats the
   unit is rejected, and a non-share denominator now has to carry a number of
   its own, which is what "a figure with no stated base is not a statistic"
   actually means in code.
6. **Where figures come from.** The `now` window and the whole record are
   retrieved separately and numbered into one prompt, so the ask sees both for
   the price of one call and each tile records its `window`.
7. **Jurisdiction.** A state member's figure goes back to their own state
   unless the passage reaches for a national frame. Two housing tiles said
   "Australia" for Victorian social-housing figures.
8. **`--redo N`.** Re-asks named `now` sections in place, one call each.

## What to check by eye

**Read these first.** They are the claims a reader would act on.

- **The five housing tiles.** `89 per cent` agree there is a housing crisis;
  Bradfield's `0.9 per cent` against a `3.8 per cent` national average;
  Victoria's `1.8 per cent` unoccupied social housing and `42 per cent` of
  greatest-needs households waiting over two years. All five are verbatim in
  their passages and correctly oriented. The last two are a Victorian
  opposition member's question quoting the government's own claim, and the
  `detail` line says so.
- **The five First Nations tiles.** Queensland's `4.6 / 37 / 69 per cent`
  population, adult-prisoner and youth-detention shares from Lidia Thorpe's
  ministerial statement of 2 March 2026, checked verbatim; the national
  `3.8 / 32 per cent` pair from Helen Polley, 21 March 2023. All are shares
  that name their base, in the order the record puts them.
- **One weak attribution.** The `89 per cent` tile cites `speech-1198267`,
  which is a whole Matters of Public Importance debate under Glenn Sterle's
  name: 24,000 characters, six speaking turns. The figure is in the record;
  the name on the tile's `detail` is the name on the resource, and the line
  was probably spoken by the member who rose at 5:12 pm. This is an ingest
  problem worth its own pass — it will affect any page that quotes a speaker
  from a resource title.
- **Voices are the catalog's speaker facet, as briefed**, which means they
  include departmental officials who appear at estimates (`Guivarra`,
  `Rimmer`) and split a member who is recorded sometimes as
  `Jacinta Nampijinpa Price` and sometimes as `Nampijinpa Price`. The
  surname merge only joins a single-token name to exactly one full name, so
  two-token variants stay apart. Party is null wherever the catalog row has no
  party label.
- **The First Nations era questions read "first nations" in lower case.** The
  generator now takes the report's `subject` ("First Nations"), but the three
  era answers predate that change and were not worth three asks to re-roll.
  `python3 scripts/generate_reports.py indigenous --only over-time` fixes it
  for 3 calls.
- **Key figures are capped at six and both reports kept five.** The dropped
  list is in `key_stats_dropped` with a reason each, which is the fastest way
  to see whether the check is being too strict for a given topic.

## Running the other four

The generator is ready for `gambling`, `climate`, `immigration` and `media`.
Each is 12 to 14 calls; discovery re-enumerates the topic from the catalog on
the first run, which is free and takes a minute or two. Validate with
`python3 scripts/validate_reports.py <slug>` — it fails a report that refuses a
question, opens with a context preamble, ships a figure without a denominator
or a window, overlaps its era with the `now` window, or cites a slug the box no
longer holds.
