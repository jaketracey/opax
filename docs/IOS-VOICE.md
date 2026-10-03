# Opax iOS voice assistant

Discovery notes for the voice part of the Opax iOS app, written 3 October 2026 from source code, SDK source and published documentation. They feed the public design doc `docs/IOS-APP.md`.

Version 1 of the app is read-only public data plus the voice assistant ("Talk to Opax"). This document covers voice only. Product and UX are in `docs/IOS-UX.md`; data, API and architecture are in `docs/IOS-API-CONTRACT.md`.

No voice session was started while writing this. Nothing called ElevenLabs or any opax.com.au voice or community route (production, staging or local), and no audio was played. File and line references are to commit `8f1305e3` unless they name an SDK package. Revised on 3 October 2026 after an independent review.

## Summary

- **Access (decided).** Jake approved option A on 3 October 2026. Voice is the only signed-in feature; every other screen is public and works signed out. The app signs in with a one-time code sent by email and offers in-app account deletion. Apple requires deletion because signing in creates an account.
- **Session:** recommended for v1 is the existing cookie contract with explicit attachment. The app keeps the session token in the Keychain and attaches `Cookie: __Host-opax_session=…` and `Origin: https://opax.com.au` itself, only on voice and account routes. It is as safe as a new `X-Opax-Session` header and needs fewer Worker changes. The final choice is made in the synthesis (section 3).
- **Transport:** keep the existing same-origin WebSocket relay. Neither official ElevenLabs mobile SDK can use it: both run voice over LiveKit WebRTC, and the React Native SDK throws on a signed URL. The relay needs no change.
- **Audio:** one Swift voice core. A single `AVAudioEngine` with voice processing (echo cancellation) handles capture and playback, and a `URLSessionWebSocketTask` connects to the relay. Audio travels as base64 chunks in whatever format the provider names at the start of each call: PCM16 or µ-law, at 16 kHz in the repository's fixtures. React Native wraps the core in a local Expo module; SwiftUI calls it directly. Voice favours SwiftUI only slightly.
- **Worker changes:**
  - code sign-in with a defined security contract;
  - account deletion that cannot refund the shared monthly budget or free call slots;
  - a budget-closed signal.

  Each **needs Jake's OK to deploy**. The relay and tool routes are unchanged.
- **Testing:**
  - a fake relay in the local fixture Worker speaks the same protocol, sends silent audio and answers tools from fixture data;
  - the voice core takes injected permission, audio-session and lifecycle dependencies, so every state runs without hardware;
  - the app has a synthetic microphone for tests.

  Real calls are physical-device checks for Jake only.

## 1. How web voice works today

### Components

| Part | Where | Role |
| --- | --- | --- |
| Panel and call logic | `portal/voice/client.js` | Status, start, transcript, sources, mute, end, teardown |
| Provider SDK | `@elevenlabs/client` 1.25.0, pinned at `portal/package.json:35` | WebSocket protocol, microphone capture worklet, playback worklet |
| Build-time SDK patches | `portal/voice/build.mjs:27-74` | Cancellable capture, self-hosted worklets, explicit iOS audio priming |
| Routes, reservation and relay | `portal/src/voice.ts` | `/api/voice/status`, `start`, `connect`, `finish`, `tools/*` |
| Server tools | `portal/src/voice-tools.ts`, `portal/src/voice-money.ts` | Seven read-only public-record tools |
| Session state | `portal/migrations/0003_voice.sql:4-20`, `0004_voice_access.sql:3-7` | `voice_sessions` and `voice_access` in COMMUNITY_DB |
| Operating notes | `docs/VOICE-ASSISTANT.md` | Provider configuration, budgets, deploy and disable |

The chat composer's microphone button imports `/voice.js` the first time it is pressed (`portal/public/app.js:10765-10775`). Opening the panel only fetches status. The SDK, the microphone and the reservation start only on **Start talking** (`portal/voice/README.md:20-24`, `docs/VOICE-ASSISTANT.md:3`).

### Sequence

1. **Status.** `GET /api/voice/status` with the session cookie (`portal/voice/client.js:204`). This route has no Origin check (`portal/src/voice.ts:244-248`). The response is `{enabled, signed_in, unlimited, total_seconds, remaining_seconds, active_session}` (`portal/src/voice.ts:64-74`). A signed-out request gets `signed_in:false`, no `unlimited` field and a nominal 600 seconds (`portal/src/voice.ts:65`). For a signed-in member, status first expires stale rows, so it is a write as well as a read (`portal/src/voice.ts:246`). `remaining_seconds` includes the unused part of an open reservation (`portal/src/voice.ts:70-72`).
2. **Start gesture.** The browser primes a 16 kHz `AudioContext` on the button press, before any await, because iOS requires it (`portal/voice/client.js:306-315`). It then loads the SDK chunk (`portal/voice/client.js:327`).
3. **Reservation.** `POST /api/voice/start` with body `{}` and `Content-Type: application/json` (`portal/voice/client.js:330`). The Worker checks, in order:
   - community enabled (`portal/src/voice.ts:243`);
   - Origin equals `COMMUNITY_ORIGIN` (`portal/src/voice.ts:249`, `portal/src/community-core.ts:15`);
   - a member session (`portal/src/voice.ts:250`);
   - voice configured (`portal/src/voice.ts:252`);
   - a JSON body of at most 2,000 bytes (`portal/src/voice.ts:253`, `portal/src/community-core.ts:6-13`);
   - rate limits of 6 starts a minute per member and 20 a minute per IP (`portal/src/voice.ts:254-255`).

   After expiring stale rows, a single SQL write checks the member's balance, the monthly budget and the two call slots, and inserts a `reserved` row (`portal/src/voice.ts:256-257`, `portal/src/voice.ts:29-48`). The 201 response is `{session_id, transport:"websocket", signed_url, remaining_seconds, expires_at}`. `signed_url` is `wss://<COMMUNITY_ORIGIN>/api/voice/connect?session_id=<uuid>` (`portal/src/voice.ts:264-266`). `expires_at` is the 60-second window to connect, not the end of the call (`portal/src/voice.ts:5`, `portal/voice/client.js:345-347`).
4. **Client validation.** The web client accepts `signed_url` only on its own host, with path `/api/voice/connect` and scheme `wss:`, or `ws:` when the page itself is served over HTTP (`portal/voice/client.js:341-343`).
5. **Relay connection.** The SDK opens `new WebSocket(signedUrl + "&source=js_sdk&version=1.25.0", ["convai"])` (`@elevenlabs/client@1.25.0 dist/utils/WebSocketConnection.js:86-101`). The browser sends the session cookie and its Origin.
6. **Claim and provider URL.** The Worker:
   - claims the reservation atomically, once, for its owner, setting `connecting` (`portal/src/voice.ts:50-52`, `portal/src/voice.ts:172-173`);
   - fetches a provider signed URL with `include_conversation_id=true` (`portal/src/voice.ts:178-179`), which makes the signature single-use;
   - validates the URL against `wss://api.elevenlabs.io/v1/convai/conversation` (`portal/src/voice.ts:184-189`);
   - stores the provider conversation ID (`portal/src/voice.ts:190-195`).

   The API key and the signed URL never leave the Worker.
7. **Upstream upgrade.** The Worker opens the provider socket with `Origin: COMMUNITY_ORIGIN` and `Sec-WebSocket-Protocol: convai` (`portal/src/voice.ts:196-204`). It marks the row `active` with a deadline of `reserved_seconds + 30` (`portal/src/voice.ts:208-210`). It attaches all listeners before accepting either socket, so the provider's first metadata event is not lost (`portal/src/voice.ts:216-223`). It returns `101` and echoes `convai` when the client offered it (`portal/src/voice.ts:224-227`).
8. **Initiation.** On open, the SDK sends `conversation_initiation_client_data` with any overrides (`dist/utils/WebSocketConnection.js:103-108`, `dist/utils/overrides.js:3-49`). The relay discards every client field. In their place it sends its own initiation, carrying only `max_duration_seconds` (the seconds left before the relay deadline) and the dynamic variable `opax_session_id` (`portal/src/voice.ts:96-99`, `portal/src/voice.ts:138`). The provider sends `conversation_initiation_metadata` with the conversation ID and the two audio formats; the SDK waits for it (`dist/utils/WebSocketConnection.js:126-142`).
9. **Conversation.**
   - Microphone audio goes up as `{"user_audio_chunk": "<base64>"}` (`dist/utils/attachInputToConnection.js:7-9`).
   - Provider events come back verbatim. The relay checks only size and JSON (`portal/src/voice.ts:143-155`).
   - The SDK answers `ping` with `pong` (`dist/BaseConversation.js:454-458`). It plays `audio`, flushes playback on `interruption` and reports transcripts (`dist/VoiceConversation.js:68-87`, `dist/BaseConversation.js:146-172`).
10. **Tools.** The provider calls the Worker's tool webhooks at `POST /api/voice/tools/<name>`. Each call carries the provider secret header `x-opax-voice-token` and a `session_id` (`portal/src/voice.ts:233-242`, `portal/src/voice.ts:76-82`). The provider fills `session_id` from the `opax_session_id` variable; that mapping is tool configuration in the provider dashboard, not in this repository. Tools run only for a live `active` session of an enabled member, at 30 calls a minute per session (`portal/src/voice.ts:238-240`). Results are bounded and come in two shapes:
    - **Standard:** `{source_notice, source_url, sources, data}` (`portal/src/voice-tools.ts:147-149`).
    - **Receipt answers:** money questions answered from the published receipt graph return `{source_notice, sources, data}` with no `source_url` (`portal/src/voice-tools.ts:74-84`, `:89-91`, `:124-127`). When the question needs a period or a narrower scope, `sources` is empty and `data` carries a clarifying `answer` with `needs_period` or `needs_scope` (`portal/src/voice-money.ts:156-181`). A computed answer has one source (`portal/src/voice-money.ts:251`).

    The browser never calls tools; client tool results are dropped (`portal/src/voice.ts:105`).
11. **End.** End, Close, Escape, navigation, `pagehide`, offline or a hidden tab all stop the call (`portal/voice/client.js:395-411`). The SDK closes with 1000 "User ended conversation" (`dist/utils/WebSocketConnection.js:149-152`). The client then posts `POST /api/voice/finish {session_id}` with `keepalive` (`portal/voice/client.js:219-232`).
12. **Reconciliation.** When either socket closes, the relay closes the other. It holds the Worker invocation for up to 20 seconds to receive the provider's close acknowledgement (`portal/src/voice.ts:118-128`). Only a clean provider close that is not 1006 records the elapsed seconds, capped at the reservation (`portal/src/voice.ts:159-165`, `portal/src/voice.ts:55-58`). Otherwise the full reservation stays charged and the row expires later as `expired` (`portal/src/voice.ts:20-26`, `docs/VOICE-ASSISTANT.md:28`). `finish` can only cancel a reservation that never connected (`portal/src/voice.ts:272-279`).

### Routes

| Route | Auth | Origin check | Body | Success | Refusals |
| --- | --- | --- | --- | --- | --- |
| `GET /api/voice/status` | Cookie optional | None | None | 200 status JSON | 503 if community disabled (`voice.ts:243`) |
| `POST /api/voice/start` | Cookie required | Exact match (`voice.ts:249`) | JSON, at most 2,000 bytes | 201 reservation | 403 origin; 401 signed out; 415, 413; 429 rate limit; 409 call open; 403 allowance used; 429 capacity or budget; 503 not configured; generic 503 that can leave a `reserved` row (below) (`voice.ts:251-266`) |
| `GET /api/voice/connect?session_id=` | Cookie required | Exact match | WebSocket upgrade | 101 | 426 no upgrade; 400 bad ID; 409 used or expired; 503 that can leave the row `reserved`, `connecting`, `active` or cancelled (below) (`voice.ts:169-228`) |
| `POST /api/voice/finish` | Cookie required | Exact match | `{session_id}`, at most 1,000 bytes | 200 status JSON | 401, 403, 400 (`voice.ts:272-279`) |
| `POST /api/voice/tools/<name>` | Provider secret | None | JSON, at most 8,000 bytes | 200 tool result | 401, 403, 429, 503 (`voice.ts:233-242`) |

**A 503 from `start` or `connect` does not tell the client what happened to the reservation.** Depending on where it failed, the row can be left `reserved`, `connecting` or `active`, or cancelled. Every "released" outcome below assumes the cleanup itself succeeded. If `releaseUnusedSession()` throws (`voice.ts:60-62`), or `response.body.cancel()` throws before it on the no-socket path (`voice.ts:206`), the generic handler returns 503 and the row stays `connecting` (`voice.ts:281-284`).

| Failure point | Row left behind | Charge | How it clears | Where |
| --- | --- | --- | --- | --- |
| `start`: D1 error during the reservation write, a lost response after it committed, or any error building the response | Possibly `reserved`; the client never learns its `session_id` | None | Expires after 60 seconds as `cancelled`, charged 0 | `voice.ts:256-266`, `:22`, `:5` |
| `connect` refused before the claim: 503 voice not configured, 426 no upgrade header, 400 bad ID | `reserved` (unclaimed) | None | The client can cancel it with `finish`, or it expires after 60 seconds | `voice.ts:269`, `:170-171`, `:272-276` |
| `connect`: D1 error during the claim | `reserved` or `connecting`, unknown | None, or the full reservation if claimed | `reserved` as above; `connecting` as below | `voice.ts:172`, `:51` |
| Signed URL fetch failed or timed out | `cancelled` if release succeeded; message "Your time has not been used." | None | At once | `voice.ts:177-183` |
| Provider returned an unexpected URL | `cancelled` if release succeeded | None | At once | `voice.ts:184-189` |
| Provider answered the upgrade without a WebSocket | `cancelled` if both the body cancel and the release succeeded ("The voice provider is busy") | None | At once | `voice.ts:205-206` |
| Any of those three releases failed, or the conversation-ID write failed | `connecting` | Full reservation | Expires as `expired` at claim time + `reserved_seconds` + 30, still fully charged | `voice.ts:181`, `:185-188`, `:194`, `:206`, `:25` |
| Upstream upgrade threw or timed out | `connecting` | Full reservation | As above | `voice.ts:200-204`, `:281-284` |
| The `active` write failed, or its response was lost | `connecting`, or `active` if the write committed | Full reservation | Expires as `expired`, fully charged: a `connecting` row at claim time + `reserved_seconds` + 30, an `active` row at start time + `reserved_seconds` + 30 | `voice.ts:209-215`, `:51` |
| Error after the `active` write, before the 101 (socket setup or accept) | `active` | Full reservation | Expires as `expired`, fully charged, unless the relay later confirms a clean provider close | `voice.ts:216-227`, `:159-165` |

**How the client recovers.**
- A `reserved` row costs nothing. `finish` can cancel it when the client knows its `session_id` (`voice.ts:272-276`).
- `finish` cannot release `connecting` or `active` rows, because it only cancels `reserved` ones.
- While any of these rows is open, status shows an `active_session` with its `state` and `expires_at`, and `start` returns 409 for that member (`portal/migrations/0003_voice.sql:16-17`, `voice.ts:45`). The longest wait is `reserved_seconds + 30`, at most 630 seconds.

The only refund signal is human-readable message text, and a WebSocket client usually cannot read the body of a refused upgrade. The allowance shown after any failure must therefore come from a fresh `GET /api/voice/status`, never from the HTTP status alone.

All voice responses get `cache-control: no-store` and `referrer-policy: no-referrer` (`portal/src/community-core.ts:5`, `portal/src/index.ts:4880`). Errors are `{"error": "<message>"}` with the status above (`portal/src/voice.ts:281-284`). Voice routes are not among the model routes that refuse crawler user agents, but the scraper ASN block on `/api/*` applies (`portal/src/network-block.ts:36-39`, `portal/src/index.ts:5193-5195`).

### Headers, cookies, Origin and CSRF

- **Session cookie.** `__Host-opax_session=<43-character token>; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000` (30 days) (`portal/src/community-auth.ts:3`, `portal/src/community-auth.ts:25-26`). The Worker looks up the SHA-256 of the token in `member_sessions` and refuses disabled members (`portal/src/community-core.ts:22-26`). No other credential works on voice routes.
- **Cookie issuance.** The only issuer is `POST /api/community/auth/consume {token}`, which has its own Origin check (`portal/src/community-auth.ts:18-27`). The token comes from a sign-in email whose link is `<COMMUNITY_ORIGIN>/community?view=signin#token=<token>` and expires after 15 minutes (`portal/src/community-auth.ts:11-13`). The web page reads the fragment and posts it (`portal/public/community.js:225`, `portal/public/community.js:264`). The first successful sign-in creates the account (`portal/src/community-auth.ts:23`).
- **CSRF.** The only CSRF defence is an exact `Origin` match against `COMMUNITY_ORIGIN` (`portal/src/community-core.ts:15`). It applies to `start`, `connect` and `finish`. A missing Origin header fails. There are no `Sec-Fetch-*` checks anywhere in `portal/src`. The cookie's `SameSite=Lax` adds a browser-side layer.
- **WebSocket upgrade conditions** for `connect`:
  - `Upgrade: websocket` (`voice.ts:170`);
  - a valid UUID `session_id` (`voice.ts:171`, `voice.ts:84-88`);
  - a valid session cookie and the exact Origin (`voice.ts:249-250`);
  - a reservation that this member owns, still `reserved` and unexpired (`voice.ts:51`).

  `Sec-WebSocket-Protocol: convai` is optional; it is echoed when offered (`voice.ts:226-227`).

### Messages the relay accepts from the client

The relay rate-limits client messages to 150 a second and closes with 1008 above that (`portal/src/voice.ts:134-136`). Each message must be a JSON object of at most 192,000 characters (`portal/src/voice.ts:92-95`).

| Message | Rule (`portal/src/voice.ts:96-106`) |
| --- | --- |
| `{"type":"conversation_initiation_client_data", ...}` | Must come first, within 10 seconds of the upgrade (`voice.ts:130`). Content is replaced; a second copy closes the call |
| `{"user_audio_chunk":"<base64>"}` | Standard base64 alphabet with padding (`^[A-Za-z0-9+/]*={0,2}$`). Only the alphabet is checked, not length or canonical padding. A chunk that fails the pattern, such as base64url, is dropped silently rather than closing the call. Extra fields are removed |
| `{"type":"pong","event_id":<int>}` | Reply to each provider `ping` |
| `{"type":"user_activity"}` | Forwarded |
| `{"type":"user_message","text":"..."}` or the same with `"contextual_update"` | Text up to 2,000 characters |
| Anything else | Dropped silently: `feedback`, `client_tool_result`, `mcp_tool_approval_result`, multimodal messages |

### Provider events a client must handle

The relay passes provider events through unchanged (`portal/src/voice.ts:153`). The pinned SDK handles these (`dist/BaseConversation.js:411-543`):

| Event | Client behaviour |
| --- | --- |
| `conversation_initiation_metadata` | Conversation ID; `user_input_audio_format` and `agent_output_audio_format` |
| `ping` | Send `pong` with the same `event_id`; `ping_ms` is latency |
| `audio` | Play `audio_event.audio_base_64` unless its `event_id` is below the last interruption (`dist/VoiceConversation.js:73-87`). It may carry `alignment` with per-character timings |
| `interruption` | Flush queued audio; switch to listening (`dist/VoiceConversation.js:68-72`) |
| `user_transcript` | Final user transcript (`user_transcription_event.user_transcript`) |
| `agent_response` | Agent text; may contain Markdown links to Opax records |
| `agent_response_correction` | Replace the earlier agent text after an interruption |
| `agent_tool_response`, `agent_tool_response_full_payload` | Tool name, status and, in the full payload, `full_tool_result` (truncated by the provider above 64 KB). `end_call` ends the session (`dist/BaseConversation.js:329-344`) |
| `error` | `max_duration_exceeded` ends the session; others are errors (`dist/BaseConversation.js:390-410`) |
| `vad_score`, `internal_tentative_agent_response`, `agent_chat_response_part`, `client_tool_call`, queue status | Optional or unused. No client tools exist, and their results would be dropped |

Which optional events the production agent emits (for example the full tool payload or alignment) is provider configuration, not in this repository. The staging smoke test accepts either tool event (`portal/test/voice-staging-smoke.mjs:99-100`).

### Audio format in each direction

| Direction | Format | Evidence |
| --- | --- | --- |
| Up (microphone) | Mono, at the codec and rate named by `user_input_audio_format`: `pcm_<rate>` is 16-bit little-endian, `ulaw_<rate>` is 8-bit G.711 µ-law. If metadata omits the format, the SDK assumes `pcm_16000`. Base64 inside JSON. Muted input still sends zero-valued chunks | `dist/utils/WebSocketConnection.js:139-141`, `dist/utils/BaseConnection.js:81-94`, `dist/platform/web/rawAudioProcessor.generated.js:100-123` |
| Up, chunking | 25 ms is a nominal **threshold**, not a fixed chunk size. The capture worklet appends each render quantum, after resampling, to a buffer. Once the buffer reaches the threshold it sends the **whole** buffer and clears it. Chunk length therefore depends on the render quantum and resampler. With 16 kHz input and 128-frame quanta, the 400-sample threshold yields 512-sample (32 ms) chunks, as a hardware-free evaluation of the unmodified worklet showed during review | `dist/InputController.js:2`, `dist/platform/web/rawAudioProcessor.generated.js:57-61`, `:86-91`, `:99-126` |
| Up, browser capture | `getUserMedia` with echo cancellation, noise suppression, automatic gain control, mono and `voiceIsolation` | `dist/platform/web/input.js:6-13`, `:52` |
| Down (agent) | `pcm_<rate>` (16-bit, so an even byte count) or `ulaw_<rate>` (one byte a sample, so odd counts are valid), as named by `agent_output_audio_format`. Base64 in `audio` events, with chunk sizes set by the provider | `dist/utils/BaseConnection.js:81-94`, `dist/platform/web/audioConcatProcessor.generated.js:53-57`, `:87-91` |

The repository's tests and the web client's priming assume `pcm_16000` in both directions (`portal/test/voice.test.mjs:245`, `portal/voice/check.mjs:85`, `portal/voice/client.js:309`). These are fixtures, not proof of the production agent's settings. ElevenLabs documents other output rates, for example `pcm_44100`. A native client must read both codec and rate from the metadata rather than hard-code them.

**Sample encoding** (`dist/platform/web/rawAudioProcessor.generated.js:32-46`, `:104-119`). Samples are clamped to [-1, 1] and scaled as `sample < 0 ? sample * 32768 : sample * 32767`.
- For PCM16 the scaled value is then stored into an `Int16Array`, which truncates toward zero.
- For µ-law it is rounded and passed through the SDK's G.711 encoder.

A native encoder can match these sample values exactly. Its chunk boundaries are a separate policy (section 4).

### Transcript, evidence and sources

- **Transcript.** User and agent turns appear as text nodes, keyed by role and `event_id`. A correction replaces an earlier turn. The panel keeps at most 80 turns, each cut at 12,000 characters (`portal/voice/client.js:275-297`). The transcript is a `role="log"` polite live region (`portal/voice/client.js:129-135`).
- **Links.** Markdown links in agent text become links only when they pass a same-origin allow-list of published record paths, such as `/doc/`, `/bill/`, `/subject/<kind>/`, `/money/...`, `/reports/` and `/journey/` (`portal/voice/client.js:38-65`).
- **Sources list.** Sources are also collected from tool responses: `sources`, `records`, `full_tool_result` and similar fields, at most 12, under the same allow-list (`portal/voice/client.js:251-274`). On the server, every tool result carries a notice that source material is untrusted evidence and a `sources` array of `{title, url}` (`portal/src/voice-tools.ts:7`, `:83`, `:147-149`). That array is empty for receipt clarifications, and receipt answers have no `source_url` (step 10).
- **Persistence.** None: no transcript, signed URL, account identifier or audio is stored in browser storage or sent to analytics (`portal/voice/README.md:21-24`, `portal/voice/client.js:84-85`).

### Timers and limits

| Limit | Value | Where |
| --- | --- | --- |
| Lifetime allowance per member | 600 seconds | `portal/src/voice.ts:4` |
| Unlimited members | Repeated calls, each up to 600 seconds | `portal/src/voice.ts:36-37`, `docs/VOICE-ASSISTANT.md:44-46` |
| Monthly application budget | `VOICE_MONTHLY_SECONDS`, capped at 40,000 (production 40,000, staging 3,000) | `portal/src/voice.ts:6`, `:18`, `portal/wrangler.jsonc:52`, `:144` |
| Concurrent calls | 2 across all members, 1 per member | `portal/src/voice.ts:7`, `:44-45`, `portal/migrations/0003_voice.sql:16-17` |
| Window to connect after start | 60 seconds | `portal/src/voice.ts:5` |
| Initiation after upgrade | 10 seconds | `portal/src/voice.ts:130` |
| Call deadline | The reservation's seconds, enforced by the relay and passed to the provider as `max_duration_seconds` | `portal/src/voice.ts:113`, `:129`, `:138` |
| Web connect timeout | 35 seconds | `portal/voice/client.js:325` |

At 600 seconds per member, the production monthly budget covers at most 66 full allowances a month, shared by web and app.

**A call's deadline is not always the end of the member's allowance.** A reservation is the smaller of the member's personal balance and the month's remaining budget (`portal/src/voice.ts:36-43`). Unlimited members also get bounded calls. A call can therefore end at its deadline because:
- the member's lifetime allowance ran out;
- the month's application budget ran out;
- an unlimited member reached the 600-second call limit.

The relay closes all three with the same message.
- A fresh status read afterwards shows a used-up personal allowance (`remaining_seconds: 0`) and the unlimited case (`unlimited: true`).
- A spent monthly budget is invisible to status today. The member still appears to have time left, and the next start returns the shared 429.
- Worker change 6 (`budget_open`) closes that gap.

### Error and allowance states on the web

| Condition | Server signal | Web message (`portal/voice/client.js`) |
| --- | --- | --- |
| Voice disabled | status `enabled:false` | "Voice is taking a break…" (`:209`) |
| Signed out | status `signed_in:false`; start 401 | Sign-in link (`:145-147`, `:183`) |
| Allowance used | status `remaining_seconds:0`; start 403 | "You have used your 10 free minutes…" (`:209`, `:336`, `:373`) |
| Call already open | status `active_session`; start 409 | "A voice conversation is already open on your account…" (`:209`, `:338`) |
| Capacity **or** monthly budget spent | start 429, same message for both (`voice.ts:262`) | "Voice is busy right now…" (`:337`, `:373`) |
| Microphone denied or missing | `NotAllowedError`, `NotFoundError` | (`:373`) |
| Provider or network failure | close or error | "The connection ended…" or "Voice ran into a problem…" (`:364-365`) |
| Deadline | relay close 1000 "Your free voice time has finished", for every kind of deadline | "Your 10 free minutes are complete…", or "This call has finished…" for unlimited members (`:351`) |

Relay close codes are:
- 1000 when the call ends normally or reaches its deadline;
- 1008 for an initiation timeout, more than 150 messages a second, or an invalid message;
- 1011 for provider or connection failures.

The provider's own close code is not forwarded (`portal/src/voice.ts:118-160`).

## 2. What blocks a native client today

1. **No credential a native app can get cleanly.** Voice routes accept only the `__Host-opax_session` cookie (`portal/src/community-core.ts:22-27`). The cookie is issued only to a request carrying the exact web Origin (`portal/src/community-auth.ts:18-26`). The token comes from an email link that opens `/community` in a browser (`portal/src/community-auth.ts:13`). No `apple-app-site-association` file exists: `portal/public` has no `.well-known` directory, and the Worker serves only `/.well-known/atproto-did` (`portal/src/index.ts:5199`). So the link cannot open the app. MCP bearer keys exist (`portal/src/community-mcp.ts:8-11`), but voice routes do not accept them.
2. **Origin checks.** `start`, `connect` and `finish` require `Origin` to equal `COMMUNITY_ORIGIN` exactly (`portal/src/voice.ts:249`). Native HTTP and WebSocket clients send no Origin by default. Both `URLSession` and Node's `ws` can set one, and the staging smoke test does so with a Cookie header (`portal/test/voice-staging-smoke.mjs:41`, `:80`). So the check stops browsers from other sites, not non-browser clients. There are no `Sec-Fetch-*` checks.
3. **The agent's origin restriction does not reach the client.** The repository documents the provider agent as private and restricted to the Opax origin (`docs/VOICE-ASSISTANT.md:20`); the live provider configuration was not inspected. The Worker satisfies that restriction on the upstream connection by sending `Origin: COMMUNITY_ORIGIN` itself (`portal/src/voice.ts:203`), so any relay client inherits it. That it would block an app connecting straight to ElevenLabs is an inference from that documentation, not a verified provider behaviour.
4. **CSP and Permissions-Policy are browser-only.** API responses carry `default-src 'none'` (`portal/src/index.ts:4859`, `:4879`), which a native client ignores. Pages allow `connect-src wss://opax.com.au` and `microphone=(self)` (`portal/src/index.ts:4823`, `:4848`). `X-Frame-Options: DENY` and `frame-ancestors 'none'` block iframes, not a top-level in-app browser (`portal/src/index.ts:4822`, `:4855`).
5. **Browser assumptions in the protocol.**
   - The start body must be `application/json` (`portal/src/community-core.ts:7`).
   - `signed_url` is always `wss:` on `COMMUNITY_ORIGIN`, so a local plain-HTTP Worker hands out an unusable `wss://127.0.0.1` URL (`portal/src/voice.ts:264-265`).
   - The first message must be the initiation event within 10 seconds (`portal/src/voice.ts:100`, `:130`).
   - All capture and playback code is Web Audio: AudioWorklets, `getUserMedia` and a Wasm resampler (`portal/voice/build.mjs:13-25`).
6. **No account deletion.** The community has no self-service account deletion route or page. `portal/src` has no member delete, and the privacy view lists none (`portal/public/community.js:196`). Removing a discussion or reply today only hides it (`portal/src/community.ts:45-47`). This blocks App Review for any app that signs people in (section 6).
7. **"Budget closed" cannot be told apart from "busy".** When the monthly budget is spent, start returns the same 429 "at capacity" error as when both slots are taken (`portal/src/voice.ts:258-262`). Status does not expose the budget (`portal/src/voice.ts:64-74`).

## 3. Who can use voice in the app

### Decision

**Decided on 3 October 2026:** Jake approved option A. Voice is the only feature that needs sign-in. Every other screen in the app is public and works signed out. Options B and C, and the provider's WebRTC SDKs, are kept at the end of this section as the record of what was considered.

### A. Sign in for voice

The member opens the voice screen, agrees to the third-party AI consent (section 6), and signs in with an emailed one-time code. Only then can they start a call. They can sign out, and delete their account, in the app.

- **Session.** How the app proves the session to the Worker is compared below. The recommendation for v1 is the existing cookie contract, attached explicitly.
- **Sign-in.** A one-time code in the sign-in email, typed into the app, under the security contract below.
  - It works when the email is read on another device.
  - It needs no `apple-app-site-association` file.
  - It never pulls web sign-in links into the app.

  A universal link on a dedicated path such as `/app/signin` can come later as a convenience. Reusing `/community?view=signin` would send web sign-ins into the app. Apple's association file can match a `#` fragment, but no Apple page says the fragment survives into the URL the app receives, so the existing `#token=` format would need a device test first.
- **Account deletion.** In the app, with deletion-safe voice accounting (below). Apple requires it (section 6).
- **Cost.** Unchanged per person. App members share the existing monthly budget, at most 66 full allowances a month.
- **Abuse.** The same as the web today: one allowance per email address, rate limits, two slots and the monthly budget. Deletion must not weaken the last two (below).
- **Privacy.** The app collects an email address and user ID, linked to the person, as the web community already does.
- **App Review.**
  - 5.1.1(v) applies, so the app needs in-app deletion.
  - Gating one feature behind sign-in is consistent with "let people use it without a login" for the rest of the app.
  - Sign in with Apple is not required for a company's own account system (4.8).

### Session design: the existing cookie contract or an `X-Opax-Session` header

The API lane's contract (`docs/IOS-API-CONTRACT.md` on `ios/discovery-api` at `6baf3ec4`, "Minimum-change cookie session versus header token") recommends the existing cookie session for v1. This section compares it with the `X-Opax-Session` header this document first proposed, and reaches the same recommendation. The two designs are:

| | Cookie contract | `X-Opax-Session` header |
| --- | --- | --- |
| What the app sends on voice and account routes | `Cookie: __Host-opax_session=<token>` and `Origin: https://opax.com.au`. On `connect` it also sends `Sec-WebSocket-Protocol: convai` | `X-Opax-Session: <token>`, with no Cookie and no Origin. On `connect` it also sends `Sec-WebSocket-Protocol: convai` |
| How the app gets the token | From the code exchange's `Set-Cookie`, as `auth/consume` returns today (`portal/src/community-auth.ts:26`) | From the code exchange's response body |
| Worker auth code | Unchanged: `member()` and `sameOrigin()` (`portal/src/community-core.ts:15`, `:22-27`) | `member()` reads the header. `sameOrigin()` is skipped only for a successfully validated header token on a request with no Cookie header. Mixed or invalid credentials are refused, never fallen back from |
| Voice routes and logout | Unchanged (`portal/src/voice.ts:230-285`, `portal/src/community-auth.ts:28-33`) | Logout must accept the header |

**Security.** `Origin` is a browser's CSRF signal, not client authentication.
- A browser sets it and a page cannot forge it, so it tells the Worker that a cookie-bearing request came from an Opax page rather than another site driving the person's browser.
- Any non-browser client can send any Origin. The staging smoke test does exactly that (`portal/test/voice-staging-smoke.mjs:80`).
- CSRF needs a victim's browser to attach ambient credentials. A native request carries a credential the app chose to attach.

So a native client sending the expected Origin does not weaken the web's CSRF protection. The header design's Origin bypass is equally safe, as long as it requires a successfully validated token, refuses requests that also carry a Cookie, and leaves the Origin check on cookie requests unchanged. Neither design is stronger against CSRF.

Token theft is the same in both: the same 43-character token, 30-day expiry, hashed lookup and revocation (`portal/src/community-auth.ts:25-33`). Keychain storage protects the device copy. Sign-out, sign-out everywhere and fresh verification before deletion are what limit a stolen token.

**What `URLSession` does with cookies** (Apple, read 3 October 2026):
- By default, a session takes cookies from responses into the configuration's `httpCookieStorage` and attaches matching ones to requests. `httpShouldSetCookies` defaults to true. Default sessions use the shared store, which on iOS is per app.
- `URLSessionWebSocketTask` "supports cookies, by storing cookies to the session configuration's `httpCookieStorage`, and attaches cookies to outgoing HTTP handshake requests."
- Apple's `HTTPCookie` documentation covers Netscape and RFC 6265 cookies and exposes `isSecure`, `isHTTPOnly` and `sameSitePolicy`. It says nothing about name prefixes such as `__Host-`. The prefix's guarantees (Secure, host-only, `Path=/`) are a browser storage rule, so the app must not rely on Foundation to enforce them. `HttpOnly` and `SameSite` defend against page scripts and cross-site browsing, which a native client does not have.
- Apple documents how to take control:
  - "If you want to provide cookies yourself, set this value to `false` and provide a `Cookie` header … on a per-request level" (`httpShouldSetCookies`).
  - Set `httpCookieAcceptPolicy` to `.never` and "use the `allHeaderFields` and `cookies(withResponseHeaderFields:for:)` methods to extract cookies from the URL response object yourself".
  - Or set `httpCookieStorage` to `nil`.

**On the WebSocket upgrade.** `webSocketTask(with: URLRequest)` says: "You can modify the request's properties prior to calling `resume()` on the task. The task uses these properties during the HTTP handshake phase … The custom HTTP headers provided by the client remain unchanged for the handshake with the server." A subprotocol is requested with a `Sec-WebSocket-Protocol` header.

Neither `Cookie`, `Origin` nor `X-Opax-Session` is on `NSURLRequest`'s reserved list: `Content-Length`, `Authorization`, `Connection`, `Host`, `Proxy-Authenticate`, `Proxy-Authorization` and `WWW-Authenticate`. Both designs' headers are on Apple's documented path. An `Authorization: Bearer` header is not: for reserved headers, "the system may ignore the value you set, or overwrite it with its own value, or simply not send it."

**Worker effort.**
- **Cookie contract:** new work only where both designs need it: code issuance and exchange, deletion, deletion-safe accounting and the budget signal. The auth core shared by every community route is untouched.
- **Header design:** the same, plus a header parser in `member()`, a new `sameOrigin()` rule, mixed-credential refusal, header logout, and regression tests on every route that calls those two functions.

**Recommendation: the cookie contract with explicit attachment, for v1.** Its CSRF and theft properties match the header design. It is on Apple's documented manual-cookie path, and it leaves the authentication code every community route depends on unchanged. With one credential type there are no precedence rules to get wrong.

**Where this differs from the API lane.** The API lane agrees on the cookie session but prefers automatic attachment from an app-owned cookie jar, and falls back to an explicit `Cookie` header only if needed. This document prefers explicit attachment from the start, because it:
- keeps the token in the Keychain rather than the jar's on-disk store;
- attaches it only to an allow-listed set of routes;
- does not depend on how Foundation treats the `__Host-` prefix, `Secure` and expiry across relaunches. The API lane lists those as unverified integration gates.

Either way, one integration check remains before release. Against a TLS loopback fixture (no real email or voice), confirm on the iOS 18.4 simulator and a device that the `Cookie`, `Origin` and `Sec-WebSocket-Protocol` headers reach the Worker unchanged on the `wss:` upgrade. The cookie keeps `Secure`; the fixture must not drop it to pass over plain HTTP.

Switch to the header design if:
- the Worker adds browser-only checks to these routes, such as `Sec-Fetch-Site`, which the app would otherwise have to imitate;
- or app sessions need different powers from web sessions, enforced per request.

A `client` label on `member_sessions` is useful for listing and revoking app sessions in either design. It is not an authentication boundary unless the Worker enforces it.

**Credential handling in the app, for either design:**
1. **Separate sessions.** A dedicated authenticated `URLSession` with no cookie store (`httpCookieStorage` set to `nil`, `httpShouldSetCookies` false, accept policy `.never`). Public data uses a different session that never carries the credential.
2. **Storage.** The token lives in the Keychain with a this-device-only accessibility class. It never goes in `UserDefaults`, a file or a shared cookie store.
3. **Scope.** The credential is attached only to an allow-list of paths on the configured origin: voice `status`, `start`, `connect` and `finish`; community `status`, `auth/*`; and account deletion.
4. **Redirects.** Redirects on authenticated requests are refused in the task delegate. The Worker never redirects `/api/*` (`portal/src/canonical-origin.ts:7-8`), so a redirect there is an error.
5. **Logs.** `Cookie`, `X-Opax-Session` and `signed_url` values are redacted from logs, crash reports and analytics.
6. **Expiry.** An expired or revoked credential does not make status fail: voice status returns 200 with `signed_in:false` (`portal/src/voice.ts:65`, `:244-247`), and protected routes return 401 (`portal/src/community-core.ts:27`). On either signal the token is deleted and the app shows signed out. Sign-out calls `auth/logout`, so the server session row is deleted too.

### Code sign-in contract

The existing link proof is a 256-bit random token stored as a hash and redeemed by one atomic conditional update (`portal/src/community-core.ts:3`, `portal/src/community-auth.ts:11-12`, `:21`). A code is far weaker on its own: six digits are about 19.9 bits and eight digits about 26.6 bits. So the new route needs these controls:

1. **Request.** `POST /api/community/auth/request {email, client:"ios"}` is native mode.
   - Web mode (no `client`) is unchanged, including its Origin requirement (`portal/src/community-auth.ts:6`).
   - Native mode keeps the issuance limits: 15 requests an hour per IP and 5 an hour per email. It uses the **same** `login-ip:` and `login-email:` limit keys as web mode (`portal/src/community-auth.ts:8-10`), so alternating modes never adds quota. Email-delivery failure deletes the new proof, as today (`portal/src/community-auth.ts:14`).
   - In native mode the response is `{sent:true, challenge_id}` whether or not an account exists, as today's response is the same for new and existing accounts (`portal/src/community-auth.ts:9`).
2. **One proof, two forms.** Each request creates one proof row holding:
   - the link token's hash, as now;
   - a 256-bit random `challenge_id`, bound to the normalised email and `client`;
   - an eight-digit code from `crypto.getRandomValues` with rejection sampling, so no digit is more likely than another.
3. **Protected storage.** The code is stored only as an HMAC-SHA-256 keyed with a new Worker secret and bound to `challenge_id`. A plain hash of eight digits can be reversed by enumeration if the table leaks; a keyed MAC cannot without the key.
4. **Supersession.** A new request for the same email and client invalidates that email's earlier unused proofs.
5. **Verification.** `POST /api/community/auth/consume-code {challenge_id, code}` runs these steps in order. Every admission step is a single atomic increment-and-check, completed before any comparison:
   1. **Look up the challenge.** This gives its bound, normalised email; the request never supplies one. An unknown, used, superseded or expired challenge fails only after step 2, so it still costs IP quota.
   2. **IP admission.** Increment and check the `consume:` IP key shared with link consumption: 30 per 15 minutes (`portal/src/community-auth.ts:19`). This uses the existing `limit()` pattern, an `INSERT … ON CONFLICT DO UPDATE SET hits=hits+1 RETURNING hits` in one statement (`portal/src/community-core.ts:16-19`).
   3. **Email-wide admission.** Increment and check a counter keyed by a digest of the challenge's email, in the same one-statement form: at most **10 attempts per fixed 24-hour window**.
      - Every attempt counts, right or wrong, so admission is decided before the result is known.
      - The key is the email, not the challenge, so supersession and reissue never reset it.
      - D1 runs each statement atomically, so concurrent requests each receive a distinct count, and at most 10 per window reach the comparison however many arrive at once.
   4. **Per-challenge admission.** One atomic `UPDATE … SET attempts = attempts + 1 … WHERE` unused, unexpired and `attempts < 5`, `RETURNING` the MAC. No row means failure.
   5. **Comparison.** Constant-time, of the MAC of the submitted code against the stored MAC.
   6. **Redemption.** On a match, one conditional update sets `used_at` where it is still null, so only one request can win.

   Then the member and session are created as `auth/consume` does (`portal/src/community-auth.ts:21-26`). Redeeming the code consumes the emailed link too, and the link consumes the code.
6. **Bound.** At most five comparisons per challenge and ten per email per window. With fixed windows an attacker can make up to 20 attempts across a window edge, but no more than 3,650 a year against one address.

   Eight digits are 26.58 bits, so the yearly success chance is at most 3,650 / 10^8, about 0.00365%. Six digits would allow about 0.37%.

   After the email cap, code entry is locked for that address until the window ends, while the emailed link still works. An attacker can trigger that lock deliberately; the link is the fallback.
7. **One answer for every failure.** Wrong, expired, used, superseded, locked and unknown challenges all return the same message.
8. **Expiry and revocation.** A proof expires after 15 minutes, as the link does. Deleting an account revokes that email's outstanding proofs.
9. **Tests before implementation:**
   - wrong code, expiry, reuse, supersession and lock;
   - parallel redemption with exactly one winner;
   - link then code, and code then link;
   - a challenge used with another email's code;
   - attempt counting under concurrency;
   - races across an old and a new challenge for one email: attempts on both draw from the same ten;
   - the aggregate-cap boundary: of 20 parallel attempts, the correct code among them, at most 10 reach comparison, and an 11th attempt is refused even with the right code;
   - supersession or a fresh request after the cap does not reopen code entry before the window ends;
   - native and web requests share the issuance quota;
   - identical responses for existing and unknown addresses.

### Account deletion

**Scope (default: delete).** Apple's FAQ says deletion includes "user-generated content that's shared with others, such as photos, video, text posts, and reviews", and that "If local laws or regulations require that you maintain some data, let your users know". Today's removal only hides posts (`portal/src/community.ts:45-47`).

1. **Personal data.** The member row (email, display name, bio), sessions, outstanding sign-in proofs, MCP keys, `voice_access`, the email outbox and unsubscribe tokens. Supporter checkout and subscription records go once any billing obligation is settled and the person is told (`portal/migrations/0001_community.sql:14-21`, `0010_reply_email_notifications.sql:5-15`).
2. **Authored content.**
   - Discussions and replies, reading lists and their items, saved chats.
   - Sent direct messages.
   - Likes, bookmarks, follows, blocks, reports filed, and notifications to or from the member.

   These rows are listed in `portal/migrations/0001_community.sql`, `0006_member_chats.sql` and `0009_community_social.sql`.
3. **Other members' content attached to theirs** needs an explicit policy: replies in a deleted member's discussion, and conversations with another member. The default proposed here:
   - other members keep their own replies and messages;
   - the deleted discussion becomes a stub with no personal data.

   This is question 2.
4. **Provider-held data.** The repository documents provider transcripts as deleted within one day (`docs/VOICE-ASSISTANT.md:20`), and the deletion screen should say so.
   - Deleting them at once by conversation ID would need a provider key permission that is disabled today (`docs/VOICE-ASSISTANT.md:16`).
   - Stored `conversation_id` values link usage rows to provider records. Clear them once the provider's retention window has passed, or keep them only while a provider deletion is pending.
5. **Retention exceptions.** Only where a law requires it or for a specific stated purpose, and disclosed in the deletion flow and on the privacy page.
6. **Flow.** Fresh verification (a new code, which Apple allows), then deletion, a statement of how long it takes, and a confirmation when done. Any live call is ended first.

**Deletion-safe voice accounting (required).** Three facts from the source set the constraints:
- **The monthly budget** is `SUM(charged_seconds)` over every `voice_sessions` row created since the UTC month start **minus 720 seconds** (`monthStart − 600 − 60 − 60`). That window counts a reservation made in the last 12 minutes of a month, which can still be running, against the new month as well (`portal/src/voice.ts:31-32`, `:38`, `:47`). The existing boundary test asserts this (`portal/test/voice.test.mjs:71-76`).
- **The global call-slot limit** is a `COUNT` of rows in `reserved`, `connecting` or `active` (`portal/src/voice.ts:39`). The per-member lock is a `NOT EXISTS` plus a partial unique index on `member_id` (`portal/src/voice.ts:45`, `portal/migrations/0003_voice.sql:16-17`). All of these are checked in one atomic `INSERT … SELECT`.
- **`member_id` is `NOT NULL REFERENCES members(id)`** with no delete action (`portal/migrations/0003_voice.sql:6`), and D1 enforces foreign keys. Today a member who has any voice row cannot be deleted at all; the delete fails with a foreign-key error.

Deleting the voice rows to get around that would do more than reset a personal allowance:
- deleting a 600-second charge from a spent month gives the whole application 600 seconds back;
- deleting an open row frees a call slot while its relay keeps running. A database delete does not close a socket held by another Worker invocation (`portal/src/voice.ts:110-167`).

Repeated delete-and-sign-up would then bypass the application's monthly ceiling. The provider's credit ceiling is a separate limit and does not restore that guarantee. Keeping a member reference and moving only monthly charges into an aggregate would not help either: open rows would still reference the member and block the delete.

#### Migration contract: `0011_voice_deletion_safe`

This is a proposal for a later Worker lane, written as a contract, not code. **Needs Jake's OK to deploy.**

**Schema after the migration:**

| Item | Today | After |
| --- | --- | --- |
| `voice_sessions.member_id` | `TEXT NOT NULL REFERENCES members(id)` | `TEXT` (nullable) `REFERENCES members(id) ON DELETE SET NULL` |
| Other `voice_sessions` columns | `id`, `state`, `reserved_seconds`, `charged_seconds`, `created_at`, `expires_at`, `started_at`, `closed_at`, `conversation_id` | Unchanged: same names, types, `CHECK` constraints and `UNIQUE(conversation_id)` |
| `voice_one_active_member` | `UNIQUE (member_id) WHERE state IN ('reserved','connecting','active')` | `UNIQUE (member_id) WHERE member_id IS NOT NULL AND state IN ('reserved','connecting','active')`. SQLite already treats NULLs as distinct in a unique index; the added condition states that orphaned open rows never collide |
| `voice_member_history`, `voice_month_budget`, `voice_expiry` | As in `0003_voice.sql:18-20` | Recreated unchanged |
| `voice_access` | `member_id` primary key, references `members(id)` | Unchanged. The deletion batch deletes the member's row explicitly |

**Steps.** SQLite cannot change a column's nullability or foreign-key action in place, so the table is rebuilt:
1. `PRAGMA defer_foreign_keys = on`, which is Cloudflare's documented way to restructure tables in a D1 migration.
2. Create `voice_sessions_next` with the definition above.
3. Copy every row, naming all ten columns explicitly.
4. Drop `voice_sessions` and rename `voice_sessions_next` to `voice_sessions`. No table references `voice_sessions`, so the drop cascades nothing.
5. Recreate the four indexes.
6. `PRAGMA defer_foreign_keys = off`; `PRAGMA foreign_key_check` must return no rows.

**Rollout.**
1. Deploy `VOICE_ENABLED=false`. Existing calls stay bounded by their deadlines (`docs/VOICE-ASSISTANT.md:40`).
2. Wait until no row is `reserved`, `connecting` or `active`. That is at most 630 seconds after the last start.
3. Apply the migration.
4. Deploy the code changes below and re-enable voice.

Today's code is compatible with the rebuilt table, because it never writes a NULL `member_id`, so a delay between steps 3 and 4 is safe.

**Statements, with what each does for a deleted member's rows:**

| Statement | Change | Effect on a deleted member's rows |
| --- | --- | --- |
| Reservation `INSERT … SELECT` (`voice.ts:33-47`) | None. It must stay one atomic statement, with the 720-second window unchanged | The personal `SUM` ignores rows whose `member_id` is NULL. The global monthly `SUM` and open-row `COUNT` still include them |
| Per-member lock (`voice.ts:45`) | None; the index gains `member_id IS NOT NULL` | Orphaned rows never block a member's own lock, but still hold a global slot |
| Claim (`voice.ts:51`) | None | `member_id=?` never matches NULL, so an unclaimed reservation becomes unclaimable. It expires after 60 seconds as `cancelled`, charged 0 (`voice.ts:22`) |
| Active write, conversation-ID writes, reconcile, release and expiry (`voice.ts:22`, `:25`, `:57`, `:61`, `:194`, `:210`, `:218`) | None; they match by `id` and `state` | An orphaned call still closes and reconciles through its own relay, or expires fully charged |
| Tool authorisation (`voice.ts:238`) | None | Its join to `members` finds nothing, so the orphaned call's tools return 403 until it ends |
| Status and `finish` (`voice.ts:66-69`, `:276`) | None | Not reachable for a deleted member |
| `expireVoiceSessions` (`voice.ts:20-26`) | **Add one statement:** set `conversation_id` to NULL where `member_id IS NULL`, the state is `closed`, `cancelled` or `expired`, and `closed_at ≤ now − 86400` | Provider conversation IDs on orphaned rows are dropped once the documented one-day transcript retention has passed, never on open rows |
| **New: deletion batch** | One D1 `batch()`, which is one transaction. Delete the member's sessions, sign-in proofs, MCP keys, `voice_access` row and content rows (scope above), then the `members` row | The foreign-key action sets `member_id` to NULL on every voice row in the same transaction. `state`, `reserved_seconds`, `charged_seconds`, `created_at`, `expires_at` and `started_at` are untouched. No reservation is cancelled, released or deleted |

**Type changes.**
- `Session.member_id` becomes `string | null` (`portal/src/voice.ts:10-13`). Every reader must handle NULL. None returns it to a client today: status returns only `id`, `expires_at` and `state` (`portal/src/voice.ts:73`).
- The migration lists in the unit fixture and the Worker integration test gain `0011` (`portal/test/voice.test.mjs:21`, `:254`).

**Tests that must pass before deployment.** All run with foreign keys enforced: Node's built-in SQLite enables them by default, and Miniflare's D1 enforces them.
1. **Migration fidelity.**
   - Every row and column is identical before and after.
   - `PRAGMA foreign_key_list` shows `SET NULL`, and `member_id` is nullable.
   - The four indexes exist, and `foreign_key_check` is empty.
2. **Both global slots occupied during deletion.**
   - Members A and B each hold an `active` call; delete A with the full batch.
   - A's row keeps `active`, its reservation and its charge, with `member_id` NULL.
   - Member C's reservation is refused, because the count is still 2. A's tools return 403.
   - When A's relay reconciles by `id`, the row closes at the elapsed charge. Only then can C reserve.
3. **A call crossing UTC midnight at month end.**
   - With a monthly budget of 800 seconds, A reserves 600 seconds at 10 seconds before the boundary and connects at 5 seconds before.
   - A is deleted at 2 seconds after the boundary.
   - B reserving at 5 seconds after the boundary gets 200 seconds: A's charge still counts in the new month.
   - Window edge: a row created at month start minus 720 seconds counts in the new month; one created at minus 721 does not.
4. **Repeated delete-and-sign-up.** With a 1,200-second budget, two cycles of sign up, a 600-second call and deletion leave the budget spent. A third new member is refused.
5. **Unclaimed reservation at deletion.** The claim fails, and the row expires as `cancelled` with no charge.
6. **Several orphaned open rows.** They coexist without a unique-index collision.
7. **Batch atomicity.** A failing statement leaves the member and every voice row unchanged.
8. **Conversation-ID cleanup.** It clears only orphaned, closed rows older than one day.
9. **Same email signs up again while an orphaned call runs.** The new member gets a personal allowance as question 2 decides. The orphaned call still holds its slot and its budget.

**Evidence.** A hardware-free run of tests 1 to 7 passed on 3 October 2026. It used Node 26.10's built-in SQLite with foreign keys on, the repository's migrations 0001 to 0004, and the reservation, claim, reconcile, expiry and tool statements read unchanged from `portal/src/voice.ts`. It also confirmed that the current schema refuses the delete. It is evidence for this contract, not product code.

The personal lifetime allowance stays separate from these aggregates. Whether a returning email gets a fresh 600 seconds is question 2.

### Worker changes

For the recommended cookie contract. Each item **needs Jake's OK to deploy**. None of them changes the relay (`portal/src/voice.ts:91-228`) or the tools.

1. **Native code issuance.** `auth/request` native mode, the challenge, the code, the keyed MAC and supersession, under the contract above. **Needs Jake's OK to deploy.**
2. **Code exchange.** `auth/consume-code` with atomic attempts, one-winner redemption and shared link/code consumption. It returns the session cookie as `auth/consume` does, and labels the session `client:"ios"` through a migration. **Needs Jake's OK to deploy.**
3. **Code secret.** A new Worker secret for the code MAC, with separate values for production and staging. **Needs Jake's OK to deploy.**
4. **Account deletion.** A route for cookie sessions with Origin and fresh verification, linked from the web account page too, with the scope above. **Needs Jake's OK to deploy.**
5. **Deletion-safe voice accounting.** Migration `0011_voice_deletion_safe`, the added cleanup statement, the deletion batch and the `Session` type change, with the nine tests in the contract above. Deletion cannot refund the monthly budget or free open slots. **Needs Jake's OK to deploy.**
6. **Budget signal.** The 429 from start gains `reason: "budget" | "capacity"`, and status gains `budget_open`. Both clients can then say "Voice is closed for this month" (`portal/src/voice.ts:258-262`, `:64-74`). **Needs Jake's OK to deploy.**
7. **Optional refund signal.** Error bodies from `connect` gain `released: true | false`. This helps HTTP clients only; WebSocket clients still read status (section 1). **Needs Jake's OK to deploy.**
8. **Optional usage split.** A `client` column on `voice_sessions` so app and web minutes can be reported apart. **Needs Jake's OK to deploy.**
9. **Privacy page and voice docs.** Mention the app, the microphone, ElevenLabs and deletion in the privacy view (`portal/public/community.js:196`) and in `docs/VOICE-ASSISTANT.md`. **Needs Jake's OK to deploy.**
10. **Universal links (later).** An `apple-app-site-association` route for a dedicated app sign-in path, only if links are wanted. **Needs Jake's OK to deploy.**

If the synthesis chooses the header design, add these:
- `member()` accepts `X-Opax-Session`;
- `sameOrigin()` passes only a validated header token on a request with no Cookie;
- mixed and invalid credentials are refused;
- logout accepts the header;
- regression tests run across every community route.

**Needs Jake's OK to deploy.**

### Options considered and not chosen

#### B. Anonymous app allowance

Each install gets an allowance without an email. App Attest or DeviceCheck proves the requests come from a genuine copy of the app.

- **What the Worker needs.**
  - App Attest attestation and assertion verification: CBOR, an X.509 chain to Apple's App Attest root, counters and receipts.
  - DeviceCheck two-bit queries and updates with an Apple-signed JWT, which is a new secret.
  - A new anonymous `voice_sessions` principal and a separate app budget.
  - All of this is new security-critical code in the Worker.
- **Cost.** Allowances are no longer tied to a person.
  - At 600 seconds per install, 66 installs would spend the whole current monthly budget. Voice would then be "busy" for web members too, unless the app has its own budget, provider key and ceiling.
- **Device facts that shape cost.**
  - App Attest keys do not survive reinstalling the app, migrating to a new device or restoring from a backup. On their own, they give a fresh allowance per reinstall.
  - DeviceCheck's two bits per device do persist across reinstalls, device transfer and "Erase all contents and settings", so one bit can record "allowance used".
  - `DCAppAttestService.isSupported` is false on some devices, which then need a fallback or no voice.
  - Apple's fraud-risk receipt reports how many keys a device attested in 30 days.
- **Abuse.** App Attest stops scripts outside the app, not people with several devices. A reinstall gets a fresh allowance unless DeviceCheck bits record usage.
- **Privacy.** No email. Device attestation data and IP addresses are processed; audio and transcripts still go to the provider.
- **App Review.** No account, so no deletion requirement. 5.1.2(i) consent for the third-party AI still applies.

#### C. Voice opens the web panel in an in-app browser

The app opens `https://opax.com.au/chat` (or a voice deep link) in `SFSafariViewController` or `ASWebAuthenticationSession`, and the existing web client runs unchanged.

- **What works.** The relay, allowance, tools and transcript UI are reused with no Worker change. CSP allows the page as a top-level document.
- **What breaks.**
  - **`SFSafariViewController`** shares no website data with Safari; Apple directs apps that need sharing to `ASWebAuthenticationSession`. The app cannot inject the session cookie. The sign-in email link opens in Safari or Mail, not in this view, so the person cannot easily sign in where they talk. The microphone itself should work: WebKit's tracker records `getUserMedia` support in this view from iOS 13 (WebKit bug 183201), though Apple's own docs do not say so.
  - **`ASWebAuthenticationSession`** shares Safari's cookies by default, so a person signed in on Safari might reach voice. But Apple documents it only for authentication. It shows a system consent prompt and is built to finish on a callback URL, not to host a ten-minute call. Microphone support in it is not documented.
  - **A `WKWebView`** supports `getUserMedia` from iOS 14.3, has a microphone-permission delegate from iOS 15, and can take an injected cookie. But it only helps once the app already has a native session (option A), and the call UI stays a web page.
  - In every variant, the call UI is the web panel, and it ends the call when the page is hidden (`portal/voice/client.js:409`).
- **Cost and abuse.** As on the web.
- **App Review.** 4.2 minimum functionality (low risk while the rest of the app is native). 5.1.1(vii) says a Safari view controller must be visible. Links that leave opax.com.au can affect the "Unrestricted Web Access" age-rating answer.

#### The provider's WebRTC SDKs

The official SDKs could connect directly to ElevenLabs with a WebRTC conversation token minted by the Worker (`GET /v1/convai/conversation/token`). That would bring Opus audio and WebRTC echo cancellation, with much less data than base64 PCM. But it bypasses the relay that enforces Opax's rules:
- the client could set initiation data and dynamic variables, which the relay discards today (`portal/src/voice.ts:91-107`);
- the server deadline and message filtering would be gone (`portal/src/voice.ts:110-167`);
- reconciliation would depend on provider webhooks or polling instead of a confirmed socket close;
- the tool authorisation that relies on a relay-set `active` state would need redesigning (`portal/src/voice.ts:238`).

It also adds LiveKit WebRTC native dependencies. Revisit it only if data cost becomes the main problem.

#### Comparison

| | A. Sign in | B. Anonymous | C. Web panel |
| --- | --- | --- | --- |
| Worker change | Moderate: code sign-in, deletion with deletion-safe accounting | Large: attestation, new principal, new budget | None |
| Native audio work | Yes | Yes | None |
| Cost exposure | Same as web | Unbounded per person; needs its own budget | Same as web |
| Abuse controls | Existing | New and weaker per person | Existing |
| Privacy | Email and user ID | Device attestation | Web data in a view |
| App Review | Needs in-app deletion | Simplest | Sign-in flow does not work in the view |

## 4. The native audio path

### The provider SDKs cannot use the relay

- **ElevenLabs React Native SDK** (`@elevenlabs/react-native` 1.2.28, the latest on npm on 3 October 2026). Its platform entry says: "Only WebRTC connections are supported on React Native. WebSocket connections require Web Audio APIs (AudioContext, AudioWorkletNode) that are not available in React Native." It throws if given `connectionType: "websocket"` or a `signedUrl` (`src/index.react-native.ts:26-39`). Its peer dependencies are LiveKit's React Native WebRTC packages, and the ElevenLabs docs require Expo development builds.
- **ElevenLabs Swift SDK** (v3.4.0, released 29 September 2026). Voice conversations use LiveKit WebRTC. The WebSocket transport, including `signedWebSocketURL`, is for text-only conversations (`Sources/ElevenLabs/Public/Conversation/Conversation.swift:162-166`, `Sources/ElevenLabs/Internal/Networking/WebSocketConnectionManager.swift:1-13`). Text-only overrides would be discarded by the relay anyway (`portal/src/voice.ts:96-99`).
- **The JavaScript SDK's WebSocket voice path** depends on AudioWorklets and `getUserMedia` (`dist/platform/web/input.js`, `dist/platform/web/output.js`), so it does not run in React Native either.

Neither SDK can be pointed at the Opax relay. Both architectures need their own relay client and audio pipeline. The protocol in section 1 is small enough for that.

### One Swift voice core for both architectures

The audio and socket work is the same in either architecture, so write it once as a Swift package.

1. **Relay client.**
   - A `URLSessionWebSocketTask` built from a `URLRequest`:
     - the URL is the `signed_url`, validated for scheme, host and path as the web does (`portal/voice/client.js:341-343`);
     - headers are `Sec-WebSocket-Protocol: convai` plus the session credential: `Cookie` and `Origin` in the recommended design, or `X-Opax-Session` (section 3);
     - the task comes from the dedicated authenticated session, with no cookie store.
   - Set `maximumMessageSize` explicitly, for example to 2 MiB. The relay passes provider messages of up to 1,000,000 characters (`portal/src/voice.ts:146`), and Apple does not document the default (reported as 1 MiB).
   - On open, send `{"type":"conversation_initiation_client_data"}` at once; the relay replaces its content.
   - Answer every `ping` with `pong`.
   - Decode events on a serial queue, never on the audio thread.
2. **Audio engine.**
   - One `AVAudioEngine` for capture and playback. Session category `.playAndRecord`, mode `.voiceChat`, options `.defaultToSpeaker` and `.allowBluetoothHFP` (renamed from `.allowBluetooth` in the iOS 26 SDK).
   - Call `inputNode.setVoiceProcessingEnabled(true)` while the engine is stopped. Apple's WWDC19 guidance is that voice processing switches both I/O nodes and works only when rendering to a device.
   - The `.voiceChat` mode alone does not cancel echo. Without voice processing, "the system doesn't apply voice-specific processing, like echo cancellation and automatic gain correction".
   - Capture and playback must share this engine, or the canceller has no reference for the agent's voice and the agent hears itself on the loudspeaker.
3. **Format negotiation.**
   - Parse `user_input_audio_format` and `agent_output_audio_format` from the metadata before allocating any buffer or converter. Accept only `pcm_<rate>` and `ulaw_<rate>`, with rates from a fixed list (8,000, 16,000, 22,050, 24,000, 44,100 and 48,000).
   - Missing input format means `pcm_16000`, as in the SDK (`dist/utils/WebSocketConnection.js:139-141`).
   - Anything else fails closed: the call ends with "Voice is unavailable right now", and the error is logged without content.
   - Both codecs are supported in both directions, so a provider-side format change does not break the app.
4. **Capture.**
   - Tap the input node in its hardware format. The tap callback only copies samples into a bounded ring buffer. Conversion and encoding run on the voice core's own serial queue, never in the tap.
   - Convert with one long-lived `AVAudioConverter.convert(to:error:withInputFrom:)` instance per call, so resampler state carries across taps. The output is mono at the negotiated rate.
   - Encode by codec:
     - `pcm` as 16-bit **little-endian**, serialised explicitly;
     - `ulaw` as 8-bit G.711 µ-law, matching the SDK's encoder table and its round-then-encode rule (`dist/platform/web/rawAudioProcessor.generated.js:11-46`, `:115-117`).
   - **Chunk policy (new, not web parity).** An average of 25 ms per message at the negotiated rate, kept exact over time by a fractional-sample accumulator.
     - Chunk `k` (counting from 0) holds `floor((k+1)·rate/40) − floor(k·rate/40)` samples, computed in integer arithmetic so there is no rounding drift. Every 40 chunks hold exactly one second of audio.
     - At 8,000, 16,000, 24,000 and 48,000 Hz every chunk is exactly 25 ms: 200, 400, 600 and 1,200 samples. At 16 kHz that is 800 PCM bytes, or 400 µ-law bytes.
     - At 22,050 Hz, 25 ms is 551.25 samples, so chunks repeat 551, 551, 551 and 552. At 44,100 Hz, 25 ms is 1,102.5 samples, so chunks alternate 1,102 and 1,103.
     - The web SDK's chunks vary, for example 32 ms (section 1). This policy matches the web's sample values, not its chunk boundaries.
     - Base64 uses the standard alphabet with padding, inside `{"user_audio_chunk": …}`.
   - While muted, send zero-valued chunks as the SDK does (`dist/platform/web/rawAudioProcessor.generated.js:100-102`), so the provider's turn-taking timing matches the web. Also set `isVoiceProcessingInputMuted`.
   - **Backpressure.** The send queue is bounded, for example two seconds of audio. If the socket cannot keep up past that bound, end the call with a network error rather than buffering without limit.
5. **Playback.**
   - Decode `audio` events by the negotiated codec into float buffers. PCM16 payloads with an odd byte count are invalid and are dropped. µ-law payloads may have any length.
   - Schedule the buffers on an `AVAudioPlayerNode` feeding the main mixer. The queue of scheduled audio is bounded.
   - Track queued buffers for the speaking/listening mode.
   - On `interruption`, stop the player node to flush its queue, restart it, and ignore audio events whose `event_id` is below the interruption's (`dist/VoiceConversation.js:68-87`).
6. **Call controller.** A state machine:
   - idle, checking status, asking for consent, signing in, asking for the microphone, reserving, connecting, live (listening, speaking or muted), ending, ended with a reason;
   - the local countdown from `remaining_seconds` is display only, and the server deadline is authoritative;
   - a 35-second connect timeout, as on the web;
   - End sends close 1000, then `finish`, then polls status;
   - after any call end or failure, the allowance shown and the end message come from a fresh status read. Status says whether the personal allowance is used up, whether the member is unlimited, and whether an earlier reservation is still open. A spent monthly budget shows only after Worker change 6 (section 1).
7. **Transcript and sources.**
   - Ports of the web allow-list and Markdown link parsing (`portal/voice/client.js:38-65`), with the same caps.
   - Both tool-result shapes are accepted: `source_url` may be absent and `sources` may be empty (section 1, step 10).
   - Allowed paths open the app's own record screens.

### Expo SDK 57 and React Native 0.86

Expo SDK 57 pairs with React Native 0.86.0.

- **Official SDK: does not fit.** It is WebRTC only and refuses signed URLs (above).
- **`expo-audio`: capture only.** Its `useAudioStream` / `AudioStream` captures real-time PCM (float32 or int16, a requested sample rate, default 48 kHz) through an `onBuffer` callback. But it documents no echo cancellation or voice-processing option, and no streaming PCM playback. Pairing it with a separate playback library leaves the canceller without the agent's voice as a reference. Not recommended.
- **Recommended: a local Expo module** (`npx create-expo-module --local`) that wraps the Swift voice core.
  - The JavaScript surface is small: `status()`, `start()`, `setMuted()`, `end()`, plus events for state, mode, transcript, sources, countdown and the end reason.
  - Audio and the socket stay native. About forty audio messages a second never cross into JavaScript, and a busy JavaScript thread cannot starve audio.
- **Configuration.**
  - The microphone purpose string goes through `ios.infoPlist` in `app.json`, or `expo-audio`'s `microphonePermission` plugin option if the app already uses it.
  - No `UIBackgroundModes`.
  - Any custom native module needs a development build, not Expo Go.
- **Keeping the socket in JavaScript instead.** React Native's `WebSocket` accepts a non-standard `headers` option (the 0.86 notes fix an Android bug that dropped a `Cookie` header passed this way). Keeping the socket in Swift avoids relying on it.

### SwiftUI

- **Official SDK: does not fit.** Voice is WebRTC; the signed WebSocket URL is text-only (above).
- **Direct use.** The Swift voice core sits behind an `@Observable` call model, and the SwiftUI call screen binds to its state. There is no bridge, no module definition and no second language in the audio path.

### Audio session, interruptions and routes

| Event | Handling |
| --- | --- |
| Start | Activate the session only after consent and microphone permission. Deactivate with `.notifyOthersOnDeactivation` when the call ends |
| Interruption begins (phone call, alarm, another app's audio) | End the call cleanly with close 1000 and say why. Relay and provider time keep running, so pausing would only spend the allowance. A phone call deactivates the session and stops audio at once; if accepted, the app is suspended |
| Siri | Treat like any interruption. Apple does not document Siri's effect on a `.playAndRecord` session, so this is a device check |
| Interruption ends | Do not restart automatically. Offer Start again once status shows no open session |
| iOS 27 | `InterruptionType` and its options are deprecated in favour of `didBecomeInactiveNotification` and `resumptionRecommendationNotification`. Handle both, because the deployment target likely spans iOS 18 to 27 |
| Route change (AirPods on or off, wired headset) | When the hardware sample rate or channel count changes, the engine "stops, uninitializes itself" and posts `AVAudioEngineConfigurationChangeNotification`. Its nodes keep their old formats, and Apple says: "The app must reestablish connections if the connection formats need to change." The notification arrives on an internal queue, and Apple warns against tearing the engine down synchronously in the handler. So hop to the voice core's queue, reconnect the input tap and player with the new formats, recreate the converter (Bluetooth hands-free often runs at 16 or 24 kHz), and restart, keeping the socket. If the restart fails, end the call. Unlike media playback, keep talking on the new route |
| Media services reset | End the call; rebuild the engine and session on the next Start |
| App goes to the background | End the call when the scene enters the background, matching the web's hidden-tab rule (`portal/voice/client.js:409`). Do not end it on a brief inactive state such as Control Centre. Keep the screen awake while connected (`isIdleTimerDisabled`), so auto-lock does not end calls |

**Background mode.** Foreground-only calls are a product choice for v1, not an Apple prohibition. App Review 2.5.4 allows background services for their intended purposes, including VoIP and audio. Do not add `UIBackgroundModes` `audio` in v1, because:
- it would need its own review justification;
- a suspended app's sockets fail (TN2277), so without the mode the call cannot survive in the background anyway;
- the web ends calls when the tab is hidden;
- an open microphone after the person leaves the app is a privacy surprise.

This is question 5.

### Microphone permission

- `NSMicrophoneUsageDescription` (draft in section 6).
- Request with `AVAudioApplication.requestRecordPermission()` on iOS 17 and later. `AVAudioSession`'s version is deprecated from iOS 17.
- Ask on the first Start, after the consent screen and **before** `POST /api/voice/start`, so a refusal never reserves time. The web asks after reserving, inside the SDK.
- Never ask at launch or when the voice screen opens; the web does not either (`docs/VOICE-ASSISTANT.md:3`).
- If permission is denied, explain and link to Settings.

### Energy and data for a ten-minute call

These figures assume `pcm_16000` in both directions and the native 25 ms chunk policy. MB means 10^6 bytes. They count application payload and WebSocket framing only: no downstream event metadata, and no TLS, TCP or IP overhead. Real network use is somewhat higher, and the top of the range is not a strict upper bound.

| Stream | Rate | Ten minutes |
| --- | --- | --- |
| Up: each message is 800 PCM bytes, 1,068 base64 bytes, 1,091 JSON bytes and 1,099 bytes framed, 40 a second | 43,960 B/s (about 352 kbit/s), continuous, including while muted | about 26.4 MB |
| Down: base64 PCM while the agent speaks | about 42.7 KB/s while speaking | about 12.8 MB if it speaks half the time; 25.6 MB if it speaks throughout |
| Total | | **about 39 MB typical; about 26 to 52 MB before overhead** |

If the production agent's output format is `pcm_44100` rather than `pcm_16000`, downstream becomes about 117.6 KB/s while speaking, or 35 to 71 MB. That is why the output format is an open question.

The upload alone is roughly ten times the bitrate of a typical Opus VoIP call at about 32 kbit/s. Base64 PCM over JSON is the relay protocol's cost.

**Energy drivers:**
- the radio stays fully active for the whole call, because chunks leave every 25 ms (or about every 32 ms on the web);
- voice processing runs continuously;
- the screen stays on.

No reliable figure can be given without a device. Measure battery and data on a real iPhone (section 5).

**Ways to reduce it later:**
- a lower-rate provider input format such as `ulaw_8000`, shared with the web and with an accuracy trade-off;
- the WebRTC route rejected above.

### Accessibility

- **Transcript as captions.**
  - The live transcript of both sides is the primary channel for deaf and hard-of-hearing people. Show it from the first turn, apply corrections in place, and keep it until the call screen closes.
  - It is never persisted, as on the web.
  - Audio `alignment` data, when the agent sends it, can highlight words as they are spoken.
- **Typing instead of speaking.** The relay forwards `user_message` text up to 2,000 characters (`portal/src/voice.ts:104`). A "Type instead" field during a call helps people who cannot or prefer not to speak; it still uses call time. Ask remains the text-only alternative.
- **VoiceOver.**
  - Announce state changes briefly: connecting, listening, Opax speaking, muted, ended with reason.
  - Do not auto-announce agent turns, which the agent already speaks.
  - Make each turn one element ("You said …", "Opax said …"), and make sources links.
  - Support the Magic Tap gesture to toggle mute.
  - VoiceOver's own speech is a separate system output and may not be removed by echo cancellation, so the agent could hear it. Suggest headphones when VoiceOver is running; this is a device check.
- **Dynamic Type.** Support all sizes, including the accessibility sizes. Controls stack vertically at large sizes; the countdown uses monospaced digits; there are no fixed heights.
- **Motion and colour.** Under Reduce Motion, the waveform becomes a static indicator. No state is shown by colour alone.

### Which architecture voice favours

Voice favours SwiftUI, but only slightly. The audio engine, relay client, state machine, transcript model and their tests are the same Swift code either way. React Native adds:
- a local Expo module definition and its TypeScript surface;
- event plumbing for transcript and state;
- an `app.json` configuration entry.

Estimate: a few days of extra work within a multi-week voice build. That is not enough on its own to choose the app's architecture. Choose the architecture for the rest of the app; voice fits either.

## 5. Testing without sound or cost

Automated tests never open a real microphone, never play audible sound and never reach ElevenLabs or an opax.com.au voice or community route. Silent tests model every state, but they do not validate hardware effects such as echo cancellation, route quality, Siri or battery use. Those stay manual (below).

### Fake relay in the local fixture Worker

The fake relay lives in the local fixture Worker defined by the API lane (`wrangler dev` on a port from 8900 to 8999), never in production routes.

**Routes.**
- It serves `status`, `start`, `connect` and `finish` with the same paths, JSON shapes, status codes and error strings as section 1.
- It serves local versions of the new auth routes (code request, code exchange, logout and account deletion), using synthetic accounts and no email.
- A fixture-only clock control lets tests run reservation expiry without waiting.
- Its tool runner reads fixture data through a local reader. It must never forward to a production service binding. The API lane notes that `STAGING_API` can forward reads to production, so the fixture fails closed on any non-loopback host.

**URLs and launch arguments.**
- Its `start` returns `ws://127.0.0.1:<port>/api/voice/connect?session_id=…`. The real route would emit `wss:` (section 2, item 5).
- Debug builds accept `ws:` for loopback only, with App Transport Security's local-networking exception. Release builds accept only `wss:` on the configured origin, and validate host and path as the web does (`portal/voice/client.js:341-343`).
- A TLS loopback variant serves `https:` and `wss:` with a test certificate trusted only on the assigned simulator. It runs the credential integration check in section 3: `Cookie`, `Origin` and `Sec-WebSocket-Protocol` must reach the Worker unchanged on the upgrade, with the cookie keeping `Secure`.
- Fixture session tokens name the scenario (for example `fixture-voice-exhausted`). The fixture base URL and token arrive as launch arguments in debug builds, so Maestro selects a server scenario without changing app logic.

**Protocol.** It follows the provider stub already in `portal/test/voice.test.mjs:237-250`:
- send `conversation_initiation_metadata` (`conv_fixture`, `pcm_16000` both ways) as soon as the socket opens;
- import `voiceClientEvent` from `portal/src/voice.ts:91-107` to enforce the real client-message rules;
- apply the same 10-second initiation timer and 150-messages-a-second limit.

It logs each accepted message type, audio chunk size and arrival time to a fixture-only `GET /__fixture/voice/log` for assertions: chunk cadence, base64 alphabet, initiation order and `pong` latency.

**Canned conversation**, in order:
1. A greeting `agent_response` and `audio` events containing zero-valued PCM, so nothing is audible even on an unmuted device, with `alignment` data.
2. A `ping` every 5 seconds.
3. A canned `user_transcript`.
4. `agent_tool_response` and `agent_tool_response_full_payload`. The `full_tool_result` comes from `runVoiceTool` (`portal/src/voice-tools.ts:71-150`) running against the fixture's own data, so the sources list shows real fixture records. Three results are covered:
   - a standard result;
   - a receipt answer with no `source_url`;
   - a receipt clarification with empty `sources` (`portal/src/voice-money.ts:156-181`).
5. An `agent_response` with Markdown links: some to published record paths, and one link the allow-list must reject.
6. An `interruption` followed by stale lower-numbered `audio` events.
7. An `agent_response_correction`.

### Scenarios

Each row is a fixture scenario selected by its session token, or an injected dependency in the voice core. None needs hardware.

**Status, start and connect**

| Scenario | Fixture behaviour | App must |
| --- | --- | --- |
| Happy path | Script above, clean close 1000 on End | Show transcript, sources and mute state; end; call `finish`; refresh status |
| Signed out | status `signed_in:false`; start 401 | Offer sign-in; never request the microphone |
| Voice disabled | status `enabled:false` | Explain; point to Ask |
| Allowance used | status `remaining_seconds:0`; start 403 | "10 free minutes used" state |
| Budget closed | start 429 `reason:"budget"` (after Worker change 6) | "Closed for this month" state |
| At capacity | start 429 `reason:"capacity"` | "Busy, try again shortly" |
| Call open elsewhere | status `active_session`; start 409 | Explain; poll status before enabling Start |
| Start 503 after the row was written | 503 with only the generic error, so no `session_id`; status shows `active_session` in state `reserved` for up to 60 s, then none, with nothing charged (clock control) | Wait for status to clear; never show time as used |
| Connect refused before the claim | 503, 426 or 400; status shows the `reserved` row | Call `finish` with the known `session_id`, then refresh status |
| Connect 503, released | 503; status then shows no open session and the same remaining time | "Couldn't connect; no time used", taken from status |
| Connect 503, release failed | 503 (generic); status shows `connecting` until `expires_at`, then none, with the full reservation charged | Same as a retained `connecting` row |
| Connect 503, retained `connecting` | 503; status shows `active_session` in state `connecting` until `expires_at`, then none, with the full reservation charged (clock control) | Show that the last call is still closing and when it will clear. Enable Start only after status clears. Show the charged allowance from status, never from the 503 |
| Connect 503, retained `active` | 503 after the `active` write; status shows state `active` until `expires_at`, then `expired`, fully charged | Same as above; the state label does not change the message |
| Replayed connect | Upgrade 409 for a `signed_url` already used | Never reopen an old `signed_url`; it is single-use (`portal/src/voice.ts:172-173`) |

**How a call ends**

| Scenario | Fixture behaviour | App must |
| --- | --- | --- |
| Personal allowance deadline | Personal balance 5 s, budget ample; start reserves 5; close 1000 "Your free voice time has finished"; status then `remaining_seconds:0` | Allowance-used state |
| Monthly budget deadline | Personal balance 300 s, budget 5 s; start reserves 5; same close message; status then shows personal time left and `budget_open:false`, and the next start returns 429 `reason:"budget"` (after Worker change 6) | "Closed for this month", not allowance used |
| Unlimited call limit | status `unlimited:true`; the fixture shortens the call to 5 s; same close message; status then shows no open session | "This call has finished. Start another whenever you're ready." Start stays available |
| Network drop | Fixture drops TCP without a close frame mid-call | End the call, explain, poll status until `active_session` is null |
| Provider close | Relay-style close 1000 "Voice conversation ended" or 1011 "Voice provider connection interrupted" | Matching end state; allowance from status |
| Agent ends call | `agent_tool_response` for `end_call` | End cleanly |
| Provider error | `error` with `max_duration_exceeded` | End cleanly |
| Reconnect | After a drop, the first `start` returns 409, then 201 | Start a new call once status shows no open session |

A dropped call cannot be resumed. The reservation and the provider signature are both single-use. "Reconnect" therefore always means a new call.

**Sign-in, credentials and deletion**

| Scenario | Fixture behaviour | App must |
| --- | --- | --- |
| Code request | Identical response for a known and an unknown address | Show "check your email" either way |
| Bad code | Wrong, expired, reused, superseded or locked code: one generic failure | One message; offer a new code |
| Parallel redemption | Two verifications of one code at once: exactly one session | End signed in once, with no duplicate session |
| Link before code | The emailed link is redeemed first; the code then fails generically | Offer a new code |
| Session expired or revoked | As after "sign out everywhere" on the web: voice status returns **200** with `signed_in:false` (`portal/src/voice.ts:65`, `:244-247`), community status returns `member:null` (`portal/src/community.ts:12-14`), and `start` returns **401** (`portal/src/community-core.ts:27`) | Clear the stored credential when status reports signed out, as well as on any 401; show signed out; never retry with the old token |
| Wrong credentials | Cookie without Origin, or wrong Origin: 403. Under the header design, mixed or invalid credentials are refused | Treat as signed out; never retry with other credentials |
| Delete while idle | Fresh verification, then deletion | Signed out; status `signed_in:false` |
| Delete during a call | The app ends the call before deleting. A fixture variant deletes server-side mid-call: tools return 403 and the call runs to its deadline | Signed out after the call. The fixture asserts the monthly budget and slot counts were not refunded |
| Consent withdrawn | Consent cleared in settings | No microphone prompt and no start until consent is given again. A call in progress ends |

**Tools, formats and lifecycle**

| Scenario | Fixture or injection | App must |
| --- | --- | --- |
| Tool shapes | Standard, receipt-answer and receipt-clarification results | Sources list handles a missing `source_url` and empty `sources` |
| µ-law call | Metadata names `ulaw_8000` both ways | Encoder and decoder switch codec; chunk sizes follow the policy |
| Unsupported format | Metadata names `opus_48000` or `pcm_abc` | Fail closed before allocating buffers; end the call |
| Audio failure | Injected failure of session activation, engine start or converter creation | End the call, explain, call `finish`, refresh status |
| Interruptions | Injected began and ended events, in both the pre-iOS 27 and iOS 27 notification forms | End the call on began; no automatic restart on ended |
| Route and configuration change | Injected configuration change with a new input format | Reconnect the graph on the core's queue and keep the socket |
| Media services reset | Injected reset | End the call; rebuild on the next Start |
| Background and foreground | Injected scene phase changes, including a brief inactive state | End on background only |

The voice core takes these dependencies through protocols:
- the permission source;
- the audio session;
- an engine factory;
- a lifecycle event stream;
- a clock;
- the credential store.

Unit and Maestro tests can therefore drive every transition without the microphone, the speaker or a provider.

### Unit tests with synthetic buffers

- **Encoder.**
  - PCM16 with the SDK's clamping and scaling, the `Int16Array` truncation, and explicit little-endian bytes.
  - µ-law with the SDK's round-then-encode rule, compared with its table for every 16-bit input.
  - Standard base64 with padding.
  - The chunk policy, at every accepted rate, with partial chunks carried over. It is not web chunk parity.
    - 16 kHz gives exactly 400 samples per chunk.
    - 22,050 Hz repeats 551, 551, 551 and 552.
    - 44,100 Hz alternates 1,102 and 1,103.
    - Over any 40 consecutive chunks the total is exactly the sample rate, with no drift after an hour of simulated input.
- **Resampler.**
  - 48, 44.1 and 24 kHz sine tones to 16 kHz.
  - Output length within one sample per chunk.
  - Tone frequency preserved (Goertzel); no clipping.
  - Feeding one buffer in two halves gives the same output as feeding it whole, proving converter state carries across taps.
- **Decoder.**
  - PCM16 and µ-law to float.
  - An odd byte count is invalid only for PCM16; µ-law accepts any length.
- **Format parser.** Accepts the SDK's `pcm_<rate>` and `ulaw_<rate>` names (`dist/utils/BaseConnection.js:81-94`) with listed rates. Rejects malformed or unlisted formats before any allocation.
- **Playback queue.**
  - Buffers play in order, under the queue bound.
  - An interruption flushes the queue.
  - Audio with an `event_id` below the last interruption is dropped.
  - Mode is speaking while audio is queued and listening once it drains.
- **Backpressure.** A stalled socket ends the call at the send-queue bound instead of growing memory.
- **Protocol.**
  - Initiation goes first.
  - `pong` echoes the `event_id`.
  - Unknown event types are tolerated.
  - Close codes and HTTP statuses map to UI states, with allowance always taken from status.
- **Sources.**
  - A port of the web allow-list (`portal/voice/client.js:39-48`) with the same accepted and rejected cases.
  - Markdown link parsing.
  - Caps of 80 turns, 12 sources and 12,000 characters.
  - The three tool-result shapes.
- **Credentials.**
  - The token is read from and written to a mock Keychain only.
  - It is attached only on allow-listed paths.
  - Redirects on authenticated requests are refused.
  - Credential headers and `signed_url` are redacted in log output.
  - A 401, or a 200 status with `signed_in:false`, clears the token.
- **State machine.**
  - Every state from idle to ended, including cancellation at each step.
  - A reservation made before cancellation is released through `finish`.
- **Engine graph.** The playback graph and converter run in `AVAudioEngine` manual rendering mode, with no audio hardware. Voice processing is unavailable in manual rendering mode, so echo cancellation is a device check only.

**Synthetic microphone.** The voice core has a debug-only input source that generates PCM instead of opening the microphone, selected by launch argument. The simulator otherwise captures the Mac's real microphone, which is both a privacy problem and a source of flaky tests. Playback in tests is triple-guarded:
- the fixture sends silence;
- a debug flag sets output gain to zero;
- the Mac stays muted.

### Maestro journeys

There is one flow for each scenario in the tables, asserting on accessibility identifiers and visible text, never on audio. Flows:
- set microphone permission with Maestro's `launchApp` permissions or with `xcrun simctl privacy <udid> grant|revoke|reset microphone <bundle-id>`;
- select the fixture scenario with launch arguments. Audio-failure and lifecycle rows use launch arguments that swap in scripted dependencies, in debug builds only;
- run only on the OPAX simulators assigned in the brief, booted through the shared simulator gate and built through the shared build gate.

### Physical-device checks for Jake (never automated)

These cost provider credit and play sound, so they are manual only, on a real iPhone against staging first:

1. **End to end.** A full call: greeting heard, transcript shown, a tool call with sources, End. Status then shows the allowance reconciled to the elapsed time.
2. **Echo.** On the speaker at full volume, the agent must not interrupt itself. Repeat with AirPods (Bluetooth hands-free), wired headphones and a car or Bluetooth speaker.
3. **Route changes and interruptions.** Connect and disconnect AirPods mid-call. Then an incoming phone call, Siri, and an alarm during a call.
4. **Lock and switch.** Lock the screen and switch apps during a call. The expected result is that the call ends and the allowance reconciles.
5. **Poor network.** Network Link Conditioner on the device: high latency, then 100% loss for 10 seconds.
6. **Ten-minute call.** Record mobile data used (Settings) and battery drain.
7. **Accessibility.** VoiceOver with headphones; the largest accessibility text size; Reduce Motion.
8. **Production.** One production call after deployment with an operator account. It counts against the production budget.
9. **Provider settings.** Before store submission and before finalising consent copy, confirm in the provider dashboard:
   - that audio recording is off and transcripts are kept for one day;
   - the two audio formats.

   This repository documents these settings but has not verified them live (`docs/VOICE-ASSISTANT.md:20`).

## 6. Store and privacy notes

Checked on 3 October 2026 against the App Review Guidelines (page marked "Last Updated: June 8, 2026"), Apple's account deletion guidance and the App Privacy details page. URLs are listed under sources.

### App Privacy label for voice

Apple counts data as collected when it is kept "for a period longer than what is necessary to service the transmitted request in real time".

| Data type | Declare | Linked to the person | Tracking | Purpose | Why |
| --- | --- | --- | --- | --- | --- |
| Audio Data | Yes, provisionally | Yes | No | App Functionality | The voice is streamed through Opax to ElevenLabs. The repository documents provider audio recording as off, and Opax keeps none (`docs/VOICE-ASSISTANT.md:20`, `portal/public/community.js:196`). Under Apple's definition, audio processed only in real time may not count as collected. Declaring it is the safe reading for a third-party AI. Confirm the live provider setting before submission |
| Other User Content | Yes | Yes | No | App Functionality | The repository documents provider transcripts as kept for one day (`docs/VOICE-ASSISTANT.md:20`); confirm live before submission |
| Email Address | Yes | Yes | No | App Functionality | Sign-in (option A) |
| User ID | Yes | Yes | No | App Functionality | Member ID on `voice_sessions` rows (`portal/migrations/0003_voice.sql:4-15`) |
| Usage data (voice minutes and times) | Align with the app-wide label | Yes | No | App Functionality | Kept for the lifetime allowance (`docs/VOICE-ASSISTANT.md:40`) |

The privacy manifest's matching entries are `NSPrivacyCollectedDataTypeAudioData` and `NSPrivacyCollectedDataTypeOtherUserContent`. No microphone-specific required-reason API exists. Transcripts are not stored on the device after the call and are never sent to analytics, matching the web (`portal/voice/README.md:21-24`).

### Microphone purpose string (draft)

> Opax uses the microphone only during a voice conversation you start. Your speech is sent to ElevenLabs, our voice provider, to understand and answer you. Opax does not keep recordings.

`NSMicrophoneUsageDescription` is required; without it the app exits when it accesses the microphone. On iOS 17 and later, request permission with `AVAudioApplication.requestRecordPermission()`, before reserving time.

### Consent for the third-party AI

Guideline 5.1.2(i), amended 13 November 2025, says: "You must clearly disclose where personal data will be shared with third parties, including with third-party AI, and obtain explicit permission before doing so."

Before the first call, show a one-time consent screen that states:
- what is sent: voice audio and the words of the conversation;
- who receives it: ElevenLabs;
- how long it is kept: no recordings, transcripts deleted within one day;
- a link to the privacy page.

The buttons are "Agree and start" and "Not now". Consent can be withdrawn in the app's settings, as 5.1.1(ii) requires. If guideline 4.7 applies, 4.7.3's "in each instance" may require this consent before every call (section 6, below).

### Guidelines that apply

| Guideline | What it means for voice |
| --- | --- |
| 5.1.1(v) | "If your app supports account creation, you must also offer account deletion within the app." Apple's FAQ says accounts created automatically count, and that deletion includes "user-generated content that's shared with others". A web link may finish the deletion; deactivation or hiding alone is not enough. Scope is in section 3 |
| 5.1.1(v), first sentence | "If your app doesn't include significant account-based features, let people use it without a login." Only voice asks for sign-in |
| 5.1.1(i) to (iv) | The privacy policy must name ElevenLabs and its retention. Purpose strings must be complete. Ask for the microphone only for voice, never to unlock anything else |
| 5.1.2(i) | Explicit permission before sharing with a third-party AI (above) |
| 2.5.14 | A clear indication while recording: the system microphone indicator plus a visible "Listening" state |
| 2.5.4 | Background services "only for their intended purposes: VoIP, audio playback, location, task completion, local notifications, etc." A background microphone is not banned outright, but it needs a purpose that fits. Foreground-only calls in v1 are a product choice (section 4) |
| 4.8 | Sign in with Apple is not required when the app uses only the company's own account system |
| 4.2, 5.1.1(vii) | Only relevant to option C: a Safari view must be visible, and the app must be more than a website |
| 4.7 | Covers "software that is not embedded in the binary", naming chatbots. The guideline gives no first-party exemption, and whether App Review applies it to a first-party assistant served by Opax's own Worker is not settled. If it applies, all of 4.7.1 to 4.7.5 apply (below), not just a report button |
| Age rating | The questionnaire has no AI or chatbot question. "Unrestricted Web Access" raises the rating to 16+, so keep any web view on opax.com.au |

### If guideline 4.7 applies

Settle the classification before shipping, for example by asking App Review through the developer contact channel. If voice is treated as 4.7 software, each of these is needed, not only a way to report:

| Rule | What it would mean for voice |
| --- | --- |
| 4.7 (general) | Opax is "responsible for all such software offered in your app", including compliance with every other guideline and applicable law |
| 4.7.1 | Follow the privacy guidelines (5.1). Include "a method for filtering objectionable material, a mechanism to report content and timely responses to concerns, and the ability to block abusive users". For voice that means content filtering of agent answers, a report-this-answer path with a monitored response process, and a defined meaning of "block" for a one-to-one assistant. Also follow 3.1 for any paid digital goods (none planned) |
| 4.7.2 | Do not "extend or expose native platform APIs or technologies to the software without prior permission from Apple". The relay protocol exposes no client tools today (section 1); keep it that way |
| 4.7.3 | No sharing of "data or privacy permissions to any individual software … without explicit user consent in each instance". The per-call microphone use and the consent screen (above) would need to meet "each instance", which may mean consent before every call, not once |
| 4.7.4 | "An index of software and metadata available in your app", with "universal links that lead to all of the software offered". For a single assistant, that is one index entry and a universal link to the voice screen, which needs the association file deferred in Worker change 10 |
| 4.7.5 | "A way for users to identify software that exceeds the app's age rating, and use an age restriction mechanism based on verified or declared age". The assistant's rating must fit the app's rating, or access needs an age gate |

## 7. Open questions for Jake

1. **Access.** Decided on 3 October 2026: option A. Voice needs sign-in; every other screen is public and signed out.
2. **Deletion.** When a member deletes their account, authored content and personal data are deleted by default (section 3).
   - Should other members' replies in a deleted member's discussion stay, under a stub with no personal data?
   - Is any data kept for a legal reason that must be disclosed?
   - Should a returning email get a fresh 600 seconds, or should a keyed hash of the email be kept, which is retained personal data that must be disclosed?

   Monthly budget and open-call accounting must survive deletion either way.
3. **Budget.** Should the app share the production 40,000-second monthly budget and the two call slots with the web, or get its own budget, key and ceiling?
4. **Provider settings.** These live in the ElevenLabs dashboard, not this repository, and set the data cost, the codecs the app must handle, the sources UI and the privacy label:
   - the production agent's `user_input_audio_format` and `agent_output_audio_format`;
   - whether it emits `agent_tool_response_full_payload` and audio `alignment`;
   - whether audio recording is still off and transcripts are still kept for one day.
5. **Background.** Is ending the call when the app goes to the background acceptable, as the web does?
6. **Consent.** Should the explicit third-party AI consent screen (5.1.2(i)) also be added to the web panel, or stay app-only?
7. **Guideline 4.7.** How should the classification be settled before shipping, for example by asking App Review? If 4.7 applies, are the obligations in section 6 acceptable for v1: filtering, reporting with timely responses, blocking, per-instance consent, an index with a universal link, and age restriction?
8. **Usage split.** May sessions and `voice_sessions` gain a `client` column, so app and web minutes are reported separately?
9. **First real call.** Who makes the first real-device call on staging, and with which staging account? It needs either a sign-in email or a seeded session like the smoke test's (`portal/test/voice-staging-smoke.mjs:19-35`).
10. **Session design.** The cookie contract (recommended) or `X-Opax-Session`? This is decided in the synthesis with the API lane.

## Sources checked

All sources were read on 3 October 2026.

**Repository** (commit `8f1305e3`):
- `portal/src/voice.ts`, `voice-tools.ts`, `community-core.ts`, `community-auth.ts`, `community-mcp.ts`, `index.ts`, `network-block.ts`, `canonical-origin.ts`;
- `portal/voice/`;
- `portal/public/community.js`, `app.js`, `_headers`;
- `portal/migrations/0003_voice.sql`, `0004_voice_access.sql`;
- `portal/test/voice.test.mjs`, `voice-staging-smoke.mjs`;
- `portal/wrangler.jsonc`, `portal/package.json`;
- `docs/VOICE-ASSISTANT.md`.

**SDK source:**
- `@elevenlabs/client` 1.25.0, the version pinned in `portal/package.json:35`, read from a local install.
- `@elevenlabs/react-native` 1.2.28, from its npm tarball.
- `elevenlabs/elevenlabs-swift-sdk` v3.4.0, from GitHub.

**Context7:**
- `/websites/elevenlabs_io`:
  - [React Native library](https://elevenlabs.io/docs/eleven-agents/libraries/react-native)
  - [changelog, 1 April 2026](https://elevenlabs.io/docs/changelog/2026/4/1)
  - [WebSocket API](https://elevenlabs.io/docs/eleven-agents/api-reference/eleven-agents/websocket)
  - [client events](https://elevenlabs.io/docs/eleven-agents/customization/events/client-events)
  - [signed URL](https://elevenlabs.io/docs/api-reference/conversations/get-signed-url)
  - [agent authentication](https://elevenlabs.io/docs/eleven-agents/customization/authentication)
  - [WebRTC token](https://elevenlabs.io/docs/api-reference/conversations/get-webrtc-token)
- `/elevenlabs/elevenlabs-swift-sdk`: transports, signed WebSocket URL, token provider.
- `/websites/expo_dev`, `/websites/expo_dev_versions`, `/websites/expo_dev_versions_sdk`:
  - [SDK 56 to 57 upgrade](https://docs.expo.dev/bare/upgrade)
  - [`expo-audio`](https://docs.expo.dev/versions/latest/sdk/audio), including `AudioStream`
  - [Expo Modules API](https://docs.expo.dev/modules/module-api)
- `/react/react-native-website`: [networking](https://reactnative.dev/docs/network) and the React Native 0.86 release post (`website/blog/2026-06-11-react-native-0.86.mdx`).
- Context7 had little Apple coverage, so the Apple pages below were read directly.

**Apple, App Store:**
- [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/), marked "Last Updated: June 8, 2026"
- [Offering account deletion in your app](https://developer.apple.com/support/offering-account-deletion-in-your-app/)
- [Guideline update of 13 November 2025](https://developer.apple.com/news/?id=ey6d8onl)
- [App privacy details](https://developer.apple.com/app-store/app-privacy-details/)
- [Age ratings values and definitions](https://developer.apple.com/help/app-store-connect/reference/app-information/age-ratings-values-and-definitions/)

**Apple, audio:**
- [`NSMicrophoneUsageDescription`](https://developer.apple.com/documentation/bundleresources/information-property-list/nsmicrophoneusagedescription)
- [`AVAudioApplication.requestRecordPermission`](https://developer.apple.com/documentation/avfaudio/avaudioapplication/requestrecordpermission(completionhandler:))
- [`.voiceChat`](https://developer.apple.com/documentation/avfaudio/avaudiosession/mode-swift.struct/voicechat)
- [`.playAndRecord`](https://developer.apple.com/documentation/avfaudio/avaudiosession/category-swift.struct/playandrecord)
- [`.allowBluetooth`](https://developer.apple.com/documentation/avfaudio/avaudiosession/categoryoptions-swift.struct/allowbluetooth)
- [Handling audio interruptions](https://developer.apple.com/documentation/avfaudio/handling-audio-interruptions)
- [`AVAudioConverter.convert(to:error:withInputFrom:)`](https://developer.apple.com/documentation/avfaudio/avaudioconverter/convert(to:error:withinputfrom:))
- WWDC sessions [2019/510](https://developer.apple.com/videos/play/wwdc2019/510/) and [2023/10235](https://developer.apple.com/videos/play/wwdc2023/10235/)
- [Configuring background execution modes](https://developer.apple.com/documentation/xcode/configuring-background-execution-modes)
- [TN2277](https://developer.apple.com/library/archive/technotes/tn2277/)
- [Camera and microphone indicators](https://support.apple.com/en-us/108331)

**Apple, web views, attestation and networking:**
- [`SFSafariViewController`](https://developer.apple.com/documentation/safariservices/sfsafariviewcontroller)
- [`ASWebAuthenticationSession`](https://developer.apple.com/documentation/authenticationservices/aswebauthenticationsession)
- [WWDC 2021/10032](https://developer.apple.com/videos/play/wwdc2021/10032/)
- [WebKit bug 183201](https://bugs.webkit.org/show_bug.cgi?id=183201)
- [Establishing your app's integrity](https://developer.apple.com/documentation/devicecheck/establishing-your-app-s-integrity)
- [Assessing fraud risk](https://developer.apple.com/documentation/devicecheck/assessing-fraud-risk)
- [Accessing and modifying per-device data](https://developer.apple.com/documentation/devicecheck/accessing-and-modifying-per-device-data)
- [WWDC 2021/10244](https://developer.apple.com/videos/play/wwdc2021/10244/)
- [App links components](https://developer.apple.com/documentation/bundleresources/applinks/details-swift.dictionary/components-swift.dictionary)
- [`URLSessionWebSocketTask`](https://developer.apple.com/documentation/foundation/urlsessionwebsockettask)
- [`URLSession.webSocketTask(with:)` for a URL request](https://developer.apple.com/documentation/foundation/urlsession/websockettask(with:)-mtks)
- [`NSURLRequest` reserved headers](https://developer.apple.com/documentation/foundation/nsurlrequest)
- [`httpShouldSetCookies`](https://developer.apple.com/documentation/foundation/urlsessionconfiguration/httpshouldsetcookies)
- [`httpCookieAcceptPolicy`](https://developer.apple.com/documentation/foundation/urlsessionconfiguration/httpcookieacceptpolicy)
- [`httpCookieStorage`](https://developer.apple.com/documentation/foundation/urlsessionconfiguration/httpcookiestorage)
- [`HTTPCookieStorage`](https://developer.apple.com/documentation/foundation/httpcookiestorage)
- [`HTTPCookie`](https://developer.apple.com/documentation/foundation/httpcookie)
- [`AVAudioEngineConfigurationChangeNotification`](https://developer.apple.com/documentation/avfaudio/avaudioengineconfigurationchangenotification)

**Independent review, 3 October 2026:**
- 64 source spot checks;
- a hardware-free evaluation of the unmodified SDK capture worklet;
- the bandwidth and budget arithmetic.

These are kept in the lane's git-ignored evidence folder. The API lane's comparison is `docs/IOS-API-CONTRACT.md` on `ios/discovery-api` at `6baf3ec4`.
