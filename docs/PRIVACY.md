# OPAX privacy page and voice consent text

Drafted 3 October 2026 for W7 in [IOS-APP.md](IOS-APP.md#9-worker-changes). **Draft: Jake approves the wording before it deploys.** The page carries marked placeholders (`<mark class="privacy-confirm" data-confirm="P…">`) for facts and decisions that could not be verified from the repository. None may ship as they are. Find them with:

```sh
grep -n 'data-confirm=' portal/public/index.html
```

## Where it lives

- **The page** is the `/privacy` panel in `portal/public/index.html` (`#panel-privacy`), routed in `app.js`, described in `STATIC_PAGES` and the sitemap in `src/index.ts`, and linked from the About menu, the mobile drawer and the footers of `index.html`, `home.html` and `community.html`. It is the privacy policy URL for the App Store listing and the app's Account and about screen: `https://opax.com.au/privacy`.
- **Section anchors** are stable and other surfaces link to them: `#voice` (the voice panel and the app's consent screen), `#voice-allowance`, `#privacy-deletion`, `#privacy-contact`. Keep these IDs if the page is rewritten.
- **The old community view** `/community?view=privacy` now hands over to `/privacy`, keeping any fragment. Sign-in emails already sent and the web voice panel (`portal/voice/client.js`, `/community?view=privacy#voice`) still link there, so keep the hand-over.

## Keep the page true

The page states facts about the live system. Change it in the same commit as any change to:

- what a table in `portal/migrations/` stores about a member, or what account deletion removes or keeps (`src/community-deletion.ts`);
- rate limits keyed to IP addresses (`wrangler.jsonc` `ratelimits`, `limit()` callers in `src/`), logging (`observability`) or anything that forwards a client address (`src/posthog.ts`);
- analytics (`portal/analytics/`, `public/gtm.js`, [ANALYTICS.md](ANALYTICS.md)) or browser storage keys in `public/*.js`;
- a provider that receives reader data: Progress Agentic RAG, the OpenRouter model pins, ElevenLabs, Google, PostHog, OpenStreetMap tiles, Cloudflare Email Sending;
- the voice allowance, monthly budget, concurrency, reservation accounting or provider settings ([VOICE-ASSISTANT.md](VOICE-ASSISTANT.md));
- what the iPhone app stores, sends or asks permission for.

Then update the "Last updated" date. The page's history is this repository's history.

## Claims and their sources

| Claim on the page | Source |
| --- | --- |
| Ask 20, follow-ups 20, search 120, share images 60 a minute per address | `wrangler.jsonc` `ratelimits`; `rateLimited()` keyed by `cf-connecting-ip` in `src/index.ts` |
| Some automated networks refused | `src/network-block.ts`, `BLOCKED_ASNS`, `GENERATION_BLOCKED_*` |
| Sign-in, account and voice counters stored as SHA-256 of key and window; expired rows deleted a day or more later during sign-in requests | `limit()` in `src/community-core.ts`; cleanup batch in `src/community-auth.ts` |
| Worker logs on | `wrangler.jsonc` `observability.enabled`, `head_sampling_rate: 1` |
| Question and search text to Progress; generation through OpenRouter; follow-ups carry earlier turns; no client IP or identifier added | `kbFetch()` headers and `buildAskBody()` in `src/index.ts`; `*_MODEL` vars |
| Answer, search and summary copies kept ten minutes to seven days, filed by question | `ASK_CACHE_TTL`, `SEARCH_CACHE_TTL` in `src/index.ts`; `src/generation-cache.ts` |
| Browser storage: 20 conversations, question shape, dismissed summary, tab state | `CHAT_STORE_KEY`, `opax-ask-shape`, `SUMMARY_DISMISSED_KEY`, `opax-search-read`, `opax-chat-seed` in `public/app.js` |
| Analytics events, removals, cookies and identifiers, Do Not Track, opax.com.au only, none on community pages | [ANALYTICS.md](ANALYTICS.md); `portal/analytics/index.js` (`persistence` default `localStorage+cookie` in posthog-js 1.427.2), `analytics/ga.js`, `public/gtm.js`; `community.html` loads no analytics |
| PostHog receives the reader's IP for location | `src/posthog.ts` forwards `cf-connecting-ip` as `x-forwarded-for` |
| Grants map tiles from OpenStreetMap | `portal/grants-map/index.js` |
| App: no analytics, no device identifier, seat and consent on device, catalog searches never reach Progress, Keychain session | [IOS-APP.md](IOS-APP.md) sections 1, 4 and 6; `apiUnifiedSearch()` catalog branch in `src/index.ts` |
| Account contents, public and private fields, 50 saved conversations, message policy, reply emails | `migrations/0001`, `0006`, `0009`, `0010`; [COMMUNITY.md](COMMUNITY.md) |
| Sign-in link and code: 15 minutes, single use, hash and keyed hash; sessions 30 days, no IP or device stored | `src/community-auth.ts`, `src/community-signin-code.ts`, `migrations/0001`, `0011` |
| Email through Cloudflare from login.opax.com.au | `wrangler.jsonc` `send_email`, `COMMUNITY_EMAIL_FROM` |
| MCP keys hashed, 90 days, three active, last-used time | `src/community.ts`, `src/community-mcp.ts` |
| ElevenLabs gets audio, typed text, a random call ID and the time limit, never email or member ID | `voiceClientEvent()` and `connect()` in `src/voice.ts` |
| Voice tool searches go through OPAX search | `runVoiceTool()` in `src/voice-tools.ts` |
| Recording off, transcripts one day, Gemini 3.5 Flash Lite | [VOICE-ASSISTANT.md](VOICE-ASSISTANT.md), configured 9 September 2026; **not verified live** (P10, P11) |
| Voice rows, 600 seconds, 40,000 a month, two calls, reservation accounting, unlimited accounts | `src/voice.ts`, `migrations/0003`, `0004`, `0012`; [IOS-VOICE.md](IOS-VOICE.md#routes) |
| Deletion scope, kept rows, five-minute housekeeping, one-day provider reference clean-up, fresh allowance | `src/community-deletion.ts`, `expireVoiceSessions()`, `wrangler.jsonc` crons; [COMMUNITY.md](COMMUNITY.md#account-deletion-w5-and-w6-branch-implementation) |
| Progress knowledge box in the AWS Sydney zone | `ARAG_ZONE` = `aws-ap-southeast-2-1` in `wrangler.jsonc` |
| PostHog in the United States | `us.i.posthog.com` in `src/posthog.ts` |

## Voice consent and notice strings (draft)

For the app's one-time consent step ([IOS-UX.md, 4.10](IOS-UX.md#410-talk-to-opax-voice); guideline 5.1.2(i)) and for the web voice panel if Jake adds the same step there (IOS-APP decision 10). The retention sentence depends on P10 and must change if the dashboard shows otherwise. "OPAX" follows the app's casing; the web panel still says "Opax" (IOS-UX open question 12).

| Key | Text |
| --- | --- |
| `voice.consent.title` | Before your first call |
| `voice.consent.what` | Talk to OPAX uses ElevenLabs, a third-party AI provider. During a call, your voice and anything you type go through OPAX to ElevenLabs, which turns your speech into text, writes the replies with a language model and speaks them. |
| `voice.consent.kept` | ElevenLabs does not record the audio and deletes the conversation text after one day. OPAX keeps no recording or transcript. It keeps a record of each call's times, to count your 10 free minutes. |
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
