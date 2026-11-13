# Opax analytics

GA4 property: [Opax — opax.com.au (553404458)](https://analytics.google.com/analytics/web/?authuser=1#/a136135810p553404458/reports/intelligenthome), under the Noice account.
Web stream `15743497973`, measurement ID `G-EGY7Y5VTEQ`.
GTM container `GTM-PNDM87LW` delivers `https://opax.com.au/ga.js?v=20260909-1`
on Initialization — All Pages, using a Custom HTML tag containing only the
external script element. The adapter is audited and built in this repository.
Do not add a second Google tag or enable enhanced measurement: the adapter
configures GA and manually forwards page views and the allowlisted events.
The older Opax AI property (opax.ai) is a separate product and is not used.

PostHog project: [Opax (507367)](https://us.posthog.com/project/507367).
Reporting timezone: Australia/Melbourne. The project token in
`portal/analytics/index.js` is public and write-only, never a personal API key.

The browser sends events through `https://opax.com.au/ingest/` on the existing
`opax-portal` Worker. `src/posthog.ts` routes ingestion to `us.i.posthog.com` and
`/static/*` and `/array/*` to `us-assets.i.posthog.com`. Destinations are fixed;
site cookies, Authorization, referrers and upstream Set-Cookie are not forwarded.
Cross-origin browser submissions are rejected; redirects are not followed;
ingestion responses are never cached. The frontend SDK is bundled locally,
so the existing self-only script/connect CSP requires no extra host exceptions.

`analytics/events.js` is the shared privacy boundary. All `opax:analytics`
producers, including async outcomes, pass through `cleanEvent` before delivery
to the Google dataLayer (nested `opax` properties) and `opax:measured` consumers.
PostHog works independently of GTM. GA replays the first 100 buffered events
if its adapter arrives late, then subscribes once. Initial visits and SPA path
changes produce one view; query-only focus/filter/step changes do not inflate
page views. Search activity is represented by its explicit lifecycle events.
GA uses `page_view`; PostHog uses `$pageview`. Both receive page context and the
same explicit custom event names. GA page title is fixed and referrers are
query-free internal paths. Google signals and advertising personalization are off.

| Event | Meaning |
| --- | --- |
| `$pageview`, `$pageleave` | Initial visit, SPA route changes, session duration |
| `opax_ask`, `opax_search` | Ask/search form submission |
| `opax_ask_started`, `opax_ask_completed`, `opax_ask_failed` | Full answer lifecycle, including streamed answers and fallbacks; duration, source count, cancellation |
| `opax_search_started`, `opax_search_completed`, `opax_search_failed` | Search lifecycle; duration, page, filter count and result counts |
| `opax_source_open` | Open an original record |
| `opax_chip` | Select a suggested question/search |
| `opax_game_open` | Open an exploration tool |
| `opax_outbound` | External hostname, placement, and fixed partner identifier for footer links |
| `opax_money_view` | Select connections, receipts, contracts or grants |
| `opax_journey` | Open, select focus, play, pause, step, reach final step, exit; lens and step counts only |
| `opax_map_action` | Apply filters, open records, focus a record or export connections; no selected names |
| `opax_community_open` | Follow a public link to community; navigation/footer placement |
| `opax_download`, `opax_export` | Download a resource/export; export format and row count |

No raw questions, search strings, answers, titles, postcodes, or errors are sent.
URLs have query strings and fragments removed, including legacy hash routes.
Only explicitly allowed categories and counts are accepted. SDK referrer, initial
URL, search and person-property enrichment is removed before send. Of the
campaign parameters, only `utm_source`, `utm_medium` and `utm_campaign` are kept,
and only when each is a plain slug (letters, digits, `_ . -`, up to 40
characters), so the tags on Opax's own social links show which channel a visit
came from (Instagram and Facebook often send no referrer). `utm_content`,
`utm_term`, click ids and any free-form value are dropped (since 2026-09-26).
PostHog's `$session_entry_*` copies follow the same rule (entry pathname through
the same path allowlist), every ad click id posthog-js collects (`igshid`,
`ttclid`, `li_fat_id`, `gad_source`, `gbraid`, …) is dropped, and so is any
`title` property: until 2026-09-26 an unprefixed `title` carrying the page
title (which names a reader's search, "Search: … · OPAX") reached PostHog.
There are no accounts to identify; anonymous IDs support session/funnel analysis,
but person profiles are disabled. Do Not Track is respected and IP capture is
disabled. Session replay, generic DOM autocapture, exception text capture, surveys
and remote feature flags are disabled to keep private questions out of telemetry.
The shared event allowlist and Do Not Track gate apply to both systems. GA4
Enhanced Measurement is disabled at the stream level so automatic search,
form, history and outbound events cannot bypass the allowlist. Community
pages continue to load no analytics: sign-in, accounts and private reading
activity are not instrumented.

Capture is enabled only on `opax.com.au` and `www.opax.com.au`. Local development
and workers.dev previews do not send production analytics.

## iOS and Android app

From 1.1.1 the iOS app sends anonymous product analytics to the same PostHog
project, through the same `https://opax.com.au/ingest` proxy (native requests
carry no `Origin`, which the proxy already accepts). The SDK is
`posthog-react-native`, pinned to an exact version, with its native crash
plugin `@posthog/react-native-plugin` (see "Crash and error reports" below).
The token and host live in build config (`mobile/app.config.ts`,
`extra.analytics`), never in `src/`. Only iOS production builds carry that
config. Development and e2e builds never do, even with `OPAX_ANALYTICS=1`.
The runtime also refuses to create a client when `__DEV__` or Expo debug mode
is true, when the execution environment is `storeClient`, when the
variant or analytics environment is not production, or when the build number
is missing, zero, invalid or inconsistent between `extra.appBuild` and the
platform config. iOS also checks the native binary's immutable CFBundleVersion
from the existing Expo Constants module, including missing or zero values;
SDK 57 exposes only embedded config for Android. This also blocks lifecycle
events, not just explicit events.

The cause of the observed build "0" traffic could not be confirmed from the
anonymous data. The paths now closed are the old `OPAX_ANALYTICS=1` development
opt-in, debug JS (`__DEV__`), Expo debug mode and `storeClient` execution,
development/e2e or unknown variants, non-production analytics config, and
missing, zero, invalid or mismatched configured/native build numbers. These
are preventive gates, not a confirmed explanation of that historical traffic.
`expo-dev-launcher` is not installed; there is no launcher module probe or
native-module grant.

Android stays off until its Google Play Data safety answers include analytics.
Instrumentation and runtime gates are
shared and tested for both iOS and Android; this lane does not enable Android
ingestion or change Play Console answers.

`mobile/src/analytics/events.ts` is the app's boundary, the counterpart of
`analytics/events.js`. `cleanEvent` checks what app code asks to send; the
SDK's `before_send` runs `scrubEvent`, which drops every event not listed below
and rebuilds each payload from fixed lists, so SDK enrichment (deep-link URLs,
screen sizes, locale, device name, flags, person and super properties) never
leaves the phone. Every event carries `platform` (`ios`, or `android` once enabled), `app` (`opax`),
`app_version`, `app_build` and `environment`, with `$process_person_profile`
false and `$geoip_disable` true.

| Event | Properties |
| --- | --- |
| `$screen` | `$screen_name`: the route template (`/person/[slug]`), never a parameter value |
| `Application Installed`, `Application Opened`, `Application Became Active`, `Application Backgrounded` | none beyond the common set |
| `Application Updated` | `previous_version`, `previous_build` |
| `opax_ask_started` | `from_section`, `follow_up` |
| `opax_ask_completed` | `from_section`, `follow_up`, `duration_ms`, `source_count`, `has_answer`, optional `reason` |
| `opax_ask_failed` | `from_section`, `follow_up`, `duration_ms`, `cancelled`, optional `reason` |
| `opax_search_started` | `scope`, `page`, `filter_count` |
| `opax_search_completed` | `scope`, `page`, `result_count`, `total_count`, `duration_ms` |
| `opax_search_failed` | `scope`, `page`, `duration_ms` |
| `opax_source_open` | `from_section`, `destination` (`app` or `browser`) |
| `opax_chip` | `chip_kind` (`ask`), `placement` (`ask` or `today`) |
| `opax_voice_card` | `action` (`open`), `account` (`signed_in` or `signed_out`) |
| `opax_first_run` | `step` (`welcome`, `seat` or `state`), `outcome` (`chosen` or `skipped`), and for a choice `method` (`search`, `location` or `browse`) |
| `opax_route_error` | `error_class`: fixed constructor-name category; `route_pattern`: a fixed route-file pattern such as `/person/[slug]`; optional `error_message`: an exact, content-free diagnostic from a fixed allowlist, at most 80 characters |
| `opax_app_start` | `duration_ms`: JS entry to the first committed Today render, only when Today is the first focused route of a cold JS runtime |
| `opax_screen_ready` | `route_pattern`: one of `/`, `/person/[slug]`, `/bill/[key]`, `/your-mp`, `/search`, `/ask`; `duration_ms`: navigation to the first content commit, at most once per sampled visit |

`from_section` is the first segment of the current route (`today` for the
home screen); anything else becomes `other`. `scope` is one of the fixed search
scopes. Counts are integers from 0 to 1,000,000 and durations are milliseconds
up to an hour; any other value is dropped. Ask outcome `reason` accepts only
`stall`, `deadline`, `network`, `server` or
`no_answer`. Completions with blank answer text use `has_answer: false`
and `reason: no_answer`. Written `evidence_gap` answers retain `has_answer: true`
and omit that reason. Cancellations omit the reason. Automatic transport recovery shares one lifecycle event pair.
The app never calls identify.
Person profiles, session replay, touch and text autocapture, console capture, surveys and feature flags
are off, and GeoIP is disabled. Crash and error reports are on (below). The install ID is a random UUID made by the SDK and kept in the
app's documents folder; it is not the IDFV or IDFA and is not linked to an
account. `tests/analytics-sdk.test.ts` runs the real SDK against a mocked
network and proves a raw question cannot reach any request.

`opax_first_run` reports how the welcome's electorate step ended, so the
first-run funnel can tell a choice from a skip (the `$screen` names alone
cannot: both end on `/`). It is sent once when a reader leaves the welcome
from the welcome page (`welcome`), the electorate step (`seat`) or a Browse by
state list (`state`), by choosing a seat (`chosen`) or by "Not now" or
"Choose later" (`skipped`). `method` is the control that chose: the search
field, the "Use my location" row or a Browse list. All three are fixed words.
The seat, the state, anything typed (a name, a suburb, a postcode), the
location permission answer and any position are never sent, and a refused or
failed locate sends nothing. The `/seat` sheet opened later from Today or
Your MP sends nothing, and neither does "Done" on a replayed welcome with a
seat saved. A replayed welcome that ends in a new choice or a skip does send
the event; replays are rare and cannot be told apart without a new property.

The first-run screens keep their `$screen` names, so funnels built before
this event still compare: `/welcome`, `/welcome/seat`,
`/welcome/seat/state/[code]`, then `/`. `/consent` is Ask's "Before you ask"
screen, shown before a reader's first question; it is not part of first run
and the app has no analytics consent step.

`opax_route_error` reports once for each error caught by the reporting route
boundary, including a new failure after Try again. It uses `track`, the same
build-config gate (`extra.analytics`) and both privacy scrubbers; there is no
separate analytics consent setting in the app. Voice consent does not enable
analytics. Android, e2e and all development builds send no report. No
identify call or new identifier is added. The same error also goes out once
as a crash and error report (below).

`error_class` accepts the built-in Error constructors, `ApiError`,
`PersonIdentityError`, `ChatSyncError` and `AskFailure`; unknown constructors
become `other`. The report never reads `error.name`, stack or cause. It reads
message only through `scrubErrorMessage`: exact messages such as "Network
request failed" can pass; unknown, long or interpolated messages are dropped
entirely. Truncating or redacting arbitrary prose cannot reliably remove names
or user text. The same fixed message allowlist and 80-character ceiling run
in both privacy scrubbers. The fallback never displays the error text.

Patterns must match the fixed list in `mobile/src/analytics/route-patterns.ts`,
checked against route files by a regression test. Expo Router segments supply
the pattern; pathnames, parameters, slugs, names, questions, answers and other
free text are never supplied. Unknown patterns become `/other`. The usual
anonymous SDK ID, privacy flags and common build metadata still apply.

Reporting is wired to the root layout, tab container, all five tab stacks
(the shared array layout), nested Filters and Conversations layouts, and the
Account, Talk, Community and Licence modal stacks through
`mobile/src/navigation/RouteErrorBoundary.tsx`. It keeps the existing error
screen and Try again action. A successful retry followed by a new failure
can report again. These are recoverable JavaScript route render failures;
native process crashes and asynchronous exceptions are not captured by
Router boundaries; the crash and error reports below cover them. OS
terminations (memory, watchdog) are not reported.

`mobile/index.js` timestamps the start of JS entry evaluation before importing
Router. `opax_app_start` ends at Today's first focused React commit, even if
Today is still showing its loading state. It sends only when Today is the
launch's first focused route. It is a JS cold-start measurement, not native
process launch time, splash-dismissal time or a warm foreground measurement.
A launch into any other tab or detail route is marked spent without sending;
opening Today later cannot turn reading or navigation time into cold-start
latency. A preloaded Today behind another focused route does not send either.

Screen timing uses cheap monotonic JS timestamps (Date.now only as a fallback).
The root navigation state notification supplies the start; on initial mount
or when a notification is unavailable, the first screen render supplies it.
A retained screen starts a fresh visit when it gains focus. The end is the
first committed content or terminal empty/error state: Today's launch/seat
read has settled, person profile and bill record reads have settled, Your MP
has read its seat and primary representative block. Search waits for a
positive-sized layout of its rendered content (the idle Browse list on a
plain visit, or the initial content for a linked search). The scroll viewport
mounting or laying out alone does not count. Ask waits for both a positive
composer layout and a positive-sized layout of its idle or conversation
content. These layout callbacks measure content readiness rather than screen
mount, and do not claim that the pixels have reached the display. Background
block refreshes and Ask/search request latency remain separate from screen
readiness. Embedded iPad detail panes do
not create screen visits.

`SCREEN_READY_SAMPLE_RATE` in `mobile/src/analytics/timing.ts` is 0.1 (10%).
It is chosen once per visit, kept only in memory, and does not add an identifier
or persist a reader cohort. Each sampled visit sends at most one ready event;
rerenders, refreshes and effect replay do not add events. Cold-start timing is
one event per runtime and is not sampled. Timing events accept only the fixed
route templates and finite durations from 0 to 3,600,000 ms; SDK screen context
is removed. They use the same build gate and both privacy scrubbers as all
other events, with no new modules, consent settings or text collection.

### Crash and error reports

iOS production builds also send anonymous crash and error reports as PostHog
`$exception` events, behind the same build gate as every other event:
development, e2e, fixture and Android builds send none, and the app has no
analytics opt-out to honour. They appear in PostHog Error tracking once the
project setting "Enable exception autocapture" is on; until then the SDK
captures nothing automatically.

- **JS errors.** Uncaught exceptions (the `ErrorUtils` global handler) and
  unhandled promise rejections (Hermes' rejection tracker), through the SDK's
  `errorTracking.autocapture`. Console capture is off (`console: []`) and
  breadcrumbs (`exceptionSteps`) are off.
- **Route render errors.** React does not pass an error a boundary caught to
  the global handler in release builds, so `reportRouteError` sends it once
  with `captureException`, beside `opax_route_error`.
- **Native crashes.** `@posthog/react-native-plugin` 2.13.0 (posthog-ios
  3.92.7 with PLCrashReporter, posthog-android 3.74.2) with `nativeCrashes`
  and `androidNdkCrashes` on. A crash is written to disk and sent on the next
  launch. Push notification capture, which the plugin turns on by default, is
  off in the options and in Info.plist
  (`com.posthog.posthog.CAPTURE_PUSH_NOTIFICATION_OPENED`).

The native SDK never sees the app's other PostHog settings: posthog-react-native
passes it only its own options, with feature flag preloading on whenever native
crash capture is. The plugin patch fixes them after that: no feature flag
requests, no default person properties and, on iOS, GeoIP off (posthog-android
has no GeoIP switch and sends no flags request). At launch the native SDK makes
one request of its own, a GET of PostHog's remote config
(`/ingest/array/<project token>/config`) carrying no body, install ID or session
ID; it cannot be turned off in posthog-ios 3.92.7 or posthog-android 3.74.2, and
with preloading off nothing in it starts a flags request. Its answer includes
the "Enable exception autocapture" setting. The `/ingest` proxy forwards it
with the phone's IP address, as it does the app's own analytics requests.
The plugin podspec is patched to require exactly posthog-ios 3.92.7, the
version these settings and the release verifier were checked against.

`scrubEvent` rebuilds every JS `$exception` from fixed lists in
`mobile/src/analytics/exceptions.ts`. Native crash reports never pass through
JS, so `mobile/patches/@posthog+react-native-plugin+2.13.0.patch` (pinned by
`patches/privacy-patches.json`, replayed on install and prebuild) adds the same
rules in Swift and Kotlin as the native SDK's last `beforeSend`, and drops every
native event that is not `$exception`. The three copies must stay in step:
`tests/analytics-exceptions.test.ts` checks that Swift and Kotlin use the JS
message rules' exact pattern texts, and `tests/native-scrub.test.ts` runs the
Swift copy, cut from the patch by `scripts/check-native-scrub.sh`, on the
invented inputs in `tests/fixtures/exception-scrub-cases.json` and expects what
JS keeps (skipped where `swift` is missing). Kotlin is compiled only by the
Android build, but Android's `java.util.regex` runs on ICU like
NSRegularExpression, so the same pattern texts behave the same.

| Property | What it may hold |
| --- | --- |
| `$exception_list` | Up to 10 exceptions: `type` (an identifier such as `TypeError`, `java.lang.IllegalStateException` or `EXC_BAD_ACCESS`, or one of Swift's three fatal kinds; anything else becomes `Error`), `value` (the scrubbed message), `module`, `thread_id`, `mechanism` (`type`, `handled`, `synthetic`, `exception_id`, `parent_id`) and `stacktrace` (`type` and up to 250 frames) |
| Stack frames | `platform`, `function`, `filename`, `abs_path`, `module`, `package` (paths cut at the first `?` or `#`), `lineno`, `colno`, `in_app`, `instruction_addr`, `image_addr`, `symbol_addr`, `chunk_id`, `map_id`, `method_synthetic`, `client_resolved`. Source context, local variables and any other field are dropped |
| `$debug_images` | Up to 500 binary images native frames point into: `type`, `debug_id`, `code_id`, `code_file`, `image_addr`, `image_vmaddr`, `image_size`, `arch` |
| `$exception_level`, `$exception_source`, `$exception_fingerprint` | A fixed level word and short tokens |
| Common | `$lib`, `$lib_version`, `$session_id`, `$os_name`, `$device_type`, `$app_name`, `$app_namespace` (`au.com.opax.app`), `$app_version`, `$app_build`, `$screen_name` (the route template), `platform`, `app`, `app_version`, `app_build`, `environment`, `$process_person_profile` false, `$is_identified` false, `$geoip_disable` true |

Messages keep their shape but lose anything that could be user text, in this
order: spaces the engines disagree on (U+0085, U+FEFF and U+001C to U+001F)
become plain spaces, so all three copies cut the same text; a URL loses its
user name and password; an OPAX URL (`opax.com.au` or a subdomain, with or
without a scheme or a trailing dot) keeps only its host, since its paths can
carry a search or question; a path with no host in front keeps only its first
segment, or `/api/<endpoint>` for the API (`/ask/why-is-rent-late?x=1` becomes
`/ask`, `/api/search/rent` becomes `/api/search`), except a file path under a
filesystem root such as `/src`, `/node_modules`, `/Users`, `/private`, `/var`
or `/data`, which stays whole so stack locations stay readable; any other URL
or path keeps its path, losing its query string and fragment; any other
`?key=value` query goes; email addresses become `[email]`; quoted text becomes
`[redacted]`, across lines: double quotes, curly, German and fullwidth quotes,
guillemets, corner brackets, double primes, backticks and the opening single
quotes ‘ ‚ ‛ wherever they open (`x"text"` included), and ' ’ ＇ and primes
after a space or punctuation, where an apostrophe followed by a letter
(`O'Brien`, `it's`) does not close the quote; a quote that never closes hides
the rest of the message; runs of four or more digits (codes, postcodes, phone
numbers) become `#`; the result is cut to 120 characters. So `Cannot read
property 'wombat crossing' of undefined` is sent as `Cannot read property
[redacted] of undefined`. Unquoted
free text cannot be recognised in general, which is why the cap is short.
`$exception_steps`, app state, screen sizes, locale, device model, `$set` and
any property a caller adds are dropped. `tests/analytics-exceptions.test.ts`
plants an invented search, question, Talk transcript, sign-in email and code
and a field value in every position a message, frame, image or SDK property
could carry them and fails if any reaches the payload;
`tests/analytics-sdk.test.ts` runs the real SDK's handlers end to end.

**Symbols.** Production bundles carry PostHog's chunk ID
(`mobile/metro.config.js`), which JS frames report. Every release archive
writes the composed Hermes source map and the chunk ID beside it, in the
release evidence folder (`main.jsbundle.map`, `ios.chunk-id`; see
`IOS-RELEASE.md`), and the verifier refuses an archive without them or with a
map inside the app. `scripts/release-ios.sh` then runs
`scripts/upload-crash-symbols.sh`, which uploads that map and the archive's
dSYMs with `posthog-cli` (0.20 or later). It needs a
personal API key with the `error_tracking:write` scope in
`POSTHOG_CLI_API_KEY`; without one it logs a single skip line. The key is
redacted from release logs and never reaches a build step. Releases resolve
per event from `$app_namespace`, `$app_version` and `$app_build`. For Android
the script also uploads the R8 mapping under posthog-android's map ID
(`au.com.opax.app@<versionName>+<versionCode>`); it is not wired into
`build-play.sh` while Android sends nothing. Gradle writes the Android map to
`android/app/build/generated/sourcemaps/react/release/index.android.bundle.map`,
and `verify-play.py` refuses any `.map` in the AAB.

The privacy manifest declares Product Interaction and Device ID, not linked,
not used for tracking, purpose Analytics, and Crash Data and Other Diagnostic
Data, not linked, not used for tracking, purpose App Functionality;
`NSPrivacyTracking` stays false. The App Store privacy label is in
`IOS-STORE.md` section 4.

## Build, test, deploy

From `portal/`:

```sh
npm ci
npm run build:analytics
node ../scripts/stamp_assets.mjs
node --test test/analytics.test.mjs test/posthog-proxy.test.mjs
npm run check
npm run deploy
```

Node 22.18+ is needed for the proxy test's native TypeScript stripping. For
`npm run check`, `.dev.vars` must contain the existing `ARAG_KB_ID` and
`ARAG_KB_TOKEN` names (placeholders suffice for type checking, not API use).
`npm run deploy` rebuilds analytics and stamps all entry assets. Never deploy
an unstamped shell. Runtime ARAG secrets remain on the Worker.

Verify a normal browser visit in PostHog Activity: `$pageview` should have
`app=opax`, `environment=production`, and a query-free `$current_url`. Click to
another section, then back: each navigation should add one view. Network traffic
should go to `/ingest/i/v0/e/` (or `/ingest/e/`), with no direct PostHog host.
Search and ask completion/failure events should appear after the corresponding
operation finishes. A useful funnel is pageview → search completed → source open;
for answers use ask started → ask completed, excluding cancelled failures.

## Partner attribution and reports

The Progress Agentic RAG and CorpusKit footer URLs contain
`utm_source=opax&utm_medium=referral&utm_campaign=powered_by&utm_content=footer`.
Their receiving sites can attribute these referrals; Opax records an outbound
click with `partner=progress_agentic_rag` or `partner=corpuskit` and
`placement=footer`. A click does not imply a conversion on the other site.

Use GA event-scoped dimensions `page_section`, `action`, `lens`, `partner` and
`placement` to break down flows. Ask/search outcomes include durations and
counts without question text. For journeys, filter `opax_journey` by action:
`opened` → `focus_selected` → `played` → `completed`; completion means reaching
the last step, including manual navigation. Individual users may replay a guide.

The PostHog dashboard's former generic autocapture funnel is replaced with
`opax_search_completed` → `opax_source_open`. Other useful comparisons are
`opax_ask_started` → `opax_ask_completed` and outbound clicks grouped by partner.

When changing the GA adapter, rebuild `public/ga.js` and update the GTM loader
query version after deploying the tested file. Never paste a Google tracking
snippet into the page shell in addition to this tag.
