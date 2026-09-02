# Hardening: response headers, CSP, API input, asset caching

What the portal sends on every response, why the Content-Security-Policy is
shaped the way it is, what the Worker will and will not accept as input, and
how assets are cached and stamped. Two files carry the policy and they must
stay in step:

| File | Covers |
| --- | --- |
| `portal/public/_headers` | Responses the static-asset server produces on its own — with `run_worker_first` scoped to `/api/*`, that is every non-API request. |
| `portal/src/index.ts` (`withSecurityHeaders`) | Every response the Worker produces: `/api/*`, and any path a future `run_worker_first` entry routes through the Worker. |

`_headers` is natively supported by Workers static assets (same format as
Pages). Wrangler reports `✨ Parsed N valid header rules` at startup — if that
line is missing or the count drops, a rule failed to parse.

## Response headers

Sent on every response, static or API:

| Header | Value | Why |
| --- | --- | --- |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains; preload` | One year, subdomains included, preload-list eligible. |
| `X-Content-Type-Options` | `nosniff` | No MIME sniffing — the corpus serves user-visible text the browser must not reinterpret. |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Outbound links to aph.gov.au, the ABC and Wikipedia leak the origin, never the question in the URL hash. |
| `X-Frame-Options` | `DENY` | Legacy clickjacking defence, paired with `frame-ancestors 'none'`. |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(), payment=(), usb=()` | The site needs none of them; deny outright. |
| `Cross-Origin-Opener-Policy` | `same-origin` | Severs the opener relationship with cross-origin popups. |
| `Content-Security-Policy` | see below | Two policies: one for documents, a tighter one for API responses. |

## Content-Security-Policy

Documents (from `_headers` and `CSP_PAGE`):

```
default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline';
img-src 'self'; font-src 'self'; connect-src 'self'; worker-src 'self';
manifest-src 'self'; frame-src 'none'; object-src 'none'; base-uri 'none';
form-action 'self'; frame-ancestors 'none'
```

API responses (`CSP_API`) — a JSON or SSE body is never a document, so it may
load nothing at all:

```
default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'
```

### How the policy was derived

Inventory of what the app actually loads, taken across `index.html` and every
module (`app.js`, `wombat.js`, `statemap.js`, `money-map.js`, `ledger.js`,
`matrix.js`, `wordsdollars.js`, `thenvsnow.js`, `timemachine.js`, `quiz.js`,
`newsrail.js`):

- **Scripts.** `index.html` carries exactly one `<script src="/app.js">`. No
  inline `<script>`, no inline event-handler attributes, no `eval()` and no
  `new Function()` anywhere in the bundle — including the three.js money map.
  So `script-src 'self'`, with **no `'unsafe-inline'` and no `'unsafe-eval'`**.
- **Styles.** `'unsafe-inline'` is required, and only for styles. Every module
  injects its own stylesheet with `document.createElement('style')`, `app.js`
  sets `style=""` attributes on the relevance bars, and `index.html` has three
  inline `style` attributes. None of that is a script-execution vector, and a
  nonce cannot be threaded through modules this task is not allowed to edit.
- **Fonts.** Self-hosted under `/fonts/` (see below), so `font-src 'self'` and
  no third-party origin in `style-src`.
- **Images.** Every image is a same-origin `/photos/*.webp`; the map, logo and
  all iconography are inline SVG. No `data:` URIs. So `img-src 'self'`.
- **Network.** Every `fetch()` is same-origin: `/api/*` and the JSON exports.
  The news rail's outlet feeds are fetched by the Worker, never the browser.
  So `connect-src 'self'`.
- **Workers and blobs.** No `new Worker()` anywhere. `app.js` and `ledger.js`
  do build `blob:` URLs, but only as `<a download>` targets for CSV export,
  which CSP does not gate — verified in the headless pass below.
- **Everything else** is denied: no frames, no plugins, no `<base>` rewriting.

### It ships enforced

Enforced, not report-only, because a headless pass found **zero**
`securitypolicyviolation` events and zero console errors across:

- 13 hash routes: `#/`, `#/search`, `#/money`, `#/subject/{person,party,donor,topic}`, `#/explore`, `#/reports`, `#/reports/climate`, `#/about`, `#/methods`, `#/stats`
- the 3D money map, mounted and rendering (WebGL canvas confirmed)
- all three Explore games (time machine, quiz, ledger) and the ledger's CSV export, which exercises the `blob:` download path
- a full `#/ask?q=…` round trip: SSE stream, answer rendered, sources listed

Reproduce with the CDP collector, which installs the
`securitypolicyviolation` listener before any page script runs:

```sh
node "$SCR/csp-check.mjs" http://127.0.0.1:8869/ --wait 4500 \
  --routes "#/,#/search,#/money,#/subject/person,#/subject/party,#/subject/donor,#/subject/topic"
```

### If you add something

- A third-party script or stylesheet needs a new `script-src`/`style-src`
  origin in **both** files. Prefer self-hosting: it is what took the fonts out
  of the CSP and 2.3 s off render-blocking.
- An `<img src="data:…">` needs `img-src 'self' data:`.
- A `new Worker(URL.createObjectURL(…))` needs `worker-src 'self' blob:`.
- Never add `'unsafe-inline'` or `'unsafe-eval'` to `script-src`. If a module
  starts needing inline script, give it a nonce instead.

## API input validation

All of it sits at the router level in `portal/src/index.ts`, above the route
handlers, so it stays mergeable with the per-route caching and SEO work.

**POST bodies** (`/api/ask`, `/api/followups`):

| Rule | Response |
| --- | --- |
| `Content-Type` must be `application/json` (parameters such as `; charset=utf-8` allowed) | `415` |
| Body ≤ 16 KB — checked against `Content-Length` and again against the bytes actually read, so a chunked body cannot dodge it | `413` |
| Body must parse as JSON, and must be an object (not an array, not `null`) | `400` |

16 KB is an order of magnitude more than the largest legitimate ask: a
2,000-character question plus 24 turns of already-clipped context.

**Question** (`/api/ask`): required, must be a string, non-empty after trim,
≤ 2,000 characters. **Query** (`/api/search` `q`): same, ≤ 2,000 characters.

**Filters** — the same allow-list runs over the POST body and the `/api/search`
query string, and a failure is a `400` with a short message:

| Field | Rule |
| --- | --- |
| `kind` | one of `speech`, `legal`, `news`, `division`, `all` |
| `state` | one of `federal`, `nsw`, `vic`, `sa`, `qld` |
| `topic` | one of the 21 enrichment slugs (`TOPIC_SLUGS`) |
| `mode` (search) | one of `hybrid`, `semantic`, `keyword` |
| `party` | ≤ 64 chars, `^[\p{L}\p{N} .,'’&()/-]+$` |
| `speaker` | ≤ 120 chars, same character class |
| `from`, `to` | exactly four digits, 1900–2100 |
| any of the above | must be a string if present at all |

`party` is a *shape* check rather than a value enum on purpose: party labels
are the knowledge box's own facet values, served live by `/api/parties` and
growing with the corpus, so a frozen enum would break the party encyclopedia
the day a new party is indexed. The character class is still tight enough that
nothing structural can reach the upstream `filter_expression`.

`from`/`to` are bounded at 1900–2100 rather than at the corpus range (1993–) so
extending the corpus backwards never needs a Worker change.

**Other router-level behaviour:**

- Any unmatched `/api/*` path returns `404 {"error":"not found"}` as JSON.
- `HEAD` on an API route is served by running the `GET` and dropping the body.
  It used to fall through to the 404, which made `curl -I /api/stats` lie.
- `Cache-Control: no-store` is set only on `/api/ask`, `/api/followups` and
  `/api/search` — routes with nothing cacheable in them — and only when the
  handler set no `Cache-Control` of its own. Every other `/api` route is left
  exactly as its handler returned it; edge caching is owned elsewhere.

### What never reaches the client

- **The KB token.** `ARAG_KB_TOKEN` is a Worker secret, injected into the
  `x-nuclia-serviceaccount` header inside `kbFetch` and nowhere else. No
  response is built from an upstream `Response` object; every one is
  re-serialised from parsed data.
- **Upstream error bodies.** A knowledge-box failure maps to a short message
  (`ask failed (502)`, `catalog failed`, …) and the detail goes to
  `console.error`. `/api/recent` used to return `body: (await res.text())` —
  the upstream's own error text, which echoes the failing request — straight to
  the browser. It now logs that and serves `{items: []}`.
- **`da-*` enrichment slugs.** Filtered out of `/api/search` and `/api/ask`
  results, and `isPublicSlug` rejects them at `/api/resource/:slug`. The
  enrichment output must never cite itself.

## Secrets and repo hygiene

Checked and clean as of this commit:

- `git grep` for key-shaped literals, `sk-`/`ghp_`/`AKIA`/`xox`/JWT prefixes,
  and `serviceaccount`/`nuclia` finds no secret values in tracked files.
- `.env` and `*.pem` are in the root `.gitignore`; `.dev.vars`, `node_modules/`,
  `.wrangler/` and `worker-configuration.d.ts` are in `portal/.gitignore`.
  `portal/.dev.vars` exists locally and is untracked. Only `.env.example` is
  tracked, with an empty `ARAG_KB_TOKEN=`.
- `wrangler.jsonc` `vars` holds only `ARAG_ZONE` and `ARAG_KB_ID` — resource
  identifiers, useless without the token, which is set with
  `npx wrangler secret put ARAG_KB_TOKEN`.
- No script in `scripts/` prints an environment value; none run under `set -x`.
  `scripts/arag_smoke.sh` reads the token from `.env` into a shell variable and
  passes it as a header without echoing it.

## Asset caching

Set in `portal/public/_headers`. A request matching several rules inherits all
of their headers and same-name values are **joined**, so generic rules come
first and a specific rule detaches with `! Cache-Control` before setting its
own. Patterns allow one splat each, and a splat matches `/` too — `/*.json`
covers `/graph/money.json`.

| Path | `Cache-Control` | Why |
| --- | --- | --- |
| `/`, `/index.html` | `public, max-age=0, must-revalidate` | The shell always revalidates; its ETag makes that a 304. |
| `/app.js`, `/style.css` | `public, max-age=31536000, immutable` | Content-hash stamped — a new release is a new URL. |
| `/*.js` (other modules) | `public, max-age=300, stale-while-revalidate=86400` | Dynamically `import()`ed by bare path from inside `app.js`, so they cannot be stamped without rewriting `app.js` at deploy time. |
| `/*.json` | `public, max-age=3600, stale-while-revalidate=86400` | Data exports; hourly is plenty. |
| `/photos/*.webp` | `public, max-age=3600, stale-while-revalidate=86400` | Portraits. Scoped to `.webp` so `/photos/people.json` is left to the `/*.json` rule rather than having the value set twice. |
| `/fonts/*` | `public, max-age=2592000, stale-while-revalidate=31536000` | Filenames are stable, so not `immutable`: a month, with a year of stale grace. |
| `/favicon.svg` | `public, max-age=86400, stale-while-revalidate=604800` | |

### Stamping — and the one rule

`index.html` references `/app.js?v=<hash>` and `/style.css?v=<hash>`.
`scripts/stamp_assets.mjs` rewrites both stamps from the sha256 of the bytes on
disk. That is the only reason those two can be served `immutable`.

```sh
cd portal && npm run deploy      # stamps, then wrangler deploy
```

> **Never run `npx wrangler deploy` by hand.** An unstamped deploy ships a
> stale `?v=` against a one-year `immutable` header, and returning visitors sit
> on the old bundle. `npm run deploy` is `node ../scripts/stamp_assets.mjs &&
> wrangler deploy` precisely so the stamp cannot be forgotten.

`npm run check` includes `stamp_assets.mjs --check`, which exits non-zero when
the committed stamps no longer match the files — cheap insurance in CI or a
pre-commit hook.

The script refuses to run silently: if it cannot find a `?v=` reference for
each stamped asset in `index.html`, it exits 1 rather than deploying an
unstamped page.

### Fonts

Merriweather and Public Sans are served from `portal/public/fonts/` under the
SIL Open Font License (`fonts/OFL-Merriweather.txt`,
`fonts/OFL-PublicSans.txt`), declared in an inline `<style>` in `index.html`.

The Google Fonts `<link>` they replaced cost about 2.3 s of render blocking on
every page: a serial DNS + TLS + CSS round trip to `fonts.googleapis.com` just
to learn the `fonts.gstatic.com` URLs, then a second handshake to fetch them.
Declaring the faces inline collapses that to same-origin font requests that
start at parse time, and it removes two third-party origins from the CSP.

The `latin`, `latin-ext` and `vietnamese` subsets are kept; `cyrillic` and
`cyrillic-ext` are dropped as ~90 KB of repo for codepoints Hansard does not
use, with the serif/sans fallbacks covering them if they ever appear. Every
face carries `font-display: swap` and its `unicode-range`, so a page only
fetches the subsets it actually needs. The first serif and the first sans
(`merriweather-normal-latin.woff2`, `public-sans-normal-latin.woff2`) are
preloaded with `crossorigin` — fonts are fetched in CORS mode even
same-origin, and without it the preload is not reused.

To re-pull them from Google (new font version, or a subset change):

```sh
node scripts/stamp_assets.mjs --fonts
```

It downloads each face, deletes any that are no longer served, regenerates the
block between the `<!-- fonts:begin -->` / `<!-- fonts:end -->` markers in
`index.html`, and fails loudly if a preloaded face has disappeared upstream.
