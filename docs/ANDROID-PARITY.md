# Android parity

Lane 2 starts from `97cc638b` on `origin/ios/app`. It changes Android reading
and navigation presentation; iOS keeps its released copy, navigation, text
height correction, reader batching and native configuration.

- Android-readable `iPhone` copy goes through `phoneCopy`. The source guard
  checks JSX, literals and templates; a rendered offline state checks the
  platform substitution. Voice and account UI remain outside Android discovery.
- Catalogs send `OPAX-Android/<version> (<build>)` on Android. Transport origins,
  credentials, redirects and route policy are unchanged.
- Money focus uses Android's native modal, exposing Done. Android form sheets
  do not render native headers. iOS retains `formSheet` and its detents.
- Account, Sources, Sources & coverage and the expense glossary use measured,
  wrapping Android headers. An information action stays beside its section title when it is the only trailing action;
  sections with longer actions retain their clean stacked layout.
- Cold profiles reserve a blank 96 dp portrait circle. Existing loaded-image
  and failure fallbacks remain blank circles, with no initials.
- Android skips the iOS TextKit height floor and its per-text layout feedback.
  Reader batches start with one part, then two; source slices target 600
  characters at sentence/newline boundaries. All source bytes remain readable.
  iOS keeps its 1,200-character slices and four-part batches.
- New report/public-money Share headers use the platform helper. Android tabs
  have explicit tab roles, selected state and readable names. Header actions,
  choice chips and notes retain labels and roles. Accessibility is reviewed
  through UiAutomator without speech.

The ignored evidence index is `mobile/private/qa/android-parity/index.md`. It
records the exact APK/source provenance, gate results, performance samples,
screen pairs and system Back checks. No private evidence or signing material is
committed.

## Verification

`npm ci` and `npm run qa` passed: 125 suites / 3,814 tests, typecheck,
lint and policy checks. One arm64 Android e2e native build passed. Font-1
Today, Your MP and bill/native-reader journeys passed; font-2 captures review
all changed screens. Late JS exports reuse that one native shell; the private
index identifies the exact APK used by each check.

The iOS static release checks passed. All non-Android configuration matches
`97cc638b` in development, e2e and production; platform regression tests and a
branch review preserve iOS copy, text-height guard, reader batches and navigation.
No iOS device was booted for this lane.

UiAutomator review covers Today, Your MP and bill reading order, tab/header/chip
labels and roles. All 86 captured note hierarchies expose Done and exclude the
underlying tabs. Hardware and edge-gesture Back passed for those notes, Money
focus, the expense glossary and parent/nested filters. Four gesture-cancel checks
passed. Three local Share checks validate canonical URLs; recipient apps remain
outside this lane. No TalkBack audio was used.

Two ordered before/after pairs used the same headless API 36 AVD and local
fixtures. Times include ADB/UiAutomator observation overhead; interaction opens
Account from a loaded Today edition. The index retains every sample and the
earlier slower, host-contended run.

| Metric | Before median | After median | Sample size per side |
| --- | --- | --- | --- |
| Empty-cache proven Today interaction | 8,889 ms | 7,950.5 ms | 2 |
| Saved-cache proven Today interaction | 6,032 ms | 6,077 ms | 4 |
| Reader header ready | 4,533.5 ms | 4,554.5 ms | 2 |
| Reader frame p95 during source scrolling | 22 ms | 19 ms | 2 |
| Reader janky frames | 0.76% | 0.51% | 2 |

Saved-cache startup and reader readiness are essentially unchanged. The small
fixture sample does not establish a production startup improvement or isolate
the contribution of either layout change. Production-network and physical-device
measurements remain separate work.

## Adaptive icon and distribution

The Australia paths are unchanged. Android uses a gold foreground, navy
background and white monochrome mask, inset within the 66/108 adaptive safe
zone. Expo generates foreground/background/monochrome resources at each density.
The iOS light, dark and tinted icons are unchanged. See the
[Android adaptive icon requirements](https://developer.android.com/develop/ui/compose/system/icon_design_adaptive).

| Distribution item | Status |
| --- | --- |
| arm64-v8a | Local e2e APK measured at 58,075,131 bytes (55.38 MiB), min API 24 / target API 36. Contains fixtures and diagnostic routes; this is not a store download-size estimate. |
| armeabi-v7a and x86_64 | Unbuilt and unmeasured. Select and validate supported ABIs before distribution; the local harness intentionally builds arm64 only. |
| Release AAB and per-device size | Deferred to the distribution lane; measure bundle splits after choosing ABIs. |
| Play signing and publication | Deferred; local builds use the generated Android debug key. |

## Remaining boundaries

No voice, account sync, physical-device, OEM/GPU, API 34 or store work is included.
There is no API 34-specific fix in this lane, so no second AVD pass is required.

React Native's Android `Modal` handles the system Back callback, but does not
forward predictive gesture progress into a destination-page preview animation.
The evidence distinguishes gesture commit/cancel behavior from that animation;
adding an animated preview requires a separate native presentation change.
See [Android predictive Back guidance](https://developer.android.com/guide/navigation/custom-back/predictive-back-gesture).

Verified App Links need an owned-domain change: serve
`https://opax.com.au/.well-known/assetlinks.json` over HTTPS without redirects,
with `delegate_permission/common.handle_all_urls`, package `au.com.opax.app` and
the SHA-256 fingerprint of the intended distribution certificate. Add matching
HTTPS intent filters with `autoVerify`, choose supported route paths, then verify
Android domain state and real link traversal. The local debug certificate must
not be substituted for a future distribution certificate. Custom `opax://` links
continue to work. See [Android website association requirements](https://developer.android.com/training/app-links/configure-assetlinks).
