import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, createElement } from 'react';
import TestRenderer from 'react-test-renderer';
import mockSafeAreaContext from 'react-native-safe-area-context/jest/mock';
import Constants from 'expo-constants';
import { reportRouteError, resetRouteErrorReports } from '../src/analytics';
import { cleanEvent, scrubEvent } from '../src/analytics/events';
import { scrubExceptionMessage } from '../src/analytics/exceptions';
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
  resetRouteErrorReports();
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
  // One $exception with the stack, through the same scrubber, naming the
  // route by its file pattern; not a second one when React re-renders the
  // boundary with the same error.
  expect(mockCaptureException.mock.calls).toEqual([
    [error, { route_pattern: '/person/[slug]' }],
  ]);
  act(() => {
    tree.update(
      createElement(RouteErrorBoundary, {
        error: new RangeError(privateText),
        retry,
      }),
    );
  });
  // The count event reports each caught error. The $exception is one for
  // each route in a launch: a new failure on the same route adds none.
  expect(mockCapture).toHaveBeenCalledTimes(2);
  expect(mockCaptureException).toHaveBeenCalledTimes(1);
  expect(tree.root.findAllByProps({ testID: 'route-error' })).not.toHaveLength(
    0,
  );
  expect(JSON.stringify(tree.toJSON())).not.toContain(privateText);
  act(() => tree.unmount());
});

describe('the route error report ($exception), within its limits', () => {
  const bill = ['(tabs)', '(bills)', 'bill', '[key]'];
  beforeEach(() => {
    resetRouteErrorReports();
    mockCapture.mockClear();
    mockCaptureException.mockClear();
  });

  test('one report for each route in a launch: a second error on the same route sends nothing', () => {
    const first = new TypeError('first');
    reportRouteError(first, bill);
    expect(mockCaptureException.mock.calls).toEqual([
      [first, { route_pattern: '/bill/[key]' }],
    ]);
    // The page fails again: on Try again, for another bill, with another
    // error. Nothing more is sent for this route.
    reportRouteError(new RangeError('second'), bill);
    reportRouteError(first, bill);
    reportRouteError(new Error('third'), ['bill', '[key]']);
    expect(mockCaptureException).toHaveBeenCalledTimes(1);
    // Another route has its own one report.
    const other = new Error('other');
    reportRouteError(other, mockSegments);
    reportRouteError(new Error('other again'), mockSegments);
    expect(mockCaptureException.mock.calls).toEqual([
      [first, { route_pattern: '/bill/[key]' }],
      [other, { route_pattern: '/person/[slug]' }],
    ]);
  });

  test('the route is the route file’s pattern from the fixed list: a parameter’s value, a path or a query never names it', () => {
    const sent = (segments: string[]) => {
      resetRouteErrorReports();
      mockCaptureException.mockClear();
      reportRouteError(new Error('x'), segments);
      return mockCaptureException.mock.calls.map(
        ([, properties]) => properties as Record<string, unknown>,
      );
    };
    // Groups and "index" are not part of the name.
    expect(sent(['(tabs)', '(bills)', 'bill', '[key]', 'index'])).toEqual([
      { route_pattern: '/bill/[key]' },
    ]);
    // Anything that is not a route file's own name is "/other": a value
    // where the parameter is, a query, a path, a search.
    for (const segments of [
      ['bill', 'au-federal-r7520'],
      ['bill', '[key]?tab=votes'],
      ['bill', 'r7520?tab=votes'],
      ['search', 'housing in 3000'],
      ['electorate', 'Grayndler'],
      ['/bill/r7520'],
    ])
      expect(sent(segments)).toEqual([{ route_pattern: '/other' }]);
  });

  test('the payload carries only the name, the scrubbed message, the stack, the route, the build and the device class', () => {
    const message = 'Cannot read "housing in 3000" of /bill/r7520?tab=votes';
    const scrubbed = scrubEvent(
      {
        event: '$exception',
        properties: {
          $exception_list: [
            {
              type: 'TypeError',
              value: message,
              mechanism: { type: 'generic', handled: true, note: 'housing' },
              stacktrace: {
                type: 'raw',
                frames: [
                  {
                    platform: 'javascript',
                    function: 'BillDetail',
                    filename: 'index.ios.bundle?platform=ios',
                    lineno: 12,
                    colno: 34,
                    in_app: true,
                    vars: { question: 'housing' },
                    pre_context: ['housing in 3000'],
                  },
                ],
              },
              question: 'housing',
            },
          ],
          $exception_level: 'error',
          $exception_steps: [{ message: 'Asked about housing' }],
          route_pattern: '/bill/[key]',
          $screen_name: '/bill/r7520',
          $device_type: 'Mobile',
          params: { key: 'r7520' },
          pathname: '/bill/r7520',
          query: 'tab=votes',
          search: 'housing',
          postcode: '3000',
          electorate: 'Grayndler',
          question: 'housing',
        },
      },
      { ...context, window: () => ({ layout: 'compact', foldable: false }) },
    )!;
    const properties = scrubbed.properties as Record<string, unknown>;
    expect(Object.keys(properties).sort()).toEqual(
      [
        '$device_type',
        '$exception_level',
        '$exception_list',
        '$geoip_disable',
        '$is_identified',
        '$process_person_profile',
        'app',
        'app_build',
        'app_version',
        'environment',
        'foldable',
        'layout',
        'platform',
        'route_pattern',
      ].sort(),
    );
    expect(properties).toMatchObject({
      route_pattern: '/bill/[key]',
      $device_type: 'Mobile',
      layout: 'compact',
      foldable: false,
      platform: 'ios',
      app_version: '1.1.0',
      app_build: '46',
    });
    expect(properties.$exception_list).toEqual([
      {
        type: 'TypeError',
        value: scrubExceptionMessage(message),
        mechanism: { type: 'generic', handled: true },
        stacktrace: {
          type: 'raw',
          frames: [
            {
              platform: 'javascript',
              function: 'BillDetail',
              filename: 'index.ios.bundle',
              lineno: 12,
              colno: 34,
              in_app: true,
            },
          ],
        },
      },
    ]);
    // No search term, postcode, electorate, parameter or query, anywhere:
    // not in the message, the route or any other field.
    expect(JSON.stringify(scrubbed)).not.toMatch(
      /housing|3000|Grayndler|r7520|tab=votes|platform=ios/,
    );
  });

  test('a route that is not on the fixed list is left out of the payload, and the SDK’s screen is kept out with it', () => {
    const exception = {
      $exception_list: [{ type: 'Error', value: 'x' }],
      $screen_name: '/bill/r7520',
    };
    for (const route of [
      '/bill/r7520',
      '/bill/[key]?tab=votes',
      '/search?q=housing',
      'housing',
      7,
    ]) {
      const scrubbed = scrubEvent(
        {
          event: '$exception',
          properties: { ...exception, route_pattern: route },
        },
        context,
      )!;
      expect(scrubbed.properties).not.toHaveProperty('route_pattern');
      expect(JSON.stringify(scrubbed)).not.toMatch(/tab=votes|housing/);
    }
    // With its own route named, the report does not also carry the SDK's
    // screen name, which could hold a path.
    const named = scrubEvent(
      {
        event: '$exception',
        properties: { ...exception, route_pattern: '/bill/[key]' },
      },
      context,
    )!;
    expect(named.properties).toMatchObject({ route_pattern: '/bill/[key]' });
    expect(named.properties).not.toHaveProperty('$screen_name');
    expect(JSON.stringify(named)).not.toContain('r7520');
  });

  test('a build that sends no analytics sends no report: the release gate is the app’s only switch, and it blocks it', () => {
    const original = Constants.expoConfig!.extra;
    mockClient.mockClear();
    try {
      for (const extra of [
        undefined,
        { ...original, variant: 'development' },
        { ...original, analytics: undefined },
      ]) {
        Constants.expoConfig!.extra = extra as typeof original;
        jest.isolateModules(() => {
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          require('../src/analytics').reportRouteError(
            new TypeError(privateText),
            bill,
          );
        });
      }
    } finally {
      Constants.expoConfig!.extra = original;
    }
    expect(mockClient).not.toHaveBeenCalled();
    expect(mockCaptureException).not.toHaveBeenCalled();
    expect(mockCapture).not.toHaveBeenCalled();
  });
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
