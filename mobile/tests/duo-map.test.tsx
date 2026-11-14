import { act, type ReactElement } from 'react';
import TestRenderer from 'react-test-renderer';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { apiClient } from '../src/api/runtime';
import { decodeBoundary } from '../src/api/electorate-geometry';
import {
  resetAdaptiveDeviceForTests,
  setWindowTraitsOverride,
  useLayout,
} from '../src/design/adaptive';
import {
  BarSeries,
  clearChartLabel,
  StageTimeline,
} from '../src/design/charts';
import { SizedCanvas } from '../src/design/canvas';
import { IconButton } from '../src/design/primitives';
import { Text } from '../src/design/text';
import {
  emptyReservedRegions,
  type Rect,
  type Region,
  type ReservedRegions,
} from '../src/design/fold';
import { ReservedRegionsProvider } from '../src/design/fold-area';
import { OutlineMap } from '../src/features/electorate-map/OutlineMap';
import MoneyScreen from '../src/features/money/MoneyScreen';
import { MoneyMap, forgetCameras } from '../src/features/money/map/MoneyMap';
import { MoneyMapControls } from '../src/features/money/map/MoneyMapControls';
import { MoneyMapLabels } from '../src/features/money/map/MoneyMapLabels';
import { MoneyMapPanel } from '../src/features/money/map/MoneyMapPanel';
import { MoneyMapSearch } from '../src/features/money/map/MoneyMapSearch';
import { layoutBounds, layoutFor } from '../src/features/money/map/layout';
import {
  cameraAt,
  fitCamera,
  reservedViewport,
  resizeCamera,
  screenToWorld,
  viewportCentre,
  worldToScreen,
  type Camera,
  type Viewport,
} from '../src/features/money/map/camera';
import {
  blockedMapPoint,
  HitGrid,
  pickMapPoint,
} from '../src/features/money/map/hit';
import { mapControlLayout } from '../src/features/money/map/regions';
import { TapRouter } from '../src/features/money/map/taps';
import { FieldClearance } from '../src/features/seat/FieldClearance';
import { withNavigationOptions } from './navigation-options';
import { pinned } from './pinned';

let mockWidth = 626;
let mockHeight = 890;
jest.mock('react-native', () => {
  const actual = jest.requireActual('react-native');
  return Object.defineProperties(Object.create(actual), {
    Platform: { value: { ...actual.Platform, isPad: false } },
    useWindowDimensions: {
      value: () => ({
        width: mockWidth,
        height: mockHeight,
        scale: 2,
        fontScale: 1,
      }),
    },
  });
});
jest.mock('../modules/opax-duo', () => ({
  OpaxDuo: null,
  ReservedRegionView: null,
}));
jest.mock('../src/api/runtime', () => ({ apiClient: { get: jest.fn() } }));
jest.mock('../src/features/money/money-probe', () => ({
  MoneyTestHooks: () => null,
  useMoneyMapProbe: () => undefined,
  useMoneyMapPerf: () => null,
}));
jest.mock('../src/features/money/hooks', () => ({
  ...jest.requireActual('../src/features/money/hooks'),
  useFirstScreenReader: () => false,
}));
jest.mock('../src/features/money/map/layout', () => {
  const actual = jest.requireActual('../src/features/money/map/layout');
  return {
    ...actual,
    layoutFor: (...args: Parameters<typeof actual.layoutFor>) => {
      const layout = actual.layoutFor(...args);
      layout.tick(1000);
      return layout;
    },
  };
});
jest.mock('react-native-gesture-handler', () =>
  jest.requireActual('./gesture-mock'),
);
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: jest.requireActual('react-native').View,
  SafeAreaInsetsContext: jest
    .requireActual('react')
    .createContext({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('react-native-reanimated', () => {
  const actual = jest.requireActual('react-native-reanimated/mock');
  const React = jest.requireActual<typeof import('react')>('react');
  return {
    ...actual,
    useSharedValue: <T,>(initial: T) => {
      const ref = React.useRef({
        value: initial,
        get() {
          return this.value;
        },
        set(value: T) {
          this.value = value;
        },
      });
      return ref.current;
    },
  };
});
const mockParams: Record<string, string> = {};
const mockNavigation = {
  setOptions: jest.fn(),
  isFocused: () => true,
  setParams: (values: Record<string, string | undefined>) => {
    for (const [key, value] of Object.entries(values)) {
      if (value === undefined) delete mockParams[key];
      else mockParams[key] = value;
    }
  },
};
const mockRouter = {
  push: jest.fn(),
  replace: jest.fn(),
  setParams: jest.fn(),
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
    useNavigation: () => mockNavigation,
    useRouter: () => mockRouter,
    useFocusEffect: () => undefined,
    useSegments: () => [],
    Stack: { Screen: () => null },
  };
});

const bounds: Rect = { x: 0, y: 0, width: 626, height: 890 };
const vertical: Region = { x: 300, y: 0, width: 20, height: 890, active: true };
const horizontal: Region = {
  x: 0,
  y: 430,
  width: 626,
  height: 20,
  active: true,
};
const camera: Region = { x: 550, y: 0, width: 76, height: 70, active: true };
const book: ReservedRegions = { divisions: [vertical], occlusions: [] };
const laptop: ReservedRegions = { divisions: [horizontal], occlusions: [] };
const viewport: Viewport = {
  width: 626,
  height: 890,
  insets: { left: 0, right: 0, top: 0, bottom: 0 },
};
const world = { minX: -200, minY: -100, maxX: 200, maxY: 100 };
const intersects = (a: Rect, b: Rect) =>
  a.x < b.x + b.width &&
  a.x + a.width > b.x &&
  a.y < b.y + b.height &&
  a.y + a.height > b.y;
const traits = (regular: boolean) =>
  setWindowTraitsOverride({
    horizontal: regular ? 'regular' : 'compact',
    vertical: 'regular',
    foldable: true,
  });
let trees: TestRenderer.ReactTestRenderer[] = [];
function render(element: ReactElement) {
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(element);
  });
  trees.push(tree);
  return tree;
}
beforeEach(() => {
  jest.clearAllMocks();
  mockWidth = 626;
  mockHeight = 890;
  forgetCameras();
  resetAdaptiveDeviceForTests();
  traits(true);
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
  jest.useRealTimers();
});

test.each([
  ['book', book, { x: 473, y: 445 }],
  ['laptop', laptop, { x: 313, y: 215 }],
  ['camera', { divisions: [], occlusions: [camera] }, { x: 313, y: 480 }],
] as const)(
  'camera fits, flies and zooms around the clear %s focal region',
  (_name, regions, centre) => {
    const next = reservedViewport(viewport, regions);
    expect(viewportCentre(next)).toEqual(centre);
    expect(worldToScreen(fitCamera(world, next), 0, 0)).toEqual(centre);
    expect(
      worldToScreen(cameraAt({ tx: 0, ty: 0, k: 3 }, 25, 40, next), 25, 40),
    ).toEqual(centre);
    for (const obstacle of [...regions.divisions, ...regions.occlusions])
      expect(
        blockedMapPoint(centre.x, centre.y, {
          divisions: [],
          occlusions: [obstacle],
        }),
      ).toBe(false);
  },
);

test.each([
  ['book', book, vertical],
  ['laptop', laptop, horizontal],
  ['camera', { divisions: [], occlusions: [camera] }, camera],
] as const)(
  'all fixed controls fit wholly in the clear %s interaction region',
  (_name, regions, obstacle) => {
    const pose = mapControlLayout(bounds, regions, 160, 190);
    expect(intersects(pose.controls, obstacle)).toBe(false);
    expect(
      pose.panelMaxHeight + 160 + (pose.horizontal ? 48 : 190) + 32,
    ).toBeLessThanOrEqual(pose.controls.height);
    if (pose.laptop) expect(pose.controls.y).toBe(450);
    if (_name === 'book')
      expect(pose.controls.x + pose.controls.width).toBe(300);
  },
);

test('hit picking and single or double taps ignore the fold and camera, including a pending tap', () => {
  jest.useFakeTimers();
  const grid = new HitGrid(
    [310, 570, 200],
    [200, 20, 200],
    [15, 15, 15],
    [0, 1, 2],
  );
  const cam = { tx: 0, ty: 0, k: 1 };
  const regions = { ...book, occlusions: [camera] };
  expect(pickMapPoint(grid, cam, 310, 200, 14, regions)).toBeNull();
  expect(pickMapPoint(grid, cam, 570, 20, 14, regions)).toBeNull();
  expect(pickMapPoint(grid, cam, 200, 200, 14, regions)).toBe(2);
  const single = jest.fn(),
    double = jest.fn();
  let current = emptyReservedRegions;
  const taps = new TapRouter(
    single,
    double,
    undefined,
    (x, y) => !blockedMapPoint(x, y, current),
  );
  taps.tap(310, 200, 1000);
  current = regions;
  jest.runOnlyPendingTimers();
  expect(single).not.toHaveBeenCalled();
  expect(taps.tap(310, 200, 1100)).toBe('ignored');
  expect(taps.tap(310, 200, 1200)).toBe('ignored');
  expect(double).not.toHaveBeenCalled();
});

test('an unselected panned world centre and exact zoom survive outer and inner resizes', () => {
  const inner = reservedViewport(viewport, book);
  const outer = {
    width: 360,
    height: 560,
    insets: { left: 8, right: 30, top: 150, bottom: 180 },
  };
  const cam = cameraAt({ tx: 0, ty: 0, k: 2.7 }, 25, -40, inner);
  const out = resizeCamera(cam, inner, outer);
  const back = resizeCamera(out, outer, inner);
  expect(out.k).toBe(2.7);
  expect(back).toEqual(cam);
  const centre = viewportCentre(outer);
  expect(screenToWorld(out, centre.x, centre.y)).toEqual({ x: 25, y: -40 });
});

async function screen(
  regions = book,
  safe = { top: 0, bottom: 0, left: 0, right: 0 },
) {
  let tree!: TestRenderer.ReactTestRenderer;
  const make = (value: ReservedRegions) =>
    withNavigationOptions(
      <SafeAreaInsetsContext.Provider value={safe}>
        <ReservedRegionsProvider value={value}>
          <MoneyScreen />
        </ReservedRegionsProvider>
      </SafeAreaInsetsContext.Provider>,
      () => undefined,
    );
  await act(async () => {
    tree = TestRenderer.create(make(regions));
  });
  trees.push(tree);
  return { tree, make };
}
const stageLayout = (
  tree: TestRenderer.ReactTestRenderer,
  width: number,
  height: number,
) =>
  act(() => {
    tree.root
      .findByProps({ testID: 'money-screen' })
      .props.onLayout({ nativeEvent: { layout: { width, height } } });
    tree.root
      .findByProps({ testID: 'money-map-stage' })
      .props.onLayout({ nativeEvent: { layout: { width, height } } });
  });
const liveCamera = (tree: TestRenderer.ReactTestRenderer): Camera => {
  const { tx, ty, k } = tree.root.findByType(MoneyMapLabels).props;
  return { tx: tx.get(), ty: ty.get(), k: k.get() };
};

test('the mounted money map retains selection, exact zoom, focus, graph and fetch count from 626x890 to 360x560 and back', async () => {
  mockParams.select = 'party:Labor';
  const { tree, make } = await screen();
  stageLayout(tree, 626, 890);
  const stage = tree.root.findByType(MoneyMap);
  const graph = stage.props.graph;
  const layout = layoutFor(graph, 1);
  const selected = graph.nodes.findIndex(
    (n: { id: string }) => n.id === 'party:Labor',
  );
  const point = { x: layout.x[selected]!, y: layout.y[selected]! };
  const zoom = tree.root
    .findAllByType(IconButton)
    .find((n) => n.props.testID === 'money-map-zoom-in')!;
  act(() => zoom.props.onPress());
  const original = liveCamera(tree);
  const fetches = jest.mocked(apiClient.get).mock.calls.length;
  for (const [width, height, regions] of [
    [360, 560, emptyReservedRegions],
    [626, 890, book],
  ] as const) {
    mockWidth = width;
    mockHeight = height;
    await act(async () => {
      traits(width > 560);
      tree.update(make(regions));
    });
    stageLayout(tree, width, height);
    expect(tree.root.findByType(MoneyMap)).toBe(stage);
    expect(stage.props.focus).toBe('party:Labor');
    expect(stage.props.graph).toBe(graph);
    expect(layoutFor(graph, 2)).toBe(layout);
    expect(liveCamera(tree).k).toBe(original.k);
    const view = reservedViewport(
      { width, height, insets: stage.props.insets },
      regions,
    );
    const focused = worldToScreen(liveCamera(tree), point.x, point.y);
    expect(focused.x).toBeCloseTo(viewportCentre(view).x, 8);
    expect(focused.y).toBeCloseTo(viewportCentre(view).y, 8);
    expect(tree.root.findByType(MoneyMapPanel).props.focus.node.id).toBe(
      'party:Labor',
    );
  }
  expect(apiClient.get).toHaveBeenCalledTimes(fetches);
});

test.each([
  ['book', book],
  ['laptop', laptop],
  ['camera', { divisions: [], occlusions: [camera] }],
] as const)(
  'mounted chrome and panel use the clear %s region',
  async (_name, regions) => {
    const { tree } = await screen(regions);
    stageLayout(tree, 626, 890);
    const frame = StyleSheet.flatten(
      tree.root.findByProps({ testID: 'money-map-chrome' }).props.style,
    );
    const expected = mapControlLayout(bounds, regions, 0, 0);
    expect(frame).toMatchObject({
      left: expected.controls.x,
      top: expected.controls.y,
      width: expected.controls.width,
      height: expected.controls.height,
    });
    expect(tree.root.findByType(MoneyMapControls).props.horizontal).toBe(
      expected.horizontal,
    );
    expect(tree.root.findByType(MoneyMapPanel).props.maxHeight).toBe(
      expected.panelMaxHeight,
    );
  },
);

test('outer controls and legend fit 320pt with independent safe edges and a short panel', async () => {
  mockWidth = 382;
  mockHeight = 560;
  traits(false);
  const { tree } = await screen(emptyReservedRegions, {
    top: 0,
    bottom: 20,
    left: 10,
    right: 52,
  });
  stageLayout(tree, 382, 560);
  const chrome = StyleSheet.flatten(
    tree.root.findByProps({ testID: 'money-map-chrome' }).props.style,
  );
  expect(chrome).toMatchObject({ left: 10, width: 320, height: 540 });
  const controls = tree.root.findByType(MoneyMapControls);
  expect(controls.props.horizontal).toBe(true);
  expect(
    StyleSheet.flatten(controls.findByType(View).props.style).flexDirection,
  ).toBe('row');
  const panel = tree.root.findByType(MoneyMapPanel);
  expect(panel.props.maxHeight).toBeLessThan(540);
  act(() => panel.props.onExpanded(true));
  expect(panel.findByType(ScrollView).props.scrollEnabled).toBe(true);
  expect(tree.root.findByProps({ testID: 'money-map-legend' })).toBeDefined();
  const referenceLabels = tree.root
    .findAll(
      (node) =>
        typeof node.type === 'string' &&
        node.props.accessibilityLabel?.startsWith('Reference '),
    )
    .map((node) => node.props.accessibilityLabel);
  expect(referenceLabels).toHaveLength(3);
  expect(
    referenceLabels.every(
      (label) => !label.includes('$') && label.includes('dollars'),
    ),
  ).toBe(true);
});

test.each([
  ['leading', 60, 0, false],
  ['trailing', 0, 60, false],
  ['leading', 60, 0, true],
  ['trailing', 0, 60, true],
] as const)(
  'MoneyScreen fit, centre and chrome clear a 60pt %s rail (left %s, right %s, adaptive %s)',
  async (_side, left, right, adaptive) => {
    setWindowTraitsOverride(
      adaptive
        ? { horizontal: 'compact', vertical: 'regular', verticalBars: true }
        : null,
    );
    resetAdaptiveDeviceForTests();
    mockWidth = 380;
    mockHeight = 560;
    const { tree } = await screen(emptyReservedRegions, {
      top: 0,
      bottom: 20,
      left,
      right,
    });
    stageLayout(tree, mockWidth, mockHeight);
    const top = tree.root
      .findAllByType(View)
      .find(
        (node) =>
          node.props.onLayout &&
          StyleSheet.flatten(node.props.style)?.paddingTop === 8,
      )!;
    const panel = tree.root.findByType(MoneyMapPanel);
    act(() => {
      top.props.onLayout({ nativeEvent: { layout: { height: 100 } } });
      panel.props.onPeekHeight(120);
      panel.parent!.props.onLayout({
        nativeEvent: { layout: { y: 400, height: 140 } },
      });
    });
    const stage = tree.root.findByType(MoneyMap);
    const view = { width: 380, height: 560, insets: stage.props.insets };
    expect(view.insets).toEqual({
      top: adaptive ? 172 : 108,
      bottom: 148,
      left: left + 8,
      right: right + (adaptive ? 8 : 76),
    });
    const chrome = tree.root.findByProps({ testID: 'money-map-chrome' });
    const frame = StyleSheet.flatten(chrome.props.style);
    expect(frame.left).toBe(left);
    expect(frame.width ?? 380 - frame.left - frame.right).toBe(320);
    // Both the absolute control band and full-width panel belong to that
    // safe frame. Neither receives the safe sides a second time.
    const controls = tree.root.findByType(MoneyMapControls);
    expect(chrome.findByType(MoneyMapControls) === controls).toBe(true);
    expect(chrome.findByType(MoneyMapPanel) === panel).toBe(true);
    expect(StyleSheet.flatten(panel.parent!.props.style).width).toBe('100%');
    expect(stage.props.overview.left).toBe(left + 16);

    act(() => controls.props.onZoomIn());
    act(() => controls.props.onFit());
    const graph = stage.props.graph;
    const layout = layoutFor(graph, 1);
    const indices = stage.props.model.nodes.map((node: { id: string }) =>
      graph.nodes.findIndex((n: { id: string }) => n.id === node.id),
    );
    const bounds = layoutBounds(layout, indices);
    expect(liveCamera(tree)).toEqual(fitCamera(bounds, view));
    const centre = viewportCentre(view);
    const fitted = worldToScreen(
      liveCamera(tree),
      (bounds.minX + bounds.maxX) / 2,
      (bounds.minY + bounds.maxY) / 2,
    );
    expect(fitted.x).toBeCloseTo(centre.x, 9);
    expect(fitted.y).toBeCloseTo(centre.y, 9);

    act(() => controls.props.onSearch());
    act(() =>
      tree.root.findByType(MoneyMapSearch).props.onChoose('party:Labor'),
    );
    const selected = graph.nodes.findIndex(
      (n: { id: string }) => n.id === 'party:Labor',
    );
    const focused = worldToScreen(
      liveCamera(tree),
      layout.x[selected]!,
      layout.y[selected]!,
    );
    expect(focused.x).toBeCloseTo(centre.x, 9);
    expect(focused.y).toBeCloseTo(centre.y, 9);
  },
);

test('phone rule without regions retains the original insets, vertical controls and unrestricted panel', async () => {
  setWindowTraitsOverride(null);
  resetAdaptiveDeviceForTests();
  mockWidth = 390;
  mockHeight = 844;
  const { tree } = await screen(emptyReservedRegions);
  stageLayout(tree, 390, 844);
  expect(tree.root.findByType(MoneyMapControls).props.horizontal).toBe(false);
  expect(tree.root.findByType(MoneyMapPanel).props.maxHeight).toBeUndefined();
  expect(tree.root.findByType(MoneyMap).props.insets).toEqual({
    top: 8,
    bottom: 8,
    left: 8,
    right: 76,
  });
  const plain = {
    width: 390,
    height: 844,
    insets: { top: 100, bottom: 180, left: 8, right: 76 },
  };
  expect(reservedViewport(plain, emptyReservedRegions)).toEqual(plain);
});

test('ordinary phone chrome measurement keeps an already visible panned focus where the reader left it', async () => {
  setWindowTraitsOverride(null);
  resetAdaptiveDeviceForTests();
  mockWidth = 390;
  mockHeight = 844;
  mockParams.select = 'party:Labor';
  const { tree } = await screen(emptyReservedRegions);
  stageLayout(tree, 390, 844);
  const { tx, ty } = tree.root.findByType(MoneyMapLabels).props;
  tx.set(tx.get() + 12);
  const before = { tx: tx.get(), ty: ty.get() };
  const top = tree.root
    .findAllByType(View)
    .find(
      (node) =>
        node.props.onLayout &&
        StyleSheet.flatten(node.props.style)?.paddingTop === 8,
    )!;
  expect(top.findAllByType(ScrollView)).toHaveLength(0);
  act(() => top.props.onLayout({ nativeEvent: { layout: { height: 100 } } }));
  expect(liveCamera(tree)).toMatchObject(before);
});

test('chart annotations stay on the side of their datum while inactive and horizontal folds leave them in place', () => {
  const label = { x: 270, y: 0, width: 90, height: 24 };
  expect(clearChartLabel(label, 290, book, 626).x).toBe(210);
  expect(clearChartLabel(label, 330, book, 626).x).toBe(320);
  expect(clearChartLabel(label, 310, book, 626).x).toBe(320);
  expect(clearChartLabel(label, 310, laptop, 626)).toEqual(label);
  expect(
    clearChartLabel(
      label,
      310,
      { divisions: [{ ...vertical, active: false }], occlusions: [] },
      626,
    ),
  ).toEqual(label);
});

test('scrolling charts keep the plot and table in place while midpoint axis and value labels clear the local fold', () => {
  const proof = {
    dateRange: { start: '2026-01-01', end: '2026-11-01' },
    citation: 'AEC',
  };
  const tree = render(
    <ReservedRegionsProvider value={book}>
      <ScrollView>
        <BarSeries
          {...proof}
          data={[
            { label: 'A', value: 1 },
            { label: 'B', value: 2 },
            { label: 'C', value: 3 },
          ]}
          ink="ink"
          format={String}
          tableTitle="Totals"
          values="all"
        />
      </ScrollView>
    </ReservedRegionsProvider>,
  );
  const plot = tree.root.findByProps({ testID: 'bar-series-plot' });
  act(() => plot.props.onLayout({ nativeEvent: { layout: { width: 626 } } }));
  act(() =>
    tree.root
      .findAllByType(Text)
      .filter((n) => n.props.onTextLayout)
      .forEach((n) =>
        n.props.onTextLayout({
          nativeEvent: { lines: [{ width: 80, height: 20 }] },
        }),
      ),
  );
  for (const id of ['bar-series-axis']) {
    const words = tree.root.findByProps({ testID: id }).findAllByType(Text);
    words.forEach((word) => {
      const style = StyleSheet.flatten(word.props.style);
      expect(
        intersects(
          { x: style.left, y: 0, width: style.width, height: 20 },
          vertical,
        ),
      ).toBe(false);
    });
  }
  expect(
    tree.root.findAllByProps({ testID: 'bar-series-values' }),
  ).toHaveLength(0);
  // values="all" captions every bar.
  expect(
    tree.root.findAllByProps({ testID: 'bar-series-caption-2' }).length,
  ).toBeGreaterThan(0);
  expect(StyleSheet.flatten(plot.props.style)).toEqual({ height: 160 });
  expect(
    tree.root.findByProps({ testID: 'bar-series-content' }).props.style,
  ).toMatchObject({ gap: 8, alignSelf: 'stretch' });
});

test('the timeline midpoint marker and words move together without moving its scrolling track', () => {
  const tree = render(
    <ReservedRegionsProvider value={book}>
      <ScrollView>
        <StageTimeline
          stages={[
            { label: 'Introduced', date: '1 Jan' },
            { label: 'Debate', date: '2 Feb' },
            { label: 'Passed', date: '3 Mar' },
          ]}
          latestIndex={1}
          citation="ParlInfo"
          dateRange={{ start: '2026-01-01', end: '2026-03-03' }}
        />
      </ScrollView>
    </ReservedRegionsProvider>,
  );
  act(() =>
    tree.root
      .findByProps({ testID: 'stage-timeline-content' })
      .props.onLayout({ nativeEvent: { layout: { width: 626 } } }),
  );
  act(() =>
    tree.root
      .findAllByType(Text)
      .filter((node) => node.props.onTextLayout)
      .forEach((node) =>
        node.props.onTextLayout({
          nativeEvent: { lines: [{ width: 80, height: 20 }] },
        }),
      ),
  );
  const timeline = tree.root.findByProps({ testID: 'stage-timeline' });
  const middle = timeline
    .findAllByType(View)
    .find((node) => node.props.accessibilityLabel?.includes('latest stage'))!;
  expect(StyleSheet.flatten(middle.props.style).left).toBe(320);
  expect(StyleSheet.flatten(timeline.props.style).height).toBe(62);
});

test('the electorate outline fits its local clear viewing region and retains its source action', () => {
  const boundary = decodeBoundary({
    boundary_version_id: 'v1',
    electorate_id: 'seat',
    geometry_kind: 'official',
    vintage: '2026',
    crs: 'EPSG:4326',
    sources: [],
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 1],
          [0, 0],
        ],
      ],
    },
  });
  const sources = jest.fn();
  const tree = render(
    <ReservedRegionsProvider value={book}>
      <OutlineMap
        boundaries={[boundary]}
        name="Seat"
        state="vic"
        onSources={sources}
      />
    </ReservedRegionsProvider>,
  );
  const image = tree.root
    .findAllByType(View)
    .find((n) => n.props.accessibilityRole === 'image')!;
  act(() => image.props.onLayout({ nativeEvent: { layout: { width: 626 } } }));
  const canvas = tree.root.findByType(SizedCanvas);
  expect(canvas.props).toMatchObject({
    width: 306,
    height: 200,
    style: { left: 320, top: 0 },
  });
  act(() =>
    image.props.onAccessibilityAction({
      nativeEvent: { actionName: 'sources' },
    }),
  );
  expect(sources).toHaveBeenCalledTimes(1);
});

test('seat field clearance follows regular phone layout and restores the phone field space on the outer display', () => {
  // The bottom search field, and so its reserve, is iOS 26's (seat-chooser).
  const version = Object.getOwnPropertyDescriptor(Platform, 'Version')!;
  Object.defineProperty(Platform, 'Version', {
    configurable: true,
    value: '26.3',
  });
  let rule: string | undefined;
  function Probe() {
    rule = useLayout().rule;
    return (
      <FieldClearance>
        <View />
      </FieldClearance>
    );
  }
  const tree = render(<Probe />);
  expect(rule).toBe('phone-regular');
  expect(
    StyleSheet.flatten(
      tree.root.findByType(FieldClearance).findByType(View).props.style,
    ).paddingBottom,
  ).toBeUndefined();
  act(() => {
    traits(false);
  });
  expect(rule).toBe('phone');
  if (Platform.OS === 'ios')
    expect(
      StyleSheet.flatten(
        tree.root.findByType(FieldClearance).findByType(View).props.style,
      ).paddingBottom,
    ).toBe(56);
  Object.defineProperty(Platform, 'Version', version);
});
