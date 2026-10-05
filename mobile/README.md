# OPAX iOS foundation

Expo SDK 57 / React Native 0.86, strict TypeScript, expo-router. iOS 18.4 (`ios.deploymentTarget`) is
the minimum. Light mode only; Android is possible later and is not built here.
App identity: OPAX, `au.com.opax.app`, version `0.1.0`, build `1`.
No push, analytics, crash reporter or microphone permission. Production release
tooling uses locally supplied Apple credentials; none are part of the app config.

## Install and develop

Use Node 24 and npm 11. Check `/bin/ls -ld mobile/node_modules` first. Never run
`npm ci` through a symlink. From `mobile/`, run `npm ci`, then `npm run start`.
Development defaults to public production catalogs. Set `OPAX_DEV_ORIGIN` to an
HTTPS origin or a loopback HTTP origin (for example a local `wrangler dev` server).
Only explicit loopback development adds an ATS exception. To build locally, use `npm run ios -- <assigned-udid>`; it boots and builds through the shared
configured gates and shuts down when the process exits. The Mac stays muted; never enable speech or VoiceOver audio.

`OPAX_VARIANT=development|e2e|production` selects configuration at build time.
Production always reads `https://opax.com.au`. E2E embeds only
`http://127.0.0.1:8910`; `OPAX_FIXTURE_PORT` can change it within 8900–8999 and
must match at build and run time. There is no JS origin fallback or OTA update.
CNG regenerates ignored `ios/` and `android/`; native edits must become config
plugins. Prebuild's developer ATS defaults are
removed by `plugins/withNetworkPolicy.js`; `native-config.ts` verifies its output.
`plugins/withSceneLifecycle.js` enables SDK 57's supported
`expo-build-properties` scene opt-in. Every prebuild writes the single-window
manifest for Expo's built-in `EXExpoAppSceneDelegate` and exposes the React
Native factory through `ExpoReactNativeFactoryProvider`. Expo creates the
scene window and forwards lifecycle and cold/warm links; no generated Swift
file needs hand editing. The share module resolves the foreground scene’s key
window and follows its presented controllers before showing the system sheet.
This requires Expo 57.0.23 or newer. See
[Expo's scene lifecycle guide](https://github.com/expo/fyi/blob/main/ios-scene-lifecycle.md).
Each build runs prebuild; set `OPAX_CLEAN_PREBUILD=1` for a full regeneration.
Ordinary iterations retain generated Pods so unchanged native headers can reuse
the shared host's compilation cache. Native build concurrency is capped at four.

## QA and build

```sh
cd mobile
scripts/qa.sh
scripts/build-e2e.sh
scripts/e2e.sh <simulator-udid> 01 02 03 04 05 06
OPAX_CONTENT_SIZE=accessibility-extra-extra-extra-large scripts/e2e.sh <simulator-udid> 03 05 06
```

The optional `.maestro/07-scene-lifecycle.yaml` smoke is run by its explicit path;
numeric journey 07 excludes it and runs only the Your MP journeys. It checks cold/warm links and
the real native share module. On the 16e with iOS 18.4 at standard text size, use
`OPAX_REMOTE_SHARE_UI=true`: its system-hosted share sheet is absent from Maestro's
app hierarchy. Review `07-native-share.png` for the title, icon and URL; the flow
closes the observed X button and still requires the native cancellation callback
and return to Workbench. Other devices retain automated preview assertions.

Copy `.qa.local.env.example` to the ignored `.qa.local.env` for optional host
configuration. Scripts source it before running. Never commit actual paths or IDs.

Before any simulator boot, app install or fixture startup, the
runner selects a working Java 17+ installation. It tries inherited `JAVA_HOME`,
sdkman installations, macOS `java_home -v 17+`, then Java on `PATH`, skipping
invalid or older candidates. The selected version is saved in `java.log`.

| Variable                  | Local purpose                                                                         | When blank                                          |
| ------------------------- | ------------------------------------------------------------------------------------- | --------------------------------------------------- |
| `OPAX_BUILD_GATE`         | Executable shell script wrapping builds, invoked with lane name and command arguments | Run the command directly, with a notice             |
| `OPAX_SIM_GATE`           | Shell script booting an allowed simulator, invoked with lane name and UDID            | Boot directly, with a notice                        |
| `OPAX_PASTE_LOCK`         | Shared directory lock for Maestro input                                               | Skip locking, with a notice                         |
| `OPAX_CAPACITY_CMD`       | Trusted local shell command checking host capacity                                    | Skip capacity checks, with a notice                 |
| `OPAX_ALLOWED_UDIDS`      | Space-separated simulator allow-list                                                  | Accept the requested simulator, with a warning      |
| `OPAX_PASTE_WAIT_SECONDS` | Digit-only deadline for capacity and pasteboard lock waits                            | 7,200 seconds; invalid values also use this default |

Configured capacity checks run before builds and devices; a five-minute load of
140 or more waits until it is under 140. `OPAX_PASTE_WAIT_SECONDS` is validated as
a decimal of at most nine digits in `qa-lock.sh`; invalid values default to 7200.
The e2e runner starts only its own fixture, installs the Release app
without Metro, saves Maestro/screenshots/request logs in ignored `private/qa/<run>/`,
restores text size/appearance and shuts down on success or failure. Never commit QA evidence.
`OPAX_QA_RUN` names evidence, `OPAX_QA_APP` selects a prepared app. No audio flows.
Journey 04 stops the fixture and checks saved data without clearing the app. Default
runs include 01–04; `OPAX_VERIFY_OFFLINE=1` also adds 04 to a selected warm run.

The pasteboard lock (`scripts/qa-lock.sh`) is shared with other projects, so a run
waits for capacity and lock admission before booting. The whole device phase goes
through `qa_paste_lock_run`: holding nothing, it waits for the lock to look free and for
capacity, then enters the build gate with `scripts/qa-locked.sh`. Inside the gate the
wrapper makes one non-blocking lock attempt and rechecks the load. If the lock is
taken or the load has reached 140, it leaves the gate at once and the runner starts
again; otherwise the runner boots, installs, runs Maestro and shuts the simulator down
before releasing the lock. It uses the existing wrapper, with no additional lock
wrapper. The wrapper leads its own process group: the device phase and its children
run in it, and release first stops any
leftovers. `OPAX_PASTE_WAIT_SECONDS` covers all the waiting; every minute `lock.log`
names the lock, the elapsed time and the holder. Never write your own lock wrapper.

The lock directory appears in one atomic step with its `owner` file (pid and pgid of
the wrapper, script, worktree name, UTC start, random token) and is released by renaming
it aside, so a crash never leaves an OPAX lock without an owner. Other projects' plain
`mkdir`/`rmdir` keep working: publication never replaces an existing directory, and
OPAX never writes into a lock it did not create. A waiter retires a lock only when its
owner's pid is dead and no process in its group is alive, and logs it. A lock with a
live holder, a live group member or no owner file is never removed, whatever its age.
`<lock>.opax/` holds the reap guard plus staging and retired copies from crashed runs,
which are cleaned once their pid is dead. `scripts/test-qa-lock.sh`, part of
`npm run qa`, tests all of this with a mocked gate in a scratch directory.

If a lock stays held, read `lock.log` and `<lock>/owner`, then:

- **OPAX owner, dead pid, live group** (`pgrep -g <pgid>` lists processes): the locked
  Maestro's leftovers still run. Stop them with `kill -TERM -- -<pgid>`; the next waiter
  then retires the lock.
- **OPAX owner, live pid:** the run is still going. To stop it now, `kill -TERM <pid>`;
  the wrapper stops its group and releases. A TERM to `e2e.sh` itself takes effect when
  the current Maestro run returns.
- **No owner file:** the lock belongs to another project or an older OPAX script. Leave
  it. Remove it with `rmdir` only after its owner confirms nothing uses the pasteboard.

Agent command runners stop long foreground commands, which can strand a simulator
or the lock. **Start e2e and release runs detached and poll them**:

```sh
mkdir -p private/qa
OPAX_QA_RUN=<run> nohup scripts/e2e.sh <udid> 01 02 > private/qa/<run>.out 2>&1 &
```

Its first line is `E2E pid=<pid> status=private/qa/<run>/exit-status` (the path is
absolute). The status file holds the exit code and appears only after cleanup: lock
released, fixture stopped, simulator shut down. If the pid is gone with no status file,
the run was killed: read `lock.log`, then shut the simulator down yourself. Start a
release the same way, logging under ignored `private/` so the worktree stays clean
(`nohup scripts/release-ios.sh --build-number N > private/release-N.out 2>&1 &`).
Poll its pid; success ends with `Verified release evidence:` and writes `release.json`.

The runner samples the selected simulator's app processes with `lsof -a -p <pid> -i`
every nominal 250ms, writing raw `connection-samples.jsonl` and a measured
`connection-audit.json`. The sampler uses numeric socket addresses without DNS or
outbound probes. Missing process coverage, collection errors or observed
external connections fail. Polling gaps above 3,000ms also fail: the audit records
`longestSampleGapMs` and `sampleGapLimitMs`, covering each active app process,
startup, scheduling delays, in-flight samples and the final tail. Short connections between samples may be missed; the
source, variant and bundle boundaries are checked separately. Fixture request
counts are in `request-audit.json` and do not claim to measure external traffic.

Build output is `build/e2e/DerivedData/Build/Products/Release-iphonesimulator/OPAX.app`.
The build prints its path, elapsed seconds and disk size. Once finished, prune
`Build/Intermediates.noindex`, `CompilationCache.noindex` and `ModuleCache.noindex`
from that DerivedData, keeping the app. `qa-static` evaluates both configs,
checks the resolved dependency tree and scans source transport boundaries.
The e2e build additionally checks the generated plist and embedded bundle.
`scripts/check-release-bundle.sh` exports iOS production JS through the build
gate, prebuilds production and verifies native ATS, then scans the shipped JS for
loopback/fixture origins and mandatory allow-list/origin/redirect guards. SDK 57's dormant Metro/SSR URL
bases are replaced with `navigation.invalid` by the production-only Babel plugin;
the app's only network origin still comes from the reviewed build configuration.

## Seams for later lanes

For a signed local archive/IPA and the separate internal TestFlight workflow,
see [iOS release instructions](../docs/IOS-RELEASE.md). Run
`scripts/release-ios.sh --build-number 1` from a clean
committed worktree; it exports locally without upload. `OPAX_BUILD_NUMBER` selects
the native and embedded build number. Release hooks may also be set in ignored
`private/local.env`. Privacy verification permits the team ID only in validated
Apple signing metadata and rejects private values in app content. The orchestrator owns upload of
the exact full commit approved by QA.
Release runs reinstall locked dependencies and refuse Expo `.env*` inputs.
The build gate receives a credential-free wrapper; upload checks the verified
IPA hash and uses those bytes directly. QA includes the offline tooling and
attack regression tests.

- Routes live in `src/app/`; feature UI in `src/features/`. The four native
  tabs are Today, Your MP, Bills and Search, each its own native stack: root
  screens in `src/app/(tabs)/(today)/`, `(your-mp)/`, `(bills)/` and
  `(search)/`; detail routes in `src/app/(tabs)/(today,your-mp,bills,search)/`
  so they push within the current tab. Routes carry identifiers only.
  `person/[slug]` corresponds to `/subject/person/<slug>` through
  `src/navigation/routes.ts`; universal links and associated domains are deferred.
  Talk and Account and about are navigation-bar buttons on root screens that
  open `src/app/talk.tsx` and `src/app/account.tsx` as sheets (placeholders for
  the voice and account lanes); see `src/voice/README.md`.
- Use `src/design/primitives.tsx`; usage notes for every component, token and
  state are in `src/design/README.md`. Colours go through roles only.
  Fonts (Merriweather Regular and Bold, Public Sans Regular, SemiBold and
  Bold) are bundled with OFL notices and upstream hashes. The complete notices
  are embedded in `extra.fontAcknowledgements` for a later About screen.
  The built-app check verifies these notices. Body text scales without a
  multiplier cap using iOS Dynamic Type ramps. Word-safe headings and control
  labels may lower their cap to keep whole words readable (see the design README).
  Avoid fixed heights or line limits. Keep controls at least 44pt, labels wrapping,
  and sections scrollable.
- The design workbench (`src/workbench/`, route `/workbench`) renders every
  component and state. It exists in development and e2e builds only (Account
  and about, then Design workbench); `metro.config.js` blocks it from
  production bundles and `check-release-bundle.sh` verifies its absence.
- Sharing goes through `src/navigation/share.ts` and the local Swift module
  `modules/opax-share`, which builds link metadata on the device. Canonical
  links use `extra.webOrigin` from the build configuration.
- The app icon (the Australia mark on navy, with dark and tinted variants) is
  in `assets/icon/`, with its provenance and render commands.
- Add API contracts/decoders in `src/api/catalogs.ts`, then a reviewed GET path
  in `policy.ts` and a rejection/acceptance test. Use `catalogs` from `runtime.ts`.
  Identity adapters keep canonical IDs and legacy IDs separate. The slug API maps
  **slug to name**. Search record `slug` values are opaque catalog IDs;
  `personSlugForResult` resolves the encoded name/canonical slug from `href`
  through the slug API before navigation. Current seats come from dated electorate
  observations, not last speech year or the roster's historical representation array.
- Public catalog cache entries use one disk file per complete origin and URL,
  with a small metadata index persisted separately and a 40-entry/12 MiB budget.
  Search queries and result pages stay in memory only, with an 8-entry/1 MiB
  budget, and cannot evict catalogs. Legacy disk search entries are removed when
  the catalog index loads. Oldest validation is evicted within each bucket.
  Writes serialize; catalog disk writes use temporary files. Every write checks
  the retained entry: older source dates or
  responses started before the stored validation are rejected; 304 refreshes need
  the same stored ETag. A rejected response returns the retained observation.
  The v2 layout discards the earlier snapshot cache; system cache storage can also
  be reclaimed by iOS. Offline data is opportunistic, not permanent storage. HTTP freshness
  expires at max-age (capped to one day); no-store search is revalidated on every
  read and retained only for the current app session. `savedAt`, `validatedAt`, `asOf` and
  `stale` are distinct. Transient failures can return stale data; 4xx identity,
  invalid data and forbidden routes do not. Display saved and source dates.
- `scripts/fixture-snapshot.json` pins SHA-256 and byte sizes of the reviewed public P0 files. Startup verifies hashes and freezes bytes in memory.
  To add fixture data, review provenance/cost, add its hash/path to this manifest
  and implement the catalog route from those files. No arbitrary asset serving,
  Worker imports or outbound network. The person search projection matches names
  from these catalogs; it does not reproduce production index ranking. A Host header other than the exact loopback host is rejected. Unknown
  routes/methods/kinds return 404 with `OUTSIDE_ALLOW_LIST`. The documented
  `upgrade` hook now hosts the loopback fake voice relay; see `src/voice/README.md`.
- Add independent `.maestro/<nn>-<journey>.yaml` flows using stable `testID`s.
  Use `${EVIDENCE}` for relative screenshot paths within Maestro's artifact bundle;
  the runner gathers named PNGs into the run's `screenshots/` folder.
  Scroll to reachable controls, test the minimum
  device and AX5. Test identity/source assertions against real pinned data.

## Never-call rule

Public reading uses only the explicit allow-list in `src/api/policy.ts`:
catalog assets, `/api/person-slugs`, and `/api/search-all` with exactly one
explicit supported catalog kind **other than bill**. Bills use static JSON.
Never call Ask, `/api/search` (even keyword), summaries, follow-ups, journey
stories, briefs, positions, `/og/*`, `/mcp`, resources, topics or any model-backed
route. Search kinds are only `person`, `interest`, `pay` and `expense`.
Native Image URIs must directly call imported `localImageURI` from
`src/api/image-policy.ts`; only files inside the configured API origin's
portrait cache pass. `ApiClient.getPortrait` permits GET of
`/photos/<numeric-person-id|wd-QID>.webp` only (strict positive, bounded keys),
checks MIME, redirects, actual/declared 64 KiB limit and the 200×200 WebP frame.
The exact map and credits routes have 64 KiB and 256 KiB body limits.
The cache deduplicates keys, limits concurrency to three and disk usage to
12 MiB/1,024 files, and retains valid files offline. Tests use only immutable,
hash-pinned map, credits and selected website images; a reviewed image absent
from the small fixture subset returns an expected 404 and a blank fallback.
Run `node --import tsx scripts/portrait-probe.ts` for roster coverage and
ambiguous-name/shared-face refusals. The probe compares every image blob at the
pinned fixture commit, including byte-identical files under different keys;
the app groups the three reviewed duplicate pairs before checking identity
ownership, so their unrelated candidates remain blank. Repinning fails until
those byte groups are reviewed again. App rights remain IOS-APP.md decision 13.

Both source gates scan JS/TS in `src/` and `modules/`. `modules/*/scripts/` is Node
tooling, exempt from app transport and origin rules but still scanned for secrets.
App and module source cannot import that tooling, including via re-exports or
dynamic imports. Native access is granted only to exact (file, module name) pairs
in `scripts/native-review-policy.js`;
dynamic loader names, native proxies and React Native deep imports are rejected.
The static gate also scans module Swift, Objective-C and C sources for networking
APIs. The reviewed voice core has explicit file/API exceptions; the share metadata
module has none.
New bridges, native networking files or API families require review and a list
update rather than a directory-wide exemption.

These static gates target ordinary application code, including image and asset
loaders. They are not a complete defense against deliberate evasion such as
aliasing globals or methods, dynamic execution, or hiding image props in spreads
and `createElement`. The measured connection audit is the runtime backstop for
those cases. Its sampling limitations still apply: an unobserved connection is
not proof that no connection occurred.

Voice/community will use separate scoped clients after their lane approval;
never widen this read-only client for them. E2E source buttons show the real
source URL locally; production opens the external source. E2E never opens an
external browser or production page.

`npm run qa` includes an accepted-advisory baseline in
`scripts/advisory-baseline.json`. Any new root advisory fails, including a new GHSA
in an accepted runtime package. `decode-uri-component@0.2.2`, through Expo Router's
`query-string`, is accepted for GHSA-vcc3-ghjq-m6fr: a crafted deep link can stall
parsing. The current SDK has no compatible fix; review Expo patch updates. Tooling
advisories are individually classified in the same baseline. Never run
`npm audit fix --force`; its suggested dependency downgrades break the fixed SDK.

Search has grouped on-device suggestions, explicit catalog submissions for People,
Declared interests, Pay and Expenses, and saved/offline states. People rows include
roster party history and seat or chamber context, including the full accessible
label. Empty results offer one-tap searches in the other allowed kinds; electorate
suggestions open the native electorate route. Matching-record disclosures expose
their expanded state. Today opens with the daily edition card, then dated bill and
declaration feeds with category and party; website portraits retain their credit
and licence links, with blank circles for missing, unreviewed or failed images. About and
sources pushes inside the Account sheet, with snapshot coverage, source terms,
privacy and the build's complete font notices. Bills has a native list and detail
stack; Today bill rows, Search bill suggestions and matched profile and Your MP
vote rows open that detail route. Profile links resolve canonical person IDs before
passing them through the existing identifier route; the slug form is also retained
for the foundation journeys.
Your MP supports an explicit seat choice saved on the device, verified member
and senator observations, and explicit state-seat choices where a verified
roster exists. Historical seats are excluded from the picker; a saved historical
choice and its electorate record explain that the seat was abolished. A state
choice replaces the prior district/region in its chamber and can be removed.
The choice file may be included in device backups. The member's register file
is fetched only when Register changes is opened. Person profiles render the catalog
blocks independently, including portrait permission, W12 voting dates, register OCR
warnings, pay, expenses and party receipts. Roster-only former profiles explicitly
say their records are not linked in this release and link to the web; they do not
claim those records are absent. Electorates show dated representation, elections,
Census vintage and sources. Journeys 07–09 cover Your MP, profiles and electorates;
12–14 cover Search, Today and About. The runner accepts 01–14 and rejects unknown
numeric flows. Licensed postcode/location lookup, sign-in, voice, universal links
and wider data coverage belong to their owning lanes.

## P0 catalog adapters (data only)

Import `catalogs` from `src/api/runtime.ts`; all loaders validate complete JSON.
Use `directory()` for the release/roster/slug joins, `yourMP(seatId, chosenStateSeatIds)`
for verified member and senator observations, and `electorateFor(seat.detail_url)`
for elections, Census vintage, representation and evidence. State seats are explicit
choices; the adapter does not allocate a federal seat to a state district.
`profileFor(personId)` takes a canonical ID from the release. Its `blocks` expose
identity, votes, interests, ties, pay, expenses, portrait and party receipts, each
with `status`, `data`, `asAt`, `sources`, `stale`, `savedAt` and an optional error.
Optional failures keep the other blocks readable. An absent voting `_meta` means
an unknown date. State profiles retain historical federal pay when `pay.pid` matches
the identity's numeric legacy ID. Ties come from the member's register, including
lobbyist/FITS entries and all declared rows grouped by organisation. Portraits expose licence/credit
and a `display` permission status; official APH and unsupported Commons terms
require native-use review. Exact full-name photo keys take priority over folded
apostrophes; surname roster stubs never enter profile catalog lookups. Neither
photo catalog supplies an as-at date.

**Daily edition (W13).** `todayEdition()` reads `GET /api/app/v1/edition/latest`
(`editionPath` in `policy.ts`; `today` and exact dates are not allowed) through the
same client and cache as the catalogs: fresh for its max-age, then a saved copy
stays readable offline and is marked stale. A 404 (no posted edition) is
authoritative absence: the read opts into `absence` on `ApiClient.get`, so the
Worker's 404 body is decoded (`decodeEditionRead`) and saved in the edition's
place with its own time and max-age. The block is `missing` and the card absent,
then and after a relaunch or offline, until a later 200 replaces it. Any other
404 body is unreadable data; other routes still treat a 404 as not found.
`decodeEdition` is strict: the envelope and edition refuse any key the contract
does not name, the link must be an `https://opax.com.au` member, bill, grants or
report page, and slides keep their stored type-specific fields while the reader's
own rules (type, kicker, title, alt; cover first, source last; 3 to 10) are checked.
`editionFor` keeps the post's text verbatim as plain text, dropping only its link
line and a title clipped with "…" (both shown in full on the card). A bill edition
is labelled machine-written with its own attribution: the summary slide's stored
note (the web's bill-page wording), else the caption's "Machine-written…" line,
else the web's "Written by a model from the explanatory memorandum; not the
record." Other kinds are labelled only when the edition says so. `created_at`
and a link fragment follow the Worker's own looser rules (the card shows neither). The card
(`src/features/EditionCard.tsx`) shows the kind and date, title, attribution, text,
the closing slide's source rows, a "Read the …" link that opens the page on the web
through `webPageUrl`/`openOnWeb` on the build's own origin, and an as-at line.

Use `billsFor(filters)`, `billFor(key)`, `today()`, `about()`, `suggestions(query)`
and `search(query, kind)` for the remaining P0 blocks. Load `suggestionSources()`
once on screen entry; `suggestions()` then matches that snapshot locally while
typing. Reload explicitly with `suggestionSources(true)` when refreshing. Bill summaries retain their
stored attribution; speeches carry “Machine brief”; duplicate divisions collapse
using the web's pure logic, with `collapsed` and the original `rawRows` available.
Search kinds are only `person`, `interest`, `pay`, `expense`; Ask-linked pay rows
are excluded and register alterations resolve to a member slug. Pure selectors and
branded ID parsers are also exported from `src/api/catalogs.ts` for already loaded data.
OPAX record/party links are relative web paths: resolve them using the build-config
origin when opening. E2E displays links locally and never opens production.

The fixture pins 44 complete files (6,816,022 bytes), including whole-site votes,
pay, expenses and money. `fixture-snapshot.json` records every size and hash;
42 files are served. Its `testOnlyFiles` retain the money graph and donor ties
for decoder/parity tests while their retired GET routes remain denied.
Interest-detail search covers twelve pinned members; the recent feed, pay and
expenses are complete. Local search does not reproduce production ranking.
The tests compare pay, vote, expense and bill transforms to the original web
functions, and resolve all 354 current canonical people in the pinned release.
The profile sweep compares portrait, votes, interests, pay and expenses statuses
against both round-1 commits on those same bytes. State profiles require a matching
numeric ID for federal pay; ID-less federal pay records still join by name.

One API response is pinned beside the catalogs: `responses` in
`fixture-snapshot.json` records the W13 edition fetched once from production
(`scripts/fixtures/edition-latest.json`, its SHA-256, size, fetch time and the
reader code it was checked against). The fixture serves those exact bytes with the
Worker's validators (weak `W/"<sha256>"`; weak, strong, listed or `*` matches give
304); prettier ignores the folder so the bytes never change. `OPAX_FIXTURE_EDITION`
picks the journal: `absent` answers as the Worker does when none is posted (404
`edition_not_published`), and `withdrawn` serves the edition until the app
revalidates it (a pull to refresh), then 404s from then on. Run each edition
variant on its own, by path:
`OPAX_FIXTURE_EDITION=absent scripts/e2e.sh <udid> .maestro/13b-today-no-edition.yaml`
and
`OPAX_FIXTURE_EDITION=withdrawn scripts/e2e.sh <udid> .maestro/13c-today-edition-withdrawn.yaml`.
The `13` shorthand runs only `13-today.yaml`. To repin, fetch the route once and
update the file, hash, size and fetch time together.

Fixture startup and tests read git blobs at `fixture-snapshot.json`'s `sourceCommit`,
then verify SHA-256 and byte size; worktree/nightly catalog changes cannot alter
the pinned journeys. Keep that commit in the local git object database. To repin
deliberately, review a new local commit, set `sourceCommit`, and recompute **every**
existing path's hash and size from `git show <commit>:portal/public<path>`
(`shasum -a 256` and `wc -c`), adding complete reviewed files as needed. Run `npm run qa`.
The small party-label/alias lookup in `src/api/party-transforms.ts` is projected
from the pinned money graph and parity-tested against the web's URL rule; refresh
it when repinning that source. A drift test checks party labels/aliases in both
the pinned and local graph, plus the pinned date, and fails with these repin
instructions on drift. A date-only local regeneration stays green.
Profiles fetch neither the money graph nor the donor
ties index. State vote samples link their published `/votes.json` with an explicit
OPAX label. Bill rows/details expose `introducedLabel` (Released for exposure
drafts), normalized sponsors/portfolios/parties and readable source labels.

The full-data parity sweeps run in `tests/parity-sweep.ts` as an isolated Node
process under Jest, keeping their web reference VM allocations outside the suite runner.
`tests/profile-sweep.ts` similarly isolates the 354-member status comparisons.
Surname person pages use the release's unique current ID holder (or sole historical
holder); incompatible roster representations are refused, including the shared
David/Dorinda Cox ID. Roster-only register results such as Mark Furner retain their
directory link without inventing a canonical release ID.
