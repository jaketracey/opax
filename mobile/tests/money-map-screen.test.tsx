import { withNavigationOptions } from './navigation-options';
import { act } from 'react';
import { AccessibilityInfo, Platform, StyleSheet, View } from 'react-native';
import { colors } from '../src/design/tokens';
import TestRenderer, { type ReactTestInstance } from 'react-test-renderer';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { apiClient } from '../src/api/runtime';
import * as adaptiveLayout from '../src/design/adaptive';
import * as accessibility from '../src/design/accessibility';
import MoneyScreen, { moneyMapLabel } from '../src/features/money/MoneyScreen';
import { MoneyMap } from '../src/features/money/map/MoneyMap';
import {
  MoneyMapPanel,
  focusMetaLine,
} from '../src/features/money/map/MoneyMapPanel';
import { MoneyMapControls } from '../src/features/money/map/MoneyMapControls';
import { MoneyMapSearch } from '../src/features/money/map/MoneyMapSearch';
import {
  LABEL_MAX_SCALE,
  MoneyMapLabels,
} from '../src/features/money/map/MoneyMapLabels';
import { Text as DesignText } from '../src/design/text';
import {
  cameraAt,
  fitCamera,
  viewportCentre,
  type Insets,
} from '../src/features/money/map/camera';
import { decodeMoneyGraph } from '../src/features/money/data';
import { buildModel, type MapNode } from '../src/features/money/map/model';
import {
  filtersFromParams,
  moneyFocusRoute,
} from '../src/features/money/records';
import { partyRoute } from '../src/navigation/routes';
import { defaultMoneyFilters, moneyView } from '../src/features/money/view';
import { IconButton, SegmentedPicker } from '../src/design/primitives';
import { pinned } from './pinned';
import { track } from '../src/analytics';

jest.mock('../src/api/runtime', () => ({ apiClient: { get: jest.fn() } }));
jest.mock('../src/analytics', () => ({
  ...jest.requireActual('../src/analytics'),
  track: jest.fn(),
}));
jest.mock('../src/features/money/map/MoneyMap', () => ({
  MoneyMap: jest.fn(() => null),
}));
let mockReader: boolean | null = false;
jest.mock('../src/features/money/hooks', () => ({
  ...jest.requireActual('../src/features/money/hooks'),
  useFirstScreenReader: () => mockReader,
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

const graph = decodeMoneyGraph(pinned('/graph/money.json'));
async function render(
  safe?: Insets,
  observe: (options: Record<string, unknown>) => void = () => undefined,
) {
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(
      withNavigationOptions(
        safe ? (
          <SafeAreaInsetsContext.Provider value={safe}>
            <MoneyScreen />
          </SafeAreaInsetsContext.Provider>
        ) : (
          <MoneyScreen />
        ),
        observe,
      ),
    );
  });
  return renderer;
}
const byTestID = (root: ReactTestInstance, id: string) =>
  root.findAll((n) => n.props.testID === id)[0];
const stage = () => jest.mocked(MoneyMap).mock.calls.at(-1)![0];

beforeEach(() => {
  jest.clearAllMocks();
  mockReader = false;
  Object.keys(mockParams).forEach((key) => delete mockParams[key]);
  jest.mocked(apiClient.get).mockImplementation(async (path, decode) => ({
    data: decode(pinned(path)),
    stale: false,
    asOf: '2026-09-21',
    savedAt: 1,
  }));
});

test('the Map view: the stage, the floating card with the picker, the controls and the panel', async () => {
  const r = await render();
  expect(r.root.findByType(SegmentedPicker).props.value).toBe('map');
  expect(byTestID(r.root, 'money-map-card')).toBeDefined();
  expect(byTestID(r.root, 'money-view-summary')).toBeDefined();
  expect(byTestID(r.root, 'money-map-controls')).toBeDefined();
  expect(r.root.findAllByType(MoneyMapPanel)).toHaveLength(1);
  const props = stage();
  expect(props.graph).toBe(props.model === undefined ? null : props.graph);
  expect(props.model.nodes.length).toBe(
    buildModel(moneyView(graph, defaultMoneyFilters(graph))).nodes.length,
  );
  expect(props.focus).toBeNull();
  expect(props.accessibilityLabel).toBe(moneyMapLabel(props.model, null));
  expect(props.accessibilityLabel).toMatch(/^Money map: [\d,]+ discs and/);
  act(() => r.unmount());
});

test.each([26, 27])(
  'the iOS %s money map explicitly reserves a non-transparent bar',
  async (version) => {
    const descriptor = Object.getOwnPropertyDescriptor(Platform, 'Version')!;
    Object.defineProperty(Platform, 'Version', {
      configurable: true,
      value: version,
    });
    let renderer: TestRenderer.ReactTestRenderer | undefined;
    let options: Record<string, unknown> = {};
    try {
      renderer = await render(undefined, (value) => {
        options = value;
      });
      expect(options).toMatchObject({
        headerTransparent: false,
        headerStyle: { backgroundColor: colors.paper },
      });
      expect(byTestID(renderer.root, 'money-map-card')).toBeDefined();
    } finally {
      if (renderer) act(() => renderer!.unmount());
      Object.defineProperty(Platform, 'Version', descriptor);
    }
  },
);

test.each([
  ['iPhone', 390, 844, false, 0],
  ['iPhone', 390, 844, false, 34],
  ['iPad', 1024, 1366, true, 0],
  ['iPad', 1024, 1366, true, 34],
] as const)(
  '%s at %sx%s (adaptive %s, bottom %s) retains identical geometry with zero safe sides',
  async (_device, width, height, pad, bottom) => {
    const layout = jest.spyOn(adaptiveLayout, 'useLayout').mockReturnValue({
      rule: pad ? 'pad' : 'phone',
      size: pad ? 'regular' : 'compact',
      regular: pad,
      wide: false,
      width,
      height,
      window: { width, height },
      landscape: false,
    });
    const adaptive = jest
      .spyOn(adaptiveLayout, 'useAdaptiveDevice')
      .mockReturnValue(pad);
    const large = jest
      .spyOn(accessibility, 'useAccessibilitySize')
      .mockReturnValue(false);
    let r: TestRenderer.ReactTestRenderer | undefined;
    try {
      r = await render({ top: 0, right: 0, bottom, left: 0 });
      const root = r.root;
      const panel = r.root.findByType(MoneyMapPanel);
      const top = r.root
        .findAllByType(View)
        .find(
          (node) =>
            node.props.onLayout &&
            StyleSheet.flatten(node.props.style)?.paddingTop === 8,
        )!;
      act(() => {
        byTestID(root, 'money-screen')!.props.onLayout({
          nativeEvent: { layout: { width, height } },
        });
        top.props.onLayout({ nativeEvent: { layout: { height: 140 } } });
        panel.props.onPeekHeight(180);
      });
      act(() =>
        panel.parent!.props.onLayout({
          nativeEvent: { layout: { y: height - bottom - 200, height: 200 } },
        }),
      );
      const legacy = {
        width,
        height,
        insets: { top: 148, right: 76, bottom: bottom + 188, left: 8 },
      };
      const viewport = { width, height, insets: stage().insets };
      expect(viewport).toStrictEqual(legacy);
      const bounds = { minX: -200, minY: -100, maxX: 200, maxY: 100 };
      const camera = { tx: 20, ty: -30, k: 2.5 };
      expect(fitCamera(bounds, viewport)).toStrictEqual(
        fitCamera(bounds, legacy),
      );
      expect(cameraAt(camera, 25, -40, viewport)).toStrictEqual(
        cameraAt(camera, 25, -40, legacy),
      );
      expect(viewportCentre(viewport)).toStrictEqual({
        x: width / 2 - 34,
        y: (height - bottom - 40) / 2,
      });
      expect(stage().overview).toStrictEqual({
        left: 16,
        bottom: bottom + 196,
      });
      const frame = StyleSheet.flatten(
        byTestID(r.root, 'money-map-chrome')!.props.style,
      );
      expect(frame).toStrictEqual(
        pad
          ? {
              position: 'absolute',
              top: 0,
              left: 0,
              right: undefined,
              bottom: undefined,
              width,
              height: height - bottom,
            }
          : { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
      );
      expect(StyleSheet.flatten(panel.parent!.props.style)).toStrictEqual(
        pad ? { width: '100%', maxWidth: 480 } : { width: '100%' },
      );
    } finally {
      const mounted = r;
      if (mounted) act(() => mounted.unmount());
      layout.mockRestore();
      adaptive.mockRestore();
      large.mockRestore();
    }
  },
);

test('the control stack drives the stage through commands, each with a new seq', async () => {
  const r = await render();
  const press = (id: string) =>
    act(() =>
      r.root
        .findAllByType(IconButton)
        .find((b) => b.props.testID === id)!
        .props.onPress(),
    );
  press('money-map-zoom-in');
  expect(stage().command).toMatchObject({ type: 'zoom', direction: 1, seq: 1 });
  press('money-map-zoom-out');
  expect(stage().command).toMatchObject({
    type: 'zoom',
    direction: -1,
    seq: 2,
  });
  press('money-fit');
  expect(stage().command).toMatchObject({ type: 'fit', seq: 3 });
  act(() => r.unmount());
});

test('a tap on a disc writes the focus to the route and the panel shows its record', async () => {
  const r = await render();
  await act(async () => stage().onFocus('party:Labor'));
  expect(mockNavigation.setParams).toHaveBeenCalledWith({
    select: 'party:Labor',
  });
  await act(async () =>
    r.update(withNavigationOptions(<MoneyScreen />, () => undefined)),
  );
  expect(stage().focus).toBe('party:Labor');
  const panel = r.root.findByType(MoneyMapPanel).props;
  expect(panel.focus.node.id).toBe('party:Labor');
  expect(panel.focus.record).toMatchObject({
    pathname: '/money-record',
    params: { node: 'party:Labor', via: 'map' },
  });
  expect(panel.focus.flows.length).toBeGreaterThan(0);
  // Next walks the strongest flow; Previous is then the party.
  expect(panel.focus.next).not.toBeNull();
  expect(panel.focus.previous).toBeNull();
  await act(async () => panel.focus.next.onPress());
  await act(async () =>
    r.update(withNavigationOptions(<MoneyScreen />, () => undefined)),
  );
  expect(stage().command).toMatchObject({ type: 'flyTo' });
  const walked = r.root.findByType(MoneyMapPanel).props.focus;
  expect(walked.node.id).toBe(stage().command.id);
  expect(walked.previous.label).toBe('Labor');
  // The stage's actions follow the focus.
  const names = stage().actions.map((a: { name: string }) => a.name);
  expect(names).toEqual(
    expect.arrayContaining([
      'nextFlow',
      'previousFlow',
      'openRecord',
      'clearFocus',
    ]),
  );
  act(() => r.unmount());
});

test.each([
  ['party', 'party', undefined],
  ['donor', 'donor', undefined],
  ['grants hub', 'hub', 'grants'],
  ['contracts hub', 'hub', 'contracts'],
] as const)(
  'the selected %s header opens its page from the collapsed panel',
  async (_label, kind, flow) => {
    const r = await render();
    const node = stage().model.nodes.find(
      (n: MapNode) => n.kind === kind && (!flow || n.flow === flow),
    )!;
    await act(async () => stage().onFocus(node.id));
    await act(async () =>
      r.update(withNavigationOptions(<MoneyScreen />, () => undefined)),
    );
    expect(r.root.findByType(MoneyMapPanel).props.expanded).toBe(false);
    const link = r.root.findAll(
      (n) =>
        n.props.testID === 'money-map-focus-link' &&
        typeof n.props.onPress === 'function',
    )[0]!;
    expect(link.props.accessibilityRole).toBe('link');
    expect(link.props.accessibilityLabel).toContain(node.label);
    const style = StyleSheet.flatten(
      typeof link.props.style === 'function'
        ? link.props.style({ pressed: false })
        : link.props.style,
    );
    expect(style.minHeight).toBeGreaterThanOrEqual(44);
    expect(style.minWidth).toBeGreaterThanOrEqual(44);
    await act(async () => link.props.onPress());
    expect(mockRouter.push).toHaveBeenCalledTimes(1);
    expect(mockRouter.push).toHaveBeenCalledWith(
      kind === 'party'
        ? partyRoute(node.label)
        : moneyFocusRoute(
            node.id,
            'federal',
            filtersFromParams(graph, mockParams),
            node.label,
            'map',
          ),
    );
    act(() => r.unmount());
  },
);

test('a selected kind without a page keeps its name as plain text', async () => {
  const r = await render();
  await act(async () => stage().onFocus('party:Labor'));
  await act(async () =>
    r.update(withNavigationOptions(<MoneyScreen />, () => undefined)),
  );
  const props = r.root.findByType(MoneyMapPanel).props;
  await act(async () => r.unmount());
  let panel!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    panel = TestRenderer.create(
      <MoneyMapPanel
        {...props}
        expanded
        focus={{
          ...props.focus!,
          node: { ...props.focus!.node, kind: 'unknown' as MapNode['kind'] },
        }}
      />,
    );
  });
  expect(byTestID(panel.root, 'money-map-focus-name')).toBeDefined();
  expect(byTestID(panel.root, 'money-map-focus-link')).toBeUndefined();
  expect(byTestID(panel.root, 'money-map-open-record')).toBeUndefined();
  act(() => panel.unmount());
});

test('clearing the focus collapses the panel, so the next focus starts at the peek', async () => {
  const r = await render();
  const refresh = () =>
    act(async () =>
      r.update(withNavigationOptions(<MoneyScreen />, () => undefined)),
    );
  const panel = () => r.root.findByType(MoneyMapPanel).props;
  await act(async () => stage().onFocus('party:Labor'));
  await refresh();
  await act(async () => panel().onExpanded(true));
  expect(panel().expanded).toBe(true);
  // The panel's own Clear.
  await act(async () => panel().onClear());
  await refresh();
  expect(stage().focus).toBeNull();
  expect(panel().expanded).toBe(false);
  // The stage's accessibility action.
  await act(async () => stage().onFocus('party:Labor'));
  await refresh();
  await act(async () => panel().onExpanded(true));
  const clear = stage().actions.find(
    (a: { name: string }) => a.name === 'clearFocus',
  );
  await act(async () => clear.onAction());
  await refresh();
  expect(stage().focus).toBeNull();
  expect(panel().expanded).toBe(false);
  act(() => r.unmount());
});

test('search to fly: the field replaces the card, a result flies and focuses', async () => {
  const r = await render();
  act(() =>
    r.root
      .findAllByType(IconButton)
      .find((b) => b.props.testID === 'money-map-search')!
      .props.onPress(),
  );
  expect(byTestID(r.root, 'money-map-card')).toBeUndefined();
  const search = r.root.findByType(MoneyMapSearch).props;
  await act(async () => search.onChoose('donor:mineralogy'));
  expect(stage().command).toMatchObject({
    type: 'flyTo',
    id: 'donor:mineralogy',
  });
  expect(mockNavigation.setParams).toHaveBeenCalledWith({
    select: 'donor:mineralogy',
  });
  await act(async () =>
    r.update(withNavigationOptions(<MoneyScreen />, () => undefined)),
  );
  expect(r.root.findAllByType(MoneyMapSearch)).toHaveLength(0);
  act(() => r.unmount());
});

test('the List view keeps the same data and the picker switches both ways', async () => {
  const r = await render();
  await act(async () =>
    r.root.findByType(SegmentedPicker).props.onChange('list'),
  );
  expect(byTestID(r.root, 'money-donors')).toBeDefined();
  expect(byTestID(r.root, 'money-title')).toBeDefined();
  expect(r.root.findAllByType(MoneyMapPanel)).toHaveLength(0);
  await act(async () =>
    r.root.findByType(SegmentedPicker).props.onChange('map'),
  );
  expect(byTestID(r.root, 'money-map-card')).toBeDefined();
  act(() => r.unmount());
});

test('a linked view and focus open the map on that disc', async () => {
  mockParams.view = 'map';
  mockParams.select = 'donor:mineralogy';
  const r = await render();
  expect(stage().focus).toBe('donor:mineralogy');
  expect(r.root.findByType(MoneyMapPanel).props.focus.node.label).toBe(
    'Mineralogy Pty Ltd',
  );
  act(() => r.unmount());
});

test.each(['android', 'ios'] as const)(
  '%s phone: a control stack that would run under the panel lies in a row under the card',
  async (os) => {
    const descriptor = Object.getOwnPropertyDescriptor(Platform, 'OS')!;
    Object.defineProperty(Platform, 'OS', { configurable: true, value: os });
    const width = 411,
      height = 914;
    const layout = jest.spyOn(adaptiveLayout, 'useLayout').mockReturnValue({
      rule: 'phone',
      size: 'compact',
      regular: false,
      wide: false,
      width,
      height,
      window: { width, height },
      landscape: false,
    });
    const adaptive = jest
      .spyOn(adaptiveLayout, 'useAdaptiveDevice')
      .mockReturnValue(false);
    const large = jest
      .spyOn(accessibility, 'useAccessibilitySize')
      .mockReturnValue(false);
    let r: TestRenderer.ReactTestRenderer | undefined;
    try {
      r = await render({ top: 0, right: 0, bottom: 0, left: 0 });
      const root = r.root;
      const panel = root.findByType(MoneyMapPanel);
      const top = root
        .findAllByType(View)
        .find(
          (node) =>
            node.props.onLayout &&
            StyleSheet.flatten(node.props.style)?.paddingTop === 8,
        )!;
      const controls = () => root.findByType(MoneyMapControls);
      act(() => {
        byTestID(root, 'money-screen')!.props.onLayout({
          nativeEvent: { layout: { width, height } },
        });
        // Android's Material card: 560 of 914 high, a 180 peek and a
        // 206 stack leave Fit under the panel (560 + 16 + 206 + 16 > 734).
        top.props.onLayout({ nativeEvent: { layout: { height: 560 } } });
        panel.props.onPeekHeight(180);
        panel.parent!.props.onLayout({
          nativeEvent: { layout: { y: height - 200, height: 200 } },
        });
      });
      act(() =>
        controls().parent!.props.onLayout({
          nativeEvent: { layout: { height: 206 } },
        }),
      );
      expect(controls().props.horizontal).toBe(os === 'android');
      if (os === 'android') {
        // The row's own height never flips it back to the stack.
        act(() =>
          controls().parent!.props.onLayout({
            nativeEvent: { layout: { height: 52 } },
          }),
        );
        expect(controls().props.horizontal).toBe(true);
        expect(stage().insets).toMatchObject({
          top: 560 + 8 + 48 + 16,
          right: 8,
        });
      } else expect(stage().insets).toMatchObject({ top: 568, right: 76 });
    } finally {
      const mounted = r;
      if (mounted) act(() => mounted.unmount());
      layout.mockRestore();
      adaptive.mockRestore();
      large.mockRestore();
      Object.defineProperty(Platform, 'OS', descriptor);
    }
  },
);

// VoiceOver and TalkBack: the search card closes either way, so the reader's
// place moves on with it rather than falling back to the top of the screen.
test.each([
  ['ios', 'setAccessibilityFocus'],
  ['android', 'sendAccessibilityEvent'],
] as const)(
  '%s: a search result moves the screen reader to the new subject, Close back to Search',
  async (os, call) => {
    const descriptor = Object.getOwnPropertyDescriptor(Platform, 'OS')!;
    Object.defineProperty(Platform, 'OS', { configurable: true, value: os });
    const moved = jest
      .spyOn(AccessibilityInfo, call)
      .mockImplementation(() => undefined);
    // Views in tests are component instances; iOS asks for a native handle,
    // which here is the view's test ID, so a move names the view it reached.
    const ReactNative = jest.requireActual<object>('react-native');
    const native = Object.getOwnPropertyDescriptor(
      ReactNative,
      'findNodeHandle',
    )!;
    Object.defineProperty(ReactNative, 'findNodeHandle', {
      configurable: true,
      value: (view: { props?: { testID?: string } } | null) =>
        view?.props?.testID ?? null,
    });
    let r!: TestRenderer.ReactTestRenderer;
    const settle = () =>
      act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });
    const reached = () =>
      moved.mock.calls.map(([target]) =>
        typeof target === 'string'
          ? target
          : (target as unknown as { props: { testID?: string } }).props.testID,
      );
    try {
      await act(async () => {
        r = TestRenderer.create(
          withNavigationOptions(<MoneyScreen />, () => undefined),
        );
      });
      const search = () =>
        r.root
          .findAllByType(IconButton)
          .find((b) => b.props.testID === 'money-map-search')!;
      // Close: back on the button that opened the search.
      act(() => search().props.onPress());
      await act(async () => r.root.findByType(MoneyMapSearch).props.onClose());
      await settle();
      expect(reached()).toEqual(['money-map-search']);
      // A result: on the panel's subject, a link to its record.
      act(() => search().props.onPress());
      await act(async () =>
        r.root.findByType(MoneyMapSearch).props.onChoose('party:Labor'),
      );
      await act(async () =>
        r.update(withNavigationOptions(<MoneyScreen />, () => undefined)),
      );
      await settle();
      expect(reached()).toEqual(['money-map-search', 'money-map-focus-link']);
      // The same choice is one `search` for analytics, the action alone.
      expect(
        jest
          .mocked(track)
          .mock.calls.filter(
            ([event, properties]) =>
              event === 'opax_map_action' &&
              (properties as { action?: string }).action === 'search',
          ),
      ).toEqual([['opax_map_action', { action: 'search', filter_count: 0 }]]);
      expect(byTestID(r.root, 'money-map-focus-link')!.props).toMatchObject({
        accessibilityRole: 'link',
        accessibilityLabel: 'Party, Labor',
      });
      // Nothing else moves it: Zoom and the panel's own steps leave it be.
      act(() =>
        r.root
          .findAllByType(IconButton)
          .find((b) => b.props.testID === 'money-map-zoom-in')!
          .props.onPress(),
      );
      await settle();
      expect(moved).toHaveBeenCalledTimes(2);
    } finally {
      if (r) act(() => r.unmount());
      moved.mockRestore();
      Object.defineProperty(ReactNative, 'findNodeHandle', native);
      Object.defineProperty(Platform, 'OS', descriptor);
    }
  },
);

test('a subject without a page reads as one title line', async () => {
  const r = await render();
  await act(async () => stage().onFocus('party:Labor'));
  await act(async () =>
    r.update(withNavigationOptions(<MoneyScreen />, () => undefined)),
  );
  const props = r.root.findByType(MoneyMapPanel).props;
  act(() => r.unmount());
  let panel!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    panel = TestRenderer.create(
      <MoneyMapPanel
        {...props}
        focus={{
          ...props.focus!,
          node: { ...props.focus!.node, kind: 'unknown' as MapNode['kind'] },
        }}
      />,
    );
  });
  const title = panel.root.find(
    (n) =>
      typeof n.type === 'string' && n.props.testID === 'money-map-focus-title',
  );
  expect(title.props.accessible).toBe(true);
  expect(title.props.accessibilityLabel).toMatch(/, Labor$/);
  act(() => panel.unmount());
});

// Dynamic Type: at AX3 a figure broke inside itself ("$305.9b / n") and a
// name on the map outgrew its box ("Commonwealt / h").
test("Next and Previous say the new subject aloud, in the title's words", async () => {
  const said = jest
    .spyOn(AccessibilityInfo, 'announceForAccessibilityWithOptions')
    .mockImplementation(() => undefined);
  const r = await render();
  try {
    await act(async () => stage().onFocus('party:Labor'));
    const refresh = () =>
      act(async () =>
        r.update(withNavigationOptions(<MoneyScreen />, () => undefined)),
      );
    await refresh();
    // Choosing a subject on the map says nothing: VoiceOver goes there.
    expect(said).not.toHaveBeenCalled();
    const press = async (id: string) => {
      await act(async () =>
        r.root
          .findAll(
            (n) =>
              n.props.testID === id && typeof n.props.onPress === 'function',
          )[0]!
          .props.onPress(),
      );
      await refresh();
    };
    const title = () =>
      r.root.findAll(
        (n) =>
          (n.props.testID === 'money-map-focus-link' ||
            n.props.testID === 'money-map-focus-title') &&
          typeof n.props.accessibilityLabel === 'string',
      )[0]!.props.accessibilityLabel as string;
    // VoiceOver stays on the button, so the subject is said after its reply.
    await press('money-map-next');
    const walked = r.root.findByType(MoneyMapPanel).props.focus.node;
    expect(walked.id).not.toBe('party:Labor');
    expect(said.mock.calls).toEqual([
      [`${focusMetaLine(walked)}, ${walked.label}`, { queue: true }],
    ]);
    expect(said.mock.calls[0]![0]).toBe(title());
    await press('money-map-previous');
    expect(said.mock.calls[1]).toEqual(['Party, Labor', { queue: true }]);
    expect(title()).toBe('Party, Labor');
    // The map's own Next flow action says it too.
    await act(async () =>
      stage()
        .actions.find((a: { name: string }) => a.name === 'nextFlow')
        .onAction(),
    );
    expect(said.mock.calls[2]![0]).toBe(said.mock.calls[0]![0]);
    expect(said).toHaveBeenCalledTimes(3);
  } finally {
    act(() => r.unmount());
    said.mockRestore();
  }
});

test('the panel figures step down rather than break, at rest and focused', async () => {
  const r = await render();
  const figureText = (id: string) =>
    byTestID(r.root, id)!.findAllByType(DesignText)[0]!.props;
  for (const id of ['money-map-total-donations', 'money-map-total-public'])
    expect(figureText(id)).toMatchObject({
      variant: 'tileFigure',
      wordSafe: true,
    });
  await act(async () => stage().onFocus('party:Labor'));
  await act(async () =>
    r.update(withNavigationOptions(<MoneyScreen />, () => undefined)),
  );
  expect(figureText('money-map-focus-figure')).toMatchObject({
    variant: 'tileFigure',
    wordSafe: true,
  });
  act(() => r.unmount());
});

test('names on the map grow no further than their boxes', () => {
  const value = <T,>(v: T) => ({ value: v }) as never;
  let r!: TestRenderer.ReactTestRenderer;
  act(() => {
    r = TestRenderer.create(
      <MoneyMapLabels
        slots={[
          {
            key: 'hub',
            kind: 'name',
            text: 'Commonwealth contracts',
            sub: 'Public money',
            ink: '#000000',
            x: 0,
            y: 0,
            r: 4,
          } as never,
        ]}
        tx={value(0)}
        ty={value(0)}
        k={value(1)}
        fitK={value(1)}
        allowed={value({ hub: 1 })}
        width={402}
      />,
    );
  });
  const texts = r.root.findAllByType(DesignText);
  expect(texts).toHaveLength(3);
  for (const text of texts)
    expect(text.props).toMatchObject({
      wordSafe: true,
      maxFontSizeMultiplier: LABEL_MAX_SCALE,
    });
  act(() => r.unmount());
});

test('map actions send the action and how many filters are set, never the record', async () => {
  // One filter set: the grants layer is off.
  mockParams.layers = 'donations,contracts';
  const r = await render();
  const sent = () =>
    jest
      .mocked(track)
      .mock.calls.filter(([event]) => event === 'opax_map_action')
      .map(([, properties]) => properties);
  const refresh = () =>
    act(async () =>
      r.update(withNavigationOptions(<MoneyScreen />, () => undefined)),
    );
  expect(sent()).toEqual([{ action: 'open', filter_count: 1 }]);
  const press = (id: string) =>
    act(() =>
      r.root
        .findAllByType(IconButton)
        .find((b) => b.props.testID === id)!
        .props.onPress(),
    );
  press('money-map-zoom-in');
  press('money-map-zoom-out');
  press('money-fit');
  expect(sent().slice(1)).toEqual(
    Array(3).fill({ action: 'zoom', filter_count: 1 }),
  );
  // Opening search sends nothing; choosing a result is the search.
  press('money-map-search');
  expect(sent()).toHaveLength(4);
  await act(async () =>
    r.root.findByType(MoneyMapSearch).props.onChoose('donor:mineralogy'),
  );
  await refresh();
  // Once, as the action alone: the focus move rides the same choice.
  expect(sent().slice(4)).toEqual([{ action: 'search', filter_count: 1 }]);
  // A focus is no filter, and the record opens three ways.
  await act(async () => stage().onFocus('party:Labor'));
  await refresh();
  expect(sent()).toHaveLength(5);
  const header = r.root.findAll(
    (n) =>
      n.props.testID === 'money-map-focus-link' &&
      typeof n.props.onPress === 'function',
  )[0]!;
  await act(async () => header.props.onPress());
  const openRecord = stage().actions.find(
    (a: { name: string }) => a.name === 'openRecord',
  );
  await act(async () => openRecord.onAction());
  await act(async () =>
    r.root.findByType(MoneyMapPanel).props.onExpanded(true),
  );
  await refresh();
  const record = r.root.findByType(MoneyMapPanel).props.focus.record;
  const row = r.root.findAll(
    (n) => n.props.href === record && typeof n.props.onPress === 'function',
  )[0]!;
  await act(async () => row.props.onPress({ preventDefault: jest.fn() }));
  expect(sent().slice(5)).toEqual(
    Array(3).fill({ action: 'open_record', filter_count: 1 }),
  );
  // A changed filter is one more `filter`, with the new count.
  mockParams.min = '1000';
  await refresh();
  expect(sent().slice(8)).toEqual([{ action: 'filter', filter_count: 2 }]);
  expect(JSON.stringify(jest.mocked(track).mock.calls)).not.toMatch(
    /Labor|mineralogy|1000|donor:|party:/i,
  );
  act(() => r.unmount());
});
