import { act } from 'react';
import TestRenderer, { type ReactTestInstance } from 'react-test-renderer';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { apiClient } from '../src/api/runtime';
import {
  resetAdaptiveDeviceForTests,
  setWindowTraitsOverride,
} from '../src/design/adaptive';
import { rhythm } from '../src/design/tokens';
import MoneyScreen from '../src/features/money/MoneyScreen';
import { MoneyMapControls } from '../src/features/money/map/MoneyMapControls';
import { MoneyMapPanel } from '../src/features/money/map/MoneyMapPanel';
import { MoneyMap } from '../src/features/money/map/MoneyMap';
import { visibleLabels } from '../src/features/money/map/labels';
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
 * Sweep 2 lane C and BACKLOG D7: the money map at every size. The harness
 * is money-map-ax5's (which must pass unchanged); these are the frames the
 * sweep 2 critique judged, as render tests.
 *
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
  /** A regular-width window with no fold, like an iPad. */
  regular?: boolean;
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
  // AX3 shares the accessibility-size layout; its reach holds there too.
  {
    name: 'iPhone 17 Pro at AX3',
    os: 'ios',
    width: 402,
    height: 874,
    stage: 758,
    bottom: 83,
    fontScale: 2.643,
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

let observed: Record<string, unknown> = {};
async function mount(device: Device) {
  observed = {};
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
      : device.regular
        ? { horizontal: 'regular', vertical: 'regular' }
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
        (options) => {
          observed = options;
        },
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

const lastMap = () => jest.mocked(MoneyMap).mock.calls.at(-1)![0];
/** The height the map is drawn in: the stage less the chrome over it. */
const sceneHeight = (device: Device) => {
  const { insets } = lastMap();
  return device.stage - insets.top - insets.bottom;
};
const iPhone = devices[0]!;
const foldedDuo = devices.find((d) => d.duo === 'folded')!;
const LARGE = 1.235;

describe('BACKLOG D7: the folded Duo (466 x 678) keeps room for the map', () => {
  test.each([
    ['the default size', 1],
    ['Large', LARGE],
    ['AX3', 2.643],
    ['AX5', AX5],
  ] as const)('at %s', async (_name, fontScale) => {
    const device = { ...foldedDuo, fontScale };
    const visible = device.stage - device.bottom;
    for (const natural of naturals) {
      const root = await mount(device);
      settle(root, device, natural);
      // About 110 pt at the default size and none at large text before.
      expect(sceneHeight(device)).toBeGreaterThanOrEqual(
        Math.floor(visible * 0.3),
      );
      // The controls stay whole between the card and the panel.
      const { controlsBottom, panelTop } = frames(root, device, natural);
      expect(controlsBottom).toBeLessThanOrEqual(panelTop);
      act(() => trees.pop()!.unmount());
    }
  });
});

describe('sweep 2 item 5: the money map at every size', () => {
  test('the bar reads "Money map" in Map mode (5.5)', async () => {
    await mount(iPhone);
    expect(observed.headerTitle).toBe('Money map');
  });

  test('with a focus at AX3 the panel ends above the tab bar before its host reports (5.4)', async () => {
    mockParams.select = 'donor:mineralogy';
    const device = { ...iPhone, fontScale: 2.643 };
    const root = await mount(device);
    act(() =>
      root.findByProps({ testID: 'money-screen' }).props.onLayout({
        nativeEvent: { layout: { width: device.width, height: device.stage } },
      }),
    );
    const content = root
      .findByType(MoneyMapPanel)
      .findByType(ScrollView)
      .findAllByType(View)
      .find((node) => node.props.onLayout)!;
    act(() =>
      content.props.onLayout({ nativeEvent: { layout: { height: 900 } } }),
    );
    const top = topOf(root);
    const cap = flat(top).maxHeight as number;
    act(() => top.props.onLayout({ nativeEvent: { layout: { height: cap } } }));
    // The panel host has not reported where it ended (it would be under
    // the tab bar if it overflowed): the safe inset still bounds the panel.
    const panel = root.findByType(MoneyMapPanel).props.maxHeight as number;
    expect(cap + rhythm.block + 190 + rhythm.block + panel).toBeLessThanOrEqual(
      device.stage - device.bottom,
    );
  });

  test('with a tall focus at Large all four controls stay above the panel (5.6)', async () => {
    mockParams.select = 'donor:mineralogy';
    const device = { ...iPhone, fontScale: LARGE };
    const natural = { card: 200, peek: 600 };
    const root = await mount(device);
    settle(root, device, natural);
    const { controlsBottom, panelTop } = frames(root, device, natural);
    expect(controlsBottom).toBeLessThanOrEqual(panelTop);
    // The panel scrolls what it no longer shows.
    expect(
      root.findByType(MoneyMapPanel).findByType(ScrollView).props.scrollEnabled,
    ).toBe(true);
  });

  test('a short panel at the default size keeps its own height (5.6)', async () => {
    const root = await mount({ ...iPhone, fontScale: 1 });
    settle(root, iPhone, { card: 220, peek: 140 });
    expect(root.findByType(MoneyMapPanel).props.maxHeight).toBeUndefined();
  });

  test('the map is drawn only between the card and the panel (5.6)', async () => {
    for (const fontScale of [1, 2.643]) {
      const device = { ...iPhone, fontScale };
      const natural = { card: 260, peek: 180 };
      const root = await mount(device);
      settle(root, device, natural);
      const { clip, insets } = lastMap();
      const card = Math.min(
        natural.card,
        (flat(topOf(root)).maxHeight as number | undefined) ?? Infinity,
      );
      expect(clip).toEqual({
        top: card,
        bottom: insets.bottom - rhythm.tight,
      });
      // The panel's top edge, measured from the stage's foot.
      const panel = root.findByType(MoneyMapPanel).props.maxHeight as
        | number
        | undefined;
      expect(clip!.bottom).toBe(
        device.bottom + Math.min(natural.peek, panel ?? Infinity),
      );
      act(() => trees.pop()!.unmount());
    }
  });

  test('a regular width (iPad) does not clip the map beside its card column', async () => {
    const iPad: Device = {
      name: 'iPad Air 11-inch',
      os: 'ios',
      width: 820,
      height: 1180,
      stage: 1100,
      bottom: 65,
      fontScale: 1,
      regular: true,
    };
    const root = await mount(iPad);
    settle(root, iPad, { card: 260, peek: 180 });
    expect(lastMap().clip).toBeNull();
    act(() => trees.pop()!.unmount());
    // The same screen at a compact width still clips.
    const phone = { ...iPhone, fontScale: 1 };
    const compact = await mount(phone);
    settle(compact, phone, { card: 260, peek: 180 });
    expect(lastMap().clip).not.toBeNull();
  });

  test('a capped card flashes its scroll indicator once when it runs past the cap (5.3)', async () => {
    const flash = jest.fn();
    const root = await mount(iPhone);
    settle(root, iPhone, { card: 1500, peek: 420 });
    const scroll = topOf(root).findByType(ScrollView);
    const cap = flat(topOf(root)).maxHeight as number;
    const instance = scroll.instance as { flashScrollIndicators?: () => void };
    instance.flashScrollIndicators = flash;
    act(() => scroll.props.onContentSizeChange(300, cap - 20));
    expect(flash).not.toHaveBeenCalled();
    act(() => scroll.props.onContentSizeChange(300, 1500));
    act(() => scroll.props.onContentSizeChange(300, 1600));
    expect(flash).toHaveBeenCalledTimes(1);
  });
});

test('no name is drawn up under the card the map is clipped beneath (5.2)', () => {
  const slot = (key: string, y: number) => ({
    key,
    kind: 'name' as const,
    x: 100,
    y,
    r: 4,
    text: 'Example',
    ink: '#000',
  });
  const slots = [slot('under', 110), slot('clear', 300)];
  const camera = { tx: 0, ty: 0, k: 1 };
  const box = { width: 120, height: 22 };
  const viewport = { width: 400, height: 800 };
  expect(Object.keys(visibleLabels(slots, camera, viewport, box))).toEqual([
    'under',
    'clear',
  ]);
  expect(
    Object.keys(
      visibleLabels(slots, camera, { ...viewport, clipTop: 120 }, box),
    ),
  ).toEqual(['clear']);
});
