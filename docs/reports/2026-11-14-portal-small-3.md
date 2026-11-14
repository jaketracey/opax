# Portal review fixes, 14 November 2026

Branch: `im/portal-small-3`. Neither row 183 nor row 185 was on `origin/main`
(`2ccd62bd1`) when work started. The branch starts at `origin/im/sponsor-dated`
(`266cfa3d8`), then merges current main and `origin/im/procedural-votes`
(`4851b33d9`). The only merge conflict was an asset stamp, regenerated from the
merged files. Row 172 is already on main in `c626b938a` (#369).

## 4d: teller headings

Real reproduction: [Senate division 1158, 7 November 2006](https://theyvoteforyou.org.au/divisions/senate/2006-11-07/3),
held in `portal/public/divisions/division-federal-senate-1158.json`. It lists six
ayes: Andrew Bartlett, Bob Brown, Kerry Nettle, Lyn Allison, Natasha Stott Despoja
and Rachel Siewert. Its They Vote For You aye tally is five. The browser and
server now say `Ayes 6 named (tally 5)`. Both keep every name and the source
totals. The same rule describes partial lists. Equal counts stay compact;
explicit zero tallies are retained; missing tallies do not become zeroes.

`portal/test/division-page.test.mjs` checks the real record in both renderers,
plus partial lists, equal counts, paired members and zero/missing tallies.

## 4e: Franklin party evidence remains insufficient

The 32 recoveries belong to `origin/im/division-coverage` at `04699be2a`, which
has not landed on the main used here. That branch's reviewed recovery report
is preserved, with its source URLs and member provenance, in
`docs/evidence/franklin-vote-party-review.json`. The review does not merge that
branch or regenerate published divisions from an older database.

The dated-party rules from #369 were run on every recovered vote, using the
tracked release, service and official-list evidence and the read-only local
snapshot's `ext_state_roster` records. Result: **32 `no-dated-party`, zero
labels filled**.

| Vote date | Recovered votes left without a party |
| --- | ---: |
| 27 November 2025 | 5 |
| 23 December 2025 | 7 |
| 15 September 2026 | 2 |
| 17 September 2026 | 6 |
| 23 September 2026 | 1 |
| 24 September 2026 | 11 |

Held evidence and the specific gaps:

- Wikidata identity `Q19873536`, NSW Legislative Council, has terms beginning
  28 March 2015 and 8 May 2019. Both cached rows give
  `Liberal-National Coalition`. This does not identify a single party; the
  existing rules correctly normalise it to no party.
- The reviewed official Council list gives Ben Franklin as Nationals on
  **25 September 2026**. It is a point observation, after all 32 votes, and
  does not establish a party interval covering any of them.
- No reviewed service-party interval or accepted vote-party period for
  Franklin covers these dates. The snapshot's `members` row has a blank party
  and is not a dated party source in any event.
- Required to fill: a primary-source party/service record identifying a
  single party for Franklin in the NSW Council, with a dated period covering
  the relevant vote days. Identity, a coalition label and a later observation
  cannot substitute for that evidence.

`scripts/audit_franklin_vote_parties.py` prints a report through the existing
resolver and changes neither its inputs nor published labels. Repeat with:

```sh
nice -n 10 python3 scripts/audit_franklin_vote_parties.py \
  --db /home/jake/.cache/autoresearch/parli.db
```

`tests/test_franklin_vote_parties.py` freezes the snapshot's two cache rows
while loading the tracked evidence. It checks all 32 blank results, input
preservation, and that a hypothetical future reviewed interval would fill only
the days it covers. The hypothetical party is explicitly a test fixture.

## 4l: sponsor surname hold

A printed sponsor with `Rex Patrick Team` and a person ID whose dated record
has a different surname and `Independent` keeps its source label and once
again returns the reviewed hold. The surname guard still prevents a party
correction based on the mismatched identity. The regression covers primary
and additional sponsors through both supported evidence entry points.

## 4m: narrative and source note

One moved vote now reads `It is listed under Procedural votes.` Multiple votes
retain the explicit moved count, including `1 of these is listed` when one of
several votes moved. The source note says that procedural motions are listed
under Procedural votes even when recorded at another stage. The recorded-stage
narrative and the limitation-of-debate explanation remain intact.

The tests exercise single and multiple votes, both renderers across the
published bill corpus, and the browser's source note.

## Validation

- All 118 relevant Python tests pass, including the sponsor exporter, bill
  facts/divisions, dated-party rules and Franklin audit.
- TypeScript passes after generating the local Worker types.
- Asset stamps pass `scripts/stamp_assets.mjs --check`.
- The two new teller tests fail against the pre-change browser, and also fail
  when only the server implementation is reverted in a separate scratch tree.
  Both copy regression tests fail with the old browser and narrative module.
  The sponsor regression fails for both primary and additional sponsors with
  the old exporter. These are assertion failures against actual prior source,
  with the new tests retained, not substituted implementations.
- Franklin is an evidence-only hold. No party-label change is claimed; its
  tests verify the audit and the resolver's date boundary.
- First full portal run, concurrency four: 5,017 passed, two failed, 11 skipped
  (5,030 total). Both failures were unchanged main Ask tests during load pauses:
  the slow-answer check took 9,862 ms against a 6,500 ms bound, and a hearing
  lookup consumed 26,515 ms and exhausted its tool budget. Both complete test
  files pass in isolation, **27/27**, with the previously failed hearing case
  completing in 98 ms.
- Second full portal run, concurrency four: **5,018 passed, one failed, 11
  skipped** (5,030 total). Both Ask failures above pass in this full run. Its
  one failure is `directory supplier renders rows with the real shell and no
  browser errors`: `directory shell exceeded 15 seconds`, at 15,962 ms during
  load pauses. That check passed in the first full run and passes again in
  isolation, **1/1**, at 6,142 ms. No timeout or unrelated implementation was
  changed. All new portal regressions pass in both full runs.

Local prerequisites were built with `OPAX_TABLE_METADATA_ONLY=1 npm run
build:search` and `WRANGLER_SEND_METRICS=false npm run types`. No table SQL was
prepared or applied. The unrelated generated agency top-supplier cache was
restored. The full suite uses the repository gate's Linux loopback isolation:
`unshare -Urn sh -c 'ip link set lo up; exec "$@"' opax-portal-tests npm test`.

All database access is read-only. No production, KB or
D1 writes, deployment, SSH, APH or ParlInfo fetch occurred. No `.ops/` file is
included in the changes. Heavy commands use niceness 10 and pause while the
five-minute load exceeds 40. The portal's `npm test` script now explicitly
sets test concurrency to four so the full check is repeatable.
