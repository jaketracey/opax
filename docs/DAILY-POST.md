# Opax social publication

The production Worker prepares one source-based edition per Melbourne calendar day.
X: https://x.com/OpaxAustralia (account ID 2099044188113485825).
Facebook and Instagram require their own connected brand accounts before enabling.
Preferred matching handle: OpaxAustralia; availability is not yet confirmed on Meta.

## Editorial approach

Rotate parliamentary members, bills and topic reports. Lead with a question or an
explanation of what a bill changes. Count only the records collected by Opax and
avoid describing an old report as current. Link to the exact source page. Bill
captions identify machine-written summaries and invite readers to check official
sources. No model runs at posting time; source data and summaries can still contain
errors, so they are not a guarantee of factual accuracy.

X gets concise copy within 280 characters; Facebook gets a longer caption and a
clickable link; Instagram gets the matching JPEG, a longer caption and a link-in-bio
instruction. Set Instagram's profile link to https://opax.com.au. Share images use
the same metadata and fonts as the page, including bill-specific cards. X/Facebook
links include platform-specific UTM attribution. Do not tag unrelated people, send
DMs, automate replies, or imply a funding relationship proves wrongdoing.

The first schedule is 22:00 UTC (08:00 AEST / 09:00 AEDT). Checks at +5 and +10
minutes finish an Instagram container that is still processing. They do not resend
successful posts. A container still pending after the third check needs operator
review; the following day is a new edition.

## Connection

X requires the four Worker secrets X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN and
X_ACCESS_TOKEN_SECRET. The app needs Read and write permissions (no DMs or email).
The configured X_ACCOUNT_ID and X_USERNAME must match GET /2/users/me before any
write. API access uses prepaid credits; the old free-tier instructions are obsolete.
At the published 13 September 2026 rates a URL post is US$0.20, plus identity reads:
https://docs.x.com/x-api/getting-started/pricing. Verify the console rate and balance.

Facebook requires FACEBOOK_PAGE_ID and a FACEBOOK_PAGE_TOKEN for that Page.
The app needs pages_manage_posts, pages_read_engagement and pages_show_list, with
CREATE_CONTENT access. The token's /me ID must match the configured Page.
Instagram requires a professional account, INSTAGRAM_ACCOUNT_ID,
INSTAGRAM_USERNAME and INSTAGRAM_ACCESS_TOKEN, with instagram_basic and
instagram_content_publish via Facebook Login and appropriate access to the linked
Page. Account/app roles and Meta review requirements must be satisfied. We use
Graph API v25.0. Check token expiry and complete any Page publishing authorization.

Install credentials using Wrangler's secure prompts or a mode-0600 JSON file with
`npx wrangler secret bulk /secure/path/credentials.json --env=''`. Never put secret
values on command lines, in logs, in Git, or in this document. Store only the listed
social secrets; the operation must preserve other Worker secrets.

Set FACEBOOK_POST_ENABLED / INSTAGRAM_POST_ENABLED to "true" only after identity,
permissions and a live test are verified. Each defaults to false. X uses
DAILY_POST_ENABLED. Staging always refuses publication. Configure brand account IDs
and names in wrangler.jsonc; never connect a personal account as a substitute.

## Delivery records and operation

Apply migrations before deploying: `npx wrangler d1 migrations apply COMMUNITY_DB
--remote --env=''`. Migration 0005 adds social_editions and social_deliveries.
The edition is frozen in D1 so every channel uses the same copy. A primary key on
(date, channel) atomically claims each delivery. Successful channel receipts do not
block unfinished channels. The previous X runner's KV sent keys are respected.
Recently published subjects are excluded for 90 days; an exhausted category falls
through to another, never silently repeats an excluded subject.

- Preview: `/api/daily-post/preview?date=YYYY-MM-DD` (no posting; returns frozen
  copy when available and per-platform captions/image URLs).
- Optional `&kind=bill`, `politician` or `topic` previews that category.
- Status: `/api/daily-post/status` (configuration readiness and today's receipts;
  no credentials or raw provider error bodies).
- Logs: `npx wrangler tail --env=''`; look for `daily-post`.
- Tests: `node --test test/daily-post.test.mjs test/social-publication.test.mjs
  test/bill-social-card.test.mjs` from portal/.

`posted` requires a provider post ID. A timeout or malformed success after a write
becomes `review_required`; do not retry it without reading the platform's actual
posts. `sending` after a crash also needs reconciliation. Preflight errors are
`failed`, and are not automatically retried that day. Check the target account,
repair the connection, then reconcile/reset only that channel's row if confirmed
unsent. No public endpoint can trigger posting or reset these receipts.

Before publishing, the runner checks that the source page and matching JPEG return
success. A generic fallback image or mismatched route prevents posting. PNG cards
remain available for X/Facebook. `/og/<page>.jpg` returns actual JPEG bytes and an
error rather than a misleading PNG fallback when no matching card exists.

Brand exports: `node scripts/build_social_brand.mjs` renders the existing Opax
favicon and brand fonts into public/social/opax-avatar.png and opax-header.png.
