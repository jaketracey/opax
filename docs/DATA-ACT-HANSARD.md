# ACT Legislative Assembly Hansard

Source `act_hansard`, state `act`, chamber `act_la`. Loader: `parli/ingest/act_hansard.py`
(tests: `tests/test_act_hansard.py`).

## Source and licence

`https://www.hansard.act.gov.au/`, the Assembly's own site. Every sitting day since 1989 is one PDF;
the debates index at `/hansard/debates(PDF).htm` links an assembly/year page per year
(`/hansard/11th-assembly/2026/debates(PDF).htm`), each listing that year's sitting days.
No authentication, no API. robots.txt on the host: `Allow: /`, `Crawl-delay: 0`; the loader stays at
one request a second under an honest user agent (`OPAX research (https://opax.com.au; contact ...)`).

Licence, verbatim from `parliament.act.gov.au/functions/footer/reuse-policy` (the Hansard site's
footer links to it): *"Except where otherwise noted, all content on this website is provided under
the Creative Commons BY-NC-ND 4.0 licence. This lets you copy and share unaltered content for
non-commercial purposes so long as you attribute it to the ACT Legislative Assembly."* Speech text is
stored as printed (whitespace normalised, nothing reworded); OPAX stays non-commercial; credit the
**ACT Legislative Assembly** wherever ACT speeches are shown. Same regime as federal Hansard already
in the knowledge box (CC BY-NC-ND), so the same open question applies to the generated summaries.
Members' official portraits are **excluded** from that licence ("cannot be used for political or
commercial purposes"): the loader never fetches them and `docs/PHOTOS.md` sources must not use them.

## What is published: Proof and Final

| file | meaning |
|---|---|
| `YYYYMMDD.pdf` (e.g. `20250318.pdf`) | **Final** (Weekly Hansard), after members' corrections |
| `PYYMMDD.pdf` (`P250513.pdf`) | **Proof** (edited daily proof), green rows on the index |
| `tPYYMMDD.pdf` (`tP260203.pdf`) | a proof still being edited (2026 files); treated as a proof |

A proof appears about a week after the sitting (15 Sep 2026 proof: PDF created 22 Sep). The Final
can lag by many months: on 28 Sep 2026 the 2025 index still had 24 proof days (13 May 2025 onward)
and 2026 was all proof. So the nightly job will load proofs and, much later, swap them for Finals.

There is also an HTML edition (`/hansard/<assembly>/<year>/HTML/weekNN/pX-pY.html`, index
`debates(HTML).htm`, Final only, 1989 onward). It stops at week 5 of 2025 for the 11th Assembly, so it
cannot serve the current window; it is not used.

## What the loader does

```
index pages (1 master + 1-2 year pages)  ->  best document per date (Final > proof > tP)
  -> conditional GET (If-None-Match / If-Modified-Since; the site's IIS answers 304)
  -> raw PDF cached in ~/.cache/autoresearch/act_hansard/pdf/<year>/<date>_<name>
  -> pdfminer.six glyph lines -> turns -> `speeches` rows (+ side tables)
```

* **No poppler.** Parsing is pdfminer.six (already a locked dependency; the QLD loader uses it):
  ~3 s for a 100-page day. `pdftotext` was used only during validation.
* Nightly cost: 2-3 index requests plus one conditional GET per proof in the window (a 304 costs
  nothing to parse). A Final is never fetched again; a proof older than the window is only looked at
  when the index shows a different file name for its date (that is, the Final has appeared).
* Idempotent: a day with the same document hash and parser version is skipped; nothing is
  re-inserted. Dedup within a day is the other loaders' key, exact `(speaker, date, text)`, checked
  on that day's rows only (never a whole source).
* Guards: a day that parses to under 5 turns or under 0.4 turns per page is an error (the layout
  changed), a reload that would delete more than 40% of a stored day's turns is refused, one bad day
  never stops the run, and the exit status is 1 if any day failed.
* No FTS work: the loader never touches `speeches_fts`.

### Rows

One row per speaker turn.

| column | value |
|---|---|
| `speaker_name` | honorific + surname as the Hansard prints it, recased: `Ms Castley`, `Mr Deputy Speaker`. Full names come from the roster (below) |
| `electorate` | from the label (`MR CAIN (Ginninderra)`); empty in question time, where the label is bare |
| `topic` | heading path: `Questions without notice: Minister for Health—conduct`, `Petition: Motion to take note of petition`, or the bill title (`Level 1: Level 2`) |
| `party` | **NULL.** The label carries no party and the roster only knows today's party (Castley and Carrick sat as Liberals, now Independents); a wrong party on a speech is worse than none |
| `chamber`, `state`, `source` | `act_la`, `act`, `act_hansard` |
| `date` | sitting date from the file name (running page headers carry typos, e.g. "15 October 2026" on a 15 September proof) |

Side tables (created by the loader): `act_hansard_days` (one row per date: kind, file name, url, ETag,
Last-Modified, PDF sha256, parser version, turn count), `act_hansard_turns` (speech_id -> date,
position in the day, text hash, which document the text came from) and `act_hansard_kb_queue`.

### What is in the text and what is dropped

Kept: every turn by a named member, including plain-type interjections in question time and points
of order (`Mr Cocks: Point of order.`; they are short and fall under the corpus's 200-character
floor), the chair's turns (`Mr Speaker`, `Madam Assistant Speaker`; `arag_sync` P2 already excludes
`%SPEAKER%` and `%CHAIR%` from the knowledge box), and ministers' written answers printed under
"Questions without notice taken on notice" / "Answers to questions" (`Ms Stephen-Smith (in reply to a
question by Ms Castley on ...):`), which are real, attributed government answers.

Dropped (never stored): the contents pages and cover; the running header and page number; petition
text and the Ministerial responses that follow it (no speaker); the chair's formulae and the record's
narration (`Question put`, `Question resolved ...`, `Debate (on motion by ...) adjourned`, `Sitting
suspended`, `Clause 9.`, `Leave granted`, "Motion (by Ms Cheyne) agreed to:"); division tables (the
`Ayes`/`Noes` name lists); italic stage directions (`Members interjecting—`, `(Time expired.)`);
office labels that are not members (`THE CLERK:`, `MEMBERS:`).

The clock time in a label is stored as printed (12-hour, no am/pm): `5.01` is 5.01 pm.

## Parser notes

The Assembly's PDFs are Word exports with the same conventions from 1999 to today:

* speaker label = **bold Times** name at the left margin (`MR STEEL`, `Mrs Dunne`) then regular
  `(Electorate—portfolios) (10.06), by leave:`; the label wraps over lines for ministers. In some
  volumes (2012, 2020) the bold run spills over the `(`; the parser strips it.
* headings = **bold Arial** (14 pt level 1, 12 pt level 2); pre-2002 volumes set them as centred bold
  Times, handled as a fallback.
* a plain-type `Mr Moore: I take a point of order` is a turn only if Mr Moore also holds a bold label
  that day.
* visual lines are rebuilt from glyph positions (`extract_pages(..., laparams=None)`), which keeps
  justified lines and hanging labels in one piece; explicit space glyphs are kept because justified
  lines squeeze the gap between words below any geometric threshold.
* paragraphs are split on vertical gap (> 1.5 x font size); a paragraph that runs over a page break is
  rejoined when the previous line has no closing punctuation.
* a label without a colon after the time (`MR STANHOPE (...) (6.20) Mr Speaker, ...`, 2004) still parses.

## Proof to Final

When the Final for a date appears, `load_day` re-parses and aligns the stored day with the new parse
turn by turn (`align_turns`: same speaker and text prefix, else similarity >= 0.6 within the changed
region), then, keeping every `speech_id` (citation URLs survive):

* matched turn, text/topic/speaker changed -> `UPDATE` in place, `text_clean*` cleared so
  `speech_hygiene` recomputes it, and the id is queued in `act_hansard_kb_queue` (`patch`);
* turn only the Final has -> inserted as a new row (next speech_id, above the push checkpoint, so the
  ordinary `arag_sync` push carries it);
* turn only the proof had -> row deleted, queued (`delete`).

What `arag_sync` does with a changed row, checked in the code: **nothing**. It pushes each speech once
(`speech_id > checkpoint`), a repeat is a 409 no-op, and its own `--repair-speech-text` only rewrites
rows whose `text_clean_rules` match the hygiene rules. `scripts/arag_patch_speakers.py` (queue
`ext_kb_patch_queue`, reason `text:*`) would PATCH text but it is not part of the nightly. So:

```
python -m parli.ingest.act_hansard --patch-kb      # after arag_sync, needs ARAG_KB_ID/ARAG_KB_TOKEN
```

reads the checkpoint in `arag_sync_state.json` and, for rows at or below it: PATCHes the `texts` field
only (labels, origin, summaries untouched, like the existing repair path); a 404 (the proof turn was
under 200 characters and never pushed) creates the resource if the Final's text now qualifies; deletes
the resources of removed turns. Rows above the checkpoint are marked done: the next push sends the new
text. Failures stay queued with the error.

Known gaps (recorded, not fixed): the resource `title` (speaker — topic — date) is not PATCHed, so a
topic correction in the Final leaves the box's title stale; a PATCHed text leaves the Worker's
generated summary/topic labels (`opax-enrich`) describing the proof; bump `CACHE_EPOCH` after a large
patch run as after any corpus change.

## Members

`python -m parli.ingest.act_hansard --members` reads the Assembly's "Current members" table
(`parliament.act.gov.au/members/current`, one request; that host's robots.txt asks 20 s between
requests, one fetch is well inside it) and upserts the sitting MLAs into `members`: state `act`, chamber
`act_la`, first name, surname, electorate, and **today's** party (Labor / Liberal / Greens /
Independent). A surname-only stub `link_speakers` already made is completed in place (same
`person_id`); anyone else gets `act_<first>_<last>`. Fewer than 20 rows means the page changed and
nothing is written. `link_speakers` then attaches `person_id` by surname within state `act`, exactly as
for QLD; `state_rosters` now includes `("act", "act_la")` (Wikidata Q6814365) to name older
surname-only stubs, but Wikidata's ACT roster is patchy (many terms lack district and party, the 2024
intake is incomplete), which is why the current list comes from the Assembly.

**Backfill caveat.** Linking is by surname within the state and knows nothing of dates. With only the
sitting members loaded, a 1990s `Mr Berry` (Wayne Berry, to 2008) would link to Yvette Berry (from
2012). The 11th Assembly (from 19 Oct 2024) has no such collisions among the current list; going
earlier needs a historical roster with terms or a date-aware linker first (see "Backfill scope").

## Commands

```
# nightly (window from daily_refresh.sh's SINCE)
python -m parli.ingest.act_hansard --members
python -m parli.ingest.act_hansard --start "$ACT_START"
python -m parli.ingest.act_hansard --patch-kb                 # inside the OPAX_SYNC_KB=1 block, after arag_sync

# backfill (idempotent, resumable: re-run to continue; 3-5 s a day incl. the 1 s request delay: the 67
# days of the 11th Assembly took 4 minutes, a full 1993-2024 history would take 1.5-2 hours)
python -m parli.ingest.act_hansard --start 2024-10-19 --end 2026-09-30
# or through the nightly script, with the members step and the push (one-off; needs OPAX_SYNC_KB=1)
OPAX_ACT_START=2024-10-19 OPAX_STEP_TIMEOUT=2h OPAX_SYNC_KB=1 \
  OPAX_ONLY=act_members,act,link_speakers,classify,arag_sync,act_kb_patch scripts/daily_refresh.sh
python -m parli.ingest.act_hansard --start 2024-10-19 --end 2026-09-30 --db /scratch/copy.db --cache-dir /scratch/act   # test copy

# development
python -m parli.ingest.act_hansard --parse-file some.pdf       # no network, no database
python -m parli.ingest.act_hansard --start 2025-03-18 --end 2025-03-18 --dry-run
python -m parli.ingest.act_hansard --start ... --force         # re-fetch and re-parse loaded days
```

`daily_refresh.sh` lines for the pipeline owner:

```bash
ACT_START="${OPAX_ACT_START:-$SINCE}"                # with the other per-source start dates
...
run_step act_members "SELECT COUNT(*) FROM members WHERE state='act'" \
  "$PY" -m parli.ingest.act_hansard --members
run_step act "SELECT COUNT(*) FROM speeches WHERE source='act_hansard'" \
  "$PY" -m parli.ingest.act_hansard --start "$ACT_START"
...                                                   # inside the OPAX_SYNC_KB=1 block, after arag_sync
run_step act_kb_patch "SELECT COUNT(*) FROM act_hansard_kb_queue WHERE done_at IS NULL" \
  "$PY" -m parli.ingest.act_hansard --patch-kb
```

Order matters: `act_members` and `act` before `link_speakers`. `act_members` may reasonably go in
`OPAX_ALLOW_FAIL` (a redesign of the Assembly's members page must not fail the night); the step
names `act` maps to `raw_source_updates.act_speeches` in `scripts/update_corpus_manifest.py`, which now
also adds the "ACT Legislative Assembly" row to `corpus.json` the first time the box holds
`source=act_hansard` resources (set `NEW_SOURCE_ROWS` first year if a backfill goes further back).
`scripts/vm/transfer_state.sh` may add `act_hansard` to `CACHE_DIRS`; losing the PDF cache only costs
refetches.

## Knowledge box labels and the portal

`arag_sync.map_speech` copies the row's `state` and `chamber` into the labels, so no mapping there:
`kind=speech, source=act_hansard, state=act, chamber=act_la, decade=2020s`; the dedupe priority
falls through to its `ELSE 7`. Portal changes: the Worker's `state` filter allow-list gains `act` and
`act` leaves the "extended states" that had their KB search suppressed (`src/index.ts`); the search
page's Parliament select, `STATE_NAMES`, `PARLIAMENT_NAMES`, the directory's chamber filter
(`act_la: ACT Legislative Assembly`), the topic pages' coverage window, the stats page's live table
and the person-role titles know the ACT (`portal/test/act-hansard-labels.test.mjs`). The home page's
"Browse by parliament" links are left alone until the backfill is in the box.

## Availability and volume (measured 2026-09-29)

The index lists a PDF for **every sitting day from 1989** (1st Assembly) to the 11th Assembly's week 8 of 2026:
1,455 sitting-day PDFs, roughly 30-55 a year. The corpus floor is 13 March 1993 (`arag_sync.DEFAULT_SINCE`), which is the
2nd Assembly's 1993 sittings; everything after it is in scope for the KB.

The **11th Assembly, loaded in full into a scratch copy** (6 Nov 2024 - 17 Sep 2026): 67 sitting days
(19 Final, 48 proof), 13,898 rows after within-day dedupe, **9,023 of them 200 characters or more**
(8,712 after `arag_sync` drops the chair's turns: what the box would take), 19.8 MB of text in those, 37
distinct speaker labels (29 with a >= 200-character turn), average 2,280 characters per kept row.
About 135 kept speeches per sitting day, about 5,000 a year.

Earlier years, by **sampling three sitting days per year with the real parser** (v3; v4 adds under 1% more turns) (day counts are exact,
per-day counts are the sample mean; the range is the min-max of the three days). "Est. kept" = days x mean
turns of >= 200 characters (chair turns included, about 4-15% of them):

| year | days | est. kept | | year | days | est. kept | | year | days | est. kept |
|---|--:|--:|-|---|--:|--:|-|---|--:|--:|
| 1993 (from 13 Mar) | 45 | 7,020 | | 2004 | 36 | 5,628 | | 2015 | 39 | 3,523 |
| 1994 | 43 | 6,350 | | 2005 | 45 | 3,645 | | 2016 | 28 | 3,836 |
| 1995 | 34 | 4,069 | | 2006 | 39 | 4,472 | | 2017 | 39 | 5,291 |
| 1996 | 42 | 8,918 | | 2007 | 38 | 6,473 | | 2018 | 39 | 4,979 |
| 1997 | 42 | 7,658 | | 2008 | 35 | 5,017 | | 2019 | 40 | 4,893 |
| 1998 | 34 | 5,157 | | 2009 | 43 | 7,769 | | 2020 | 20 | 3,747 |
| 1999 | 39 | 6,162 | | 2010 | 42 | 7,630 | | 2021 | 33 | 4,334 |
| 2000 | 37 | 5,266 | | 2011 | 43 | 7,926 | | 2022 | 35 | 4,480 |
| 2001 | 34 | 7,038 | | 2012 | 29 | 5,481 | | 2023 | 38 | 4,345 |
| 2002 | 39 | 4,615 | | 2013 | 39 | 4,745 | | 2024 | 28 | 3,341 |
| 2003 | 43 | 6,679 | | 2014 | 41 | 4,155 | | | | |

(Years that changed Assembly count both PDFs; 2020 and 2024 each hold two Assemblies.) Roughly 3,300-8,900
kept speeches a year, **about 175,000 for 1993-2024** (366 MB of text; +29% on the box's ~600,000
speeches), of which about 106,000 are 2004 onward, 57,000 from 2012, and 20,000 from 2020.

## Backfill scope

* **Now: the 11th Assembly**, 8,712 resources and 20 MB. Roster and linking need nothing more
  (all 25 sitting MLAs on the Assembly's list; 100% of the 8,712 kept rows linked in the scratch copy; the
  one surname-only stub, `act_rattenbury`, a former member, is named by `state_rosters resolve` from
  Wikidata: "Shane Rattenbury").
* **Safe without linker changes: back to the 10th Assembly (17 Oct 2020)**, +about 16,400 resources
  (2020 from the election: 3 days; 2021-2023 in full; 2024 to the election). Against both rosters (the
  Assembly's current list and Wikidata's) no two members of the 10th and 11th Assemblies share a surname.
* **Do not go earlier before fixing the linker.** `link_speakers` links by surname within the state and
  ignores dates and honorifics, so a 1990s `Mr Berry` (Wayne Berry; 3,817 rows in 1993-95 alone) links to
  Yvette Berry, and `Ms Burch` (Joy Burch) and `Miss C Burch` (Candice Burch, 2017-20) share one stub.
  What is needed: honorific-gender and term-date aware linking for `act`, or a historical roster with
  terms (Wikidata has 107 rows for the chamber but most lack district and party).
* Enrichment: the `opax-enrich` Worker discovers speeches by the box's `created` timestamp (push time,
  `enrich/src/discover.ts`), so a backfill push is picked up without seeding, as new content at priority
  100. At the Worker's daily budget (the vetting report put it near 5,400 speeches a day) the 11th
  Assembly is a couple of days of work; the 1993-2024 history would be a month.

## Validation (scratch data, 2026-09-29)

* **Label recall.** For 14 sitting days across 1993-2026 the parser's speaker labels were compared to an
  independent poppler `pdftotext` regex count of upper-case labels at line starts: 3,191 labels, of which the
  parser reads all but 7, and all 7 are narration (`MR SPEAKER (Mr Berry) took the chair at 10.30 and asked
  members to stand in silence ...`: no colon, not a turn). The same comparison found the parser's real misses
  earlier (labels with a bold run that stops at a hyphen, `MS STEPHEN`+`-SMITH:`, in the 2026 proofs; a 2023
  label with an unclosed role bracket; a `by leave:` modifier without a comma), all fixed and covered by
  tests. It also reads 33 labels the regex cannot (hanging 1990s labels, `MISS C BURCH`).
* **Attribution.** 993 randomly chosen kept turns (>= 200 characters) from 17 days (1993 to a 2026 proof;
  Finals, proofs and `tP` files) whose opening 80 characters occur exactly once in poppler's text: the
  nearest preceding label in poppler's rendering names the same person for **992 of 993 (99.9%)**; the one
  disagreement is the checker's, not the parser's (`MISS C BURCH`, an initial its regex cannot read).
* **Procedural rows.** Across ten sitting days (1999-2026) the only paragraphs left inside a turn with
  procedural wording were `Motion ... agreed to:`-style lines fixed by the outcome pattern; the residue scan
  (short paragraphs mentioning agreed/negatived/resolved/adjourned/clause/question) was empty afterwards.
  Petition text and ministerial responses (up to 139,000 characters on a proof day) are dropped as
  unattributed. No running header, page number, `PROOF` footer or contents line appears in any stored text.
* **Alignment.** On a real 184-turn proof with 40 turns edited, 8 given new openings, 6 deleted and 6
  inserted, `align_turns` re-matched all 178 surviving turns to their original rows and reported the 6
  deletions and 6 additions exactly.
* **Linking.** Roster seeded from the live members page (25 rows) then `seed_state_members` +
  `link_state_speakers`: 8,712 of 8,712 kept non-chair rows linked; the one unlinked short row is a proof
  typo (`Ms Castle Y`, corrected in the Final).

## Open issues

* Historical linking (above); `party` on speeches (above); Wikidata-derived names for departed members
  arrive only through `state_rosters` (it needs `state_rosters fetch` to have run since ACT was added).
* The ministerial responses to petitions ("Petitions - Ministerial responses"), petition prayers and
  answers to questions on notice published as separate documents (`hansard/questions.htm`) are not loaded.
  The first are attributed only by a "By Ms X, Minister for Y" line; the second are a separate document
  family with their own index.
* A Final that is silently reissued under the same file name is not refetched (use `--force`).
* Topics keep the printed case: volumes before 2002 head sections in capitals ("QUESTIONS WITHOUT NOTICE:").
