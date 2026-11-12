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
`posthog-react-native`, pinned to an exact version with no native modules.
The token and host live in build config (`mobile/app.config.ts`,
`extra.analytics`), never in `src/`. Only iOS production builds carry that
config. Development and e2e builds never do, even with `OPAX_ANALYTICS=1`.
The runtime also refuses to create a client when `__DEV__` or Expo debug mode
is true, when running in Expo Go or a dev client (`storeClient` or the existing
`EXDevLauncher` module, including a client reporting `bare`), when the
variant or analytics environment is not production, or when the build number
is missing, zero, invalid or inconsistent between `extra.appBuild` and the
platform config. iOS also checks the native binary's immutable CFBundleVersion
from the existing Expo Constants module, including missing or zero values;
SDK 57 exposes only embedded config for Android. This also blocks lifecycle
events, not just explicit events.
The old development opt-in and config-only runtime check could admit build-0
traffic; both paths are now closed. Android stays off until its Google Play
Data safety answers include analytics. Instrumentation and runtime gates are
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
| `opax_ask_completed` | `from_section`, `follow_up`, `duration_ms`, `source_count`, `has_answer` |
| `opax_ask_failed` | `from_section`, `follow_up`, `duration_ms`, `cancelled` |
| `opax_search_started` | `scope`, `page`, `filter_count` |
| `opax_search_completed` | `scope`, `page`, `result_count`, `total_count`, `duration_ms` |
| `opax_search_failed` | `scope`, `page`, `duration_ms` |
| `opax_source_open` | `from_section`, `destination` (`app` or `browser`) |
| `opax_chip` | `chip_kind` (`ask`), `placement` (`ask` or `today`) |
| `opax_voice_card` | `action` (`open`), `account` (`signed_in` or `signed_out`) |
| `opax_route_error` | `error_class`: fixed constructor-name category; `route_pattern`: a fixed route-file pattern such as `/person/[slug]`; optional `error_message`: an exact, content-free diagnostic from a fixed allowlist, at most 80 characters |
| `opax_app_start` | `duration_ms`: JS entry to the first committed Today render, only when Today is the first focused route of a cold JS runtime |
| `opax_screen_ready` | `route_pattern`: one of `/`, `/person/[slug]`, `/bill/[key]`, `/your-mp`, `/search`, `/ask`; `duration_ms`: navigation to the first content commit, at most once per sampled visit |

`from_section` is the first segment of the current route (`today` for the
home screen); anything else becomes `other`. `scope` is one of the fixed search
scopes. Counts are integers from 0 to 1,000,000 and durations are milliseconds
up to an hour; any other value is dropped. The app never calls identify.
Person profiles, session replay, touch and text autocapture, exception capture, surveys and feature flags
are off, and GeoIP is disabled. The install ID is a random UUID made by the SDK and kept in the
app's documents folder; it is not the IDFV or IDFA and is not linked to an
account. `tests/analytics-sdk.test.ts` runs the real SDK against a mocked
network and proves a raw question cannot reach any request.

`opax_route_error` reports once for each error caught by the reporting route
boundary, including a new failure after Try again. It uses `track`, the same
build-config gate (`extra.analytics`) and both privacy scrubbers; there is no
separate analytics consent setting in the app. Voice consent does not enable
analytics. Android, e2e and all development builds send no report. No
identify call, exception autocapture or new identifier is added.

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
native process crashes, asynchronous exceptions and OS terminations are not
captured by Router boundaries. Exception autocapture remains disabled.

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
has read its seat and primary representative block, or Search's Browse and
Ask's composer have mounted. Background block refreshes and Ask/search request
latency remain separate from screen readiness. Embedded iPad detail panes do
not create screen visits.

`SCREEN_READY_SAMPLE_RATE` in `mobile/src/analytics/timing.ts` is 0.1 (10%).
It is chosen once per visit, kept only in memory, and does not add an identifier
or persist a reader cohort. Each sampled visit sends at most one ready event;
rerenders, refreshes and effect replay do not add events. Cold-start timing is
one event per runtime and is not sampled. Timing events accept only the fixed
route templates and finite durations from 0 to 3,600,000 ms; SDK screen context
is removed. They use the same build gate and both privacy scrubbers as all
other events, with no new modules, consent settings or text collection.

The privacy manifest declares Product Interaction and Device ID, not linked,
not used for tracking, purpose Analytics; `NSPrivacyTracking` stays false. The
App Store privacy label is in `IOS-STORE.md` section 4.

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
