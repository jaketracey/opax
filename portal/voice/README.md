# Opax voice browser client

`node voice/build.mjs` (from `portal/`) builds the small `/voice.js` module,
lazy ElevenLabs SDK chunks, and content-addressed self-hosted audio worklets.
The page needs `/voice.css` and `<script type="module" src="/voice.js">`, with
the normal Opax asset stamping. The module mounts itself once.

Opening the panel only fetches `/api/voice/status`. Only **Start talking** loads
the SDK, primes playback, creates a reservation and requests the microphone.
No transcript, signed URL, account identifier or audio is persisted in browser
storage or emitted to analytics. Transcript DOM uses text nodes and allows only
same-origin published Opax record links.

The backend owns the ten-minute lifetime allowance and session reconciliation.
The browser timer is a display and extra stop guard, never billing authority.
`start.expires_at` is a short reservation expiry, not the live call's deadline.

## ElevenLabs 1.25.0 compatibility

The build uses guarded exact replacements for four upstream implementation
gaps. A changed upstream match fails the build and requires review:

- Pass an attempt-specific `AbortSignal` through capture and WebSocket setup.
  Capture calls use the local guard instead of replacing any browser API. A
  cancelled pending permission request stops its eventual stream immediately.
- Close successful input/output setup when its parallel counterpart fails.
- Pass the self-hosted resampler path to the output setup as well as input.
- Replace automatic document-wide iOS audio priming with explicit start-button
  priming. Closing or navigating away closes that context.

The public SDK's `Conversation.startSession`, callbacks, `setMicMuted` and
`endSession` still own the conversation. No provider protocol or authentication
logic is replaced. The backend supplies a same-origin proxied WebSocket URL.

`script-src 'self' 'wasm-unsafe-eval'`, `worker-src 'self'`, microphone permission
for self, and explicit same-origin WSS hosts are sufficient. `blob:`, `data:`,
`unsafe-eval`, external SDK scripts and external audio worklet hosts are not
needed. The resampler embeds its Wasm and is loaded only when browser sample
rates require it.

## Browser verification

After a build, run `node voice/check.mjs`. Set `OPAX_PLAYWRIGHT_MODULE` to an
installed Playwright module if it is not on the normal import path. The check
starts and stops its own local static server and uses synthetic API responses,
microphone streams and sockets. It never calls a paid provider or real account.

It covers Chromium and WebKit at 320, 390, 768 and 1440 pixels (667-pixel mobile
height), opening focus and Escape, lazy loading, signed-out/disabled/exhausted
states, transcripts and safe source links, mute/end, reservation and connection
cancellation, denied permission, navigation/background/offline teardown and
allowance exhaustion. It also runs the actual bundled SDK with self-hosted Wasm
worklets under the required CSP, including delayed mic permission, delayed
socket metadata, partial audio setup failure and immediate track release.

### Staging browser verification, 9 September 2026

The shipped client was exercised against staging deployment `015601b1` in
Chromium at 390 × 667, using a separate synthetic account and synthetic
microphone. The real provider returned conversation metadata, its greeting
transcript and two audio events; the browser audio element was actively
playing. Start returned 201. End stopped both microphone tracks, removed the
audio element and closed the socket. Finish and the following status request
returned 200 with no active session. The synthetic account's remaining
allowance reconciled from 90 to 88 seconds. There were no CSP violations or
uncaught browser errors. The browser context was fully closed before account
cleanup. No email was sent.
