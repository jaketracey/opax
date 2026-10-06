import { readFileSync } from 'node:fs';
import { boundaryFiles } from '../scripts/boundary-files';

const purpose =
  'OPAX doesn\'t use motion or fitness data. iOS requires this note because the location library behind "Use my location" includes motion features that OPAX never turns on.';
const originalEnvironment = { ...process.env };
afterEach(() => {
  process.env = { ...originalEnvironment };
});

test.each(
  ['development', 'e2e', 'production'].flatMap((variant) =>
    ['0', '1'].map((voice) => [variant, voice]),
  ),
)('motion declaration survives %s config with voice %s', (variant, voice) => {
  process.env.OPAX_VARIANT = variant;
  process.env.OPAX_PRODUCTION_VOICE = voice;
  jest.resetModules();
  const config = jest.requireActual('../app.config').default;
  expect(config.ios.infoPlist.NSMotionUsageDescription).toBe(purpose);
  expect(
    config.plugins.find(
      (entry: unknown) => Array.isArray(entry) && entry[0] === 'expo-location',
    )[1].motionUsagePermission,
  ).toBe(purpose);
  // Metro's block list excludes source paths, not approved plist declarations.
  const rules: string[] = JSON.parse(
    readFileSync('scripts/production-block-list.json', 'utf8'),
  );
  for (const rule of rules) {
    expect(new RegExp(rule).test('NSMotionUsageDescription')).toBe(false);
    expect(new RegExp(rule).test(purpose)).toBe(false);
  }
});

test('OPAX calls only foreground location and never motion or sensor APIs', () => {
  const files = boundaryFiles();
  const locationCalls: string[] = [];
  for (const path of [...files.javascript, ...files.swift, ...files.native]) {
    const body = readFileSync(path, 'utf8');
    expect(body).not.toMatch(
      /\b(?:CoreMotion|CMMotion\w*|CMPedometer|CMAltimeter|useAnimatedSensor|registerSensor|SensorType|getMotionActivityAsync|watchMotionActivityAsync|watchMotionActivityImplAsync|requestMotionActivityPermissionsAsync|getMotionActivityPermissionsAsync)\b|['"]expo-sensors['"]|\b(?:Accelerometer|Gyroscope|DeviceMotion|Magnetometer|Pedometer)\s*\./,
    );
    locationCalls.push(
      ...[...body.matchAll(/\bLocation\.(\w+)\s*\(/g)].map(
        (match) => match[1]!,
      ),
    );
  }
  expect(locationCalls.sort()).toEqual([
    'getCurrentPositionAsync',
    'requestForegroundPermissionsAsync',
  ]);
});
