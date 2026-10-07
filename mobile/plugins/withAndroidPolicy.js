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

// Android mods only: no iOS project/config changes. A distinct Gradle build
// type embeds JS like release and permits the emulator host only in e2e.
module.exports = function withAndroidPolicy(config) {
  config = withAndroidManifest(config, (mod) => {
    const app = mod.modResults.manifest.application[0].$;
    app['android:usesCleartextTraffic'] = 'false';
    app['android:allowBackup'] = 'false';
    app['android:enableOnBackInvokedCallback'] = 'true';
    app['android:networkSecurityConfig'] = '@xml/opax_network_security';
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
    const marker = '// OPAX Android is light-only';
    if (!mod.modResults.contents.includes(marker)) {
      const anchor = '    super.onCreate(null)';
      if (!mod.modResults.contents.includes(anchor))
        throw new Error(
          'Android light theme: review the MainActivity onCreate anchor',
        );
      mod.modResults.contents = mod.modResults.contents.replace(
        anchor,
        `    ${marker}\n    androidx.appcompat.app.AppCompatDelegate.setDefaultNightMode(androidx.appcompat.app.AppCompatDelegate.MODE_NIGHT_NO)\n${anchor}`,
      );
    }
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
module.exports.secure = secure;
module.exports.fixture = fixture;
