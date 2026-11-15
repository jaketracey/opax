# Android Play 1.0 local candidate

This lane starts at iOS 1.0.0 build 34, `b7f2fd501`, on `android/play-1.0`. Android prep `1422df6e8` is already an ancestor, so merging `android/play-prep` is a no-op. It retains the API 34 Back/navigation correction and Play signing/build tooling, plus the 1.0 donor withholding, Machine-written pill and large-text figure-strip fix. No push, Play upload, account creation, tester contact or production action is part of this lane.

## Release parity gate

The base was not voice-equivalent on Android. The JS and config exclusions are gone on `android/parity-ui`:
- `app.config.ts` applies the production voice switch to Android and blocks `RECORD_AUDIO` only where iOS has no purpose string;
- Metro bundles the Talk, sign-in and deletion routes;
- one runtime switch, `voiceLinked` (`mobile/src/voice/linked.ts`), offers them when the Android OpaxVoice module is linked.

The native module is the parity lanes 1 and 2 (`android/voice-account`, `android/voice-call`), integrated with the screens on `android/parity`. Without it, the app keeps the null-module fallback: no Talk, and Account and about is the list of rows. The voice-off release (`OPAX_PRODUCTION_VOICE=0`) bundles on both platforms: Android leaves the module out and shows that list, iOS keeps its placeholder, and Ask reads a no-account store (`store.production.ts`).

Both verifiers follow the production voice switch: a voice build must declare `RECORD_AUDIO` and `MODIFY_AUDIO_SETTINGS` (the call's communication mode and routing), and a voice-off build neither. `verify-play.py --require-ios-parity` writes artifact-integrity results and a separate parity result, and fails without voice, the microphone, the consent default or the routes, so a signed, valid bundle cannot be described as a voice-enabled 1.0 release. Candidate versionCode 2026101201 passes it.

Talk's Android permission journeys run on an e2e build made with `OPAX_E2E_MICROPHONE=1`: it declares `RECORD_AUDIO` alone and asks as production does, while its input stays synthetic. `verify-android-build.py e2e` accepts that permission only with the build's `e2eMicrophonePrompt` flag.

The Android tablet viewport is supported, but the iOS split-pane behavior is iPad-only (`isPad` in adaptive.tsx). Review actual Android tablet captures before making split-pane claims.

## Local kit

`mobile/private/play/` is gitignored; `1.0/` is the 11 October reading-only kit and `2026101201/` the parity candidate. Each holds the signed candidate, exact hashes and packaged manifests, QA logs, fixture screenshots and hierarchies, a screenshot manifest, listing JSON/text and the Data safety draft/diff. Private evidence and signing material must never enter this public repository.

The listing and Data safety text are in [ANDROID-STORE.md](ANDROID-STORE.md): the iOS 1.0 parity listing without the iPad-only tablet paragraph, and the seven iOS types. The reading-plus-Ask alternative is superseded. Do not submit either until the candidate links the Android voice module (the checks listed there).

The Data safety source is `release/store-1.0:release/1.0/app-privacy.json` and `mobile/voice-production-policy.json`: email address, user ID, audio, other user content, product interaction, search history and other diagnostic data. All seven are linked, not used for tracking, and used for app functionality only. Location remains on-device only. Play has different field names and no Apple-style linked-to-user checkbox; the draft maps the seven types explicitly. Collection/sharing, optional/required, encryption and deletion answers must match the final binary and provider evidence. The seven-type declaration is accurate only for a candidate that links the Android voice module; [ANDROID-STORE.md](ANDROID-STORE.md) has the final table.

## Crash symbols

`mobile/scripts/build-play.sh` keeps each build's crash symbols in its evidence folder, `mobile/private/play/<versionCode>/`: `android.chunk-id`, the composed Hermes map `index.android.bundle.map` and R8's `mapping.txt` (docs/ANALYTICS.md, "Symbols"). It uploads them to PostHog only when the run sets `OPAX_UPLOAD_SYMBOLS=1`. The default, `0`, uploads nothing, even where the key file and `posthog-cli` exist, and prints one line with the command that uploads them later; any other value stops the build before it starts. Scratch, QA and candidate builds leave it unset. Only the release run, the one whose AAB goes to Play, sets it:

```sh
cd mobile
OPAX_ANDROID_VERSION_CODE=<versionCode> OPAX_UPLOAD_SYMBOLS=1 \
  scripts/build-play.sh --expected-commit <full SHA> --expected-voice-mode <0|1>
```

The upload runs after the AAB and its evidence are written and is stopped after `OPAX_SYMBOL_UPLOAD_TIMEOUT` seconds (600 by default; TERM, so the upload script removes its staged map, then KILL 10 seconds later), so a hung `posthog-cli` cannot hold the desktop native lock. A failed, skipped or stopped upload never fails the build: `crash-symbols.log` in the evidence folder says which, and the build log prints the command to rerun from `mobile/`:

```sh
scripts/upload-crash-symbols.sh android <versionName> <versionCode> private/play/<versionCode> private/play/<versionCode>/mapping.txt
```

The upload script loads its own key file. `build-play.sh` takes the switch and the timeout from the caller only, and unsets every `POSTHOG_*` variable before its first step and again after each helper it sources, so a line in the ignored `mobile/.qa.local.env` can neither turn the upload on nor bring a key back.

### b71 pre-submit checks

Run both on the desktop for the b71 versionCode, after `build-play.sh` and `verify-play.py`, before its AAB goes to Play, and keep their output in its evidence folder.

1. **The Kotlin scrub on the JVM.** `OPAX_REQUIRE_KOTLIN_SCRUB=1` makes the test fail, not skip, where Java 17 or the cached Kotlin compiler is missing:

   ```sh
   cd mobile
   VC=<b71 versionCode>
   JAVA_HOME=$HOME/opax-work/jdk/jdk-21.0.13+9 OPAX_REQUIRE_KOTLIN_SCRUB=1 \
     ./node_modules/.bin/jest --verbose --runTestsByPath tests/native-scrub-kotlin.test.ts \
     > private/play/$VC/kotlin-scrub-jest.txt 2>&1; echo "exit $?"
   ```

   It passes on `exit 0` with `2 passed, 2 total` in `kotlin-scrub-jest.txt`. It runs on `java.util.regex`, not Android's ICU-based regex, so it does not replace step 2.
2. **The rules load on Android (logcat).** The commands in `mobile/docs/android-crash-plugin-checks.md`, item 4, on the emulator with the network off; they write `plugin-rules-logcat.txt` to the same folder.

## Play Console sequence after account creation

1. Complete Organization verification for Noice Pty Ltd: matching legal entity/address and D-U-N-S details, organization website and phone, authorized contact and verified public developer contacts. Account registration has a US$25 one-time fee. Keep the upload key and its credentials backed up privately. [Account setup](https://support.google.com/googleplay/android-developer/answer/6112435), [organization information](https://support.google.com/googleplay/android-developer/answer/13628312).
2. Resolve the Android feature/privacy/listing discrepancy, finish the required gates and approve the exact candidate SHA-256. Either implement and verify Android voice/account parity or explicitly approve a reading/Ask release with truthful Android copy and Data safety answers. Do not upload this parity-blocked candidate as a voice-enabled release.
3. Create OPAX as a free app with default language English (Australia), accept the app declarations, and confirm `au.com.opax.app`. Package names are permanent. Select the final category, audience and countries deliberately. [App setup](https://support.google.com/googleplay/android-developer/answer/9859152).
4. Fill the main store listing with verified Android copy, icon, feature graphic and actual phone/tablet screenshots. Name/short/full limits are 30/80/4,000 characters. Use the support and privacy URLs above, and verify public support contacts. [Preview assets](https://support.google.com/googleplay/android-developer/answer/9866151).
5. Complete App content: privacy policy, accurate Data safety, ads = No, app access, IARC content rating, target audience and any government-information declarations shown. OPAX is independent and not affiliated with government. If Talk is added, provide working access instructions and whatever review account/access Google requires; do not assume the iOS email-code review approach suffices. Internal-only apps are exempt from the public Data safety section, but the draft must still be correct for subsequent tracks. [Data safety](https://support.google.com/googleplay/android-developer/answer/10787469).
6. Create an Internal testing release, enroll in Google-managed Play App Signing, and upload the approved AAB. Check the displayed versionCode, package and permissions. The local APK uses the upload certificate; Play-delivered APKs use the Play app-signing certificate. Record both certificate roles correctly and review all Console warnings. [Internal testing](https://support.google.com/googleplay/android-developer/answer/9845334).
7. Add consenting tester Google accounts manually, publish the internal release, and provide the opt-in link. No tester has been contacted by this lane. Install this exact Play-delivered candidate on the physical Pixel and run the release journeys; the older Pixel success does not verify this candidate. Review pre-launch/device reports and fix failures before promotion.
8. Finish every dashboard requirement and request production review for the approved territories. Review and deliberately start the production rollout only after approval. The closed-test rule for new personal accounts is separate from the Organization account selected here; follow any actual account-specific Console requirements. [Publishing setup](https://support.google.com/googleplay/android-developer/answer/9859152).

Official documentation checked 11 October 2026. The Console itself remains the final source for account-specific requirements; this lane has taken no Console action.
