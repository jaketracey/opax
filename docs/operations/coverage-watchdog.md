# Coverage watchdog repair and acknowledgement contract

The nightly reads only the corpus and already-written state files. It does not
acquire calendars, run backfills or write to the knowledge box or D1.

## Before merging

**Recommend building `idx_speeches_coverage` by hand on the box before merging.**
The independent review confirmed this is idempotent and takes about four minutes
once. Have the hub arrange that work in the normal maintenance window. The
watchdog will alert rather than scan the body table if the index is absent.
No index build or remote action was performed from this Mac.

## Repair lane sitting-day manifests

The filling lanes must atomically write these small JSON files under the refresh
state directory, outside git:

| File under `~/.cache/autoresearch/pipeline/coverage-sitting-days/` | Owner lane | Required chambers and years |
| --- | --- | --- |
| `senate.json` | `im/senate-backfill` | `senate`, every year 2014-2019 |
| `nsw.json` | `im/nsw-hansard-gap` | `nsw_la` and `nsw_lc`, each year 2023-2025 |

Each file has `schema_version: 1`, `lane`, an aware ISO `generated_at`, a non-empty
`evidence` description or inventory receipt path, and a `chambers` object. Every
required year must have a list of unique ISO sitting dates within that year.
Dates come from the lane's source-day discovery inventory, including days that
are not loaded yet. Do not derive the expected inventory solely from held rows.
An empty list is permitted for a genuinely unknown/empty year, but cannot certify
completion of a known hole in that year. Files are capped at 1 MiB. Malformed
dates, wrong owners or omitted years fail the check without resetting its baseline.

Senate template, with empty placeholders to replace with the actual inventory:

```json
{
  "schema_version": 1,
  "lane": "im/senate-backfill",
  "generated_at": "2026-11-14T00:00:00Z",
  "evidence": "Path and digest of the lane's source-day discovery receipt",
  "chambers": {
    "senate": {
      "2014": [], "2015": [], "2016": [],
      "2017": [], "2018": [], "2019": []
    }
  }
}
```

The NSW file uses the same envelope and `lane: im/nsw-hansard-gap`, with both
`nsw_la` and `nsw_lc` objects containing `2023`, `2024` and `2025` arrays.
The nightly's daily check passes `--sitting-day-manifest-dir
"$PIPE/coverage-sitting-days"` explicitly. An absent file remains a warning;
when present its dates join the other calendar evidence automatically.

The three known holes end on 3 April 2019 (Senate), 21 November 2024 (NSW
Assembly) and 10 February 2025 (NSW Council). Their lanes are listed above.
Each has `review_by: 2026-12-14`. An unresolved hole becomes an alert after that
date. Once all expected dates within every affected chamber-year have rows,
the warning retires and its resolved ID persists. Extended intervals use new
IDs so an older, shorter resolved interval cannot hide the extension.

## Accepted regressions

A reviewed deliberate removal can be acknowledged in
`scripts/coverage_allowlist.json` using `kind: accepted_regression`. No active
acknowledgement is introduced by this change: the post-removal counts must first
be measured and approved for the actual removal.

Example shape, using illustrative counts only:

```json
{
  "id": "representatives-2020-federation-reclassification",
  "kind": "accepted_regression",
  "chambers": ["representatives"],
  "year": 2020,
  "start": "2026-11-14",
  "end": "2026-11-28",
  "counts": {"rows": 12000, "speech_days": 60},
  "reason": "Reviewed transfer of Federation Chamber rows out of representatives",
  "lane": "im/owning-repair-lane",
  "evidence": "Review receipt with measured before and after counts"
}
```

The entry must name exactly one chamber and year, both resulting counts, a
reason, lane, evidence, start and expiry. It applies only while its date window
is active and the observed counts exactly match the approved counts. It clears
that year's approved regression debt and credits only that loss against a
chamber-wide alarm. Other years and expected-day gap detection remain independent.
The snapshot records consumption: the same ID cannot acknowledge a later drop,
even if counts return to the same values before expiry. A same-day retry retains
the same approved transition against the prior-night baseline. Expiry limits
when an unused entry may be applied; an already-accepted removal becomes the
normal baseline. Later losses are assessed normally.

## Alert bookkeeping

Coverage findings enter `COVERAGE_FAILURES`, separate from operational
`FAILURES`. Successful weekly, monthly and FRL groups can record completion
while a coverage hold persists. Final status combines both arrays and sends
coverage alerts through the existing status-branch watchdog email path.
`coverage_status` checks the reader command's exit status, so a crash also alerts.

Five-day zero runs page when new or longer. Identical or shortened runs remain
in reports. The current run date sets are persisted, and retries use the latest
observed run state while row-count comparisons retain the prior night's totals.
