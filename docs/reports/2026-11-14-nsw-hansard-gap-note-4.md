# NSW final shared guard handoff, 14 November 2026

Rebased onto `origin/main` at `19ba78cf8092271a7f626e123e694dec5b233107`.
The shared implementation matches Senate commit
`ad235b265a9151ddb090e97249b86c9b1ee0db3f` and the final handoff's `SHA256SUMS`.
The supplied patch passed `git apply --check` and was applied. The guard,
shared tests and RAG client were then copied directly from the final handoff.
No production, KB or remote D1 writes, SSH, APH or ParlInfo access occurred.
No NSW source fetch was needed; the gates use isolated fixtures.

## Shared identities

These four complete repository files are byte-identical to the Senate commit.
The [checksum manifest](2026-11-14-nsw-shared-files.sha256) can be checked from
repository root with `sha256sum --check docs/reports/2026-11-14-nsw-shared-files.sha256`.

```text
aa4c1485fe69d3ee3e5c2ecc75c9959d3c92d04b258d72e9efc2e5eff1dba38e  parli/ingest/backfill_guard.py
6ac4c13c1445507c82d7e3cbfb35f5f7daacf310233e90bf162431e78be30818  tests/test_backfill_guard.py
741eb44cf4b6f104c36f9b5a39111186d7f8860770223fef1827ed373eb27a68  parli/arag.py
66d871da724ba1db36039e90bf020e505e6aecbecf97ac0e58477ae7884a7b35  scripts/refresh_watchdog.py
```

The handoff's `write_status.sh` is the complete embedded `write_status()`
function in `scripts/vm/nightly.sh`. Extraction including its final newline
matches both the handoff and Senate exactly:

```text
aceb5bcac3a58bfc133504977b5206d9b4149b7ae158722f03ad90d07a386579  write_status.sh
```

The shared publisher definitions `map_speech`, `_push_one`,
`BackfillPublication`, `_push_pool` and `_push_batch` also match Senate
byte-for-byte. NSW's ownership queue and eligibility logic remain source-specific.
The mapper preserves optional source-party evidence when supplied; NSW's
unsupported party assignments remain NULL.

The common guard supplies the same default state directory
`~/.cache/autoresearch/pipeline`, `OPAX_BACKFILL_STATE_DIR` override,
`backfill-ledger.json` schema version 1, ledger lock and `backfill.STOP`.
Both use origin classification `origin/backfill-2026-11` and the shared
US$30 enrichment run metadata. The 5.5 GB, 59,280 bytes/resource and
500-resource thresholds are unchanged.

`nightly_fields()` now supplies identical `backfill`, `backfill_failures` and
warning fields in both receipt writers. Repair failures remain separate from
fatal `failures` and periodic completion. The identical watchdog raises the
same growth-stop alert and reports the shared repair warnings. The canonical
response observer passes successful response bodies too, so a quota error in
an HTTP 200 error envelope reaches the guard. The canonical in-memory stop
latch holds queued requests even if the stop file cannot be persisted.

## NSW integration

The stage supplies `acquisition_days_remaining` separately from incomplete
coverage days and queued publication. Once acquisition is exhausted, unresolved
speaker turns set `stop=identity-holds`, suppressing the shared finish-date
projection. Publication-only debt stays visible with the shared publication
allowance. Growth stops use `stop=growth-guard` and retain the receipt without
misclassifying a completed source day as a parser failure.

Four NSW-specific regressions cover remaining acquisition versus held days,
unresolved-only projections, publication-only projections, and growth-stop
receipts. The canonical shared test file is unchanged. NSW acquisition and
publication remain capped at four chamber-days, with the same 1,200-second
budget, outer timeout, single off switch and coverage wording.

## Gates

All gates re-run on the final tree under `nice -n 10`.

- All **45 canonical shared tests** passed against the NSW publisher.
- Ingest, identity, publisher and watchdog gate: **334 passed, 68 subtests passed**.
- NSW shell integration passed. Its assertions now use `grep` rather than `rg`, so the test runs where ripgrep is not installed.
- `bash -n` passed on every `scripts/vm/*.sh`; the actual nightly Python-environment sandbox passed **four checks**, including periodic completion and the shared receipt fields.
- `cd portal && npx tsc --noEmit` passed with project Python on PATH.
- Full portal suite, concurrency four, project Python on PATH and `OPAX_TEST_HOST=::1`: **5,083 passed, 0 failed, 11 skipped** (5,094 tests).
- Asset stamps are current. `sha256sum --check docs/reports/2026-11-14-nsw-shared-files.sha256` passes for all four shared files.
