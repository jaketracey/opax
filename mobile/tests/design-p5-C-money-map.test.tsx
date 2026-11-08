import { act } from 'react';
import TestRenderer, { type ReactTestInstance } from 'react-test-renderer';
import { AccessibilityInfo, Dimensions, StyleSheet } from 'react-native';
import { apiClient } from '../src/api/runtime';
import MoneyScreen from '../src/features/money/MoneyScreen';
import {
  NativeMoneyMap,
  moneyMapLabel,
  moneySceneHeight,
} from '../src/features/money/NativeMoneyMap';
import { NativeMoneyScene } from '../src/features/money/NativeMoneyScene';
import { decodeMoneyGraph } from '../src/features/money/data';
import { defaultMoneyFilters, moneyView } from '../src/features/money/view';
import { Button, FigureBlock, SegmentedPicker } from '../src/design/primitives';
import { minimumTarget } from '../src/design/tokens';
import { pinned } from './pinned';

// Design programme pass 5 (docs/design/review-2026-10/pass5-app-critique.md)
// as the money map's redesign settles it (specs/money.md 2.13): P3-15, the
// scene comes early at every text size, after the title, the pop-up, one
// summary line and the List | Map picker, never behind a meta line; P3-17
// is superseded: "Fit map" is a 44 pt round button inside the scene's
// bottom-trailing corner on every device, never a text button under it.
let mockAccessibilitySize = false;
let mockRegular = false;
jest.mock('../src/design/accessibility', () => ({
  ...jest.requireActual('../src/design/accessibility'),
  useAccessibilitySize: () => mockAccessibilitySize,
  useReduceMotionSetting: () => true,
}));
jest.mock('../src/design/adaptive', () => {
  const actual = jest.requireActual('../src/design/adaptive');
  return {
    ...actual,
    useLayout: () => ({
      ...actual.useLayout(),
      regular: mockRegular,
      size: mockRegular ? 'regular' : 'compact',
      window: { width: mockRegular ? 1180 : 402, height: 900 },
    }),
  };
});
jest.mock('../src/api/runtime', () => ({ apiClient: { get: jest.fn() } }));
jest.mock('expo-gl', () => ({
  GLView: jest.requireActual('react-native').View,
}));
jest.mock('../src/features/money/NativeMoneyScene', () => ({
  NativeMoneyScene: jest.fn().mockImplementation(() => ({
    render: jest.fn(),
    endFrame: jest.fn(),
    verifyPixels: jest.fn(() => 100),
    diagnostics: () => ({ completedFrames: 0 }),
    labels: () => [],
    dispose: jest.fn(),
    setView: jest.fn(),
    setReducedMotion: jest.fn(),
    resize: jest.fn(),
    orbit: jest.fn(),
    zoom: jest.fn(),
    focus: jest.fn(),
    pick: () => null,
  })),
}));
// Each gesture records its configuration, so the test can read the offsets.
const mockGestures: { kind: string; calls: [string, unknown[]][] }[] = [];
jest.mock('react-native-gesture-handler', () => {
  const chain = (kind: string) => () => {
    const record = { kind, calls: [] as [string, unknown[]][] };
    mockGestures.push(record);
    const value: Record<string, unknown> = {};
    for (const name of [
      'maxPointers',
      'minPointers',
      'runOnJS',
      'activeOffsetX',
      'failOffsetY',
      'onBegin',
      'onUpdate',
      'onEnd',
      'onFinalize',
    ])
      value[name] = (...args: unknown[]) => {
        record.calls.push([name, args]);
        return value;
      };
    return value;
  };
  return {
    GestureHandlerRootView: jest.requireActual('react-native').View,
    GestureDetector: jest.requireActual('react-native').View,
    Gesture: {
      Pan: chain('pan'),
      Tap: chain('tap'),
      Pinch: chain('pinch'),
      Race: chain('race'),
      Simultaneous: chain('simultaneous'),
    },
  };
});
const mockParams: Record<string, string> = {};
jest.mock('expo-router', () => {
  const { createElement } = jest.requireActual('react');
  const { View } = jest.requireActual('react-native');
  const Wrap = ({ children }: { children?: unknown }) =>
    createElement(View, null, children);
  return {
    Link: Object.assign(Wrap, {
      Trigger: Wrap,
      Preview: () => null,
      Menu: Wrap,
      MenuAction: Wrap,
    }),
    useLocalSearchParams: () => mockParams,
    useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
    useNavigation: () => ({ setParams: jest.fn() }),
    router: { push: jest.fn(), setParams: jest.fn() },
    Stack: { Screen: () => null },
    useFocusEffect: (callback: () => () => void) =>
      jest.requireActual('react').useEffect(() => callback(), [callback]),
  };
});
jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(false);
jest
  .spyOn(AccessibilityInfo, 'addEventListener')
  .mockImplementation(() => ({ remove: jest.fn() }));

async function render(element: React.ReactElement) {
  let r!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    r = TestRenderer.create(element);
  });
  return r;
}
const host = (root: ReactTestInstance, testID: string) =>
  root.findAll(
    (n) => typeof n.type === 'string' && n.props.testID === testID,
  )[0];
const index = (
  root: ReactTestInstance,
  match: (n: ReactTestInstance) => boolean,
) => root.findAll(() => true).findIndex(match);
/** The first element carrying the ID: native controls have no host view. */
const indexOf = (root: ReactTestInstance, testID: string) =>
  index(root, (n) => n.props.testID === testID);
/** Lays the canvas out and hands it a GL context, as the device would. */
async function draw(r: TestRenderer.ReactTestRenderer) {
  await act(async () =>
    host(r.root, 'money-map-canvas')!.props.onLayout({
      nativeEvent: { layout: { width: 402, height: 402 } },
    }),
  );
  const gl = r.root.find(
    (n) => typeof n.type === 'string' && !!n.props.onContextCreate,
  );
  await act(async () =>
    gl.props.onContextCreate({ getError: () => 0, NO_ERROR: 0 }),
  );
}
const picker = (root: ReactTestInstance) =>
  root
    .findAllByType(SegmentedPicker)
    .find((p) => p.props.testID === 'money-view-toggle')!;
beforeEach(() => {
  mockAccessibilitySize = false;
  mockRegular = false;
  mockGestures.length = 0;
  Object.keys(mockParams).forEach((key) => delete mockParams[key]);
  jest.mocked(apiClient.get).mockImplementation(async (path, decode) => ({
    data: decode(pinned(path)),
    stale: false,
    asOf: '2026-09-21',
    savedAt: 1,
  }));
});

describe('P3-15: the scene comes early at every text size', () => {
  test.each([
    ['standard sizes', false],
    ['accessibility sizes', true],
  ])(
    'at %s: title, pop-up, summary, picker, then the scene and its figures',
    async (_name, large) => {
      mockAccessibilitySize = large;
      const r = await render(<MoneyScreen />);
      expect(picker(r.root).props.value).toBe('3d');
      const map = index(r.root, (n) => n.type === NativeMoneyMap);
      const donations = index(
        r.root,
        (n) => n.type === FigureBlock && n.props.testID === 'money-donations',
      );
      const order = [
        indexOf(r.root, 'money-title'),
        indexOf(r.root, 'money-jurisdiction'),
        indexOf(r.root, 'money-view-summary'),
        indexOf(r.root, 'money-view-toggle'),
        map,
        donations,
        indexOf(r.root, 'money-public-money'),
      ];
      for (const at of order) expect(at).toBeGreaterThanOrEqual(0);
      expect([...order].sort((a, b) => a - b)).toEqual(order);
      // One summary line, above the scene; no meta line follows it.
      expect(
        r.root.findAll(
          (n) =>
            typeof n.type === 'string' &&
            n.props.testID === 'money-view-summary',
        ),
      ).toHaveLength(1);
      // The scene keeps the iPhone height rule at every text size.
      const canvas = host(r.root, 'money-map-canvas')!;
      expect(StyleSheet.flatten(canvas.props.style).height).toBe(
        moneySceneHeight(Dimensions.get('window').width, false),
      );
      expect(StyleSheet.flatten(canvas.props.style).height).toBeLessThanOrEqual(
        440,
      );
      await act(async () => r.unmount());
    },
  );
  test('the retired controls and meta lines are gone from the map view', async () => {
    const r = await render(<MoneyScreen />);
    for (const retired of [
      'money-tiles',
      'money-list-records-toggle',
      'money-as-at',
      'money-end',
      'money-controls',
      'money-from-year',
      'money-to-year',
      'money-all-years',
      'money-gl-fallback',
      'money-gl-note',
    ])
      expect(r.root.findAll((n) => n.props.testID === retired)).toHaveLength(0);
    expect(
      r.root.findAllByType(Button).map((b) => b.props.label),
    ).not.toContain('Fit map');
    await act(async () => r.unmount());
  });
  test('the List segment replaces the scene with the donor list', async () => {
    const r = await render(<MoneyScreen />);
    expect(
      picker(r.root).props.options.map(
        (o: { label: string; testID: string }) => [o.label, o.testID],
      ),
    ).toEqual([
      ['List', 'money-mode-list'],
      ['Map', 'money-mode-3d'],
    ]);
    await act(async () => picker(r.root).props.onChange('list'));
    expect(r.root.findAllByType(NativeMoneyMap)).toHaveLength(0);
    expect(host(r.root, 'money-donors')).toBeDefined();
    await act(async () => r.unmount());
  });
});

describe('when the scene can’t be drawn', () => {
  test('the screen shows the List view, one footnote and Try again', async () => {
    const r = await render(<MoneyScreen />);
    await act(async () =>
      r.root.findByType(NativeMoneyMap).props.onUnavailable(),
    );
    expect(picker(r.root).props.value).toBe('list');
    expect(r.root.findAllByType(NativeMoneyMap)).toHaveLength(0);
    expect(host(r.root, 'money-gl-note')).toBeDefined();
    const retry = r.root
      .findAllByType(Button)
      .find((b) => b.props.testID === 'money-gl-retry')!;
    expect(retry).toBeDefined();
    // The note sits under the picker, before the list.
    expect(indexOf(r.root, 'money-gl-note')).toBeGreaterThan(
      indexOf(r.root, 'money-view-toggle'),
    );
    expect(indexOf(r.root, 'money-gl-note')).toBeLessThan(
      indexOf(r.root, 'money-donors'),
    );
    await act(async () => retry.props.onPress());
    expect(picker(r.root).props.value).toBe('3d');
    expect(host(r.root, 'money-gl-note')).toBeUndefined();
    expect(r.root.findAllByType(NativeMoneyMap)).toHaveLength(1);
    await act(async () => r.unmount());
  });
});

describe('P3-17 (superseded): "Fit map" inside the scene', () => {
  const graph = decodeMoneyGraph(pinned('/graph/money.json'));
  const view = moneyView(graph, defaultMoneyFilters(graph));
  const map = (
    props: Partial<React.ComponentProps<typeof NativeMoneyMap>> = {},
  ) => (
    <NativeMoneyMap
      graph={graph}
      view={view}
      active
      onSelect={jest.fn()}
      {...props}
    />
  );
  test.each([
    ['an iPhone', false],
    ['a regular-width window', true],
  ])(
    'on %s it is a 44 pt round button at the scene’s bottom right',
    async (_name, regular) => {
      mockRegular = regular;
      const r = await render(map());
      const fit = host(r.root, 'money-fit')!;
      expect(fit.props.accessibilityLabel).toBe('Fit map');
      expect(fit.props.accessibilityRole).toBe('button');
      const style = StyleSheet.flatten(fit.props.style);
      expect(style).toMatchObject({
        position: 'absolute',
        right: expect.any(Number),
        bottom: expect.any(Number),
        width: minimumTarget,
        height: minimumTarget,
        borderRadius: minimumTarget / 2,
      });
      expect(style.top).toBeUndefined();
      // The scene's gestures never hold the button: it is the canvas's sibling.
      const canvas = host(r.root, 'money-map-canvas')!;
      expect(canvas.findAll((n) => n === fit)).toHaveLength(0);
      expect(r.root.findAllByType(Button)).toHaveLength(0);
      // The scene: one image for VoiceOver, at its height rule.
      expect(canvas.props.accessible).toBe(true);
      expect(canvas.props.accessibilityRole).toBe('image');
      expect(canvas.props.accessibilityLabel).toBe(moneyMapLabel);
      expect(StyleSheet.flatten(canvas.props.style).height).toBe(
        moneySceneHeight(Dimensions.get('window').width, regular),
      );
      await act(async () => r.unmount());
    },
  );
  test('it fits the whole map without selecting anything', async () => {
    const onSelect = jest.fn();
    const r = await render(map({ onSelect }));
    await draw(r);
    const scene = jest.mocked(NativeMoneyScene).mock.results.at(-1)!.value as {
      focus: jest.Mock;
    };
    await act(async () =>
      r.root
        .findAll((n) => n.props.testID === 'money-fit' && !!n.props.onPress)[0]!
        .props.onPress(),
    );
    expect(scene.focus).toHaveBeenLastCalledWith(null);
    expect(onSelect).not.toHaveBeenCalled();
    await act(async () => r.unmount());
  });
});

describe('the scene’s height and gestures', () => {
  test('as tall as the window is wide to 440 pt on iPhone; 560 pt on iPad', () => {
    expect(moneySceneHeight(402, false)).toBe(402);
    expect(moneySceneHeight(375.4, false)).toBe(375);
    expect(moneySceneHeight(744, false)).toBe(440);
    expect(moneySceneHeight(1180, true)).toBe(560);
    expect(moneySceneHeight(320, true)).toBe(560);
  });
  test('a one-finger pan waits for 10 pt sideways so a vertical drag scrolls the page', async () => {
    const graph = decodeMoneyGraph(pinned('/graph/money.json'));
    const view = moneyView(graph, defaultMoneyFilters(graph));
    const r = await render(
      <NativeMoneyMap graph={graph} view={view} active onSelect={jest.fn()} />,
    );
    const pans = mockGestures.filter((g) => g.kind === 'pan');
    const config = (g: (typeof mockGestures)[number]) =>
      Object.fromEntries(g.calls.map(([name, args]) => [name, args[0]]));
    const one = pans.map(config).find((c) => c.maxPointers === 1)!;
    expect(one).toMatchObject({
      activeOffsetX: [-10, 10],
      failOffsetY: [-10, 10],
    });
    // Two fingers orbit in any direction; a pinch zooms.
    expect(pans.map(config).some((c) => c.minPointers === 2)).toBe(true);
    expect(mockGestures.some((g) => g.kind === 'pinch')).toBe(true);
    await act(async () => r.unmount());
  });
  test('a failed GL context draws nothing and hands back to the screen', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.mocked(NativeMoneyScene).mockImplementationOnce(() => {
      throw new Error('no GL');
    });
    const graph = decodeMoneyGraph(pinned('/graph/money.json'));
    const view = moneyView(graph, defaultMoneyFilters(graph));
    const onUnavailable = jest.fn();
    const r = await render(
      <NativeMoneyMap
        graph={graph}
        view={view}
        active
        onSelect={jest.fn()}
        onUnavailable={onUnavailable}
      />,
    );
    await draw(r);
    expect(onUnavailable).toHaveBeenCalledTimes(1);
    expect(r.toJSON()).toBeNull();
    await act(async () => r.unmount());
    warn.mockRestore();
  });
});
