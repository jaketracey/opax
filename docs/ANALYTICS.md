# Opax analytics

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

`events.js` emits shared interaction events to the existing Google dataLayer and
to PostHog independently of whether Google Tag Manager loads. Analytics initializes
before the event emitter; route events are deduplicated by the actual route.

| Event | Meaning |
| --- | --- |
| `$pageview`, `$pageleave` | Initial visit, SPA route changes, session duration |
| `opax_ask`, `opax_search` | Ask/search form submission |
| `opax_ask_started`, `opax_ask_completed`, `opax_ask_failed` | Full answer lifecycle, including streamed answers and fallbacks; duration, source count, cancellation |
| `opax_search_started`, `opax_search_completed`, `opax_search_failed` | Search lifecycle; duration, page, filter count and result counts |
| `opax_source_open` | Open an original record |
| `opax_chip` | Select a suggested question/search |
| `opax_game_open` | Open an exploration tool |
| `opax_outbound` | Follow an external source (hostname only) |
| `opax_download`, `opax_export` | Download a resource/export; export format and row count |

No raw questions, search strings, answers, titles, postcodes, or errors are sent.
URLs have query strings and fragments removed, including legacy hash routes.
Only explicitly allowed categories and counts are accepted. SDK referrer, initial
URL, campaign, search and person-property enrichment is removed before send.
There are no accounts to identify; anonymous IDs support session/funnel analysis,
but person profiles are disabled. Do Not Track is respected and IP capture is
disabled. Session replay, generic DOM autocapture, exception text capture, surveys
and remote feature flags are disabled to keep private questions out of telemetry.
This policy applies to PostHog; existing third-party GTM tags remain independently
configured in the GTM console.

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
