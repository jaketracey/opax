# Keep the reflection/JNI boundaries, while letting R8 optimise ordinary code.
# React Native, Hermes, Expo and AndroidX also supply consumer rules in their AARs.
-keepattributes Signature,InnerClasses,EnclosingMethod,RuntimeVisibleAnnotations,AnnotationDefault

# React Native/Hermes: native registration and methods invoked from C++/JS.
-keep @com.facebook.jni.annotations.DoNotStrip class * { *; }
-keepclassmembers class * { @com.facebook.jni.annotations.DoNotStrip *; }
-keep @com.facebook.proguard.annotations.DoNotStrip class * { *; }
-keepclassmembers class * { @com.facebook.proguard.annotations.DoNotStrip *; }
-keepclassmembers,includedescriptorclasses class * { native <methods>; }
-keep class com.facebook.hermes.** { *; }

# Expo modules are constructed by autolinking and their props read reflectively.
# This includes @expo/ui's Compose props; AndroidX Compose uses its consumer rules.
-keep class expo.modules.ExpoModulesPackageList { *; }
-keep class * extends expo.modules.kotlin.modules.Module { *; }
-keep class * implements expo.modules.kotlin.records.Record { *; }
-keep class * implements expo.modules.kotlin.views.ComposeProps { *; }
-keep class expo.modules.ui.** { *; }

# Expo GL's EXGLJniApi.cpp looks up this non-native callback with GetMethodID.
-keepclassmembers class expo.modules.gl.GLContext { public void flush(); }

# Skia and Reanimated/worklets register Java methods and classes from JNI.
-keep class com.shopify.reactnative.skia.** { *; }
-keep class com.swmansion.reanimated.** { *; }
-keep class com.swmansion.worklets.** { *; }

# expo-glass-effect 57.0.4 is iOS-only; retain a future Android module boundary.
-keep class expo.modules.glasseffect.** { *; }

# PostHog's native crash plugin and posthog-android (docs/ANALYTICS.md). Keep
# their reflection boundary; crash frames are symbolicated from the R8 mapping.
-keep class com.posthog.** { *; }
-keep class com.posthogreactnativeplugin.** { *; }

# Local Kotlin Expo module, including voice/account callbacks and model types.
-keep class au.com.opax.voice.** { *; }
