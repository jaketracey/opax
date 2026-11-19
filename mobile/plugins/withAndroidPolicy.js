const {
  withAndroidManifest,
  withAppBuildGradle,
  withMainActivity,
  withDangerousMod,
} = require('expo/config-plugins');
const fs = require('node:fs/promises');
const path = require('node:path');

const secure = `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
  <base-config cleartextTrafficPermitted="false" />
</network-security-config>
`;
const fixture = `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
  <base-config cleartextTrafficPermitted="false" />
  <domain-config cleartextTrafficPermitted="true">
    <domain includeSubdomains="false">10.0.2.2</domain>
  </domain-config>
</network-security-config>
`;

// The appearance switch (plugins/appearance.js) in MainActivity. `light`
// pins AppCompat to day, as every release to 1.1.5 did. `automatic` follows
// the system: React Native reads the scheme from the activity's
// configuration (AppearanceModule), and the manifest keeps `uiMode` in
// configChanges, so a change while the app is open reaches JavaScript
// without recreating the activity. expo-system-ui would only make the same
// AppCompat call from a string resource; it is not installed or needed.
const nightModes = {
  light: {
    marker: '// OPAX Android is light-only',
    mode: 'MODE_NIGHT_NO',
  },
  automatic: {
    marker: '// OPAX Android follows the system appearance',
    mode: 'MODE_NIGHT_FOLLOW_SYSTEM',
  },
};
const nightModeLine =
  /\n {4}\/\/ OPAX Android (?:is light-only|follows the system appearance)\n {4}androidx\.appcompat\.app\.AppCompatDelegate\.setDefaultNightMode\([^\n]*\)(?=\n)/g;
function configureNightMode(contents, appearance) {
  const chosen = nightModes[appearance];
  if (!chosen)
    throw new Error('Android appearance: expected light or automatic');
  // A project generated under the other setting is rewritten, not doubled.
  const cleared = contents.replace(nightModeLine, '');
  const anchor = '    super.onCreate(null)';
  if (!cleared.includes(anchor))
    throw new Error(
      'Android appearance: review the MainActivity onCreate anchor',
    );
  return cleared.replace(
    anchor,
    `    ${chosen.marker}\n    androidx.appcompat.app.AppCompatDelegate.setDefaultNightMode(androidx.appcompat.app.AppCompatDelegate.${chosen.mode})\n${anchor}`,
  );
}
// With the system followed, the navigation bar's buttons must turn with the
// page. React Native sets them once, when the activity is created
// (WindowUtil.enableEdgeToEdge); the activity is not recreated on a scheme
// change, so the configuration hook sets them again.
const barsMarker = '// OPAX system bar buttons follow the scheme';
const barsBlock = `
    ${barsMarker}
    val opaxNight = (newConfig.uiMode and android.content.res.Configuration.UI_MODE_NIGHT_MASK) ==
      android.content.res.Configuration.UI_MODE_NIGHT_YES
    androidx.core.view.WindowInsetsControllerCompat(window, window.decorView)
      .isAppearanceLightNavigationBars = !opaxNight`;
function configureBarButtons(contents, appearance) {
  const cleared = contents.replace(barsBlock, '');
  if (appearance !== 'automatic') return cleared;
  const anchor = '    super.onConfigurationChanged(newConfig)';
  if (!cleared.includes(anchor))
    throw new Error(
      'Android appearance: review the MainActivity configuration hook',
    );
  return cleared.replace(anchor, anchor + barsBlock);
}

// Android mods only: no iOS project/config changes. A distinct Gradle build
// type embeds JS like release and permits the emulator host only in e2e.
module.exports = function withAndroidPolicy(config, props = {}) {
  const appearance = props.appearance ?? 'light';
  config = withAndroidManifest(config, (mod) => {
    const app = mod.modResults.manifest.application[0].$;
    app['android:usesCleartextTraffic'] = 'false';
    app['android:allowBackup'] = 'false';
    app['android:enableOnBackInvokedCallback'] = 'true';
    app['android:networkSecurityConfig'] = '@xml/opax_network_security';
    const activity = mod.modResults.manifest.application[0].activity.find(
      (entry) => entry.$['android:name'] === '.MainActivity',
    );
    if (!activity)
      throw new Error('Android font scale: MainActivity is missing');
    // Keep the navigator alive while Android applies the new font metrics.
    activity.$['android:configChanges'] = [
      ...new Set([
        ...(activity.$['android:configChanges'] ?? '')
          .split('|')
          .filter(Boolean),
        'fontScale',
      ]),
    ].join('|');
    return mod;
  });
  config = withAppBuildGradle(config, (mod) => {
    const marker = '// OPAX Android e2e build type';
    mod.modResults.contents = mod.modResults.contents.replace(
      /\n\/\/ OPAX Android e2e build type[\s\S]*$/,
      '',
    );
    if (!mod.modResults.contents.includes(marker)) {
      mod.modResults.contents += `
${marker}
android.buildTypes {
    e2e {
        initWith android.buildTypes.release
        signingConfig android.signingConfigs.debug
        matchingFallbacks = ['release']
    }
}
`;
    }
    return mod;
  });
  config = withMainActivity(config, (mod) => {
    const fontMarker = '// OPAX live font scale';
    if (!mod.modResults.contents.includes(fontMarker)) {
      const anchor = 'class MainActivity : ReactActivity() {';
      if (
        !mod.modResults.contents.includes(anchor) ||
        /override fun onConfigurationChanged/.test(mod.modResults.contents)
      )
        throw new Error(
          'Android font scale: review the MainActivity class anchor or configuration hook',
        );
      mod.modResults.contents = mod.modResults.contents.replace(
        anchor,
        `${anchor}
  ${fontMarker}
  override fun onConfigurationChanged(newConfig: android.content.res.Configuration) {
    super.onConfigurationChanged(newConfig)
    // RN refreshes native text metrics in super. DeviceInfo caches fontScale
    // until resume; refresh it here too so useWindowDimensions updates now.
    (reactHost?.currentReactContext?.getNativeModule("DeviceInfo") as?
      com.facebook.react.bridge.LifecycleEventListener)?.onHostResume()
  }
`,
      );
    }
    const intentMarker = '// OPAX durable link deliveries';
    // Migrate worktrees that have already generated the previous retention hook.
    mod.modResults.contents = mod.modResults.contents.replace(
      /\n  \/\/ OPAX retain links received during JS startup\n  override fun onNewIntent\(intent: android\.content\.Intent\) \{\n    setIntent\(intent\)\n    super\.onNewIntent\(intent\)\n  \}\n/,
      '\n',
    );
    if (!mod.modResults.contents.includes(intentMarker)) {
      const anchor = 'class MainActivity : ReactActivity() {';
      if (!mod.modResults.contents.includes(anchor))
        throw new Error('Android links: review the MainActivity class anchor');
      if (
        /override fun (onNewIntent|onSaveInstanceState)/.test(
          mod.modResults.contents,
        )
      )
        throw new Error(
          'Android links: review existing Activity lifecycle hooks',
        );
      mod.modResults.contents = mod.modResults.contents.replace(
        anchor,
        `${anchor}
  ${intentMarker}
  private val opaxLinks by lazy { au.com.opax.links.LinkIntentActivityDelegate(this) }

  override fun onNewIntent(intent: android.content.Intent) {
    opaxLinks.onNewIntent(intent)
    super.onNewIntent(intent)
  }

  override fun onSaveInstanceState(outState: android.os.Bundle) {
    opaxLinks.onSaveInstanceState(outState)
    super.onSaveInstanceState(outState)
  }
`,
      );
      const create = '    super.onCreate(null)';
      if (!mod.modResults.contents.includes(create))
        throw new Error(
          'Android links: review the MainActivity onCreate anchor',
        );
      mod.modResults.contents = mod.modResults.contents.replace(
        create,
        `    opaxLinks.onCreate(savedInstanceState)\n${create}`,
      );
    }
    mod.modResults.contents = configureBarButtons(
      configureNightMode(mod.modResults.contents, appearance),
      appearance,
    );
    return mod;
  });
  return withDangerousMod(config, [
    'android',
    async (mod) => {
      const src = path.join(mod.modRequest.platformProjectRoot, 'app', 'src');
      for (const [source, body] of [
        ['main', secure],
        ['e2e', fixture],
      ]) {
        const dir = path.join(src, source, 'res', 'xml');
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(path.join(dir, 'opax_network_security.xml'), body);
      }
      // Expo's debug overlays otherwise enable global cleartext. Metro may
      // be tunneled with adb reverse, but all Android API traffic stays TLS.
      const debugDir = path.join(src, 'debug', 'res', 'xml');
      await fs.mkdir(debugDir, { recursive: true });
      await fs.writeFile(
        path.join(debugDir, 'opax_network_security.xml'),
        `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
  <base-config cleartextTrafficPermitted="false" />
  <domain-config cleartextTrafficPermitted="true">
    <domain includeSubdomains="false">localhost</domain>
    <domain includeSubdomains="false">127.0.0.1</domain>
  </domain-config>
</network-security-config>
`,
      );
      for (const source of ['debug', 'debugOptimized']) {
        const manifest = path.join(src, source, 'AndroidManifest.xml');
        try {
          const before = await fs.readFile(manifest, 'utf8');
          await fs.writeFile(
            manifest,
            before
              .replace(
                /\s*<uses-permission android:name="android\.permission\.SYSTEM_ALERT_WINDOW"\s*\/>/g,
                '',
              )
              .replace(
                /android:usesCleartextTraffic="true"/g,
                'android:usesCleartextTraffic="false"',
              ),
          );
        } catch (error) {
          if (error.code !== 'ENOENT') throw error;
        }
      }
      return mod;
    },
  ]);
};
module.exports.configureNightMode = configureNightMode;
module.exports.configureBarButtons = configureBarButtons;
module.exports.secure = secure;
module.exports.fixture = fixture;
