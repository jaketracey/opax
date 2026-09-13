# Opax social publication

The production Worker prepares one source-based edition per Melbourne calendar day.
X: https://x.com/OpaxAustralia (account ID 2099044188113485825).
Facebook: https://www.facebook.com/OpaxAustralia/ (Page ID 1322885877574835).
Instagram: https://www.instagram.com/opaxaustralia/ (professional account ID
17841433372413296, linked to the Opax Page).
Facebook and Instagram API publishing was verified on 13 September 2026, and both
channels are enabled. X still needs its four posting credentials installed.

## Editorial approach

Rotate politician statistics, bills, individual grant awards and topic reports.
Lead with a concrete number or an explanation of what a bill changes. Count only the records collected by Opax and
avoid describing an old report as current. Link to the exact source page. Bill
captions identify machine-written summaries and invite readers to check official
sources. No model runs at posting time; source data and summaries can still contain
errors, so they are not a guarantee of factual accuracy.

X gets concise copy within 280 characters; Facebook gets a longer caption and a
clickable link; Instagram gets the matching JPEG as the portrait card (1080 x 1350,
`?format=portrait`, the same data stood upright so the feed and grid do not crop
it), a longer caption and a link-in-bio instruction. Set Instagram's profile link
to https://opax.com.au. Share images use the same metadata and fonts as the page,
including bill-specific cards; the page's own og:image stays landscape. X/Facebook
links include platform-specific UTM attribution. Do not tag unrelated people, send
DMs, automate replies, or imply a funding relationship proves wrongdoing.

The first schedule is 22:00 UTC (08:00 AEST / 09:00 AEDT). Checks at +5 and +10
minutes finish an Instagram container that is still processing. They do not resend
successful posts. A container still pending after the third check needs operator
review; the following day is a new edition.

## Carousels

Since 14 September 2026 the edition is also told as a carousel: a run of three to
ten slides at 1080 x 1350, one fact each, opened by a photograph and closed by the
source. Instagram posts the run as one carousel; Facebook posts the same slides as
a multi-photo post; X keeps its text and link. An edition composed before carousels
existed, or one whose records do not support a story, posts as the single portrait
card exactly as before.

The slides are the edition's own records, no model at post time. `src/story.ts` is
the contract: the nine slide types (cover, number, picture, bars, ledger, timeline,
division, list, source), the licence check and the photo lookup. `daily-post.ts`
writes `slides[]` beside `text` and `caption` for each kind; `og.ts` draws them;
`social-publication.ts` posts them. Every slide keeps the masthead, the rule and the
bronze foot so the run reads as Opax mid-swipe and in the grid. The slide after the
cover is the edition's one number; the middle slides carry one fact each with its
caveat on the slide; one slide is the cross-reference only Opax can make (the same
recipient's other awards, the electorate's grants, the seat's member); the last
slide is the source, with the page URL as the largest type because Instagram links
do not click.

Photographs come only from `public/social/photos.json`, a catalogue a person has
approved: the file, author, licence, Commons page and the credit line drawn on the
slide's foot and repeated in the caption. Accepted licences are CC0, public domain,
CC BY and CC BY-SA (the decision to accept ShareAlike was taken on 14 September
2026; the composed slide is offered on the same terms). The catalogue lists photo
ids by subject (`grant:GA34203`, `person:Bob Katter`) and by kind (`bill:senate`,
`bill:representatives`, `politician`, `topic`); the composer takes the subject's
own photographs first, then the kind's. With no approved photograph the cover is the
engraving card and the story still runs. `node scripts/propose_social_photos.mjs
search "<query>"` lists what Wikimedia Commons has for a subject with its licence;
`… approve "<File:…>" --id <slug> --subject <id> | --kind <kind>` downloads the file
at 1200px into `public/social/photos/` and writes the catalogue entry. The Worker
never posts a photograph that is not in the file.

Slides are served at `/og/story/<date>/<n>.jpg` from the frozen edition (or, for a
date with no stored edition, from the same composition the preview shows), each
answering `x-opax-story: <date>/<n>` and `x-opax-format: portrait`. The publisher
preflights every slide before any write and records `Story slide unavailable` for
that channel if one does not answer; X still posts. Instagram's receipt records the
carousel's parent container so a run that finds it still processing resumes the
same container at the next check without recreating the children. Facebook's
photos are uploaded unpublished and attached to one feed post, so an interrupted
run leaves nothing visible. A Meta write that carries an image URL is answered only
after Meta has fetched the image, so those calls are given 90 seconds (reads keep
20); a call that still runs out is recorded as `Provider timeout`.

## Source selection and refresh

Politician captions include top topic shares when available. The denominator is
labelled speeches and labels can overlap. Topic comparisons use completed years
only and describe the collected records, not changing levels of political activity.
Bills must have a usable summary and a non-future introduction/passage date within
a year; selection favours the newest unfeatured records. Exposure drafts are not
assumed to remain open for consultation.

`npm run build:social` builds `public/social/grants.json` from published federal
recipient shards. Both deploy scripts include this step. The shortlist retains
organisation awards with descriptions and direct GrantConnect source links.
Publication chooses from the newest eligible awards with agreement start dates in
the preceding 120 days. These are start dates, not announcement dates. Award values
are not payments. A recently featured recipient is skipped even for a new award.

Grant URLs use `?award=GA…` to show the exact award above the recipient overview.
The page and share-image canonical URLs retain that award identifier; the publisher
checks the image's award identifier before posting. Missing or mismatched awards
fail closed. The share-image version is 4.

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

The installed Meta Page token was verified for this app, Page and Instagram account
on 13 September 2026. It has no fixed token expiry; Meta reports data access expiry
on 12 December 2026. Revalidate and renew authorization before that date, and after
any account, password, app-role or Page-permission changes. Only the Opax Page and
@opaxaustralia were selected in the publishing authorization. Inbox access is off.

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
- Operator run: `POST /api/daily-post/run` with `Authorization: Bearer $DAILY_POST_OPERATOR_SECRET`
  and a JSON body `{date, kind?, subject?, channels?, dry_run?}` composes a chosen edition
  under the given journal date (default today) and delivers it to the named channels
  (default every ready channel). `subject` may name one award as
  `grant:GA34203@abn:97694995462`, read from the recipient's source shard whatever its age.
  The journal still rules: an edition stored under that date is reused and a delivered
  channel is never posted twice, so use a date with no edition for a test post.
  `dry_run: true` returns the composed edition and per-channel copy without posting.
- Status: `/api/daily-post/status` (configuration readiness and today's receipts;
  no credentials or raw provider error bodies).
- Logs: `npx wrangler tail --env=''`; look for `daily-post`.
- Tests: `node --test test/daily-post.test.mjs test/social-publication.test.mjs
  test/bill-social-card.test.mjs test/og-story.test.mjs` from portal/.

`posted` requires a provider post ID. A timeout or malformed success after a write
becomes `review_required`; do not retry it without reading the platform's actual
posts. `sending` after a crash also needs reconciliation. Preflight errors are
`failed`, and are not automatically retried that day. Check the target account,
repair the connection, then reconcile/reset only that channel's row if confirmed
unsent. No public endpoint can trigger posting or reset these receipts.

Before publishing, the runner checks that the source page and matching JPEG return
success. A generic fallback image or mismatched route prevents posting. PNG cards
remain available for X/Facebook. `/og/<page>.jpg` returns actual JPEG bytes and an
error rather than a misleading PNG fallback when no matching card exists. The
Instagram image must also answer `x-opax-format: portrait`; a landscape answer to
the portrait URL (an older Worker, a fallback) is recorded as `Portrait image
unavailable` and only that channel fails.

Brand exports: `node scripts/build_social_brand.mjs` renders the existing Opax
favicon to public/social/opax-avatar.png and updates the editable SVG covers.
The approved opax-header.png and opax-facebook-cover.png are preserved by default;
`--render-covers` explicitly replaces them with new SVG raster exports.
