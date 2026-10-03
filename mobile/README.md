# OPAX iOS foundation

Expo SDK 57 / React Native 0.86, strict TypeScript, expo-router. iOS 18.4 is
the minimum. Light mode only; Android is possible later and is not built here.
App identity: OPAX, `au.com.opax.app`, version `0.1.0`, build `1`.
No signing, Apple account, push, analytics, crash reporter or microphone permission.

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
Each build runs prebuild; set `OPAX_CLEAN_PREBUILD=1` for a full regeneration.
Ordinary iterations retain generated Pods so unchanged native headers can reuse
the shared host's compilation cache. Native build concurrency is capped at four.

## QA and build

```sh
cd mobile
scripts/qa.sh
scripts/build-e2e.sh
scripts/e2e.sh <simulator-udid> 01 02 03 04
OPAX_CONTENT_SIZE=accessibility-extra-extra-extra-large scripts/e2e.sh <simulator-udid> 01 03
```

Copy `.qa.local.env.example` to the ignored `.qa.local.env` for optional host
configuration. Scripts source it before running. Never commit actual paths or IDs.

| Variable             | Local purpose                                                                         | When blank                                     |
| -------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------- |
| `OPAX_BUILD_GATE`    | Executable shell script wrapping builds, invoked with lane name and command arguments | Run the command directly, with a notice        |
| `OPAX_SIM_GATE`      | Shell script booting an allowed simulator, invoked with lane name and UDID            | Boot directly, with a notice                   |
| `OPAX_PASTE_LOCK`    | Shared directory lock for Maestro input                                               | Skip locking, with a notice                    |
| `OPAX_CAPACITY_CMD`  | Trusted local shell command checking host capacity                                    | Skip capacity checks, with a notice            |
| `OPAX_ALLOWED_UDIDS` | Space-separated simulator allow-list                                                  | Accept the requested simulator, with a warning |

Configured capacity checks run before builds and devices; a load above 140 waits
for below 100. The e2e runner starts only its own fixture, installs the Release app
without Metro, saves Maestro/screenshots/request logs in ignored `private/qa/<run>/`,
restores text size/appearance, shuts down, then releases the lock on success or
failure. Never commit QA evidence. `OPAX_QA_RUN` names evidence, `OPAX_QA_APP`
selects a prepared app. No audio flows. Journey 04 stops the fixture and checks
saved data without clearing the app. Default runs include 01–04;
`OPAX_VERIFY_OFFLINE=1` also adds 04 to a selected warm run.

The runner samples the selected simulator's app processes with `lsof -a -p <pid> -i`
every nominal 250ms, writing raw `connection-samples.jsonl` and a measured
`connection-audit.json`. Missing process coverage, collection errors or observed
external connections fail. Short connections between samples may be missed; the
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

- Routes live in `src/app/`; feature UI in `src/features/`. The four tabs are
  Today, Your MP, Bills and Search. Add a stack route carrying identifiers only.
  `person/[slug]` corresponds to `/subject/person/<slug>` through
  `src/navigation/routes.ts`; universal links and associated domains are deferred.
  The Talk button opens a sheet from each root screen in the later voice lane; see `src/voice/README.md`.
- Use `src/design/primitives.tsx` and role tokens in `src/design/tokens.ts`.
  Fonts are bundled with OFL notices and upstream hashes. The complete notices
  are embedded in `extra.fontAcknowledgements` for a later About screen.
  The built-app check verifies these notices. Text scaling is on,
  has no multiplier cap, uses iOS Dynamic Type ramps, and has no fixed height or
  line limit. Keep controls at least 44pt, labels wrapping, and sections scrollable.
- Add API contracts/decoders in `src/api/catalogs.ts`, then a reviewed GET path
  in `policy.ts` and a rejection/acceptance test. Use `catalogs` from `runtime.ts`.
  Identity adapters keep canonical IDs and legacy IDs separate. The slug API maps
  **slug to name**. Search record `slug` values are opaque catalog IDs;
  `personSlugForResult` resolves the encoded name/canonical slug from `href`
  through the slug API before navigation. Current seats come from dated electorate
  observations, not last speech year or the roster's historical representation array.
- Cache entries use one disk file per complete origin and URL, with a small
  in-memory metadata index persisted separately. Catalogs have a 40-entry/12 MiB
  budget; no-store search pages have their own 8-entry/1 MiB budget and cannot
  evict catalogs. Oldest validation is evicted within each bucket. Writes serialize
  and use temporary files. Every write re-reads the entry: older source dates or
  responses started before the stored validation are rejected; 304 refreshes need
  the same stored ETag. A rejected response returns the retained observation.
  The v2 layout discards the earlier snapshot cache; system cache storage can also
  be reclaimed by iOS. Offline data is opportunistic, not permanent storage. HTTP freshness
  expires at max-age (capped to one day); no-store search is revalidated on every
  read but retained locally for offline use. `savedAt`, `validatedAt`, `asOf` and
  `stale` are distinct. Transient failures can return stale data; 4xx identity,
  invalid data and forbidden routes do not. Display saved and source dates.
- `scripts/fixture-snapshot.json` pins SHA-256 of exactly the three public files
  needed by these journeys. Startup verifies hashes and freezes bytes in memory.
  To add fixture data, review provenance/cost, add its hash/path to this manifest
  and implement the catalog route from those files. No arbitrary asset serving,
  Worker imports or outbound network. The person search projection matches names
  from these catalogs; it does not reproduce production index ranking. A Host header other than the exact loopback host is rejected. Unknown
  routes/methods/kinds return 404 with `OUTSIDE_ALLOW_LIST`. The documented
  `upgrade` hook is reserved for a later fake voice relay.
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
Remote Image URIs must directly call the imported `remoteImageURI` helper in
`src/api/image-policy.ts`: only `/photos/<catalog-id>.webp` on the configured
origin is allowed. Local `require()` images are allowed. Photo-map decoding and
fixture portrait pins belong to the catalog/portrait lanes; do not widen the image
policy for arbitrary URLs. JS and TS source extensions are all scanned. Raw fetch,
XHR, WebSocket, EventSource, computed global access, file-system downloads and
WebView transports fail lint and static checks. Unknown routes throw **before** cache lookup or networking. Redirects and
cross-origin requests fail closed. Transport belongs exclusively to the API
client; ESLint and the static AST scan enforce this.

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

Today, Your MP and Bills are plain placeholders. Search and the core profile
are deliberately minimal. Full feature screens, licensed postcode lookup,
portrait rights, sign-in, voice, universal links and signing belong to later work.
