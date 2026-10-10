# Federal XML feed (10 October 2026)

The daily federal Hansard source is now `parli.ingest.federal_feed`: public
OpenAustralia XML first, with the existing OpenAustralia API/HTML parser as an
outage fallback. `scripts/refresh_divisions.sh` uses the same module for federal
votes. The API fallback is attempted only when XML is unavailable, never after
a challenge, a robots refusal, or an identity/count error. TVFY is the division
fallback. Keys come from the existing environment; none are printed.

The paths verified with HTTP 200 are:

- House: https://data.openaustralia.org.au/scrapedxml/representatives_debates/
- Senate: https://data.openaustralia.org.au/scrapedxml/senate_debates/
- Person crosswalk: https://data.openaustralia.org.au/members/people.xml
- Dated offices: `members/representatives.xml` and `members/senators.xml`.

All HTTP is serial, at most one request per second, with
`OPAXBot/1.0 (+https://opax.com.au/about; corrections@opax.com.au)`.
`robots.txt` is honoured (the archive returned 404, so there was no robots
restriction). Retry-After supports seconds and HTTP dates. Refusal stops the
request sequence; no browser impersonation, challenge solving or proxy is used.
The passive Cloudflare script on the usable Apache index is not executed.

## Rows and identities

The XML emits the current modern JSONL fields, with the XML `gid`, office ID and
guarded numeric person ID as provenance. `parli.ingest.speeches` retains source
`openaustralia`, the 50-character filter, text cleaner and permanent autoincrement
citation IDs. Person IDs are rechecked through `scripts/roster_identity.py`. The loader
creates a chamber/date index on its writable refresh DB for bounded lookups;
this lane created it only on scratch copies.

The old API/HTML rows and cached JSONL do **not** store OA gids. Reconciliation
therefore uses chamber, date, guarded person and normalized body: whitespace and
the trailing `View the PC OA website` footer are ignored. New imports retain
gid-to-citation mappings in `oa_speech_provenance`; future reruns use those gids
first. A fresh chamber-day inserts normally, deduplicating bodies even under
new gids. An existing chamber-day keeps all its original rows and citation IDs.
Every unmatched XML speech is reported, never inserted on that day. This also
protects API days whose grouped procedural text cannot match XML boundaries.
The nightly writes detailed evidence to `speech-reconciliation.json` in its OA
cache; `--report` exposes the same evidence for manual scratch-copy tests.

The real loader proof for 15–17 September copied 508 federal API rows and the
member table from the read-only DB, preserving the citation high-water mark.
All six chamber-days added **0** rows and retained every original row byte for
byte. It reconciled 54 XML speeches, including `speech-1319216`; 1,755 XML
speeches remained unmatched and were held. The fresh sitting fixture adds one
row; a second gid with the same normalized body adds none.

Membership IDs are not person IDs. `people.xml` explicitly maps each member or
lord office to a person. The office's dated chamber and name must pass the
existing identity guard. An old office ID may resolve through another dated
office only when the crosswalk explicitly identifies the same person. Overlapping
date-only offices retain that person but leave an ambiguous party unset. There is
no surname join. Unknown/procedural speakers retain a null person ID.

Known division keys remain `federal-{house}-{TVFY ID}`, matched by chamber,
ISO date and division number against the read-only DB and cached TVFY list
crosswalk. XML-only keys are `federal-{house}-oa-{date}-{number}`. The XML `gid`,
raw counts, original ParlInfo URL, bill IDs, exact official bill references and membership provenance
are retained. Recorded tellers/pairs are kept; pairs are not added to aye/no
totals. Duplicate voters or a tally mismatch quarantine the source record.

A zero-byte XML file is `no_sitting`, never an error or deletion. A date absent
from the directory is left untouched. Every online run rechecks the index and
selected XML files, so zero-byte/unpublished days can become sittings later.
Nonempty modern files are not deleted for empty days. The loader is skipped if
acquisition fails. Acquisition writes only temporary directory copies. Metadata,
raw XML, JSONL and reports are published after the complete batch validates,
using Linux `renameat2(RENAME_EXCHANGE)` for an atomic directory swap. A refusal
or failure on the second day leaves every existing cache file byte-identical.
Zero-byte observations retain existing speech JSONL. Division application is
additive and transactional: old records are retained and a conflicting stored
vote stops the batch.

Bill links use explicit ParlInfo IDs, not title joins. XML-only federal votes
enter the existing schema 1 exporter through ext_ rows; divisions already
counted by the legacy path are excluded from that additional path, including
XML keys that later receive a TVFY ID for the same chamber/date/number. The API
fallback retains those already published XML keys. The export's
field names, person keys, serializers and schema remain unchanged. Without XML
additions the output is byte-identical to the previous implementation.
XML bill stances require an explicit bill question. Closure, adjournment,
suspension of standing orders, amendments and unresolved questions have zero
stance polarity while retaining totals, votes and exact bill evidence. House
`2025-11-06-23` and `-24` both ask that the question be now put; both classify as
procedural (polarity 0). The legacy TVFY and state export paths keep their
existing field order and serialization.

## Staging audit and schema proof

This lane only opens the real `parli.db` with `?mode=ro`. Raw files, recovery
JSON, diagnostics, the compact proof DB and temporary votes output are under
`/home/jake/opax-staging/oa-feed/`. No repository `votes.json` is regenerated.
The reviewed nightly has an explicit `--load-divisions` path for its refresh
DB; that path was exercised only with fixtures and a staging copy here.

```sh
python3 -m parli.ingest.openaustralia_xml --offline \
  --stage /home/jake/opax-staging/oa-feed \
  --start 2006-02-07 --end 2026-09-17
python3 scripts/verify_oa_recovery.py --stage /home/jake/opax-staging/oa-feed
python3 scripts/verify_oa_speeches.py --stage /home/jake/opax-staging/oa-feed
```

`divisions.json` contains all parsed division/vote evidence; `dry-run.json`
compares it with ext_ records and lists quarantines. `schema1-proof.json`
records the original read-only export comparison, the schema 1 decoder result,
the recovered rows added to the compact staging copy, hashes and idempotence.
`votes.schema1-proof.json` is the temporary export, not the published catalog.

The September audit baseline was 3,651 of 10,575 TVFY divisions: 6,924 missing
(65.48%). That historical gap has already been filled in the supplied snapshot:
all 10,575 cached API IDs through 20 August are present in its legacy table.
The snapshot has 10,647 legacy federal divisions and 10,574 ext_ divisions;
73 legacy rows have not been projected. The XML also contains divisions absent
from the API cache/legacy table. The full XML archive contains 11,007 divisions. It recovers **434 ext_ rows**:
all 73 unprojected legacy rows plus **361 divisions absent from both database
paths**. One recovered 2009 record explicitly has zero counts and no voter list;
no member votes are invented for it. Three already stored divisions contain
duplicate voters in the source and remain quarantined; one existing ext_
division absent from this XML snapshot is retained. The proof adds **30,539
member-vote records** to ext_, with schema 1 federal vote totals increasing
from 850,033 to 875,413 (the rest were already counted by the legacy path).

| Year | Recovered ext_ divisions |
|---|---:|
| 2006 | 0 |
| 2007 | 0 |
| 2008 | 6 |
| 2009 | 1 |
| 2010 | 0 |
| 2011 | 0 |
| 2012 | 0 |
| 2013 | 0 |
| 2014 | 0 |
| 2015 | 0 |
| 2016 | 9 |
| 2017 | 0 |
| 2018 | 28 |
| 2019 | 1 |
| 2020 | 32 |
| 2021 | 0 |
| 2022 | 17 |
| 2023 | 0 |
| 2024 | 0 |
| 2025 | 201 |
| 2026 | 139 |

## TVFY completeness fix

The old `divisions.py` skipped an entire month if any row existed, accepted a
silently capped 100-row list, and hard-coded March 2026 as its end. Its vote
insertion also preferred membership IDs over stable person IDs. It now delegates
to the complete refresh implementation: current-date windows, recursive splitting
at 100, per-ID deduplication, retryable strict details, and nested person IDs.
A single day at the cap fails rather than claiming completeness. A partial
`--since` month cannot be saved as a completed full month; recent months always
re-list. Fixture tests cover partial months, the cap and stable person IDs.

## 13 October readiness

The offline Wednesday 14 October cadence is `after-sitting`. The real module's
fixtures prove that Tuesday's House and Senate files produce Hansard JSONL and
member votes, that Wednesday's empty files preserve data, and that reruns dedupe.
Once merged/deployed by the orchestrator, newly listed Tuesday files are found
automatically. This lane commits only; it does not deploy.

There is a timing limitation: OPAX boots at 03:15 Sydney, before the upstream
[parser's documented 09:05 previous-working-day job](https://github.com/openaustralia/openaustralia-parser/blob/main/README.md).
That is too early to guarantee Tuesday's XML on Wednesday. The optional
`scripts/vm/federal_morning.sh` runner is ready for the orchestrator to schedule
at **10:00 Sydney after a sitting day**. It acquires only federal XML, validates
before opening a writer, reconciles speeches, loads divisions, projects exact
bill links and exports schema 1 to an explicit local output path. Its window is
seven days ending yesterday, its total budget is 20 minutes, and it shares both
nightly and daily-refresh locks. It skips non-sitting mornings and retains the
last output if acquisition or export validation fails. `morning-receipt.json`
records observed sitting/no-sitting chamber-days and reconciliation results.

Proposed schedule entry, **commented and not installed or enabled**:

```cron
# CRON_TZ=Australia/Sydney
# 0 10 * * * /home/jake/opax/scripts/vm/federal_morning.sh --db /home/jake/.cache/autoresearch/parli.db --stage /home/jake/.cache/autoresearch/oa-morning --output /home/jake/.cache/autoresearch/oa-morning/votes.json >> /home/jake/.cache/autoresearch/pipeline/federal-morning.log 2>&1
```

The orchestrator chooses refresh-box paths, output publication and scheduling;
the box must be awake before 10:00 and shutdown must wait for the runner. This
script does not configure boot/shutdown, push, deploy or write to the knowledge
box. The usual nightly handles search indexing and publication. Wednesday
coverage can only be claimed once both Tuesday files have been observed and
validated. With the current early schedule alone, Tuesday may first arrive
Thursday morning. No scheduler or production setting was changed here.
The feed retries unpublished days and never treats them as permanent empties.

## Licence and attribution

The archive's own indexes carry no separate data licence. OpenAustralia's
[help page source](https://github.com/openaustralia/twfy/blob/main/www/includes/easyparliament/staticpages/help.php)
links this exact XML archive as the data loaded into its database. Its
[about page source](https://github.com/openaustralia/twfy/blob/main/www/includes/easyparliament/staticpages/about.php)
identifies Hansard as Commonwealth copyright and states that OpenAustralia uses
it with permission. Attribute the Commonwealth of Australia and the
OpenAustralia Foundation, link the archive and original ParlInfo source,
and retain bill/XML identifiers.

The [parser licence](https://github.com/openaustralia/openaustralia-parser/blob/main/LICENSE.txt)
is AGPL-3.0-or-later for its software; it is not an XML data licence.
The [TVFY licensing page source](https://github.com/openaustralia/theyvoteforyou/blob/main/app/views/help/licencing.html.haml)
uses ODbL for the data rights TVFY holds, requiring attribution and compatible
share-alike reuse. That statement does not independently license the XML archive.

The live OpenAustralia help page and APH copyright page refused the honest agent
with HTTP 403; those requests stopped. The repository content above was checked
with the same honest agent. The older `docs/VOTES.md` assertion of Hansard
CC BY-NC-ND 3.0 AU could not be reverified against the current APH page in this
lane. No separate permissive XML licence is claimed on that evidence.

## Validation

The touched pytest gate passes **76 tests and 47 subtests**. The complete
`python3 -m pytest` run passes **1,153 tests**, using cached local dependencies.
`scripts/vm/test_nightly.sh` passes **301 checks, zero failures**, including
real speech loading in both chambers, zero-byte days and idempotent reruns.
The revision gates include XML reconciliation, cache refusal/validation,
procedural bill stances, the bounded morning runner, existing schema 1 export
fixtures and the offline nightly harness. The regenerated staging proof
validates all 434 recovered divisions and 30,539 member votes against the
strict schema 1 decoder, checks baseline byte compatibility and idempotence,
and records polarity 0 plus retained totals/bill IDs for both closure divisions.
`portal/public/votes.json` is byte-identical to HEAD (SHA-256
`a77128dc0e1e1b3fdaa4bf84501e2c94af3125dea3cf0b2dffbc688a49d68546`).
