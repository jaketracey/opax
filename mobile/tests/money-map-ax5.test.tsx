import { act } from 'react';
import TestRenderer, { type ReactTestInstance } from 'react-test-renderer';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { apiClient } from '../src/api/runtime';
import {
  resetAdaptiveDeviceForTests,
  setWindowTraitsOverride,
} from '../src/design/adaptive';
import { IconButton } from '../src/design/primitives';
import { isAccessibilityCategory, minimumTarget } from '../src/design/tokens';
import MoneyScreen from '../src/features/money/MoneyScreen';
import { MoneyMapControls } from '../src/features/money/map/MoneyMapControls';
import { MoneyMapPanel } from '../src/features/money/map/MoneyMapPanel';
import { MoneyMapSearch } from '../src/features/money/map/MoneyMapSearch';
import {
  largeTextLimits,
  mapControlLayout,
  type ChromeState,
} from '../src/features/money/map/regions';
import { emptyReservedRegions } from '../src/design/fold';
import { withNavigationOptions } from './navigation-options';
import { pinned } from './pinned';

let mockWindow = { width: 402, height: 874, fontScale: 3.571 };
jest.mock('react-native', () => {
  const actual = jest.requireActual('react-native');
  return Object.defineProperties(Object.create(actual), {
    useWindowDimensions: { value: () => ({ ...mockWindow, scale: 3 }) },
  });
});
jest.mock('../modules/opax-duo', () => ({
  OpaxDuo: null,
  ReservedRegionView: null,
}));
jest.mock('../src/api/runtime', () => ({ apiClient: { get: jest.fn() } }));
jest.mock('../src/features/money/map/MoneyMap', () => ({
  MoneyMap: jest.fn(() => null),
}));
jest.mock('../src/features/money/hooks', () => ({
  ...jest.requireActual('../src/features/money/hooks'),
  useFirstScreenReader: () => false,
}));
jest.mock('react-native-gesture-handler', () =>
  jest.requireActual('./gesture-mock'),
);
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: jest.requireActual('react-native').View,
  SafeAreaInsetsContext: jest
    .requireActual('react')
    .createContext({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
const mockParams: Record<string, string> = {};
const mockRouter = {
  push: jest.fn(),
  replace: jest.fn(),
  setParams: jest.fn(),
};
const mockNavigation = {
  setParams: jest.fn((next: Record<string, string | undefined>) => {
    for (const [key, value] of Object.entries(next))
      if (value === undefined) delete mockParams[key];
      else mockParams[key] = value;
  }),
  isFocused: () => true,
  setOptions: jest.fn(),
};
jest.mock('expo-router', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const Native =
    jest.requireActual<typeof import('react-native')>('react-native');
  const Wrap = ({ children, ...props }: { children?: React.ReactNode }) =>
    React.createElement(Native.View, props, children);
  return {
    Link: Object.assign(Wrap, {
      Trigger: Wrap,
      Preview: () => null,
      Menu: Wrap,
      MenuAction: Wrap,
    }),
    get router() {
      return mockRouter;
    },
    useLocalSearchParams: () => ({ ...mockParams }),
    useRouter: () => mockRouter,
    useNavigation: () => mockNavigation,
    useFocusEffect: () => undefined,
    useSegments: () => [],
    Stack: { Screen: () => null },
  };
});

/**
 * A device at its largest text size. `stage` is the screen under the opaque
 * bar; `bottom` is the band under the panel (home indicator and tab bar).
 * The folded Duo's outer display (466 x 678) reports compact traits with
 * vertical bars, which makes it an adaptive device; the open Duo's inner
 * display (669 x 951) is a regular one.
 */
interface Device {
  name: string;
  os: 'ios' | 'android';
  width: number;
  height: number;
  stage: number;
  bottom: number;
  fontScale: number;
  duo?: 'folded' | 'open';
}
const AX5 = 3.571;
const devices: Device[] = [
  {
    name: 'iPhone 17 Pro at AX5',
    os: 'ios',
    width: 402,
    height: 874,
    stage: 758,
    bottom: 83,
    fontScale: AX5,
  },
  {
    name: 'iPhone SE at AX5',
    os: 'ios',
    width: 375,
    height: 667,
    stage: 603,
    bottom: 49,
    fontScale: AX5,
  },
  {
    name: 'folded iPhone Duo at AX5',
    os: 'ios',
    width: 466,
    height: 678,
    stage: 570,
    bottom: 83,
    fontScale: AX5,
    duo: 'folded',
  },
  {
    name: 'open iPhone Duo at AX5',
    os: 'ios',
    width: 669,
    height: 951,
    stage: 835,
    bottom: 83,
    fontScale: AX5,
    duo: 'open',
  },
  // Android's largest font scale is 200%.
  {
    name: 'Android phone at 200%',
    os: 'android',
    width: 412,
    height: 915,
    stage: 827,
    bottom: 80,
    fontScale: 2,
  },
  {
    name: 'small Android phone at 200%',
    os: 'android',
    width: 360,
    height: 640,
    stage: 552,
    bottom: 80,
    fontScale: 2,
  },
];
/** The card's and the panel's heights uncapped: modest, a screenful, far over. */
const naturals = [
  { card: 260, peek: 180 },
  { card: 640, peek: 420 },
  { card: 1500, peek: 1100 },
];
const stackHeight = (os: Device['os']) => (os === 'android' ? 206 : 190);
const rowHeight = (os: Device['os']) => (os === 'android' ? 52 : 48);

const osDescriptor = Object.getOwnPropertyDescriptor(Platform, 'OS')!;
let trees: TestRenderer.ReactTestRenderer[] = [];
beforeEach(() => {
  jest.clearAllMocks();
  Object.keys(mockParams).forEach((key) => delete mockParams[key]);
  jest.mocked(apiClient.get).mockImplementation(async (path, decode) => ({
    data: decode(pinned(path)),
    stale: false,
    asOf: '2026-09-21',
    savedAt: 1,
  }));
});
afterEach(() => {
  act(() => {
    trees.forEach((tree) => tree.unmount());
    setWindowTraitsOverride(null);
  });
  trees = [];
  resetAdaptiveDeviceForTests();
  Object.defineProperty(Platform, 'OS', osDescriptor);
});

async function mount(device: Device) {
  mockWindow = {
    width: device.width,
    height: device.height,
    fontScale: device.fontScale,
  };
  Object.defineProperty(Platform, 'OS', {
    configurable: true,
    value: device.os,
  });
  setWindowTraitsOverride(
    device.duo === 'open'
      ? { horizontal: 'regular', vertical: 'regular', foldable: true }
      : device.duo === 'folded'
        ? { horizontal: 'compact', vertical: 'regular', verticalBars: true }
        : { horizontal: 'compact', vertical: 'regular' },
  );
  resetAdaptiveDeviceForTests();
  let tree!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    tree = TestRenderer.create(
      withNavigationOptions(
        <SafeAreaInsetsContext.Provider
          value={{ top: 0, left: 0, right: 0, bottom: device.bottom }}
        >
          <MoneyScreen />
        </SafeAreaInsetsContext.Provider>,
        () => undefined,
      ),
    );
  });
  trees.push(tree);
  return tree.root;
}

const flat = (node: ReactTestInstance) =>
  StyleSheet.flatten(node.props.style) ?? {};
/** The column above the map that holds the card (its top padding is 8). */
const topOf = (root: ReactTestInstance) =>
  root
    .findAllByType(View)
    .find((node) => node.props.onLayout && flat(node).paddingTop === 8)!;
const controlsOf = (root: ReactTestInstance) =>
  root.findAllByType(MoneyMapControls)[0];

/**
 * Reports the layout native would: the stage, the card clamped to its own
 * cap, the controls at their size and the panel clamped to its cap, until
 * the caps stop moving.
 */
function settle(
  root: ReactTestInstance,
  device: Device,
  natural: { card: number; peek: number },
) {
  act(() =>
    root.findByProps({ testID: 'money-screen' }).props.onLayout({
      nativeEvent: { layout: { width: device.width, height: device.stage } },
    }),
  );
  // The panel measures its own content: its peek adds the handle and a block.
  const content = root
    .findByType(MoneyMapPanel)
    .findByType(ScrollView)
    .findAllByType(View)
    .find((node) => node.props.onLayout)!;
  act(() =>
    content.props.onLayout({
      nativeEvent: { layout: { height: natural.peek - 20 - 16 } },
    }),
  );
  for (let i = 0; i < 5; i++) {
    const top = topOf(root);
    const cap = flat(top).maxHeight as number | undefined;
    act(() =>
      top.props.onLayout({
        nativeEvent: {
          layout: { height: Math.min(natural.card, cap ?? Infinity) },
        },
      }),
    );
    const controls = controlsOf(root);
    if (controls)
      act(() =>
        controls.parent!.props.onLayout({
          nativeEvent: {
            layout: {
              height: controls.props.horizontal
                ? rowHeight(device.os)
                : stackHeight(device.os),
            },
          },
        }),
      );
    const panel = root.findByType(MoneyMapPanel);
    const shown = Math.min(natural.peek, panel.props.maxHeight ?? Infinity);
    act(() =>
      panel.parent!.props.onLayout({
        nativeEvent: {
          layout: { y: device.stage - device.bottom - shown, height: shown },
        },
      }),
    );
  }
}

/** Where the controls and the panel sit, in the stage's points. */
function frames(
  root: ReactTestInstance,
  device: Device,
  natural: { card: number; peek: number },
) {
  const chrome = flat(root.findByProps({ testID: 'money-map-chrome' }));
  const managed = typeof chrome.height === 'number';
  const chromeTop = managed ? (chrome.top as number) : 0;
  const windowBottom = managed
    ? chromeTop + (chrome.height as number)
    : device.stage - device.bottom;
  const controls = controlsOf(root)!;
  const host = flat(controls.parent!);
  const controlsTop = chromeTop + (host.top as number);
  const controlsBottom =
    controlsTop +
    (controls.props.horizontal ? rowHeight(device.os) : stackHeight(device.os));
  const panel = root.findByType(MoneyMapPanel);
  const panelTop =
    windowBottom - Math.min(natural.peek, panel.props.maxHeight ?? Infinity);
  return { controlsTop, controlsBottom, panelTop, windowBottom, host };
}

describe.each(devices)('$name', (device) => {
  test('the size is an accessibility size', () => {
    expect(isAccessibilityCategory(device.fontScale)).toBe(true);
  });

  test.each(naturals)(
    'search and zoom lie inside the visible window with a $card pt card and a $peek pt panel',
    async (natural) => {
      const root = await mount(device);
      settle(root, device, natural);
      const { controlsTop, controlsBottom, panelTop, windowBottom, host } =
        frames(root, device, natural);
      // Under the card's top edge, above the panel, inside the window.
      expect(controlsTop).toBeGreaterThanOrEqual(0);
      expect(controlsBottom).toBeLessThanOrEqual(panelTop);
      expect(controlsBottom).toBeLessThanOrEqual(windowBottom);
      expect(host.right ?? host.left).toBe(16);
      const ids = controlsOf(root)!
        .findAllByType(IconButton)
        .map((b) => b.props.testID);
      expect(ids).toEqual(
        expect.arrayContaining([
          'money-map-search',
          'money-map-zoom-in',
          'money-map-zoom-out',
        ]),
      );
      // What the caps cut off stays reachable by scrolling.
      const top = topOf(root);
      const cap = flat(top).maxHeight as number;
      expect(cap).toBeGreaterThanOrEqual(minimumTarget);
      if (natural.card > cap)
        expect(top.findAllByType(ScrollView)).toHaveLength(1);
      const panel = root.findByType(MoneyMapPanel);
      if (natural.peek > panel.props.maxHeight)
        expect(panel.findByType(ScrollView).props.scrollEnabled).toBe(true);
    },
  );
});

test('a focused disc keeps search and zoom in view on the iPhone SE at AX5', async () => {
  mockParams.select = 'donor:mineralogy';
  const device = devices[1]!;
  const natural = { card: 640, peek: 760 };
  const root = await mount(device);
  expect(root.findByType(MoneyMapPanel).props.focus.node.id).toBe(
    'donor:mineralogy',
  );
  settle(root, device, natural);
  const { controlsBottom, panelTop } = frames(root, device, natural);
  expect(controlsBottom).toBeLessThanOrEqual(panelTop);
});

test('expanding the panel holds the card still; the search card takes the band’s room', async () => {
  const device = devices[0]!;
  const natural = { card: 640, peek: 420 };
  const root = await mount(device);
  settle(root, device, natural);
  const visible = device.stage - device.bottom;
  const atRest = flat(topOf(root)).maxHeight as number;
  expect(atRest).toBe(Math.floor((visible - 190 - 32) / 2));

  act(() => root.findByType(MoneyMapPanel).props.onExpanded(true));
  settle(root, device, natural);
  expect(controlsOf(root)).toBeUndefined();
  expect(flat(topOf(root)).maxHeight).toBe(atRest);
  expect(root.findByType(MoneyMapPanel).props.maxHeight).toBe(
    visible - 32 - atRest,
  );

  act(() => root.findByType(MoneyMapPanel).props.onExpanded(false));
  settle(root, device, natural);
  act(() => controlsOf(root)!.props.onSearch());
  settle(root, device, natural);
  const top = topOf(root);
  expect(flat(top).maxHeight).toBe(Math.floor((visible - 32) / 2));
  expect(top.findByType(ScrollView).findAllByType(MoneyMapSearch)).toHaveLength(
    1,
  );
});

test('a regular layout at AX5 keeps its own caps, which leave the band room', async () => {
  const device = devices.find((d) => d.duo === 'open')!;
  const natural = { card: 1500, peek: 1100 };
  const root = await mount(device);
  settle(root, device, natural);
  const chrome = flat(root.findByProps({ testID: 'money-map-chrome' }));
  const top = flat(topOf(root)).maxHeight as number;
  const pose = mapControlLayout(
    {
      x: 0,
      y: 0,
      width: device.width,
      height: device.stage - device.bottom,
    },
    emptyReservedRegions,
    top,
    stackHeight('ios'),
  );
  expect(chrome.height).toBe(pose.controls.height);
  expect(top).toBe(pose.topMaxHeight);
  expect(root.findByType(MoneyMapPanel).props.maxHeight).toBe(
    pose.panelMaxHeight,
  );
});

test('below accessibility sizes the phone card keeps its own height', async () => {
  const root = await mount({ ...devices[0]!, fontScale: 1.353 });
  settle(root, devices[0]!, { card: 220, peek: 140 });
  expect(flat(topOf(root)).maxHeight).toBeUndefined();
  expect(topOf(root).findAllByType(ScrollView)).toHaveLength(0);
  expect(root.findByType(MoneyMapPanel).props.maxHeight).toBeUndefined();
});

test.each(['map', 'expanded', 'search'] as const)(
  'largeTextLimits (%s): the card, the band and the panel fit whatever the card asks',
  (state: ChromeState) => {
    for (const height of [300, 487, 554, 675, 747, 1100])
      for (const band of [48, 190, 206])
        for (const card of [0, 100, 400, 2000]) {
          const shown = state === 'map' ? band : 0;
          if (height - shown - 32 < minimumTarget * 2) continue;
          const first = largeTextLimits(height, 0, band, state);
          const top = Math.min(card, first.topMaxHeight);
          const { topMaxHeight, panelMaxHeight } = largeTextLimits(
            height,
            top,
            band,
            state,
          );
          expect(topMaxHeight).toBe(first.topMaxHeight);
          expect(top + 16 + shown + 16 + panelMaxHeight).toBeLessThanOrEqual(
            height,
          );
          // The panel always keeps at least half of what it shares.
          expect(panelMaxHeight).toBeGreaterThanOrEqual(
            Math.floor((height - shown - 32) / 2),
          );
        }
  },
);
