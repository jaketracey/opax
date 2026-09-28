# Committee hearings and witnesses: who is speaking in a committee transcript

Built 2026-09-06. The corpus holds 222,965 Senate estimates exchanges (102 hearings,
February 2025 to June 2026, `speeches.source = committee_senate`). A transcript names
each speaker the way the Hansard reporter does at the microphone: "Senator HENDERSON",
"Ms Lopez", "Rear Adm. Sonter", "CHAIR". Three things went wrong with that:

- **Officials filed as MPs.** The speaker linker (`parli.ingest.link_speakers`) matches
  surnames, so "Ms Hall" (a departmental official) was linked to Jill Hall, "Mr Cook" to
  Trish Cook, "Ms Anderson" to John Anderson: 12,119 rows under sitting or former members,
  another 16,076 under historical `wragge_*` stubs. Their pages showed evidence they never
  gave.
- **Witnesses dressed as parliamentarians.** An unlinked "Lopez" got a person entry with
  "Federal parliament", a party guess and profile and Wikipedia searches on a surname.
- **Senators split in two.** "Senator HENDERSON" carried `speaker_name_clean = Henderson`,
  so committee evidence sat under a second "Henderson" beside "Sarah Henderson".

## The fix

Every transcript opens each portfolio's session with an **In Attendance** block: the
minister representing, then each department and agency with its officials by full name
and position ("Ms Margaret Lopez, Acting First Assistant Secretary" under "Broadcasting,
Media and News Policy" under the Department of Infrastructure ...). That block is the
record's own account of who the witnesses are.

`parli.ingest.committee_witnesses` (runs on the DB host; stdlib + requests):

| phase | what it does |
|---|---|
| `fetch` | Reads the hearing's table of contents (fragment 0000) for its fragment ids, fetches every fragment from ParlInfo (cached under `~/.cache/autoresearch/committee_attendance/`, one polite request a second), parses each In Attendance block, and writes `ext_committee_attendance` (hearing, honorific, name, surname, post-nominals, position, organisation, group heading, minister or official). Organisation vs group heading is decided by a word list (department, authority, agency, commission, limited ...); "Executive", "Enabling Services", "Enterprise Resource Planning Program" are groups. |
| `resolve` | For every committee row: a **Senator** linked to a member gets the member's full name as `speaker_name_clean`; any other honorific (Mr, Ms, Mrs, Dr, Prof, a rank) is a **witness**, matched to the hearing's attendance list by surname (an initial and the honorific break ties; "La Rance" and "O'Loughlin" work), given the full name, `witness_position` and `witness_organisation`, and stripped of any `person_id`; CHAIR rows are `chair`. `speaker_type` (member, witness, chair, unknown) is set on every row. Changed rows go to `ext_kb_patch_queue`; the before and after of every relink is in `ext_committee_relinks`. |

`scripts/arag_patch_speakers.py` drains the queue against the knowledge box: for each
slug it rebuilds title, origin (collaborators), classifications and extra metadata with
`arag_sync.map_speech` and PATCHes the resource by slug, never sending text. 404s are
`missing` (the bulk sync will create them with the corrected fields). Six threads, about
ten a second, resumable; pid and log at `/tmp/kb_patch.pid`, `/tmp/kb_patch.log`.

`arag_sync.map_speech` now emits the `speaker_type` classification and
`witness_position` / `witness_organisation` metadata, so future pushes match.

Measured 2026-09-06, final: 11,592 people from 101 hearings' attendance blocks (2 hearings
carry none); 87,935 witness rows, 85,825 matched (98%), 2,110 left with the transcript's
surname (Mr Kean, Mr Cook, Ms Wooldridge lead); 124,546 senator rows, 115,517 renamed to
full names; 12,119 unlinked from members and 16,076 from stubs. The knowledge-box patch
job (with the speaker and text hygiene loops queued behind it) sent 103,313 resources
overnight with 0 failures; 165,729 queued slugs were never in the box (short exchanges
under the sync's 200-character floor, deduped copies). CACHE_EPOCH bumped 2026-09-07.

## All federal committee hearings (2026-09-29)

The ingest (`parli.ingest.committee_hearings`) now covers every public federal committee hearing on ParlInfo, not
only Senate Estimates: `estimate` (Senate Estimates), `commsen` (Senate references, legislation and select committees),
`commrep` (House committees) and `commjnt` (Joint committees). Licence: the same APH statement (CC BY-NC-ND 4.0) as the
federal Hansard and the estimates already in the knowledge box.

| ParlInfo dataset | `speeches.source` | `speeches.chamber` |
| --- | --- | --- |
| `estimate`, `commsen` | `committee_senate` | `senate_committee` |
| `commrep` | `committee_house` | `house_committee` |
| `commjnt` | `committee_joint` | `joint_committee` |

**Discovery.** The ParlInfo summary listing, one query for all four datasets:
`Dataset:commsen,commrep,commjnt,estimate Date:dd/mm/yyyy >> dd/mm/yyyy` (resCount 100). One result per transcript
fragment, with dataset, hearing id, fragment, date, committee and inquiry title. A window with more than a page of results
is cut into equal parts until each fits (paging one long query repeats or skips entries). The nightly default window is the
last 45 days (`OPAX_COMMITTEES_DAYS`); `--since` / `OPAX_COMMITTEES_SINCE` sets another. The RSS feed (15 items) and the
estimates schedule page (`--schedule`) are no longer needed.

**Parsing (`parli.ingest.committee_transcript`, no network).** A turn's speaker comes from the markup class, never from an
honorific: `HPS-WitnessName` is a witness, `HPS-OfficeCommittee` ("CHAIR:") and a linked "CHAIR (Mr Husic):" are the chair,
`HPS-Member*` are parliamentarians. **A parliamentarian's label sits inside a link to `handbook/allmps/<PHID>`** (Ed Husic is
91219): that Parliamentary Handbook id identifies the member exactly, so a House MP printed as "Mr KENNEDY" is never confused
with a witness "Mr Kennedy". Other fixes over the old parser: topic is `<committee> - <inquiry>` (Senate Estimates keeps its
portfolio and agency), not "Committee - Committee 17/09/2026 Inquiry ..."; the "Committee met at" pseudo-row is gone (it was
saved as speaker UNKNOWN), as are "Proceedings suspended" / "Committee adjourned" lines that used to be glued to the previous
speech; `&#10;` and every other entity is unescaped; the speaker label is no longer left at the front of the text ("(Mr
Husic): Welcome ..."); a short labelled turn no longer hands the following paragraphs to the previous speaker; indented
quotations (`HPS-Small`) stay in the speaker's turn; a speech that runs across a fragment boundary keeps its speaker.

**Storing.** Each turn is a `speeches` row (speaker label, `speaker_type`, `handbook_id`, fragment-level `hearing_id`).
`ext_committee_hearings` records each hearing's status (**Proof** or **Final**, printed on the TOC page, fragment 0000), a
content hash, first seen / last checked / last changed; `ext_committee_fragments` holds a hash of each fragment's turns.
Raw pages are cached gzip under `$OPAX_ATTENDANCE_CACHE` (`~/.cache/autoresearch/committee_attendance/`), the same place
`committee_witnesses fetch` reads, so no fragment is fetched twice. The structured witness list that opens every non-estimates
fragment ("BAUMGART, Mr Richard, Chief Adviser, Service Delivery, Department of Social Services") is parsed into
`ext_committee_attendance` by the ingest itself.

**Who is speaking (`committee_witnesses resolve`).** Rows of hearings the new ingest wrote (a row in `ext_committee_hearings`
with `parser_version >= 2`) are *trusted*: a `member` is linked to a person by its Handbook id (`ext_handbook_people`, refreshed
weekly by `committee_witnesses fetch` from handbookapi.aph.gov.au, 335 people of the 46th Parliament onward matched to
`members.person_id`, 226 of 226 current) and never by a surname; an unmapped id stays unlinked; a `witness` is matched to the
hearing's witness list by surname (honorific breaks ties), gets the full name, position and organisation, and never keeps a
`person_id`; a `chair` stays a chair and stays unlinked (only the first turn of a fragment names the chair; the id stays in `speeches.handbook_id`). A linked member's `party_canonical` is filled
from `members`, because the committee source records no party. Older rows (the estimates ingest before 2026-09-29) keep the
honorific rule described above.

**`link_speakers` guard.** It surname-links every unlinked speaker string it sees, in every source, so it filed witnesses under
MPs. It now skips committee rows that already carry a `speaker_type` or whose label is not "Senator ...", so it can no longer
undo `resolve`. That was a latent bug: `link_speakers` runs every night and `resolve` only on nights the committee step adds rows, so a witness whose `person_id` `resolve` had cleared could be surname-linked to an MP again in between.

**Proof -> Final.** A hearing whose status is not Final is fetched again weekly for 60 days after first seen (and a hearing with
fragments that failed is retried daily), all pages from ParlInfo, not the cache. A fragment whose content hash changed has its
turns matched to the stored rows (same speaker and text; then the same speaker and the closest text, at least 60% alike; then
near-identical text under a corrected label) and the row is **updated in place**, so speech ids and the knowledge box's
`speech-<id>` slugs do not move; turns the Final adds are inserted; stored rows the Final no longer has are left alone
(counted as `orphaned` in the log). Each changed row is queued in `ext_kb_patch_queue` with reason `text:proof_to_final`; a
text patch sends `{"texts": ...}` only, so labels and summaries the enrichment Worker has written survive. The committee step
sends them at the end of its run when `OPAX_SYNC_KB=1` (the nightly), otherwise they wait in the queue for
`scripts/arag_patch_speakers.py`. `python -m parli.ingest.committee_hearings --adopt-legacy` also checks hearings stored by the
older ingest (they have no hearing row) against the current transcript, comparing text after unescaping and stripping the old
speaker prefix, so unchanged rows are not touched.

**Gap to know.** The speaker-field patch in `arag_patch_speakers.py` (any queue reason other than `text:`) replaces the
resource's whole `usermetadata.classifications` list, which drops the `topic` labels the enrichment Worker writes. It was
written before the Worker. Do not run it over enriched resources until it reads and merges the classifications. The nightly
does not run it.

### Measured on real ParlInfo pages (2026-09-29)

The 48th Parliament to 28 September 2026 (1 July 2025 on) lists 190 Senate (`commsen`), 108 House and 186 Joint hearings:
484 hearings and 2,268 transcript fragments, plus 83 estimates hearings (697 fragments) the older ingest already holds.
Fifteen of them (five per dataset, spread from August 2025 to September 2026: 93 fragments, 5,152 turns) were ingested into a
scratch database and resolved: 1,593 member turns, every one linked by its Handbook id to a person whose surname is the label's
(and, in House committee transcripts, a House member; in Senate ones, a senator); 2,591 witness turns, all matched to the hearing's
witness list with a position or organisation; 968 chair turns. Against the Handbook's own committee memberships, 88.6% of
member turns were by a listed member of that committee; the rest are two senators who took part without being members
(David Pocock, Maria Kovacic). About 45% of turns reach the knowledge box (200 characters or more, chair excluded), which is
21 (House), 36 (Senate) and 38 (Joint) pushable resources per fragment, so about 76,000 for the window. The chair's turns of
200 characters or more, kept out by the existing presiding-officer rule, are 11% (Senate), 23% (House) and 11% (Joint) of
the rows that length or longer.

### Runbook: backfill the 48th Parliament (once, on the refresh box, between nightlies)

```
touch ~/.config/opax/skip-nightly            # or scripts/vm/ec2.sh start --maintenance
cd ~/opax && git pull --ff-only origin main
set -a; . ./.env; set +a
export OPAX_SYNC_KB=1                        # lets the run send Proof -> Final text patches; the push below is separate
flock -n ~/.cache/autoresearch/pipeline/daily_refresh.lock bash -c '
  .venv/bin/python -m parli.ingest.committee_hearings --since 2025-07-01 --adopt-legacy &&
  .venv/bin/python -m parli.ingest.committee_witnesses fetch &&
  .venv/bin/python -m parli.ingest.committee_witnesses resolve &&
  .venv/bin/python -m parli.ingest.arag_sync --tables speeches --full
' 2>&1 | tee -a ~/.cache/autoresearch/pipeline/committee-backfill.log
rm ~/.config/opax/skip-nightly
```

Each stage resumes if interrupted (the ingest skips hearings it has synced, the push resumes from its checkpoint).
About 2,850 requests for the three new datasets (104 listing pages, 484 TOCs, 2,268 fragments) plus about 780 for
`--adopt-legacy`, at one a second: one hour and a quarter. After a change to the witness-list parser,
`committee_witnesses fetch --refetch` re-reads every hearing's attendance from the cached pages (no requests).

## On the portal

- Search results carry `chamber`, `person_id`, `speaker_type`, `role` and `organisation`.
- A speaker on no roster whose documents are all witness evidence gets a **committee
  witness** entry: position and organisation from the newest attendance list, the
  committees appeared before, the hearings, their evidence, and a note that the record
  does not carry more. No party, seat, votes, interests, expenses or profile searches.
- Search rows say "Senate committee evidence"; the document page's byline carries the
  position and organisation; share text says "Evidence given by".

## Runbook

```
rsync -a --exclude __pycache__ parli/ desktop:~/opax-sync/parli/ && scp scripts/arag_patch_speakers.py desktop:~/opax-sync/scripts/
ssh desktop 'cd ~/opax-sync && PYTHONPATH=. python3 -m parli.ingest.committee_witnesses fetch --db ~/.cache/autoresearch/parli.db'
ssh desktop 'cd ~/opax-sync && PYTHONPATH=. python3 -m parli.ingest.committee_witnesses resolve --db ~/.cache/autoresearch/parli.db'
ssh desktop 'cd ~/opax-sync && nohup env PYTHONPATH=. python3 scripts/arag_patch_speakers.py --env ~/opax/.env > /tmp/kb_patch.log 2>&1 & echo $! > /tmp/kb_patch.pid'
# when the queue is drained: bump CACHE_EPOCH in portal/wrangler.jsonc, npm run deploy, warm the cache from Australia
```

After any new committee ingest, run `fetch` (new hearings only) and `resolve` again;
`link_speakers` must not be re-run over committee rows without `resolve` following it,
or the surname links come back.

## Open items

- Witnesses the attendance lists do not name (about one in seven rows before the all-fragment fetch) keep the
  transcript's surname; the entry says so.
- Chair turns stay out of the knowledge box (the corpus-wide "presiding officer" exclusion in `arag_sync`), including the
  chair's questions in House and Joint hearings, which are a large share of those transcripts.
- The speaker-field patch in `arag_patch_speakers.py` clobbers topic labels (see above).
- A Final that renames a speaker on an already-pushed row updates the database row and the text in the box, but not the
  box's speaker fields (that would need the field patch).
- House and joint hearings before the 48th Parliament (1 July 2025) are not ingested: about 135-225k further resources for
  the 47th, and 74,631 fragments from 1993 to 2019.
