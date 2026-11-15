# Android checks for the PostHog crash plugin

The Mac never builds Android, so these run on the desktop when
`build-play.sh` builds a branch with `@posthog/react-native-plugin` 2.13.0
(`docs/ANALYTICS.md`, "Crash and error reports"). From b71 every Android
production build carries the analytics config, so the app starts the client
and the plugin's native setup at launch; e2e and development builds carry none
and never start it.

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
   `.so`), and no `.map` an APK would install is in the AAB. R8's
   `BUNDLE-METADATA/com.android.tools.build.obfuscation/proguard.map` is Play
   metadata and passes (the round 2 check refused it, which would have failed
   every production AAB). The composed Hermes map is in
   `android/app/build/generated/sourcemaps/react/release/index.android.bundle.map`.
4. **b71 pre-submit: the rules load on Android (logcat).** Android's
   `java.util.regex` runs on ICU, which rejects Java's `(?U)` flag
   (NSRegularExpression, also ICU, refuses it on the Mac). Until round 3 every
   Kotlin rule began with `(?U)`, so the file's class would have failed to load
   the first time the plugin started, taking native setup with it. The rules
   now use the Swift copy's pattern texts, which `scripts/check-native-scrub.sh`
   runs on ICU. Native setup calls the file's top-level helpers
   (`applyErrorTrackingConfig` and others), so the class's static initialiser,
   rules included, runs at launch. A pattern ICU refuses shows in logcat as a
   `PatternSyntaxException` or `ExceptionInInitializerError` from
   `PosthogReactNativePluginModuleKt`, or as the plugin's own
   `Method setup, error:` line, which it logs even with debug off.

   Run it on the b71 production AAB before b71 goes to Play, on the desktop,
   after `verify-play.py` has written the AAB's universal APK. One emulator at a
   time: start only if `adb devices` lists no other emulator. The network goes
   off before the app is installed, and the app (with any events it queued) is
   uninstalled before the network comes back, so nothing reaches PostHog or
   `opax.com.au/ingest`. `-read-only` keeps the AVD itself unchanged.

   ```sh
   cd ~/opax-work/wt/<worktree>/mobile
   export ANDROID_HOME=$HOME/Android/Sdk ANDROID_AVD_HOME=$HOME/.config/.android/avd
   export PATH=$ANDROID_HOME/emulator:$ANDROID_HOME/platform-tools:$PATH
   VC=<b71 versionCode>; S=emulator-5610; LOG=private/play/$VC/plugin-rules-logcat.txt
   adb devices
   emulator -avd OPAX_Pixel_API36 -port 5610 -read-only -no-snapshot -no-audio -no-boot-anim \
     -no-window -gpu swiftshader_indirect -feature -WiFiPacketStream \
     > /tmp/opax-b71-rules-emulator.log 2>&1 & EMU=$!
   adb -s $S wait-for-device
   until [ "$(adb -s $S shell getprop sys.boot_completed | tr -d '\r')" = 1 ]; do sleep 2; done
   # Network off, then the guard: nothing is installed unless Android reports
   # no default network at all (an empty or unexpected answer also stops it).
   adb -s $S shell svc wifi disable
   adb -s $S shell svc data disable
   adb -s $S shell cmd connectivity airplane-mode enable
   sleep 5
   NET=$(adb -s $S shell dumpsys connectivity | sed -n 's/^ *Active default network: *//p' | tr -d '\r' | head -n 1)
   if [ "$NET" = none ]; then
     adb -s $S install private/play/$VC/opax-from-aab.apk
     adb -s $S logcat -c
     adb -s $S shell am start -W -n au.com.opax.app/.MainActivity   # Status: ok
     sleep 30
     adb -s $S shell pidof au.com.opax.app                           # a PID: still running
     adb -s $S logcat -d > "$LOG"
     grep -E 'PatternSyntaxException|ExceptionInInitializerError|NoClassDefFoundError|Method setup, error|FATAL EXCEPTION' "$LOG"
     # Before anything turns the network back on:
     adb -s $S uninstall au.com.opax.app
   else
     echo "STOP: the emulator still reports a network (${NET:-no answer}); nothing was installed."
   fi
   adb -s $S emu kill; wait $EMU
   ```

   It passes when no `STOP` line is printed, `am start` reports
   `Status: ok`, `pidof` prints a PID after 30 seconds and the `grep` prints
   nothing. Keep `plugin-rules-logcat.txt` in the evidence folder. After a
   `STOP`, find out why the network stayed on before trying again.

5. **The Kotlin scrub matches the JS rules (JVM).**
   `tests/native-scrub-kotlin.test.ts` cuts the Kotlin block from the patch
   with `scripts/check-native-scrub-kotlin.sh`, compiles it with the Kotlin
   compiler Gradle has already cached (no install, no Gradle project), runs it
   on `tests/fixtures/exception-scrub-cases.json` and expects what
   `exceptions.ts` and `events.ts` keep, as `tests/native-scrub.test.ts` does
   for Swift. A second test, which runs everywhere, checks that the Kotlin
   field lists name the same keys, in the same order, as `frameFields`,
   `mechanismFields`, `imageFields` and `sdkProperties`. The first needs Java
   17 or later and skips without it, saying why in its name and on stderr (the
   Mac's Java is 1.8). `OPAX_REQUIRE_KOTLIN_SCRUB=1` makes a missing compiler or
   Java fail instead. For b71 it is a named pre-submit step, with its output in
   the evidence folder (`docs/ANDROID-PLAY-1.0.md`, "b71 pre-submit checks");
   on the desktop:

   ```sh
   cd mobile
   JAVA_HOME=$HOME/opax-work/jdk/jdk-21.0.13+9 OPAX_REQUIRE_KOTLIN_SCRUB=1 \
     ./node_modules/.bin/jest --verbose --runTestsByPath tests/native-scrub-kotlin.test.ts
   ```

   It runs on the JVM's `java.util.regex`, not Android's ICU-based regex, so it
   checks the Kotlin logic, not that every pattern loads on a phone. It does not
   replace item 4.
