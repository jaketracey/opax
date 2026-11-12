import { readFileSync } from 'node:fs';
import { join } from 'node:path';

test('glass is a direct, pinned dependency at the existing native version', () => {
  const pkg = JSON.parse(
    readFileSync(join(__dirname, '../package.json'), 'utf8'),
  );
  const installed = JSON.parse(
    readFileSync(
      join(__dirname, '../node_modules/expo-glass-effect/package.json'),
      'utf8',
    ),
  );
  expect(pkg.dependencies['expo-glass-effect']).toBe('57.0.4');
  expect(pkg.dependencies['expo-glass-effect']).toBe(installed.version);
});

test('the installed non-iOS glass detector returns false without a native module', () => {
  // Explicit .ts selects the Android/common implementation, even in Jest's
  // iOS preset. Do not mock the feature detector being checked.
  const { isLiquidGlassAvailable } = jest.requireActual<{
    isLiquidGlassAvailable: () => boolean;
  }>('../node_modules/expo-glass-effect/src/isLiquidGlassAvailable.ts');
  expect(isLiquidGlassAvailable()).toBe(false);
});
