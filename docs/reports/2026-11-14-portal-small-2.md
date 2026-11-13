Portal small fixes, measured 14 November 2026 (Sydney).

- Moved `portal/src/subject-figures.test.mjs` to `portal/test/` and corrected its three imports. All six cases now match CI's `test/*.test.mjs` glob.
- Removed the repeated speech-absence clause from `noHansardHeldHTML`. The notice now reads: "No Hansard held for this period. This profile comes from the parliament’s member list." The real [Mira El Dannawi profile](https://opax.com.au/subject/person/mira-el-dannawi) showed the old wording. A full Worker render test checks the notice and absence statement appear once. Temporarily restoring the old clause makes that test fail.
- The bills-index policy stays exactly as live: `public, max-age=900, stale-while-revalidate=3600`.

Production measurements at 10:13 AEDT (23:13 UTC on 13 November), using public GETs with `Accept-Encoding: gzip`:

| Asset | Observed Cache-Control | Decoded bytes | Gzip bytes | GET | Conditional GET |
| --- | --- | ---: | ---: | --- | --- |
| `/bills/index.json` | `public, max-age=900, stale-while-revalidate=3600` | 1,813,313 | 128,940 | 200, 191 ms | 304, 0 body bytes, 112 ms |
| `/bills/au-federal-r7537.json` | `public, max-age=0, must-revalidate` | 2,963 | 1,237 | 200, 137 ms | 304, 0 body bytes, 77 ms |

The index's gzip ETag was `W/"8971978f95b2be5440e1effe85e9544c"`; the bill's was `W/"21c9885a8870c1d27e0b9f4da11e209b"`. Both conditional requests used `If-None-Match` and returned the matching strong ETag. Both assets reported `CF-Cache-Status: HIT`, with no `Age` or `Last-Modified`. A later index recheck returned a bodyless 304 in 125 ms, and a forced `Cache-Control: no-cache` request returned a bodyless 304 in 94 ms. These are individual observations from this desktop, not latency percentiles.

The check therefore supersedes the 13 November lane's `max-age=0` observation for the index: both production and this branch already had a 15-minute index exception. The cheap ETag/304 path already works. No Worker route is needed.

Publication cadence comes from `scripts/vm/bills_refresh.sh` and `scripts/vm/bills_guard.py`: the nightly pipeline refreshes after sitting days, weekly on Sunday in recess, on catch-up, and when newly refreshed division links require it. Corrections can also publish on another deploy. `scripts/export_bills.py:write_index` preserves `generated_at` and identical bytes when bill content has not changed. Git history shows index changes on 10 and 12 November, rather than every night. The live index contains 2,989 bills and retains `generated_at: 2026-10-04T16:27:54+00:00`; that build stamp is not proof of the last validation or correction.

The shared iOS/Android implementation was inspected read-only using `git show origin/ios/apple-design`, at `3ff34358d06000d578dc48e5608bbe11a8e8b509`:

- `mobile/src/api/client.ts` uses `max-age` less `Age` to calculate expiry, returns a saved fresh body without networking, and otherwise sends `If-None-Match`. Forced refresh adds request `Cache-Control: no-cache`. A 304 updates `validatedAt` and expiry while retaining the original `savedAt` and body. It does not implement stale-while-revalidate.
- `mobile/src/api/catalogs.ts:followSources` reads the same `/bills/index.json`, with no detail request per followed bill. Its combined `savedAt` is the oldest source save time. Following's displayed "Checked" text uses that time, so a 304 does not falsely advance it to the present.
- `mobile/src/features/follows/useFollowStates.ts` reads on mount, foreground and pull to refresh; only the explicit refresh forces validation. `markers.ts:billFingerprint` compares status, status date, division/speech counts and available latest-record identifiers from the index. The server's ETag is a validator, not the change marker.

Initial validation:

- Fresh `nice -n 10 npm ci`; locked Python environment via `nice -n 10 uv sync --frozen --python 3.12`.
- Generated Worker types with `npx wrangler types`; `npm run build:search` generated the search catalogue, growth, hubs and crawl assets before the full suite.
- `npx tsc --noEmit`: passed.
- Focused subject-figures, held-back-transcripts and asset-cache tests: 26 passed. The copy regression was also verified to fail when reverted.
- Regenerated asset stamps and `node scripts/stamp_assets.mjs --check`: passed.
- Full `npm test` glob via `node --test --test-concurrency=4 test/*.test.mjs`, with this worktree's `.venv/bin` on PATH: 4,949 passed, no failures or skips (359.9 seconds). This includes all six moved subject-figures cases. The concurrency option must precede the file list.

After restoring the live cache policy and its original test expectation, reran the three focused files: 26 passed, no failures or skips; the asset-stamp check also passed.

Builds and gates ran at niceness 10; observed five-minute load stayed below 40. Generated unrelated growth data is excluded from the commit. No `.ops/` changes, production/KB/D1 writes or SSH were used.
