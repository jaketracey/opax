# Federal backfill review fixes — 13 October 2026

Both P1s are fixed. This lane performed only read-only source analysis, a fresh staging copy, and fixture/stub tests. No production DB/KB/D1 writes, enrichment queueing, generation, deploys or pushes occurred. The final local SHA is reported in the handoff.

The subsequent waiting-resource cap bypass is repaired in [round 3](2026-10-13-federal-hansard-backfill-round3.md), which retains the same dry-run counts and go command.

## Owner locks and exact rows

`run()` takes nonblocking exclusive `flock` locks on the existing owner files, in order: `~/.cache/autoresearch/pipeline/nightly.lock`, then `daily_refresh.lock`. Both descriptors stay open across discovery, source acquisition, backup, loading, receipt generation and KB sync. Either held lock refuses the entire operation; exceptions release both. There is no override or inherited-lock bypass. The `MIGRATED_TO_VM` guard remains.

The loader now returns its exact inserted IDs. `oa_backfill_owned` records each accepted insertion in the same SQLite transaction as the speech and its provenance; rejected GIDs and matched pre-existing citations never acquire ownership. The payload reads only those IDs, not an ID range above a starting maximum. A regression simulates a writer that ignores the locks and confirms its row is absent from the payload and counts.

## Recovery and counts

A version-2 checkpoint identifies the immutable run UUID, database, date bounds and dollar ceiling. Recovery joins only the run's insertion ledger to its speeches, checking GID, chamber, date and run identity. It never resolves a source GID through global provenance to authorize publication. The run registry must match the checkpoint; supplied/saved IDs outside the ledger and failed retries outside the eligible ledger scope are refused before any KB call. Legacy GID-only checkpoints are refused.

Source parsing/exclusion receipts survive beside the insertion ledger, so a resumed run can report its entire accepted cohort. `new_documents` measures that eligible cohort; `kb_planned_creates_this_run` explicitly measures the remaining creates for this invocation. Failed IDs are excluded from the subsequent normal batch after their scoped retry, avoiding a duplicate create in the same invocation. A rejected `gid-chamber-day-conflict` fixture reports one new document and sends exactly one create to the stub KB; its occupied-day citation is never published. Poisoned saved-ID and failure lists also fail closed.

## US$40 enrichment hard ceiling

The command flag is **`--enrichment-max-usd 40`**, also the default; positive values up to 40 are allowed and a resumed run cannot raise/change its ceiling. Every new row/document carries its durable enrichment run ID and ceiling in `extra.metadata.enrichment_budget`. This changes no KB slot or configuration.

The existing `opax-enrich` path now uses migration `0005_run_budget.sql` and `src/run-budget.ts`:

1. Automatic discovery reads `basic+extra`; OA metadata omissions defer discovery. It checks the run ceiling before admitting the resource's two tasks into the actual queue. Unfunded resources are retained as waiting admission records, not model queue rows.
2. Admission reserves a maximum first call. Before **every** model attempt, including primary retry and GPT-OSS escalation, a D1 transaction reserves its maximum charge under both the existing daily neuron budget and this run's remaining balance. D1 documents [batch transaction guarantees](https://developers.cloudflare.com/d1/worker-api/d1-database/).
3. Input is bounded conservatively by the full UTF-8 request/schema byte count plus 1,024 framing tokens; output is bounded by the actual `max_tokens`. Reservations use the existing model neuron prices. The run's USD ceiling converts down to whole neurons; at US$40, 3,636,363 neurons cost at most US$39.999993 at the existing rate. Verified actual billing is rounded up for the run ledger.
4. Verified usage settles the reservation and books the daily ledger in the same transaction. Missing/partial/invalid billing usage is charged at the maximum instead of refunded from a character estimate. A failed/timed-out call keeps its maximum reservation because its billing is uncertain. Neither UTC rollover nor a process restart resets the run total.
5. Waiting admission resumes only when verified settlement frees enough headroom. Once spent plus reserved capacity cannot fund another call, no further tasks for the run are queued or paid attempts started. Durable D1 ownership continues to enforce the cap even if a later KB read omits budget metadata. A resource cannot change its declared run/cap after admission.

This is a gross Workers AI model-spend ceiling, before free allowances; D1/KB/platform charges are outside it. Conservative reservations or uncertain billing can stop admission before the planning scenario completes.

Before any apply (even DB-only apply), the loader checks the authenticated, read-only enrichment `/status` endpoint for `enrichment-run-cap-v1`. The endpoint requires the new table to be readable. An old Worker or missing migration refuses loading before any DB modification. The deployment and migration are prepared here but **not applied**; the orchestrator must enable this enforcement before a go. The existing `OPAX_ENRICH_URL` and `ENRICH_ADMIN_TOKEN` are read from `~/opax/.env`; nothing is printed or configured.

## Fresh dry run

Staging: `/home/jake/opax-staging/federal-backfill-fix-20261013/staging.sqlite`, backed up from the read-only source DB. `previous-counts-comparison.json` verifies every year/chamber count and exclusion against the previous rehearsal:

| Metric | Previous | Fresh |
|---|---:|---:|
| Missing chamber-days | 403 | 403 |
| Inserted speech rows | 108,173 | 108,173 |
| Eligible KB documents | 74,880 | 74,880 |
| Length exclusions | 48,830 | 48,830 |
| Procedural exclusions | 4,844 | 4,844 |
| Duplicates | 328 | 328 |
| Identity conflicts | 3,008 | 3,008 |
| Occupied days held | 304 | 304 |

Speech bytes, 20 sample texts/identities and enrichment input size are unchanged. The fresh payload is **303,356,332 bytes**, up from 296,916,652 solely through the run/cap metadata (86 bytes per document). The first-pass estimate remains **US$23.26**, the planning retry/escalation scenario **US$25.30**, and the unconstrained maximum-primary-output scenario **US$108.10**. The enforced ceiling is **US$40**, regardless of those forecasts. The KB ingest planning assumption remains 4.16 hours at 5 docs/second.

Full-row hashing confirms all **1,316,517 original speeches** retain their citation IDs and evidence: `6e6140feb0455611abbe132644bec10eb7183c20ca7c3f23afb1fb8b54ad948d`. The fresh directory retains samples, per-day receipts, ownership tables, source evidence hashes, cost output, comparison, original-row verification and an artifact checksum manifest. Production source `parli.db` was opened only `mode=ro`.

## Gates

- Full Python suite: **1,347 test cases passed**. The full run recorded 1,346 passes and 15,352 passing subtests; its sole clean-checkout skip was rerun after committing the formatting-only change and passed with 12 further subtests. All 1,347 collected cases are verified; logs are `python-full-final.log` and `clean-checkout.log`.
- Final backfill regressions: **27 passed**, covering both held locks, locks at all phases, a noncooperating writer, accepted-ownership rollback/recovery, a rejected global GID, poisoned saved IDs/retries, a cap-unaware Worker and invalid ceilings.
- Full enrichment suite: **265 passed**, including concurrent reservations, daily and total caps, restart/day rollover, timeout and unknown usage accounting, automatic admission, manual-seed bypass prevention, missing metadata, primary retries and higher-price escalation.
- `npm run check`: TypeScript passes. `git diff --check`: passes.

The broader Python run exposed stale test harness dependencies: the dedupe fixture omitted `party`, the import fixture omitted `speaker_roles`, and the roster wrapper fixture lacked its independent publication boundary. These fixtures now match their dependencies; the roster-only wrapper uses a guarded stub for the unrelated donor layer. `portal/public/corpus.json` was canonicalized to its exporter formatting; parsed data is identical. No published corpus figures were changed.

## Updated go command

After the reviewed Worker/migration is enabled and the relabel lane is idle, run **standalone on the nightly DB/KB owner**. The command takes both locks itself; do not invoke it inside an already-locked nightly or wrap it in another owner-lock acquisition.

```sh
cd "$HOME/opax" || exit 1
"$HOME/opax/.venv/bin/python" -m parli.ingest.openaustralia_xml \
  --backfill-missing-days --apply --sync-kb \
  --enrichment-max-usd 40 \
  --db "$HOME/.cache/autoresearch/parli.db" \
  --start 2019-01-01 --end 2025-12-31 --max-days 1000 \
  --stage "$HOME/.cache/autoresearch/federal-backfill-2019-2025" \
  --cache-dir "$HOME/.cache/autoresearch/oa-feed" \
  --sync-state "$HOME/.cache/autoresearch/federal-backfill-2019-2025-sync-v2.json"
```

Rerun exactly that command to resume the same owned run and budget. Keep the normal 30-day refresh and schedule a standalone weekly missing-day sweep outside its active locks. A DB-only weekly sweep may omit `--sync-kb`, with the next normal owner sync using the persisted cap metadata. Partial-day reconciliation remains outside scope.
