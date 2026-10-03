# Opax iOS voice assistant

Discovery notes for the voice part of the Opax iOS app, written 3 October 2026 from source code, SDK source and published documentation. They feed the public design doc `docs/IOS-APP.md`.

Version 1 of the app is read-only public data plus the voice assistant ("Talk to Opax"). This document covers voice only. Product and UX are in `docs/IOS-UX.md`; data, API and architecture are in `docs/IOS-API-CONTRACT.md`.

No voice session was started while writing this. Nothing called ElevenLabs or any opax.com.au voice route (production, staging or local), and no audio was played. File and line references are to commit `8f1305e3` unless they name an SDK package.

## Summary

- **Access:** voice needs a signed-in community member, as it does on the web (option A). The app gets its own session token from a one-time code sent by email and sends it in an `X-Opax-Session` header. It has in-app account deletion. Apple requires deletion because signing in creates an account.
- **Transport:** keep the existing same-origin WebSocket relay. Neither official ElevenLabs mobile SDK can use it: both run voice over LiveKit WebRTC, and the React Native SDK throws on a signed URL. The relay needs no change.
- **Audio:** one Swift voice core. A single `AVAudioEngine` with voice processing (echo cancellation) handles capture and playback, with 16 kHz PCM16 base64 chunks in both directions, and a `URLSessionWebSocketTask` connects to the relay. React Native wraps the core in a local Expo module; SwiftUI calls it directly. Voice favours SwiftUI only slightly.
- **Worker changes:** header-token sessions, code sign-in, account deletion, and a budget-closed signal. Each **needs Jake's OK to deploy**. The relay and tool routes are unchanged.
- **Testing:** a fake relay in the local fixture Worker speaks the same protocol, sends silent audio and answers tools from fixture data. The app has a synthetic microphone for tests. Real calls are physical-device checks for Jake only.

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

1. **Status.** `GET /api/voice/status` with the session cookie (`portal/voice/client.js:204`). This route has no Origin check (`portal/src/voice.ts:244-248`). The response is `{enabled, signed_in, unlimited, total_seconds, remaining_seconds, active_session}` (`portal/src/voice.ts:64-74`). A signed-out request gets `signed_in:false` and a nominal 600 seconds (`portal/src/voice.ts:65`).
2. **Start gesture.** The browser primes a 16 kHz `AudioContext` on the button press, before any await, because iOS requires it (`portal/voice/client.js:306-315`). It then loads the SDK chunk (`portal/voice/client.js:327`).
3. **Reservation.** `POST /api/voice/start` with body `{}` and `Content-Type: application/json` (`portal/voice/client.js:330`). The Worker checks, in order:
   - community enabled (`portal/src/voice.ts:243`);
   - Origin equals `COMMUNITY_ORIGIN` (`portal/src/voice.ts:249`, `portal/src/community-core.ts:15`);
   - a member session (`portal/src/voice.ts:250`);
   - voice configured (`portal/src/voice.ts:252`);
   - a JSON body of at most 2,000 bytes (`portal/src/voice.ts:253`, `portal/src/community-core.ts:6-13`);
   - rate limits of 6 starts a minute per member and 20 a minute per IP (`portal/src/voice.ts:254-255`).

   After expiring stale rows, a single SQL write checks the member's balance, the monthly budget and the two call slots, and inserts a `reserved` row (`portal/src/voice.ts:256-257`, `portal/src/voice.ts:29-48`). The 201 response is `{session_id, transport:"websocket", signed_url, remaining_seconds, expires_at}`. `signed_url` is `wss://<COMMUNITY_ORIGIN>/api/voice/connect?session_id=<uuid>` (`portal/src/voice.ts:264-266`). `expires_at` is the 60-second window to connect, not the end of the call (`portal/src/voice.ts:5`, `portal/voice/client.js:345-347`).
4. **Client validation.** The web client accepts `signed_url` only when it is a `wss:` URL on its own host with path `/api/voice/connect` (`portal/voice/client.js:341-343`).
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
10. **Tools.** The provider calls the Worker's tool webhooks at `POST /api/voice/tools/<name>`. Each call carries the provider secret header `x-opax-voice-token` and a `session_id` (`portal/src/voice.ts:233-242`, `portal/src/voice.ts:76-82`). The provider fills `session_id` from the `opax_session_id` variable; that mapping is tool configuration in the provider dashboard, not in this repository. Tools run only for a live `active` session of an enabled member, at 30 calls a minute per session (`portal/src/voice.ts:238-240`). Results are bounded and carry `{source_notice, source_url, sources, data}` (`portal/src/voice-tools.ts:147-149`). The browser never calls tools; client tool results are dropped (`portal/src/voice.ts:105`).
11. **End.** End, Close, Escape, navigation, `pagehide`, offline or a hidden tab all stop the call (`portal/voice/client.js:395-411`). The SDK closes with 1000 "User ended conversation" (`dist/utils/WebSocketConnection.js:149-152`). The client then posts `POST /api/voice/finish {session_id}` with `keepalive` (`portal/voice/client.js:219-232`).
12. **Reconciliation.** When either socket closes, the relay closes the other. It holds the Worker invocation for up to 20 seconds to receive the provider's close acknowledgement (`portal/src/voice.ts:118-128`). Only a clean provider close that is not 1006 records the elapsed seconds, capped at the reservation (`portal/src/voice.ts:159-165`, `portal/src/voice.ts:55-58`). Otherwise the full reservation stays charged and the row expires later as `expired` (`portal/src/voice.ts:20-26`, `docs/VOICE-ASSISTANT.md:28`). `finish` can only cancel a reservation that never connected (`portal/src/voice.ts:272-279`).

### Routes

| Route | Auth | Origin check | Body | Success | Refusals |
| --- | --- | --- | --- | --- | --- |
| `GET /api/voice/status` | Cookie optional | None | None | 200 status JSON | 503 if community disabled (`voice.ts:243`) |
| `POST /api/voice/start` | Cookie required | Exact match (`voice.ts:249`) | JSON, at most 2,000 bytes | 201 reservation | 403 origin; 401 signed out; 415, 413; 429 rate limit; 409 call open; 403 allowance used; 429 capacity or budget; 503 not configured (`voice.ts:251-266`) |
| `GET /api/voice/connect?session_id=` | Cookie required | Exact match | WebSocket upgrade | 101 | 426 no upgrade; 400 bad ID; 409 used or expired; 503 provider unavailable, busy or unrecorded (`voice.ts:169-228`) |
| `POST /api/voice/finish` | Cookie required | Exact match | `{session_id}`, at most 1,000 bytes | 200 status JSON | 401, 403, 400 (`voice.ts:272-279`) |
| `POST /api/voice/tools/<name>` | Provider secret | None | JSON, at most 8,000 bytes | 200 tool result | 401, 403, 429, 503 (`voice.ts:233-242`) |

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
| `{"user_audio_chunk":"<base64>"}` | Standard base64 alphabet with padding (`^[A-Za-z0-9+/]*={0,2}$`); base64url is rejected |
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
| Up (microphone) | Mono PCM16 little-endian at `user_input_audio_format`; the SDK default is `pcm_16000`. Base64 inside JSON, one message every 25 ms (400 samples, 800 bytes, 1,068 base64 characters at 16 kHz). Muted input still sends zero-filled chunks | `dist/utils/WebSocketConnection.js:139-141`, `dist/InputController.js:2`, `dist/platform/web/rawAudioProcessor.generated.js:57-61`, `:100-123` |
| Up, browser capture | `getUserMedia` with echo cancellation, noise suppression, automatic gain control, mono and `voiceIsolation` | `dist/platform/web/input.js:6-13`, `:52` |
| Down (agent) | `pcm_<rate>` or `ulaw_<rate>` as named by `agent_output_audio_format`. Base64 in `audio` events, chunk sizes set by the provider | `dist/utils/BaseConnection.js:81-94`, `dist/platform/web/output.js` |

The repository's tests and the web client's priming assume 16 kHz in both directions (`portal/test/voice.test.mjs:245`, `portal/voice/check.mjs:85`, `portal/voice/client.js:309`). ElevenLabs documents other output rates, for example `pcm_44100`. A native client must therefore read both formats from the metadata rather than hard-code them.

Floating-point samples become PCM16 as `sample < 0 ? sample * 32768 : sample * 32767` after clamping to [-1, 1] (`dist/platform/web/rawAudioProcessor.generated.js:108-119`). A native encoder should match this so fixtures compare byte for byte.

### Transcript, evidence and sources

- **Transcript.** User and agent turns appear as text nodes, keyed by role and `event_id`. A correction replaces an earlier turn. The panel keeps at most 80 turns, each cut at 12,000 characters (`portal/voice/client.js:275-297`). The transcript is a `role="log"` polite live region (`portal/voice/client.js:129-135`).
- **Links.** Markdown links in agent text become links only when they pass a same-origin allow-list of published record paths, such as `/doc/`, `/bill/`, `/subject/<kind>/`, `/money/...`, `/reports/` and `/journey/` (`portal/voice/client.js:38-65`).
- **Sources list.** Sources are also collected from tool responses: `sources`, `records`, `full_tool_result` and similar fields, at most 12, under the same allow-list (`portal/voice/client.js:251-274`). On the server, every tool result includes `sources: [{title, url}]` and a notice that source material is untrusted evidence (`portal/src/voice-tools.ts:7`, `:147-149`).
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
| Deadline | relay close 1000 "Your free voice time has finished" | "Your 10 free minutes are complete…" (`:351`) |

Relay close codes are:
- 1000 when the call ends normally or reaches its deadline;
- 1008 for an initiation timeout, more than 150 messages a second, or an invalid message;
- 1011 for provider or connection failures.

The provider's own close code is not forwarded (`portal/src/voice.ts:118-160`).

## 2. What blocks a native client today

1. **No credential a native app can get cleanly.** Voice routes accept only the `__Host-opax_session` cookie (`portal/src/community-core.ts:22-27`). The cookie is issued only to a request carrying the exact web Origin (`portal/src/community-auth.ts:18-26`). The token comes from an email link that opens `/community` in a browser (`portal/src/community-auth.ts:13`). No `apple-app-site-association` file exists: `portal/public` has no `.well-known` directory, and the Worker serves only `/.well-known/atproto-did` (`portal/src/index.ts:5199`). So the link cannot open the app. MCP bearer keys exist (`portal/src/community-mcp.ts:8-11`), but voice routes do not accept them.
2. **Origin checks.** `start`, `connect` and `finish` require `Origin` to equal `COMMUNITY_ORIGIN` exactly (`portal/src/voice.ts:249`). Native HTTP and WebSocket clients send no Origin by default. Both `URLSession` and Node's `ws` can set one, and the staging smoke test does so with a Cookie header (`portal/test/voice-staging-smoke.mjs:41`, `:80`). So the check stops browsers from other sites, not non-browser clients. There are no `Sec-Fetch-*` checks.
3. **The agent's origin restriction does not reach the client.** The provider agent is private and restricted to the Opax origin (`docs/VOICE-ASSISTANT.md:20`). The Worker satisfies that on the upstream connection by sending `Origin: COMMUNITY_ORIGIN` itself (`portal/src/voice.ts:203`). Any relay client inherits it. It would block an app that connected straight to ElevenLabs.
4. **CSP and Permissions-Policy are browser-only.** API responses carry `default-src 'none'` (`portal/src/index.ts:4859`, `:4879`), which a native client ignores. Pages allow `connect-src wss://opax.com.au` and `microphone=(self)` (`portal/src/index.ts:4823`, `:4848`). `X-Frame-Options: DENY` and `frame-ancestors 'none'` block iframes, not a top-level in-app browser (`portal/src/index.ts:4822`, `:4855`).
5. **Browser assumptions in the protocol.**
   - The start body must be `application/json` (`portal/src/community-core.ts:7`).
   - `signed_url` is always `wss:` on `COMMUNITY_ORIGIN`, so a local plain-HTTP Worker hands out an unusable `wss://127.0.0.1` URL (`portal/src/voice.ts:264-265`).
   - The first message must be the initiation event within 10 seconds (`portal/src/voice.ts:100`, `:130`).
   - All capture and playback code is Web Audio: AudioWorklets, `getUserMedia` and a Wasm resampler (`portal/voice/build.mjs:13-25`).
6. **No account deletion.** The community has no self-service account deletion route or page. `portal/src` has no member delete, and the privacy view lists none (`portal/public/community.js:196`). This blocks App Review for any app that signs people in (section 6).
7. **"Budget closed" cannot be told apart from "busy".** When the monthly budget is spent, start returns the same 429 "at capacity" error as when both slots are taken (`portal/src/voice.ts:258-262`). Status does not expose the budget (`portal/src/voice.ts:64-74`).

## 3. Who can use voice in the app

Voice is for signed-in members today; the rest of v1 is public and needs no account. Three options follow, plus one considered and rejected.

### A. Sign in for voice

Voice is the only signed-in feature in the app. The member signs in from the voice screen and can delete their account in the app.

- **What the Worker needs.** A native session that is not a browser cookie:
  - `member()` also accepts an `X-Opax-Session: <43-character token>` header, looked up in `member_sessions` like the cookie;
  - `sameOrigin()` is skipped for requests that carry that header and no Cookie header. CSRF needs ambient credentials. A browser cannot add a custom header to a cross-site request without a CORS preflight, and the Worker grants none;
  - `/mcp` already accepts a header token instead of a cookie and allows a missing Origin (`portal/src/community-mcp.ts:8-11`).
- **Why not `Authorization: Bearer`.** Apple lists `Authorization` as a reserved header that `URLSession` "may ignore … or overwrite", and the same token must also go on the WebSocket handshake.
- **Why not the existing cookie.** Sending the token as the existing cookie would work with `member()` unchanged. But it would also need a forged `Origin` header, which defeats the point of the check (section 2, item 2).
- **Sign-in.** Recommended: a one-time code in the sign-in email for app-initiated requests, typed into the app and exchanged for a session token, with attempt limits.
  - It works when the email is read on another device.
  - It needs no `apple-app-site-association` file.
  - It never steals web sign-in links into the app.

  A universal link on a dedicated path such as `/app/signin` can come later as a convenience. Reusing `/community?view=signin` would send web sign-ins into the app. Apple's association file can match a `#` fragment, but no Apple page says the fragment survives into the URL the app receives, so the existing `#token=` format would need a device test first.
- **Token storage.** The session token goes in the Keychain, never `UserDefaults`. Sessions last 30 days, as on the web.
- **Account deletion.** Apple requires it (section 6). Deleting `voice_sessions` rows resets that email's lifetime allowance if the person signs up again (`docs/VOICE-ASSISTANT.md:40`). A new email address already gets a fresh 600 seconds, so a tombstone would add little protection. The monthly budget and the two slots remain the real limits.
- **Cost.** Unchanged per person. App members share the existing monthly budget, at most 66 full allowances a month.
- **Abuse.** The same as the web today: one allowance per email address, rate limits, two slots and the monthly budget.
- **Privacy.** The app collects an email address and user ID, linked to the person, as the web community already does.
- **App Review.**
  - 5.1.1(v) applies, so the app needs in-app deletion.
  - Gating one feature behind sign-in is consistent with "let people use it without a login" for the rest of the app.
  - Sign in with Apple is not required for a company's own account system (4.8).

### B. Anonymous app allowance

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

### C. Voice opens the web panel in an in-app browser

The app opens `https://opax.com.au/chat` (or a voice deep link) in `SFSafariViewController` or `ASWebAuthenticationSession`, and the existing web client runs unchanged.

- **What works.** The relay, allowance, tools and transcript UI are reused with no Worker change. CSP allows the page as a top-level document.
- **What breaks.**
  - **`SFSafariViewController`** shares no website data with Safari; Apple directs apps that need sharing to `ASWebAuthenticationSession`. The app cannot inject the session cookie. The sign-in email link opens in Safari or Mail, not in this view, so the person cannot easily sign in where they talk. The microphone itself should work: WebKit's tracker records `getUserMedia` support in this view from iOS 13 (WebKit bug 183201), though Apple's own docs do not say so.
  - **`ASWebAuthenticationSession`** shares Safari's cookies by default, so a person signed in on Safari might reach voice. But Apple documents it only for authentication. It shows a system consent prompt and is built to finish on a callback URL, not to host a ten-minute call. Microphone support in it is not documented.
  - **A `WKWebView`** supports `getUserMedia` from iOS 14.3, has a microphone-permission delegate from iOS 15, and can take an injected cookie. But it only helps once the app already has a native session (option A), and the call UI stays a web page.
  - In every variant, the call UI is the web panel, and it ends the call when the page is hidden (`portal/voice/client.js:409`).
- **Cost and abuse.** As on the web.
- **App Review.** 4.2 minimum functionality (low risk while the rest of the app is native). 5.1.1(vii) says a Safari view controller must be visible. Links that leave opax.com.au can affect the "Unrestricted Web Access" age-rating answer.

### Considered and rejected: the provider's WebRTC SDKs

The official SDKs could connect directly to ElevenLabs with a WebRTC conversation token minted by the Worker (`GET /v1/convai/conversation/token`). That would bring Opus audio and WebRTC echo cancellation, with much less data than base64 PCM. But it bypasses the relay that enforces Opax's rules:
- the client could set initiation data and dynamic variables, which the relay discards today (`portal/src/voice.ts:91-107`);
- the server deadline and message filtering would be gone (`portal/src/voice.ts:110-167`);
- reconciliation would depend on provider webhooks or polling instead of a confirmed socket close;
- the tool authorisation that relies on a relay-set `active` state would need redesigning (`portal/src/voice.ts:238`).

It also adds LiveKit WebRTC native dependencies. Revisit it only if data cost becomes the main problem.

### Comparison

| | A. Sign in | B. Anonymous | C. Web panel |
| --- | --- | --- | --- |
| Worker change | Moderate: header-token sessions, code sign-in, deletion | Large: attestation, new principal, new budget | None |
| Native audio work | Yes | Yes | None |
| Cost exposure | Same as web | Unbounded per person; needs its own budget | Same as web |
| Abuse controls | Existing | New and weaker per person | Existing |
| Privacy | Email and user ID | Device attestation | Web data in a view |
| App Review | Needs in-app deletion | Simplest | Sign-in flow does not work in the view |

### Recommendation

Choose **A**. It keeps the allowance tied to a person and reuses every existing control. The relay, tools and provider configuration stay unchanged. The Worker changes are small, testable and useful beyond voice, for example for saved chats in a later app version. B moves cost risk onto everyone's monthly budget and adds attestation code the Worker does not have. C does not work as a product, because the person cannot sign in where they talk.

### Worker changes for option A

Each item **needs Jake's OK to deploy**. None of them changes the relay (`portal/src/voice.ts:91-228`) or the tools.

1. **Header-token sessions.** `member()` accepts `X-Opax-Session: <token>` from `member_sessions` (`portal/src/community-core.ts:22-26`). A migration adds a `client` column so app sessions can be listed and revoked. **Needs Jake's OK to deploy.**
2. **Origin rule.** `sameOrigin()` passes requests authenticated by that header that carry no Cookie header. It keeps the exact Origin check for cookie requests (`portal/src/community-core.ts:15`). **Needs Jake's OK to deploy.**
3. **Code sign-in.**
   - `auth/request` accepts `{email, client:"ios"}` without Origin and emails a one-time code alongside the usual link.
   - Rate limits stay as they are: 15 an hour per IP and 5 an hour per email (`portal/src/community-auth.ts:8-10`). The Origin check never stopped non-browser senders, so these limits are already the real control.
   - A new `auth/consume-code` exchanges `{email, code}` for `{session_token, expires_at}` in the response body. The code has at least six digits, allows at most five attempts and shares the link's 15-minute expiry.
   - **Needs Jake's OK to deploy.**
4. **Native sign-out.** `auth/logout` deletes the header-token session (`portal/src/community-auth.ts:28-33`). **Needs Jake's OK to deploy.**
5. **Account deletion.** A route available to cookie and header-token sessions deletes the member and their rows, after re-confirmation. It should also be linked from the web account page. Decide the handling of public discussions and of `voice_sessions` (section 7). **Needs Jake's OK to deploy.**
6. **Budget signal.** The 429 from start gains `reason: "budget" | "capacity"`, and status gains `budget_open`. Both clients can then say "Voice is closed for this month" (`portal/src/voice.ts:258-262`, `:64-74`). **Needs Jake's OK to deploy.**
7. **Optional usage split.** A `client` column on `voice_sessions` so app and web minutes can be reported apart. **Needs Jake's OK to deploy.**
8. **Privacy page and voice docs.** Mention the app, the microphone and ElevenLabs in the privacy view (`portal/public/community.js:196`) and in `docs/VOICE-ASSISTANT.md`. **Needs Jake's OK to deploy.**
9. **Universal links (later).** An `apple-app-site-association` route for a dedicated app sign-in path, only if links are wanted later. **Needs Jake's OK to deploy.**

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
     - headers are `Sec-WebSocket-Protocol: convai` and `X-Opax-Session`.
   - Set `maximumMessageSize` explicitly, for example to 2 MiB. The relay passes provider messages of up to 1,000,000 characters (`portal/src/voice.ts:146`), and Apple does not document the default (reported as 1 MiB).
   - On open, send `{"type":"conversation_initiation_client_data"}` at once; the relay replaces its content.
   - Answer every `ping` with `pong`.
   - Decode events on a serial queue, never on the audio thread.
2. **Audio engine.**
   - One `AVAudioEngine` for capture and playback. Session category `.playAndRecord`, mode `.voiceChat`, options `.defaultToSpeaker` and `.allowBluetoothHFP` (renamed from `.allowBluetooth` in the iOS 26 SDK).
   - Call `inputNode.setVoiceProcessingEnabled(true)` while the engine is stopped. Apple's WWDC19 guidance is that voice processing switches both I/O nodes and works only when rendering to a device.
   - The `.voiceChat` mode alone does not cancel echo. Without voice processing, "the system doesn't apply voice-specific processing, like echo cancellation and automatic gain correction".
   - Capture and playback must share this engine, or the canceller has no reference for the agent's voice and the agent hears itself on the loudspeaker.
3. **Capture.**
   - Tap the input node in its hardware format.
   - Convert with `AVAudioConverter.convert(to:error:withInputFrom:)` to mono Int16 at `user_input_audio_format`.
   - Cut 25 ms chunks (400 samples at 16 kHz), base64-encode them with the standard alphabet and send `{"user_audio_chunk": …}`.
   - While muted, send zero-filled chunks as the SDK does (`dist/platform/web/rawAudioProcessor.generated.js:100-102`), so the provider's turn-taking timing matches the web. Also set `isVoiceProcessingInputMuted`.
4. **Playback.**
   - Decode `audio` events at `agent_output_audio_format`, PCM16 or µ-law, into float buffers. Schedule them on an `AVAudioPlayerNode` feeding the main mixer.
   - Track queued buffers for the speaking/listening mode.
   - On `interruption`, stop the player node to flush its queue, restart it, and ignore audio events whose `event_id` is below the interruption's (`dist/VoiceConversation.js:68-87`).
5. **Call controller.** A state machine:
   - idle, checking status, asking for consent, asking for the microphone, reserving, connecting, live (listening, speaking or muted), ending, ended with a reason;
   - the local countdown from `remaining_seconds` is display only, and the server deadline is authoritative;
   - a 35-second connect timeout, as on the web;
   - End sends close 1000, then `finish`, then polls status.
6. **Transcript and sources.**
   - Ports of the web allow-list and Markdown link parsing (`portal/voice/client.js:38-65`), with the same caps.
   - Allowed paths open the app's own record screens.

### Expo SDK 57 and React Native 0.86

Expo SDK 57 pairs with React Native 0.86.0.

- **Official SDK: does not fit.** It is WebRTC only and refuses signed URLs (above).
- **`expo-audio`: capture only.** Its `useAudioStream` / `AudioStream` captures real-time PCM (float32 or int16, a requested sample rate, default 48 kHz) through an `onBuffer` callback. But it documents no echo cancellation or voice-processing option, and no streaming PCM playback. Pairing it with a separate playback library leaves the canceller without the agent's voice as a reference. Not recommended.
- **Recommended: a local Expo module** (`npx create-expo-module --local`) that wraps the Swift voice core.
  - The JavaScript surface is small: `status()`, `start()`, `setMuted()`, `end()`, plus events for state, mode, transcript, sources, countdown and the end reason.
  - Audio and the socket stay native. Forty audio messages a second never cross into JavaScript, and a busy JavaScript thread cannot starve audio.
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
| Route change (AirPods on or off, wired headset) | `AVAudioEngineConfigurationChange` stops the engine. Rebuild the tap and converter for the new input format (Bluetooth hands-free often runs at 16 or 24 kHz) and restart while keeping the socket. If the restart fails, end the call. Unlike media playback, keep talking on the new route |
| Media services reset | End the call; rebuild the engine and session on the next Start |
| App goes to the background | End the call when the scene enters the background, matching the web's hidden-tab rule (`portal/voice/client.js:409`). Do not end it on a brief inactive state such as Control Centre. Keep the screen awake while connected (`isIdleTimerDisabled`), so auto-lock does not end calls |

**Background mode.** Do not add `UIBackgroundModes` `audio` in v1:
- Apple describes the mode as for apps that play "audible content in the background", and App Review 2.5.4 limits background services to their intended purpose;
- a suspended app's sockets fail (TN2277);
- the web ends calls when the tab is hidden;
- an open microphone after the person leaves the app is a privacy surprise.

### Microphone permission

- `NSMicrophoneUsageDescription` (draft in section 6).
- Request with `AVAudioApplication.requestRecordPermission()` on iOS 17 and later. `AVAudioSession`'s version is deprecated from iOS 17.
- Ask on the first Start, after the consent screen and **before** `POST /api/voice/start`, so a refusal never reserves time. The web asks after reserving, inside the SDK.
- Never ask at launch or when the voice screen opens; the web does not either (`docs/VOICE-ASSISTANT.md:3`).
- If permission is denied, explain and link to Settings.

### Energy and data for a ten-minute call

These figures assume 16 kHz PCM16 in both directions. MB means 10^6 bytes.

| Stream | Rate | Ten minutes |
| --- | --- | --- |
| Up: 32,000 B/s of PCM, base64 (×4/3), JSON wrapper and WebSocket framing, 40 messages a second | about 43.9 KB/s (351 kbit/s), continuous, including while muted | about 26.3 MB |
| Down: base64 PCM while the agent speaks | about 42.7 KB/s while speaking | about 12.8 MB if it speaks half the time; 25.6 MB at most |
| Total | | **about 39 MB typical, 26 to 52 MB** |

If the production agent's output format is `pcm_44100` rather than `pcm_16000`, downstream becomes about 117.6 KB/s while speaking, or 35 to 71 MB. That is why the output format is an open question.

The upload alone is roughly ten times the bitrate of a typical Opus VoIP call at about 32 kbit/s. Base64 PCM over JSON is the relay protocol's cost.

**Energy drivers:**
- the radio stays fully active for the whole call, because chunks leave every 25 ms;
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

Automated tests never open a real microphone, never play audible sound and never reach ElevenLabs or an opax.com.au voice route.

### Fake relay in the local fixture Worker

The fake relay lives in the local fixture Worker defined by the API lane (`wrangler dev` on a port from 8900 to 8999), never in production routes.

**Routes.** It serves `status`, `start`, `connect` and `finish` with the same paths, JSON shapes, status codes and error strings as section 1.

**URLs and launch arguments.**
- Its `start` returns `ws://127.0.0.1:<port>/api/voice/connect?session_id=…`. The real route would emit `wss:` (section 2, item 5).
- Debug builds accept `ws:` for loopback only, with App Transport Security's local-networking exception. Release builds accept only `wss:` on the configured origin, and validate host and path as the web does (`portal/voice/client.js:341-343`).
- Fixture session tokens name the scenario (for example `fixture-voice-exhausted`). The fixture base URL and token arrive as launch arguments in debug builds, so Maestro selects a scenario without app test hooks.

**Protocol.** It follows the provider stub already in `portal/test/voice.test.mjs:237-250`:
- send `conversation_initiation_metadata` (`conv_fixture`, `pcm_16000` both ways) as soon as the socket opens;
- import `voiceClientEvent` from `portal/src/voice.ts:91-107` to enforce the real client-message rules;
- apply the same 10-second initiation timer and 150-messages-a-second limit.

It logs each accepted message type, audio chunk size and arrival time to a fixture-only `GET /__fixture/voice/log` for assertions: chunk cadence, base64 alphabet, initiation order and `pong` latency.

**Canned conversation**, in order:
1. A greeting `agent_response` and `audio` events containing zero-valued PCM, so nothing is audible even on an unmuted device, with `alignment` data.
2. A `ping` every 5 seconds.
3. A canned `user_transcript`.
4. `agent_tool_response` and `agent_tool_response_full_payload`. The `full_tool_result` comes from `runVoiceTool` (`portal/src/voice-tools.ts:71-150`) running against the fixture's own data, so the sources list shows real fixture records.
5. An `agent_response` with Markdown links: some to published record paths, and one link the allow-list must reject.
6. An `interruption` followed by stale lower-numbered `audio` events.
7. An `agent_response_correction`.

### Scenarios

| Scenario | Fixture behaviour | App must |
| --- | --- | --- |
| Happy path | Script above, clean close 1000 on End | Show transcript, sources, mute state, end; call `finish`; refresh status |
| Signed out | status `signed_in:false`; start 401 | Offer sign-in; never request the microphone |
| Voice disabled | status `enabled:false` | Explain; point to Ask |
| Permission not yet asked | Simulator microphone privacy reset | Ask before reserving time |
| Permission denied | Microphone privacy revoked | Explain, link to Settings, never call `start` |
| Allowance used | status `remaining_seconds:0`; start 403 | "10 free minutes used" state |
| Budget closed | start 429 `reason:"budget"` (after Worker change 6) | "Closed for this month" state |
| At capacity | start 429 `reason:"capacity"` | "Busy, try again shortly" |
| Call open elsewhere | status `active_session`; start 409 | Explain; poll status before enabling Start |
| Connect refused | Upgrade 409 (replay) or 503 (busy) | Error state; time not used for 503 |
| Network drop | Fixture drops TCP without a close frame mid-call | End the call, explain, poll status until `active_session` is null |
| Provider close | Relay-style close 1000 "Voice conversation ended" or 1011 "Voice provider connection interrupted" | Matching end state |
| Deadline | start returns `remaining_seconds: 5`; close 1000 "Your free voice time has finished" | Countdown reaches zero; allowance-used state |
| Agent ends call | `agent_tool_response` for `end_call` | End cleanly |
| Provider error | `error` with `max_duration_exceeded` | End cleanly |
| Reconnect | After a drop, the first `start` returns 409, then 201 | Start a new call. Never reopen an old `signed_url`, which is single-use (`portal/src/voice.ts:172-173`) |

A dropped call cannot be resumed. The reservation and the provider signature are both single-use. "Reconnect" therefore always means a new call, once status shows no open session.

### Unit tests with synthetic buffers

- **Encoder.**
  - Float to PCM16 with the SDK's scaling and clamping, little-endian.
  - Standard base64 with padding.
  - 25 ms chunks: 400 samples, 800 bytes at 16 kHz, with partial chunks carried over.
- **Resampler.** 48, 44.1 and 24 kHz sine tones to 16 kHz:
  - output length within one sample per chunk;
  - tone frequency preserved (Goertzel);
  - no clipping.
- **Decoder.**
  - PCM16 and µ-law 8 kHz to float.
  - Odd byte lengths rejected.
  - The format parser accepts the names the SDK accepts (`dist/utils/BaseConnection.js:81-94`).
- **Playback queue.**
  - Buffers play in order.
  - An interruption flushes the queue.
  - Audio with an `event_id` below the last interruption is dropped.
  - Mode is speaking while audio is queued and listening once it drains.
- **Protocol.**
  - Initiation goes first.
  - `pong` echoes the `event_id`.
  - Unknown event types are tolerated.
  - Close codes and HTTP statuses map to UI states.
- **Sources.**
  - A port of the web allow-list (`portal/voice/client.js:39-48`) with the same accepted and rejected cases.
  - Markdown link parsing.
  - Caps of 80 turns, 12 sources and 12,000 characters.
- **State machine.**
  - Every state from idle to ended, including cancellation at each step.
  - A reservation made before cancellation is released through `finish`.
- **Engine graph.** The playback graph and converter run in `AVAudioEngine` manual rendering mode, with no audio hardware. Voice processing is unavailable in manual rendering mode, so echo cancellation is a device check only.

**Synthetic microphone.** The voice core has a debug-only input source that generates PCM instead of opening the microphone, selected by launch argument. The simulator otherwise captures the Mac's real microphone, which is both a privacy problem and a source of flaky tests. Playback in tests is triple-guarded:
- the fixture sends silence;
- a debug flag sets output gain to zero;
- the Mac stays muted.

### Maestro journeys

There is one flow for each scenario in the table, asserting on accessibility identifiers and visible text, never on audio. Flows:
- set microphone permission with Maestro's `launchApp` permissions or with `xcrun simctl privacy <udid> grant|revoke|reset microphone <bundle-id>`;
- select the scenario with launch arguments;
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

## 6. Store and privacy notes

Checked on 3 October 2026 against the App Review Guidelines (page marked "Last Updated: June 8, 2026"), Apple's account deletion guidance and the App Privacy details page. URLs are listed under sources.

### App Privacy label for voice

Apple counts data as collected when it is kept "for a period longer than what is necessary to service the transmitted request in real time".

| Data type | Declare | Linked to the person | Tracking | Purpose | Why |
| --- | --- | --- | --- | --- | --- |
| Audio Data | Yes | Yes | No | App Functionality | The voice is streamed through Opax to ElevenLabs. Provider audio recording is off and Opax keeps none (`docs/VOICE-ASSISTANT.md:20`, `portal/public/community.js:196`). Declaring it is the safe reading for a third-party AI |
| Other User Content | Yes | Yes | No | App Functionality | The provider keeps transcripts for one day (`docs/VOICE-ASSISTANT.md:20`) |
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

The buttons are "Agree and start" and "Not now". Consent can be withdrawn in the app's settings, as 5.1.1(ii) requires.

### Guidelines that apply

| Guideline | What it means for voice |
| --- | --- |
| 5.1.1(v) | "If your app supports account creation, you must also offer account deletion within the app." Apple's FAQ says accounts created automatically on first sign-in count. A web link may finish the deletion; deactivation alone is not enough |
| 5.1.1(v), first sentence | "If your app doesn't include significant account-based features, let people use it without a login." Only voice asks for sign-in |
| 5.1.1(i) to (iv) | The privacy policy must name ElevenLabs and its retention. Purpose strings must be complete. Ask for the microphone only for voice, never to unlock anything else |
| 5.1.2(i) | Explicit permission before sharing with a third-party AI (above) |
| 2.5.14 | A clear indication while recording: the system microphone indicator plus a visible "Listening" state |
| 2.5.4 | Background services only for their intended purpose. Background audio is for "audible content", so a live microphone in the background is a review risk (section 4) |
| 4.8 | Sign in with Apple is not required when the app uses only the company's own account system |
| 4.2, 5.1.1(vii) | Only relevant to option C: a Safari view must be visible, and the app must be more than a website |
| 4.7 | Covers chatbots that are "not embedded in the binary", with filtering and reporting duties (4.7.1). It is unclear whether a first-party server assistant counts (section 7) |
| Age rating | The questionnaire has no AI or chatbot question. "Unrestricted Web Access" raises the rating to 16+, so keep any web view on opax.com.au |

## 7. Open questions for Jake

1. **Access.** Approve option A (sign in for voice, with an emailed one-time code) over B (anonymous) and C (web panel)?
2. **Deletion.** When a member deletes their account:
   - should their public discussions and replies be deleted, or kept and anonymised?
   - should their voice usage be deleted, which resets their 600 seconds if they sign up again with the same email?
3. **Budget.** Should the app share the production 40,000-second monthly budget and the two call slots with the web, or get its own budget, key and ceiling?
4. **Provider settings.** What are the production agent's `user_input_audio_format` and `agent_output_audio_format`? Does it emit `agent_tool_response_full_payload` and audio `alignment`? These live in the ElevenLabs dashboard, not this repository, and set the data cost and the sources UI.
5. **Background.** Is ending the call when the app goes to the background acceptable, as the web does?
6. **Consent.** Should the explicit third-party AI consent screen (5.1.2(i)) also be added to the web panel, or stay app-only?
7. **Guideline 4.7.** Should voice answers get a "report a problem" path, in case App Review treats the assistant as a chatbot?
8. **Usage split.** May sessions and `voice_sessions` gain a `client` column, so app and web minutes are reported separately?
9. **First real call.** Who makes the first real-device call on staging, and with which staging account? It needs either a sign-in email or a seeded session like the smoke test's (`portal/test/voice-staging-smoke.mjs:19-35`).

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
- [`NSURLRequest` reserved headers](https://developer.apple.com/documentation/foundation/nsurlrequest)
