# OPAX privacy page and voice consent text

Drafted 3 October 2026 for W7 in [IOS-APP.md](IOS-APP.md#9-worker-changes) and published on 6 October 2026, when Jake asked for the remaining placeholders to be filled with verified facts or honest interim wording ("Any placeholder stuff can be filled in quickly later"). `/support` shipped with it.

## The placeholder guard

`scripts/check_privacy_placeholders.mjs` fails while any placeholder (`<mark class="privacy-confirm" data-confirm="P…">`) remains on the page, listing each ID. It fails closed: a placeholder element counts whatever its attribute quoting (double, single or none), and so does any other mention of `privacy-confirm` or `data-confirm`, or any "[To confirm" or "[To decide" text that has lost its wrapper (reported as `?`). Comments and `<style>` blocks are ignored. It runs at the end of `npm run check` and first in `npm run deploy` and `npm run deploy:staging`; the GitHub deploy workflow (`.github/workflows/deploy.yml`) deploys through `npm run deploy`. A bare `npx wrangler deploy` bypasses it, as it already bypasses asset stamping; never deploy that way. `portal/test/privacy-placeholders.test.mjs` tests the detection, the command's exit codes on fixture pages, and that `check`, `deploy` and `deploy:staging` all run it (the deploys first). The page has none today; keep the guard for any future draft.

## How the sixteen placeholders were filled (6 October 2026)

Verified facts came from read-only checks; where none was checkable, the page says what OPAX does and links to the provider's own terms. Items marked **verify** need Jake to confirm in a dashboard; the page's wording stays true either way.

| ID | Now on the page | Source |
| --- | --- | --- |
| P1 | Last updated 6 October 2026 | Publication date |
| P2 | Run by Jake Tracey, as an independent side project, who is responsible for the policy | The About page ("a side project of Jake Tracey, of Noice") |
| P3 | No private contact address yet, one is coming; until then delete the account yourself, change it while signed in, or use public GitHub issues | Cloudflare API GET: Email Routing on `opax.com.au` is `unconfigured`; no MX records for `opax.com.au` or `login.opax.com.au` |
| P4 | Cloudflare's email service keeps its own delivery records, under Cloudflare's privacy policy | Cloudflare documents email logs for Email Service; no retention period found |
| P5 | Worker logs kept 7 days; each entry has the URL, so search words; Cloudflare may record connection details such as the IP | Workers Paid (see P15); Cloudflare documents 7 days on Paid; script settings GET: `invocation_logs: true`, `redact_query_string: false`. IP fields not readable by GET (**verify** in the Workers Logs view) |
| P6 | Cloudflare's traffic and security analytics record requests with IP addresses, kept 31 days | Cloudflare [GraphQL limits](https://developers.cloudflare.com/analytics/graphql-api/limits/) (adaptive datasets 31 days on every plan) and Security Events (up to 31 days); zone plan Free Website |
| P7 | PostHog receives the forwarded IP and "may store the address with the event" | `src/posthog.ts`; no PostHog key or MCP was available (**verify** "Discard client IP data" in project 507367; if on, say it is discarded after the lookup) |
| P8 | Progress's own terms apply, with its privacy policy linked | No retention found |
| P9 | Generation goes through OpenRouter, called by Progress; no model is named, because `portal/` pins only an `openai-compatible` slot and the preset's model lives in OpenRouter. OpenRouter's policy and the routed provider's apply | `ASK_MODEL` and the other `*_MODEL` vars in `wrangler.jsonc` |
| P10 | "When OPAX last checked (9 September 2026), its voice assistant was set at ElevenLabs not to record audio and to delete transcripts after one day. ElevenLabs' own privacy policy also applies." A dated configuration, not a guarantee | [VOICE-ASSISTANT.md](VOICE-ASSISTANT.md), 9 September 2026 (**verify** in the ElevenLabs dashboard, then update the date) |
| P11 | No model named: "a language model that ElevenLabs runs for the assistant" | The model is an ElevenLabs agent setting, not pinned in `portal/` |
| P12 | Standard service, not a residency service; ElevenLabs states data is stored in the United States, with processing possible elsewhere | `PROVIDER_ORIGIN = https://api.elevenlabs.io` in `src/voice.ts`; ElevenLabs [data residency](https://elevenlabs.io/docs/overview/administration/data-residency) |
| P13 | Community database in Cloudflare's Oceania region | `wrangler d1 info opax-community`: `running_in_region OC`, no jurisdiction |
| P14 | Accounts and voice are for people aged 16 and over; no date of birth asked or checked | Jake's decision, 6 October 2026 (conservative, given Australia's social media minimum age rules); the same line is on the community sign-in form, the web voice panel and `/support` |
| P15 | D1 recovery history covers the last 30 days; no other scheduled backup or export | `wrangler d1 time-travel info`: a 16-day-old bookmark exists and the limit is "the last 30 days" (Workers Paid); no export or backup in the repository |
| P16 | Both analytics services keep events for the retention period of OPAX's account, under their policies | No PostHog or GA settings read (**verify**) |

## Where it lives

- **The page** is the `/privacy` panel in `portal/public/index.html` (`#panel-privacy`), routed in `app.js`, described in `STATIC_PAGES` and the sitemap in `src/index.ts`, and linked from the About menu, the mobile drawer and the footers of `index.html`, `home.html` and `community.html`. It is the privacy policy URL for the App Store listing and the app's Account and about screen: `https://opax.com.au/privacy`.
- **Section anchors** are stable and other surfaces link to them: `#voice` (the voice panel and the app's consent screen), `#voice-allowance`, `#privacy-questions`, `#privacy-deletion`, `#privacy-contact`. Keep these IDs if the page is rewritten.
- **`/support?record=<path>`** names a reported record, by its catalog title, and puts its path in the public GitHub issue only when the path is exactly the page of a record OPAX publishes. `npm run build:search` writes a path index beside the catalog shards (`search-catalog/<version>/paths-<n>.json`, 256 files keyed by an FNV-1a hash of the canonical path). Each path takes the title of the record that owns its page: the grant-recipient record, or the record whose kind matches the route. `/support` loads `public/record-paths.js` and the one index file lazily, only when a `record` is given. The path is decoded once and refused with dot segments or encoded separators before any lookup. A miss, a failed fetch or being offline leaves the report general, with no path in it.
- **The old community view** `/community?view=privacy` hands over to `/privacy`, keeping any fragment, before any account request. Sign-in emails already sent and the web voice panel (`portal/voice/client.js`, `/community?view=privacy#voice`) still link there, so keep the hand-over.

## Keep the page true

The page states facts about the live system. Change it in the same commit as any change to:

- what a table in `portal/migrations/` stores about a member, or what account deletion removes or keeps (`src/community-deletion.ts`);
- rate limits keyed to IP addresses (`wrangler.jsonc` `ratelimits`, `limit()` callers in `src/`), logging (`observability`) or anything that forwards a client address (`src/posthog.ts`);
- analytics (`portal/analytics/`, `public/gtm.js`, [ANALYTICS.md](ANALYTICS.md)), browser storage keys in `public/*.js`, or chat sync to the account;
- which searches reach Progress or a model (`apiUnifiedSearch()`, `apiSearchSummary()`, the Ask routes), or a provider that receives reader data: Progress Agentic RAG, the OpenRouter model pins, ElevenLabs, Google, PostHog, OpenStreetMap tiles, Cloudflare Email Sending;
- the voice allowance, monthly budget, concurrency, reservation accounting or provider settings ([VOICE-ASSISTANT.md](VOICE-ASSISTANT.md));
- what the iPhone app stores, sends or asks permission for.

Then update the "Last updated" date. The page's history is this repository's history.

## Claims and their sources

| Claim on the page | Source |
| --- | --- |
| Ask 20, follow-ups and summaries 20, search 120, share images 60 a minute per address | `wrangler.jsonc` `ratelimits`; `rateLimited()` keyed by `cf-connecting-ip` in `src/index.ts`; `apiSearchSummary()` uses `FOLLOWUPS_LIMITER` |
| Some automated networks refused | `src/network-block.ts`, `BLOCKED_ASNS`, `GENERATION_BLOCKED_*` |
| Sign-in, account and voice counters stored as SHA-256 of key and window; expired rows deleted a day or more later during sign-in requests | `limit()` in `src/community-core.ts`; cleanup batch in `src/community-auth.ts` |
| Requests the server handles (pages, `/api/*`, `/ingest/*`, `/og/*`, `/mcp`) are logged with their URL; files served as they are skip the server and its logs | `wrangler.jsonc` `observability` (enabled, `head_sampling_rate: 1`) and `assets.run_worker_first`; Cloudflare [Workers Logs](https://developers.cloudflare.com/workers/observability/logs/workers-logs/#invocation-logs) and [asset routing](https://developers.cloudflare.com/workers/static-assets/routing/worker-script/) (retention and IP fields are P5) |
| Catalog searches stay on OPAX's server; document searches (kind `all`, non-catalog kinds and `bill`) also go to Progress | `apiUnifiedSearch()` (`localWanted`, `documentsWanted`) in `src/index.ts`; `CATALOG_KINDS` in `src/catalog-search.ts` |
| Summaries run for any search with words unless turned off, catalog-only included, through Progress to the OpenRouter slot | `searchAnswerWanted` and `runSearchAnswer()` in `public/app.js`; `apiSearchSummary()` in `src/index.ts` |
| Questions go to Progress, then the model; follow-ups carry earlier turns | `buildAskBody()`, `chat_history` in `src/index.ts`; `*_MODEL` vars |
| OPAX's code adds no identifier; Progress can still receive the visitor's IP | `kbFetch()` builds fresh headers; Cloudflare [documents](https://developers.cloudflare.com/fundamentals/reference/http-headers/#cf-connecting-ip-in-worker-subrequests) that Worker subrequests to non-Cloudflare destinations carry the client IP in `CF-Connecting-IP` and `x-real-ip`; `aws-ap-southeast-2-1.rag.progress.cloud` resolved to AWS addresses on 3 October 2026 |
| OpenRouter is called by Progress, not the Worker | No OpenRouter host in `src/`; generation goes through the knowledge box's `generative_model` slot |
| Caches kept ten minutes to seven days, filed by question | `ASK_CACHE_TTL`, `SEARCH_CACHE_TTL` in `src/index.ts`; `src/generation-cache.ts` |
| Two lasting preferences (`opax-ask-shape`, `SUMMARY_DISMISSED_KEY`, removed when summaries are turned back on); tab-only state (`opax-search-read`, and `opax-chat-seed`, removed when the conversation opens); up to 20 conversations (`CHAT_STORE_MAX`, also trimmed by `CHAT_STORE_BYTES` and quota), deletable, with the account copy deleted too when signed in; copied to the account when signed in, earlier ones included | `public/app.js`: `setSummaryDismissed()`, `sessionStorage` uses, `chatStoreWrite()`, `deleteSavedChat()`, `chatSyncPush()`, `chatSyncPull()` |
| Analytics events and removals; browser details sent; identifiers, `_ga` two years, PostHog cookie one year plus local storage; first-visit URL in the PostHog cookie, stripped from events; Do Not Track; opax.com.au only; none on community pages | [ANALYTICS.md](ANALYTICS.md); `portal/analytics/index.js`, `privacy.mjs` (`beforeSend`), `ga.js`; posthog-js 1.427.2 defaults (`cookie_expiration: 365`, `localStorage+cookie`); Google's [cookie reference](https://business.safety.google/adscookies/); `community.html` loads no analytics |
| PostHog receives the reader's IP | `src/posthog.ts` forwards `cf-connecting-ip` as `x-forwarded-for` to `us.i.posthog.com`; `ip: false` is a no-op in posthog-js 1.427.2 (what PostHog keeps is P7) |
| Grants map tiles from OpenStreetMap | `portal/grants-map/index.js` |
| App: no analytics, no device identifier, seat and consent on device, catalog searches never reach Progress, Keychain session | [IOS-APP.md](IOS-APP.md) sections 1, 4 and 6; the app's privacy manifest (`NSPrivacyTracking` false, no collected types); `apiUnifiedSearch()` catalog branch |
| Account contents, public and private fields, 50 saved conversations, message policy, reply emails | `migrations/0001`, `0006`, `0009`, `0010`; [COMMUNITY.md](COMMUNITY.md) |
| Sign-in link and code: 15 minutes, single use, hash and keyed hash; sessions 30 days, no IP or device stored | `src/community-auth.ts`, `src/community-signin-code.ts`, `migrations/0001`, `0011` |
| Email through Cloudflare from login.opax.com.au | `wrangler.jsonc` `send_email`, `COMMUNITY_EMAIL_FROM` |
| MCP keys hashed, 90 days, three active, last-used time | `src/community.ts`, `src/community-mcp.ts` |
| ElevenLabs gets audio, typed text, a random call ID and the time limit from OPAX's code, never email or member ID; it can receive the IP | `voiceClientEvent()` and `connect()` in `src/voice.ts`; the Cloudflare subrequest behaviour above; `api.elevenlabs.io` resolved to a non-Cloudflare address on 3 October 2026 |
| Voice tool searches go through OPAX search | `runVoiceTool()` in `src/voice-tools.ts` |
| Recording off and one-day transcripts as of the last check (9 September 2026) | [VOICE-ASSISTANT.md](VOICE-ASSISTANT.md); **not verified live** (P10). The model is not named (P11) |
| Voice rows, 600 seconds, 40,000 a month, two calls; unused reservations returned or expire free; time can stay charged once connection setup starts | `src/voice.ts` (`claimVoiceSession()` moves the row to `connecting` before the provider calls; `finish` cancels only `reserved` rows); `migrations/0003`, `0004`, `0012`; [IOS-VOICE.md, routes](IOS-VOICE.md#routes); `portal/test/voice.test.mjs` |
| Deletion removes live rows at once; kept rows, five-minute housekeeping, one-day provider reference clean-up, fresh allowance | `src/community-deletion.ts`, `expireVoiceSessions()`, `wrangler.jsonc` crons; [COMMUNITY.md](COMMUNITY.md#account-deletion-w5-and-w6-live-since-3-october-2026), live since 3 October 2026 |
| Recovery history keeps deleted data for the plan's window | D1 [Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/) is always on: 7 days Free, 30 days Paid (the plan is P15) |
| Progress knowledge box in the AWS Sydney zone | `ARAG_ZONE` = `aws-ap-southeast-2-1` in `wrangler.jsonc` |
| PostHog in the United States | `us.i.posthog.com` in `src/posthog.ts` |
| App (in testing): if you use Use my location, one reading on the iPhone, never sent or stored, outlines fetched before the fix, no background location | iOS lane `ios/electorate-map`: `docs/IOS-ELECTORATE-MAP.md`, `mobile/src/features/electorate-map/location.ts`, `NSLocationWhenInUseUsageDescription`, `tests/location-privacy.test.ts`. Worded conditionally: sign-in, voice, deletion and location are not in a released build yet |
| App (in testing): if you use voice, consent is stored on the iPhone and withdrawn on the voice screen; calls end when the app leaves the foreground | Decision 10 (6 October 2026); iOS lane `ios/talk-sheet` (`TalkScreen.tsx`). Conditional wording, as above |

## Voice consent and notice strings

Drafted for the app's one-time consent step ([IOS-UX.md, 4.10](IOS-UX.md#410-talk-to-opax-voice); guideline 5.1.2(i)) and for the web voice panel, which decision 10 adds later. The app ships its own wording in `TalkScreen.tsx` (lane `ios/talk-sheet`); keep it and these consistent with the page's voice section. `voice.consent.kept` gives the ElevenLabs settings as of the last check (P10); after Jake's dashboard check, update the date in it and on the page together. "OPAX" follows the app's casing; the web panel still says "Opax" (IOS-UX open question 12).

| Key | Text |
| --- | --- |
| `voice.consent.title` | Before your first call |
| `voice.consent.what` | Talk to OPAX uses ElevenLabs, a third-party AI provider. During a call, your voice and anything you type go through OPAX to ElevenLabs, which turns your speech into text, writes the replies with a language model and speaks them. |
| `voice.consent.kept` (dated, P10) | When OPAX last checked (9 September 2026), its voice assistant was set at ElevenLabs not to record audio and to delete transcripts after one day. ElevenLabs' own privacy policy also applies. OPAX keeps no recording or transcript. For each call it keeps the seconds reserved and used, the times, and ElevenLabs' reference for the conversation, to count your 10 free minutes. |
| `voice.consent.identity` | OPAX does not give ElevenLabs your email address. |
| `voice.consent.accuracy` | Answers may be mistaken; check the linked records. |
| `voice.consent.link` | Voice privacy (opens `https://opax.com.au/privacy#voice`) |
| `voice.consent.agree` | Agree and start |
| `voice.consent.decline` | Not now |
| `voice.consent.declined` | No call was started. Your microphone is off. |
| `account.voiceConsent.given` | Voice consent: given {date} |
| `account.voiceConsent.none` | Voice consent: not given |
| `account.voiceConsent.withdraw` | Withdraw |
| `account.voiceConsent.withdrawn` | Voice consent withdrawn. OPAX will ask again before your next call. |
| `voice.notice.everyCall` (unchanged from the web) | AI voice powered by ElevenLabs. Answers may be mistaken; check the linked records. |
| `voice.notice.microphone` (unchanged from the web) | Your microphone starts when you choose Start talking. |
| `NSMicrophoneUsageDescription` | OPAX uses the microphone only during a voice call you start. Your speech is sent to ElevenLabs, OPAX's voice provider, to understand and answer you. OPAX keeps no recordings. |

Agreeing starts the flow described in IOS-UX 4.10: microphone permission, then the reservation. "Not now" reserves nothing and never asks for the microphone. If guideline 4.7 is found to apply, its "in each instance" wording may require this step before every call rather than once (IOS-VOICE section 6).
