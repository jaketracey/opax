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
import {
  hairline,
  minimumTarget,
  rhythm,
  textStyles,
} from '../src/design/tokens';
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

  test('the sentence’s room is a whole number of its lines: none is cut through above the picker', async () => {
    const r = await render();
    act(() =>
      byTestID(r.root, 'money-screen').props.onLayout({
        nativeEvent: { layout: { width: 402, height: 758 } },
      }),
    );
    let top = byTestID(r.root, 'money-map-card').parent!;
    while (flat(top).maxHeight === undefined) top = top.parent!;
    // The sweep's frames (iPhone 17 Pro, AX3): the jurisdiction 62 pt, the
    // picker 114 pt, a line of the sentence 43.25 pt.
    act(() => {
      byTestID(r.root, 'money-map-card-head').props.onLayout({
        nativeEvent: { layout: { height: 62 } },
      });
      byTestID(r.root, 'money-map-card-picker').props.onLayout({
        nativeEvent: { layout: { height: 114 } },
      });
      byTestID(r.root, 'money-map-card-line').props.onLayout({
        nativeEvent: { layout: { height: 43.25 } },
      });
    });
    const room =
      (flat(top).maxHeight as number) -
      62 -
      114 -
      (rhythm.tight * 3 + rhythm.block * 2 + hairline * 2);
    const scroll = byTestID(r.root, 'money-map-card-scroll');
    const height = flat(scroll).maxHeight as number;
    const lines = height / 43.25;
    expect(lines).toBe(Math.floor(room / 43.25));
    expect(lines).toBeGreaterThanOrEqual(1);
    // Not the whole of the room: the part line is given up, not shown.
    expect(room % 43.25).toBeGreaterThan(1);
    expect(height).toBeLessThan(room);
    // It scrolls a line at a time, and the whole sentence is still in it
    // for VoiceOver.
    expect(scroll.props.snapToInterval).toBe(43.25);
    expect(
      scroll.findAll((n) => n.props.testID === 'money-view-summary').length,
    ).toBeGreaterThan(0);
    // The line it is measured by is never read out.
    expect(
      byTestID(r.root, 'money-map-card-line').props.accessibilityElementsHidden,
    ).toBe(true);
    await act(async () => r.unmount());
  });

  test('with less than one line of room no part of the sentence is drawn; VoiceOver still has it', async () => {
    const r = await render();
    act(() =>
      byTestID(r.root, 'money-screen').props.onLayout({
        nativeEvent: { layout: { width: 375, height: 603 } },
      }),
    );
    let top = byTestID(r.root, 'money-map-card').parent!;
    while (flat(top).maxHeight === undefined) top = top.parent!;
    const sentence = byTestID(r.root, 'money-view-summary')!.props.children;
    // The iPhone SE at AX5: the pinned parts take all but 45 pt of the cap,
    // and a line of the sentence is 71.5 pt.
    const report = (id: string, height: number) =>
      byTestID(r.root, id).props.onLayout({
        nativeEvent: { layout: { height } },
      });
    const fit = (each: number) =>
      act(() => {
        report('money-map-card-head', each);
        report('money-map-card-picker', each);
        report('money-map-card-line', 71.5);
      });
    // The cap follows the pinned parts, so the room is found from it.
    const room = (each: number) =>
      (flat(top).maxHeight as number) -
      2 * each -
      (rhythm.tight * 3 + rhythm.block * 2 + hairline * 2);
    fit(200);
    expect(room(200)).toBeGreaterThan(0);
    expect(room(200)).toBeLessThan(71.5);
    const scroll = byTestID(r.root, 'money-map-card-scroll');
    // Nothing of the sentence is drawn, and nothing scrolls into view.
    expect(byTestID(r.root, 'money-view-summary')).toBeUndefined();
    expect(scroll.props.scrollEnabled).toBe(false);
    expect(flat(scroll).maxHeight).toBeUndefined();
    // Its room stays (the card's height is the same) and says the sentence.
    const unseen = byTestID(r.root, 'money-view-summary-unseen')!;
    expect(flat(unseen).height).toBe(room(200));
    expect(unseen.props.accessible).toBe(true);
    expect(unseen.props.accessibilityLabel).toBe(sentence);
    expect(byTestID(r.root, 'money-offline-mark')).toBeUndefined();
    // With room for a line again the sentence is back.
    fit(60);
    expect(byTestID(r.root, 'money-view-summary')).toBeDefined();
    expect(byTestID(r.root, 'money-view-summary-unseen')).toBeUndefined();
    await act(async () => r.unmount());
  });

  test('offline with less than one line of room: the stale-data notice is still shown and said', async () => {
    jest.mocked(apiClient.get).mockImplementation(async (path, decode) => ({
      data: decode(pinned(path)),
      stale: true,
      asOf: '2026-09-21',
      savedAt: Date.parse('2026-09-21T02:00:00Z'),
    }));
    const r = await render();
    act(() =>
      byTestID(r.root, 'money-screen').props.onLayout({
        nativeEvent: { layout: { width: 375, height: 603 } },
      }),
    );
    // With room, the offline line stands under the sentence, in words.
    const sentence = byTestID(r.root, 'money-view-summary')!.props.children;
    const message = r.root.find(
      (n) => n.props.testID === 'money-offline' && n.props.accessibilityLabel,
    ).props.accessibilityLabel as string;
    expect(message).toMatch(/offline/i);
    // The iPhone SE at AX5: under one line of room.
    act(() => {
      for (const id of ['money-map-card-head', 'money-map-card-picker'])
        byTestID(r.root, id).props.onLayout({
          nativeEvent: { layout: { height: 200 } },
        });
      byTestID(r.root, 'money-map-card-line').props.onLayout({
        nativeEvent: { layout: { height: 71.5 } },
      });
    });
    // The line's words cannot be drawn there either: its mark is, and the
    // room says the sentence and then the same words.
    expect(byTestID(r.root, 'money-offline')).toBeUndefined();
    const unseen = byTestID(r.root, 'money-view-summary-unseen')!;
    expect(
      unseen.findAll((n) => n.props.testID === 'money-offline-mark').length,
    ).toBeGreaterThan(0);
    expect(unseen.props.accessibilityLabel).toBe(`${sentence} ${message}`);
    await act(async () => r.unmount());
  });

  const gaps = rhythm.tight * 3 + rhythm.block * 2 + hairline * 2;
  const line =
    textStyles.secondary.lineHeight *
    ReactNative.Dimensions.get('window').fontScale;
  test.each([
    // Room for the panel to keep its floor: two lines of the sentence.
    ['two lines', 80, 2],
    // The pinned parts alone fill the room: one line, as the card always had.
    ['one line', 200, 1],
  ])(
    'where the pinned parts need more than the cap, the cap is theirs and the panel gives it back (%s)',
    async (_name, each, lines) => {
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
      act(() => {
        for (const id of ['money-map-card-head', 'money-map-card-picker'])
          byTestID(r.root, id).props.onLayout({
            nativeEvent: { layout: { height: each } },
          });
      });
      const raised = flat(top).maxHeight as number;
      expect(raised).toBeGreaterThan(cap);
      // The pinned parts, the gaps around them, and the sentence's lines.
      const sentence = Math.max(minimumTarget, line * lines);
      expect(raised).toBeGreaterThanOrEqual(2 * each + gaps + sentence);
      // Never more than the lines it keeps: the second line gives way
      // where the panel would lose its floor.
      expect(raised).toBeLessThan(2 * each + gaps + sentence + 1);
      act(() =>
        top.props.onLayout({ nativeEvent: { layout: { height: raised } } }),
      );
      expect(r.root.findByType(MoneyMapPanel).props.maxHeight).toBeLessThan(
        panelCap,
      );
      await act(async () => r.unmount());
    },
  );
});

describe('the map and its panel while Search is open at large text', () => {
  let window: jest.SpyInstance;
  beforeEach(() => {
    window = jest
      .spyOn(ReactNative, 'useWindowDimensions')
      .mockReturnValue({ width: 402, height: 874, fontScale: 2.3, scale: 3 });
    jest.mocked(apiClient.get).mockImplementation(async (path, decode) => ({
      data: decode(pinned(path)),
      stale: false,
      asOf: '2026-09-21',
      savedAt: 1,
    }));
  });
  afterEach(() => window.mockRestore());

  test('the panel is hidden and its room goes to the map; both come back when Search closes', async () => {
    const r = await render();
    act(() =>
      byTestID(r.root, 'money-screen').props.onLayout({
        nativeEvent: { layout: { width: 402, height: 760 } },
      }),
    );
    act(() => r.root.findByType(MoneyMapPanel).props.onPeekHeight(180));
    const call = () => jest.mocked(MoneyMap).mock.calls.at(-1)![0];
    const host = () => byTestID(r.root, 'money-map-panel-host');
    const rest = { insets: call().insets, clip: call().clip };
    expect(rest.insets.bottom).toBeGreaterThan(rhythm.tight);
    expect(flat(host()).opacity).toBeUndefined();
    act(() =>
      r.root
        .findAllByType(IconButton)
        .find((b) => b.props.testID === 'money-map-search')!
        .props.onPress(),
    );
    // The map keeps the band under it and the tight margin, no panel.
    expect(call().insets.bottom).toBe(rhythm.tight);
    expect(call().insets.bottom).toBeLessThan(rest.insets.bottom);
    expect(call().clip!.bottom).toBeLessThan(rest.clip!.bottom);
    expect(flat(host()).opacity).toBe(0);
    expect(host().props.pointerEvents).toBe('none');
    expect(host().props.importantForAccessibility).toBe('no-hide-descendants');
    await act(async () => r.root.findByType(MoneyMapSearch).props.onClose());
    expect(call().insets).toEqual(rest.insets);
    expect(flat(host()).opacity).toBeUndefined();
    await act(async () => r.unmount());
  });
  test('the strip is fitted once for each set of results, never for a keystroke that lists the same ones', async () => {
    const r = await render();
    act(() =>
      byTestID(r.root, 'money-screen').props.onLayout({
        nativeEvent: { layout: { width: 402, height: 760 } },
      }),
    );
    act(() => r.root.findByType(MoneyMapPanel).props.onPeekHeight(180));
    const call = () => jest.mocked(MoneyMap).mock.calls.at(-1)![0];
    const top = () => {
      let node = (byTestID(r.root, 'money-map-card') ??
        byTestID(r.root, 'money-map-search-card'))!.parent!;
      while (!node.props.onLayout) node = node.parent!;
      return node;
    };
    const report = (height: number) =>
      act(() => top().props.onLayout({ nativeEvent: { layout: { height } } }));
    const type = (text: string) =>
      act(() =>
        byTestID(r.root, 'money-map-search-field')!.props.onChangeText(text),
      );
    report(300);
    const rest = call().insets;
    act(() =>
      r.root
        .findAllByType(IconButton)
        .find((b) => b.props.testID === 'money-map-search')!
        .props.onPress(),
    );
    // Open, nothing typed: the short field is drawn and the map keeps its
    // view (no key, the card's own top).
    report(90);
    expect(call().fitKey).toBeNull();
    expect(call().insets.top).toBe(rest.top);
    // Results are listed: the strip starts under the taller card, with a key.
    type('lab');
    report(420);
    const listed = { insets: call().insets, fitKey: call().fitKey };
    expect(listed.fitKey).toEqual(expect.any(String));
    expect(listed.insets.top).toBe(420 + rhythm.tight);
    expect(listed.insets.bottom).toBe(rhythm.tight);
    // Nothing matches: another set, another strip.
    type('zzzzqq');
    report(150);
    const none = { insets: call().insets, fitKey: call().fitKey };
    expect(none.fitKey).not.toBe(listed.fitKey);
    expect(none.insets.top).toBe(150 + rhythm.tight);
    // One more letter: still nothing, and the line wraps. The same set, so
    // the same insets object and key: the map is not asked to move.
    type('zzzzqqq');
    report(190);
    expect(call().insets).toBe(none.insets);
    expect(call().fitKey).toBe(none.fitKey);
    // Closed: the card's frame again, and no key.
    await act(async () => r.root.findByType(MoneyMapSearch).props.onClose());
    report(300);
    expect(call().insets).toEqual(rest);
    expect(call().fitKey).toBeNull();
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

describe('a stage that changes under the open Search', () => {
  const read = () =>
    jest.mocked(apiClient.get).mockImplementation(async (path, decode) => ({
      data: decode(pinned(path)),
      stale: false,
      asOf: '2026-09-21',
      savedAt: 1,
    }));
  const open = (r: TestRenderer.ReactTestRenderer) =>
    act(() =>
      r.root
        .findAllByType(IconButton)
        .find((b) => b.props.testID === 'money-map-search')!
        .props.onPress(),
    );
  const call = () => jest.mocked(MoneyMap).mock.calls.at(-1)![0];

  test('the map is told to hold its size for as long as its insets are held', async () => {
    read();
    const r = await render();
    act(() =>
      byTestID(r.root, 'money-screen').props.onLayout({
        nativeEvent: { layout: { width: 402, height: 760 } },
      }),
    );
    expect(call().holdSize).toBe(false);
    open(r);
    expect(call().holdSize).toBe(true);
    await act(async () => r.root.findByType(MoneyMapSearch).props.onClose());
    expect(call().holdSize).toBe(false);
    await act(async () => r.unmount());
  });

  test('a turn during Search lets the held insets go: the map takes the ones of the moment', async () => {
    read();
    const before = ReactNative.Dimensions.get('window');
    const turn = (width: number, height: number) =>
      act(() =>
        ReactNative.Dimensions.set({ window: { ...before, width, height } }),
      );
    try {
      const r = await render();
      const stage = (width: number, height: number) =>
        act(() =>
          byTestID(r.root, 'money-screen').props.onLayout({
            nativeEvent: { layout: { width, height } },
          }),
        );
      const top = () => {
        let node = (byTestID(r.root, 'money-map-card') ??
          byTestID(r.root, 'money-map-search-card'))!.parent!;
        while (!node.props.onLayout) node = node.parent!;
        return node;
      };
      const report = (height: number) =>
        act(() =>
          top().props.onLayout({ nativeEvent: { layout: { height } } }),
        );
      stage(before.width, 1200);
      report(300);
      const rest = call().insets;
      open(r);
      report(90);
      expect(call().insets).toBe(rest);
      // The turn: a new window, a new stage, and the search card measured
      // in it.
      turn(before.height, before.width);
      stage(before.height, 640);
      report(96);
      expect(call().insets).not.toBe(rest);
      expect(call().insets.top).toBe(96 + rhythm.tight);
      expect(call().holdSize).toBe(false);
      // Closed in the new orientation: its own card's frame.
      await act(async () => r.root.findByType(MoneyMapSearch).props.onClose());
      report(260);
      expect(call().insets.top).toBe(260 + rhythm.tight);
      expect(call().holdSize).toBe(false);
      await act(async () => r.unmount());
    } finally {
      turn(before.width, before.height);
    }
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
