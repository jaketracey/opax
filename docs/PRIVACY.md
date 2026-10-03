# OPAX privacy page and voice consent text

Drafted 3 October 2026 for W7 in [IOS-APP.md](IOS-APP.md#9-worker-changes). **Draft: Jake approves the wording before it deploys.** The page carries marked placeholders (`<mark class="privacy-confirm" data-confirm="P…">`) for facts and decisions that could not be verified from the repository.

## The placeholder guard

`scripts/check_privacy_placeholders.mjs` fails while any placeholder remains on the page, listing each ID. It runs at the end of `npm run check` and first in `npm run deploy` and `npm run deploy:staging`; the GitHub deploy workflow (`.github/workflows/deploy.yml`) deploys through `npm run deploy`, so the nightly refresh cannot publish an unfinished page either. A bare `npx wrangler deploy` bypasses it, as it already bypasses asset stamping; never deploy that way. `portal/test/privacy-placeholders.test.mjs` tests the detection itself. To fill a placeholder, replace the whole `<mark>` with the confirmed wording, then run `npm run check`.

| ID | What is needed |
| --- | --- |
| P1 | Publication date |
| P2 | Person or organisation responsible for the policy, matching the App Store seller |
| P3 | A private contact address for privacy and deletion requests |
| P4 | How long Cloudflare Email Sending keeps delivery records with recipient addresses |
| P5 | Workers Logs retention on OPAX's plan (3 days Free, 7 days Paid) and whether log entries record IP addresses |
| P6 | How long Cloudflare security and traffic analytics keep IP addresses |
| P7 | What the PostHog project does with the forwarded IP address after the location lookup ("Discard client IP data") |
| P8 | How long Progress keeps query text |
| P9 | The provider OpenRouter routes the generation preset to, and whether OpenRouter or it keeps prompts |
| P10 | ElevenLabs audio recording still off and transcript deletion after one day, checked in the dashboard |
| P11 | The voice agent's language model (documented as Gemini 3.5 Flash Lite) |
| P12 | Where ElevenLabs processes and stores call data |
| P13 | Region of the `opax-community` D1 database |
| P14 | A minimum age for accounts and voice, if any |
| P15 | D1 Time Travel window on OPAX's plan (7 days Free, 30 days Paid) and any other backup or export of the community database |
| P16 | How long Google Analytics and PostHog keep event data under OPAX's settings and plans |

## Where it lives

- **The page** is the `/privacy` panel in `portal/public/index.html` (`#panel-privacy`), routed in `app.js`, described in `STATIC_PAGES` and the sitemap in `src/index.ts`, and linked from the About menu, the mobile drawer and the footers of `index.html`, `home.html` and `community.html`. It is the privacy policy URL for the App Store listing and the app's Account and about screen: `https://opax.com.au/privacy`.
- **Section anchors** are stable and other surfaces link to them: `#voice` (the voice panel and the app's consent screen), `#voice-allowance`, `#privacy-questions`, `#privacy-deletion`, `#privacy-contact`. Keep these IDs if the page is rewritten.
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
| Every request logged, with its URL | `wrangler.jsonc` `observability.enabled`, `head_sampling_rate: 1`; Cloudflare [Workers Logs](https://developers.cloudflare.com/workers/observability/logs/workers-logs/) invocation logs (retention and IP fields are P5) |
| Catalog searches stay on OPAX's server; document searches (kind `all`, non-catalog kinds and `bill`) also go to Progress | `apiUnifiedSearch()` (`localWanted`, `documentsWanted`) in `src/index.ts`; `CATALOG_KINDS` in `src/catalog-search.ts` |
| Summaries run for any search with words unless turned off, catalog-only included, through Progress to the OpenRouter slot | `searchAnswerWanted` and `runSearchAnswer()` in `public/app.js`; `apiSearchSummary()` in `src/index.ts` |
| Questions go to Progress, then the model; follow-ups carry earlier turns | `buildAskBody()`, `chat_history` in `src/index.ts`; `*_MODEL` vars |
| OPAX's code adds no identifier; Progress can still receive the visitor's IP | `kbFetch()` builds fresh headers; Cloudflare [documents](https://developers.cloudflare.com/fundamentals/reference/http-headers/#cf-connecting-ip-in-worker-subrequests) that Worker subrequests to non-Cloudflare destinations carry the client IP in `CF-Connecting-IP` and `x-real-ip`; `aws-ap-southeast-2-1.rag.progress.cloud` resolved to AWS addresses on 3 October 2026 |
| OpenRouter is called by Progress, not the Worker | No OpenRouter host in `src/`; generation goes through the knowledge box's `generative_model` slot |
| Caches kept ten minutes to seven days, filed by question | `ASK_CACHE_TTL`, `SEARCH_CACHE_TTL` in `src/index.ts`; `src/generation-cache.ts` |
| Browser preferences; 20 conversations kept locally and copied to the account when signed in, earlier ones included | `CHAT_STORE_KEY`, `opax-ask-shape`, `SUMMARY_DISMISSED_KEY`, `opax-search-read`, `opax-chat-seed`; `chatSyncPush()` and `chatSyncPull()` in `public/app.js` |
| Analytics events and removals; browser details sent; identifiers, `_ga` two years, PostHog cookie one year plus local storage; first-visit URL in the PostHog cookie, stripped from events; Do Not Track; opax.com.au only; none on community pages | [ANALYTICS.md](ANALYTICS.md); `portal/analytics/index.js`, `privacy.mjs` (`beforeSend`), `ga.js`; posthog-js 1.427.2 defaults (`cookie_expiration: 365`, `localStorage+cookie`); Google's [cookie reference](https://business.safety.google/adscookies/); `community.html` loads no analytics |
| PostHog receives the reader's IP | `src/posthog.ts` forwards `cf-connecting-ip` as `x-forwarded-for` to `us.i.posthog.com`; `ip: false` is a no-op in posthog-js 1.427.2 (what PostHog keeps is P7) |
| Grants map tiles from OpenStreetMap | `portal/grants-map/index.js` |
| App: no analytics, no device identifier, seat and consent on device, catalog searches never reach Progress, Keychain session | [IOS-APP.md](IOS-APP.md) sections 1, 4 and 6 (design, not shipped code); `apiUnifiedSearch()` catalog branch |
| Account contents, public and private fields, 50 saved conversations, message policy, reply emails | `migrations/0001`, `0006`, `0009`, `0010`; [COMMUNITY.md](COMMUNITY.md) |
| Sign-in link and code: 15 minutes, single use, hash and keyed hash; sessions 30 days, no IP or device stored | `src/community-auth.ts`, `src/community-signin-code.ts`, `migrations/0001`, `0011` |
| Email through Cloudflare from login.opax.com.au | `wrangler.jsonc` `send_email`, `COMMUNITY_EMAIL_FROM` |
| MCP keys hashed, 90 days, three active, last-used time | `src/community.ts`, `src/community-mcp.ts` |
| ElevenLabs gets audio, typed text, a random call ID and the time limit from OPAX's code, never email or member ID; it can receive the IP | `voiceClientEvent()` and `connect()` in `src/voice.ts`; the Cloudflare subrequest behaviour above; `api.elevenlabs.io` resolved to a non-Cloudflare address on 3 October 2026 |
| Voice tool searches go through OPAX search | `runVoiceTool()` in `src/voice-tools.ts` |
| Recording off, transcripts one day, Gemini 3.5 Flash Lite | [VOICE-ASSISTANT.md](VOICE-ASSISTANT.md), configured 9 September 2026; **not verified live** (P10, P11) |
| Voice rows, 600 seconds, 40,000 a month, two calls; unused reservations returned or expire free; time can stay charged once connection setup starts | `src/voice.ts` (`claimVoiceSession()` moves the row to `connecting` before the provider calls; `finish` cancels only `reserved` rows); `migrations/0003`, `0004`, `0012`; [IOS-VOICE.md, routes](IOS-VOICE.md#routes); `portal/test/voice.test.mjs` |
| Deletion removes live rows at once; kept rows, five-minute housekeeping, one-day provider reference clean-up, fresh allowance | `src/community-deletion.ts`, `expireVoiceSessions()`, `wrangler.jsonc` crons; [COMMUNITY.md](COMMUNITY.md#account-deletion-w5-and-w6-live-since-3-october-2026), live since 3 October 2026 |
| Recovery history keeps deleted data for the plan's window | D1 [Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/) is always on: 7 days Free, 30 days Paid (the plan is P15) |
| Progress knowledge box in the AWS Sydney zone | `ARAG_ZONE` = `aws-ap-southeast-2-1` in `wrangler.jsonc` |
| PostHog in the United States | `us.i.posthog.com` in `src/posthog.ts` |

## Voice consent and notice strings (draft)

For the app's one-time consent step ([IOS-UX.md, 4.10](IOS-UX.md#410-talk-to-opax-voice); guideline 5.1.2(i)) and for the web voice panel if Jake adds the same step there (IOS-APP decision 10). **Do not adopt `voice.consent.kept` until P10 is confirmed**, and name the language model's provider consistently with the page once P11 is. "OPAX" follows the app's casing; the web panel still says "Opax" (IOS-UX open question 12).

| Key | Text |
| --- | --- |
| `voice.consent.title` | Before your first call |
| `voice.consent.what` | Talk to OPAX uses ElevenLabs, a third-party AI provider. During a call, your voice and anything you type go through OPAX to ElevenLabs, which turns your speech into text, writes the replies with a language model and speaks them. |
| `voice.consent.kept` (depends on P10) | ElevenLabs does not record the audio and deletes the conversation text after one day. OPAX keeps no recording or transcript. For each call it keeps the seconds reserved and used, the times, and ElevenLabs' reference for the conversation, to count your 10 free minutes. |
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
