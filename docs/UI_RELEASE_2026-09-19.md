# UI release, 19 September 2026

Application commit: `8d33fb51` (main).
Cloudflare Worker: `opax-portal`.
Production version: `a6bd86f3-e529-4a39-a5fb-a12187008fca`.
Origins: https://opax.com.au and https://www.opax.com.au.

## Shipped

- The approved homepage at `/`, with shared site gutters, 40px desktop purpose heading, 68px section padding and 28px Ask/Search top inset.
- Dedicated research at `/ask`, with `view=search` opening Search and legacy `/search` redirects preserving queries and filters.
- Shared controls and compact OPAX navigation, plus a light search disclosure using the existing cross-collection suggestion behaviour.
- Current counts/recent streams and source-backed daily record previews in the new homepage layout.
- [Component language](UI_DESIGN_LANGUAGE.md), [control recipes](UI_CONTROLS.md), [homepage decisions](HOME_PROTOTYPE.md) and [consolidation backlog](UI_COMPONENT_AUDIT.md).

## Deployment

Use the existing OPAX account explicitly when the local Cloudflare login can access multiple accounts. The empty environment selects the top-level production configuration; staging has a separate named environment.

```sh
cd portal
CLOUDFLARE_ACCOUNT_ID=459714503d7cbe9d0b7875e62526628b npm run deploy -- --env ''
```

The account identifier is not a secret. Credentials remain in Wrangler's authenticated session and existing secret bindings. The deploy command rebuilds the search catalog, social catalog, grants map, analytics and voice bundles and stamps entry assets. Search shards are generated and ignored by Git; the build is mandatory for a complete upload.

`public/.assetsignore` excludes all `ui-workbench.*` assets and the review-only homepage. They remain committed for local development. Shared `ui-controls.css`, homepage assets and application assets are included.

## Verification

- `npm run check`: generated Worker types, TypeScript and asset stamp checks pass.
- `npm test`: **622 passed, 0 failed**.
- Worker deployment dry run and JavaScript syntax/whitespace checks pass.
- Browser review of the homepage, research/search workflow, quick-search suggestions, current counts and all eleven mixed record cards.
- Production HTTP checks: `/`, `/ask`, `/ask?view=search`, `/home-data.js` return 200; legacy search redirects to the correct query-preserving URL.
- Production donor search for Woodside returns one donor result; `/api/stats` returns current counts.
- `/ui-workbench`, `/ui-workbench.html`, `/ui-workbench.js`, `/ui-workbench.css`, `/home-prototype` and `/home-prototype.html` all return **404** in production.
