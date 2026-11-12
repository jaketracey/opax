# Android Talk and Account contract audit

Audited against `src/voice/{index,mapping,types}.ts`, Talk's `bridge.ts`,
`useTalk.ts`, `live.ts`, and the iOS call lifecycle in the Android 1.1 redesign.

| Surface              | Android result                                                                                                                                                                                                 |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Native methods       | All 17 methods in `NativeVoice` are registered, including consent, text input, background and evidence disposal.                                                                                               |
| Results              | Commands acknowledge with `{ok:true,value:null}`. Status, code challenges and deletion use the current TypeScript shapes. Refusals use the closed error enum; native exception prose never crosses the bridge. |
| Call events          | State/reason, mode, playback, remaining time, transcript, sources, error and nullable status all match the decoder. Snapshot uses the same projections.                                                        |
| Orb levels           | Separate `onVoiceLevel` stream; finite, clamped, rounded input/output in 0–1. Muting hides input; playback levels follow the play head.                                                                        |
| Captions and sources | Corrections replace turns; sources remain validated public record paths (now including Ask pay rows on /ask). Tool sources carry record title, speaker, date and type when the server sends them; title-only sources still decode, and the UI says when a date is unavailable. |
| Lifecycle            | A true background ends the call. A permission dialog only pauses the activity. Headset configuration changes reconfigure audio. Focus loss ends rather than resumes a call, matching iOS.                      |
| Idle connections     | The four-second reuse limit from `05a344516` is already present. A failed reused GET has one bounded retry; POST/reservations and relay connections are never replayed.                                        |
| Account              | Shared authenticated client, origin-scoped credentials, held-account status, deletion proof, sign-out and local credential clearing match the current UI.                                                      |

No bridge method, event, enum or payload mismatch was found. Audio focus:
`AUDIOFOCUS_LOSS` and `AUDIOFOCUS_LOSS_TRANSIENT` (a phone call, an alarm, another
voice app) end the call as an iOS interruption does.
`AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK` (a notification sound, a navigation prompt)
leaves the call running: an iOS voice chat session is not interrupted by these
either, and ending a call on every notification would be wrong. The system never
ducks speech output, so the prompt briefly mixes with the answer.

Related Android UI defects fixed in this package:

- The resting orb could remain blank before its first animation frame. Android
  now warms the frame loop when the surface receives a size, then stops it after
  settling. Its resting core also has a plain radius and opacity in the initial
  display list, so it does not wait for animated values. iOS keeps its existing
  resting-frame policy.
- Talk's system Back listener belonged to its mount, so it could intercept Back
  beneath Sources or a record. It now belongs to Talk's focus. Navigation removal
  also uses the call's leave confirmation, covering the custom bar's Back arrow.
- On return to the app, a revoked microphone grant did not end a still-active
  JS call. It now ends before snapshot recovery and exposes the denial without
  asking again or automatically restarting.
- Withdrawing consent could leave the microphone rationale open. Withdrawal now
  closes it, and its permission action checks consent again before any request.
- Deletion hid the bar's back affordance but did not prevent route removal.
  Android now prevents removal while the confirmed deletion request is pending.
- Sign-in and deletion supplied iOS's `one-time-code` autocomplete value, which
  React Native's Android text input does not map. Android now supplies its
  `email-otp` autofill hint for these emailed codes; iOS keeps its original hint.
- Returning from Agree started the Android call during its focus status read,
  so Kotlin correctly refused it with `statusChecking`. Android now awaits that
  read before dispatching the explicit consent-start action.

The TypeScript cross-language contract tests run in `npm run qa`; the native
projection, HTTP, call and audio tests run with `:opax-voice:testDebugUnitTest`.
All transports in tests and e2e calls use local fixtures and synthetic input.
The development shell's native account client retains its production origin;
Talk/Account fixture journeys therefore need an e2e native build compiled for
the lane's fixture port, even when other screens use development Metro.

## Physical-device verification

Emulators cannot establish microphone quality, echo cancellation, speaker
latency, Bluetooth HFP/LE routing, wired/USB hot-plug behaviour, OEM alarm and
telephone interruptions, restoration of a real media player's audio, or delivery
and autofill of a real emailed code. Verify those on a phone before release.
