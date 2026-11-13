# Android checks for the PostHog crash plugin

The Mac never builds Android, so these run on the desktop the first time
`build-play.sh` builds a branch with `@posthog/react-native-plugin` 2.13.0
(`docs/ANALYTICS.md`, "Crash and error reports"). Android sends nothing yet:
its builds carry no analytics config, so the plugin never starts.

1. **Patch replay.** `npm ci` prints the privacy-patch PASS line ending
   "PostHog plugin 2.13.0", and `expo prebuild --platform android` replays it
   again before Gradle runs.
2. **Kotlin compiles.** The patched
   `node_modules/@posthog/react-native-plugin/android/src/main/java/com/posthogreactnativeplugin/PosthogReactNativePluginModule.kt`
   has never been compiled. Watch `opaxScrubNativeEvent` and its
   `event.copy(properties = clean, set = null)` call against posthog-android
   3.74.2. A compile error there fails `:app:bundleRelease`.
3. **Play verifier.** `verify-play.py` passes on the new AAB: `com/posthog`
   classes are now allowed, the permissions stay within the allowlist
   (posthog-android adds only `INTERNET` and `ACCESS_NETWORK_STATE`), the ABIs
   and 16 KB alignment are unchanged (NDK crashes use a tombstone scanner, no
   `.so`), and no `.map` ships in the AAB. The composed Hermes map is in
   `android/app/build/generated/sourcemaps/react/release/index.android.bundle.map`.
