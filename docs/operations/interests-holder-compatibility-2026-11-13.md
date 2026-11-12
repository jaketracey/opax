# Interest holder compatibility audit

The proposed change from `"unspecified"` to JSON null is blocked by the released
iOS 1.1.3 decoders, frozen from `eb6fd2dce` in
`portal/test/fixtures/ios-1.1.3/interest-decoders.ts`. All four holder fields use
`nonempty`, which accepts strings and rejects null. The compatibility tests
exercise all retained registers, recent declarations and donor ties, and inject
null into each field. They require no lost or quarantined rows.

The portal worktree has no `mobile/src`. App checks were read-only inspections of
Git source at `origin/ios/apple-design` (`9bf30ea81`) and
`origin/ios/integration-android` (`62d6bf44f`), plus the frozen released fixture.
The current iOS source includes the household-holder changes `b0dab1743` and
`5b04514f2`. The app uses shared TypeScript decoders on iOS and Android; all four
holder rules in both inspected refs still require non-empty strings.

| Reader | Checked behaviour |
| --- | --- |
| `portal/public/interest-holder.js` | Maps null, blanks and the legacy placeholder to null. |
| `portal/public/register-tables.js` and its `.d.ts` | Accept nullable holders and display `Not stated` in register tables, including CSV and hydration. |
| `portal/public/app.js` | Person ties use known holder labels; donor ties suppress absent holders; recent declaration rows do not display holder values. Null does not print `unspecified`. |
| `portal/public/home-data.js` | Recent declaration previews use name, description and category, without holder text. |
| `portal/src/interest-register.ts` | `/api/register/interests` uses the shared table projection, returning null and `holder_label: "Not stated"`. |
| `portal/src/seo-content.ts` | Nullable item type and shared table projection render null as `Not stated` in server-rendered person pages. |
| `portal/src/tools/interests.ts` | Normalises holders before deduplication and record answers. Missing holders have no holder wording. |
| `scripts/load_tables.mjs`, `portal/src/table-api.ts` and `portal/src/table-datasets.mjs` | Local interest table rows normalise missing holders to SQL null; generic table reads preserve that absence. |
| `scripts/build_search_catalog.mjs` | Normalises holders before composing search snippets. |
| `portal/src/index.ts`, `app-manifest.ts`, `app-edition.ts`, `app-vic-election.ts` | `/api/app/v1/*` does not adapt holder values. The manifest hashes and links the static interests index and recent catalog; edition and election readers do not read interest holders. Static interest files are shared with app installations. |
| `mobile/src/api/catalog-decoders.ts` and `validation.ts` | Member bucket items, detail ties, recent declarations and donor ties reject null. Register/detail ties and donor ties use strict arrays; recent rows may quarantine malformed entries or reject the catalog. |
| `mobile/src/api/catalogs.ts` | Person registers, Today declarations and the declarations feed call those decoders on the static files directly. |
| `mobile/src/features/Today.tsx`, `today/DeclarationRow.tsx`, `declarations/model.ts` and `declarations/FeedRow.tsx` | Presentation uses description, category and change metadata, without raw holder text, but follows the non-null decoder. |
| `mobile/src/features/YourMP.tsx`, `your-mp/LatestRows.tsx`, `your-mp/latest.ts` and `your-mp/model.ts` | Household merging collects string holders. Naming maps only self, spouse and children; unknown values get no individual name or a generic multiple-entry label. Full register rows suppress unknown holder labels. Null is rejected before these renderers. |
| `mobile/src/features/people/DeclaredInterests.tsx` | Uses `registerEntry` from `your-mp/model.ts`, with the same holder display rules. |
| `mobile/src/api/catalog-search.ts`, `features/search/InterestRow.tsx` and `features/search/present.ts` | Local snippets interpolate the string holder; `interestDetail` strips the placeholder and maps known holder labels for display. A future nullable decoder also needs the snippet producer to avoid interpolating literal `null`. |

`portal/public/interests/*.json` is committed exporter output. No export was
regenerated during this audit because switching its four shared fields to null
would break the checked decoders and violate `docs/IOS-API-CONTRACT.md`. A nightly
refresh alone does not resolve that incompatibility. The exporter and retained
data must keep the compatibility value until the app migration is resolved.

The added Worker regression uses an explicit null in a synthetic register and
checks the JSON projection, server-rendered `Not stated` label, retained source
link and absence of literal `unspecified` or `null` text.

Validation: `python3 -m pytest tests/test_interests_export.py` passed 11 existing
compatibility tests. `npx wrangler types >/dev/null`, `npm run build:release` and
`npx tsc --noEmit` passed. The full `npm test` run passed 4,827 tests after the
missing Python `openpyxl` dependency was installed in an isolated environment;
the three initially affected suites passed all 21 tests independently. The
focused alteration and released-decoder suites passed all 10 tests after the
release build generated the search catalog. Generated build changes were restored.
