# Bills phase 1c, data side: what was built and what it rests on

Branch `bills-exposure`. Nothing deployed, `CACHE_EPOCH` untouched, no database
write, no knowledge-box deletion. `docs/BILLS-EXPOSURE.md` is the operating
manual; this is the account of the work and its limits.

## Delivered

| # | Thing | State |
| --- | --- | --- |
| 1 | `scripts/export_bills.py` | done; legacy and registry modes both exercised |
| 1b | fixture in `portal/public/bills/` | done; index of 5,313 bills plus 200 real files, briefs attached |
| 2 | Worker: `bill` kind, `/bill/<key>` route | done; `npx tsc --noEmit -p .` clean, route exercised under `wrangler dev` |
| 3 | `scripts/publish_bills.py` | done; five real bills live in the box, create/update/unchanged all verified |
| 4 | `docs/BILLS-EXPOSURE.md`, this report | done |
| 5 | full-mode rerun and bulk publish | **not run**; neither ready marker exists |

## The projection

One code path, two registry modes. `--legacy` reads `bills` and `bill_progress`;
the default reads `bills_v2`, `bill_events`, `bill_sources`, `bill_summaries` and
`bill_links`, and refuses to run with a clear message when `bills_v2` is absent.

The title rule is the one audited in `docs/SCOPE-BILLS.md` section 4, ported
verbatim. The check that the port is faithful is that the legacy run reproduces
the audit's own counts exactly:

| Measure | Section 4 audit | This run |
| --- | --- | --- |
| Bills with matched divisions | 1,084 | 1,084 |
| Bills with matched speeches | 1,123 | 1,123 |
| Ambiguous title groups | the measured pair | 2 |

A legacy run over 5,313 bills, 10,574 divisions and 13,265 candidate speeches
takes seven seconds.

### The one substantive departure from the brief as written

The brief asked for party splits computed "from the votes tables with vote-time
affiliation". The votes tables do not carry vote-time affiliation.
`ext_votes.party` is filled from `members`, `members` holds one row per person,
and measured 2026-09-05 no federal person carries more than one party across
their vote rows. Computing splits from it put Katter's Australian Party on both
sides of a 2006 division, four years before the party existed, which is exactly
what section 3 warns against.

So the splits are computed from a dated source instead: every Hansard speech row
records the party the speaker sat for that day, and `party_canonical` cleans it.
Collapsed per person, that is a timeline a division can be read against. Bob
Katter reads Independent through 2016 and Katter's Australian Party from 2017;
Craig Kelly reads Liberal to 2020 and United Australia Party from late 2021.
Both were checked against real divisions.

Every division publishes its own coverage, so a page can say what a split rests
on rather than implying all of it is dated evidence:

| Bucket | Federal votes | Share |
| --- | --- | --- |
| `dated` (an observation on or before the day) | 732,349 | 86.7% |
| `earliest` (only later observations) | 55,918 | 6.6% |
| `member` (no speech observation at all) | 56,607 | 6.7% |
| `unknown` | 0 | 0% |

## The fixture

`index.json` lists all 5,313 legacy bills, one per line: 2.3 MB, 164 KB gzipped.
200 bill files span every shape the projection produces, 130 of them with
divisions. Briefs were filled from the box: 1,846 unique speech slugs across the
200 bills, 1,200 carrying a machine brief, the rest null, which is a state the UI
has to render either way. Path written to `bills_fixture_ready`.

## The Worker

`KINDS` gains `bill`. Verified under `wrangler dev`: `kind=bill` passes the
filter validator, `kind=bogus` still 400s.

`/bill/<key>` serves the shell with the bill's own title and a one-line
description read from `index.json` through the ASSETS binding. Verified: a known
key returns 200 with the right title and description, an unknown key 404s, and
`/bill/`, `/bill/Foo_Bar` and a third path segment all 404. `npx tsc --noEmit -p .`
is clean.

The isolate holds a key-to-row Map rather than the parsed 2.3 MB file.

The sitemap deliberately does **not** list bill pages yet. `app.js` has no
`/bill` route until the UI agent lands one, and listing five thousand URLs that
render an empty shell would be worse than listing none. It should go in with the
client route.

## The knowledge box

Five real bills published live and left in place, chosen to span the projection's
shapes: 48 divisions and no speeches, 28 divisions with 21 speeches and an Act, a
Senate bill that lapsed, one carrying a ParlInfo source, one bare registry row.

| Check | Result |
| --- | --- |
| First run | 5 created |
| Catalog `filters=/classification.labels/kind/bill` | all 5 returned |
| `find` with the `kind=bill` filter | returns the right bill |
| Rerun on unchanged content | 5 unchanged |
| Deliberately altered body, then restored | updated, updated, unchanged |

Slugs in the box now: `bill-au-federal-alrc-1270`, `-1433`, `-2796`, `-4304`,
`-4831`.

The body is the reviewed model summary when a bill has one, then a paragraph of
parsed registry facts. No explanatory memorandum, Bills Digest or billhome prose
is copied: aph.gov.au is CC BY-NC-ND 4.0, which is not permission to publish
adaptations. The division paragraph states plainly that a division naming a bill
is not evidence an aye backed it. Only the sponsor is a collaborator.

Idempotent by `extra.metadata.content_hash`, capped at 3,500 resources a run,
newest first so a capped run lands what people are asking about. The only writes
are `POST /resources` and `PATCH /slug/<slug>`.

## Not done, and why

**The full-mode rerun and the bulk publish.** Neither `bills_registry_ready` nor
`bills_summaries_ready` exists. At the last check `bills_v2` held 2,760 rows and
was still growing, `bill_links` was empty and `bill_summaries` did not exist, so
there is not one bill with an `ok` summary to publish. The commands are in
`docs/BILLS-EXPOSURE.md` section 4 and the run is a few minutes' work once the
markers land.

A trial against the half-built registry proves the switch works:

| | Legacy | Registry |
| --- | --- | --- |
| Bills | 5,313 (1988 to 2022) | 2,760 (2013-02-06 to 2026-08-20) |
| Keys | `au-federal-alrc-1270` | `au-federal-r7127`, `au-federal-s1511` |
| With divisions | 1,084 | 894 |
| With speeches | 1,123 | 0 |
| Sources | thin, title-matched | from `bill_sources`, with licences |

**Zero speeches in registry mode is measured, not broken.** `bills_v2` starts in
2013, and all 800 federal bill-topic speeches between 2013-02-06 and the 43rd
Parliament's close carry the bare topic `Bills` with no title in them. Section 3
records the same fall-off. Speeches on registry-mode bills stay at zero until
`bill_links` supplies them or the Hansard debate hierarchy is recovered.

## For the other agents

**Registry agent.** `bills_v2.aliases_json` is an object of listing extras
(`listing_title`, `type`, `sponsor_aph_id`, `sponsor_party`, `summary`), and the
contract calls it a list of aliases. The exporter reads either, prefers the
object's `sponsor_party` because it is the party as the bill page printed it, and
folds a differing `listing_title` in as an alias. Worth settling which shape is
intended. Separately, `bill_links` is the join the projection prefers, and until
it has rows the exporter falls back to the title rule.

**Summaries agent.** Only a summary whose `review_state` is `ok`, that is not
superseded, and that carries exactly three sentences and three to six changes is
projected or published. A draft or a flagged summary shows as no summary at all.
`basis` decides the attribution line.

**UI agent.** The fixture is real output, not a mock. Three things to design for:
`summary` is null on most bills and will stay null on many, `brief` is null on a
third of speeches, and a division carries `party_coverage` saying how much of its
split is dated evidence. A division naming a bill is not a vote for it, and the
question as put is the only honest label.

## Known limits

- Legacy keys (`au-federal-alrc-<id>`) are provisional, not stable identities.
- `sources` is thin in legacy mode: `ext_parlinfo_docs` has resolved a `bill_id`
  for 198 of 500 cached billhome records and 3 of 103 EMs.
- Section 4's precision figures are in-sample. No independent holdout has been
  run, and 100% on the diagnostic sample is not production accuracy.
- `parliament` is null before 1998-11-10, deliberately: extending the audited
  opening list would change the matching window as well as the label.
- `stage_hint` is null for federal speeches, because the topic strings say
  nothing about the stage and a bill match is not evidence of one.
- Party coverage is federal only. NSW and Victorian vote rows carry no party at
  all, and their splits must never be computed from present membership.
