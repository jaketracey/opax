import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const withAndroidRelease = jest.requireActual('../plugins/withAndroidRelease');
const { configureRelease } = withAndroidRelease;
const withAndroidPolicy = jest.requireActual('../plugins/withAndroidPolicy');
const variants = ['development', 'e2e', 'production'] as const;
const root = resolve(__dirname, '..');
const rules = readFileSync(
  join(root, 'plugins/android-release/proguard-rules.pro'),
  'utf8',
);

test.each(variants)(
  '%s enables R8 and resource shrinking only for production release',
  (variant) => {
    const original = `android.buildTypes {
    debug { signingConfig android.signingConfigs.debug }
    release { signingConfig android.signingConfigs.debug }
    e2e { initWith android.buildTypes.release }
}
`;
    const result = configureRelease(original, variant);
    expect(result.startsWith(original)).toBe(true);
    const production = variant === 'production';
    expect(result).toContain(`minifyEnabled ${production}`);
    expect(result).toContain(`shrinkResources ${production}`);
    expect(result).toContain("ndk.debugSymbolLevel = 'SYMBOL_TABLE'");
    expect(result).toContain("proguardFile file('opax-release.pro')");
    expect(result).toContain(
      "android.buildTypes.matching { it.name != 'release' }.all {\n    minifyEnabled false\n    shrinkResources false",
    );
    expect(result).not.toMatch(/signingConfig[^\n]*opaxUpload/);
    expect(configureRelease(result, variant)).toBe(result);
  },
);

test('prebuilding another variant replaces stale production settings', () => {
  const production = configureRelease('android {}\n', 'production');
  const e2e = configureRelease(production, 'e2e');
  expect(e2e).not.toContain('minifyEnabled true');
  expect(e2e.match(/OPAX Android release begin/g)).toHaveLength(1);
  expect(() => configureRelease('', 'unknown')).toThrow('unknown OPAX variant');
});

test('the real policy runs before release settings, including repeated prebuilds', async () => {
  let config = withAndroidRelease(
    { name: 'OPAX', slug: 'opax' },
    { variant: 'production' },
  );
  config = withAndroidPolicy(config);
  let contents = 'android {}\n';
  for (let i = 0; i < 2; i++) {
    const result = await config.mods.android.appBuildGradle({
      ...config,
      modRequest: {},
      modResults: { language: 'groovy', contents },
    });
    const next = result.modResults.contents;
    expect(next).toContain('minifyEnabled true');
    expect(next.indexOf('initWith android.buildTypes.release')).toBeLessThan(
      next.indexOf('minifyEnabled true'),
    );
    if (i) expect(next).toBe(contents);
    contents = next;
  }
});

test('the real Android mods copy keep rules and reject an unsupported Gradle template', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'opax-release-plugin-'));
  try {
    const ios = {
      bundleIdentifier: 'au.com.opax.app',
      infoPlist: { retained: true },
    };
    const config = withAndroidRelease(
      { name: 'OPAX', slug: 'opax', ios },
      { variant: 'production' },
    );
    expect(config.ios).toBe(ios);
    expect(Object.keys(config.mods)).toEqual(['android']);
    const modRequest = { platformProjectRoot: directory };
    await config.mods.android.dangerous({ ...config, modRequest });
    expect(readFileSync(join(directory, 'app/opax-release.pro'), 'utf8')).toBe(
      rules,
    );
    const result = await config.mods.android.appBuildGradle({
      ...config,
      modRequest,
      modResults: { language: 'groovy', contents: 'android {}\n' },
    });
    expect(result.modResults.contents).toContain('minifyEnabled true');
    await expect(
      config.mods.android.appBuildGradle({
        ...config,
        modRequest,
        modResults: { language: 'kotlin', contents: '' },
      }),
    ).rejects.toThrow('Groovy');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('keep rules cover native entry points without disabling R8 globally', () => {
  for (const boundary of [
    'com.facebook.jni.annotations.DoNotStrip',
    'com.facebook.hermes.**',
    'expo.modules.kotlin.modules.Module',
    'expo.modules.kotlin.records.Record',
    'expo.modules.kotlin.views.ComposeProps',
    'expo.modules.ui.**',
    'expo.modules.gl.GLContext { public void flush(); }',
    'com.shopify.reactnative.skia.**',
    'com.swmansion.reanimated.**',
    'com.swmansion.worklets.**',
    'expo.modules.glasseffect.**',
    'com.posthog.**',
    'au.com.opax.voice.**',
  ])
    expect(rules).toContain(boundary);
  expect(rules).not.toMatch(/^-dont(?:shrink|optimize|obfuscate|warn)/m);
  expect(rules).not.toMatch(/^-keep class \*\*/m);
});

// Captured with `expo config --type prebuild --json` at iOS head 1bc9ee398,
// then independently matched against the merged config. Only the checkout's absolute path is replaced
// for portability. The only inventory exception is the Android-only text
// conversion module; all runtime config, including iOS, extra and plugin order,
// remains pinned to the original hashes. Re-pinned for crash reports
// (docs/ANALYTICS.md): every variant adds the PostHog push opt-out Info.plist
// key, and production's privacy manifest adds Crash Data and Other Diagnostic
// Data; nothing else changed.
// Re-pinned for 1.1.5: the only change is the version string (2 places per
// variant); swapping it back to 1.1.4 gives the previous hashes exactly.
// Re-pinned for universal links: development and production add
// ios.associatedDomains ["applinks:opax.com.au"] and nothing else; e2e claims
// no domain and keeps its hash.
// Re-pinned for the appearance switch (dark mode, 19 Nov 2026): with the
// switch unset the only change is that the withAndroidPolicy plugin entry
// carries `{ appearance: 'light' }`; putting the bare string back gives the
// previous three hashes exactly, so a light build's iOS config is unchanged.
// Re-pinned for 1.1.6: the only change is the version string; swapping it
// back to 1.1.5 gives the previous hashes exactly.
const iosPrebuildHashes = {
  development:
    'ce35e31597cc964353904a6378069c959db61f510ce836197242bd0ac3c33df0',
  e2e: '8a98c3167cf8d4df9e503f53ef0d9c08baa300f08c916cdc28f2620d2b85fc2c',
  production:
    '852904d2dbc3b01a88faf1aad0342aee54ccbf48d250f005d3ff32303d83a596',
};
test.each(variants)(
  'iOS %s prebuild output stays byte-identical to the baseline',
  (variant) => {
    const env = { ...process.env };
    for (const key of Object.keys(env))
      if (key.startsWith('OPAX_')) delete env[key];
    const result = spawnSync(
      process.execPath,
      ['node_modules/expo/bin/cli', 'config', '--type', 'prebuild', '--json'],
      {
        cwd: root,
        env: { ...env, OPAX_VARIANT: variant, CI: '1', EXPO_NO_TELEMETRY: '1' },
        encoding: 'utf8',
        timeout: 60000,
      },
    );
    if (result.status !== 0)
      throw new Error(result.stderr || String(result.error));
    const inspected = JSON.parse(
      result.stdout.split(root).join('<PROJECT_ROOT>'),
    );
    // Expo's platform-neutral inventory includes Android-only local modules.
    // Removing exactly these entries must recover the unchanged iOS baseline.
    const inventory: string[] = inspected._internal.autolinkedModules;
    for (const module of ['opax-text-metrics', 'opax-links']) {
      expect(
        JSON.parse(
          readFileSync(
            join(root, `modules/${module}/expo-module.config.json`),
            'utf8',
          ),
        ).platforms,
      ).toEqual(['android']);
      expect(inventory.filter((name) => name === module)).toHaveLength(1);
      inventory.splice(inventory.indexOf(module), 1);
    }
    const normalised = JSON.stringify(inspected);
    expect(createHash('sha256').update(normalised).digest('hex')).toBe(
      iosPrebuildHashes[variant],
    );
  },
  70000,
);
