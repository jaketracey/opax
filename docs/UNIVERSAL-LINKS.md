# Universal links

An opax.com.au link to a page the iOS app has opens in the app. Every other
link opens on the web, as before.

## One table

`docs/universal-links.json` lists the addresses the app opens (`open`) and the
addresses that always stay on the web (`exclude`). Patterns use Apple's
component syntax: `/` is the path, `?` the query, `#` the fragment; `*` is any
run of characters and `?*` is at least one. Exclusions are tested first, then
the first matching `open` entry wins. An address nothing matches is not
claimed. Paths are compared percent-decoded, so `%70erson:` is `person:`.

Only an address the web serves as a page of its own is claimed. One the web
redirects elsewhere is left to the web: `/discover` (a 301 to
`/money/contracts`, which the app does not have) and `/today` (a 302 to the
page behind the day's post). Check `canonicalRoutePath` and `todayRedirect`
in `portal/src` before adding a path.

The table lives at one path, `docs/universal-links.json`, in both the app
branch and the web branch, with the script beside it. Once both are merged
there is one file and one script, not two copies: it is the single source,
and each side's `--check` compares its generated file with it. Until then
the two branches must carry the same bytes; a difference shows as a merge
conflict on that path.

`node scripts/build_universal_links.mjs` writes the table into both sides
(`--check` exits 1 while either is stale, and the tests on both sides run it):

| Side | Generated file | Read by |
| --- | --- | --- |
| App | `mobile/src/navigation/universal-links.generated.ts` | `mobile/src/navigation/universal-links.ts`, the gate in the app's link handler (`system-path.ts`, behind `+native-intent`) |
| Web | `portal/src/universal-links.generated.ts` | `portal/src/app-site-association.ts`, which serves `/.well-known/apple-app-site-association` |

Each `open` entry also names the app pages it may land on (`opens`, as route
patterns) and carries `examples`: a web address and the exact app path it
resolves to. The app's tests run every example through the link handler.

To add a page: add the resolver in `mobile/src/navigation/external/`, add an
`open` entry with an example, run the script, and merge the same
`docs/universal-links.json` to the web. The web copy decides what iOS hands
to the app; the app copy decides what the app does with it. An app build
that receives a link its own table does not claim opens it in the browser,
so the two may differ for a while without a dead end.

## What stays on the web

- The API (including the Ask stream, `POST /api/ask?stream=1`), `/mcp`,
  `/oauth/*`, `/.well-known/*`, `/ingest/*` and `/og/*`.
- `/community` and everything under it. The emailed sign-in link
  (`/community?view=signin#token=…`) signs the browser in, as it always has.
  The app signs in with the emailed code and has never handled that link, so
  it is not claimed. A `token` fragment, or a `token` or `code` query item,
  keeps any address on the web.
- `/privacy`, `/terms`, `/security`, `/support`.
- The web's Ask page without a question (`/ask`, where an answer streams),
  `/chat`, and the legacy `?ask=` and `/?q=` entries. `/ask?q=…` and
  `/ask?view=search…` open in the app.
- Pages the app does not have: `/money/receipts`, `/money/explain`,
  `/money/contracts`, `/reports/*`, `/budget`, `/audit`, `/estimates`,
  `/sitting`, `/instruments`, the registers, donor and supplier indexes, and
  an individual grant recipient's page.

Inside the app, an https link that is not claimed, or that is claimed but
cannot be placed (a `/doc/` slug the app does not read, an unknown section),
opens in the browser: nothing is routed, and "This page isn’t in the app" is
never shown for it. Every https link is gated, whatever it carries
(`?src=widget` included). `opax://` links are the app's own and are not.

A pattern is claimed before the app knows whether it holds that id
(`/subject/person/no-such`). The not-found page for an unknown person,
electorate, bill, record or topic therefore has "Open on opax.com.au" under
its Search action, so a link can always get back to the website.

## Identifiers

The association file names the app as `<Team ID>.<bundle ID>`.

- Bundle ID: `au.com.opax.app`, from `ios.bundleIdentifier` in
  `mobile/app.config.ts` (the table's `bundleId`; a test holds them equal).
- Team ID: not in the app config or the repository. The release tooling
  reads it from the local App Store Connect environment file as
  `APPLE_TEAM_ID`, and the release check forbids it in tracked files. The
  Worker reads the same value from its var `APPLE_TEAM_ID`, set at deploy
  time and never written to `wrangler.jsonc` or any other file. While that
  is unset the path answers 404 and every link opens on the web.

## Turning it on

Nothing here is automatic. In this order:

1. Set the Worker var `APPLE_TEAM_ID` to the ten-character Team ID and deploy
   the Worker. Check `curl -i https://opax.com.au/.well-known/apple-app-site-association`:
   200, `content-type: application/json`, no `location`.
2. Ship an app build with the entitlement (`ios.associatedDomains` in
   `mobile/app.config.ts`: `applinks:opax.com.au`; development and production
   builds, not e2e). Signing is automatic and cloud-managed, so Xcode turns
   on the Associated Domains capability for the App ID when it archives. If
   the archive fails because the provisioning profile lacks the
   `com.apple.developer.associated-domains` entitlement, a person with the
   Admin or App Manager role enables **Associated Domains** once on the
   `au.com.opax.app` identifier (Apple Developer, Certificates, Identifiers
   & Profiles, Identifiers). Nothing is needed in App Store Connect.
3. On a device with that build, tap an opax.com.au person link in Notes or
   Messages: it opens the app. Apple's servers cache the association file,
   so a change to it can take a day to reach devices.

`www.opax.com.au` is not claimed: the Worker redirects it to the apex, and
Apple's fetcher follows no redirect. The staging Worker serves no association
file, and the app has no staging scheme.

## Android App Links (not built)

The Android app opens `opax://` links only. App Links would need:

- an `autoVerify` intent filter for `https://opax.com.au` in
  `android.intentFilters` (`mobile/app.config.ts`), with one path entry per
  claimed pattern. Android matches paths only, so the query rules here
  (`/ask` with a question, the credential exclusions) would rest on the
  in-app gate, which already sends an unclaimed link to the browser;
- `/.well-known/assetlinks.json` from the Worker, as JSON without a
  redirect, naming the package `au.com.opax.app` and the SHA-256
  fingerprints of the Play app-signing certificate and the upload
  certificate;
- the native link inbox (`mobile/modules/opax-links`) to accept https
  deliveries, and a check that the browser hand-off does not loop back into
  the app (a verified App Link opened by the app itself can return to it;
  it must be sent to a browser package explicitly).
