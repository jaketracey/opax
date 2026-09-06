# Committee witnesses: who is speaking in an estimates transcript

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

Measured 2026-09-06 (dry run before the all-fragment fetch): 87,935 witness rows, 75,966
matched from the first fragment alone; 124,546 senator rows, 115,517 renamed to full
names; 12,119 unlinked from members and 16,076 from stubs.

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

- Witnesses the attendance lists do not name (about one in seven rows before the
  all-fragment fetch) keep the transcript's surname; the entry says so.
- `link_speakers` still surname-matches committee rows when run; a guard that skips
  `source LIKE 'committee%'` rows with a non-Senator honorific belongs there.
- House and joint committee transcripts (`commrep`, `commjnt`) are not in the corpus; the
  honorific rule (anyone not "Senator" is a witness) holds only for Senate estimates and
  must be revisited before those are ingested.
