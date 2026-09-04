# Bills: the projection, the routes and the knowledge-box resources

How a row in the bill registry becomes three things a reader can reach: a static
JSON file the portal fetches, a `/bill/<key>` page the crawler can read, and a
`bill-<key>` resource the search and ask endpoints can cite.

`docs/BILLS-CONTRACT.md` fixes the shapes. `docs/SCOPE-BILLS.md` holds the
measured facts behind every number here. This file is the operating manual:
what each field means, how the joins are made, and how to rerun the whole thing.

## The pieces

| Piece | Where | What it does |
| --- | --- | --- |
| `scripts/export_bills.py` | runs on the data box | reads the registry read-only, writes `portal/public/bills/index.json` and one `<key>.json` per bill |
| `scripts/export_bills.py --fill-briefs` | runs anywhere with box credentials | attaches the machine brief the box already holds for each bill speech |
| `portal/src/index.ts` | the Worker | `bill` in the search/ask `KINDS` allowlist, and the `/bill/<key>` SEO route |
| `scripts/publish_bills.py` | runs anywhere with box credentials | upserts `bill-<key>` resources into the knowledge box |

Nothing here deploys, touches `CACHE_EPOCH`, writes to the database, or deletes
a knowledge-box resource.

## 1. The projection

### Running it

The database is 24 GB and lives on the data box, so the projection runs there
and the files come back:

```sh
scp scripts/export_bills.py desktop:/tmp/
ssh desktop 'python3 /tmp/export_bills.py --legacy --out /tmp/bills'
rsync -a --delete desktop:/tmp/bills/ portal/public/bills/
python3 scripts/export_bills.py --fill-briefs portal/public/bills
```

The read is `mode=ro` with `PRAGMA query_only=ON` inside one transaction, and
`sqlite3` is not installed on the box, so everything goes through Python's
driver. A full legacy run takes about seven seconds.

`--sample N` writes only N bill files while `index.json` still lists every bill.
That is how the committed fixture was made: `--legacy --sample 200`.

### Two registry modes, one code path

| Mode | Reads | Bill key | Joins |
| --- | --- | --- | --- |
| `--legacy` | `bills`, `bill_progress`, `ext_parlinfo_docs` | `au-federal-alrc-<bill_id>` | the audited title rule |
| default | `bills_v2`, `bill_events`, `bill_sources`, `bill_summaries`, `bill_links` | whatever `bills_v2.bill_key` says | `bill_links`, falling back to the title rule when the table is empty |

The default mode refuses to run and tells you to pass `--legacy` when `bills_v2`
is not in the database yet. Everything downstream of the registry read is shared,
so the switch changes the keys and the joins and nothing else.

### The title rule

Legacy mode has no billhome id to key on, so divisions, speeches and Acts join
by title, using the rule audited in `docs/SCOPE-BILLS.md` section 4, reproduced
exactly:

- NFKC and casefold, `&` becomes `and`, bracketed four-digit reprint years are
  dropped, a fiscal year expands (`2005-06` to `2005 2006`), everything else
  collapses to word tokens. `[No. 2]` survives, which is what keeps a
  reintroduction distinct from the bill it reintroduces.
- A registry title must appear as a contiguous run of tokens inside the heading,
  and a base title is refused when the next token is `no`. Without that refusal
  a second introduction inherits the first bill's record.
- A candidate must be federal, introduced on or before the division or speech,
  before the next parliament opens, and on or before its recorded royal assent.
  Exactly one candidate per title, or the title is ambiguous and emits nothing.
- Acts join on the base title with the terminal year removed plus the bill's
  exact recorded assent date, so a 2015 Bill can reach the 2016 Act it became.

The legacy run reproduces the audit's counts exactly: 1,084 bills with divisions,
1,123 with speeches, 2 ambiguous titles. That match is the check that the port
is faithful, and it is worth rerunning after any change to `norm` or the window.

The window is deliberately conservative. Resumed Senate bills and post-assent
references are missed rather than mis-assigned, and section 4 records the one
measured ambiguous pair (TVFY 4664).

### Party splits, and why they are not read off the members table

A division's `party_splits` reads each voter's party **at the division's own
date**.

Neither obvious source is dated. `ext_votes.party` is populated from `members`,
and `members` holds one row per person and therefore one party: the member's
last recorded affiliation. Measured 2026-09-05, no federal person carries more
than one party across their vote rows. Using it put Katter's Australian Party on
both sides of a 2006 division, four years before the party existed.

Hansard does carry the date. Every speech row records the party the speaker sat
for that day, and `speeches.party_canonical` cleans it: Bob Katter reads
Independent through 2016 and Katter's Australian Party from 2017; Craig Kelly
reads Liberal to 2020 and United Australia Party from late 2021. The exporter
collapses those observations into a per-person timeline and reads a division
against it.

Every answer records how it was reached, and each division publishes its own
coverage in `party_coverage`:

| Bucket | Meaning | Federal votes |
| --- | --- | --- |
| `dated` | an observation on or before the division | 732,349 |
| `earliest` | only later observations; their earliest recorded party stands in | 55,918 |
| `member` | no speech observation at all; the members row stands in | 56,607 |
| `unknown` | nothing recorded | 0 |

`index.json` carries the totals in `meta.party_coverage` and the explanation in
`meta.party_basis_note`. A page showing a split should say what it rests on; a
division whose coverage is mostly `member` is not dated evidence.

The same timeline gives `sponsor_party`, read at the introduction date.

### Fields the contract does not name

Three additive fields, all on a division: `party_coverage` above, `paired` (the
count of paired votes, which belong to neither side), and nothing else. Every
other key is exactly `docs/BILLS-CONTRACT.md`.

Two deliberate nulls:

- `parliament` is null for a bill introduced before 1998-11-10. The audited
  opening list starts there, and both the parliament number and the candidate
  window depend on it, so extending the list would change the matching rule. A
  null is better than a guessed number, and phase 1 is 2013 onwards.
- `stage_hint` on a speech is whatever the topic string itself says, which for
  federal speeches is almost always nothing. Section 3 measured zero explicit
  second-reading federal topics. A bill match is not evidence of a reading
  stage, and this field never manufactures one.

### `index.json`

One bill per line inside an ordinary JSON array. Indenting 5,313 rows would add
a megabyte to the download and make the file unreadable in review; one line each
keeps it at 2.3 MB, 164 KB gzipped, and it still diffs cleanly. `/*.json` in
`portal/public/_headers` already covers `/bills/`, so caching needed no change.

### Speech briefs

Briefs are a second phase because the box credentials are not on the data box
and the projection does not need them:

```sh
python3 scripts/export_bills.py --fill-briefs portal/public/bills
```

It reads `da-summary-t-body` for each speech slug through
`GET /slug/<slug>/text/<field>`, which is the same field a per-rid read returns
without needing a resource-id lookup first. It caches every answer in
`~/.cache/autoresearch/bill_speech_briefs.json` so a rerun is free, and writes
the briefs back into the bill files. Speeches are capped at 24 per bill,
earliest first. In the committed fixture, 1,846 unique slugs across 200 bills,
1,200 of which carry a brief; a null brief is a shape the UI has to render.

## 2. The Worker

`KINDS` gains `bill`, so `kind=bill` passes search and ask filter validation the
same way `division` does. Nothing else in the filter path changes.

`/bill/<key>` is an SEO route. The key must be lowercase, hyphenated and at most
64 characters; the route reads `/bills/index.json` through the ASSETS binding and
serves the app shell with the bill's own title and a one-line description:
status, originating house, introduction date, then the division and speech counts
when they fit inside the 158-character budget. Long titles trim the bill and keep
the masthead, the way `docMeta` trims a division's motion. `Legislation` JSON-LD
and a prerender block go with it.

A key `index.json` does not carry is a 404: a bill key is minted by the exporter
and cannot be typed from a name, so there is no near-miss to be generous about.
An `index.json` that fails to load is **not** a 404 — the app can still fetch the
bill itself, so the route serves a generic 200.

The isolate memoises a key-to-row Map rather than the parsed 2.3 MB file. The
route needs a title and a sentence; the per-bill file carries the rest.

The sitemap deliberately does not list bill pages. `app.js` has no `/bill` route
until the UI agent lands one, and listing five thousand URLs that render an empty
shell would be worse than listing none. Add them to `sitemapXml` in the same
change that ships the client route.

## 3. The knowledge-box resources

```sh
python3 scripts/publish_bills.py --dry-run                 # the plan, no writes
python3 scripts/publish_bills.py --keys au-federal-alrc-1270,au-federal-alrc-2796
python3 scripts/publish_bills.py --with-summary-only        # the bulk pass
python3 scripts/publish_bills.py --verify                   # read the catalog back
```

Credentials come from `.env` (`ARAG_ZONE`, `ARAG_KB_ID`, `ARAG_KB_TOKEN`) through
`parli/arag.py`, which carries the retry and backpressure handling.

### What lands

| Part | Content |
| --- | --- |
| slug | `bill-<bill_key>` |
| title | the bill's official title |
| body | the reviewed model summary when there is one, then a paragraph of parsed registry facts |
| labels | `kind/bill`, `state/<jurisdiction>`, `decade/<2000s>`, `parliament/<41>`, `status/<status>`, `sponsor_party/<party>` when known |
| origin | `source_id: opax-bills`, the billhome URL when known, `created` at the introduction date, and the sponsor as the only collaborator |
| extra | the structured record: dates, sources, division keys, speech slugs, the summary payload, `content_hash` |

Only the sponsor is a collaborator. A person filter should find the bills someone
sponsored, not every bill they ever voted on or spoke to.

### Licence boundary

No explanatory memorandum, Bills Digest or billhome prose is copied. aph.gov.au
is CC BY-NC-ND 4.0, which is not permission to publish adaptations, so the body
is either the model's own words about the facts or the parsed metadata itself.
Summaries carry the contract's attribution line and their `as_of` date. The
division paragraph states plainly that a division naming a bill is not evidence
that an aye backed it.

### Idempotency and the caps

Every write carries a `content_hash` over the title, body, labels and metadata,
stored in `extra.metadata.content_hash`. A run reads the stored hash first: equal
means skip, different means PATCH, absent means create. A rerun after a partial
failure costs one GET per bill.

`--cap` defaults to 3,500 resources a run, and bills are ordered newest first so
a capped run lands the ones people are asking about. Nothing deletes: the only
writes are `POST /resources` and `PATCH /slug/<slug>`.

### Verified against the live box

Five real bills, chosen to span the shapes the projection produces: 48 divisions
and no speeches, 28 divisions with 21 speeches and an Act, a Senate bill that
lapsed, one carrying a ParlInfo source, one bare registry row.

| Check | Result |
| --- | --- |
| First run | 5 created |
| Catalog `filters=/classification.labels/kind/bill` | all 5 returned |
| `find` with the `kind=bill` filter | returns the right bill |
| Rerun, unchanged content | 5 unchanged |
| Deliberately altered body | updated, then restored, then unchanged |

The five are left in place: `bill-au-federal-alrc-1270`, `-1433`, `-2796`,
`-4304`, `-4831`.

### Trial run against the registry tables, 2026-09-05

`bills_v2` was mid-build (2,760 rows, `bill_links` empty, no `bill_summaries`)
and the projection ran against it cleanly with no `--legacy`:

| | Legacy mode | Registry mode |
| --- | --- | --- |
| Bills | 5,313 (1988 to 2022) | 2,760 (2013-02-06 to 2026-08-20) |
| Keys | `au-federal-alrc-1270` | `au-federal-r7127`, `au-federal-s1511` |
| Bills with divisions | 1,084 | 894 |
| Bills with speeches | 1,123 | 0 |
| Sources | thin, title-matched | from `bill_sources`, with licences |
| Sponsor party | from the speech timeline | from the registry's own listing extras |

Zero speeches is the measured truth, not a porting fault. `bills_v2` starts in
2013, and every one of the 800 federal bill-topic speeches between 2013-02-06
and the 43rd Parliament's close has the topic string `Bills` with no title in
it. Section 3 records the same fall-off. Speeches on registry-mode bills will
stay at zero until `bill_links` supplies them or the Hansard debate hierarchy
is recovered.

One shape mismatch to settle with the registry agent: the contract calls
`aliases_json` a list of aliases, and the registry currently writes an object of
listing extras (`listing_title`, `type`, `sponsor_aph_id`, `sponsor_party`,
`summary`). The exporter reads either -- a list becomes the aliases, an object
contributes its `aliases` list and its `listing_title` when that differs from
the title, and its `sponsor_party` is preferred over anything derived here,
because it is the party as the bill page printed it.

## 4. Rerunning when the registry and the summaries land

Once `bills_v2`, `bill_links` and `bill_summaries` are in the database:

```sh
scp scripts/export_bills.py desktop:/tmp/
ssh desktop 'python3 /tmp/export_bills.py --out /tmp/bills'      # no --legacy
rsync -a --delete desktop:/tmp/bills/ portal/public/bills/
python3 scripts/export_bills.py --fill-briefs portal/public/bills
python3 scripts/publish_bills.py --with-summary-only --dry-run
python3 scripts/publish_bills.py --with-summary-only
python3 scripts/publish_bills.py --verify
```

The keys change from `au-federal-alrc-<id>` to `au-federal-r<billhome id>`, so
the full run writes new files and leaves the legacy ones behind. Delete the
`au-federal-alrc-*` files that `bills_v2` supersedes in the same commit, and
leave the box's legacy resources alone unless someone decides to retire them:
this script never deletes.

Only summaries whose `review_state` is `ok`, that are not superseded, and that
carry exactly three sentences and three to six changes are projected. A draft or
a flagged summary shows as no summary at all: the portal shows reviewed model
text or nothing.

## Known limits

- Legacy keys are provisional. They are not stable identities and must not be
  cited as such outside the fixture.
- `sources` is thin in legacy mode. `ext_parlinfo_docs` has resolved a
  `bill_id` for 198 of 500 cached billhome records and 3 of 103 EMs; everything
  else needs an exact normalised title inside the bill's own life window.
- The section 4 precision figures are in-sample. An independent holdout has not
  been run, and 100% on the diagnostic sample is not production accuracy.
- Party coverage is federal only. NSW and Victoria have no party values on their
  vote rows at all, and their splits must not be computed from present
  membership.
- No state bills. Phase 1 is federal.
