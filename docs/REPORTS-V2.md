# Standing reports, v2

A v1 report asked three fixed questions of all of time. It aged the moment
parliament started arguing about something its author had not thought of.

A v2 report asks what parliament is arguing about **now** — found in the
record, not guessed — and keeps the long view in a section of its own. Depth
comes from asking more and better questions of the record, not from longer
prose.

Generator: `scripts/generate_reports.py`. Validator: `scripts/validate_reports.py`.
Output: `portal/public/reports/<slug>.json`, served by the Worker as an asset.

## The shape

v2 is **additive**. Every v1 field survives, so the live report page keeps
working until the v2 page lands.

```jsonc
{
  "slug", "title", "blurb", "generated_at", "corpus_resources",
  "stats", "brief", "key_moments", "sections",   // v1, untouched
  "version": 2,

  "lede": { "text": "three sentences", "sources": [...] },

  "now": {
    "since": "2024-07-01",
    "discovered": [ { "title", "count", "first", "last", "parliaments", "search" } ],
    "sections": [ { "question", "answer", "sources", "asked_at" } ]      // 6-8
  },

  "over_time": {
    "eras": [ { "label", "from", "to", "question", "answer", "sources", "asked_at" } ],
    "tide": [ { "decade", "share", "count", "labelled" } ],
    "tide_scope": "federal",
    "key_moments": [ ... ]                          // the same list as the v1 field
  },

  "positions":  [ { "party", "position", "speaker", "date", "slug", "window": "now" } ],
  "key_stats":  [ { "value", "label", "numerator", "denominator", "unit",
                    "jurisdiction", "as_of", "detail", "slug", "source_title" } ],
  "key_stats_dropped": [ { "value", "measure", "reason" } ],   // audit trail
  "voices": { "now": [ { "speaker", "party", "count" } ], "all": [ ... ] }
}
```

`discovered[].parliaments` and `key_stats_dropped` are the two additions
beyond the agreed shape. The first tells a reader that a "live debate" is a
Victorian one; the second is the record of what the figure check threw away,
which is the only way to see the check working.

## The platform quirk that shapes everything

**`/catalog`'s `created` prop is index time. `/find` and `/ask` read the same
prop as the speech date.** Probed live on 2026-09-05 against the First Nations
label: a catalog window of 2020 returns 0 rows, a window of 2024-07 onward
returns 0 rows, and the September 2026 ingest window returns all 15,026. The
Worker says the same thing in `apiTide`'s comment; the era filters in
`key_moments` and `generate_years.py` prove the `/find` side.

So discovery **enumerates** with `/catalog` and windows client-side on each
row's own `extra.metadata.date`, while the **asks** filter with
`{"prop": "created", "since": ..., "until": ...}`, where it means the speech
date.

There is no `year` labelset — only `decade` (`1990s`, `2000s`, `2010s`,
`2020s`) — which is why the tide uses decades and discovery does not.

## Discovery

`catalog_rows(kb, topic)` pages `/catalog` for every speech carrying the
topic label, 200 rows a page, with `show: [basic, origin, extra]`. About a
second a page: 76 pages for `indigenous-affairs`, 93 for `housing`. Retrieval
is free, so this costs nothing but time. The result is cached under
`scripts/state/reports/rows-<topic>.json` and reused until `--refresh-rows`.

`discover_debates(rows, cfg, since, until)` groups the window's rows by
**debate title** — the resource title minus the speaker and the date, the same
rule as `titleSubject` in `app.js` — and returns the largest groups with their
counts and date spans.

Three filters stand between the grouped titles and a question, and they matter
more than anything else in the pipeline:

- **Chamber furniture.** `Statements by Members` is the second-largest heading
  in the First Nations record since mid-2024 (48 speeches) and the third
  largest in housing (262). It is the shape of the day, not a subject.
  `_PROCEDURAL_DEBATES` and `_PROCEDURAL_PREFIXES` reject it along with
  `Program`, `Standing orders`, `Motions by leave`, `Ministers statements: ...`
  and the rest.
- **Geography headings.** Victorian members' statements file under the
  speaker's upper-house region, so `Southern Metropolitan Region` looks like a
  53-speech housing debate. Titles ending in `Region` or `Electorate` go.
- **OCR wreckage.** The archival load leaves split words behind:
  `Appr Opr Iation (Parl Iament) B Ill; Appr Opriation Bill` is a real
  43-speech group. A stranded capital letter standing as its own word is the
  reliable tell, and no real debate title has one.

A group needs at least **3** speeches to count as a debate.

## The questions

`now.sections` are 6 to 8 questions, each asked with the window filter and
`top_k` 20:

1. One per discovered debate, in plain words — *"What has parliament said
   about the Statewide Treaty Bill 2025?"* The reading stage (`- Second
   reading`) is stripped, and a bill or an act gains its `the`.
2. The report's curated questions, with the period spliced in — *"What have
   MPs said about housing affordability and home ownership **since July
   2024**?"*
3. Deduplicated, capped at eight.

**Ordering is a judgment call.** Discovered questions lead, because the owner's
brief is that the report follows the live argument. But a report whose eight
largest debates are all one state's bills would lose every question that gives
it its identity, so `window_questions()` guarantees the curated questions their
slots in the middle and fills the rest from discovery. Change `limit` or the
`min(5, lead)` split if you want a different balance.

A discovered title that only repeats the report's own subject — `Housing`, the
single largest heading in the housing record at 307 speeches — stays in
`discovered` as a true finding but does not become a question, because it
would be the curated question with the serial numbers filed off
(`is_topic_echo`).

## The windows

| window | from | to | why |
| --- | --- | --- | --- |
| `now` | `2024-07-01` (`--since`) | open | the current parliament's argument |
| era 1 | 1993-01-01 | 2009-12-31 | the corpus starts in 1993 |
| era 2 | 2010-01-01 | 2019-12-31 | |
| era 3 | 2020-01-01 | 2024-06-30 | stops the day before `now` starts |

The last era stops where `now` begins, so no speech is counted in both and no
reader is shown the same argument twice. The validator asserts it.

Each era gets **one** ask, phrased for the period and seeded by discovery over
that same window: *"How did parliament argue about first nations between 1993
and 2009? The debates of the period included ..."*. The listed debates steer
retrieval as well as telling the model what the period was about.

## The prompts

Every windowed ask uses the **Worker's own template** (`WINDOW_SYSTEM` and
`WINDOW_PROMPT`), not v1's `SECTION_PROMPT`. That is deliberate. A filtered ask
is a narrow, mixed context, and the platform's default refuses it outright
("Not enough data to answer this.") two runs in three — measured on production
and recorded in `MIGRATION-ARAG.md`. The Worker's template is the version that
was fixed against exactly that, and it also carries the ban on the
"Based on the provided context" opener the owner rejected in v1.

`KbClient.ask()` gained `system` and `show` for this. Without `show`, the
retrieval results carry no `origin` and no `extra`, which is why every v1
section source has a null speaker and a null date.

Sources are returned with a `cited` flag from the answer's citation map, cited
ones first, so a section can be checked by eye.

## Key figures, and their denominators

A v1 tile was a value and a free sentence, and the free sentence is where a
tile can quietly reverse its denominator. *"27% of the prison population are
First Nations people"* and *"27% of First Nations people are in prison"* read
identically to a model and mean opposite things; a reviewer found one such
tile in v1.

v2 makes the model hand over the parts — `numerator`, `denominator`, `unit`,
`measure`, `jurisdiction`, `as_of` — and then checks the parts against the
passage the model was shown. `numbered_sources()` now shows 900 characters of
each retrieved passage instead of 240, so a figure arrives with its base
attached, and the same text is what the check runs against.

`stat_support()` drops a figure unless:

- the numerator is a number, and appears in the passage **as a number**
  (`27` must not match inside `270`);
- a scale word travels with it — `1.1` in a passage about 1.1 per cent does
  not support `$1.1 billion`;
- the denominator's own numbers all appear, and at least one distinctive word
  of a named base appears;
- the number and its base fall within 240 characters of each other; **and**
- for a **share**, the record joins that number to *that* base within one
  breath — 40 characters before, 60 after, with the word that joins them.

That last rule is the anti-reversal guard, and it is the one that earns its
keep: on the worked example above, the correct denominator passes and the
reversed one fails, in both word orders.

`compose_stat_label()` then builds the tile's label from `measure`, appending
`as a share of <denominator>` when a percentage does not already name its base.
The label is never the model's own sentence.

**A figure with no stated base is not a statistic.** A fund's size, a bare
year, the name of a rule — v1 shipped all three — are dropped, and the reason
is written into `key_stats_dropped` so the drop is auditable rather than
invisible. Expect fewer tiles than v1. That is the point.

## Positions, voices, tide, lede

- **Positions** are extracted from `now`-window sources only, so a party is
  never shown holding a position it has since abandoned. Each row carries
  `window: "now"`.
- **Voices** are counted from the catalog rows, not generated: the top eight
  speakers on the topic in the `now` window and across the whole record, with
  each speaker's most common party label. This is "who speaks on this topic",
  and it costs nothing.
- **Tide** is `/api/tide`'s method — a topic's count over the decade's
  labelled speeches — computed directly with eight `page_size=0` catalog
  calls. **Federal only**, for the endpoint's own reason: the state Hansards
  start at different dates, so an all-parliament share would track the mix of
  sources as much as the mix of subjects. `tide_scope` records it.
- **Lede** is three sentences over the `now` sections' own answers, each
  carrying a `source_ref` into the sections' own **cited** sources. The
  citation therefore points at a record the report actually went to, not at a
  fresh retrieval.

## The budget

Paid calls per report, at the default settings:

| block | calls |
| --- | --- |
| `now` sections | 6-8 |
| eras | 3 |
| key figures | 1 |
| positions | 1 |
| lede | 1 |
| **total** | **12-14** |

Everything else — discovery, catalog paging, the tide, the voices, key-moment
retrieval and every per-field text read — is free and unmetered.

The generator prints `Paid calls this run: N (...)` at the end of every run,
broken down by block. **Count them and stop at the cap.** A `--only` run pays
only for its own block.

Generation goes through this script and nothing else. The Worker's `/api/ask`
is the reader's path, not the generator's.

## Running one report

```sh
# everything, one report: ~14 paid calls
python3 scripts/generate_reports.py housing

# one block at a time; every other field is preserved
python3 scripts/generate_reports.py housing --only now          # 6-8 calls
python3 scripts/generate_reports.py housing --only over-time    # 3 calls
python3 scripts/generate_reports.py housing --only stats        # 1 call
python3 scripts/generate_reports.py housing --only positions    # 1 call
python3 scripts/generate_reports.py housing --only lede         # 1 call
python3 scripts/generate_reports.py housing --only voices       # free
python3 scripts/generate_reports.py housing --only key-moments  # free

# move the window, or re-enumerate the topic from the catalog (free, ~2 min)
python3 scripts/generate_reports.py housing --since 2025-01-01
python3 scripts/generate_reports.py housing --refresh-rows

# check the result, locally and against the live box
python3 scripts/validate_reports.py housing
python3 scripts/validate_reports.py --offline        # no KB calls
```

`--only lede` reads the `now` sections already in the file, so run it after
`--only now`, never before.

Nothing here deploys. Publishing is `cd portal && npx wrangler deploy`, and a
corpus change is not finished until `CACHE_EPOCH` is bumped — see
`MIGRATION-ARAG.md`.

## What the check cannot do

The figure check is mechanical. It reads the passage the model read and asks
whether the claimed parts are in it, close enough together. It cannot tell you
that a speaker's number was wrong when they said it, that a 2011 figure is
stale, or that two sources disagree. Nothing replaces reading the tiles.
