# Bills phase 1c, data side: what was built and what it rests on

Branch `bills-exposure`. Nothing deployed, `CACHE_EPOCH` untouched, no database
write, no knowledge-box deletion. `docs/BILLS-EXPOSURE.md` is the operating
manual; this is the account of the work and its limits.

## Delivered

| # | Thing | State |
| --- | --- | --- |
| 1 | `scripts/export_bills.py` | done; legacy and registry modes both exercised |
| 1b | fixture in `portal/public/bills/` | superseded by row 5: the 200-file legacy sample was replaced by the full 2,969-bill registry-mode export in the same commit |
| 2 | Worker: `bill` kind, `/bill/<key>` route | done; `npx tsc --noEmit -p .` clean, route exercised under `wrangler dev` |
| 3 | `scripts/publish_bills.py` | done; five real bills live in the box, create/update/unchanged all verified |
| 4 | `docs/BILLS-EXPOSURE.md`, this report | done |
| 5 | full-mode rerun and bulk publish | done; 2,969 files, all passing the shape test, 1,698 bills with a summary, 1,698 published (0 created, 0 updated, 1,698 already matched by content hash) |

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

## The fixture (superseded)

The first pass shipped a legacy-mode fixture: `index.json` listing all 5,313
legacy bills, one per line, plus 200 real bill files spanning every shape the
projection produces, 130 with divisions and briefs filled for 1,200 of 1,846
speech slugs. Path was written to `bills_fixture_ready`. It no longer exists
in the repo -- "The full-mode rerun and bulk publish" above replaced it with
the real 2,969-bill registry-mode export, and this section is kept only as a
record of what the interim fixture was.

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

Five real bills published live earlier and left in place, chosen to span the
projection's shapes: 48 divisions and no speeches, 28 divisions with 21
speeches and an Act, a Senate bill that lapsed, one carrying a ParlInfo
source, one bare registry row.

| Check | Result |
| --- | --- |
| First run | 5 created |
| Catalog `filters=/classification.labels/kind/bill` | all 5 returned |
| `find` with the `kind=bill` filter | returns the right bill |
| Rerun on unchanged content | 5 unchanged |
| Deliberately altered body, then restored | updated, updated, unchanged |

Slugs in the box from that early check: `bill-au-federal-alrc-1270`, `-1433`,
`-2796`, `-4304`, `-4831`. They are untouched by the bulk pass below and
remain in the box; the script never deletes.

The body is the reviewed model summary when a bill has one, then a paragraph of
parsed registry facts. No explanatory memorandum, Bills Digest or billhome prose
is copied: aph.gov.au is CC BY-NC-ND 4.0, which is not permission to publish
adaptations. The division paragraph states plainly that a division naming a bill
is not evidence an aye backed it. Only the sponsor is a collaborator.

Idempotent by `extra.metadata.content_hash`, capped at 3,500 resources a run,
newest first so a capped run lands what people are asking about. The only writes
are `POST /resources` and `PATCH /slug/<slug>`.

## The full-mode rerun and bulk publish

`bills_registry_ready`, `bills_speeches_ready` and `bills_summaries_ready` all
landed 2026-09-05. Final registry state:

| Table | Rows |
| --- | --- |
| `bills_v2` | 2,969 |
| `bill_events` | 31,377 |
| `bill_sources` | 8,512 |
| `bill_links` | 19,958 (division 4,230 over 1,003 bills, act 1,779, speech 13,949 over 2,032 bills) |
| `bill_summaries` | 2,510 with an outline; 1,698 `ok`, 812 `flagged` |

An earlier trial against the half-built registry (2026-09-05 09:55, kept for
the record):

| | Legacy | Registry (mid-build) |
| --- | --- | --- |
| Bills | 5,313 (1988 to 2022) | 2,760 (2013-02-06 to 2026-08-20) |
| Keys | `au-federal-alrc-1270` | `au-federal-r7127`, `au-federal-s1511` |
| With divisions | 1,084 | 894 |
| With speeches | 1,123 | 0 |
| Sources | thin, title-matched | from `bill_sources`, with licences |

Zero speeches at that point was measured, not broken: `bill_links` had no
speech rows yet, because the registry agent's first attempt matched on
`speeches.topic`, which is impossible for federal Hansard from 2013 on (the
topic string is almost always the bare word "Bills"). It was replaced with a
match on the speech text itself, corroborated by a same-day progress event,
landing 13,949 links at 99.3% hand-audited precision. That surfaced a real bug
here: the exporter was reading linked speeches off the same
`SPEECH_CANDIDATE_SQL` query the legacy title-match path uses, which filters
on `topic` and would have silently dropped 92% of them. Fixed by reading
linked speech ids directly, with no topic filter.

The full (non-dry) export: 2,969 files written, **all 2,969 pass**
`node portal/test/bills.test.mjs`; index.json's division/speech/act totals
match `bill_links` exactly (1,003 bills / 4,230 divisions, 2,032 bills /
13,194 speech entries after the 24-per-bill cap, 1,779 acts); 1,698 bills
carry a projected summary, matching `bills_summaries_ready`'s `ok` count
exactly. `npx tsc --noEmit -p .` is clean.

`publish_bills.py --with-summary-only` against the live box, chunked and
paced at 2 requests/second to stay clear of the box's own labelling load:

| Outcome | Count |
| --- | --- |
| Created | 0 |
| Updated | 0 |
| Unchanged (already matched by content hash) | 1,698 |
| Failed | 0 (one transient HTTP 511 on a single key, succeeded on retry) |

Confirmed against the live catalog (`filters=/classification.labels/kind/bill`)
and a 25-key random sample drawn across the full run: every sampled bill
present with the expected `content_hash`. All 1,698 summary-bearing bills were
already live in the box by the time this run confirmed them; an earlier pass
against the same shared box had already written them, and the idempotent
design made re-running safe rather than redundant.

**Two corpus holes, not join failures, limit what a bill page can show.**
There is no Senate Hansard at all for 2014-2022 (only 602 of 13,949 speech
links are Senate), and the chamber corpus nearly vanishes in 2024 (82 chamber
speeches that year against thousands either side). Coverage by parliament,
bills with at least one projected speech: P43 84%, P44 84%, P45 74%, **P47
24%**, P48 74%. The 47th Parliament sits mostly inside the hole. A bill with
no speeches there is not evidence it was never debated, and no page should say
so.

## For the other agents

**Registry agent.** `bills_v2.aliases_json` is an object of listing extras
(`listing_title`, `type`, `sponsor_aph_id`, `sponsor_party`, `summary`), and the
contract calls it a list of aliases. The exporter reads either, prefers the
object's `sponsor_party` because it is the party as the bill page printed it, and
folds a differing `listing_title` in as an alias. Worth settling which shape is
intended. Separately, `bill_links` is the join the projection prefers over the
title rule, and now has rows for every kind (division, act, speech).

**Summaries agent.** Only a summary whose `review_state` is `ok`, that is not
superseded, and that carries exactly three sentences and three to six changes is
projected or published. A draft or a flagged summary shows as no summary at all.
`basis` decides the attribution line.

**UI agent.** The fixture is real output, not a mock, and it is now the full
2,969-bill registry set, not the 200-bill sample. Four things to design for:
`summary` is null on 1,271 bills (only 1,698 of 2,969 project one) and will
stay null on many; `brief` is null on a third of speeches; a division carries
`party_coverage` saying how much of its split is dated evidence; and a bill
with no projected speeches in 2014-2022 (Senate) or 2024 (all chambers) is a
corpus hole, not evidence it was never debated -- see "Two corpus holes"
above. A division naming a bill is not a vote for it, and the question as put
is the only honest label.

## Known limits

- Legacy keys (`au-federal-alrc-<id>`) are provisional, not stable identities.
  180 of the 2,969 registry-mode bills still use them, for rows with no
  billhome match; they are a disjoint id space from the earlier 200-bill
  legacy fixture's own `alrc` ids.
- `sources` is thin in legacy mode: `ext_parlinfo_docs` has resolved a `bill_id`
  for 198 of 500 cached billhome records and 3 of 103 EMs.
- Section 4's precision figures are in-sample. No independent holdout has been
  run, and 100% on the diagnostic sample is not production accuracy. The
  speech join's own audit (99.3%, 139/140) is likewise in-sample.
- `parliament` is null before 1998-11-10, deliberately: extending the audited
  opening list would change the matching window as well as the label.
- `stage_hint` is null for federal speeches, because the topic strings say
  nothing about the stage and a bill match is not evidence of one.
- Party coverage is federal only. NSW and Victorian vote rows carry no party at
  all, and their splits must never be computed from present membership.
- No Senate Hansard exists for 2014-2022 and the chamber corpus nearly
  vanishes in 2024; the 47th Parliament (24% speech coverage) sits mostly
  inside that hole. Absence of speeches there must never be read as absence
  of debate.
- 812 of 2,510 outlined bills carry a `flagged` summary and project as having
  no summary at all -- a review-state design choice, not a defect.
