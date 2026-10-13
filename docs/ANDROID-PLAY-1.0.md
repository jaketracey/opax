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
