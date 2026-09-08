# Opax community and optional support

## Product contract

The public record stays free. A free email account enables private or shared reading lists, public profiles and source-led discussions. Optional recurring support adds revocable access to the read-only MCP tools. Contributions do not affect rankings or discussion privileges.

## Implementation

- `/community` serves the responsive account, discussion, reading-list and supporter views.
- `/api/community/*` owns the isolated D1 community data. Staging never proxies account requests to production.
- Magic links expire after 15 minutes, are stored only as hashes and are consumed atomically after an explicit POST. Tokens travel in URL fragments, which the browser removes immediately. Email scanners cannot consume them by fetching the link.
- Sessions use hashed random tokens and a Secure, HttpOnly, SameSite=Lax `__Host-` cookie. Account mutations require the configured origin. Login and content creation are rate-limited.
- Reading lists start private. Owners control sharing and deletion; public profiles omit email and billing identifiers.
- Members can report discussion content; moderators can review reports and hide content. Assign a moderator through an audited database operation before launch.
- Stripe hosts checkout and contribution management. Webhooks verify the raw-body signature and reconcile current subscription state from Stripe. Checkout retries reuse the same idempotency key. Only an active configured subscription grants MCP access.
- MCP supports stateless HTTP POST with personal bearer tokens. Tokens are stored hashed, expire after 90 days and can be revoked. Compatible clients need bearer-token support; OAuth discovery is not implemented.
- A Stripe pricing failure does not prevent access to free account features.

## Configuration and launch requirements

Production and staging have separate `COMMUNITY_DB` bindings. Apply `portal/migrations` to each target database before enabling accounts. Configure:

- `COMMUNITY_ORIGIN`: the exact HTTPS origin for that environment.
- `COMMUNITY_EMAIL_FROM`: an authenticated Cloudflare Email Sending address.
- `COMMUNITY_EMAIL`: the sending binding.
- `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`: environment secrets, never committed.
- `STRIPE_SUPPORTER_PRICE`: active AUD recurring price for the chosen account.
- `COMMUNITY_ENABLED`: keep false until email, billing and moderation launch checks pass.

Webhook URL: `/api/community/billing/webhook`. Subscribe to checkout completion, subscription creation/update/deletion, invoice paid and payment failed. Configure the Stripe customer portal for contribution management and cancellation.

## Verification on 8 September 2026

- Fifteen automated tests pass using real handlers, the migration schema, SQLite and the official Stripe/MCP SDKs. External calls use isolated fixtures. Coverage includes single-use links, expiration, sessions, origins, rate limiting, privacy/ownership, moderation, supporter gating/revocation, webhook signatures, duplicate/stale events, checkout retry recovery, record citations, bounded MCP responses and free-account availability during a Stripe outage.
- Chromium and WebKit passed the full local sign-in, profile, reading-list and discussion flows at 390, 768 and 1280 pixels, with no page errors or horizontal overflow.
- TypeScript checks pass.
- The desktop Stripe default profile authenticates to account `acct_1T1JiVQ4VFeV4av2` (business profile Noice, charges enabled). The saved profile display label is Ignite. User confirmation that this is the receiving account remains pending. Do not copy the temporary CLI login key into production.
- Production Worker secret names currently contain only the ARAG bindings; Stripe is not yet configured in Opax.
- Cloudflare email-domain activation was denied because the existing OAuth grant lacks Email Sending permissions. No real magic-link delivery has been verified.

## Remaining release gates

Confirm the receiving Stripe account and contribution amount; obtain durable service credentials; activate and verify email sending; perform real email delivery and Stripe test-mode checkout/cancellation; verify webhook entitlements and a real MCP client; assign moderation ownership; apply production migration; enable and verify production. Local fixtures do not prove these external gates.

The initial disabled staging preview was deployed and verified at `https://staging.opax.com.au/community`; its account status endpoint reports `enabled:false` and no configured contribution. Staging migration state reports no pending migrations. Preview content is explicitly marked as not yet open for sign-in or contributions.

Community and Support Opax links are included in the shared About navigation on desktop and mobile. Reading lists accept the existing `/doc/` record URLs, and MCP search/read results provide explicit absolute Opax citations. The record and search API shapes were checked against live public responses.
