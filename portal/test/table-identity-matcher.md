The privacy matcher publishes a 32-bit polynomial hash of each existing registry
form, grouped by word count or stripped UTF-16 length. It includes the
`stripped:v1:` prefix in that domain's hash. Runtime compiles these numbers into
sparse typed hash tables and uses prefix hashes to check every candidate window
in constant time. Only hits allocate candidate strings and reach SHA-256.
Collisions can add confirmation work but cannot change the privacy decision.

The SHA-256 registry, its fingerprint function, and the D1 schema are unchanged.
SSR and `/api/table/privacy` confirm against the published SHA-256 set. The D1 API
uses the bundled prefilter and still confirms hits against its existing
`table_private_identity` table. This requires no database reload. Missing, stale
or corrupted optional prefilters use the complete matcher. The prefilter's
checksum protects against accidental corruption; it is not an authentication
mechanism.

`identityCandidates` retains its Set API. `iterateIdentityCandidates` supports
lazy matching, and the fast path skips duplicate word normalisations and
deduplicates confirmation candidates. Normalisations, ABN concatenation, short
form boundaries, UTF-16 slicing and value coercions retain the previous policy.

Run the equivalence and performance gate from `portal`:

```sh
node --test --test-concurrency=1 test/table-identity-matcher.test.mjs
node test/table-identity-benchmark.mjs
```

The reference matcher is frozen independently of production normalisation.
The corpus covers all schema-1 vote rows, all recorded recent vote rows, both
bill title fields, deterministic fuzzing, and every build form. Private forms
stay in memory; diagnostics contain counts only. Additional fictional cases
cover hash collisions, Unicode, short boundaries, ABNs and fallback indices.
CI allows 1.5 ms per row to tolerate shared runner noise.

On this Linux checkout, a fictional 306-character row measured:

| Runtime | Before (ms/row) | After (ms/row) | Speedup |
| --- | ---: | ---: | ---: |
| Node 24.21.0 | 35.815 | 0.194 | 185× |
| workerd 1.20260828.1 / Miniflare | 97.766 | 0.163 | 598× |

The Node run used 200 reference iterations and 5,000 fast iterations after
warming. Worker timing uses the host clock around batched requests (50 reference
iterations and 5,000 fast iterations), including local transport. It does not
use workerd's frozen request clock. The benchmark refuses outbound network
requests. `OPAX_BENCHMARK_HOST=::1` selects IPv6 loopback when needed locally.

The final equivalence run checked 40,274 texts: 7,479 raw vote rows, 7,479
projected SSR vote rows, zero recent vote rows (this checkout's snapshot is
empty), 5,798 bill titles, 2,000 fuzzed texts and 17,518 positive build forms.
There were zero disagreements or positive misses. Another 300 fuzzed texts had
identical complete candidate sets. The final CI performance check measured
0.144 ms per row over 3,000 iterations.

Fingerprint before and after:
`f620d6a19ecb395c34e4f2f2e6a8b2a1e07e5524510c3b48ec962d7359b6ffd7`.
The schema-1 votes file's unchanged SHA-256 is
`a77128dc0e1e1b3fdaa4bf84501e2c94af3125dea3cf0b2dffbc688a49d68546`.

Validation: all 1,587 tests passed serially, including donor privacy/publication,
table privacy and table API suites. `npm run check`, `npm run build:release`
and `wrangler deploy --dry-run` passed. The D1 API/load suites also passed
separately (24 tests). Local IPv4 loopback was unreachable, so validation used
IPv6 through `OPAX_TEST_HOST` and a temporary Miniflare default host adjustment.
That dependency adjustment was restored after validation. No production D1
operation, push or deployment was performed.
