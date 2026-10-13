# Mixed speech cards — render and reviewed participant bundle

A speech with `speaker_type=multi_speaker` displays **Several speakers**, a neutral group avatar and its structured debate heading. Search, topic arcs, person evidence, Ask/chat sources and quotes, report/bill reading modules, Time Machine, Then vs Now, and the money explainer share this treatment. Witnesses retain their witness label; chair, member and unknown types do not fall through to “Speaker not named”. No UI byline is recovered from a title or body.

Search and Ask sources retain `speaker_type` and gain a separate `speaker_display`, `debate` and ordered `participants` for mixed records. The resource reader exposes the same presentation. `speaker`, `person_id` and `party` stay null for mixed records, including stale input fields. Participant identities are display/provenance only. Collaborator filters, roster exports, person counts and `votes.json` are not rewritten. Native clients can consume these additive fields without treating a participant as the document author.

## Source and coverage

The read-only desktop database at `/home/jake/.cache/autoresearch/parli.db` has the original `speeches` rows, topics and `members` identities, but no `oa_speech_provenance` table or speech GID column. The reviewed relabel's `plan/source-documents.jsonl` and `plan/source-turns.jsonl` retain the source GID membership and independently resolved XML/People identities. The exporter cross-checks each participant against every linked turn, orders numeric GIDs, excludes unresolved/private names, labels chair roles, and opens SQLite with `mode=ro` and `query_only=ON`.

The local artifacts under ignored `portal/private/mixed-speakers/` contain:

- `participants.json`: all **16,512 original resource IDs**, with **100% coverage**, **80,953 participant memberships** and **7,350 chair memberships**. Each value contains `participants: [{name, person_id, role?}]` and the database debate heading.
- `participants-dry-run.json`: the original set plus five later reviewed short motions and the source report.
- `participants-report.json`: coverage, source checksums, withheld IDs and the publication candidate inventory. Across both sets, 377 resolved people all exist in the legacy members table; 7,608 unresolved turn memberships are excluded.
- `publication-candidate/`: a manifest and 16 RID-prefix JSON shards, **16,508 reviewed resources**. Nine original identity-conflict resources are held out, and five later reviewed motions are included. The public validation additionally excludes 27 memberships for seven XML-resolved parliamentarians absent from the published roster; their entries remain in the private export. All resources still have participants.

Participants describe the reviewed source span. Expanded or revised XML turns can differ from the unchanged KB body; the source ledger records those revisions. This list must not be used for person counts or to assign all words to every participant.

## Publication recommendation

The **approved static asset bundle** is now in `portal/public/mixed-speakers/` for the orchestrator's ordinary release: **17 files, 5,266,216 bytes**, covering **16,508 resources**, **80,842 participant memberships**, **370 roster identities** and **7,347 chair memberships**. It supplies database debate headings, requires no KB writes, is easy to inspect and roll back, and is keyed by resource ID rather than ambiguous duplicate slugs. The Worker probes the optional manifest, fetches only relevant advertised shards, validates the presentation fields, and joins them only onto `multi_speaker` records. Missing, malformed, or HTML fallback assets leave the response usable. The existing published `speaker_participants` metadata remains the fallback.

`/mixed-speakers/*` detaches the generic JSON cache header and uses the same `public, max-age=31536000, immutable` policy as `/electorates/releases/*`. This reviewed snapshot is frozen. A later participant replacement must use a new namespace and update the Worker join/cache version, rather than overwrite browser-cached URLs.

A metadata alternative is a reviewed, preconditioned metadata patch through `scripts/speaker_relabel_apply.py`, keeping collaborators empty and `person_id` null. It is unnecessary here: the prior approved relabel already wrote `speaker_participants`. Neither path changes attribution or facets.

## Reproduce the bundle

Run these commands from the repository root. The first executes the exporter on the desktop database read-only and redirects the complete identity ledger into the ignored private directory on the Mac; it performs no desktop database or KB writes. The reviewed plan is the source of the GID membership, since that desktop database lacks the newer provenance schema.

```sh
mkdir -p portal/private/mixed-speakers
ssh desktop python3 - \
  --database /home/jake/.cache/autoresearch/parli.db \
  --plan /home/jake/opax-work/evidence/speaker-attribution-relabel-20261013/plan \
  < scripts/build_mixed_speaker_participants.py \
  > portal/private/mixed-speakers/participants-dry-run.json
python3 scripts/build_mixed_speaker_participants.py \
  --input portal/private/mixed-speakers/participants-dry-run.json \
  --roster portal/public/parliamentarians.json \
  --output portal/private/mixed-speakers/publication-candidate
```

The second command prints counts only. It excludes the reviewed held resources, includes the supplementary reviewed motions, filters to published roster IDs, and writes sorted deterministic RID-prefix shards. Validate a replacement privately before approval; for this approved initial bundle, copy the 17 files and run the public validation:

```sh
mkdir -p portal/public/mixed-speakers
cp portal/private/mixed-speakers/publication-candidate/*.json portal/public/mixed-speakers/
node --test portal/test/mixed-speaker-bundle.test.mjs
node scripts/stamp_assets.mjs
```

The test scans every shard, reports counts only, requires roster membership or an explicit chair/Speaker label, rejects witness/unresolved fields and names, verifies all sixteen Worker joins preserve null personal credit, and checks the immutable header. The exporter also rejects unreviewed participant fields and chair roles before writing any bundle files. Roster exports and their speech counts are inputs, never modified by this process.

## Nightly finding

The running refresh VM's checkout is `608b824b3bee3f8bb01d7e1872d51db4f12571c9`. That commit itself is an asset restamp; its tree includes the newer XML feed and per-turn parser. `scripts/daily_refresh.sh` invokes `parli.ingest.federal_feed`, then the reconciliation-aware `parli.ingest.speeches` loader. XML parsing emits each turn separately and excludes nested turns from its parent's text. The honest HTML fallback also separates bylines. New empty chamber-days are therefore per-turn; occupied days are held instead of having fresh turns appended to legacy sections.

The last completed VM receipt inspected was from **11 October**, before this updated path ran. Forty recent cached JSONL files contained 1,348 legacy records with no GID/type, including a 187,648-character section. These are old cache evidence, not proof that the currently checked-out code created new mixed documents. The VM DB has `oa_speech_provenance(gid, speech_id)` with 108,501 mappings; the desktop DB has not received that schema. The next authorised nightly run still needs a fresh reconciliation receipt to prove runtime use of the updated path.

No ingest change is needed for new days in the current tree. An older checkout needs the existing feed/parser/reconciler changes, not a second backfill: roughly five core ingest files plus the refresh-script wiring (the parser and column support are already merged). Historical mixed rows and their counts remain untouched in this round.

## Review evidence

Before/after agriculture arc images at 1440 and 390 are local browser replays of a read-only production search snapshot, with the after replay joined to the reviewed participant dry run. All API generation/auth/voice requests are blocked or stubbed. The first after card shows Alicia Payne and Julie Collins under Several speakers, with Questions without Notice as its heading. Browser receipts and gate logs remain in the ignored artifact directory. No upstream push, deployment, KB write, or production/desktop database write is part of this lane; desktop `gate/` transfers are isolated test snapshots only.
