import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';

jest.mock('expo', () => ({ requireOptionalNativeModule: jest.fn() }));
jest.mock('expo-router', () => ({}));
jest.mock('react-native/Libraries/Utilities/Platform', () => ({
  __esModule: true,
  default: {
    OS: 'android',
    Version: 34,
    select: (values: { android?: unknown; default?: unknown }) =>
      values.android ?? values.default,
  },
}));

function load(native: unknown) {
  jest.mocked(requireOptionalNativeModule).mockReturnValue(native);
  let metrics!: typeof import('../modules/opax-text-metrics');
  jest.isolateModules(() => {
    metrics = jest.requireActual('../modules/opax-text-metrics');
  });
  return metrics;
}

test('uses native conversion of the actual SP size and its inverse, without a linear multiplier', () => {
  const spToDp = jest.fn(() => 37.333);
  const dpToSp = jest.fn(() => 24.2);
  const metrics = load({ spToDp, dpToSp });
  expect(requireOptionalNativeModule).toHaveBeenCalledWith('OpaxTextMetrics');
  expect(metrics.spToDp(28, 2)).toBe(37.333);
  expect(spToDp).toHaveBeenCalledWith(28);
  expect(metrics.dpToSp(33.6, 2)).toBe(24.2);
  expect(dpToSp).toHaveBeenCalledWith(33.6);
});

test('a missing module provides no expected conversion on either Android scaling model', () => {
  const metrics = load(null);
  expect(metrics.spToDp(28, 2)).toBeUndefined();
  expect(metrics.dpToSp(33.6, 2)).toBeUndefined();
  Object.defineProperty(Platform, 'Version', { configurable: true, value: 33 });
  expect(metrics.spToDp(28, 1.3)).toBeUndefined();
  expect(metrics.dpToSp(36.4, 1.3)).toBeUndefined();
});
