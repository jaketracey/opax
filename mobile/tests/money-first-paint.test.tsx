import { withNavigationOptions } from './navigation-options';
import { act } from 'react';
import {
  AccessibilityInfo,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import * as ReactNative from 'react-native';
import * as Reanimated from 'react-native-reanimated';
import TestRenderer, { type ReactTestInstance } from 'react-test-renderer';
import { ApiError } from '../src/api/errors';
import { apiClient } from '../src/api/runtime';
import {
  ContentUnavailable,
  IconButton,
  SegmentedPicker,
} from '../src/design/primitives';
import { decodeMoneyGraph } from '../src/features/money/data';
import { forgetMoneyGraphs } from '../src/features/money/lookup';
import { BAND_HOLD } from '../src/features/money/map/band';
import * as measure from '../src/features/money/map/measure';
import { MoneyMap } from '../src/features/money/map/MoneyMap';
import { MoneyMapControls } from '../src/features/money/map/MoneyMapControls';
import { MoneyMapPanel } from '../src/features/money/map/MoneyMapPanel';
import { MoneyMapSearch } from '../src/features/money/map/MoneyMapSearch';
import MoneyScreen, {
  moneySummary,
  moneySummaryStandIn,
} from '../src/features/money/MoneyScreen';
import { filtersFromParams } from '../src/features/money/records';
import {
  forgetScreenReader,
  moneyMode,
  primeScreenReader,
  SCREEN_READER_WAIT,
  useFirstScreenReader,
  type ScreenReaderState,
} from '../src/features/money/screen-reader';
import { pinned } from './pinned';

jest.mock('../src/api/runtime', () => ({ apiClient: { get: jest.fn() } }));
jest.mock('../src/analytics', () => ({
  ...jest.requireActual('../src/analytics'),
  track: jest.fn(),
}));
jest.mock('../src/features/money/map/MoneyMap', () => ({
  MoneyMap: jest.fn(() => null),
}));
let mockReader: ScreenReaderState = false;
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
  setParams: jest.fn(),
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
type Result = {
  data: unknown;
  stale: boolean;
  asOf: string;
  savedAt: number;
};
/** The graph's read, held open until the test lets it answer or fail. */
function heldRead() {
  let answer!: () => void;
  let fail!: (error: unknown) => void;
  jest.mocked(apiClient.get).mockImplementation(
    (path, decode) =>
      new Promise<Result>((resolve, reject) => {
        answer = () =>
          resolve({
            data: decode(pinned(path)),
            stale: false,
            asOf: '2026-09-21',
            savedAt: 1,
          });
        fail = reject;
      }) as never,
  );
  return { answer: () => answer(), fail: (error: unknown) => fail(error) };
}
let options: Record<string, unknown> = {};
async function render() {
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(
      withNavigationOptions(<MoneyScreen />, (value) => {
        options = value;
      }),
    );
  });
  return renderer;
}
const byTestID = (root: ReactTestInstance, id: string) =>
  root.findAll((n) => n.props.testID === id)[0];
const flat = (node: ReactTestInstance) =>
  StyleSheet.flatten(node.props.style) as Record<string, unknown>;
/** The frame's parts whose place must not change when the graph arrives. */
const mapFrame = (root: ReactTestInstance) => {
  const controls = root.findByType(MoneyMapControls).parent!;
  return {
    title: options.headerTitle,
    transparent: options.headerTransparent,
    largeTitle: byTestID(root, 'money-title') !== undefined,
    card: byTestID(root, 'money-map-card') !== undefined,
    picker: root.findByType(SegmentedPicker).props.value,
    controls: flat(controls),
    panel: root.findAllByType(MoneyMapPanel).length,
  };
};

beforeEach(() => {
  jest.clearAllMocks();
  mockReader = false;
  options = {};
  forgetMoneyGraphs();
  Object.keys(mockParams).forEach((key) => delete mockParams[key]);
});

describe('which view opens', () => {
  test('VoiceOver on, or never answered, opens the List; off opens the Map', () => {
    expect(moneyMode(null, undefined, true)).toBe('list');
    expect(moneyMode(null, undefined, 'unanswered')).toBe('list');
    expect(moneyMode(null, undefined, false)).toBe('map');
  });
  test('not yet known is neither view, so one is never drawn and swapped', () => {
    expect(moneyMode(null, undefined, null)).toBeNull();
    expect(moneyMode(null, 'somewhere', null)).toBeNull();
  });
  test("the reader's choice, then the link's view, come before VoiceOver", () => {
    for (const state of [true, false, null, 'unanswered'] as const) {
      expect(moneyMode(null, 'map', state)).toBe('map');
      expect(moneyMode(null, 'list', state)).toBe('list');
      expect(moneyMode('list', 'map', state)).toBe('list');
      expect(moneyMode('map', 'list', state)).toBe('map');
    }
  });
});

describe("VoiceOver's state", () => {
  function Probe({ seen }: { seen: ScreenReaderState[] }) {
    seen.push(useFirstScreenReader());
    return null;
  }
  afterEach(() => {
    forgetScreenReader();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  test('asked as the app starts, it is known at a later screen’s first render', async () => {
    const ask = jest
      .spyOn(AccessibilityInfo, 'isScreenReaderEnabled')
      .mockResolvedValue(true);
    primeScreenReader();
    await act(async () => undefined);
    const seen: ScreenReaderState[] = [];
    let r!: TestRenderer.ReactTestRenderer;
    act(() => {
      r = TestRenderer.create(<Probe seen={seen} />);
    });
    // Never unknown, and never the Map's answer, for a VoiceOver user.
    expect(seen[0]).toBe(true);
    expect(new Set(seen)).toEqual(new Set([true]));
    expect(ask).toHaveBeenCalledTimes(1);
    act(() => r.unmount());
  });

  test('an answer that never comes becomes the List after a short wait', async () => {
    jest.useFakeTimers();
    jest
      .spyOn(AccessibilityInfo, 'isScreenReaderEnabled')
      .mockReturnValue(new Promise(() => undefined));
    const seen: ScreenReaderState[] = [];
    let r!: TestRenderer.ReactTestRenderer;
    act(() => {
      r = TestRenderer.create(<Probe seen={seen} />);
    });
    expect(seen.at(-1)).toBeNull();
    expect(moneyMode(null, undefined, seen.at(-1)!)).toBeNull();
    act(() => {
      jest.advanceTimersByTime(SCREEN_READER_WAIT);
    });
    expect(seen.at(-1)).toBe('unanswered');
    expect(moneyMode(null, undefined, seen.at(-1)!)).toBe('list');
    act(() => r.unmount());
  });

  test('a failed read is the List, and the first known value is kept', async () => {
    jest
      .spyOn(AccessibilityInfo, 'isScreenReaderEnabled')
      .mockRejectedValue(new Error('no bridge'));
    const seen: ScreenReaderState[] = [];
    let r!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      r = TestRenderer.create(<Probe seen={seen} />);
    });
    expect(seen.at(-1)).toBe('unanswered');
    act(() => r.unmount());
  });
});

describe('the first frame', () => {
  test('VoiceOver unknown: neither the List nor the Map is drawn', async () => {
    mockReader = null;
    heldRead();
    const r = await render();
    expect(byTestID(r.root, 'money-pending')).toBeDefined();
    expect(r.root.findAllByType(SegmentedPicker)).toHaveLength(0);
    expect(byTestID(r.root, 'money-title')).toBeUndefined();
    expect(byTestID(r.root, 'money-map-card')).toBeUndefined();
    expect(MoneyMap).not.toHaveBeenCalled();
    // The answer draws one view, once.
    mockReader = true;
    await act(async () =>
      r.update(withNavigationOptions(<MoneyScreen />, () => undefined)),
    );
    expect(r.root.findByType(SegmentedPicker).props.value).toBe('list');
    expect(byTestID(r.root, 'money-title')).toBeDefined();
    await act(async () => r.unmount());
  });

  test('the Map loads in its own frame: bar title, card, controls and panel hold their places', async () => {
    const read = heldRead();
    const r = await render();
    const loading = mapFrame(r.root);
    expect(loading).toEqual({
      title: 'Money map',
      transparent: false,
      largeTitle: false,
      card: true,
      picker: 'map',
      // Hung from the card's foot by layout: no measured height to wait on.
      controls: { position: 'absolute', top: 16, right: 16 },
      panel: 1,
    });
    expect(byTestID(r.root, 'money-loading')).toBeDefined();
    expect(MoneyMap).not.toHaveBeenCalled();
    const card = byTestID(r.root, 'money-map-card');
    const panel = r.root.findByType(MoneyMapPanel);
    await act(async () => read.answer());
    expect(MoneyMap).toHaveBeenCalled();
    expect(byTestID(r.root, 'money-loading')).toBeUndefined();
    expect(mapFrame(r.root)).toEqual(loading);
    // The same card and panel, not new ones in the old ones' place.
    expect(byTestID(r.root, 'money-map-card')).toBe(card);
    expect(r.root.findByType(MoneyMapPanel)).toBe(panel);
    await act(async () => r.unmount());
  });

  test('the controls do not move when the card reports its height', async () => {
    heldRead();
    const r = await render();
    const before = mapFrame(r.root).controls;
    // The card's host is the nearest view above it that reports a layout.
    let top = byTestID(r.root, 'money-map-card').parent!;
    while (!top.props.onLayout) top = top.parent!;
    act(() => top.props.onLayout({ nativeEvent: { layout: { height: 212 } } }));
    expect(mapFrame(r.root).controls).toEqual(before);
    await act(async () => r.unmount());
  });

  test.each(['map', 'list'] as const)(
    'the summary’s place is kept until its words arrive (%s)',
    async (view) => {
      mockReader = view === 'list';
      const read = heldRead();
      const r = await render();
      const space = byTestID(r.root, 'money-view-summary-space');
      expect(space).toBeDefined();
      expect(flat(space).opacity).toBe(0);
      expect(space.props.accessibilityElementsHidden).toBe(true);
      expect(space.props.importantForAccessibility).toBe('no-hide-descendants');
      expect(byTestID(r.root, 'money-view-summary')).toBeUndefined();
      await act(async () => read.answer());
      expect(byTestID(r.root, 'money-view-summary')).toBeDefined();
      expect(byTestID(r.root, 'money-view-summary-space')).toBeUndefined();
      await act(async () => r.unmount());
    },
  );

  test('the panel keeps the place of each total to come', async () => {
    heldRead();
    let r = await render();
    const spaces = () =>
      ['money-map-total-donations-space', 'money-map-total-public-space'].map(
        (id) => byTestID(r.root, id) !== undefined,
      );
    expect(spaces()).toEqual([true, true]);
    await act(async () => r.unmount());
    // A link without public money keeps one figure's place, as it will draw.
    mockParams.layers = 'donations';
    r = await render();
    expect(spaces()).toEqual([true, false]);
    await act(async () => r.unmount());
  });

  test('an error stays in the Map’s frame', async () => {
    const read = heldRead();
    const r = await render();
    await act(async () => read.fail(new ApiError('offline', 'Offline')));
    expect(byTestID(r.root, 'money-error')).toBeDefined();
    expect(byTestID(r.root, 'money-title')).toBeUndefined();
    expect(byTestID(r.root, 'money-map-card')).toBeDefined();
    expect(options.headerTitle).toBe('Money map');
    expect(r.root.findAllByType(MoneyMapPanel)).toHaveLength(0);
    await act(async () => r.unmount());
  });

  test('an error in the Map’s frame can be pulled to refresh, and offline has Try again', async () => {
    const read = heldRead();
    const r = await render();
    await act(async () => read.fail(new ApiError('offline', 'Offline')));
    const calls = jest.mocked(apiClient.get).mock.calls.length;
    const pull = byTestID(r.root, 'money-map-unavailable').props.refreshControl;
    expect(pull.props.refreshing).toBe(false);
    await act(async () => pull.props.onRefresh());
    expect(jest.mocked(apiClient.get).mock.calls.length).toBe(calls + 1);
    const again = r.root
      .findAllByType(ContentUnavailable)
      .find((x) => x.props.testID === 'money-error')!.props.action;
    expect(again.label).toBe('Try again');
    await act(async () => again.onPress());
    expect(jest.mocked(apiClient.get).mock.calls.length).toBe(calls + 2);
    await act(async () => r.unmount());
  });

  test.each(['map', 'list'] as const)(
    'no place is kept for a summary after an error (%s)',
    async (view) => {
      mockReader = view === 'list';
      const read = heldRead();
      const r = await render();
      expect(byTestID(r.root, 'money-view-summary-space')).toBeDefined();
      await act(async () => read.fail(new ApiError('offline', 'Offline')));
      expect(byTestID(r.root, 'money-error')).toBeDefined();
      expect(byTestID(r.root, 'money-view-summary-space')).toBeUndefined();
      await act(async () => r.unmount());
    },
  );
});

describe('the band under the panel', () => {
  const stageLayout = { nativeEvent: { layout: { width: 402, height: 760 } } };
  const inset = (height: number) => ({ nativeEvent: { layout: { height } } });
  const band = (root: ReactTestInstance) =>
    flat(byTestID(root, 'money-map-band-space')).height;
  afterEach(() => jest.useRealTimers());

  test('a safe area that drops for a few frames at the end of a push does not move the panel; a lasting drop is followed', async () => {
    jest.useFakeTimers();
    const r = await render();
    const probe = () => byTestID(r.root, 'money-map-band');
    // The stage and the probe report in one batch, the probe first: the
    // band owes nothing to the stage's measured height.
    act(() => {
      probe().props.onLayout(inset(96));
      byTestID(r.root, 'money-screen').props.onLayout(stageLayout);
    });
    expect(band(r.root)).toBe(96);
    // The end of the push: the tab bar's share is gone, then back.
    act(() => probe().props.onLayout(inset(34)));
    act(() => {
      jest.advanceTimersByTime(BAND_HOLD - 50);
    });
    expect(band(r.root)).toBe(96);
    act(() => probe().props.onLayout(inset(96)));
    act(() => {
      jest.advanceTimersByTime(BAND_HOLD * 2);
    });
    expect(band(r.root)).toBe(96);
    // A drop that holds (a rotation, a tab bar that minimises) is followed.
    act(() => probe().props.onLayout(inset(34)));
    act(() => {
      jest.advanceTimersByTime(BAND_HOLD);
    });
    expect(band(r.root)).toBe(34);
    // A rise is taken at once.
    act(() => probe().props.onLayout(inset(96)));
    expect(band(r.root)).toBe(96);
    // The chrome takes no inset from the system on iOS.
    expect(byTestID(r.root, 'money-map-chrome').props.edges).toEqual([]);
    await act(async () => r.unmount());
  });

  test('Android keeps the system inset on its chrome: no probe, no spacer', async () => {
    const os = jest.replaceProperty(Platform, 'OS', 'android');
    try {
      const r = await render();
      expect(byTestID(r.root, 'money-map-band')).toBeUndefined();
      expect(byTestID(r.root, 'money-map-band-space')).toBeUndefined();
      expect(byTestID(r.root, 'money-map-chrome').props.edges).toEqual([
        'bottom',
      ]);
      await act(async () => r.unmount());
    } finally {
      os.restore();
    }
  });
});

describe('the card at large text', () => {
  let window: jest.SpyInstance;
  beforeEach(() => {
    window = jest
      .spyOn(ReactNative, 'useWindowDimensions')
      .mockReturnValue({ width: 402, height: 874, fontScale: 2.3, scale: 3 });
    // Each case reads the graph itself: an earlier case may have left a
    // held read behind (clearAllMocks keeps implementations).
    jest.mocked(apiClient.get).mockImplementation(async (path, decode) => ({
      data: decode(pinned(path)),
      stale: false,
      asOf: '2026-09-21',
      savedAt: 1,
    }));
  });
  afterEach(() => window.mockRestore());

  test('the jurisdiction and the List | Map picker stay out of the scroll; only the sentence scrolls', async () => {
    const r = await render();
    const card = byTestID(r.root, 'money-map-card');
    const scroll = byTestID(r.root, 'money-map-card-scroll');
    const within = (root: ReactTestInstance, id: string) =>
      root.findAll((n) => n.props.testID === id).length > 0;
    expect(within(scroll, 'money-view-summary')).toBe(true);
    for (const pinned of ['money-map-card-head', 'money-map-card-picker']) {
      expect(within(card, pinned)).toBe(true);
      expect(within(scroll, pinned)).toBe(false);
    }
    expect(
      within(byTestID(r.root, 'money-map-card-picker'), 'money-view-toggle'),
    ).toBe(true);
    await act(async () => r.unmount());
  });

  test('where the pinned parts need more than the cap, the cap is theirs and the panel gives it back', async () => {
    const r = await render();
    act(() =>
      byTestID(r.root, 'money-screen').props.onLayout({
        nativeEvent: { layout: { width: 402, height: 760 } },
      }),
    );
    let top = byTestID(r.root, 'money-map-card').parent!;
    while (flat(top).maxHeight === undefined) top = top.parent!;
    const cap = flat(top).maxHeight as number;
    const panelCap = r.root.findByType(MoneyMapPanel).props.maxHeight;
    // The jurisdiction and the picker, far taller than the cap allows.
    act(() => {
      for (const id of ['money-map-card-head', 'money-map-card-picker'])
        byTestID(r.root, id).props.onLayout({
          nativeEvent: { layout: { height: 200 } },
        });
    });
    const raised = flat(top).maxHeight as number;
    expect(raised).toBeGreaterThan(cap);
    expect(raised).toBeGreaterThanOrEqual(400 + 44);
    act(() =>
      top.props.onLayout({ nativeEvent: { layout: { height: raised } } }),
    );
    expect(r.root.findByType(MoneyMapPanel).props.maxHeight).toBeLessThan(
      panelCap,
    );
    await act(async () => r.unmount());
  });
});

describe('sizes read before the first frame', () => {
  test('the stage, the card and the band are in state with no layout event', async () => {
    jest.mocked(apiClient.get).mockImplementation(async (path, decode) => ({
      data: decode(pinned(path)),
      stale: false,
      asOf: '2026-09-21',
      savedAt: 1,
    }));
    // What the host would answer synchronously for each measured view.
    // Jest's views hand refs their component, so the frames go in by the
    // view's own props.
    const frames: Record<string, { width: number; height: number }> = {
      'money-screen': { width: 402, height: 760 },
      'money-map-band': { width: 1, height: 96 },
    };
    const read = jest.spyOn(measure, 'frameOf').mockImplementation((ref) => {
      const props = (
        ref.current as { props?: { testID?: string; style?: unknown } }
      )?.props;
      if (!props) return null;
      if (props.testID && frames[props.testID]) return frames[props.testID]!;
      const style = StyleSheet.flatten(props.style as never) as
        | Record<string, unknown>
        | undefined;
      // The card's host: the one view with the top's padding.
      return style?.paddingTop === 8 && style?.width === '100%'
        ? { width: 402, height: 212 }
        : null;
    });
    const r = await render();
    // No onLayout has been sent: these come from the synchronous read.
    expect(r.root.findByType(MoneyMapPanel).props.stageHeight).toBe(760);
    expect(flat(byTestID(r.root, 'money-map-band-space')).height).toBe(96);
    const map = jest.mocked(MoneyMap).mock.calls.at(-1)![0];
    expect(map.insets.top).toBe(212 + 8);
    await act(async () => r.unmount());
    read.mockRestore();
  });
});

describe('the map while its Search is open', () => {
  test('keeps its frame: the short search card does not change the map’s insets, open or closed', async () => {
    jest.mocked(apiClient.get).mockImplementation(async (path, decode) => ({
      data: decode(pinned(path)),
      stale: false,
      asOf: '2026-09-21',
      savedAt: 1,
    }));
    const r = await render();
    const top = () => {
      let node = (byTestID(r.root, 'money-map-card') ??
        byTestID(r.root, 'money-map-search-card'))!.parent!;
      while (!node.props.onLayout) node = node.parent!;
      return node;
    };
    const report = (height: number) =>
      act(() => top().props.onLayout({ nativeEvent: { layout: { height } } }));
    const insets = () => jest.mocked(MoneyMap).mock.calls.at(-1)![0].insets;
    act(() =>
      byTestID(r.root, 'money-screen').props.onLayout({
        nativeEvent: { layout: { width: 402, height: 760 } },
      }),
    );
    report(300);
    const rest = insets();
    expect(rest.top).toBe(308);
    // Search opens: its card is a third of the height.
    act(() =>
      r.root
        .findAllByType(IconButton)
        .find((b) => b.props.testID === 'money-map-search')!
        .props.onPress(),
    );
    report(90);
    expect(insets()).toBe(rest);
    // Search closes; the card is back but has not reported its height yet.
    await act(async () => r.root.findByType(MoneyMapSearch).props.onClose());
    expect(insets()).toBe(rest);
    report(300);
    expect(insets()).toEqual(rest);
    await act(async () => r.unmount());
  });
});

describe('Android’s band when the tab bar hides for the keyboard', () => {
  test('is the same before and after, whichever of the stage and the panel host reports first', async () => {
    jest.mocked(apiClient.get).mockImplementation(async (path, decode) => ({
      data: decode(pinned(path)),
      stale: false,
      asOf: '2026-09-21',
      savedAt: 1,
    }));
    const os = jest.replaceProperty(Platform, 'OS', 'android');
    try {
      const r = await render();
      const stage = (height: number) =>
        act(() =>
          byTestID(r.root, 'money-screen').props.onLayout({
            nativeEvent: { layout: { width: 411, height } },
          }),
        );
      const host = (y: number) =>
        act(() =>
          r.root.findByType(MoneyMapPanel).parent!.props.onLayout({
            nativeEvent: { layout: { y, height: 100 } },
          }),
        );
      const bottom = () =>
        jest.mocked(MoneyMap).mock.calls.at(-1)![0].insets.bottom;
      // At rest: a 104 pt band (the tab bar) under the panel.
      stage(709);
      host(505);
      act(() => r.root.findByType(MoneyMapPanel).props.onPeekHeight(100));
      const rest = bottom();
      expect(rest).toBe(104 + 100 + 8);
      // The keyboard: the tab bar hides and the stage takes its room.
      stage(813);
      host(609);
      // It comes back, and the host reports before the stage does.
      host(505);
      stage(709);
      expect(bottom()).toBe(rest);
      await act(async () => r.unmount());
    } finally {
      os.restore();
    }
  });
});

describe('the words kept for the summary', () => {
  const shape = (text: string) => text.replace(/\d/g, '0');
  test('with no graph yet they are the summary’s length', () => {
    expect(shape(moneySummaryStandIn('federal', {}))).toBe(
      shape(moneySummary(graph, filtersFromParams(graph, {}))),
    );
    const params = { from: '2022', to: '2022', layers: 'donations' };
    expect(shape(moneySummaryStandIn('federal', params))).toBe(
      shape(moneySummary(graph, filtersFromParams(graph, params))),
    );
  });
  test('a graph read earlier this session gives the summary itself', async () => {
    jest.mocked(apiClient.get).mockImplementation(async (path, decode) => ({
      data: decode(pinned(path)),
      stale: false,
      asOf: '2026-09-21',
      savedAt: 1,
    }));
    const r = await render();
    await act(async () => r.unmount());
    expect(moneySummaryStandIn('federal', {})).toBe(
      moneySummary(graph, filtersFromParams(graph, {})),
    );
  });
});

describe('the panel’s height', () => {
  afterEach(() => jest.restoreAllMocks());
  test('is set at once when first placed or re-capped, and glides only after the reader’s action', async () => {
    const timing = jest.spyOn(Reanimated, 'withTiming');
    const props = {
      focus: null,
      totals: { donations: 1, publicMoney: 2 },
      caption: '',
      legend: null,
      sourceLine: null,
      stageHeight: 800,
      onExpanded: () => undefined,
      onClear: () => undefined,
      onPeekHeight: () => undefined,
    };
    let r!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      r = TestRenderer.create(<MoneyMapPanel {...props} expanded={false} />);
    });
    const content = r.root
      .findByType(ScrollView)
      .findAllByType(View)
      .find((node) => node.props.onLayout)!;
    // First placement.
    act(() =>
      content.props.onLayout({ nativeEvent: { layout: { height: 100 } } }),
    );
    // A cap corrected as the stage measures itself.
    await act(async () =>
      r.update(<MoneyMapPanel {...props} expanded={false} maxHeight={90} />),
    );
    await act(async () =>
      r.update(<MoneyMapPanel {...props} expanded={false} maxHeight={120} />),
    );
    expect(timing).not.toHaveBeenCalled();
    // The reader opens the panel.
    await act(async () =>
      r.update(<MoneyMapPanel {...props} expanded maxHeight={400} />),
    );
    expect(timing).toHaveBeenCalledTimes(1);
    await act(async () => r.unmount());
  });
});
