# Native voice bridge

`index.ts` is the UI-facing API. Its statically named native loader is
`modules/opax-voice/index.ts` (`OpaxVoice`), registered in the exact native gate.
The public catalog client is unchanged. No JS transport or voice SDK is used.

- `snapshot(): Promise<VoiceResult<VoiceSnapshot>>` (atomic native state; no I/O)
- `status(): Promise<VoiceResult<VoiceStatus>>`
- `requestCode(email): Promise<VoiceResult<CodeChallenge>>`
- `consumeCode(challengeId, code): Promise<VoiceResult<VoiceStatus>>`
- `start()`, `mute(muted = true)`, `end()`, `logout()` return `VoiceResult<void>`
- `requestDeletionCode(): Promise<VoiceResult<CodeChallenge>>`
- `deleteAccount(challengeId, code): Promise<VoiceResult<AccountDeletion>>`
- `subscribe(listener)` returns an unsubscribe function.

All results use `{ok:true,value}` or `{ok:false,error:VoiceFailure}`. Command
success acknowledges dispatch, not a live call; observe the events for call
refusals, asynchronous connection errors and terminal reasons. Status exposes an
open row's state/expiry only. Code challenges are proofs, not session credentials;
keep them and the entered code transient. Native error prose is never forwarded.

Events are a discriminated union: `state` (with nullable end reason), `mode`,
`playback` (including truncation), `transcript`, `sources`, `remainingTime`,
`status`, `error`. Transcript corrections replace the native snapshot; sources
are validated relative OPAX record paths. No audio, token, session ID, signed URL,
raw provider payload or account member ID crosses the bridge. JS validates and
projects every result/event again, strips extra fields and drops malformed events.

## Before the voice UI ships

Production excludes both voice pods through the Expo autolinking config plugin.
The optional module loader returns a typed `unavailable` result for every command
and a harmless unsubscribe function when the module is absent. Development and
e2e retain the native module. The UI lane must remove the exclusion deliberately
when consent, purpose string and the related release gates are ready.

Development consent is deliberately denied and its permission dependency cannot
request the microphone. `NSMicrophoneUsageDescription` is absent in every variant,
including e2e, which needs no permission. The UI lane must implement and store
explicit third-party consent with withdrawal, wire the permission dependency,
and deliberately update `withNetworkPolicy.js` and native policy gates before
adding the purpose string. Never enable consent automatically in production.

The UI needs sign-in/code entry, deletion confirmation and proof entry, every
refusal and terminal reason in `types.ts`, captions/corrections, source navigation,
remaining allowance from fresh status, mute/playback/truncation indicators and
foreground lifecycle handling. Subscribe before status/start, then call `snapshot()` on mount/remount to recover
`state`, `reason`, `mode`, `playback`, `remaining`, `transcript`, `sources` and nullable
`status`. These are the same sanitised read models used by events. If an event
arrives while the snapshot promise is pending, preserve that newer event. Unsubscribe on
unmount; call End when the sheet closes. Do not persist transcript/challenges or
pass them to analytics. The controller owns socket, audio, timers and allowance
reconciliation; never infer a refund or retry a reservation/connect blindly.

## Silent bridge workbench

Only the e2e simulator pod selects synthetic input, silent timed playback and the
compiled numeric-loopback guard. The simulator fixture port is embedded by CNG (Jest requests an ephemeral port), with no JS
origin override. In e2e, `opax://voice-bridge-test` opens a test screen outside the
design and feature lanes. Metro excludes its route and `src/test-screens/` in all
other variants so an ordinary development build cannot run fixture actions against
the production policy. The release bundle check rejects the route, fixture/code markers and microphone
purpose string. The shared production block list is read by Metro and the route
verifier. The pod policy verifies autolinking excludes both voice pods in production
and retains both in development/e2e; the archive and IPA verifiers reject voice
or microphone permission symbols. Signed release tooling uses a
clean prebuild, so e2e Pods cannot be reused for an archive. The e2e fixture injects
native in-memory credentials as specified by the core plan; production uses the
origin-scoped Keychain store. Simulator builds need no signing identity. Test
server code lives only under `scripts/`.

Journey `20-voice-bridge` signs in with synthetic code `01234567`, receives
transcript/correction/sources, mutes, ends, observes a five-second allowance deadline,
refuses another start, signs out, signs in again and completes deletion. Fixture
accounts are `<happy|deadline|exhausted|drop|disabled|unlimited|budget>@example.invalid`.
Only the fixture recognises them, and it never sends email. Account scenario is
bound to an opaque native cookie; no scenario token crosses into JS.

The fixture uses generated real Worker status/community/deletion shapes and its
contract-pinned pure client-message filter. `scripts/voice-worker-contract.json` pins only the filter, evaluated status response
shapes and the evaluated start response projection. Syntax-tree extraction ignores
adjacent comments; response key order and quote formatting do not alter the pin.
Stored response fixtures must also match the pin. Unrelated Worker edits do not break
fixture startup. Relevant drift names the changed contract component. It binds and accepts only numeric
loopback, checks Origin/cookie/convai on upgrade, enforces initiation/message limits,
sends canned metadata, synthetic silence, transcript corrections, standard/receipt/
clarification sources and ping/pong, and supports deadline closes and TCP aborts.
`/__fixture/voice/log` reports message types/sizes/times and accounting; a bounded
POST to `/__fixture/voice/clock` advances expiry. These are fixture-only routes.
Deletion revokes proofs/credentials while preserving charges and open slots.
This is a deterministic protocol fixture, not an implementation of production
rate limiting, database transactions, email or provider tools.

Plain HTTP loopback proves manual headers and Secure-cookie extraction for this
bridge. TLS loopback on the minimum OS and a physical-device Keychain/header check,
provider settings, real audio/echo/routes, consent and release privacy checks remain
integration gates for the UI/release lanes. Automated tests never make real calls.
