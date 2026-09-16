# Opax insights

One command answers "how is traffic, and is anyone responding":

```sh
cd portal
npm run insights                 # last 14 days, every source
npm run insights -- --days 7
npm run insights -- --only social   # cloudflare | posthog | community | social
npm run insights -- --whois      # name the networks behind Ask callers
npm run insights -- --fresh      # bypass the Worker's 10-minute engagement cache
npm run insights -- --json
```

The script is `scripts/insights.mjs`. It never needs a deploy and never writes
anything. Each source is fetched independently, so a missing key or a refused
call degrades one section, not the report.

## Sources and what each one can and cannot tell you

| Section | Source | Credential | Read it as |
| --- | --- | --- | --- |
| Cloudflare zone | GraphQL `httpRequests1dGroups` (daily) and `httpRequestsAdaptiveGroups` (last 23h, free plan limit) on zone `de2bde52…` | wrangler's OAuth token in `~/.config/.wrangler/config/default.toml`; the script runs `wrangler whoami` to refresh it | Requests and "uniques" include every bot, crawler and headless fleet. The AU rows and the Ask callers table are the closest thing to a human floor. Empty-UA 504s are the Worker's own cache misses, not an outage (see the scraper-fleet notes in the memory index). |
| PostHog | HogQL over `events` in project 507367 | `POSTHOG_PERSONAL_API_KEY` with `query:read`, made at https://us.posthog.com/settings/user-api-keys | Real browsers only: posthog-js ignores headless Chrome and respects Do Not Track, so fleets never appear here. Data starts 7 Sep 2026 (the proxy IP fix). Ask counts include Jake's own testing. |
| Community | D1 `opax-community` via `wrangler d1 execute --remote` | wrangler OAuth | Members, sessions, threads, replies, saved chats, reading lists, voice sessions, MCP keys, and the daily-edition journal (`social_editions`, `social_deliveries`). |
| Social | `GET /api/daily-post/status` (public) and `GET /api/daily-post/engagement` (operator) | `DAILY_POST_OPERATOR_SECRET`, the same bearer as the operator run route | Followers per account and views, likes, comments and shares on the latest feed posts, read live from X, Facebook and Instagram. Stories expire and are skipped. Every read is metered, so the Worker caches the answer for ten minutes; `--fresh` bypasses it. A platform that refuses shows as a code under "Platform refusals", never a body. |

Keys live in `~/.config/opax/insights.env` as `KEY=VALUE` lines (mode 600), or
in the environment. Nothing is read from the repository.

## The engagement route

`GET /api/daily-post/engagement` on the `opax-portal` Worker is implemented by
`socialEngagement()` in `portal/src/social-publication.ts`. It reads the last
ten posted `x`, `facebook` and `instagram` receipts from `social_deliveries`
and asks each platform for the account's public metrics and the posts' public
metrics:

- X: `GET /2/users/me?user.fields=public_metrics`, then one
  `GET /2/tweets?ids=…&tweet.fields=public_metrics` (OAuth 1.0a user context).
- Facebook: `/{page}?fields=followers_count,fan_count` and, per post,
  `reactions.summary(total_count)`, `comments.summary(total_count)`, `shares`.
- Instagram: `/{account}?fields=followers_count,media_count` and, per media,
  `like_count,comments_count`.

Tests: `portal/test/social-publication.test.mjs` ("engagement reads account and
feed-post metrics"). The route is bearer-guarded and returns 401 without the
operator secret; the result is cached in `GENERATION_CACHE` under
`daily-post:engagement` for 600 s.

## What is not covered

- Reddit: the launch post (r/SideProject, `1wcclsf`) has no public JSON any
  more; read it in a browser.
- Google Analytics: the GA4 property mirrors PostHog's allowlisted events; use
  PostHog.
- X mentions and DMs: the X API charges per read and the notifications page is
  richer; open https://x.com/notifications in the @OpaxAustralia profile.
