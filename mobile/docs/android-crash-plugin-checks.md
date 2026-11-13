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
   compiled on the desktop at e67abf027; round 3 rewrote its scrub rules and
   added `preloadFeatureFlags = false` and `setDefaultPersonProperties = false`
   to the SDK setup, and round 4 changed the rule texts again. Watch `opaxScrubNativeEvent`, its
   `event.copy(properties = clean, set = null)` call and the two config
   properties against posthog-android 3.74.2 (core 6.47.8). A compile error
   there fails `:app:bundleRelease`.
3. **Play verifier.** `verify-play.py` passes on the new AAB: `com/posthog`
   classes are now allowed, the permissions stay within the allowlist
   (posthog-android adds only `INTERNET` and `ACCESS_NETWORK_STATE`), the ABIs
   and 16 KB alignment are unchanged (NDK crashes use a tombstone scanner, no
   `.so`), and no `.map` ships in the AAB. The composed Hermes map is in
   `android/app/build/generated/sourcemaps/react/release/index.android.bundle.map`.
4. **The rules load on Android.** Android's `java.util.regex` runs on ICU,
   which rejects Java's `(?U)` flag (NSRegularExpression, also ICU, refuses
   it on the Mac). Until round 3 every Kotlin rule began with `(?U)`, so the
   file's class would have failed to load the first time the plugin started,
   taking native setup with it. The rules now use the Swift copy's pattern
   texts, which `scripts/check-native-scrub.sh` runs on ICU. The first time an
   Android build carries analytics, check logcat for a `PatternSyntaxException`
   or `ExceptionInInitializerError` from `PosthogReactNativePluginModuleKt`.
