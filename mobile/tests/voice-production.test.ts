import { readFileSync } from 'node:fs';
import { configurePodfile } from '../plugins/withVoiceAutolinking';
import { applyNetworkPolicy } from '../plugins/withNetworkPolicy';
import {
  policy,
  productionVoiceEnabled,
  voicePrivacyManifest,
} from '../plugins/voiceProduction';

const originalEnvironment = { ...process.env };
afterEach(() => {
  process.env = { ...originalEnvironment };
});

test.each(['0', '1'])(
  'production config and pods follow switch %s',
  (value) => {
    process.env.OPAX_VARIANT = 'production';
    process.env.OPAX_PRODUCTION_VOICE = value;
    jest.resetModules();
    const config = jest.requireActual('../app.config').default;
    const enabled = value === '1';
    expect(config.extra.productionVoiceEnabled === true).toBe(enabled);
    expect(config.ios.infoPlist.NSMicrophoneUsageDescription).toBe(
      enabled ? policy.microphonePurpose : undefined,
    );
    expect(config.ios.infoPlist.OPAXVoiceConsentDefault).toBe(
      enabled ? false : undefined,
    );
    expect(config.ios.infoPlist.OPAXVoiceAllowedRoutes).toEqual(
      enabled ? policy.routes : undefined,
    );
    expect(config.ios.privacyManifests).toEqual(
      enabled ? voicePrivacyManifest() : undefined,
    );
    expect(
      config.plugins.find(
        (plugin: unknown) =>
          Array.isArray(plugin) &&
          plugin[0] === './plugins/withVoiceAutolinking.js',
      )?.[1],
    ).toEqual(
      enabled
        ? { variant: 'production', productionVoice: true }
        : { variant: 'production' },
    );
    const podfile = configurePodfile(
      'use_expo_modules!\n',
      'production',
      enabled,
    );
    expect(podfile.includes(':exclude')).toBe(!enabled);
    expect(configurePodfile(podfile, 'production', enabled)).toBe(podfile);
    const stale = {
      NSMicrophoneUsageDescription: 'stale',
      OPAXVoiceFixturePort: 8923,
      NSAppTransportSecurity: { NSAllowsArbitraryLoads: true },
      OPAXProductionVoiceEnabled: true,
      OPAXVoiceConsentDefault: true,
      OPAXVoiceAllowedRoutes: ['bad'],
    };
    const info = applyNetworkPolicy(stale, config);
    expect(info.NSMicrophoneUsageDescription).toBe(
      enabled ? policy.microphonePurpose : undefined,
    );
    expect(info.OPAXVoiceConsentDefault).toBe(enabled ? false : undefined);
    expect(info.OPAXVoiceFixturePort).toBeUndefined();
    expect(info.NSAppTransportSecurity).toBeUndefined();
  },
);

test('the default is off and invalid switches fail closed', () => {
  delete process.env.OPAX_PRODUCTION_VOICE;
  expect(productionVoiceEnabled('production')).toBe(false);
  for (const value of ['true', 'yes', '', '2'])
    expect(() => productionVoiceEnabled('production', value)).toThrow(
      'must be 0 or 1',
    );
  for (const variant of ['development', 'e2e'])
    expect(productionVoiceEnabled(variant, '1')).toBe(false);
});

test('privacy merges existing required reasons without declaring on-device location collected', () => {
  const reasons = [
    {
      NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryUserDefaults',
      NSPrivacyAccessedAPITypeReasons: ['CA92.1'],
    },
  ];
  const manifest = voicePrivacyManifest({
    NSPrivacyAccessedAPITypes: reasons,
    NSPrivacyTracking: false,
    NSPrivacyCollectedDataTypes: [],
  });
  expect(manifest.NSPrivacyAccessedAPITypes).toEqual(reasons);
  expect(manifest.NSPrivacyTracking).toBe(false);
  expect(manifest.NSPrivacyCollectedDataTypes).toHaveLength(7);
  expect(
    manifest.NSPrivacyCollectedDataTypes.map(
      (entry) => entry.NSPrivacyCollectedDataType,
    ),
  ).toContain('NSPrivacyCollectedDataTypeOtherDataTypes');
  for (const entry of manifest.NSPrivacyCollectedDataTypes) {
    expect(entry.NSPrivacyCollectedDataTypeTracking).toBe(false);
    expect(entry.NSPrivacyCollectedDataTypePurposes).toEqual([
      'NSPrivacyCollectedDataTypePurposeAppFunctionality',
    ]);
    expect(entry.NSPrivacyCollectedDataType).not.toMatch(/Location/);
    expect(entry.NSPrivacyCollectedDataTypeLinked).toBe(
      policy.linkedDataTypes.some((name: string) =>
        entry.NSPrivacyCollectedDataType.endsWith(name),
      ),
    );
  }
  expect(voicePrivacyManifest(manifest)).toEqual(manifest);
});

test('the compiled native route list is exactly the build policy', () => {
  const source = readFileSync(
    'modules/opax-voice/ios/OpaxVoiceCore/Sources/OpaxVoiceCore/HTTPClient.swift',
    'utf8',
  );
  const paths = [...source.matchAll(/= "(\/api\/[^" ]+)"/g)]
    .map((match) => match[1])
    .sort();
  expect(paths).toEqual(
    policy.routes.map((route: string) => route.split(' ')[1]).sort(),
  );
  expect(policy.routes).toHaveLength(10);
  expect(policy.consentDefault).toBe(false);
});
