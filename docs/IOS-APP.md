# OPAX for iOS: design document

Written 3 October 2026. Start here. This document records what the iPhone app is, what has been decided and what remains open. Detail lives in three discovery documents:

- [IOS-API-CONTRACT.md](IOS-API-CONTRACT.md): routes, cost classes, static catalogs and sizes, journeys mapped to requests, the native session contract, Worker proposals and the architecture comparison.
- [IOS-UX.md](IOS-UX.md): every web surface and its mobile verdict, v1 scope, information architecture, screen specs, design language, copy, accessibility and App Store notes.
- [IOS-VOICE.md](IOS-VOICE.md): how voice works today, the native audio path, code sign-in, deletion-safe voice accounting and testing without sound.

Nothing here has shipped. A harness lane is building the app's foundation. Every Worker change is a proposal that needs Jake's OK to deploy.

## 1. What the app is, and what it is not

**What it is.** The Open Parliamentary Accountability Exchange (OPAX) app is a native reader for the public record of Australian politics. A person finds their MP by electorate or name, reads that member's voting record, declared interests, pay and expenses, follows federal bills through parliament with their divisions and party splits, and searches OPAX's catalogs of people, registers, pay and expenses. Every figure links to the record or register it came from and says how current it is. None of this needs an account. The one signed-in feature is Talk to OPAX, a voice assistant that answers from the same public record and cites its sources.

**What it is not.** It is not a government app and is not affiliated with any parliament, government or political party. It is not a copy of the website: Ask, Keep asking, community discussions, the money map, money journeys, Explore, contracts, grants and Programs & places stay on opax.com.au, and the app links to them. It has no analytics, advertising, in-app purchases, push notifications or synced follows in v1. It does not score or accuse anyone: there is no disconnect score, and patterns appear as leads with their caveats, never as findings.

## 2. Decisions so far

All dated 3 October 2026.

| Decision | What was decided | By |
| --- | --- | --- |
| Scope | Read-only public data plus the voice assistant. No community discussions, follows sync or push. No analytics. No ads | Jake |
| Voice access | Option A: sign in for voice only, with the existing community email account. Every other screen works signed out. In-app account deletion is a launch dependency | Jake |
| Apple identity | The Noice developer team. Display name OPAX. Bundle identifier proposed as `au.com.opax.app`, awaiting Jake's confirmation. The App Store name is limited to 30 characters, so the full name, Open Parliamentary Accountability Exchange, goes in the app and the description | Jake |
| Architecture | Expo SDK 57, React Native 0.86 and expo-router in `mobile/`, continuous native generation, minimum iOS 18.4, with the voice audio core as a local Swift Expo module. SwiftUI is the fallback if a release prototype fails the agreed performance or AX5 gates | Orchestrator |
| Never-call rule | The app never calls Ask, `/api/search` (ARAG), search summaries, follow-ups, journey stories, briefs, position answers (an Ask branch), `/og/*` (including through link previews) or `/mcp`. Voice is the one deliberate paid feature | Project rule |
| Session transport | The existing `__Host-opax_session` cookie session, held in the Keychain and attached explicitly by the Swift core on an allow-list of routes (section 5) | This synthesis |
| Deletion scope | Authored content and personal data deleted by default; voice accounting survives deletion without refunding budget or call slots (section 6). Product questions remain in section 11 | This synthesis, as a requirement |

## 3. v1 scope

The P0 rule: every public screen works signed out from static exports and the catalog branch of `/api/search-all`. No ARAG read, reranker or model generation backs a public P0 block. Rationale and screen specs: [IOS-UX.md, section 2](IOS-UX.md#2-candidate-v1-scope) and [section 4](IOS-UX.md#4-screen-specs-for-p0).

### P0 screens

| # | Feature | What ships | Data source |
| --- | --- | --- | --- |
| 1 | Your MP | Seat chosen by electorate or member name; your member, senators and, where a verified roster exists, state members; saved on the device | Electorates release and roster (static) |
| 2 | MP profile | Identity, voting record summary, declared interests, pay, expenses, party receipts link | Roster, portraits, `votes.json`, interests, `pay.json`, `expenses.json`, money graph (static); W12 for the voting record's as-at date |
| 3 | Electorate | Representatives with as-at date, elections, Census 2021 context, sources | Electorates release seat file (static) |
| 4 | Bills | Tracker and detail: stored summary under its attribution line, divisions, party splits, speeches with labelled machine briefs | `bills/index.json`, `bills/<key>.json` (static) |
| 5 | Search | Suggestions while typing; catalog results for people, declared interests, pay and expenses | On-device roster, electorates and bill titles; `/api/search-all` with one of `person`, `interest`, `pay`, `expense` |
| 6 | Today | Recently introduced bills, recent declarations; the latest published daily edition card | `bills/index.json`, `interests/recent.json`; W13 `/api/app/v1/edition/latest` for the card |
| 7 | Talk to OPAX | Sign-in, consent, microphone, live call, transcript, sources, allowance and every error state | Voice routes (paid, signed in) |
| 8 | Account | Sign in by emailed code, sign out, delete account | Community auth routes, W1, W2 and W5 |
| 9 | About, sources and privacy | Independence statement, sources and licences, coverage, corrections, privacy, font licences | `/corpus.json` and static text |
| 10 | Share | Canonical opax.com.au URLs out, with link metadata built from loaded data. opax.com.au links keep opening on the website | Canonical URLs; no server change |

**Journeys.** Measured on 3 October 2026 ([IOS-API-CONTRACT.md](IOS-API-CONTRACT.md#journeys-mapped-to-calls)): seat to member is four static files and 141,948 bytes transferred; an MP profile's core is 11 static requests and 503,819 bytes; bill list to detail is two requests and 128,245 bytes; catalog search is one request per page. Voice runs status, sign-in if needed, consent once, microphone permission before any time is reserved, start, connect, the call, end and a fresh status read. Deletion is a fresh code, the request, then signed out.

**P1, next:** inbound universal links (W17); record reader; speeches, topics and mentions on profiles; chronological division history; document search; newly indexed records; live counters; a basic party page; Leads and the declared-interests feed; reports and topics; the electorate outline map; local follows. Most need ARAG reads, which cost money per request, or exports that do not exist yet.

**P2, later:** location lookup, push, native Ask, community, donors (organisations only), the receipts ledger, grants and the Explore quiz. These need paid model calls, new server infrastructure, large datasets or a way to keep private individuals out of profiles. The money map, journeys, contracts, suppliers, agencies and Programs & places stay on the web.

## 4. Architecture

### Stack and layout

- Expo SDK 57, React Native 0.86, expo-router, strict TypeScript and Hermes, in `mobile/`. Development and release builds only, never Expo Go, because voice is custom native code.
- Continuous native generation: prebuild generates the `ios/` project, which is not committed; native settings live in the app configuration and config plugins.
- Minimum iOS 18.4. Light appearance only in v1 unless Jake decides otherwise (decision 2).
- Layout, set by the harness lane on `ios/harness`: `src/app/` for routes (four tabs and identifier-only stack routes), `src/features/` for screens, `src/design/` for tokens and primitives, `src/api/` for the read-only public client and cache, `src/navigation/` for web path mapping, `src/voice/` for the voice module's JavaScript surface beside its local Swift module, plus `plugins/`, `scripts/` (fixture server, gated builds and QA), `.maestro/` and `tests/`.

### Data layer

- **Static catalogs** with typed decoders. Canonical `person_*` IDs, legacy numeric IDs, name keys, slugs and bill keys stay distinct types.
- **Catalog search.** Suggestions run on the device. Submitted searches call `/api/search-all` with exactly one supported kind, never `all` or `bill`, which reach ARAG document search.
- **Allow-list.** One read-only client owns public transport. Anything outside catalog assets, `/api/person-slugs` and the allowed search kinds throws before cache or network. Redirects and cross-origin requests fail closed; lint and a static scan stop other code opening connections. This client never carries a credential.
- **Offline cache.** Bounded, on disk, keyed by URL. Saved time, validation time, the source's as-at date and staleness are kept apart. Every block shows an "As at" line; stale content is labelled, never silently mixed with fresh, and an older current-member observation never replaces a newer one.

### Voice core

One Swift package: a single `AVAudioEngine` with voice processing (echo cancellation) for capture and playback, a `URLSessionWebSocketTask` to the existing relay, codec and rate read from each call's metadata, 25 ms chunks, bounded queues and the call state machine. It also holds the session credential and makes every credential-bearing request (section 5). Its JavaScript surface is small: status, sign-in, start, mute, end, sign-out and delete, plus events. Audio and the credential never cross into JavaScript. Detail: [IOS-VOICE.md, section 4](IOS-VOICE.md#4-the-native-audio-path).

### Why this stack, and the fallback

Most OPAX contributors work in TypeScript, fixtures and journeys share one language with the web's tests, and about 430 lines of pure transforms (slugs, catalog tokens, topics, pay, dates, money records) carry over. Voice needs a native Swift core in either stack, so it does not decide the architecture. The costs are a JavaScript runtime, a bridge for voice events and SDK upgrades.

**Fallback trigger.** Switch to SwiftUI if a release build fails the agreed performance gates (screened on the iPhone 16e simulator with iOS 18.4, confirmed on Jake's iPhone), fails AX5 on a P0 screen in a way the React Native layout cannot fix, or the voice bridge proves unworkable. The gates are decision 4. The Swift voice core, fixtures and Maestro flows carry over unchanged.

## 5. Sign-in, session and voice

### Settled session design

**Decision: the existing cookie session, attached explicitly.** The Worker keeps one credential type and its existing checks; the app holds the token in the Keychain and sends it itself.

1. **Sign-in.** `POST /api/community/auth/request` in native mode emails one proof as both the existing link and an eight-digit code. `POST /api/community/auth/consume-code` exchanges the code and returns the existing `Set-Cookie: __Host-opax_session=…` header ([code contract](IOS-VOICE.md#code-sign-in-contract)).
2. **Storage.** The Swift core's authenticated `URLSession` has no cookie store (`httpCookieStorage` nil, `httpShouldSetCookies` false, accept policy never). It reads the token from the exchange response's headers and stores token and expiry in the Keychain, this device only.
3. **Attachment.** Only on voice `status`, `start`, `connect` and `finish`, community `status`, `auth/request`, `auth/consume-code` and `auth/logout`, and account deletion, the core sends `Cookie: __Host-opax_session=<token>` (when signed in) and `Origin: https://opax.com.au`, plus `Sec-WebSocket-Protocol: convai` on `connect`. Redirects on these requests are refused. The token never reaches JavaScript, the public client, logs, crash reports or analytics.
4. **Expiry.** A 401, or status reporting `signed_in:false`, deletes the token. Sign-out calls the existing `auth/logout`.

| Consideration | Explicit attachment (chosen) | Private cookie jar | `X-Opax-Session` header |
| --- | --- | --- | --- |
| Security | Same token and CSRF properties as the web. One copy, in the Keychain. The app has no cookie store, so React Native's networking, which uses the shared store, can never pick the credential up | Same token, with a second copy in the jar restored from the Keychain after relaunch | Same properties, plus a Worker rule that skips the Origin check for header requests |
| Testability | Unit tests assert exact headers per request against a mock Keychain | Depends on Foundation's handling of the `__Host-` prefix, `Secure` and expiry across relaunches, which Apple does not document | As chosen, plus mixed-credential cases on every community route |
| Worker effort | None for transport; `member()` and the Origin check unchanged | None | 1 to 2 extra days and a regression sweep of community routes |
| Apple documentation | A manual `Cookie` header when `httpShouldSetCookies` is false; `cookies(withResponseHeaderFields:for:)`; `webSocketTask(with: URLRequest)` keeps custom headers on the handshake; `Cookie`, `Origin` and `Sec-WebSocket-Protocol` are not reserved headers | Cookie storage is documented; name prefixes are not | Custom headers are documented |

**Needs a device test.** Against a TLS loopback fixture on the iOS 18.4 and 26.5 simulators, then Jake's iPhone: the three headers reach the Worker unchanged on the `wss:` upgrade, `Set-Cookie` on the exchange is readable with cookie handling off, and the Keychain item survives relaunch. The fixture keeps `Secure`; it never drops it to pass over plain HTTP.

**Revisit only if** the device test shows the explicit `Cookie` header does not reach the Worker unchanged on the upgrade, the Worker adds browser-only checks to these routes, such as `Sec-Fetch-Site`, or app sessions need different powers from web sessions. A `client:"ios"` session label (W2) helps list and revoke app sessions; it is not an authentication boundary. The API, UX and voice documents were updated on 3 October 2026 to match this decision.

### Voice in brief

- The existing same-origin WebSocket relay, tools, prompt and provider settings are unchanged. The official ElevenLabs mobile SDKs use WebRTC and cannot use the relay.
- Voice opens as a sheet from a Talk button on each tab's root screen.
- First use: status, sign in, consent once, microphone permission, then start and connect. Every step before start costs nothing. Start charges the full reservation against the allowance and the monthly budget at once: cancelling before the relay claims it returns the time, but some connection failures keep the full charge, and it stays charged after the reservation expires; a call returns unused time only after a clean provider close ([IOS-VOICE.md, routes](IOS-VOICE.md#routes)). The app never claims a refund; it shows the allowance from status.
- 600 seconds in total per ordinary account; the 40,000-second monthly budget and two concurrent calls are shared with the web. The allowance shown after any call or failure comes from a fresh status read.
- Calls are foreground only. The transcript is shown as captions and never stored.
- Screens: [IOS-UX.md, 4.10](IOS-UX.md#410-talk-to-opax-voice). Protocol and failures: [IOS-VOICE.md](IOS-VOICE.md).

## 6. Privacy, safety and App Review

### What is collected

- **Public reading:** no account, no device identifier, no analytics. Seat, cache and consent stay on the device. Requests reach the Worker with the phone's IP address, which rate limiters read; log retention is decision 14.
- **Voice:** email address and member ID, voice audio streamed through OPAX to ElevenLabs, the conversation's words (held by the provider), and voice usage (seconds and times, kept for the lifetime allowance). Linked to the person, for app functionality only, never tracking.

The public client's allow-list enforces the never-call rule in code, and the fixture answers anything else with 404. The app builds share metadata from data it already has and never lets the system fetch a page's `og:image`.

### Retention: documented configuration and verified behaviour

[VOICE-ASSISTANT.md](VOICE-ASSISTANT.md) records the provider configuration set on 9 September 2026. This discovery did not check the live dashboard or make a call.

| Item | Documented | Verified for launch |
| --- | --- | --- |
| Provider audio recording | Off | Not yet |
| Provider transcript retention | One day, deletion enabled | Not yet |
| Provider key permissions | ElevenAgents Write only; others disabled, so OPAX cannot delete a conversation by ID | Not yet |
| Agent | Private, OPAX origin only, 600-second maximum, concurrency two | Not yet |
| Audio formats | Not in the repository; tests assume `pcm_16000` | Not yet; the app reads them per call |
| OPAX voice rows | Kept for the lifetime allowance, with the provider conversation ID | From source code |
| Client IP addresses | Read by rate limiters; log retention not documented | Not yet |

Until Jake confirms the dashboard and one staging call reconciles, the consent copy, privacy label and deletion screen are drafts against the documented configuration.

### Account deletion, guideline 5.1.1(v)

Signing in creates an account, so the app must offer deletion. The requirement:

- **Personal data deleted:** the member row (email, display name, bio), every session on every device, outstanding sign-in proofs, MCP keys, the voice entitlement, the email outbox and unsubscribe tokens. Migration 0002 already dropped the supporter tables.
- **Authored content deleted by default:** discussions, replies, reading lists and items, saved chats, sent messages, likes, bookmarks, follows, blocks, reports filed and notifications to or from the member, including content written on opax.com.au.
- **Deletion-safe voice accounting, at once:** voice rows lose their member link in the same transaction and keep state, seconds and timestamps. Nothing is cancelled, released or deleted, so deletion never refunds the monthly budget or frees a call slot. A call open at deletion runs to its deadline or reconciles, with its tools refused.
- **Provider reference, later:** each row still holds the provider's conversation ID, which points to the provider's copy of that conversation, so the row is not anonymous yet. A cleanup clears the ID one day after the row's stored closure time (`closed_at`). It runs as scheduled housekeeping on the Worker's existing five-minute cron, separate from reply-email delivery and whether or not voice is enabled, as well as from request-triggered expiry. Each housekeeping run first expires overdue rows, because a call left `connecting` or `active` by an interrupted Worker has no `closed_at` until expiry runs, and expiry otherwise needs a status, start or finish request. In production, such a call is closed, still fully charged, within five minutes after its stored deadline (`expires_at`), and every ID is cleared within one day and five minutes of its `closed_at`, with no request needed (W6; [migration contract](IOS-VOICE.md#migration-contract-0012_voice_deletion_safe)).
- **Flow:** a fresh code; the app ends any live call first; one atomic database batch; a statement of what was deleted; signed out on the device. Public records are untouched.

Open product questions (replies under a deleted discussion, legal retention, a returning email's allowance) are decision 5.

### Other review points

- **Private individuals, 5.1.1(viii).** The largest review risk: the guideline bars compiling personal information from public databases and states no exception for office holders. Native pages, suggestions and links cover roster parliamentarians, electorates, parties and bills only; private people named in records never become a profile, suggestion, follow target or cross-record list ([IOS-UX.md](IOS-UX.md#who-gets-a-native-page)).
- **Third-party AI consent, 5.1.2(i).** A one-time step before the first call says what is sent, to ElevenLabs, and how long it is kept, with "Agree and start" and "Not now", and can be withdrawn. Before every call the screen shows "AI voice powered by ElevenLabs. Answers may be mistaken; check the linked records."
- **Guideline 4.7.** It covers software not embedded in the binary and names chatbots. Whether it applies to a first-party assistant served by OPAX's Worker is unsettled; if it does, it brings filtering, reporting, blocking, consent in each instance, an index with a universal link and age restriction (decision 11).
- **Not a government app.** The description, Account and about, and the review notes say "OPAX is independent and non-partisan. It is not a government app and is not affiliated with any parliament, government or political party." No national insignia in the icon or screenshots.
- **Licences, as facts.** Hansard: CC BY-NC-ND terms. They Vote For You divisions: Open Database Licence. Most money data: Creative Commons Attribution. House and Senate registers of interests: CC BY-NC-ND; Queensland's register: no verified licence. APH portraits: CC BY-NC-ND 4.0; Commons portraits: per-file licences. Fonts: SIL Open Font License 1.1. Repository code: AGPL-3.0-only. Their application to App Store distribution is decision 13.

Full notes: [IOS-UX.md, section 8](IOS-UX.md#8-app-store-and-policy-notes) and [IOS-VOICE.md, section 6](IOS-VOICE.md#6-store-and-privacy-notes).

## 7. Design language on iOS

The app carries the web's broadsheet language into native idioms ([IOS-UX.md, section 5](IOS-UX.md#5-design-language-mapped-to-native), following [UI_DESIGN_LANGUAGE.md](UI_DESIGN_LANGUAGE.md)):

- **Colour:** the web's light tokens map one to one; navy for structure and primary actions, bronze ink for record links, bronze only for rules and chart marks. A party colour is a dot with a label, never alone.
- **Type:** Merriweather for headings and record text, Public Sans for interface text, bundled with their OFL notices, scaling with Dynamic Type to AX5. System chrome stays in SF Pro.
- **Structure:** hairline rules instead of cards, 44-point targets, 4-point corners, no gold buttons.
- **Copy:** plain and evidence-first; machine text always labelled; an as-at line on every block; caveats in the web's words.
- **Navigation:** four tabs (Today, Your MP, Bills, Search), with Talk and Account buttons on each root screen.

## 8. Testing and release gates

Automated tests never reach production, ARAG, ElevenLabs, email, social channels or analytics, never open a real microphone and never play sound.

- **Fixture server.** Loopback, port 8900 to 8999, serving public OPAX snapshots pinned by hash; 404 outside the allow-list; fails closed on any other host.
- **Fake voice relay** inside it: the Worker's voice routes, shapes and errors, silent audio, tool results from fixture data, scenarios chosen by session token, a clock control, and synthetic code sign-in, logout and deletion. A TLS variant runs the section 5 header check ([IOS-VOICE.md, section 5](IOS-VOICE.md#5-testing-without-sound-or-cost)).
- **Unit tests:** decoders, identity joins and the allow-list; for voice, codecs, resampler, format parser, playback queue, state machine and credential handling against a mock Keychain.
- **Maestro journeys:** one per P0 journey and voice scenario, asserting on accessibility identifiers and text, never audio, with a synthetic microphone.
- **Simulators:** iPhone 17 Pro with iOS 26.5 (reference); iPhone 16e with iOS 18.4 (minimum, performance screening); iPhone 17 Pro Max with iOS 27 (newest, large).
- **AX5:** every P0 screen at the default size, AX1 and AX5, checked with the Accessibility Inspector and the view hierarchy, never speech.
- **Release gate.** GO means no open P0 or P1 defects (defect severities, not the scope tiers), no crashes across all journeys on all three simulators, AX5 passing on every P0 screen, and a clean release bundle scan (no fixture origins, no route outside the allow-list). Anything else is NO-GO.
- **Physical-device checks, Jake only** (they play sound, spend provider credit or need a signed build): a full staging call with sources and allowance reconciliation; echo on speaker, AirPods, wired headphones and in a car; route changes, phone calls, Siri and alarms mid-call; lock and app switch; poor network; a ten-minute call's data and battery; VoiceOver with headphones at the largest text size; the session header check and Keychain persistence; the provider dashboard; one production call after deployment. Universal links join this list in P1, with W17.

## 9. Worker changes

Deduplicated across the three documents. Refs give the matching D-number in [IOS-UX.md](IOS-UX.md#2-candidate-v1-scope), V-number in [IOS-VOICE.md](IOS-VOICE.md#worker-changes) and row of [IOS-API-CONTRACT.md](IOS-API-CONTRACT.md#proposed-worker-changes). Rows marked pipeline change an export script that runs in the nightly refresh rather than the Worker; that is a production change too. Effort is engineering judgement in person-days, with focused tests, excluding review and deployment; assumptions are stated where the range depends on them. **Every row needs Jake's OK to deploy.**

| ID | Change | Why | v1 or later | Effort | Risk | Needs Jake's OK to deploy | Refs |
| --- | --- | --- | --- | --- | --- | --- | --- |
| | **Sign-in and session** | | | | | | |
| W1 | Code issuance: `auth/request` with `client:"ios"`; one proof holds the link hash, a challenge ID and an eight-digit code stored as a keyed MAC; new requests supersede old; web issuance quotas | The email link opens a browser and cannot sign the app in; a code works across devices | **Required for v1** | 2 to 4 for W1 to W3 | High | Yes | D3, V1, API code handoff |
| W2 | Code exchange `auth/consume-code`: atomic IP, per-email (10 a day) and per-challenge (5) admission, constant-time comparison, one winner, shared with the link; returns the existing cookie; labels the session `client:"ios"` | Issues the existing session with bounded guessing | **Required for v1** | In W1 | High | Yes | D3, V2 |
| W3 | Code MAC secret per environment | Without the key, a leaked proof table cannot be reversed to codes | **Required for v1** | In W1 | Low | Yes | D3, V3 |
| W4 | Review per-IP limits for carrier NAT and an app User-Agent such as `OPAX-iOS/<version>` | Phones share carrier addresses | v1 review; change only if testing shows refusals | 1 to 3 if changed | Medium | Yes | API carrier-IP |
| | **Account deletion** | | | | | | |
| W5 | Deletion route: cookie and Origin, fresh code, one batch deleting the section 6 scope, revoking sessions, proofs and MCP keys; linked from the web account page too | Guideline 5.1.1(v) | **Required for v1** | 4 to 7 for W5 and W6 | High | Yes | D3, V4, API deletion |
| W6 | Deletion-safe voice accounting: migration `0012_voice_deletion_safe`; housekeeping on the existing five-minute cron, independent of reply email, that runs expiry and then the conversation-ID cleanup; ten tests; rollout disables voice, drains, expires open rows, migrates, re-enables | A member with voice rows cannot be deleted today; deleting the rows would refund budget and free live slots | **Required for v1** | In W5 | High | Yes | D3, V5 |
| W7 | Privacy page and voice notes covering the app, microphone, ElevenLabs, retention and deletion | A privacy policy is required in the app and listing | **Required for v1** | About 1 | Low | Yes | D6, V9 |
| | **Voice accounting and status** | | | | | | |
| W8 | `reason:"budget"` or `"capacity"` on the start 429; `budget_open` in status | A spent monthly budget looks like "busy" today | v1, recommended; not blocking | 1 to 2 | Medium | Yes | D3, V6, API budget |
| W9 | `client` column on `voice_sessions` | App and web minutes reported apart | v1, optional | Under 1 | Low | Yes | V8 |
| W10 | `released` flag on connect error bodies | Helps HTTP clients; status stays authoritative | Later, optional | Under 1 | Low | Yes | V7 |
| | **Data exports** | | | | | | |
| W11 | Compact per-person projection with an as-at date per block | A profile now downloads four whole-site files: 2,762,089 bytes raw, 301,169 compressed | v1, recommended; not blocking | 3 to 6 | Medium | Yes (pipeline) | D5, API compact person |
| W12 | A `_meta` entry in `votes.json`, beside the existing `_names` index, written by `scripts/export_votes.py`: `content_changed_at` (UTC; when this content was first exported, kept by a rerun that changes nothing else, so an unchanged night writes an identical file), `latest_division_date` and `latest_division_date_by_jurisdiction` (the newest division counted in a published record's totals, keyed by the record's `jurisdiction`), and `schema` (1). The voting record's as-at line reads "Record last changed [content_changed_at] · Divisions through [the record's jurisdiction date]"; with no `_meta`, as before the first export that writes it, the date is unknown | The voting record is a P0 block and every block shows a source date. No published date identifies the votes export: `corpus.json`'s refresh time is not it, because a failed votes step leaves the previous file in place | **Required for v1** | Under 1, including checks that the web loaders, `export_parliamentarians.py` and `validate_data.py` ignore the new key | Low | Yes (pipeline, nightly refresh) | D7 |
| W13 | Implemented on branch: `/api/app/v1/edition/latest` for the Today card, plus exact `today` and `YYYY-MM-DD` routes; frozen journal plus a posted receipt only, no preview, generation, OG or social fallback | Today's edition card; `/today` is only a redirect | v1; card hidden only when no posted edition exists on or before today (404) | 1 to 3 | Medium | Yes | D2, API frozen edition |
| W14 | Verified postcode candidates: licensed dated source, every candidate seat, allocation basis, stable IDs | Postcode entry in Your MP | Later, after a source is approved | 3 to 6 after approval | High | Yes (pipeline) | D1, API postcode |
| W15 | Per-person vote export with division keys; compact paged bills list | P1 division history; smaller bills index | Later (P1) | 2 to 4 | Medium | Yes (pipeline) | API paged bills and votes |
| W16 | Per-refresh list of changed entity keys | P1 local follows without accounts | Later (P1) | 2 to 3, assuming bills, roster members and register files only, diffed against the previous published export in the nightly run | Medium | Yes (pipeline) | IOS-UX.md follows |
| W21 | Frozen record export for the P1 reader: text, stored brief and metadata for records the app links to | Record links open the web in v1; the reader otherwise reads ARAG `/api/resource` and `/api/brief` on every open | Later (P1) | 3 to 6, assuming records linked from bills, profiles and voice sources only, not the full corpus | Medium | Yes (pipeline) | IOS-UX.md P1 record reader |
| W22 | Per-person recent-speeches export with stored briefs | P1 speeches on profiles without an ARAG search per profile | Later (P1) | 2 to 4, assuming the newest 20 speeches per roster member, read from the knowledge box during the nightly refresh | Medium | Yes (pipeline) | IOS-UX.md P1 speeches |
| W23 | Frozen newly-indexed list and coverage snapshot written by the nightly refresh | P1 newly indexed records and live counters without `/api/recent` and `/api/stats`; `corpus.json` already carries resource counts, which may cover the counters | Later (P1) | 1 to 2, assuming the newest 12 records, matching `/api/recent` | Low | Yes (pipeline) | IOS-UX.md P1 recent and counters |
| W24 | Direct per-record links in evidence exports where a source has stable record pages; register links stay elsewhere | All 89 evidence rows in `/discovery.json` are register links today | Later (P1, Leads) | 2 to 4, assuming two or three sources have stable record URLs | Medium | Yes (pipeline) | IOS-UX.md shared patterns |
| | **Universal links** | | | | | | |
| W17 | Apple app site association served by the Worker as JSON, no redirect, selected public paths only; `/community*`, `/ask` and `/chat` unclaimed; decide on `www` | Inbound links open the app | Later (P1); v1 only shares links out, and sign-in uses codes | 1, plus a signed-device check | Medium | Yes | D4, V10, API association |
| W18 | Dedicated app sign-in link path | Tap-to-sign-in beside the code | Later | 1 to 2 plus a signed-device check, assuming W17 exists and the native proof already covers link consumption; covers the association entry, an email link variant for native requests and a web fallback page that does not consume the token | Medium | Yes | V10 |
| | **Cache and versioning** | | | | | | |
| W19 | App manifest `/api/app/v1/manifest`: data version, catalog hashes and as-at dates, minimum app version | Atomic catalog swaps; a forced-update path | v1, recommended | 1 to 2 | Low to medium | Yes | API manifest |
| W20 | ETag and `If-None-Match` on Worker JSON; written app cache policy | Static files revalidate already; Worker JSON does not | Later | 2 to 3 | Low to medium | Yes | API ETag |

**Required for v1:** W1, W2, W3, W5, W6, W7 and W12. Public reading needs no Worker deployment; its one launch dependency is W12, a change to the nightly export.

**Proposals without a row.** Document search and topics (P1) would use existing ARAG routes. Allowing them means revisiting the never-call rule, a cost decision rather than a server change. Chronological division history maps to W15 and local follows to W16.

**Not planned**, and each would need Jake's OK if proposed: an `X-Opax-Session` header (not chosen), CORS for Expo web or a hosted WebView, a WebRTC token endpoint that would bypass the relay's enforcement, and subscription and push infrastructure (P2, 7 to 12 days).

## 10. Delivery plan

Lanes without a dependency between them run in parallel.

| # | Lane | Delivers | Depends on |
| --- | --- | --- | --- |
| 1 | Harness | Expo foundation, read-only client and allow-list, cache, fixture server, gated builds, first journeys. In progress on `ios/harness` | Decision 1 |
| 2 | Design system | Tokens, fonts, primitives, people rows, as-at lines, states, AX5 behaviour | 1; decision 2 |
| 3 | Your MP and profiles | Seat chooser, Your MP, MP profile, electorate | 2; decision 3; W12; W11 optional |
| 4 | Bills | Tracker, filters, bill detail | 2 |
| 5 | Search | Suggestions, browse, catalog results | 2, 3; decision 3 |
| 6 | Today and discover | Today feeds; the edition card with W13; Leads at P1 | 2, 4 |
| 7 | Voice core | Swift module, fake relay, voice sheet, every call state | 1; can start alongside 2 |
| 8 | Sign-in and account | Code sign-in, sign-out, deletion, consent, Account and about | 7; W1 to W3, W5 and W6 implemented; decision 5 |
| W | Worker and pipeline changes | W1 to W3, W5 to W7 and W12 on a branch. Worker rows go to staging, then production; W12 reaches production through the nightly refresh | Decisions 5 and 6; Jake's OK for each deployment |
| 9 | Release candidate and QA gate | Release build, all journeys on three simulators, AX5, bundle scan, GO or NO-GO | 3 to 8; decision 4 |
| 10 | TestFlight Internal | First internal build | 9 at GO; Jake's go; App Store Connect record; W lane in production |

## 11. Open decisions

Each has a recommended default, ordered by what blocks work soonest.

| # | Decision | Recommended default |
| --- | --- | --- |
| 1 | Bundle identifier and App Store Connect record | `au.com.opax.app`, with the record created under the Noice team |
| 2 | Design defaults | Light only for v1; Talk as a navigation bar button, not a tab; the Australia mark alone as the icon; "OPAX" everywhere in the app; lowercase "m" and "bn" in compact money |
| 3 | Native-page scope for people (5.1.1(viii)) | Roster parliamentarians only; no donor, recipient, supplier or witness pages; private individuals never profiles or suggestions |
| 4 | Performance and AX5 gates, which trigger the SwiftUI fallback | Release build, screened on the iOS 18.4 simulator and confirmed on Jake's iPhone: cold launch to cached content in 2 seconds or less; a cached MP profile in 1 second or less; scroll hitch rate under 5 ms per second; memory under 300 MB on a long profile; every P0 screen usable at AX5 with no clipped names, figures or caveats |
| 5 | Account deletion policy | Delete authored content and personal data; other members keep their own replies and messages, and a deleted discussion with replies becomes a stub without personal data; no undisclosed retention; a returning email gets a fresh 600 seconds and no email hash is kept |
| 6 | Deploy the required Worker and pipeline changes | Approve W1 to W3, W5 to W7 and W12 (a nightly-refresh export change), with W9: Worker rows to staging and then production, W12 through the nightly refresh |
| 7 | Optional adapters for v1 | Build W8, W11, W13 and W19; inbound universal links (W17) follow in P1; postcode (W14) waits for a licensed source, with a link to the AEC's electorate finder meanwhile |
| 8 | Provider settings and the first real call | Jake confirms recording off, one-day transcripts and both audio formats in the dashboard, then makes the first staging call with his own account |
| 9 | Voice budget | Share the 40,000-second monthly budget and two call slots with the web |
| 10 | Voice behaviour | End calls on background; consent once, with the disclosure line before every call; add the consent step to the web panel later |
| 11 | Guideline 4.7 | Ask App Review before submission; meanwhile ship a "Report this answer" path to the corrections contact. If 4.7 applies, W17 moves into v1, because 4.7.4 asks for a universal link to the assistant |
| 12 | Support URL and contact (guideline 1.5) | A published contact address and support page on opax.com.au, also used for corrections |
| 13 | Rights review | Before submission: data licences for app distribution, native caching of APH portraits, no APH portraits in store screenshots, and the AGPL question for code reused from the web; the app stays free with no ads or purchases |
| 14 | Privacy label inputs | Confirm how long Worker logs and limiters keep client IP addresses, then answer the App Privacy questions to match |
| 15 | Notice about people who have died | One notice in About and the store description that the app contains names and images of people who have died |
