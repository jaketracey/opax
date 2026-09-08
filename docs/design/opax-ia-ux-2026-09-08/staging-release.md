# Staging redesign review — 8 September 2026

The user approved implementation and asked for the 3D map to be a central research and storytelling surface, then requested deployment specifically to staging.opax.com.au. This supersedes the proposal's more restrained map placement. Production is not part of this release.

## Implemented

- Shared desktop/mobile navigation: Ask & search, Topics, People & organisations, Money, Bills, Reports; About and supporting tools.
- Explicit Ask / Find records modes, task entry links, larger homepage map and guided journey entry points.
- Money area navigation: 3D connections, Political receipts, Government contracts, Grants. Legacy ledger/grants links redirect to regular pages.
- The map starts immediately beneath a compact toolbar. Jurisdiction uses a select; filters and guided journeys use menus. Records, totals and export open below the map. The map key and source coverage are collapsed.
- Combined map filters for name, record type, industry, recipient party and minimum connection value. The existing financial-year controls recalculate records; URL parameters preserve research views.
- Matching connections table, separate totals for receipts/contracts/grants, exact dollar amounts in rows, CSV export and copyable map links.
- Existing animated journey engine retained and integrated with manual filtering. Selecting a research filter exits the guided scene. Rendering fallback shares record-type semantics and year-window filtering.
- Ledger now includes donor-to-party receipt edges only. Public awards are excluded from its receipt totals and exports.
- Removed repetitive introductory copy after screenshot feedback. The homepage no longer repeats “Ask a question. Follow the money. Read the record.” beneath its heading. The map section heading and descriptive subheading were also removed entirely.

## Staging deployment

`npm run deploy:staging` in `portal/` builds graph and analytics, stamps cache-sensitive assets and deploys `opax-portal-staging`. Its custom domain is `staging.opax.com.au`; the same Worker is also available at `opax-portal-staging.noicework.workers.dev` while DNS caches expire.

Staging serves this branch's static assets. A Cloudflare service binding routes `/api/*` and generated share images to the existing public production API. It does not clone KB credentials or create a separate research corpus. Staging responses carry `X-Robots-Tag: noindex, nofollow`; robots.txt disallows crawling. Analytics are disabled for staging.

## Validation

- 108 portal automated tests passed; Worker type check, stamped asset check, graph build and staging dry-run passed.
- Live HTTPS 200 on the staging custom hostname using its public DNS address, with certificate validation enabled; `/api/search` returns real results; robots.txt disallows crawling.
- Browser: desktop 3D rendering, receipt + organisation + party filters, matching records, shared URL restoration after reload, public-money journey recipient selection, generated narrative and animated playback.
- Mobile 390px: navigation parity, map controls, political-receipts table, no document horizontal overflow.
- A separate graph TypeScript check reports eight existing strict-index errors in unchanged `graph/explain.ts`. The new map adapter introduces no reported type errors; the esbuild graph build succeeds.

## Review boundaries

This is the first implemented staging slice of the holistic proposal. The source side-reader, deeper topic-page tab redesign and researcher controls inside the standalone `/map` view remain future work. Standalone maps do consume the shared URL's graph filters, but editing those filters is done on `/money`. Entity cards show period totals; the research summary/table/export describe the selected connections. Older exports without yearly cells retain their existing overlap semantics. Record relationships do not establish causation.
