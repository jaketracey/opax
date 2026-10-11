import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { configureSettingsGradle } from '../plugins/withVoiceAutolinking';
import { policy } from '../plugins/voiceProduction';

// Android 1.0 ships Talk and accounts at iOS parity: the same routes are
// bundled, the same production voice switch decides, and the microphone is
// declared only where iOS embeds its purpose string.
const root = resolve(__dirname, '..');
function inBuild(
  env: Record<string, string>,
  script: string,
): Record<string, unknown> | unknown[] {
  return JSON.parse(
    execFileSync(process.execPath, ['-e', script], {
      cwd: root,
      env: { ...process.env, OPAX_TARGET_PLATFORM: 'android', ...env },
      encoding: 'utf8',
    }),
  );
}
const android = (variant: string, voice = '1') => ({
  OPAX_VARIANT: variant,
  OPAX_PRODUCTION_VOICE: voice,
});
const blockList = (variant: string, voice = '1') =>
  (
    inBuild(
      android(variant, voice),
      'const c = require("./metro.config.js"); process.stdout.write(JSON.stringify([c.resolver.blockList].flat().filter(Boolean).map((r) => r.source)))',
    ) as string[]
  ).map((source) => new RegExp(source));
const blocked = (list: RegExp[], path: string) =>
  list.some((pattern) => pattern.test(resolve(root, path)));
const accountEntry = (variant: string, voice = '1') =>
  (
    inBuild(
      android(variant, voice),
      `
      const path = require('node:path');
      const config = require('./metro.config.js');
      const context = {
        originModulePath: path.resolve('src/app/account/index.tsx'),
        resolveRequest: (_context, name) => ({
          type: 'sourceFile', filePath: path.resolve('src/app/account', name + '.tsx'),
        }),
      };
      process.stdout.write(JSON.stringify(
        config.resolver.resolveRequest(context, '../../features/account/entry', 'android')));
    `,
    ) as { filePath: string }
  ).filePath;
const environment = { ...process.env };
afterEach(() => {
  process.env = { ...environment };
});
function appConfig(variant: string, voice = '1') {
  Object.assign(process.env, {
    OPAX_TARGET_PLATFORM: 'android',
    ...android(variant, voice),
  });
  jest.resetModules();
  const config = jest.requireActual('../app.config').default;
  return {
    extra: config.extra as Record<string, unknown>,
    blocked: config.android.blockedPermissions as string[],
    autolinking: config.plugins.find(
      (plugin: unknown) =>
        Array.isArray(plugin) &&
        plugin[0] === './plugins/withVoiceAutolinking.js',
    )[1] as Record<string, unknown>,
  };
}
const routes = [
  'src/app/talk.tsx',
  'src/app/account/sign-in.tsx',
  'src/app/account/delete.tsx',
  'src/features/talk/TalkScreen.tsx',
  'src/features/account/SignInFlow.tsx',
  'src/features/account/DeleteAccountFlow.tsx',
];

describe('Android bundles', () => {
  test.each(['development', 'e2e'])(
    '%s bundles Talk, sign-in and deletion, as iOS does',
    (variant) => {
      const list = blockList(variant);
      for (const path of routes)
        expect([path, blocked(list, path)]).toEqual([path, false]);
      expect(accountEntry(variant)).toBe(
        resolve(root, 'src/features/account/entry.tsx'),
      );
    },
  );

  test('e2e keeps the voice bridge fixture screen it shares with iOS', () => {
    expect(blocked(blockList('e2e'), 'src/app/voice-bridge-test.tsx')).toBe(
      false,
    );
    expect(
      blocked(blockList('development'), 'src/app/voice-bridge-test.tsx'),
    ).toBe(true);
  });

  test('production with the voice switch on ships the real Talk and Account', () => {
    const list = blockList('production');
    for (const path of routes)
      expect([path, blocked(list, path)]).toEqual([path, false]);
    expect(accountEntry('production')).toBe(
      resolve(root, 'src/features/account/entry.tsx'),
    );
    expect(blocked(list, 'src/app/voice-bridge-test.tsx')).toBe(true);
  });

  test('production with the switch off resolves the placeholders, as iOS does', () => {
    const list = blockList('production', '0');
    expect(accountEntry('production', '0')).toBe(
      resolve(root, 'src/features/account/entry.production.ts'),
    );
    for (const path of [
      'src/app/account/sign-in.tsx',
      'src/app/account/delete.tsx',
      'src/features/account/SignInFlow.tsx',
    ])
      expect([path, blocked(list, path)]).toEqual([path, true]);
  });

  test('no Android-only account entry remains', () => {
    expect(() =>
      require.resolve('../src/features/account/entry.android.tsx'),
    ).toThrow();
  });
});

describe('Android app config', () => {
  test('production voice: the switch and consent default reach Android', () => {
    const config = appConfig('production');
    expect(config.extra.productionVoiceEnabled).toBe(true);
    expect(config.extra.voiceConsentDefault).toBe(false);
    expect(config.blocked).not.toContain('android.permission.RECORD_AUDIO');
    expect(config.autolinking).toEqual({
      variant: 'production',
      productionVoice: true,
    });
  });

  test.each([
    ['production', '0'],
    ['e2e', '1'],
    ['development', '1'],
  ])(
    '%s (switch %s) blocks the microphone and carries no voice switch',
    (variant, voice) => {
      const config = appConfig(variant, voice);
      expect(config.extra.productionVoiceEnabled).toBeUndefined();
      expect(config.blocked).toContain('android.permission.RECORD_AUDIO');
      expect(config.autolinking).toEqual({ variant });
    },
  );

  test('the rationale says what the iOS purpose string says', () => {
    const { microphoneCopy } = jest.requireActual<
      typeof import('../src/features/talk/model')
    >('../src/features/talk/model');
    expect(microphoneCopy.purpose).toBe(policy.microphonePurpose);
  });
});

describe('Android voice autolinking', () => {
  const template =
    'plugins {\n  id("expo-autolinking-settings")\n}\nexpoAutolinking.useExpoModules()\n\nrootProject.name = \'OPAX\'\n';

  test('a voice-off release excludes opax-voice through the supported settings option', () => {
    const off = configureSettingsGradle(template, 'production');
    expect(off).toContain(
      "expoAutolinking.exclude = ['opax-voice']\nexpoAutolinking.useExpoModules()",
    );
    expect(configureSettingsGradle(off, 'production')).toBe(off);
    expect(configureSettingsGradle(off, 'production', true)).toBe(template);
    for (const variant of ['development', 'e2e'])
      expect(configureSettingsGradle(off, variant)).toBe(template);
  });

  test('a changed Expo template fails closed', () => {
    expect(() =>
      configureSettingsGradle('no module declaration', 'production'),
    ).toThrow('expected one Expo module declaration');
  });
});
