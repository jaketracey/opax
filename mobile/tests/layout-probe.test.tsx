// The layout probe is a measuring build only (src/perf/layout-probe.ts). It
// must not exist in any other build: no recorder, no row in Account.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act } from 'react';
import { View } from 'react-native';
import TestRenderer from 'react-test-renderer';
import {
  HeaderHeightContext,
  NavigationRouteContext,
} from 'expo-router/react-navigation';
import { Screen } from '../src/design/layout';
import { LayoutProbeRow } from '../src/perf/LayoutProbeRow';
import { layoutProbeText, useLayoutProbe } from '../src/perf/layout-probe';
import { layoutProbeEnabled } from '../src/perf/layout-probe-flag';

const route = { key: 'bill-1', name: 'bill/[key]' };

test('without the build flag nothing is recorded and Account has no row', () => {
  expect(layoutProbeEnabled).toBe(false);
  jest.useFakeTimers();
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(
      <NavigationRouteContext.Provider value={route as never}>
        <HeaderHeightContext.Provider value={82}>
          <Screen testID="page">
            <View />
          </Screen>
          <LayoutProbeRow />
        </HeaderHeightContext.Provider>
      </NavigationRouteContext.Provider>,
    );
  });
  act(() => jest.advanceTimersByTime(1500));
  expect(layoutProbeText()).toBe('');
  expect(
    renderer.root.findAll(
      (node) => node.props?.testID === 'account-layout-probe',
    ),
  ).toHaveLength(0);
  act(() => renderer.unmount());
  jest.useRealTimers();
});

test('with the flag off the hook and the row are plain no-ops', () => {
  // Called outside any component: a real hook or a subscription would throw.
  const ref = { current: null };
  expect(() => useLayoutProbe(ref, ref, 82)).not.toThrow();
  expect(useLayoutProbe(ref, ref, 82)).toBeUndefined();
  expect((LayoutProbeRow as () => unknown)()).toBeNull();
});

test.each([
  [undefined, false],
  [{}, false],
  [{ layoutProbe: false }, false],
  [{ layoutProbe: '1' }, false],
  [{ layoutProbe: 1 }, false],
  [{ layoutProbe: true }, true],
] as const)(
  'build configuration extra %p turns the probe on: %s',
  (extra, on) => {
    jest.isolateModules(() => {
      jest.doMock('expo-constants', () => ({
        __esModule: true,
        default: { expoConfig: extra === undefined ? undefined : { extra } },
      }));
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const flag = require('../src/perf/layout-probe-flag') as {
        layoutProbeEnabled: boolean;
      };
      expect(flag.layoutProbeEnabled).toBe(on);
    });
    jest.dontMock('expo-constants');
  },
);

test('the flag is read from the build configuration, never from process.env', () => {
  // Metro's transform cache is not keyed on environment variables: a flag
  // inlined into the bundle stayed on in the next build without it.
  const source = readFileSync(
    join(__dirname, '../src/perf/layout-probe-flag.ts'),
    'utf8',
  )
    .split('\n')
    .filter((line) => !/^\s*(\/\*|\*|\/\/)/.test(line))
    .join('\n');
  expect(source).not.toContain('process.env');
  expect(source).toContain('expoConfig');
});
