The privacy matcher uses a private 32-bit polynomial prefilter, grouped by
word count or stripped UTF-16 length, including the `stripped:v1:` domain prefix.
Runtime compiles it into sparse typed hash tables and checks candidate windows
in constant time. Only hits allocate strings and reach SHA-256. Collisions add
confirmation work and cannot change a decision.

`scripts/load_tables.mjs` generates `src/table-identity-prefilter.generated.mjs`
for the Worker bundle only. Neither the prefilter nor its binding appears under
`portal/public`; browsers continue to use `/api/table/privacy`. The public
registry contains only its original SHA identities and length metadata.

Before writing artifacts, the build derives each form's SHA and verifies every
registry entry exactly once, its word metadata, its domain/length bucket, and
counts by domain/length. Counts include rolling-hash collisions. The module
writer independently reconstructs the canonical complete prefilter before
sealing it. The generated module embeds a separate binding containing version 2,
SHA-256 of the canonical prefilter content, and the identity registry fingerprint.

Runtime checks the actual registry fingerprint against the bundled binding and
checks the content digest against the independently bundled digest. Recomputing
an altered prefilter's own checksum cannot replace that binding. Missing,
malformed, stale or version-mismatched prefilters fail closed: SSR and the privacy
endpoint deny, and the D1 guard returns 503 before data SQL. SSR registry length metadata must
also match the bound artifact. Tests reproduce 49/49 denied positive probes
through all three callers after a checksum-recomputed alteration.

The SHA registry, fingerprint definition, D1 schema and `privacy_fingerprint`
value are unchanged; no database reload is needed. The generated module also
bundles the existing SHA list. The API validates its SHA fingerprint against
`TABLE_REGISTRY_FINGERPRINT` and confirms prefilter hits against that complete
immutable list. SSR and `/api/table/privacy` confirm against the public SHA set
with the same bound fingerprint. Money-table publication still requires D1's
matching fingerprint; echo-only datasets keep serving older snapshots and
scoped queries with the complete Worker privacy guard. Render memoization and
timing instrumentation are retained.

`identityCandidates` retains its Set API. `iterateIdentityCandidates` supports
lazy matching, and the fast path skips duplicate word normalisations and
deduplicates confirmation candidates. Normalisations, ABN concatenation, short
form boundaries, UTF-16 slicing and value coercions retain the previous policy.

Run the equivalence and performance gate from `portal`:

```sh
node --test --test-concurrency=1 test/table-identity-matcher.test.mjs test/table-identity-binding.test.mjs
node test/table-identity-benchmark.mjs
```

The reference matcher is frozen independently of production normalisation.
The corpus covers all schema-1 vote rows, all recorded recent vote rows, both
bill title fields, deterministic fuzzing, and every build form. Private forms
stay in memory; diagnostics contain counts only. Additional fictional cases
cover hash collisions, Unicode, short boundaries, ABNs and invalid bindings.
CI allows 1.5 ms per row to tolerate shared runner noise.

In the initial optimization run on this Linux checkout, a fictional 306-character row measured:

| Runtime | Before (ms/row) | After (ms/row) | Speedup |
| --- | ---: | ---: | ---: |
| Node 24.21.0 | 35.815 | 0.194 | 185× |
| workerd 1.20260828.1 / Miniflare | 97.766 | 0.163 | 598× |

The Node run used 200 reference iterations and 5,000 fast iterations after
warming. Worker timing uses the host clock around batched requests (50 reference
iterations and 5,000 fast iterations), including local transport. It does not
use workerd's frozen request clock. The benchmark refuses outbound network
requests. `OPAX_BENCHMARK_HOST=::1` selects IPv6 loopback when needed locally.

The initial equivalence run checked 40,274 texts: 7,479 raw vote rows, 7,479
projected SSR vote rows, zero recent vote rows (this checkout's snapshot is
empty), 5,798 bill titles, 2,000 fuzzed texts and 17,518 positive build forms.
There were zero disagreements or positive misses. Another 300 fuzzed texts had
identical complete candidate sets. The initial CI performance check measured
0.144 ms per row over 3,000 iterations.

Fingerprint before and after:
`f620d6a19ecb395c34e4f2f2e6a8b2a1e07e5524510c3b48ec962d7359b6ffd7`.
The schema-1 votes file's unchanged SHA-256 is
`a77128dc0e1e1b3fdaa4bf84501e2c94af3125dea3cf0b2dffbc688a49d68546`.

Initial validation: all 1,587 tests passed serially, including donor privacy/publication,
table privacy and table API suites. `npm run check`, `npm run build:release`
and `wrangler deploy --dry-run` passed. The D1 API/load suites also passed
separately (24 tests). Local IPv4 loopback was unreachable, so validation used
IPv6 through `OPAX_TEST_HOST` and a temporary Miniflare default host adjustment.
That dependency adjustment was restored after validation. No production D1
operation, push or deployment was performed.

Round-two validation after merging `origin/main`: the full serial suite passed
1,634/1,634 tests; isolated voting API, table API and binding suites passed
34/34. The 14-file targeted privacy/table scope contains 145 tests in the final
suite. Both SSR/public-registry and bundled API matchers checked 40,274 texts
against the frozen reference, with zero disagreements and positive misses.
The 49-probe checksum-recomputed corruption repro denied all 49 through SSR,
the privacy endpoint and the D1 API. A scan of 27,185 public files found zero
prefilter or binding leaks. Missing, omitted and duplicated bundled SHA entries
also fail closed in the API.

The final Node CI check measured 0.149 ms per 306-character row. The separate
warmed benchmark measured:

| Runtime | Before (ms/row) | After (ms/row) | Speedup |
| --- | ---: | ---: | ---: |
| Node | 36.204 | 0.163 | 222× |
| workerd / Miniflare | 103.832 | 0.181 | 574× |

`npm run check` passed. The private generated module, including the existing
SHA list for API confirmation, is 1,363,853 bytes. The identity fingerprint and
votes bytes remain unchanged.

`npm run build:release` and `wrangler deploy --dry-run` passed. Wrangler measured
9,001.74 KiB uncompressed (8.79 MiB) and 3,006.78 KiB gzip (2.94 MiB), below the
[current Workers limit of 64 MiB uncompressed](https://developers.cloudflare.com/workers/platform/limits/#worker-size).
The prepared local SQL manifest also retains the same identity-only fingerprint.
The release build's unrelated license line-ending change was restored. No push,
deployment or remote D1 operation was performed.
The final post-release public-file scan passed again: 27,185 files, zero leaks.
The temporary Miniflare IPv6 adjustment was restored byte-identically after all
checks. `votes.json` matches its pre-change Git blob byte for byte, and the SHA
registry and stripped-length lists match the pre-change snapshot exactly.
