# Corpus hygiene: the loops, what they found, how to run them again

The speech corpus is 1.3M rows in `speeches` (parli.db on the desktop box), of
which about 596K are in the knowledge box. `parli/ingest/speech_hygiene.py` is the
one text cleaner (applied at push time and by repairs), `speaker_names.py` the one
speaker normaliser. The loops below sit on top of them: each is idempotent, each
logs to `ext_ingest_log`, each records every attribution change in
`ext_committee_relinks` (speech_id, old and new person and name, reason), and each
queues the changed slugs in `ext_kb_patch_queue`, which
`scripts/arag_patch_speakers.py` drains against the knowledge box (metadata only,
or text as well for `text:` reasons). A corpus change is not finished until
`CACHE_EPOCH` is bumped (MIGRATION-ARAG.md).

## 2026-09-06 pass

Probe (read-only, 30 s): `speaker_name_clean` anomalies by class, cross-jurisdiction
links, synthetic links, duplicates, party disagreements, entities in clean text,
short texts, bad dates. Findings and what was done:

| Defect | Size | Loop | Fix |
|---|---|---|---|
| Committee witnesses filed under MPs by surname, or dressed as parliamentarians; senators under a bare surname | 223K committee rows; 12,119 under sitting/former MPs, 16,076 under stubs | `parli.ingest.committee_witnesses` (docs/COMMITTEE-WITNESSES.md) | Attendance lists give full name, position, organisation; witnesses lose any person link; senators get full names; `speaker_type` on every row |
| A speech linked to a member of another parliament (federal Mark Latham speeches on the NSW stub; Senator Shoebridge's 2025 speeches on his NSW stub; Victorian Assembly "Thomas" on `wragge_thomas`) | 2,864 rows | `speaker_hygiene` jurisdiction | Relinked to the same-parliament member by full name or unique surname (1,100), else cleared (1,764) |
| Bare surname as the name where the member has a full name ("Teague" / Josh Teague) | 130,388 rows | `speaker_hygiene` fullname | Name follows the member; 753 rows whose surname disagrees with the member's are left and counted |
| Surname-only member stubs beside a full-name stub for the same person (`vic_thomas` / `vic_maryanne_thomas`) | 308 stubs, 12,773 rows | `speaker_hygiene` fullname | Rows folded into the state's one full-name holder |
| Speaker strings that are not names: bare honorific ("Mr", "Senator"), timestamp (":42"), entity ("&#10;"), a sentence | 530 rows | `speaker_hygiene` junk | Cleared (type `unknown`); "Joldi&#263;" unescaped (22); "The Deputy PRESIDENTMs Abigail Boyd" keeps the name (7) |
| openaustralia's dropped space before a capitalised word ("theAustralian", "byMr Gray") | 30,144 of 66,136 rows | `text_hygiene --rule glued_capitalised_word` | Split only before honorifics and parliamentary nouns (`_GLUED_WORD_RE`), gated to that source; camel-cased names untouched |
| `&#` sequences in committee clean text | 472 rows | `text_hygiene --rule numeric_html_entity` (dry run) | Nothing to write: every stored body already equals the cleaner's output; the sequences are not entities the cleaner should decode |

Left alone, on purpose:

- `wragge_xml` (335K rows, 1901 to 2005): not in the knowledge box; its 12K leading-junk
  bodies and role-label speakers are not a site defect.
- Party disagreement between a speech and its member's current party (openaustralia
  608, zenodo 129, qld 39 rows since 2022): the speech carries the party on the day;
  a defector reads "formerly X" on the site by design.
- Exact duplicates within NSW, SA and VIC hansard (218 rows): slugs are citation URLs
  and are never deleted; the sync's window dedupe already keeps them out of the box.
- 105 rows under 40 characters: below the sync's 200-character floor.
- "Greensamendment"-style joins (capital followed by a glued lowercase word): no safe
  rule; the reverse of the fixed case.

## Runbook

All on the desktop box after `rsync -a --exclude __pycache__ parli/ desktop:~/opax-sync/parli/`
and `scp scripts/arag_patch_speakers.py scripts/export_speakers.py desktop:~/opax-sync/scripts/`.

```
cd ~/opax-sync
PYTHONPATH=. python3 -m parli.ingest.committee_witnesses fetch   --db ~/.cache/autoresearch/parli.db
PYTHONPATH=. python3 -m parli.ingest.committee_witnesses resolve --db ~/.cache/autoresearch/parli.db
PYTHONPATH=. python3 -m parli.ingest.speaker_hygiene --db ~/.cache/autoresearch/parli.db [--dry-run] [--loops jurisdiction,fullname,junk]
PYTHONPATH=. python3 -m parli.ingest.text_hygiene --db ~/.cache/autoresearch/parli.db --source openaustralia --rule glued_capitalised_word [--dry-run]
nohup env PYTHONPATH=. python3 scripts/arag_patch_speakers.py --env ~/opax/.env > /tmp/kb_patch.log 2>&1 & echo $! > /tmp/kb_patch.pid
python3 - < scripts/export_speakers.py > /tmp/speakers.json     # then copy to portal/public/speakers.json
```

Order matters once: `committee_witnesses resolve` before `speaker_hygiene`, so the
junk loop can override the resolver's handling of a bare "Senator". The patch job
reads its queue when it starts; loops that queue more after it started need it run
again (it is resumable and skips what is done). When the queue is drained: bump
`CACHE_EPOCH` in `portal/wrangler.jsonc`, `npm run deploy`, warm the cache from
Australia. `link_speakers` must never be re-run over committee rows without
`committee_witnesses resolve` after it.

## Probe

The probe that sized this pass is in the session log for 2026-09-06 and is cheap to
re-run: one read-only pass grouping `speaker_name_clean` by class (too short, junk
characters, all caps, too long, role label, honorific left, single token), the
`speeches` to `members` state join, synthetic links by source, exact duplicates
outside committees, entities and leading punctuation in `text_clean`. Anything new
that appears there gets a loop here.
