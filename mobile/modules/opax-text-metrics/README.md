# Text metrics

Android fitting validates line events against React Native's `PixelUtil.toPixelFromSP`, using the actual styled line height in SP. `PixelRatio.getFontScale()` exposes the configuration scalar, without a size-specific conversion API, so it cannot describe Android 14's nonlinear curve. The inverse conversion (`TypedValue.deriveDimension`) turns each fitted DP line height back into SP; dividing by a global scalar would produce the wrong next step.

This synchronous, Android-only module converts units. It has no permissions, transport, stored state or accessibility views. Rebuild Android after adding it. An older binary without the module only uses linear fallback before API 34; newer binaries leave text uncapped until rebuilt, rather than treating an unverified event as a baseline.

See [Android's nonlinear scaling guidance](https://developer.android.com/about/versions/14/features#non-linear-font-scaling) and React Native's `ReactAndroid/src/main/java/com/facebook/react/uimanager/PixelUtil.kt`.
