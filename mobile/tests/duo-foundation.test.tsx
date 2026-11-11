import { act, useEffect } from 'react';
import TestRenderer from 'react-test-renderer';
import { Platform, StyleSheet, View } from 'react-native';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as Duo from '../modules/opax-duo';
import {
  Grid,
  PadGrid,
  PadReading,
  RegionProvider,
  SidebarSafe,
  breakpoints,
  columnBreakout,
  currentRule,
  gridColumns,
  readableInset,
  resetAdaptiveDeviceForTests,
  setWindowTraitsOverride,
  sizeClassFor,
  splitPanePhoneRegular,
  splitPaneWidth,
  useAdaptiveDevice,
  useLayout,
  useWindowTraits,
  type Layout,
  type LayoutRule,
  type WindowTraits,
} from '../src/design/adaptive';
import {
  activeHorizontalFold,
  activeVerticalFold,
  emptyReservedRegions,
  evenColumns,
  placeClear,
  sidesOf,
  type Rect,
  type Region,
  type ReservedRegions,
} from '../src/design/fold';
import {
  ReservedRegionArea,
  ReservedRegionsProvider,
  useReservedRegions,
} from '../src/design/fold-area';
import { useScreenColumn } from '../src/design/layout';

let mockWidth = 600;
let mockHeight = 800;
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
  __esModule: true,
  OpaxDuo: null,
  ReservedRegionView: null,
}));

const compact: WindowTraits = {
  horizontal: 'compact',
  vertical: 'regular',
  foldable: false,
};
const regular: WindowTraits = {
  horizontal: 'regular',
  vertical: 'regular',
  foldable: false,
};
const mounted: TestRenderer.ReactTestRenderer[] = [];
function render(children: React.ReactNode) {
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(children);
  });
  mounted.push(tree);
  return tree;
}
function traits(value: WindowTraits | null) {
  act(() => setWindowTraitsOverride(value));
}
function nativeExport(name: keyof typeof Duo, value: unknown) {
  Object.defineProperty(Duo, name, { value, configurable: true });
}

beforeEach(() => {
  mockWidth = 600;
  mockHeight = 800;
  Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true });
  traits(null);
  act(() => resetAdaptiveDeviceForTests());
});
afterEach(() => {
  act(() => mounted.splice(0).forEach((tree) => tree.unmount()));
  nativeExport('OpaxDuo', null);
  nativeExport('ReservedRegionView', null);
  traits(null);
  act(() => resetAdaptiveDeviceForTests());
});

function captureLayout(value?: { width: number; height: number }) {
  let layout!: Layout;
  let adaptive = false;
  function Probe() {
    layout = useLayout();
    adaptive = useAdaptiveDevice();
    return null;
  }
  const tree = render(
    <RegionProvider value={value ?? null}>
      <Probe />
    </RegionProvider>,
  );
  return { tree, layout: () => layout, adaptive: () => adaptive };
}

describe('one adaptive rule', () => {
  test.each<[LayoutRule, number, string]>([
    ['pad', 699, 'compact'],
    ['pad', 700, 'regular'],
    ['phone-regular', 559, 'compact'],
    ['phone-regular', 560, 'regular'],
    ['phone-regular', 300, 'compact'],
    ['phone', 956, 'compact'],
  ])('%s at %s points is %s', (rule, width, expected) => {
    expect(sizeClassFor(width, rule)).toBe(expected);
  });
  test('regular/compact Pro Max landscape and compact Duo outer remain compact', () => {
    expect(breakpoints.regularPhone).toBe(560);
    mockWidth = 956;
    mockHeight = 440;
    traits({ ...regular, vertical: 'compact' });
    const probe = captureLayout();
    expect(probe.layout()).toMatchObject({
      rule: 'phone',
      size: 'compact',
      landscape: true,
    });
    traits(compact);
    expect(probe.layout().regular).toBe(false);
    traits({ ...compact, vertical: 'compact' });
    expect(probe.layout().regular).toBe(false);
  });
  test('regular phone regions use their measured width and never reach wide', () => {
    traits(regular);
    expect(currentRule()).toBe('phone-regular');
    expect(sizeClassFor(560)).toBe('regular');
    const half = captureLayout({ width: 300, height: 800 });
    expect(half.layout()).toMatchObject({
      rule: 'phone-regular',
      width: 300,
      regular: false,
      window: { width: 600, height: 800 },
    });
    mockWidth = 1200;
    const full = captureLayout();
    expect(full.layout()).toMatchObject({ regular: true, wide: false });
  });
  test('the screen column and reading helpers share the 560pt rule', () => {
    traits(regular);
    let column!: ReturnType<typeof useScreenColumn>;
    function Probe() {
      column = useScreenColumn();
      return null;
    }
    render(<Probe />);
    expect(column.regular).toBe(true);
    expect(column.content.paddingHorizontal).toBe(32);
    expect(readableInset(600, 700, 20, 'phone-regular')).toBe(32);
    expect(columnBreakout(1200, 'readable', 'phone-regular')).toBe(218);
    traits(compact);
    expect(column.regular).toBe(false);
    expect(column.content.paddingHorizontal).toBe(20);
    expect(readableInset(956, 700, 20, 'phone')).toBe(20);
  });
  test('PadGrid and PadReading apply to regular phones; SidebarSafe stays iPad-only', () => {
    traits(regular);
    const tree = render(
      <>
        <PadGrid testID="grid">
          <View />
          <View />
        </PadGrid>
        <PadReading>
          <View testID="reading" />
        </PadReading>
        <SidebarSafe>
          <View testID="sidebar-child" />
        </SidebarSafe>
      </>,
    );
    expect(tree.root.findAllByType(Grid)).toHaveLength(1);
    const cells = tree.root
      .findByType(Grid)
      .findAllByType(View)
      .map((node) => StyleSheet.flatten(node.props.style))
      .filter((style) => style?.width === 292);
    expect(cells.length).toBeGreaterThanOrEqual(2);
    expect(
      tree.root.findByProps({ testID: 'reading' }).parent?.props.style,
    ).toEqual(
      expect.arrayContaining([expect.objectContaining({ maxWidth: 700 })]),
    );
    expect(tree.root.findByType(SidebarSafe).findAllByType(View)).toHaveLength(
      1,
    );
    traits(compact);
    expect(tree.root.findAllByType(Grid)).toHaveLength(0);
  });
  test.each<LayoutRule>(['pad', 'phone', 'phone-regular'])(
    'split widths for %s',
    (rule) => {
      const expected = rule === 'phone-regular' ? 260 : 300;
      expect(splitPaneWidth(600, false, rule)).toBe(expected);
      expect(splitPaneWidth(600, true, rule)).toBe(270);
      expect(splitPaneWidth(1200, false, rule)).toBe(
        rule === 'phone-regular' ? 504 : 400,
      );
    },
  );
  test('phone splits clamp the minimum, ratio and half-width ceiling', () => {
    expect(splitPanePhoneRegular).toEqual({
      min: 260,
      fraction: 0.42,
      maxFraction: 0.5,
    });
    expect(splitPaneWidth(560, false, 'phone-regular')).toBe(260);
    expect(splitPaneWidth(400, false, 'phone-regular')).toBe(200);
    expect(splitPaneWidth(800, false, 'phone-regular')).toBe(336);
    expect(splitPaneWidth(1376, false, 'pad')).toBe(440);
  });
  test('regular phone grids cap at two even columns, retaining a single accessible column', () => {
    for (const width of [600, 800, 1200]) {
      expect(
        gridColumns(width, {
          rule: 'phone-regular',
          columns: { regular: 5, wide: 7 },
          minItemWidth: 100,
        }),
      ).toBe(2);
    }
    expect(gridColumns(600, { rule: 'phone-regular', minItemWidth: 560 })).toBe(
      1,
    );
    expect(gridColumns(559, { rule: 'phone-regular' })).toBe(1);
    expect(gridColumns(1200, { rule: 'pad' })).toBe(3);
    expect([1, 2, 3, 4, 5].map(evenColumns)).toEqual([1, 2, 2, 4, 4]);
  });
});

describe('session device detection and the traits store', () => {
  test('regular/regular detection is sticky across folding and consumer remounts', () => {
    traits(compact);
    const probe = captureLayout();
    expect(probe.adaptive()).toBe(false);
    traits(regular);
    expect(probe.adaptive()).toBe(true);
    traits(compact);
    expect(probe.adaptive()).toBe(true);
    expect(probe.layout().rule).toBe('phone');
    act(() => probe.tree.unmount());
    expect(captureLayout().adaptive()).toBe(true);
  });
  test('a division detected after launch makes a compact phone adaptive', () => {
    traits(compact);
    const probe = captureLayout();
    traits({ ...compact, foldable: true });
    expect(probe.adaptive()).toBe(true);
    expect(probe.layout().regular).toBe(false);
    traits(compact);
    expect(probe.adaptive()).toBe(true);
  });
  test('vertical bars make a closed Duo adaptive while it stays compact', () => {
    // The closed Duo's outer display has no fold region and compact traits;
    // its vertical bars are the signal (seen on the Duo simulator).
    traits(compact);
    const probe = captureLayout();
    traits({ ...compact, verticalBars: true });
    expect(probe.adaptive()).toBe(true);
    expect(probe.layout().rule).toBe('phone');
    expect(probe.layout().regular).toBe(false);
    traits(compact);
    expect(probe.adaptive()).toBe(true);
  });
  test('iPad is adaptive without window traits, even in a compact region', () => {
    const react = jest.requireActual('react');
    jest.doMock('react', () => react);
    Object.defineProperty(Platform, 'isPad', {
      value: true,
      configurable: true,
    });
    try {
      jest.isolateModules(() => {
        const adaptive = jest.requireActual<
          typeof import('../src/design/adaptive')
        >('../src/design/adaptive');
        let device: boolean | undefined;
        let layout: Layout | undefined;
        function Pad() {
          device = adaptive.useAdaptiveDevice();
          layout = adaptive.useLayout();
          return null;
        }
        render(<Pad />);
        expect(device).toBe(true);
        expect(layout).toMatchObject({ rule: 'pad', regular: false });
      });
    } finally {
      Object.defineProperty(Platform, 'isPad', {
        value: false,
        configurable: true,
      });
      jest.dontMock('react');
    }
  });
  test('the native getter seeds the very first render synchronously', () => {
    const react = jest.requireActual('react');
    jest.doMock('react', () => react);
    nativeExport('OpaxDuo', {
      getWindowTraits: () => regular,
      addListener: () => ({ remove: jest.fn() }),
    });
    try {
      jest.isolateModules(() => {
        const adaptive = jest.requireActual<
          typeof import('../src/design/adaptive')
        >('../src/design/adaptive');
        const seen: LayoutRule[] = [];
        function Probe() {
          seen.push(adaptive.useLayout().rule);
          return null;
        }
        render(<Probe />);
        expect(seen[0]).toBe('phone-regular');
      });
    } finally {
      jest.dontMock('react');
    }
  });
  test('native synchronous snapshot closes the subscribe gap, events update and unsubscribe', () => {
    const remove = jest.fn();
    let listener!: (value: WindowTraits) => void;
    nativeExport('OpaxDuo', {
      getWindowTraits: () => regular,
      addListener: (name: string, callback: typeof listener) => {
        expect(name).toBe('onWindowTraits');
        listener = callback;
        return { remove };
      },
    });
    act(() => setWindowTraitsOverride(undefined));
    const probe = captureLayout();
    expect(probe.layout().rule).toBe('phone-regular');
    act(() => listener(compact));
    expect(probe.layout().rule).toBe('phone');
    expect(probe.adaptive()).toBe(true);
    act(() => probe.tree.unmount());
    expect(remove).toHaveBeenCalledTimes(1);
  });
  test('unchanged traits keep the cached snapshot and do not re-render', () => {
    traits(compact);
    const seen: (WindowTraits | null)[] = [];
    function Probe() {
      seen.push(useWindowTraits());
      return null;
    }
    render(<Probe />);
    const count = seen.length;
    traits({ ...compact });
    expect(seen).toHaveLength(count);
  });
  test('off iOS the bridge and traits are unavailable and phones stay compact', () => {
    const actual = jest.requireActual('../modules/opax-duo');
    expect(actual.OpaxDuo).toBeNull();
    expect(actual.ReservedRegionView).toBeNull();
    Object.defineProperty(Platform, 'OS', {
      value: 'android',
      configurable: true,
    });
    traits(regular);
    let seen: WindowTraits | null | undefined;
    function Probe() {
      seen = useWindowTraits();
      return null;
    }
    render(<Probe />);
    expect(seen).toBeNull();
    expect(captureLayout().adaptive()).toBe(false);
    expect(sizeClassFor(1200)).toBe('compact');
  });
});

const bounds: Rect = { x: 0, y: 0, width: 600, height: 800 };
const vertical: Region = { x: 290, y: 0, width: 20, height: 800, active: true };
const horizontal: Region = {
  x: 0,
  y: 390,
  width: 600,
  height: 20,
  active: true,
};
const inactive: Region = { ...vertical, width: 0, active: false };
const camera: Region = { x: 550, y: 0, width: 50, height: 50, active: true };
const regions: ReservedRegions = {
  divisions: [vertical, inactive],
  occlusions: [camera],
};

describe('pure fold geometry', () => {
  test('active fold selectors ignore inactive folds and distinguish axes', () => {
    expect(activeVerticalFold([inactive, horizontal, vertical])).toBe(vertical);
    expect(activeHorizontalFold([inactive, vertical, horizontal])).toBe(
      horizontal,
    );
    expect(activeVerticalFold([inactive, horizontal])).toBeNull();
    expect(activeHorizontalFold([inactive, vertical])).toBeNull();
    expect(activeVerticalFold([])).toBeNull();
  });
  test('sides exclude the vertical and horizontal fold frames', () => {
    expect(sidesOf(vertical, bounds)).toEqual({
      leading: { ...bounds, width: 290 },
      trailing: { ...bounds, x: 310, width: 290 },
    });
    expect(sidesOf(horizontal, bounds)).toEqual({
      top: { ...bounds, height: 390 },
      bottom: { ...bounds, y: 410, height: 390 },
    });
    expect(sidesOf(inactive, bounds)).toEqual({
      leading: { ...bounds, width: 290 },
      trailing: { ...bounds, x: 290, width: 310 },
    });
  });
  test('offset bounds clip fold strips without negative side sizes', () => {
    const offset = { x: 100, y: 200, width: 400, height: 400 };
    expect(sidesOf(vertical, offset)).toEqual({
      leading: { ...offset, width: 190 },
      trailing: { ...offset, x: 310, width: 190 },
    });
    expect(sidesOf({ ...vertical, x: 700 }, bounds)).toEqual({
      leading: bounds,
      trailing: { ...bounds, x: 600, width: 0 },
    });
  });
  test('a straddling element moves the least to the trailing side on a tie', () => {
    const rect = { x: 250, y: 100, width: 100, height: 50 };
    expect(placeClear(rect, regions, bounds)).toEqual({ ...rect, x: 310 });
    expect(
      placeClear(
        rect,
        { divisions: [{ ...vertical, x: 390 }], occlusions: [] },
        bounds,
      ),
    ).toEqual(rect);
    const asymmetric = { ...vertical, x: 190 };
    expect(
      placeClear(
        { ...rect, x: 150 },
        { divisions: [asymmetric], occlusions: [] },
        bounds,
      ),
    ).toEqual({ ...rect, x: 210 });
    expect(
      placeClear(
        { ...rect, x: 350 },
        { divisions: [{ ...vertical, x: 390 }], occlusions: [] },
        bounds,
      ),
    ).toEqual({ ...rect, x: 290 });
  });
  test('horizontal folds favour the bottom on a tie', () => {
    const rect = { x: 100, y: 370, width: 100, height: 60 };
    expect(
      placeClear(rect, { divisions: [horizontal], occlusions: [] }, bounds),
    ).toEqual({ ...rect, y: 410 });
  });
  test('an active camera moves a control by the least distance, without resizing', () => {
    const rect = { x: 540, y: 0, width: 50, height: 30 };
    expect(placeClear(rect, regions, bounds)).toEqual({ ...rect, x: 500 });
    const inactiveRegions = {
      divisions: [inactive],
      occlusions: [{ ...camera, active: false }],
    };
    expect(placeClear(rect, inactiveRegions, bounds)).toEqual(rect);
  });
  test('camera clearance respects the chosen fold side and all active cameras', () => {
    const rect = { x: 270, y: 10, width: 60, height: 30 };
    const cameraAtFold = { ...camera, x: 310, width: 70, height: 50 };
    expect(
      placeClear(
        rect,
        { divisions: [vertical], occlusions: [cameraAtFold] },
        bounds,
      ),
    ).toEqual({ ...rect, x: 310, y: 50 });
    expect(
      placeClear(
        { x: 80, y: 80, width: 20, height: 20 },
        {
          divisions: [],
          occlusions: [
            { x: 70, y: 70, width: 40, height: 40, active: true },
            { x: 110, y: 70, width: 40, height: 40, active: true },
          ],
        },
        bounds,
      ),
    ).toEqual({ x: 80, y: 110, width: 20, height: 20 });
  });
  test('a clear element stays put and an impossible fit is bounds-clamped', () => {
    const rect = { x: 20, y: 100, width: 60, height: 30 };
    expect(placeClear(rect, regions, bounds)).toEqual(rect);
    expect(
      placeClear({ ...rect, x: -20 }, emptyReservedRegions, bounds),
    ).toEqual({ ...rect, x: 0 });
    expect(placeClear({ ...rect, width: 500 }, regions, bounds)).toEqual({
      ...rect,
      width: 500,
    });
  });
});

describe('local reserved-region containers', () => {
  test('regions are empty outside an area and off iOS', () => {
    let seen!: ReservedRegions;
    function Probe() {
      seen = useReservedRegions();
      return null;
    }
    render(<Probe />);
    expect(seen).toBe(emptyReservedRegions);
    Object.defineProperty(Platform, 'OS', {
      value: 'android',
      configurable: true,
    });
    render(
      <ReservedRegionArea>
        <Probe />
      </ReservedRegionArea>,
    );
    expect(seen).toBe(emptyReservedRegions);
  });
  test('the provider supplies manual regions through the plain View fallback', () => {
    let seen!: ReservedRegions;
    function Probe() {
      seen = useReservedRegions();
      return <View testID="child" />;
    }
    const tree = render(
      <ReservedRegionsProvider value={regions}>
        <ReservedRegionArea style={{ flex: 1 }} testID="area">
          <Probe />
        </ReservedRegionArea>
      </ReservedRegionsProvider>,
    );
    expect(seen).toBe(regions);
    expect(
      tree.root.findAll(
        (node) => typeof node.type === 'string' && node.props.testID === 'area',
      ),
    ).toHaveLength(1);
  });
  test('missing regions are empty and a geometry update never remounts children', () => {
    let seen!: ReservedRegions;
    let mounts = 0;
    function Probe() {
      seen = useReservedRegions();
      useEffect(() => {
        mounts++;
      }, []);
      return null;
    }
    const make = (value: ReservedRegions) => (
      <ReservedRegionsProvider value={value}>
        <ReservedRegionArea>
          <Probe />
        </ReservedRegionArea>
      </ReservedRegionsProvider>
    );
    const tree = render(make(emptyReservedRegions));
    expect(seen).toEqual({ divisions: [], occlusions: [] });
    act(() => tree.update(make(regions)));
    expect(seen).toBe(regions);
    expect(mounts).toBe(1);
  });
  test('native events provide local geometry and call onChange; explicit providers override them', () => {
    const FakeNative = (props: Duo.ReservedRegionViewProps) => (
      <View {...props} />
    );
    nativeExport('ReservedRegionView', FakeNative);
    let outer!: ReservedRegions;
    let inner!: ReservedRegions;
    const onChange = jest.fn();
    function Probe({ nested = false }: { nested?: boolean }) {
      const value = useReservedRegions();
      if (nested) inner = value;
      else outer = value;
      return null;
    }
    const tree = render(
      <ReservedRegionArea onChange={onChange}>
        <Probe />
        <ReservedRegionArea>
          <Probe nested />
        </ReservedRegionArea>
      </ReservedRegionArea>,
    );
    const natives = tree.root.findAllByType(FakeNative);
    act(() => natives[0]!.props.onReservedRegions({ nativeEvent: regions }));
    expect(outer).toEqual(regions);
    expect(inner).toEqual(emptyReservedRegions);
    expect(onChange).toHaveBeenCalledWith(regions);
    const override = render(
      <ReservedRegionsProvider value={regions}>
        <ReservedRegionArea>
          <Probe />
        </ReservedRegionArea>
      </ReservedRegionsProvider>,
    );
    act(() =>
      override.root
        .findByType(FakeNative)
        .props.onReservedRegions({ nativeEvent: emptyReservedRegions }),
    );
    expect(outer).toBe(regions);
  });
});

test('OPAX native modules never read the main screen', () => {
  function files(directory: string): string[] {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
      entry.isDirectory()
        ? files(join(directory, entry.name))
        : [join(directory, entry.name)],
    );
  }
  const offenders = files(join(__dirname, '../modules')).filter((file) =>
    readFileSync(file, 'utf8').includes('UIScreen.main'),
  );
  expect(offenders).toEqual([]);
});
