import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, createElement } from 'react';
import TestRenderer from 'react-test-renderer';
import mockSafeAreaContext from 'react-native-safe-area-context/jest/mock';
import Constants from 'expo-constants';
import { cleanEvent, scrubEvent } from '../src/analytics/events';
import { RouteErrorBoundary } from '../src/navigation/RouteErrorBoundary';

// Mirrors DEVELOPMENT_ROUTE in scripts/verify-ios-release.py.
const DEVELOPMENT_ROUTE =
  /workbench|source-destination|fixture|__tests__|\(dev\)|__dev|home-prototype|voice-bridge-test|test-screens/i;

const mockSegments = ['(tabs)', '(today)', 'person', '[slug]'];
const mockCapture = jest.fn();
const mockCaptureException = jest.fn();
const mockClient = jest.fn((..._args: unknown[]) => ({
  capture: mockCapture,
  captureException: mockCaptureException,
}));
jest.mock('posthog-react-native', () => ({
  __esModule: true,
  default: function (...args: unknown[]) {
    return mockClient(...args);
  },
}));
jest.mock('expo-router', () => ({ useSegments: () => mockSegments }));
jest.mock('react-native-safe-area-context', () => mockSafeAreaContext);
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    platform: { ios: { buildNumber: '46' } },
    expoConfig: {
      version: '1.1.0',
      ios: { buildNumber: '46' },
      android: { versionCode: 46 },
      extra: {
        variant: 'production',
        appBuild: '46',
        analytics: {
          host: 'https://opax.com.au/ingest',
          projectToken: 'phc_fixture000000000000000000000000',
          environment: 'production',
        },
      },
    },
  },
}));

const originalDev = __DEV__;
beforeAll(() => {
  Reflect.set(globalThis, '__DEV__', false);
});
afterAll(() => {
  Reflect.set(globalThis, '__DEV__', originalDev);
});

const context = {
  platform: 'ios',
  appVersion: '1.1.0',
  appBuild: '46',
  environment: 'production',
} as const;
const privateText = 'Fixture private question, answer and record title';

test('only fixed error classes and actual route patterns survive both privacy guards', () => {
  const properties = {
    error_class: 'TypeError',
    route_pattern: '/person/[slug]',
    $screen_name: '/person/fixture-member',
    message: privateText,
    stack: privateText,
    question: privateText,
    answer: privateText,
    slug: 'fixture-member',
    name: 'Fixture Member',
    app_version: privateText,
  };
  expect(cleanEvent('opax_route_error', properties)).toEqual({
    error_class: 'TypeError',
    route_pattern: '/person/[slug]',
  });
  const scrubbed = scrubEvent(
    { event: 'opax_route_error', properties },
    context,
  )!;
  expect(scrubbed.properties).toMatchObject({
    error_class: 'TypeError',
    route_pattern: '/person/[slug]',
    app_version: '1.1.0',
    $process_person_profile: false,
    $is_identified: false,
    $geoip_disable: true,
  });
  expect(JSON.stringify(scrubbed)).not.toMatch(/Fixture|fixture-member/);
  expect(
    cleanEvent('opax_route_error', {
      error_class: privateText,
      route_pattern: '/person/fixture-member',
    }),
  ).toEqual({ error_class: 'other' });
  expect(scrubEvent({ event: '$exception', properties }, context)).toBeNull();
});

test('every route file has an explicitly allowlisted error pattern', () => {
  function routes(dir: string, segments: string[] = []): string[][] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      if (entry.isDirectory())
        return routes(join(dir, entry.name), [...segments, entry.name]);
      if (!entry.name.endsWith('.tsx') || /^[_+]/.test(entry.name)) return [];
      return [[...segments, entry.name.replace(/\.tsx$/, '')]];
    });
  }
  for (const segments of routes(join(__dirname, '../src/app'))) {
    const pattern =
      '/' +
      segments.filter((s) => s !== 'index' && !s.startsWith('(')).join('/');
    // Development routes are stripped from release builds, and naming them
    // here would put their names in production JS (verify-ios-release.py).
    if (DEVELOPMENT_ROUTE.test(pattern)) {
      expect(
        cleanEvent('opax_route_error', { route_pattern: pattern }),
      ).toEqual({});
      continue;
    }
    expect(cleanEvent('opax_route_error', { route_pattern: pattern })).toEqual({
      route_pattern: pattern,
    });
  }
});

test('the allowlist never names a development route', () => {
  const source = readFileSync(
    join(__dirname, '../src/analytics/route-patterns.ts'),
    'utf8',
  );
  expect(source).not.toMatch(DEVELOPMENT_ROUTE);
});

test('root and every tab layout export the reporting recoverable boundary', () => {
  const root = join(__dirname, '../src/app');
  function layouts(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
      entry.isDirectory()
        ? layouts(join(dir, entry.name))
        : entry.name === '_layout.tsx'
          ? [join(dir, entry.name)]
          : [],
    );
  }
  for (const path of [
    join(root, '_layout.tsx'),
    ...layouts(join(root, '(tabs)')),
  ])
    expect(readFileSync(path, 'utf8')).toMatch(
      /RouteErrorBoundary as ErrorBoundary.*navigation\/RouteErrorBoundary/,
    );
});

test('the reporting boundary captures once per caught error, without error text or route params', () => {
  const error = new TypeError(privateText);
  error.name = privateText;
  const retry = async () => {};
  mockCapture.mockClear();
  mockCaptureException.mockClear();
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(
      createElement(RouteErrorBoundary, { error, retry }),
    );
  });
  act(() => {
    tree.update(createElement(RouteErrorBoundary, { error, retry }));
  });
  expect(mockCapture.mock.calls).toEqual([
    [
      'opax_route_error',
      { error_class: 'TypeError', route_pattern: '/person/[slug]' },
    ],
  ]);
  // One $exception with the stack, through the same scrubber; not a second
  // one when React re-renders the boundary with the same error.
  expect(mockCaptureException.mock.calls).toEqual([[error]]);
  act(() => {
    tree.update(
      createElement(RouteErrorBoundary, {
        error: new RangeError(privateText),
        retry,
      }),
    );
  });
  expect(mockCapture).toHaveBeenCalledTimes(2);
  expect(mockCaptureException).toHaveBeenCalledTimes(2);
  expect(tree.root.findAllByProps({ testID: 'route-error' })).not.toHaveLength(0);
  expect(JSON.stringify(tree.toJSON())).not.toContain(privateText);
  act(() => tree.unmount());
});

test('reporting respects the release gate on both platforms and anonymous SDK options', () => {
  const original = Constants.expoConfig!.extra;
  const report = (
    extra: typeof original,
    platform: 'ios' | 'android' = 'ios',
  ) => {
    Constants.expoConfig!.extra = extra;
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { Platform } = require('react-native');
      const os = jest.replaceProperty(Platform, 'OS', platform);
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('../src/analytics').reportRouteError(new TypeError(privateText), [
        'person',
        '[slug]',
      ]);
      os.restore();
    });
  };
  mockClient.mockClear();
  report(undefined);
  expect(mockClient).not.toHaveBeenCalled();
  report({ analytics: { ...original!.analytics, environment: 'e2e' } });
  expect(mockClient).not.toHaveBeenCalled();
  report({ ...original, variant: 'development' });
  report({ ...original, variant: 'e2e' });
  report({ ...original, appBuild: '0' });
  report({ ...original, appBuild: undefined });
  expect(mockClient).not.toHaveBeenCalled();
  report(original, 'android');
  report(original);
  expect(mockClient).toHaveBeenCalledTimes(2);
  expect(mockClient.mock.calls[0]![1]).toMatchObject({
    personProfiles: 'never',
    enableSessionReplay: false,
    disableGeoip: true,
    errorTracking: { autocapture: { console: [] } },
  });
  Constants.expoConfig!.extra = original;
});
