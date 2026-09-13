# Opax community

## Product contract

The public record stays open. An email account enables private or shared reading lists, public profiles, source-led discussions and read-only MCP tools. All community features are available to members without payment.

## Implementation

- `/community` serves responsive account, discussion, reading-list and connected-tool views. Shared desktop/mobile navigation links to the community.
- `/api/community/*` owns isolated D1 community data. Staging never proxies account requests to production.
- Magic links expire after 15 minutes, are stored only as hashes and are consumed atomically after an explicit POST. Tokens travel in URL fragments, which the browser removes immediately. Email scanners cannot consume them by fetching the link.
- Sessions use hashed random tokens and a Secure, HttpOnly, SameSite=Lax `__Host-` cookie. Account mutations require the configured origin. Login and content creation are rate-limited.
- Reading lists start private. Owners control sharing and deletion; public profiles omit email. Saved records use Opax's `/doc/` paths.
- Members can report discussion content; moderators can review reports and hide content. Assign moderation ownership before opening discussions.
- MCP supports stateless HTTP POST with personal bearer tokens. Tokens are stored hashed, expire after 90 days and can be revoked. A member can have three active tokens. Compatible clients need bearer-token support; OAuth discovery is not implemented.
- MCP tools cover record search (`search_records`, including a `grant` kind), record reading (`read_record`), grant recipient detail (`read_grant_recipient`), grant program detail (`read_grant_program`), connection search (`find_connections`) and corpus coverage (`corpus_coverage`) — all read-only. Search/read results include absolute Opax citations. Oversized record responses are stopped while streaming.
- Grant search hits point at the file to open next. A recipient row carries `grant_recipient: {jurisdiction, id}` for `read_grant_recipient`; a program row (catalog slug `grant-program-<jur>-<key>`, title ending in "(grant program)") carries `grant_program: {jurisdiction, id}` for `read_grant_program`.
- `read_grant_program({jurisdiction: "federal" | "qld", id})` reads `/grants/<jur>/programs/<key>.json`, where the key is the id lowercased with every run of non-alphanumerics replaced by "-", trimmed and cut to 80 characters ("GO3141" -> "go3141", "activity:Some title" -> "activity-some-title"; QLD ids are program names). The file holds totals, agencies, selection processes, seat and margin splits (federal only), election timing, top recipients, electorates and the grants table, plus an `opax_url` deep link (`/money/grants?jur=<jur>&program=<id>`); grants with a GrantConnect guid gain `source_url`. When the file is over the 180 KB cap the object is kept whole and `grants` is cut to its first 200 rows with `grants_listed: 200` and `truncated: true`. An unknown program returns `{"error": "not found"}` as a tool error, the same shape as `read_record`.

  Example: Community Development Grants.

  ```json
  {"name": "read_grant_program", "arguments": {"jurisdiction": "federal", "id": "GO3141"}}
  ```

  returns (abridged)

  ```json
  {"id": "GO3141", "key": "go3141", "n": "Community Development Grants", "jur": "federal",
   "ag": "Department of Infrastructure, Transport, Regional Development, Communications and the Arts",
   "t": 1294810388, "c": 530, "r": 383, "y0": "2013-14", "y1": "2022-23",
   "sel": {"Closed Non-Competitive": [1000000000, 400]}, "sel_known": [1200000000, 500],
   "seats": {"gov": [900000000, 350], "opp": [300000000, 150], "cross": [50000000, 20], "unknown": [44810388, 10]},
   "recipients": [["abn:97694995462", "The Trustee for the Qantas Foundation Memorial Trust", "trust", 11300000, 1, true]],
   "grants": [{"id": "GA34203", "v": 11300000, "n": "Qantas Founders Museum", "rid": "abn:97694995462", "fy": "2018-19", "s": "2019-02-12",
               "sel": "Closed Non-Competitive", "el": "Kennedy", "holder": ["Bob Katter", "Katter's Australian Party"], "bloc": "cross",
               "guid": "...", "source_url": "https://www.grants.gov.au/Ga/Show/..."}],
   "grants_total": 530, "grants_listed": 530,
   "opax_url": "https://opax.com.au/money/grants?jur=federal&program=GO3141"}
  ```

## Configuration and launch requirements

Production and staging have separate `COMMUNITY_DB` bindings. Apply every migration in `portal/migrations` to each target database before enabling accounts. Configure:

- `COMMUNITY_ORIGIN`: the exact HTTPS origin for that environment.
- `COMMUNITY_EMAIL_FROM`: an authenticated Cloudflare Email Sending address.
- `COMMUNITY_EMAIL`: the sending binding.
- `COMMUNITY_ENABLED`: enable after real email delivery and sign-in are verified.

The current release removes payment routes, SDK dependencies, promotional copy and payment-based MCP restrictions. Migration 0002 removes the unused subscription and checkout tables from the earlier draft.

## Verification

Thirteen automated tests cover single-use links, expiration, sessions, origins, login rate limiting, private list ownership/sharing, public profile privacy, moderation, disabled accounts and member MCP access. MCP tests exercise tool discovery, search/read citations, invalid arguments, bounded responses, hashed keys and revocation. External email is simulated in these tests.

The mobile browser harness exercises sign-in, profile editing, reading lists, discussions and token creation/revocation in Chromium and WebKit at 390, 768 and 1280 pixels. TypeScript, syntax and asset-stamp checks are also required.

Preview: `https://staging.opax.com.au/community`. Cloudflare Email Sending is enabled for `login.opax.com.au`. The real sign-in email arrived at the owner's mailbox and passed SPF, DKIM and DMARC authentication. A WebKit browser consumed the emailed link successfully, verified the Secure/HttpOnly session cookie, rejected replay, created an MCP token, read a live public record, revoked the token and confirmed its rejection. The test signed out afterwards.

The official MCP client passes an HTTP integration check: initialization, tool discovery, record reading and rejection after token revocation. Run `npm run test:community` from `portal` to reproduce the account and MCP checks. Both production database migrations have been applied successfully; the configured production launch enables community accounts.

Production moderation ownership is assigned to the project owner at jake.tracey@noice.net.au. This does not create a session: the owner must still authenticate using a single-use email link.
