# OPAX voice core

Swift core in its own `OpaxVoiceCore` module, with a local Expo wrapper. The W5 deletion extension is implemented against the Worker contract read from fetched `origin/main` at `46133089`. No production or staging endpoint is contacted by this lane.

## Expo wrapper

`expo-module.config.json` autolinks two separate static pods: `ios/OpaxVoiceCore.podspec`
compiles only the core sources with Swift 6, and `ios/OpaxVoice.podspec` compiles
`ios/Bridge/` with dependencies on ExpoModulesCore and OpaxVoiceCore. Tests and
Package.swift are excluded from pod compilation. One `VoiceController` actor owns
one HTTP client and one `VoiceCallController`; one cancellable Expo task consumes
its sanitised event stream. `VoiceBridgeValue` explicitly projects each approved
field; it never encodes arbitrary objects or response bodies.

The e2e Release pods compile `OPAX_VOICE_E2E`, retaining the synthetic engine and
numeric-loopback execution guard without compiling the app as DEBUG. Production
pods omit that condition and keep consent denied until the UI lane implements it.
The JS contract and UI handoff are in [src/voice/README.md](../../src/voice/README.md).
No microphone purpose string or real permission request is enabled by this lane.

## Layout and architecture

```
ios/OpaxVoiceCore/
  Package.swift                    Swift 6, iOS 18.4; macOS 14 for silent host checks
  Sources/OpaxVoiceCore/
    Models.swift                   typed status, bridge snapshots, state/events/protocols
    Credentials.swift              opaque credential, origin-scoped Keychain, atomic compare-and-clear
    HTTPClient.swift               scoped headers, auth/voice HTTP, fresh-status error classification
    Relay.swift                    convai WebSocket, client messages, provider event decoding
    AudioPipeline.swift            codecs, fractional chunks, queues, persistent converter
    AppleAudio.swift               one voice-processing engine, signalled tap, playback drain signals
    DebugSyntheticAudio.swift      DEBUG synthetic input and silent timed playback
    RuntimeSafety.swift            DEBUG test-wide network/audio execution guard and counters
    Evidence.swift                 capped transient transcript, corrections, validated source links
    CallController.swift           serialized call lifecycle, back-pressure, fresh status and bounded polling
  Tests/OpaxVoiceCoreTests/         XCTest, in-memory dependencies, real loopback WebSocket/redirect servers
    Fixtures/worker-status.json    generated from the actual Worker status function
    Fixtures/worker-deletion.json  generated from origin/main deletion and community status code
scripts/generate-status-fixtures.mjs
scripts/generate-deletion-fixtures.mjs
```

Every hardware, permission, audio-session, lifecycle, clock, credential, HTTP and relay dependency is injectable. The tap copies into a preallocated two-second ring and yields a coalesced signal after unlocking. Capture suspends until data arrives; conversion and encoding run off the tap with no 5 ms wake loop. One long-lived converter carries resampler state across buffers. Route notifications only yield events; the core rebuilds the graph/converter and keeps the socket. Interruption, background and media reset end the call; scene inactivity and resumption do not restart it.

Both metadata formats must validate before engine/converter allocation. Accepted codecs are PCM16 little-endian and G.711 µ-law, at 8,000, 16,000, 22,050, 24,000, 44,100 or 48,000 Hz; only missing input defaults to PCM16/16k. Encoding matches SDK sample scaling/rounding. Fractional 25 ms chunks sum to exactly one second every 40 chunks. Capture and upload bounds remain two seconds; stalled upload beyond the bound ends the call. Mute sends encoded zero samples and mutes voice-processing input.

Playback holds at most **30 seconds scheduled plus 30 seconds of encoded backlog/in-flight data**. The socket reader never waits for playback capacity. An independent worker decodes and schedules one-second pieces, waiting on engine completion signals. Excess incoming audio is truncated at the backlog bound and emits `VoiceEvent.playback(.truncated)`; queue depth never ends the call. `.buffering` reports pending audio and `.flowing` reports normal/drained playback. Interruptions immediately clear both queues, invalidate pending scheduling with a playback epoch, and switch to listening. Ping/pong, transcript, sources and close frames continue while playback is deep. Socket send/receive failures wait for the same cached terminal signal from URLSession’s serial delegate callbacks. A received close frame retains its code/reason; a racing write can nevertheless leave URLSession with an abnormal 1006 observation. After finish, fresh signed-in status with exhausted personal time or a closed budget recovers that observation as an ended call with the corresponding reason. Time left, unlimited membership alone, signed-out status or an unavailable status read cannot prove a deadline and retain the network failure. Policy/provider faults are not reclassified. Subscribers are cancellable and the signal is broadcast once, without retrying a read, send, reservation or connection. Local countdown is display only; the relay deadline is authoritative.

The credential allow-list contains GET voice status/connect, POST voice start/finish, GET community status, and POST auth/request, consume-code, logout, account/deletion-code and account/delete. Native code request sends `client:"ios"`; exchange sends only `challenge_id` and eight digits. The ephemeral authenticated session has no cookie storage, automatic cookies, cookie acceptance, cache or redirects. Cookie parsing requires Secure, HttpOnly, host-only, Path=/ and bounded expiry. Keychain accessibility is WhenUnlockedThisDeviceOnly and never synced; the service includes the exact origin, so DEBUG loopback cannot reuse production's item. Existing unscoped items are not read or migrated automatically.

The credential is not publicly Codable; its private storage DTO validates on decoding. Its description, debug description and Mirror reveal no token. Each request carries an internal credential snapshot. A 401, null community member without deletion permission, logout or successful deletion clears only that snapshot using atomic compare-and-clear, so stale responses cannot delete a newer sign-in. A signed-out voice status first confirms community status with the **same snapshot**: only an absent member without deletion permission establishes sign-out. Disabled members retain their deletion credential; retaining it never grants voice access. Failed/malformed confirmations preserve it, while an explicit confirmation 401/403 revokes only the snapshot it carried. A voice request sent without a credential never confirms against a subsequently signed-in credential. An expired credential is similarly cleared by comparison; deletion failure blocks only that old credential. A start 403 is classified from fresh status rather than prose; an unexplained 403 with a failed status read does not revoke a credential.

Deletion code issuance sends `{}` to `POST /api/community/account/deletion-code` and returns only the sent flag and challenge. Redemption sends `{challenge_id,code}` to `POST /api/community/account/delete`; a leading-zero eight-digit code stays a string. Generic 400 maps to `deletionVerificationFailed`, 401 to signedOut, 403 to forbidden and 503 to unavailable. No server error/message text enters events. Success requires both deleted/signed_out flags and compare-clears the credential/Keychain item; the expired response cookie is never stored. The controller ends the call first, clears transient evidence after success and reads fresh status. A community status with `member:null, can_delete_account:true` preserves the credential, including disabled members; false/absent clears it. Deletion does not imply any voice-budget refund and has no automatic retries.

The server's reservation expiry is not checked against the device clock. Any malformed successful start with a recoverable valid session UUID calls finish before failing. After call failure/end, finish is followed by a fresh status read; finish never supplies displayed allowance and charge hints never imply refunds. An open row prevents another start. Polling uses the latest stored expiry as a hint, exponential backoff, a 30-second interval cap and at most 24 reads per polling run; expiry itself never authorizes a new call. Start/refresh explicitly rechecks status after the polling cap. There is no blind reserve/connect retry or socket reconnection.

Status accepts the Worker's nullable total and missing optional signals. Unknown open states remain open and refuse Start. Disabled takes precedence over signed-out. `VoiceStatusSnapshot` carries open state/expiry without its ID; only these snapshots enter events/controller read models. Controller refresh/logout throw `VoiceFailure`, and Start during refresh emits `statusChecking`. Transcript/source snapshots retain the approved caps and record-path allow-list. Audio, credentials, signed URLs and provider payloads never enter the bridge event surface.

## Run the silent tests

Select release Xcode and set `DEVELOPER_DIR` in your local environment. Set these variables to your local capacity helper, required gate scripts and assigned simulator respectively:

- `OPAX_CAPACITY_CMD`
- `OPAX_SIM_GATE`
- `OPAX_BUILD_GATE`
- `OPAX_VOICE_SIM_UDID`

Keep machine paths and device IDs outside tracked files. Export them in the shell for this branch. After the harness is integrated, its git-ignored `mobile/.qa.local.env` may supply them; never commit that file or create it before its ignore rule is present. Once the harness helpers are integrated, use `mobile/scripts/qa-env.sh` and `capacity.sh` to load/check them rather than duplicating that logic.

From `ios/OpaxVoiceCore`, after loading those variables:

```sh
# Optional private local environment, resolved from the package directory.
if [ -f ../../../../.qa.local.env ]; then
  git check-ignore ../../../../.qa.local.env >/dev/null || exit 1
  . ../../../../.qa.local.env
fi
: "${OPAX_CAPACITY_CMD:?Set the capacity helper}"
: "${OPAX_SIM_GATE:?Set the simulator gate}"
: "${OPAX_BUILD_GATE:?Set the build gate}"
: "${OPAX_VOICE_SIM_UDID:?Set the assigned simulator}"
: "${DEVELOPER_DIR:?Select release Xcode}"

bash "$OPAX_CAPACITY_CMD" opax
bash "$OPAX_CAPACITY_CMD"
# Respect the shared-load result before proceeding.
nice -n 10 swift test -j 2

trap 'xcrun simctl shutdown "$OPAX_VOICE_SIM_UDID" >/dev/null 2>&1' EXIT
bash "$OPAX_CAPACITY_CMD" opax
bash "$OPAX_CAPACITY_CMD"
bash "$OPAX_SIM_GATE" opax-voice-core "$OPAX_VOICE_SIM_UDID"
bash "$OPAX_CAPACITY_CMD" opax
bash "$OPAX_CAPACITY_CMD"
bash "$OPAX_BUILD_GATE" opax-voice-core nice -n 10 \
  xcodebuild test -jobs 2 -scheme OpaxVoiceCore \
  -destination "id=$OPAX_VOICE_SIM_UDID" -parallel-testing-enabled NO \
  -derivedDataPath ../../.evidence/DerivedData \
  -resultBundlePath ../../.evidence/voice-tests.xcresult
```

Check capacity before every build/device run. Above load5=140 wait; after hitting that threshold resume heavy work below 100. Use a fresh result bundle path for each rerun. Evidence stays gitignored. Remove only this build's Build/Intermediates.noindex, CompilationCache.noindex and ModuleCache.noindex (plus package `.build/out` equivalents), retaining products/results. Keep the Mac muted. No real microphone, output, speech, VoiceOver or external endpoint test is allowed.

From the module directory, run `node scripts/generate-status-fixtures.mjs --check` and `node scripts/generate-deletion-fixtures.mjs --check` before tests. Regenerate only after reviewing Worker changes. The generator uses Node 24 built-in TypeScript stripping and executes the real `portal/src/voice.ts` status function with an in-memory D1 seam, records the source hash, and does no networking. It covers signed-out, disabled, allowance, exhausted, unlimited and open-session shapes. The current Worker **does not expose a closed budget** in status: its current budget-closed shape is generated separately; `budgetClosedFutureW8` explicitly adds only the approved future `budget_open:false` signal.

The deletion generator executes the actual fetched Worker deletion route, its body/Origin/limiter helpers and community status branch in an isolated VM. Node 24 or later strips the types; the source-pinned error helper's constructor parameter property is lowered to an equivalent assignment. D1, MAC and email bindings are in memory; there is no fetch or network entry point. Source hashes detect drift. Fixtures cover success, generic proof failures, 401/403/405/503, disabled members and paused community status. Fetching `origin/main` is an explicit source-update step, never part of the test suite.

**Test-wide safety:** the core detects XCTest in DEBUG and also installs the guard from every test's shared base class. Every HTTP execution and WebSocket connection passes the same numeric-loopback check before execution; fake transports use that boundary too. Listeners bind/accept only that address. Real engine, permission and session entry points are blocked by the test guard; simulator/macOS additionally refuse hardware unconditionally. The hardware-open boundary counts attempted input/output opens before refusing, and the transport boundary records attempted hosts before refusing. Every ordinary test checks the cumulative audit in tearDown; it is never reset. Negative guard self-tests use separate task-local measured scopes and assert dirty audits (including one refused input/output attempt and refused foreign hosts). Thus a planted attempt in an ordinary test fails the suite while intentional self-tests prove the refusal and measurement paths. Buffer/converter tests construct no I/O engine. Real loopback redirect tests verify that HTTP and WebSocket requests reach A with headers and that B receives zero connections.

The relay fixture enforces single first initiation within ten seconds after upgrade, accepted messages and payload/rate limits. Canned silence, metadata, transcript, corrections, standard/receipt/clarification sources, deadlines, policy/provider closes and abnormal drops exercise the actual URLSession WebSocket. Refusal HTTP is loopback; other HTTP is in-memory. Normal fixture closes finish the WebSocket close handshake, with bounded cleanup; abnormal-drop fixtures explicitly abort it. Regression tests cover 3/30/70-second bursts and real-WebSocket cases with 35 seconds buffered: interruption, pong, transcript, sources and deadline close are handled without draining first. The interruption/ping/deadline combination runs **200 iterations**, with a protocol decorator gating the pong and injecting 1006 after an actual loopback close frame. Both write-first/receive-first orders and fresh exhausted-allowance/closed-budget status are forced equally; ordering does not depend on sleeps or reproducing URLSession's rare race. Synthetic upload covers both orders too. Separate native-socket tests retain unmodified close observations, and negative classification tests keep genuine network/policy/provider failures. The terminal signal has broadcast/cache/cancellation checks. A real over-bound burst emits truncation, remains live and flushes on interruption. Other regressions cover deletion after signed-out voice status, sign-in races, clock skew, malformed starts, polling/capture bounds and public credential isolation.

## Verified round-3 results

Final source checked on 2026-10-03 (AEST):

| Check | Result | Completed | Time |
| --- | --- | --- | --- |
| Host `swift test -j 2` | 110 passed, 0 failed | 21:23:35 | 23.089 s tests; 33 s command |
| Assigned iOS 27 simulator, both required gates | 110 passed, 0 failed; TEST SUCCEEDED | 21:24:55 | 23.796 s tests; 45 s build/test command |
| Deterministic loopback close race | 200 iterations, 0 failures on each platform | In both suites | Both write/receive orders, personal/budget deadlines |
| Both Worker fixture drift checks | Passed | Before tests | — |

Both ordinary-test audits measured attempted input opens=0, output opens=0 and hosts exactly `127.0.0.1`; every test's teardown checked the cumulative guard. Refused-attempt self-tests remained isolated and dirty as expected. Disabled-member voice status preserved the cookie on the subsequent deletion-code request; absent-member confirmations cleared only their original credential, including sign-in races. A real TCP abort also recovered exhausted allowance using fresh status, while unconfirmed network/policy/provider failures remained failures. No Swift compiler warnings occurred; the simulator emitted the skipped AppIntents metadata-extraction warning. Builds paused above load5=140 and resumed below 100; host started at load5=95, simulator boot at 81 and simulator build at 85. Shutdown completed at 21:24:58 and was confirmed; the Mac remained muted. This lane's intermediates/caches are pruned, retaining products and private result bundles. All changes remain within this module.

## Verified round-2 results

Final source checked on 2026-10-03 (AEST):

| Check | Result | Completed | Time |
| --- | --- | --- | --- |
| Host `swift test -j 2` | 102 passed, 0 failed | 20:57:15 | 4.872 s tests; 10 s command |
| Assigned iOS 27 simulator, both required gates | 102 passed, 0 failed; TEST SUCCEEDED | 20:57:59 | 5.179 s tests; 18 s build/test command |
| Release generic iOS compile, required build gate, signing disabled | BUILD SUCCEEDED; no device launch | 20:57:25 | 9 s |
| Both Worker fixture drift checks | Passed | Before tests | — |

The final ordinary-test audits measured attempted input opens=0, output opens=0 and hosts exactly `127.0.0.1`. All test classes enforce the cumulative audit in tearDown. Deliberate guard self-tests separately recorded one refused input/output attempt and every refused host, and asserted dirty audits; no hardware or external connection was opened. The real redirect destination accepted zero connections. No Swift compiler warnings occurred; the simulator emitted one skipped AppIntents metadata-extraction warning. Builds paused when load5 exceeded 140 and resumed below 100; all final heavy checks started below 100. The simulator's EXIT trap completed, shutdown was confirmed, and the Mac remained muted. This lane's intermediates/caches are pruned, retaining products and private result bundles.

The independent round-3 review subsequently reproduced a rare pong/close observation of 1006 and one intermittent failure in those timing-based tests. Round 3 adds fresh-status classification for 1006 and explicit ordering injection; the earlier successful runs did not exclude that race.

## Verified fix-round 1 results

Final source checked on 2026-10-03 (AEST):

| Check | Result | Completed | Time |
| --- | --- | --- | --- |
| Host `swift test -j 2` | 85 passed, 0 failed | 19:36:00 | 3.119 s tests |
| Assigned iOS 27 simulator, both required gates | 85 passed, 0 failed; TEST SUCCEEDED | 19:34:08 | 3.474 s tests; 23 s build/test command |
| Release generic iOS compile, required build gate, signing disabled | BUILD SUCCEEDED; no device launch | 19:36:29 | 10 s |
| Worker fixture drift check | Passed | Before tests | — |

Both test audits measured input opens=0, output opens=0 and permitted hosts only `127.0.0.1`. The redirect destination accepted zero connections. There were no Swift compiler warnings; the simulator build emitted one skipped AppIntents metadata-extraction warning. Final heavy runs started below load5=100. The simulator was shut down by the EXIT trap and confirmed shut down; the Mac remained muted. Lane build intermediates/caches are pruned, with products and private result bundles retained.

## Expo wrapper lane: separate modules

Keep **OpaxVoiceCore as its own module**. The Expo pod depends on it and uses `import OpaxVoiceCore`; it must never compile core sources into the wrapper module. Internal token access, storage serialization, header decoration, raw session and relay-request creation remain unavailable to the wrapper.

For a separate local core podspec located in `ios/OpaxVoiceCore/`, the relevant settings are relative to that directory:

```ruby
s.name = 'OpaxVoiceCore'
s.module_name = 'OpaxVoiceCore'
s.source_files = 'Sources/OpaxVoiceCore/**/*.swift'
s.ios.deployment_target = '18.4'
s.swift_version = '6.0'
s.pod_target_xcconfig = {
  'DEFINES_MODULE' => 'YES',
  'SWIFT_STRICT_CONCURRENCY' => 'complete',
  'SWIFT_DEFAULT_ACTOR_ISOLATION' => 'nonisolated'
}
s.frameworks = 'AVFAudio', 'Security', 'UIKit'
```

This narrow glob excludes Package.swift, Tests, `.build` and `.swiftpm`. Sources do not require Network.framework; only the test server does. The later lane supplies the remaining podspec metadata and local Podfile dependency, pointing to this core directory. Alternatively, integrate the Swift package as its own target; choose one integration and never compile two copies.

The Expo wrapper podspec lives in `ios/`, so its own files use a glob relative to **ios**, for example `*.{h,m,mm,swift}` when wrapper files are directly there. It declares `s.dependency 'OpaxVoiceCore'` and `ExpoModulesCore`; it does not use `ios/**/*.swift` or recursively include the core. Apply Swift 6/complete concurrency/nonisolated default **only to the core target**. Keep the wrapper in Expo's supported Swift language mode; do not force all Expo dependencies to Swift 6.

Construct one controller, one event consumer and one native engine/socket. Use the same RoutePolicy for KeychainCredentialStore, authenticated session and relay factory. Expose status using `bridgeValue`, plus sanitized community/challenge/sign-in results; never forward SessionCredential, Reservation, raw requests/errors, transports or audio. Forward only VoiceEvent state, mode, playback, transcript, validated sources, time, sanitized status and enum errors. Display a clear notice on `.playback(.truncated)`. Expose controller requestDeletionCode/deleteAccount with only their challenge/boolean results, collect the fresh deletion code, and clear app-owned account caches on success or confirmed sign-out. Call shutdown on module destruction. Consent UI/storage belongs to the wrapper; withdrawing consent also ends the call.

Add NSMicrophoneUsageDescription through app configuration only after the voice UI ships its consent flow; this lane omits it and denies production consent/permission. Do not add UIBackgroundModes; use native builds rather than Expo Go. The compiled e2e simulator fixture selects synthetic audio, fake permission/session, native in-memory credentials and guarded loopback transports. Production has no fixture entry points or origins. The native policy is pinned to the production origin; Jake's manual staging build needs a separately reviewed origin policy and separate Keychain namespace, never a JS-supplied origin.

## Remaining integration checks

W5 deletion is implemented from the fetched Worker source. W1/W2 code routes and W8 budget signals are approved client contracts tested with fixtures, not deployed by this lane. The assigned simulator proves DEBUG cleartext loopback; TLS-loopback header checks on other supported OS versions and a physical device, plus real Keychain persistence across relaunch, remain later integration gates. There is no TLS trust bypass.

Jake alone checks echo cancellation on physical hardware, Siri/calls/alarms, Bluetooth/wired/car routes and format changes, permission/consent ordering, background/lock behaviour, network loss, energy/data, real microphone and real staging calls. Provider retention/recording and audio format settings need release verification. None is automated here. Provider alignment remains an unused optional extension.

## Contract implementation map

| Contract point | Implementation |
| --- | --- |
| Swift 6, iOS 18.4, separate package | [Package.swift:3](ios/OpaxVoiceCore/Package.swift#L3) |
| Nullable Worker status, unknown open states, disabled priority, ID-free bridge status | [Models.swift:39](ios/OpaxVoiceCore/Sources/OpaxVoiceCore/Models.swift#L39) |
| Opaque credential and storage DTO | [Credentials.swift:5](ios/OpaxVoiceCore/Sources/OpaxVoiceCore/Credentials.swift#L5) |
| Origin-scoped Keychain and atomic compare-and-clear | [Credentials.swift:29](ios/OpaxVoiceCore/Sources/OpaxVoiceCore/Credentials.swift#L29) |
| Ten exact routes/methods and scoped Cookie/Origin | [HTTPClient.swift:3](ios/OpaxVoiceCore/Sources/OpaxVoiceCore/HTTPClient.swift#L3) |
| Request snapshot, fresh 403 classification, code exchange and logout | [HTTPClient.swift:97](ios/OpaxVoiceCore/Sources/OpaxVoiceCore/HTTPClient.swift#L97) |
| Malformed start cleanup and no device-clock reservation veto | [HTTPClient.swift:222](ios/OpaxVoiceCore/Sources/OpaxVoiceCore/HTTPClient.swift#L222) |
| Cookie-free session and redirect refusal | [HTTPClient.swift:319](ios/OpaxVoiceCore/Sources/OpaxVoiceCore/HTTPClient.swift#L319) |
| convai WebSocket, first initiation, all messages/events, close codes | [Relay.swift:15](ios/OpaxVoiceCore/Sources/OpaxVoiceCore/Relay.swift#L15) |
| PCM/ulaw, all rates, exact fractional cadence, queues and converter | [AudioPipeline.swift:4](ios/OpaxVoiceCore/Sources/OpaxVoiceCore/AudioPipeline.swift#L4) |
| Event-driven tap and one voice-processing engine | [AppleAudio.swift:9](ios/OpaxVoiceCore/Sources/OpaxVoiceCore/AppleAudio.swift#L9) |
| Playback completion capacity and epoch-protected flush | [AppleAudio.swift:111](ios/OpaxVoiceCore/Sources/OpaxVoiceCore/AppleAudio.swift#L111) |
| All states, cancellation, lifecycle and typed public errors | [CallController.swift:11](ios/OpaxVoiceCore/Sources/OpaxVoiceCore/CallController.swift#L11) |
| Continuous socket reads, immediate controls and close classification | [CallController.swift:179](ios/OpaxVoiceCore/Sources/OpaxVoiceCore/CallController.swift#L179) |
| Bounded playback backlog, independent drain and truncation event | [CallController.swift:249](ios/OpaxVoiceCore/Sources/OpaxVoiceCore/CallController.swift#L249) |
| Fresh status after finish/end/failure | [CallController.swift:404](ios/OpaxVoiceCore/Sources/OpaxVoiceCore/CallController.swift#L404) |
| Expiry-aware polling with backoff/interval/attempt caps | [CallController.swift:449](ios/OpaxVoiceCore/Sources/OpaxVoiceCore/CallController.swift#L449) |
| Capped transcript/corrections and source allow-list | [Evidence.swift:3](ios/OpaxVoiceCore/Sources/OpaxVoiceCore/Evidence.swift#L3) |
| DEBUG synthetic input and silent timed output | [DebugSyntheticAudio.swift:11](ios/OpaxVoiceCore/Sources/OpaxVoiceCore/DebugSyntheticAudio.swift#L11) |
| Test-wide guard, attempted I/O/host audit and dirty self-test scopes | [RuntimeSafety.swift:5](ios/OpaxVoiceCore/Sources/OpaxVoiceCore/RuntimeSafety.swift#L5) |
| Real loopback WebSocket fixture and required refusal/drop rows | [LoopbackRelay.swift:7](ios/OpaxVoiceCore/Tests/OpaxVoiceCoreTests/LoopbackRelay.swift#L7) |
| Real loopback HTTP/WebSocket redirect proof | [RedirectTests.swift:65](ios/OpaxVoiceCore/Tests/OpaxVoiceCoreTests/RedirectTests.swift#L65) |
| Review regressions | [ReviewRegressionTests.swift:5](ios/OpaxVoiceCore/Tests/OpaxVoiceCoreTests/ReviewRegressionTests.swift#L5) |
| Deep playback, interruption/pong/deadline/overflow real-socket regressions | [ContinuousReadTests.swift:5](ios/OpaxVoiceCore/Tests/OpaxVoiceCoreTests/ContinuousReadTests.swift#L5) |
| Disabled-member credential confirmation | [HTTPClient.swift:162](ios/OpaxVoiceCore/Sources/OpaxVoiceCore/HTTPClient.swift#L162) |
| Fresh-status classification of abnormal 1006 | [CallController.swift:432](ios/OpaxVoiceCore/Sources/OpaxVoiceCore/CallController.swift#L432) |
| Deterministic loopback close/write ordering | [OrderedTerminationRelay.swift:4](ios/OpaxVoiceCore/Tests/OpaxVoiceCoreTests/OrderedTerminationRelay.swift#L4) |
| W5 deletion requests, typed responses and credential clearing | [HTTPClient.swift:184](ios/OpaxVoiceCore/Sources/OpaxVoiceCore/HTTPClient.swift#L184) |
| W5 controller call cleanup and bridge-safe results | [CallController.swift:375](ios/OpaxVoiceCore/Sources/OpaxVoiceCore/CallController.swift#L375) |
| Worker-derived deletion responses, disabled members and credential races | [AccountDeletionTests.swift:13](ios/OpaxVoiceCore/Tests/OpaxVoiceCoreTests/AccountDeletionTests.swift#L13) |
| Actual Worker deletion/community-status fixture generation | [generate-deletion-fixtures.mjs:10](scripts/generate-deletion-fixtures.mjs#L10) |
| Cached, broadcast close signal and terminal delegate callbacks | [HTTPClient.swift:262](ios/OpaxVoiceCore/Sources/OpaxVoiceCore/HTTPClient.swift#L262) |
