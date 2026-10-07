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
- `subscribeLevels(listener)` receives `{input, output}` loudness (0 to 1, about
  15 a second while live) for the call animation; a separate native event, so
  levels never displace call events. Malformed levels are dropped.

All results use `{ok:true,value}` or `{ok:false,error:VoiceFailure}`. Command
success acknowledges dispatch, not a live call; observe the events for call
refusals, asynchronous connection errors and terminal reasons. Status exposes an
open row's state/expiry only, plus `accountHeld`: whether this iPhone holds an
unrevoked account session, so sign-out and deletion stay offered when voice
refuses the member (a disabled member keeps the right to delete). Code challenges are proofs, not session credentials;
keep them and the entered code transient. Native error prose is never forwarded.

Events are a discriminated union: `state` (with nullable end reason), `mode`,
`playback` (including truncation), `transcript`, `sources`, `remainingTime`,
`status`, `error`. A cleared status emits `status: null`, matching `snapshot()`
and invalidating any cached allowance. Transcript corrections replace the native snapshot; sources
are validated relative OPAX record paths. No audio, token, session ID, signed URL,
raw provider payload or account member ID crosses the bridge. JS validates and
projects every result/event again, strips extra fields and drops malformed events.

## Before the voice UI ships

Release checklist completed for production build 5:

- [x] `OPAX_PRODUCTION_VOICE` defaults to `1` and selects both real Talk and
      Account entries, both pods, permission metadata and the native route policy.
- [x] Explicit `0` preserves the placeholders and excludes both voice pods;
      both states have production tests and archive/IPA verification.
- [x] All seven privacy types are linked, none track, and location stays on-device.
- [x] Consent reads the stored choice in every build; withdrawal blocks the next call.
- [x] Report this answer opens published support with a record path or no record;
      captions never leave the app through reporting.
- [x] Upload requires an explicit expected mode matching `release.json`.

See `plugins/voiceProduction.js` and `voice-production-policy.json`. No runtime
or OTA flag can enable this capability. Fixture journey and Release launch
proofs are retained privately; Jake makes the first real TestFlight call.

Consent starts denied in every variant, development and e2e included. The Talk
UI stores an explicit choice on this device through the native `consent()` and
`setConsent(boolean)` hooks (`StoredVoiceConsent`, `opax.voice.consent.v1`, denied
on a fresh install) and can withdraw it during a call; withdrawal ends a call.
The permission dependency requests the microphone only after an explicit grant,
and only with the production switch on. The purpose string is absent with the
switch off and in development/e2e, which need no permission. Never enable consent
automatically in production. The UI must show its disclosure before every call
and end calls on background (the core already handles lifecycle).

The native production gate compares the embedded method/path list with `AuthRoute`
before any I/O. Credentials remain in the origin-scoped this-device-only Keychain;
Cookie and Origin are attached only to those ten routes, never to catalog data,
provider hosts or a browser. Redirects and ambient cookie jars remain disabled.

`report-answer.ts` exposes `reportAnswer(recordPath)` for Talk. It uses the shared
in-app Safari source browser, sending a canonical record path only. The published
`/support` page is enabled by embedded `extra.supportPageAvailable: true`; a
missing record opens general support without a record parameter. The helper
retains the GitHub fallback for a build whose support flag is false. This helper
does not submit reports or probe any endpoint.

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
the production policy. Release bundle checks reject the route and fixture/code
markers in both switch states. The microphone purpose string is forbidden when
off and required with the policy text when on. The shared production block list
is read by Metro and the route verifier. Pod policy checks both production states
and retains both pods in development/e2e. Archive and IPA verifiers reject voice
and microphone permission code when off; when on they require both linked pods,
stored consent, the exact purpose text, Talk/Account route keys and the privacy
manifest, while rejecting native fixture code. Signed release tooling uses a
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
comments inside and outside the filter; response key order and quote formatting do not alter the pin.
Stored response fixtures must also match the pin. Unrelated Worker edits do not break
fixture startup. Relevant drift names the changed contract component, disables
the voice routes, and leaves catalog journeys available. It binds and accepts only numeric
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
