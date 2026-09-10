# Daily X post

One post a day on the OPAX X account, rotating through a politician, a bill and a
topic, built from the site's own static data. Nothing is generated at post time and
no model is involved, so the account cannot hallucinate: every line comes from the
roster, the bills registry or a report file, and every post links to the page the
numbers came from.

Code: `portal/src/daily-post.ts`. Tests: `portal/test/daily-post.test.mjs`.
Trigger: `triggers.crons` in `portal/wrangler.jsonc` (22:00 UTC, which is 08:00
AEST / 09:00 AEDT). Handler: `scheduled()` in `portal/src/index.ts`.

## What it posts

The kind rotates by calendar day (Melbourne time):

| Kind | Source | Text |
|---|---|---|
| politician | `/parliamentarians.json`, current members with 200+ speeches, top topics from `/api/person-topics` | name, party, seat, speech count since first year, three most-discussed topics, link to the person page |
| bill | `/bills/index.json`, bills before parliament or passed in the last year, with a summary | title, introduced date and sponsor (or portfolio), status, first one or two summary sentences, link to the bill page |
| topic | `/reports/index.json`, reports with speech stats | title, speech and speaker counts, three loudest current voices, blurb, link to the report |

The subject is chosen by a seeded hash of the date, so `preview` for a date shows
exactly what that day will post. The last 90 featured subjects are kept in the
`GENERATION_CACHE` KV under `daily-post:recent` and are skipped so nothing repeats
within a season. If a kind has nothing to say (no bills before parliament, say) it
falls through to the next kind.

Posts are trimmed to X's 280 characters with URLs counted as 23; optional lines are
dropped in order before anything is cut.

## Preview

```
https://opax.com.au/api/daily-post/preview                 # today
https://opax.com.au/api/daily-post/preview?date=2026-09-12
https://opax.com.au/api/daily-post/preview?date=2026-09-12&kind=bill
```

Never posts. Returns the `DailyPost` JSON (kind, subject, title, text, url).

## Turning it on

The cron is deployed and runs daily, but it only posts when all of these hold:

1. `DAILY_POST_ENABLED` is `"true"` in `wrangler.jsonc` vars (it is; staging is `"false"`).
2. The four X secrets exist on the Worker.
3. The run is not on staging (`STAGING_API` binding absent).
4. Nothing has been posted yet for that Melbourne date (`daily-post:sent:<date>` in KV).

Otherwise the run logs `skipped` or `dry-run` with the composed post and exits.

### X credentials

The post uses X API v2 `POST /2/tweets` with OAuth 1.0a user context. On the free
tier that is plenty for one post a day.

1. Sign in to https://developer.x.com with the OPAX account and create a project
   and app (Free tier is enough).
2. In the app's *User authentication settings*, set permissions to **Read and write**
   and type to *Web App, Automated App or Bot* (callback and website URLs can be
   `https://opax.com.au`).
3. Under *Keys and tokens*, copy the **API Key and Secret** and generate an
   **Access Token and Secret** for the account. If the access token was generated
   before permissions were changed to read and write, regenerate it.
4. From `portal/` on a machine with wrangler logged in:

   ```
   npx wrangler secret put X_API_KEY
   npx wrangler secret put X_API_SECRET
   npx wrangler secret put X_ACCESS_TOKEN
   npx wrangler secret put X_ACCESS_TOKEN_SECRET
   ```

   Secrets take effect without a redeploy. The next 22:00 UTC run posts.

Kill switch: set `DAILY_POST_ENABLED` to `"false"` and deploy, or delete any one of
the secrets (`npx wrangler secret delete X_ACCESS_TOKEN`).

## Testing the cron locally

```
cd portal
npx wrangler dev --test-scheduled
curl "http://localhost:8787/cdn-cgi/local/scheduled?cron=0+22+*+*+*"
```

Without the secrets in `.dev.vars` the run is a dry run and logs the composed post.

## Checking a run

Workers observability logs each run as one `daily-post` line with the status,
reason, subject and (when posted) the post id. `wrangler tail --format pretty`
shows it live.
