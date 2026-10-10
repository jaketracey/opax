# Federal divisions refresh gap — 10 October 2026

## Diagnosis

The missing step was the federal **legacy-to-unified projection**. The daily
refresh schedules `parli.ingest.tvfy_refresh` when KB sync is enabled; nightly
enables that switch. TVFY fills `divisions`, `votes`, `members`,
`division_bills` and `division_votes_fetched`. It does not fill `ext_divisions`
or `ext_votes`. Neither daily nor weekly scheduled a federal ext_ load.
`votes_ingest`'s ordinary legacy/extension modes publish KB documents and do
not perform that load either.

Both `votes_state`'s federal loader and `votes_ingest`'s load-ext-only mode map
the legacy tables into `ext_divisions` / `ext_votes`. The latter preserves
TVFY bill links and supports an unlimited whole-window pass. The desktop's
read-only `ext_ingest_log` identifies the last full federal mapping at
**2026-09-02 02:23:44 UTC**, using the latter mode: 10,574 divisions and
844,874 votes. This was the one-off follow-up documented in `docs/VOTES.md`,
not a recurring scheduled projection. Those mapped divisions end on 20 August.

Read-only evidence on 10 October:

| Federal data | Representatives | Senate | Latest date |
| --- | ---: | ---: | --- |
| Legacy `divisions` | 3,609 | 7,038 | 17 September |
| Unified `ext_divisions` | 3,588 | 6,986 | 20 August |
| Legacy rows after 20 August | 21 | 51 | 17 September |

There are **72** later federal divisions and 5,159 associated recorded votes.
The reported **69** is exactly the 14–17 September week; the other three are
House divisions on 10 September. There is also one older legacy division
absent from ext_; the catch-up scope here is the window starting 20 August.

The published assets have different coverage:

| Asset | Exporter and input | Observed federal coverage |
| --- | --- | --- |
| `votes.json` | `export_votes.py`: federal legacy `divisions` / `votes` / `members`; state ext_ tables | **Already 17 September**, mobile schema **1** |
| `divisions/` and division pages | `export_division_pages.py`: ext_ divisions and named votes, with published bill backlinks and retained verified records | 20 August |
| `seo/recent-votes.json` | `export_recent_votes.py`: ext_ recorded votes, using `votes.json` for identity resolution | Empty; explicitly `coverage: unavailable` |

The reported 20 August cutoff therefore does not apply to the currently
committed mobile asset. Federal ext_ IDs use `tvfy_<person-id>` while schema-1
mobile keys use numeric strings. The SEO exporter now explicitly removes this
source prefix before matching identities, retaining its existing name check
and ambiguity safeguards.

## Source delay and hub wording

Two polite TVFY list requests, one per house, for 1 September–10 October
returned **21 House / 51 Senate divisions**, all through 17 September, matching
the desktop legacy rows. A single latest Senate detail request supplied 53
votes and passed the new completeness check. Requests used the existing OPAX
research UA and were separated by at least two seconds. A public FAQ diagnostic
returned an HTTP error and provided no usable statement about publication delay.

**No current TVFY lag explains this gap.** The desktop list caches had the
September coverage by 28 September, but cache modification times measure OPAX
acquisition, not TVFY's first publication. These observations cannot establish
the source's next-day publication delay or promise a fixed SLA. The job attempts
acquisition the following morning; divisions become available when TVFY
publishes complete list/detail records. Late arrivals are re-listed and retried.

Report to the hubs lane: use coverage dates, for example **“We check for recorded
divisions the morning after sitting days. Results appear once They Vote For You
publishes them. Federal divisions currently cover through [actual latest
published division date].”** Do not equate a successful check with source
completeness through yesterday, or promise “all yesterday's divisions” without
source evidence. Hub code was not changed in this lane.

## Reviewed nightly change

`scripts/vm/divisions_refresh.sh` follows the bills wrapper pattern. Nightly
sets its federal-managed switch on the daily runner so that TVFY acquisition
is not duplicated there. Standalone daily runs retain their existing behaviour.
The nightly wrapper runs independently of the broad KB sync switch and pins
all acquisition/export work to the refresh box's existing local DB. Its own
KB sync is disabled and its mapping mode does not create KB resources.

The acquisition wrapper calls the existing TVFY fetcher in strict, re-list
mode, then the federal legacy-to-ext_ loader with a loss guard, projects exact
TVFY bill relationships, then exports
the unchanged mobile schema. The reviewed box will write its normal ingest DB
and caches when it runs this code. **No acquisition or load was run against
the desktop DB, refresh box, KB or production during this lane.**

The cadence directly imports `bills_guard.cadence`, including its Sydney
timezone conversion and actual sitting-day ranges:

- 12–15 October sittings: refresh **13–16 October** mornings, including Friday.
- 26–29 October sittings: refresh **27–30 October** mornings.
- 16–19 and 23–26 November: refresh **17–20 and 24–27 November** mornings.
- **Sunday weekly** otherwise; unlisted future dates keep this fallback.

The existing box start schedule is 03:15 Australia/Sydney. Extend the single
calendar in `scripts/hubs/sitting-2026.json` (read by `bills_guard.py`) before 2027 sittings. There is no calendar network
request or extra scheduler.

On the first acquisition-enabled run, the wrapper creates
`pipeline/divisions-refresh-v1.pending` and
`pipeline/divisions-refresh-v1.initialized` outside git. Pending overrides the
calendar and forces catch-up **from 20 August 2026 inclusive**, re-listing even
settled months and projecting every whole chamber-day in the window. There is
no latest-six-days or division-count cap. Subsequent refreshes re-list at least
60 days and extend back to each chamber's last committed division date if the
source is older; delayed data cannot age out of the lookback. The initialized
marker prevents git sync or a repeat run from recreating consumed catch-up.

Fetch failures, unavailable or malformed lists, an unsplittable 100-row source
cap, incomplete vote tallies, and unavailable details fail the strict job.
Unavailable details remain retryable instead of being marked fetched. Before
any ext_ replacement, the mapping compares all existing division IDs and
recorded vote signatures in the window: neither a smaller set nor an
equal-count substitution may remove published evidence.

Publication checks preserve mobile schema 1, person identities, per-person
aye/no/total counts and latest coverage dates, and reject disappearing division
index keys/files. Existing division evidence and SEO rolling-window guards
remain in effect. Stamp-only exports retain HEAD bytes. Acquisition failures
restore all three vote exports; a web export failure after acquisition also
holds that bundle. Validation and portal gates keep their existing independent
group rollback behaviour, with an explicit dependency: a failed division page
export skips SEO for that night; a later division-group rollback also restores
SEO before publication. The final guard checks each SEO division slug against
the accepted division index and files. Any rollback of votes, divisions or SEO clears
catch-up acceptance; an innocent gate trial restores that flag with the files.

The combined fetch/map/link/mobile export budget is **20 minutes** with a 60-second
kill grace (`OPAX_DIVISIONS_TIMEOUT`). Failure keeps the static exports at HEAD
and lets the rest of nightly continue. Additive ingest/cache progress can
remain on the box and is retried. Pending is deleted only after all projections
survive their guards/gates and the data commit succeeds, or no commit is needed.
An interrupted or failed commit retains pending; publish-only runs do not
initialize or consume it.

## Box requirements

After review and merge, the box needs the updated repository code on its next
normal nightly. Its existing TVFY API key, legacy/unified tables, Python
environment, GNU timeout and writable pipeline/cache directories suffice.
There is no manual SQL, new Python dependency, cron change,
KB push or production action required from this lane. The first updated nightly
automatically initializes catch-up. Until that reviewed run publishes, the
currently shipped division pages remain at their old coverage date.

The TVFY detail loader creates the additive `tvfy_vote_parties` evidence table
automatically. The existing raw detail cache supports already-fetched catch-up
rows; a cache miss leaves unsupported historical affiliations unknown. There
is no manual migration or additional source request for those cached details.

## Review round 1

All four review findings are addressed in the code and isolated regressions:

- Division page failure prevents the dependent SEO exporter from running.
  Validation and portal-gate rollbacks restore SEO as well; innocent trial
  rollbacks restore the dependency state. The reproduction adds a new division
  to a fixture DB, fails its page exporter, and proves the old SEO bytes survive.
- Federal loaders use per-vote party first, then the division's TVFY member
  party. Future detail acquisition persists these vote-date facts separately;
  old fetched rows use complete, identity/date/chamber-checked raw detail caches.
  A read-only catch-up projection of all 72 later divisions / 5,159 votes finds
  a non-empty source party field for every vote. Round 2 corrects that count:
  42 fields are office markers, so they provide no affiliation evidence. Dated fallback
  is queried only when source party is absent, avoiding a whole-history scan.
  Missing affiliation can use an unambiguous federal Hansard membership
  observation on that exact division date. Earlier or later observations and
  undated `members.party`/`party_canonical` never supply a historical vote's
  party; absent or conflicting dated evidence remains unknown. Tests reproduce
  a Labor source detail with a stale Greens member and votes before/after a switch.
- Exact `division_bills` official IDs or APH bill URLs join the federal registry's
  official references and create `bill_links` with recorded TVFY evidence.
  Titles are not used; ambiguous/conflicting IDs and audited-wrong links are
  held. Read-only planning finds **27 missing relationships across 11 published
  bills** after 20 August. No real links were written during this lane. Divisions
  acquisition/projection now precedes bills export; bills acquisition repeats
  the exact-reference projection after fetching so newly registered bills also
  receive relationships before their export. A divisions catch-up forces the
  bills refresh even outside the calendar if the bills catch-up marker has
  already been consumed, so the first catch-up publishes those links immediately.
- The guard ports `decodeVotes`, `vote`, `voteBill`, `votesMeta` and `voteKey`
  from `origin/ios/app` at `d6d99935272fa28edb9039d08415a694cbfa5bcd`
  (`mobile/src/api/catalog-decoders.ts`, `validation.ts`, `ids.ts`). Required
  fields, name-index references, nested types, safe counts, valid dates and
  nullability are checked. Publication requires `_meta.schema == 1` and zero
  malformed records, even where the app could quarantine a damaged row.
  Required `_names` deletion is covered in both the acquisition wrapper and
  nightly harness.

## Verification

The push-race flake also reproduced on `b631107b`. The fixture seed accidentally
tracked imported Python bytecode; recompilation after cloning could leave
unstaged tracked changes, and Git then refused the push-race rebase. Disabling
bytecode for fixture creation (including the isolated import checker with `-B`)
removes that unrelated timing dependence. The harness now repeats the race
three times and checks that no bytecode is tracked. Production push/rebase
logic is unchanged.

The nightly harness includes catch-up initialization/consumption, sitting-day
boundaries, weekly fallback, acquisition/export failure, timeout, shrink,
vanished keys, publish-only, and portal rollback/innocent-trial scenarios.
The focused Python tests exercise the real acquisition shell wrapper with
stub fetch/map/export operations and JSON fixtures; they make no network or
real DB/KB calls. They also cover source caps, incomplete detail, retryable 404s,
mobile compatibility, vote/identity loss and a source older than the lookback.

The portal's real Worker/D1 and MCP tests require functioning loopback TCP.
This desktop times out on 127.0.0.1 while IPv6 ::1 succeeds. Verification uses
the existing `OPAX_TEST_HOST=::1` for MCP and a temporary Node import hook that
sets Miniflare's local default host to ::1. The hook changes only test host
configuration, leaves assertions and portal source unchanged, and is not
committed or needed on the refresh box.

Final gates:

| Gate | Result |
| --- | --- |
| `bash scripts/vm/test_nightly.sh` | 250 passed, 0 failed; three push races included |
| Python (`pytest tests scripts`) | 930 passed, 15,272 subtests passed |
| Focused review regressions | 55 passed, 116 subtests passed |
| `npm run build:search` and full portal Node suite | Build passed; 1,110 passed, 0 failed with the loopback setting above |
| `bash -n` for nightly, wrappers, daily/weekly and the harness | Passed |
| `git diff --check` | Passed |


## Review round 2

Merged fetched `origin/main` (tip `04617966`), including evidence refresh `2bf7f549`
and hubs `04617966`. All nine conflict hunks preserve both refresh groups' revert
flags, gate backups/restores, summaries and completion hooks, plus evidence's
abort/commit-failure handling and both fixture sets. Bills and divisions now read
main's single `scripts/hubs/sitting-2026.json`; isolated fixtures copy that file.
Evidence continuation assertions use the valid schema-1 identity fixture.

The division bundle's rollback restores the bill relationship field and its index
count to HEAD along with division pages and SEO. It keeps independent bill updates
(status, speeches, briefs, stages). Dependencies are restored again after permanent
validation or portal-gate rollback, before the final guard and bill summary. If
relationship restoration fails, the whole bills group is restored. The final
publication guard refuses any bill target outside the accepted division index.
The harness reproduces the failed exporter with a newer DB division
`federal-senate-2`, verifies the bill's old relationships/count and newer status,
and covers validation/gate rollback and innocent trial restoration.

Office markers are missing affiliation, in source detail, old persisted facts and
dated fallback observations. Complete-detail persistence replaces prior facts so
a previously stored marker cannot survive a corrected detail. Unit tests cover
`PRES`, `DPRES`, `SPK`, `DSPK`, `CWM` and related roles, no dated fallback, and a
presiding-officer division's projected party tally.

Read-only cached catch-up diagnosis confirmed **42 marker votes: 35 PRES and
7 DPRES**. This desktop snapshot has no usable same-day membership observations
for those 42, so the corrected projection keeps them unknown. Division **10765**
(14 September) loses fictitious PRES/DPRES tallies and gains two unknown
members; its 21 Labor and 13 Liberal votes retain their source affiliations.
No DB/cache, KB, refresh box or production writes or diagnostic network requests
were performed. Only isolated test fixture DBs are writable.

Round 2 final gates:

| Gate | Result |
| --- | --- |
| `bash scripts/vm/test_nightly.sh` (three full runs) | **298 passed, 0 failed in each run** |
| Python (`pytest -q tests scripts parli/tests`) | **1,037 passed; 15,314 subtests passed** |
| Focused division/bill/SEO review regressions | **61 passed; 131 subtests passed** |
| `cd portal && npm run build:search` | passed, including hubs and crawl catalog |
| `node --test test/*.test.mjs` | **1,124 passed, 0 failed** |
| `bash -n` (nightly, harness, groups and refresh wrappers) | passed |
| Working and staged `git diff --check` | passed |

The final three harness runs cover **nine simulated push races**, all green;
fixture bytecode prevention and isolated import checks from round 1 are retained.
The extra innocent-division/evidence-culprit scenario initially omitted the
fixture's evidence-change mode; its setup was corrected and verified independently
before the final three full runs. The final broad Python run includes the complete
cached-detail/old-party regression. Portal integration tests use the previously
documented IPv6 loopback workaround (`OPAX_TEST_HOST=::1` plus the temporary
Miniflare import hook), without changing repository sources or assertions.
Harness remotes are isolated local bare repositories; no real push or deploy
was performed. No box-side scheduler, dependency or second calendar is required.
