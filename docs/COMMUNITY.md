# Opax community

## Product contract

The public record stays open. An email account enables private or shared reading lists, public profiles, source-led discussions and read-only MCP tools. All community features are available to members without payment.

## Implementation

- `/community` serves responsive account, discussion, reading-list and connected-tool views. Shared desktop/mobile navigation links to the community.
- `/api/community/*` owns isolated D1 community data. Staging never proxies account requests to production.
- Magic links expire after 15 minutes, are stored only as hashes and are consumed atomically after an explicit POST. Tokens travel in URL fragments, which the browser removes immediately. Email scanners cannot consume them by fetching the link.
- Native code sign-in uses the same proof and session as the web; see the code flow below. New requests supersede earlier unused proofs for the same normalized email and client, independently for web and iOS.
- Sessions use hashed random tokens and a Secure, HttpOnly, SameSite=Lax `__Host-` cookie. Account mutations require the configured origin. Login and content creation are rate-limited.
- Reading lists start private. Owners control sharing and deletion; public profiles omit email. Saved records use Opax's `/doc/` paths.
- Saved conversations (13 September 2026): the chat keeps every conversation in the browser's localStorage (`opax-chats`, twenty newest, trimmed sources) and mirrors a signed-in member's to `member_chats` (migration 0006) through `GET/PUT/DELETE /api/community/chats[/:id]` - one owner per row, private, the reader's `updated` clock deciding between devices (an older write is acknowledged as `stale`). Fifty per member; a body up to 600 KB and eighty turns. Nothing anonymous is stored server-side.
- Members can report discussion content; moderators can review reports and hide content. Assign moderation ownership before opening discussions.
- MCP supports stateless HTTP POST with personal bearer tokens. Tokens are stored hashed, expire after 90 days and can be revoked. A member can have three active tokens. Compatible clients need bearer-token support; OAuth discovery is not implemented.
- MCP tools cover record search (`search_records`, including a `grant` kind), record reading (`read_record`), grant recipient detail (`read_grant_recipient`), grant program detail (`read_grant_program`), connection search (`find_connections`) and corpus coverage (`corpus_coverage`) — all read-only. Search/read results include absolute Opax citations. Oversized record responses are stopped while streaming.
- Grant search hits point at the file to open next. A recipient row carries `grant_recipient: {jurisdiction, id}` for `read_grant_recipient`; a program row (catalog slug `grant-program-<jur>-<key>`, title ending in "(grant program)") carries `grant_program: {jurisdiction, id}` for `read_grant_program`.
- Recipient citations use `/money/grants/<jurisdiction>/recipient/<encoded-id>` for standalone pages. Legacy `/money/grants?jur=...&open=...` links remain readable, and MCP search recognizes both forms.
- `read_grant_recipient` adds `program_lookup` entries for its top program labels. Each entry includes the recipient value and catalog `candidates` with `{jurisdiction, id, name, opax_url}`. These are label matches; verify membership in the program's grants. An empty candidate list means no matching exported program, not that no program exists.
- `read_grant_program({jurisdiction: "federal" | "qld", id})` resolves a canonical catalog ID, file key, or unique exact program label against `/graph/grants.<jur>.json`. It uses the catalog's file key, including exporter collision suffixes and truncation. Multiple programs with the same label return an error with candidates; an unknown program returns `{"error":"not found"}`. Only exported catalog programs are available.
- Both grant readers include `field_guide`, `coverage`, `dataset_source_url`, `grants_total` and `grants_listed`. Recipient agencies/programs/electorates and program top recipients may be partial summaries. Queensland values are annual expenditure lines, including grants, service agreements and other assistance; an agreement can recur in several years. Federal values are published award values, not evidence of payments received. Do not combine counts as unique grants or totals as payments received.
- A known GrantConnect GUID yields a row `source_url` with `source_kind: "original_record"`. Queensland rows without an individual URL instead link to the source dataset with `source_kind: "dataset"`. Missing individual record URLs are explicit in `original_source_status`. Dataset provenance does not verify an individual record, and external link availability is not guaranteed.
- Grant output is capped at 180 KB. If necessary, the grant list is shortened to at most 200 rows, then further reduced until the JSON fits; totals and metadata are preserved and `truncated: true` is set. Recipient asset omissions also set `truncated`. If metadata alone exceeds the cap, the tool returns an error with the Opax URL. Search currently returns the first ten results and has no MCP pagination argument.

  Example: use the candidate returned for Community Development Grants:

  ```json
  {"name": "read_grant_program", "arguments": {"jurisdiction": "federal", "id": "GO3141"}}
  ```

  The exact label `"Community Development Grants"` also resolves when unique. The response includes the canonical `id: "GO3141"`, `key: "go3141"` and `opax_url: "https://opax.com.au/money/grants?jur=federal&program=GO3141"` alongside current program data and coverage notes.

## Native code sign-in (W1 to W3, branch implementation)

`POST /api/community/auth/request` accepts `{email, client:"ios"}`. Omitting `client` keeps the web email and response unchanged. Native requests receive `{sent:true, message, challenge_id}` for both existing and new accounts. The challenge is 32 cryptographically random bytes encoded as 43 URL-safe characters and bound in the proof row to the normalized email and `client:"ios"`. The response carries no code or link token.

The native email includes the existing `/community?view=signin#token=…` link and an eight-digit app code, including possible leading zeroes. Rejection sampling over `crypto.getRandomValues` makes every code equally likely. One proof holds the SHA-256 link hash, the challenge and an HMAC-SHA-256 of the code bound to that challenge. The code is never stored in clear or as an unkeyed hash. The proof expires after 15 minutes. Supersession and insertion run in one D1 batch; email-delivery failure deletes the newly created proof. The web and native share the existing `login-ip:` and `login-email:` counters: 15 per fixed hour per IP and 5 per fixed hour per email.

`POST /api/community/auth/consume-code` accepts `{challenge_id, code}`, with the code supplied as an eight-character decimal string. It looks up the challenge's email, then completes these atomic admissions in order before comparing any MAC:

1. IP: the existing `consume:` counter, shared with link consumption, permits 30 attempts per fixed 15-minute window. Unknown and malformed challenges still spend IP quota.
2. Email: a counter keyed by a digest of the proof's normalized email permits 10 attempts per fixed 24-hour window. Every known-challenge attempt counts, including attempts on expired, consumed or superseded proofs. Reissue and supersession never reset it; a caller-supplied email cannot choose its key.
3. Challenge: one conditional update increments attempts only on an unused, unexpired, unsuperseded iOS proof with fewer than five attempts and returns its MAC.

The Worker computes the submitted code's MAC and compares the two fixed-size MACs with Cloudflare's native constant-time `crypto.subtle.timingSafeEqual`. A matching code must then win a conditional `used_at` update that rechecks expiry and supersession. Link consumption competes for that same row: whichever wins consumes both forms. Parallel requests cannot create a second session from that proof.

Success returns `{signed_in:true}` and the existing `__Host-opax_session` cookie: host-only, `Path=/`, `Secure`, `HttpOnly`, `SameSite=Lax`, `Max-Age=2592000` (30 days). Its random token remains stored only as a SHA-256 hash. Code exchange labels the session `client:"ios"`; browser link consumption labels it `web`. The label adds no authority. Existing member lookup and logout apply to both.

Wrong, malformed, expired, superseded, consumed, unknown, disabled-account and over-limit code exchanges return the same HTTP 400 body: `{"error":"This code could not be used. Request a new sign-in email or use its link."}`. Origin rejection remains the existing HTTP 403. All auth POSTs, including native issuance/exchange and cookie-bearing mutations, require the exact configured `COMMUNITY_ORIGIN`. The native core explicitly sends `Origin: https://opax.com.au` in production, and the configured staging origin when testing staging. There is no Origin bypass, CORS addition or new session header.

At the email cap, the link remains the fallback until the daily window ends. Fixed windows can allow attempts on both sides of a boundary. Carrier NAT still shares the existing IP caps. Rotating the MAC secret invalidates outstanding codes; their links remain usable unless already consumed or superseded.

## Configuration and launch requirements

Production and staging have separate `COMMUNITY_DB` bindings. Apply every migration in `portal/migrations` to each target database before enabling accounts. Configure:

- `COMMUNITY_ORIGIN`: the exact HTTPS origin for that environment.
- `COMMUNITY_EMAIL_FROM`: an authenticated Cloudflare Email Sending address.
- `COMMUNITY_EMAIL`: the sending binding.
- `COMMUNITY_CODE_MAC_SECRET`: a new Worker secret for HMAC-SHA-256 code storage, with separate high-entropy values (at least 32 random bytes) for staging and production. Keep it out of Wrangler vars, source and logs. Missing configuration refuses native issuance before storing a proof or sending email; web sign-in continues to work. Automated tests use a fixed test-only key.
- `COMMUNITY_ENABLED`: enable after real email delivery and sign-in are verified.

Migration `0011_native_signin.sql` adds the proof's client, challenge, MAC, attempts and supersession columns, its lookup indexes, and the session client label. Existing rows default to `web` and remain valid. **Before applying it while the web runs, release the separate compatibility commit that changes the legacy proof/session inserts to explicit column lists.** The older positional inserts cannot tolerate added columns. Roll out the compatibility change, migration, per-environment secret, then W1 to W3, in staging first and production only after review and approval. No deployment, remote migration or secret setup was performed in this lane. The future W6 deletion migration proposed as `0011_voice_deletion_safe` in the design docs must take the next available number when integrated.

The current release removes payment routes, SDK dependencies, promotional copy and payment-based MCP restrictions. Migration 0002 removes the unused subscription and checkout tables from the earlier draft.

## Verification

Automated tests cover single-use links, expiration, sessions, origins, login rate limiting, private list ownership/sharing, public profile privacy, moderation, disabled accounts and member MCP access. MCP tests exercise tool discovery, search/read citations, invalid arguments, bounded responses, hashed keys and revocation. Grant regressions cover recipient-to-program candidates, exact-label resolution, ambiguous names, authoritative collision keys, malformed assets, source provenance, jurisdiction-specific value semantics and adaptive truncation. External email is simulated in these tests.

Native sign-in tests additionally cover unbiased code generation, challenge-bound keyed storage, issuance non-enumeration, shared quotas, supersession, admission order, concurrent per-challenge and email caps across old/new challenges and at the cap boundary, one-winner link/code races, generic failures, cookie attributes, unchanged Origin enforcement and migration compatibility. A local Worker/D1 runtime test stubs the email binding and denies outbound requests; it verifies the concurrent email-cap boundary and native session label. Existing community and voice fixtures apply the additive migration too.

The mobile browser harness exercises sign-in, profile editing, reading lists, discussions and token creation/revocation in Chromium and WebKit at 390, 768 and 1280 pixels. TypeScript, syntax and asset-stamp checks are also required.

Preview: `https://staging.opax.com.au/community`. Cloudflare Email Sending is enabled for `login.opax.com.au`. The real sign-in email arrived at the owner's mailbox and passed SPF, DKIM and DMARC authentication. A WebKit browser consumed the emailed link successfully, verified the Secure/HttpOnly session cookie, rejected replay, created an MCP token, read a live public record, revoked the token and confirmed its rejection. The test signed out afterwards.

The official MCP client passes an HTTP integration check: initialization, tool discovery, record reading and rejection after token revocation. Run `npm run test:community` from `portal` to reproduce the account and MCP checks. Both production database migrations have been applied successfully; the configured production launch enables community accounts.

Production moderation ownership is assigned to the project owner. This does not create a session: the owner must still authenticate using a single-use email link.
