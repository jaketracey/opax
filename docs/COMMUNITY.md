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

## Configuration and launch requirements

Production and staging have separate `COMMUNITY_DB` bindings. Apply every migration in `portal/migrations` to each target database before enabling accounts. Configure:

- `COMMUNITY_ORIGIN`: the exact HTTPS origin for that environment.
- `COMMUNITY_EMAIL_FROM`: an authenticated Cloudflare Email Sending address.
- `COMMUNITY_EMAIL`: the sending binding.
- `COMMUNITY_ENABLED`: enable after real email delivery and sign-in are verified.

The current release removes payment routes, SDK dependencies, promotional copy and payment-based MCP restrictions. Migration 0002 removes the unused subscription and checkout tables from the earlier draft.

## Verification

Automated tests cover single-use links, expiration, sessions, origins, login rate limiting, private list ownership/sharing, public profile privacy, moderation, disabled accounts and member MCP access. MCP tests exercise tool discovery, search/read citations, invalid arguments, bounded responses, hashed keys and revocation. Grant regressions cover recipient-to-program candidates, exact-label resolution, ambiguous names, authoritative collision keys, malformed assets, source provenance, jurisdiction-specific value semantics and adaptive truncation. External email is simulated in these tests.

The mobile browser harness exercises sign-in, profile editing, reading lists, discussions and token creation/revocation in Chromium and WebKit at 390, 768 and 1280 pixels. TypeScript, syntax and asset-stamp checks are also required.

Preview: `https://staging.opax.com.au/community`. Cloudflare Email Sending is enabled for `login.opax.com.au`. The real sign-in email arrived at the owner's mailbox and passed SPF, DKIM and DMARC authentication. A WebKit browser consumed the emailed link successfully, verified the Secure/HttpOnly session cookie, rejected replay, created an MCP token, read a live public record, revoked the token and confirmed its rejection. The test signed out afterwards.

The official MCP client passes an HTTP integration check: initialization, tool discovery, record reading and rejection after token revocation. Run `npm run test:community` from `portal` to reproduce the account and MCP checks. Both production database migrations have been applied successfully; the configured production launch enables community accounts.

Production moderation ownership is assigned to the project owner at jake.tracey@noice.net.au. This does not create a session: the owner must still authenticate using a single-use email link.
