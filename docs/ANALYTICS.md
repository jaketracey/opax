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
URL, campaign, search and person-property enrichment is removed before send.
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
