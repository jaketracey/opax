import { readFileSync } from 'node:fs';
import { boundaryFiles } from '../scripts/boundary-files';

const originalEnvironment = { ...process.env };
afterEach(() => {
  process.env = { ...originalEnvironment };
});

test.each(
  ['development', 'e2e', 'production'].flatMap((variant) =>
    ['0', '1'].map((voice) => [variant, voice]),
  ),
)(
  'unused motion declaration is absent in %s config with voice %s',
  (variant, voice) => {
    process.env.OPAX_VARIANT = variant;
    process.env.OPAX_PRODUCTION_VOICE = voice;
    jest.resetModules();
    const config = jest.requireActual('../app.config').default;
    expect(config.ios.infoPlist.NSMotionUsageDescription).toBeUndefined();
    expect(
      config.plugins.find(
        (entry: unknown) =>
          Array.isArray(entry) && entry[0] === 'expo-location',
      )[1].motionUsagePermission,
    ).toBe(false);
  },
);

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
