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
// for portability; the entire output, including iOS, extra and plugin order, is pinned.
const iosPrebuildHashes = {
  development:
    'b59463dd4eae775abedf56d47cca0816886b6fc733ee123e460b22fe980ad5de',
  e2e: 'ded6a318abba423bcf8162d2dfbcfbbbdb9054b095b81204303a5f9e84dfaf7d',
  production:
    'b274384108634d2f5490fd728e131add648841ee37461e65fced98990f374579',
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
    const normalised = result.stdout.split(root).join('<PROJECT_ROOT>');
    expect(createHash('sha256').update(normalised).digest('hex')).toBe(
      iosPrebuildHashes[variant],
    );
  },
  70000,
);
