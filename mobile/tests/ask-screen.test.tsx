import { withNavigationOptions } from './navigation-options';
import { useState } from 'react';
import * as measure from '../src/features/money/map/measure';
import { defaultOptions } from '../src/features/ask/model';
import {
  HeaderHeightContext,
  NavigationContext,
  NavigationContainerRefContext,
  NavigationRouteContext,
} from 'expo-router/react-navigation';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import {
  act,
  create,
  type ReactTestInstance,
  type ReactTestRenderer,
} from 'react-test-renderer';
import type { NativeStackHeaderItem } from 'expo-router';
import { router, useLocalSearchParams } from 'expo-router';
import {
  AccessibilityInfo,
  ActivityIndicator,
  BackHandler,
  Dimensions,
  InteractionManager,
  Keyboard,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { announceAnswer } from '../src/features/ask/AnswerView';
import { auditAccessibility } from './screen-a11y';
import a11yExceptions from './screen-a11y-exceptions.cjs';
import { BarFade } from '../src/design/bar-fade';
import AskScreen, { PhoneDock } from '../src/features/ask/AskScreen';
import { useScreenReady } from '../src/analytics/timing';
import {
  AskDock,
  COMPOSER_FIELD_PADDING,
  COMPOSER_HEIGHT_SHARE,
  caretAfterContent,
  caretAfterSelection,
  caretSelection,
  composerFieldCap,
  composerFieldFloor,
  composerFieldRoomEstimate,
  placeholderEms,
  placeholderFits,
  composerLines,
  composerTextCap,
  prefilledCaret,
} from '../src/features/ask/AskDock';
import clarify from '../scripts/fixtures/ask-clarify.json';
import { catalogs, client } from '../src/api/runtime';
import { arriveInAsk, askSession } from '../src/features/ask/session';
import { reconcileChats, syncSubmittedChat } from '../src/features/ask/sync';
import { chatsSnapshot, loadChats } from '../src/features/ask/store';
import { openAskOptions } from '../src/features/ask/Options';
import { AskFailure, type StreamHandlers } from '../src/features/ask/stream';
import { STATUS_HOLD_MS } from '../src/features/ask/AskStatus';
import { colors, rhythm, textStyles } from '../src/design/tokens';
import { chromeTextScaleCap } from '../src/design/text-scale';
import { Icon } from '../src/design/icon';
import { Text } from '../src/design/text';
import { designFlags } from '../src/design/flags';
import * as ScrollTop from '../src/design/scroll-to-top';
import { askRoute, conversationsRoute } from '../src/navigation/routes/ask';
import { useSavedChoice, useSeat } from '../src/features/your-mp/useSeat';
import { seatStarter, startersFor } from '../src/features/ask/starters';
import {
  dispatchKeyCommand,
  requestFocus,
  takeFocusRequest,
  moveAccessibilityFocus,
} from '../src/design/keyboard';
import { useOpenAsk } from '../src/features/ask/open';
import { askReturnSnapshot, setAskReturn } from '../src/features/ask/return';
import { fromWebPath } from '../src/navigation/external';
import * as Duo from '../modules/opax-duo';
import * as RootBar from '../modules/opax-root-bar';
import * as BarAppearance from '../src/navigation/useRootBarAppearance';
import {
  currentRule,
  resetAdaptiveDeviceForTests,
  setWindowTraitsOverride,
} from '../src/design/adaptive';
import { ReservedRegionsProvider } from '../src/design/fold-area';
import { AskColumns } from '../src/features/ask/AskLayout';
import { AskIdle, idleCopy, SIZING_MEMBERS } from '../src/features/ask/AskIdle';
import { EngravedMark } from '../src/design/engraving';
import * as accessibility from '../src/design/accessibility';
import { AskThread } from '../src/features/ask/AskThread';
import { SectionHeader } from '../src/design/layout';
import { emptyReservedRegions } from '../src/design/fold';

// The bar's items, as AskScreen sets them through Stack.Screen.
const mockBar: { options: Record<string, unknown> } = { options: {} };
// Ask's resets below describe its scroll view under a translucent root bar,
// which is iOS 26 and later; before iOS 26 the bar is opaque and the rest
// is 0 (tests/scroll-to-top.test.tsx).
const platformVersion = Object.getOwnPropertyDescriptor(Platform, 'Version');
beforeAll(() => {
  Object.defineProperty(Platform, 'Version', { configurable: true, value: 26 });
});
afterAll(() => {
  if (platformVersion)
    Object.defineProperty(Platform, 'Version', platformVersion);
});

jest.mock('../src/design/keyboard', () => ({
  ...jest.requireActual('../src/design/keyboard'),
  moveAccessibilityFocus: jest.fn(),
}));
jest.mock('../src/analytics/timing', () => ({ useScreenReady: jest.fn() }));
jest.mock('expo-router', () => ({
  useIsPreview: () => false,
  Stack: {
    Screen: ({ options }: { options: Record<string, unknown> }) => {
      mockBar.options = options;
      return null;
    },
  },
  useLocalSearchParams: jest.fn(() => ({})),
  useSegments: () => ['(tabs)', '(today)'],
  // As a focused screen: AndroidFocusBack's handler, while it is mounted.
  useFocusEffect: (effect: () => void | (() => void)) =>
    jest.requireActual('react').useEffect(effect, [effect]),
  router: {
    push: jest.fn(),
    navigate: jest.fn(),
    back: jest.fn(),
    canGoBack: () => false,
  },
}));
jest.mock('../src/api/runtime', () => ({
  client: { askPost: jest.fn() },
  catalogs: {
    roster: jest.fn().mockRejectedValue(new Error('Offline')),
    slugs: jest.fn(),
    bills: jest.fn(),
  },
}));
// These readers agreed to Ask's consent already (ask-consent.test.tsx).
jest.mock('../src/features/ask/consent', () => ({
  askConsentGiven: jest.fn().mockResolvedValue(true),
  giveAskConsent: jest.fn().mockResolvedValue(undefined),
}));
const mockAccount: {
  status: { signedIn: boolean } | null;
  checking: boolean;
} = { status: { signedIn: true }, checking: false };
jest.mock('../src/features/account/store', () => ({
  useAccount: () => mockAccount,
  accountSnapshot: () => mockAccount,
}));
jest.mock('../src/voice/linked', () => ({ voiceLinked: true }));
jest.mock('../src/features/ask/store', () => {
  const saved = { v: 1, active: null, chats: [] };
  return {
    chatsSnapshot: jest.fn(() => saved),
    subscribeChats: () => () => {},
    subscribeChatDeletion: () => () => {},
    loadChats: jest.fn().mockResolvedValue(undefined),
    saveChats: jest.fn().mockResolvedValue(undefined),
    forgetActiveChat: jest.fn(),
    clearAskConversations: jest.fn(),
  };
});
jest.mock('../src/features/ask/sync', () => ({
  ChatSyncError: jest.requireActual('../src/features/ask/sync').ChatSyncError,
  syncSubmittedChat: jest.fn().mockResolvedValue(undefined),
  deleteRemoteChat: jest.fn(),
  reconcileChats: jest.fn(),
}));
// The seat is read on the device only; no seat unless a test sets one.
jest.mock('../src/features/your-mp/useSeat', () => ({
  useSeat: jest.fn(() => ({ status: 'none' })),
  useSavedChoice: jest.fn(() => undefined),
  savedSeatDirectory: jest.fn(() => mockDirectory.current),
}));
const mockDirectory: { current: unknown } = { current: null };
jest.mock('../src/features/your-mp/model', () => ({
  ...jest.requireActual('../src/features/your-mp/model'),
  representativeProfile: () => ({
    name: 'Sam Placeholder',
    slug: 'sam-placeholder',
  }),
}));
// An answer's own rendering is covered in ask-answer-design; here it only
// has to exist. The thread's other parts are real.
jest.mock('../src/features/ask/AnswerView', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require('react');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { View } = require('react-native');
  return {
    AnswerView: () => React.createElement(View, { testID: 'ask-answer' }),
    SearchOpaxRow: ({ question }: { question: string }) =>
      React.createElement(View, { testID: 'ask-search-opax', question }),
    AskRevealContext: React.createContext(null),
    announceAnswer: jest.fn(),
    machineNote: { title: 'Machine-written', body: ['Fixture note.'] },
  };
});
jest.mock('../src/features/ask/Options', () => ({
  topics: { housing: 'Housing' },
  openAskOptions: jest.fn(),
}));
// The real pane only where a test draws both panes (`mockRealPane`).
let mockRealPane = false;
jest.mock('../src/features/ask/SourcesPane', () => ({
  AskPaneProvider: ({ children }: { children: unknown }) => children,
  useAskSources: (...args: unknown[]) =>
    mockRealPane
      ? jest
          .requireActual('../src/features/ask/SourcesPane')
          .useAskSources(...args)
      : { context: null, onScroll: undefined, pane: null },
  useAskPane: () => null,
}));

const oneChat = {
  v: 1 as const,
  active: 'saved-fixture',
  chats: [
    {
      id: 'saved-fixture',
      title: 'A saved fixture question?',
      kind: 'all' as const,
      speaker: '',
      created: 1,
      updated: 1,
      thread: [
        { role: 'user' as const, text: 'A saved fixture question?' },
        { role: 'answer' as const, text: 'A saved fixture answer.' },
      ],
    },
  ],
};
const noChats = { v: 1 as const, active: null, chats: [] };
const answer = {
  answer: 'Synthetic fixture answer.',
  citations: {},
  sources: [
    {
      resource: 'fixture',
      title: 'Synthetic fixture',
      slug: 'fixture',
      snippet: 'Synthetic evidence passage.',
    },
  ],
};

let view: ReactTestRenderer | null = null;
let scrollTo: jest.SpyInstance;
beforeEach(() => {
  mockAccount.status = { signedIn: true };
  mockAccount.checking = false;
  takeFocusRequest('ask');
  jest.mocked(TextInput.prototype.focus).mockClear();
  jest.mocked(client.askPost).mockReset();
  jest.mocked(router.push).mockClear();
  jest.mocked(chatsSnapshot).mockImplementation(() => noChats);
  scrollTo = jest
    .spyOn(
      ScrollView.prototype as unknown as { scrollTo: () => void },
      'scrollTo',
    )
    .mockImplementation(() => undefined);
  askSession.start();
  askSession.setDraft('');
});
afterEach(async () => {
  await act(async () => {
    // Let the reveal's fallback frames run before teardown.
    await new Promise((r) => setTimeout(r, 30));
    view?.unmount();
  });
  view = null;
  scrollTo.mockRestore();
  askSession.start();
  askSession.setDraft('');
  (useLocalSearchParams as jest.Mock).mockReturnValue({});
  jest.mocked(useSeat).mockReturnValue({ status: 'none' } as never);
  jest.mocked(useSavedChoice).mockReturnValue(undefined);
  jest.mocked(catalogs.roster).mockRejectedValue(new Error('Offline'));
  mockDirectory.current = null;
  setAskReturn(null);
});
async function mount(screen = <AskScreen />) {
  await act(async () => {
    view = create(
      withNavigationOptions(screen, (options) => {
        mockBar.options = options;
      }),
    );
  });
  return view!;
}

test.each([
  ['iPhone', 'ios', false, false, 402],
  ['adaptive iPhone', 'ios', false, true, 402],
  ['docked iPad', 'ios', true, true, 1024],
  ['docked Duo', 'ios', false, true, 720],
  ['Android', 'android', false, false, 402],
] as const)(
  '%s uses the expected title for idle, thread, busy, error and clarify',
  async (_device, os, pad, adaptive, width) => {
    const platform = jest.replaceProperty(Platform, 'OS', os);
    const idiom = jest.spyOn(Platform, 'isPad', 'get').mockReturnValue(pad);
    const window = Dimensions.get('window');
    const base = askSession.snapshot();
    const snapshot = jest.spyOn(askSession, 'snapshot');
    act(() => {
      Dimensions.set({ window: { ...window, width, height: 1100 } });
      setWindowTraitsOverride({
        horizontal: adaptive ? 'regular' : 'compact',
        vertical: 'regular',
        foldable: adaptive && !pad,
      });
      resetAdaptiveDeviceForTests();
    });
    const states = {
      idle: base,
      thread: { ...base, thread: oneChat.chats[0]!.thread },
      busy: { ...base, busy: true },
      error: {
        ...base,
        error: new AskFailure('network', 'Synthetic offline failure'),
        failed: { question: 'A fixture question?' },
      },
      clarify: { ...base, clarify: { question: 'A fixture question?' } },
    };
    // Two panes from the 700pt split breakpoint, on any device.
    const docked = adaptive && width >= 700;
    try {
      for (const [state, value] of Object.entries(states)) {
        snapshot.mockReturnValue(value);
        if (!view) await mount();
        else
          await act(async () => {
            view!.update(
              withNavigationOptions(<AskScreen />, (options) => {
                mockBar.options = options;
              }),
            );
          });
        expect(view!.root.findByType(AskColumns).props.docked).toBe(docked);
        // Idle keeps the large title; docked, only a regular iPhone (Duo)
        // keeps it, as its Bills and Today do. iPad's two panes are inline.
        expect(mockBar.options.headerLargeTitleEnabled).toBe(
          os === 'ios'
            ? state === 'idle' && (!docked || currentRule() !== 'pad')
            : undefined,
        );
      }
    } finally {
      await act(async () => {
        view?.unmount();
        view = null;
        snapshot.mockRestore();
        Dimensions.set({ window });
        setWindowTraitsOverride(undefined);
        resetAdaptiveDeviceForTests();
      });
      platform.restore();
      idiom.mockRestore();
    }
  },
);

test("an open thread's inset drops the hidden large-title band: its question sits 8 pt under the bar at rest (sweep 1, 7.1)", async () => {
  jest
    .mocked(client.askPost)
    .mockResolvedValueOnce(answer)
    .mockResolvedValueOnce({ questions: [] });
  // A 47 pt status area and 44 pt inline bar; UIKit keeps the bar's 52 pt
  // large-title frame once the title goes inline, and reports it.
  const compact = 91;
  const expanded = compact + 52;
  await mount(
    <SafeAreaInsetsContext.Provider
      value={{ top: 47, bottom: 34, left: 0, right: 0 }}
    >
      <HeaderHeightContext.Provider value={expanded}>
        <AskScreen />
      </HeaderHeightContext.Provider>
    </SafeAreaInsetsContext.Provider>,
  );
  const scrollView = () =>
    view!.root.find(
      (n) => n.props.testID === 'ask-screen' && n.type === ScrollView,
    );
  // Idle: the large title is real; UIKit's inset stands.
  expect(scrollView().props.contentInset).toBeUndefined();
  expect(
    StyleSheet.flatten(scrollView().props.contentContainerStyle).paddingTop,
  ).toBe(rhythm.block);
  await type('A fixture question?');
  await press('ask-submit');
  expect(scrollView().props.contentInset).toEqual({ top: -52 });
  expect(scrollView().props.scrollIndicatorInsets).toEqual({ top: -52 });
  expect(
    StyleSheet.flatten(scrollView().props.contentContainerStyle).paddingTop,
  ).toBe(rhythm.heading);
});

// b64 on the Duo's outer display (466 x 678 pt): the status bar sits on the
// side rail, so the top inset is 0, yet UIKit sets the bar below the top edge
// (back pill about 23-72 pt) and shows no large title. Ask's inline geometry
// assumed a 44 pt bar from the 0 pt inset and took a 32 pt "band" off the
// thread's inset, so the question drew under the back pill and title.
test.each([
  // device, bar edge, window, insets, measured header, real compact bar
  ['Duo outer, side rail', 'trailing', 466, 678, 0, 60, 76, 76],
  // A 62 pt Dynamic Island inset (56.5 pt status area), 44 pt bar, and the
  // 52 pt large-title frame UIKit keeps once the title goes inline (sweep 1,
  // 7.1).
  ['standard iPhone', 'unspecified', 402, 874, 62, 0, 152.5, 100.5],
] as const)(
  'the %s thread starts its question below the measured bar, at rest and when pinned',
  async (_device, edge, width, height, top, right, measured, bar) => {
    const window = Dimensions.get('window');
    const barEdge = jest
      .spyOn(RootBar, 'useVerticalBarEdge')
      .mockReturnValue(edge);
    const platform = jest.replaceProperty(Platform, 'OS', 'ios');
    const idiom = jest.spyOn(Platform, 'isPad', 'get').mockReturnValue(false);
    const frames = jest
      .spyOn(global, 'requestAnimationFrame')
      .mockImplementation(() => 0);
    act(() => {
      Dimensions.set({ window: { ...window, width, height } });
      setWindowTraitsOverride({
        horizontal: 'compact',
        vertical: 'regular',
        foldable: edge !== 'unspecified',
      });
      resetAdaptiveDeviceForTests();
    });
    jest
      .mocked(client.askPost)
      .mockResolvedValueOnce(answer)
      .mockResolvedValueOnce({ questions: [] });
    try {
      await mount(
        <SafeAreaInsetsContext.Provider
          value={{ top, bottom: 20, left: 0, right }}
        >
          <HeaderHeightContext.Provider value={measured}>
            <AskScreen />
          </HeaderHeightContext.Provider>
        </SafeAreaInsetsContext.Provider>,
      );
      await type('A fixture question?');
      await press('ask-submit');
      const scroll = view!.root.find(
        (n) => n.props.testID === 'ask-screen' && n.type === ScrollView,
      );
      // At rest: UIKit's automatic inset is the measured header; the thread's
      // own contentInset only removes a real hidden large-title band.
      const restTop =
        measured +
        (scroll.props.contentInset?.top ?? 0) +
        StyleSheet.flatten(scroll.props.contentContainerStyle).paddingTop;
      expect(restTop).toBeGreaterThanOrEqual(bar);
      // And not far below it: the iPhone band fix stays (8 pt, not 60).
      expect(restTop).toBe(bar + rhythm.heading);
      // Pinned: the new turn's top lands just under the real bar.
      await act(async () => {
        byId('ask-turn')[0]!.props.onLayout({
          nativeEvent: { layout: { y: 400 } },
        });
      });
      const pinned = scrollTo.mock.lastCall![0] as unknown as { y: number };
      expect(400 - pinned.y).toBeGreaterThanOrEqual(bar);
      expect(400 - pinned.y).toBe(bar + rhythm.heading);
    } finally {
      act(() => {
        Dimensions.set({ window });
        setWindowTraitsOverride(undefined);
        resetAdaptiveDeviceForTests();
      });
      frames.mockRestore();
      idiom.mockRestore();
      platform.restore();
      barEdge.mockRestore();
    }
  },
);

// iOS 27.0, Reduce Transparency on: a thread's bar is opaque and the page
// is laid out below it, so the scroll view's top edge is the bar's bottom
// edge. Ask still allowed for a bar over the page: it took 13.5 pt (the
// measured 114 pt bar less its 100.5 pt estimate) off the inset as a
// "hidden band", and the bar cut the top of the question; a new question
// was pinned a bar's height down the page.
test.each([
  ['Reduce Transparency or Increase Contrast on', true],
  ['neither setting on', false],
] as const)(
  'with %s a thread on the tab root places its question for the bar it has',
  async (_setting, solid) => {
    const platform = jest.replaceProperty(Platform, 'OS', 'ios');
    const idiom = jest.spyOn(Platform, 'isPad', 'get').mockReturnValue(false);
    const frames = jest
      .spyOn(global, 'requestAnimationFrame')
      .mockImplementation(() => 0);
    const solidBar = jest
      .spyOn(accessibility, 'useSolidBar')
      .mockReturnValue(solid);
    const route = { key: 'ask-root', name: 'ask' };
    const navigation = {
      setOptions: jest.fn(),
      getState: () => ({
        index: 0,
        routes: [route],
        routeNames: ['ask', 'bill/[key]', 'explore/[tool]'],
      }),
      isFocused: () => true,
      addListener: () => () => {},
    };
    jest
      .mocked(client.askPost)
      .mockResolvedValueOnce(answer)
      .mockResolvedValueOnce({ questions: [] });
    const measured = 114;
    const estimate = 100.5;
    try {
      await mount(
        <NavigationContext.Provider value={navigation as never}>
          <NavigationRouteContext.Provider value={route}>
            <SafeAreaInsetsContext.Provider
              value={{ top: 62, bottom: 34, left: 0, right: 0 }}
            >
              <HeaderHeightContext.Provider value={measured}>
                <AskScreen />
              </HeaderHeightContext.Provider>
            </SafeAreaInsetsContext.Provider>
          </NavigationRouteContext.Provider>
        </NavigationContext.Provider>,
      );
      await type('A fixture question?');
      await press('ask-submit');
      const scroll = view!.root.find(
        (n) => n.props.testID === 'ask-screen' && n.type === ScrollView,
      );
      // The heading's top at rest, from the scroll view's top edge.
      const restTop =
        (scroll.props.contentInset?.top ?? 0) +
        StyleSheet.flatten(scroll.props.contentContainerStyle).paddingTop;
      await act(async () => {
        byId('ask-turn')[0]!.props.onLayout({
          nativeEvent: { layout: { y: 400 } },
        });
      });
      const pinned = scrollTo.mock.lastCall![0] as unknown as { y: number };
      if (solid) {
        // The view's top edge is the bar's bottom edge: nothing above it.
        expect(restTop).toBeGreaterThanOrEqual(0);
        expect(restTop).toBe(rhythm.heading);
        expect(400 - pinned.y).toBe(rhythm.heading);
      } else {
        // Under the clear bar the first question rests as before: the
        // thread's own fade is clear at rest.
        expect(scroll.props.contentInset).toEqual({
          top: estimate - measured,
        });
        // A new question is pinned with the thread scrolled, so the fade is
        // up: it rests below the fade's foot (16 pt under the bar's), whole.
        expect(400 - pinned.y).toBe(estimate + rhythm.heading + 16);
      }
    } finally {
      solidBar.mockRestore();
      frames.mockRestore();
      idiom.mockRestore();
      platform.restore();
    }
  },
);

// Build 88, iPhone on iOS 27.2: in an open thread UIKit reports the bar with
// its hidden large-title band (168 pt). Leave the tab and come back, and it
// reports the bar it draws (116 pt). The band shrinks and the inset with it,
// but UIKit keeps the offset the old inset gave: the thread came back 52 pt
// higher, its question behind the bar.
describe('an open thread when its tab is shown again', () => {
  const top = 56 + 2 / 3;
  const open = async () => {
    const platform = jest.replaceProperty(Platform, 'OS', 'ios');
    const idiom = jest.spyOn(Platform, 'isPad', 'get').mockReturnValue(false);
    const frames = jest
      .spyOn(global, 'requestAnimationFrame')
      .mockImplementation(() => 0);
    const solidBar = jest
      .spyOn(accessibility, 'useSolidBar')
      .mockReturnValue(false);
    const route = { key: 'ask-root', name: 'ask' };
    const navigation = {
      setOptions: jest.fn(),
      getState: () => ({
        index: 0,
        routes: [route],
        routeNames: ['ask', 'bill/[key]', 'explore/[tool]'],
      }),
      isFocused: () => true,
      addListener: () => () => {},
    };
    jest
      .mocked(client.askPost)
      .mockResolvedValueOnce(answer)
      .mockResolvedValueOnce({ questions: [] });
    // The tab's stack, as the app has it: the header height is the stack's.
    const page = (header: number) => (
      <NavigationContext.Provider value={navigation as never}>
        <NavigationRouteContext.Provider value={route}>
          <SafeAreaInsetsContext.Provider
            value={{ top, bottom: 34, left: 0, right: 0 }}
          >
            <HeaderHeightContext.Provider value={header}>
              <AskScreen />
            </HeaderHeightContext.Provider>
          </SafeAreaInsetsContext.Provider>
        </NavigationRouteContext.Provider>
      </NavigationContext.Provider>
    );
    await mount(page(168));
    await type('A fixture question?');
    await press('ask-submit');
    const scroll = () =>
      view!.root.find(
        (n) => n.props.testID === 'ask-screen' && n.type === ScrollView,
      );
    const at = (y: number) =>
      act(() =>
        scroll().props.onScroll({ nativeEvent: { contentOffset: { y } } }),
      );
    const inset = () => scroll().props.contentInset?.top as number;
    // The tab is shown again: UIKit reports the bar it draws.
    const refocus = () =>
      act(async () =>
        view!.update(
          withNavigationOptions(page(116), (options) => {
            mockBar.options = options;
          }),
        ),
      );
    const restore = () => {
      solidBar.mockRestore();
      frames.mockRestore();
      idiom.mockRestore();
      platform.restore();
    };
    return { at, inset, refocus, restore };
  };

  test('a thread at rest is at rest again: its top inset and its offset are the first-focus ones for the bar', async () => {
    const thread = await open();
    try {
      // First focus: the band is off the inset, and the thread rests under
      // the compact bar.
      const rest = 168 + thread.inset();
      expect(rest).toBeGreaterThan(top);
      expect(rest).toBeLessThan(116);
      thread.at(-rest);
      scrollTo.mockClear();
      // UIKit's inset change carries the thread up before the page hears
      // the new height.
      thread.at(-rest + 52);
      await thread.refocus();
      // The inset is the new band's, so the top the scroll view is given
      // is the same compact bar as at first focus...
      expect(116 + thread.inset()).toBeCloseTo(rest);
      // ...and the thread is put back at that rest, at once.
      expect(scrollTo).toHaveBeenCalled();
      const last = scrollTo.mock.lastCall![0] as {
        y: number;
        animated: boolean;
      };
      expect(last.y).toBeCloseTo(-rest);
      expect(last.animated).toBe(false);
    } finally {
      thread.restore();
    }
  });

  test('the band appearing as a thread opens does not move it: the send is placed by its own animated scroll', async () => {
    const thread = await open();
    try {
      // `open` sent the first question from the idle page at rest: the band
      // went from 0 to its full depth. Nothing unanimated ran for it.
      expect(thread.inset()).toBeLessThan(0);
      const unanimated = scrollTo.mock.calls.filter(
        ([to]) => (to as { animated?: boolean }).animated === false,
      );
      expect(unanimated).toEqual([]);
    } finally {
      thread.restore();
    }
  });

  test('a reader a little way past rest is left alone, as is one further on', async () => {
    const thread = await open();
    try {
      const rest = 168 + thread.inset();
      thread.at(-rest);
      // 30 pt into the thread: neither at rest nor carried by the band.
      thread.at(-rest + 30);
      scrollTo.mockClear();
      await thread.refocus();
      expect(scrollTo).not.toHaveBeenCalled();
    } finally {
      thread.restore();
    }
  });

  test('a thread the reader has scrolled is left where it is', async () => {
    const thread = await open();
    try {
      thread.at(-(168 + thread.inset()));
      thread.at(300);
      scrollTo.mockClear();
      thread.at(352);
      await thread.refocus();
      expect(scrollTo).not.toHaveBeenCalled();
    } finally {
      thread.restore();
    }
  });
});

test.each(['before', 'after'] as const)(
  'send pins below the compact bar when fallback frames run %s the turn layout and native height arrives late',
  async (frameOrder) => {
    const frames: FrameRequestCallback[] = [];
    const frame = jest
      .spyOn(global, 'requestAnimationFrame')
      .mockImplementation((callback) => frames.push(callback));
    const runFrame = async () => {
      await act(async () =>
        frames.splice(0).forEach((callback) => callback(0)),
      );
    };
    const fallback = async () => {
      await runFrame();
      await runFrame();
    };
    // A 47 pt status area, 44 pt inline bar and 52 pt large-title region.
    // The context deliberately keeps the expanded height through the pin.
    const compact = 91;
    const expanded = compact + 52;
    let setHeader!: (height: number) => void;
    function HeaderFrame() {
      const [header, updateHeader] = useState(expanded);
      setHeader = updateHeader;
      return (
        <SafeAreaInsetsContext.Provider
          value={{ top: 47, bottom: 34, left: 0, right: 0 }}
        >
          <HeaderHeightContext.Provider value={header}>
            <AskScreen />
          </HeaderHeightContext.Provider>
        </SafeAreaInsetsContext.Provider>
      );
    }
    jest
      .mocked(client.askPost)
      .mockResolvedValueOnce(answer)
      .mockResolvedValueOnce({ questions: [] });
    try {
      await mount(<HeaderFrame />);
      expect(mockBar.options.headerLargeTitleEnabled).toBe(true);
      await type('A fixture question?');
      await press('ask-submit');
      expect(mockBar.options.headerLargeTitleEnabled).toBe(false);
      expect(view!.root.findByType(AskThread).props.minHeight).toBe(
        Dimensions.get('window').height - compact - rhythm.section * 2,
      );
      scrollTo.mockClear();
      if (frameOrder === 'before') {
        await fallback();
        // This fallback was scheduled by the idle send handler.
        expect(scrollTo).toHaveBeenLastCalledWith(
          expect.objectContaining({ y: -compact }),
        );
      }
      await act(async () => {
        byId('ask-turn')[0]!.props.onLayout({
          nativeEvent: { layout: { y: 400 } },
        });
      });
      const pinned = { y: 400 - compact - rhythm.heading, animated: true };
      expect(scrollTo).toHaveBeenLastCalledWith(pinned);
      expect(400 - pinned.y - compact).toBe(8);
      // Only now does native-stack deliver its compact measurement.
      await act(async () => setHeader(compact));
      if (frameOrder === 'after') await fallback();
      expect(scrollTo).toHaveBeenLastCalledWith(pinned);
      expect(scrollTo).toHaveBeenCalledTimes(frameOrder === 'before' ? 2 : 1);

      await act(async () => barButton('New question')!.onPress());
      expect(mockBar.options.headerLargeTitleEnabled).toBe(true);
      expect(byId('ask-idle')).not.toHaveLength(0);
      await act(async () => setHeader(expanded));
      expect(mockBar.options.headerLargeTitleEnabled).toBe(true);
      expect(byId('ask-turn')).toHaveLength(0);
    } finally {
      frame.mockRestore();
    }
  },
);

test('the phone keeps wrappers in the first native scroll descendant chain', async () => {
  await mount();
  const scroll = view!.root.findByType(ScrollView);
  expect(scroll.props.contentInsetAdjustmentBehavior).toBe('automatic');
  expect(scroll.props.scrollToOverflowEnabled).toBe(true);
  const columns = view!.root.findByType(AskColumns);
  const row = columns.findAllByType(View)[0]!;
  const column = byId('ask-conversation-column').find(
    (node) => typeof node.type === 'string',
  )!;
  expect(row.props.collapsable).toBe(false);
  expect(column.props.collapsable).toBe(false);
  expect(column.children[0]).toBe(scroll);
  // A background-only View can survive Fabric flattening while its children
  // are hoisted beside it. UIKit then follows that empty first child.
  const measuring = view!.root
    .findAllByType(View)
    .find(
      (node) =>
        node.props.onLayout &&
        StyleSheet.flatten(node.props.style)?.backgroundColor === colors.sunken,
    )!;
  expect(measuring.props.collapsable).toBe(false);
});

test.each([
  ['ios', 'composer'],
  ['ios', 'content'],
  ['android', 'composer'],
  ['android', 'content'],
] as const)(
  'Ask on %s waits for both layouts, with %s arriving first',
  async (platform, first) => {
    const os = jest.replaceProperty(Platform, 'OS', platform);
    try {
      await mount();
      expect(byId('ask-idle')).not.toHaveLength(0);
      expect(useScreenReady).toHaveBeenLastCalledWith('/ask', false);
      const content = byId('ask-screen').find(
        (node) => typeof node.props.onContentSizeChange === 'function',
      )!.props.onContentSizeChange;
      const composer = byId('ask-dock').find(
        (node) => typeof node.props.onLayout === 'function',
      )!.props.onLayout;
      const dockLayout = (height: number) => ({
        nativeEvent: { layout: { width: 390, height, x: 0, y: 0 } },
      });
      act(() => {
        content(0, 400);
        composer(dockLayout(0));
      });
      expect(useScreenReady).toHaveBeenLastCalledWith('/ask', false);
      act(() => {
        if (first === 'composer') composer(dockLayout(100));
        else content(390, 400);
      });
      expect(useScreenReady).toHaveBeenLastCalledWith('/ask', false);
      act(() => {
        if (first === 'composer') content(390, 400);
        else composer(dockLayout(100));
      });
      expect(useScreenReady).toHaveBeenLastCalledWith('/ask', true);
      act(() => {
        content(390, 450);
        composer(dockLayout(110));
      });
      expect(useScreenReady).toHaveBeenLastCalledWith('/ask', true);
    } finally {
      os.restore();
    }
  },
);

function immediateFocusRequests() {
  const interactions = jest
    .spyOn(InteractionManager, 'runAfterInteractions')
    .mockImplementation((callback) => {
      if (typeof callback === 'function') callback();
      return { cancel: () => {}, then: () => {} } as never;
    });
  const frame = jest
    .spyOn(global, 'requestAnimationFrame')
    .mockImplementation((callback) => {
      callback(0);
      return 0;
    });
  return () => {
    interactions.mockRestore();
    frame.mockRestore();
  };
}

test.each([undefined, '/ask', '/ask?q=%20%20'])(
  'Ask opens at rest from %s without focusing the composer',
  async (path) => {
    if (path) {
      const route = fromWebPath(path)!;
      expect(typeof route).toBe('object');
      jest
        .mocked(useLocalSearchParams)
        .mockReturnValue((route as { params: object }).params);
    }
    const restore = immediateFocusRequests();
    try {
      await mount();
      expect(TextInput.prototype.focus).not.toHaveBeenCalled();
      expect(one('ask-question').props.autoFocus).not.toBe(true);
      expect(byId('ask-starter-0').length).toBeGreaterThan(0);
    } finally {
      restore();
    }
  },
);

async function showParams(params: object, mounted: boolean) {
  jest.mocked(useLocalSearchParams).mockReturnValue(params);
  if (!mounted) return mount();
  await act(async () => {
    view!.update(
      withNavigationOptions(<AskScreen />, (options) => {
        mockBar.options = options;
      }),
    );
  });
}

function openSavedConversation() {
  jest.mocked(chatsSnapshot).mockReturnValue(oneChat);
  act(() => askSession.open('saved-fixture'));
  expect(askSession.snapshot().thread.length).toBeGreaterThan(0);
  expect(askSession.snapshot().busy).toBe(false);
}

test.each([false, true])(
  'a bare Ask arrival starts a new conversation without focusing, already mounted = %s',
  async (mounted) => {
    const restore = immediateFocusRequests();
    const announce = jest.spyOn(
      AccessibilityInfo,
      'announceForAccessibilityWithOptions',
    );
    try {
      openSavedConversation();
      if (mounted) await mount();
      const params = (fromWebPath('/ask') as { params: object }).params;
      await showParams(params, mounted);
      expect(askSession.snapshot()).toMatchObject({
        id: null,
        thread: [],
        draft: '',
        busy: false,
      });
      expect(TextInput.prototype.focus).not.toHaveBeenCalled();
      expect(announce).not.toHaveBeenCalledWith(
        'Draft added.',
        expect.anything(),
      );
    } finally {
      announce.mockRestore();
      restore();
    }
  },
);

test.each([
  ['speaker', 'Sam Placeholder'],
  ['party', 'Example Party'],
])('a blank scoped Ask link applies %s without focusing', async (key, name) => {
  const restore = immediateFocusRequests();
  try {
    const params = (
      fromWebPath(`/ask?${key}=${encodeURIComponent(name!)}`) as {
        params: object;
      }
    ).params;
    await showParams(params, false);
    expect(askSession.snapshot().options).toMatchObject({ [key!]: name });
    expect(askSession.snapshot().draft).toBe('');
    expect(TextInput.prototype.focus).not.toHaveBeenCalled();
  } finally {
    restore();
  }
});

test.each([false, true])(
  'Cmd-N starts a new conversation and focuses once, already mounted = %s',
  async (mounted) => {
    const restore = immediateFocusRequests();
    try {
      openSavedConversation();
      if (mounted) await mount();
      act(() => requestFocus('ask'));
      await showParams(askRoute({ question: '' }).params, mounted);
      expect(askSession.snapshot()).toMatchObject({
        id: null,
        thread: [],
        draft: '',
      });
      expect(TextInput.prototype.focus).toHaveBeenCalledTimes(1);
      expect(client.askPost).not.toHaveBeenCalled();
    } finally {
      restore();
    }
  },
);

test.each([false, true])(
  'the same blank entry arrives once and is marked in the session, remount = %s',
  async (remount) => {
    const restore = immediateFocusRequests();
    const arrive = jest.spyOn(askSession, 'arrive');
    try {
      const params = askRoute({ question: '  ' }).params;
      await showParams(params, false);
      expect(arrive).toHaveBeenCalledTimes(1);
      expect(arrive).toHaveBeenCalledWith('', expect.anything());
      await type('A draft the reader is editing');
      const after = askSession.snapshot();
      if (remount) {
        await act(async () => view!.unmount());
        view = null;
      }
      await showParams(params, !remount);
      expect(arrive).toHaveBeenCalledTimes(1);
      expect(askSession.snapshot()).toBe(after);
      act(() => arriveInAsk({ question: 'Duplicate arrival' }, params.entry));
      expect(askSession.snapshot()).toBe(after);
      expect(TextInput.prototype.focus).not.toHaveBeenCalled();
    } finally {
      arrive.mockRestore();
      restore();
    }
  },
);

test('the blank arrival guard keeps only the latest 32 entries', async () => {
  const restore = immediateFocusRequests();
  const arrive = jest.spyOn(askSession, 'arrive');
  try {
    const first = askRoute({ question: '' }).params;
    await showParams(first, false);
    for (let i = 0; i < 32; i++)
      await showParams(askRoute({ question: '' }).params, true);
    expect(arrive).toHaveBeenCalledTimes(33);
    await showParams(first, true);
    expect(arrive).toHaveBeenCalledTimes(34);
    expect(TextInput.prototype.focus).not.toHaveBeenCalled();
  } finally {
    arrive.mockRestore();
    restore();
  }
});

test('prefill and explicit focus requests still focus, including before mount and tab reselect', async () => {
  const restore = immediateFocusRequests();
  try {
    requestFocus('ask');
    await mount();
    const focus = jest.mocked(TextInput.prototype.focus);
    expect(focus).toHaveBeenCalledTimes(1);
    focus.mockClear();
    await act(async () => {
      byId('ask-starter-0')
        .find((node) => node.props.menu)
        ?.props.menu[0].onPress();
    });
    expect(focus).toHaveBeenCalledTimes(1);
    expect(one('ask-question').props.value).not.toBe('');
    focus.mockClear();
    let openAsk!: ReturnType<typeof useOpenAsk>;
    function Entry() {
      openAsk = useOpenAsk();
      return null;
    }
    let entry!: ReactTestRenderer;
    await act(async () => {
      entry = create(<Entry />);
    });
    await act(async () => {
      openAsk({ question: 'What is in the public record?' });
    });
    expect(focus).toHaveBeenCalledTimes(1);
    expect(one('ask-question').props.value).toBe(
      'What is in the public record?',
    );
    await act(async () => entry.unmount());
    focus.mockClear();
    act(() => {
      expect(dispatchKeyCommand('ask-reselect')).toBe(true);
    });
    expect(focus).toHaveBeenCalledTimes(1);
    expect(client.askPost).not.toHaveBeenCalled();
  } finally {
    restore();
  }
});
const byId = (id: string) => view!.root.findAllByProps({ testID: id });
const one = (id: string) =>
  view!.root.findAll(
    (n) =>
      n.props.testID === id &&
      (typeof n.props.onPress === 'function' ||
        typeof n.props.onChangeText === 'function'),
  )[0]!;
/** The first string child under any node with this testID. */
/**
 * The test clock. The status line holds each status for STATUS_HOLD_MS and a
 * stage is spoken STAGE_ANNOUNCEMENT_MS after the last, both measured with
 * Date.now() and a timer. Waiting those out in real time made the result
 * depend on how busy the machine was (a 650 ms sleep could end before the
 * 600 ms hold it was meant to outlast). A test that waits on them runs on
 * Jest's fake timers instead, where timers and Date.now() move together
 * and only when the test says: `clock.on()` first, `clock.off()` after, and
 * `pass(ms)` for time to go by.
 */
const clock = {
  on: () => void jest.useFakeTimers(),
  off: () => void jest.useRealTimers(),
};
/** `ms` go by on the test clock: every timer due in them runs, in order. */
const pass = (ms: number) =>
  act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });
const textOf = (id: string) =>
  byId(id)
    .flatMap((n) => [n, ...n.findAll(() => true)])
    .map((n) => n.props.children)
    .find((c) => typeof c === 'string');
/** The accessibility label or hint given to the row with this testID. */
const a11y = (id: string, key: 'accessibilityLabel' | 'accessibilityHint') =>
  byId(id)
    .map((n) => n.props[key])
    .find((v) => typeof v === 'string');
const texts = () =>
  view!.root
    .findAll((n) => typeof n.props.children === 'string')
    .map((n) => n.props.children as string);
async function type(text: string) {
  await act(async () => one('ask-question').props.onChangeText(text));
}
async function press(id: string) {
  await act(async () => {
    await one(id).props.onPress();
  });
}
const bar = () =>
  mockBar.options as {
    unstable_headerLeftItems: () => NativeStackHeaderItem[];
    unstable_headerRightItems: () => NativeStackHeaderItem[];
  };
const barButton = (label: string) =>
  [
    ...bar().unstable_headerLeftItems(),
    ...bar().unstable_headerRightItems(),
  ].find((item) => 'label' in item && item.label === label) as
    | (NativeStackHeaderItem & { disabled?: boolean; onPress: () => void })
    | undefined;

test('a cold launch opens idle, with the last conversation first under Conversations', async () => {
  jest.mocked(chatsSnapshot).mockImplementation(() => oneChat);
  await mount();
  expect(askSession.snapshot().thread).toEqual([]);
  expect(byId('ask-idle-line')).not.toEqual([]);
  expect(texts()).toContain(
    'Answers come from parliamentary records and are machine-written.',
  );
  expect(byId('ask-starter-0')).not.toEqual([]);
  expect(byId('ask-conversation-0')).not.toEqual([]);
  // No Options row, chips or builder on the page.
  expect(byId('ask-options')).toEqual([]);
  expect(byId('ask-builder-toggle')).toEqual([]);
  await press('ask-see-all-conversations');
  expect(router.push).toHaveBeenCalledWith(conversationsRoute);
  await press('ask-conversation-0');
  expect(askSession.snapshot().id).toBe('saved-fixture');
  expect(client.askPost).not.toHaveBeenCalled();
});

test.each([false, true])(
  'phone idle touches pass through the composer overlay, native region view = %s',
  async (native) => {
    const window = Dimensions.get('window');
    const regionView = jest.replaceProperty(
      Duo,
      'ReservedRegionView',
      native ? View : null,
    );
    act(() => {
      Dimensions.set({
        window: { ...window, width: 402, height: 874, fontScale: 1 },
      });
      setWindowTraitsOverride({
        horizontal: 'compact',
        vertical: 'regular',
        foldable: false,
      });
      resetAdaptiveDeviceForTests();
    });
    jest.mocked(chatsSnapshot).mockReturnValue(oneChat);
    jest
      .mocked(client.askPost)
      .mockResolvedValueOnce(answer)
      .mockResolvedValueOnce({ questions: [] });
    askSession.setDraft('A prefilled fixture question?');
    try {
      await mount(
        <ReservedRegionsProvider value={emptyReservedRegions}>
          <AskScreen />
        </ReservedRegionsProvider>,
      );
      expect(byId('ask-idle')).not.toEqual([]);
      expect(one('ask-question').props.value).toBe(
        'A prefilled fixture question?',
      );
      const scroll = view!.root.findByType(ScrollView);
      // Omitted scrollEnabled uses React Native's enabled default.
      expect(scroll.props.scrollEnabled ?? true).toBe(true);
      expect(scroll.props.maintainVisibleContentPosition).toBeUndefined();
      const column = byId('ask-conversation-column').find(
        (node) => typeof node.type === 'string',
      )!;
      expect(column.children[0]).toBe(scroll);
      // Renderer presses bypass native hit testing. Also inspect every
      // full-height layer in the siblings drawn above the scrolling content.
      const fullHeightLayers: ReactTestInstance[] = [];
      const inspectOverlay = (node: ReactTestInstance | string) => {
        if (typeof node === 'string') return;
        if (typeof node.type === 'string') {
          const style = StyleSheet.flatten(node.props.style);
          const fillsHeight =
            style?.flex === 1 ||
            style?.flexGrow === 1 ||
            style?.height === '100%' ||
            (style?.position === 'absolute' &&
              style.top === 0 &&
              style.bottom === 0);
          // Stop at the bounded composer band. Its controls accept touches.
          if (!fillsHeight) return;
          fullHeightLayers.push(node);
        }
        node.children.forEach(inspectOverlay);
      };
      column.children.slice(1).forEach(inspectOverlay);
      expect(fullHeightLayers.length).toBeGreaterThan(0);
      expect(
        fullHeightLayers
          .filter((node) => {
            const pointerEvents =
              node.props.pointerEvents ??
              StyleSheet.flatten(node.props.style)?.pointerEvents;
            return pointerEvents !== 'box-none' && pointerEvents !== 'none';
          })
          .map((node) => node.props.testID ?? node.type),
      ).toEqual([]);
      expect(
        StyleSheet.flatten(byId('ask-sources-column')[0]!.props.style).display,
      ).toBe('none');

      await press('ask-conversation-0');
      expect(askSession.snapshot().id).toBe('saved-fixture');
      expect(client.askPost).not.toHaveBeenCalled();
      await act(async () => askSession.newConversation());
      const starter = a11y('ask-starter-0', 'accessibilityLabel');
      await press('ask-starter-0');
      expect(jest.mocked(client.askPost).mock.calls[0]?.[1]).toMatchObject({
        question: starter,
      });
    } finally {
      await act(async () => {
        view?.unmount();
        view = null;
        Dimensions.set({ window });
        setWindowTraitsOverride(undefined);
        resetAdaptiveDeviceForTests();
      });
      regionView.restore();
    }
  },
);

test('Ask stands on the grouped ground, so its inset groups read as raised', async () => {
  expect(designFlags.groupedSurfaces).toBe(true);
  await mount();
  const scroll = view!.root
    .findAllByType(ScrollView)
    .find((n) => n.props.testID === 'ask-screen')!;
  expect(StyleSheet.flatten(scroll.props.style).backgroundColor).toBe(
    colors.sunken,
  );
});
test('starters follow Sydney’s day: 9:30 am on 10 Nov is 10 Nov, not UTC’s 9 Nov', async () => {
  const now = jest
    .spyOn(Date, 'now')
    .mockReturnValue(Date.parse('2026-11-09T22:30:00Z'));
  try {
    await mount();
    // One starter (Jake, 15 Nov): the first of the day's, never a list.
    const shown = [a11y('ask-starter-0', 'accessibilityLabel')];
    expect(shown).toEqual(startersFor(Date.UTC(2026, 10, 10, 2), 1));
    expect(shown).not.toEqual(startersFor(Date.UTC(2026, 10, 9, 2), 1));
    expect(byId('ask-starter-1').length).toBe(0);
    expect(byId('ask-starter-seat').length).toBe(0);
    expect(byId('ask-starter-held').length).toBe(0);
  } finally {
    now.mockRestore();
  }
});
test('Conversations hides with none saved; the bar keeps Conversations, New question and Account', async () => {
  await mount();
  expect(byId('ask-conversations')).toEqual([]);
  expect(byId('ask-see-all-conversations')).toEqual([]);
  expect(barButton('Your conversations')?.disabled).toBe(true);
  expect(barButton('New question')?.disabled).toBe(true);
  expect(barButton('Account')).toBeDefined();
  // At most three items, Talk not among them (it is in the composer).
  expect(
    bar().unstable_headerLeftItems().length +
      bar().unstable_headerRightItems().length,
  ).toBeLessThanOrEqual(3);
  expect(barButton('Talk')).toBeUndefined();
});

describe('the way back to the page an arrival came from (journeys/ask.md 4.2)', () => {
  // The app's navigation container: the tab navigator holds Ask's tab.
  const container = {
    getRootState: () => ({
      key: 'root',
      routes: [
        {
          name: '(tabs)',
          state: {
            key: 'tabs',
            index: 2,
            routes: [
              { name: '(today)' },
              { name: '(search)' },
              { name: '(ask)' },
            ],
          },
        },
      ],
    }),
    dispatch: jest.fn(),
  };
  const mountInApp = () =>
    mount(
      <NavigationContainerRefContext.Provider value={container as never}>
        <AskScreen />
      </NavigationContainerRefContext.Provider>,
    );
  const jumpBack = {
    type: 'JUMP_TO',
    target: 'tabs',
    payload: { name: '(search)' },
  };
  beforeEach(() => container.dispatch.mockClear());

  test('iOS: the bar leads with a back item named for the page, which switches back to its tab', async () => {
    setAskReturn({ tab: '(search)', name: 'Sam Placeholder' });
    await mountInApp();
    const [back, history, ...rest] = bar().unstable_headerLeftItems();
    expect(rest).toEqual([]);
    expect(back).toMatchObject({
      type: 'button',
      label: 'Sam Placeholder',
      accessibilityLabel: 'Back to Sam Placeholder',
      testID: 'ask-back',
      icon: { type: 'sfSymbol', name: 'chevron.backward' },
      sharesBackground: false,
    });
    expect(history).toMatchObject({ label: 'Your conversations' });
    await act(async () => (back as { onPress: () => void }).onPress());
    expect(container.dispatch).toHaveBeenCalledTimes(1);
    expect(container.dispatch).toHaveBeenCalledWith(jumpBack);
    expect(askReturnSnapshot()).toBeNull();
    expect(
      bar()
        .unstable_headerLeftItems()
        .map((item) => item.label),
    ).toEqual(['Your conversations']);
  });

  test('a visit by the Ask tab has no back item and leaves system Back alone', async () => {
    const platform = jest.replaceProperty(Platform, 'OS', 'android');
    const add = jest.spyOn(BackHandler, 'addEventListener');
    try {
      await mountInApp();
      expect(add).not.toHaveBeenCalled();
      expect(
        bar()
          .unstable_headerLeftItems()
          .map((item) => item.label),
      ).toEqual(['Your conversations']);
    } finally {
      add.mockRestore();
      platform.restore();
    }
  });

  test('Android: the navigation icon and system Back both go back to the page', async () => {
    const platform = jest.replaceProperty(Platform, 'OS', 'android');
    const listeners = new Set<() => boolean | null | undefined>();
    const add = jest
      .spyOn(BackHandler, 'addEventListener')
      .mockImplementation((_event, handler) => {
        listeners.add(handler);
        return { remove: () => listeners.delete(handler) };
      });
    try {
      setAskReturn({ tab: '(search)', name: 'Sam Placeholder' });
      await mountInApp();
      // Material's navigation icon, outermost in the app bar.
      let header!: ReactTestRenderer;
      act(() => {
        header = create(
          (
            bar() as unknown as { headerLeft: () => React.ReactElement }
          ).headerLeft(),
        );
      });
      const icon = header.root.findAll(
        (n) =>
          n.props.testID === 'ask-back' &&
          typeof n.props.onPress === 'function',
      )[0]!;
      expect(icon.props.accessibilityLabel).toBe('Back to Sam Placeholder');
      expect(listeners.size).toBe(1);
      let handled: boolean | null | undefined;
      await act(async () => {
        handled = [...listeners][0]!();
      });
      expect(handled).toBe(true);
      expect(container.dispatch).toHaveBeenCalledWith(jumpBack);
      expect(askReturnSnapshot()).toBeNull();
      // Used once: Back on Ask is the tab bar's own again.
      expect(listeners.size).toBe(0);
      act(() => header.unmount());
    } finally {
      add.mockRestore();
      platform.restore();
    }
  });
});

test('a deep-linked draft starts a new conversation and sends nothing', async () => {
  (useLocalSearchParams as jest.Mock).mockReturnValue({
    entry: 'scoped-entry',
    question: 'What has Sam Placeholder said in parliament this year?',
    speaker: 'Sam Placeholder',
    kind: 'speech',
  });
  jest.mocked(chatsSnapshot).mockImplementation(() => oneChat);
  await mount();
  expect(one('ask-question').props.value).toBe(
    'What has Sam Placeholder said in parliament this year?',
  );
  expect(askSession.snapshot().options).toMatchObject({
    speaker: 'Sam Placeholder',
    kind: 'speech',
  });
  expect(askSession.snapshot().thread).toEqual([]);
  expect(byId('ask-options-line')).not.toEqual([]);
  expect(client.askPost).not.toHaveBeenCalled();
});

test('the composer sets its question in body text; the options line is a 44 pt target beside Clear', async () => {
  (useLocalSearchParams as jest.Mock).mockReturnValue({
    entry: 'scoped-entry-target',
    question: 'What has Sam Placeholder said in parliament this year?',
    speaker: 'Sam Placeholder',
  });
  await mount();
  const input = StyleSheet.flatten(one('ask-question').props.style);
  const { fontScale } = Dimensions.get('window');
  // The body role at the reader's own size: the system scales it.
  expect(one('ask-question').props.allowFontScaling).toBe(true);
  expect(input).toMatchObject({
    fontFamily: textStyles.body.fontFamily,
    fontSize: textStyles.body.fontSize,
    lineHeight: textStyles.body.lineHeight,
  });
  // With room to spare and no keyboard, the lines rule alone sets the cap:
  // on iOS the text view is those lines, its padding the field's.
  expect(input.maxHeight).toBe(
    textStyles.body.lineHeight *
      Math.max(1, fontScale) *
      composerLines(fontScale),
  );
  const hit = (id: string) =>
    byId(id).find((n) => n.props.hitSlop !== undefined)!.props;
  const line = hit('ask-options-line');
  expect(line.hitSlop).toEqual({ top: 8, bottom: 8 });
  expect(StyleSheet.flatten(line.style).minHeight + 16).toBeGreaterThanOrEqual(
    44,
  );
  // No sideways slop, so it never reaches into Clear's.
  expect(hit('ask-options-clear').hitSlop).toBe(8);
});

test('mount, typing, Options and a remount never call paid routes', async () => {
  await mount();
  await type('A question');
  const input = view!.root.findByType(AskDock).props.inputRef;
  const blur = jest.fn();
  input.current = { blur };
  const dismiss = jest.spyOn(Keyboard, 'dismiss');
  await press('ask-composer-options');
  expect(openAskOptions).toHaveBeenCalled();
  expect(dismiss).toHaveBeenCalled();
  expect(blur).toHaveBeenCalled();
  expect(blur.mock.invocationCallOrder[0]).toBeLessThan(
    dismiss.mock.invocationCallOrder[0]!,
  );
  expect(dismiss.mock.invocationCallOrder[0]).toBeLessThan(
    jest.mocked(openAskOptions).mock.invocationCallOrder[0]!,
  );
  dismiss.mockRestore();
  input.current = null;
  await act(async () => {
    view!.unmount();
    view = create(
      withNavigationOptions(<AskScreen />, (options) => {
        mockBar.options = options;
      }),
    );
  });
  expect(client.askPost).not.toHaveBeenCalled();
  expect(reconcileChats).not.toHaveBeenCalled();
  expect(syncSubmittedChat).not.toHaveBeenCalled();
});

test.each([
  [undefined, 'Talk to OPAX'],
  ['Sign up to talk', 'Sign up to talk'],
])('AskDock Talk label %s reads as %s', async (talkLabel, expected) => {
  const onTalk = jest.fn();
  await act(async () => {
    view = create(
      <AskDock
        onSend={() => {}}
        onStop={() => {}}
        onOptions={() => {}}
        onTalk={onTalk}
        talkLabel={talkLabel}
        offline={false}
      />,
    );
  });
  expect(a11y('ask-talk', 'accessibilityLabel')).toBe(expected);
  await press('ask-talk');
  expect(onTalk).toHaveBeenCalledTimes(1);
});

test.each([
  { signedIn: false, checking: false, signup: true },
  { signedIn: true, checking: false, signup: false },
  { signedIn: null, checking: false, signup: false },
  { signedIn: null, checking: true, signup: false },
  { signedIn: false, checking: true, signup: false },
])(
  'Talk in the empty composer with signedIn=$signedIn and checking=$checking',
  async ({ signedIn, checking, signup }) => {
    mockAccount.status = signedIn === null ? null : { signedIn };
    mockAccount.checking = checking;
    await mount();
    expect(byId('ask-talk')).not.toEqual([]);
    expect(a11y('ask-talk', 'accessibilityLabel')).toBe(
      signup ? 'Sign up to talk' : 'Talk to OPAX',
    );
    expect(byId('ask-submit')).toEqual([]);
    expect(router.push).not.toHaveBeenCalled();
    await press('ask-talk');
    expect(router.push).toHaveBeenCalledTimes(1);
    expect(router.push).toHaveBeenCalledWith(
      signup ? { pathname: '/talk/sign-in' } : '/talk',
    );
    await type('A question');
    expect(byId('ask-talk')).toEqual([]);
    expect(one('ask-submit').props.accessibilityLabel).toBe('Send');
  },
);

test('a starter asks at once; the seat starter only fills the composer', async () => {
  jest.mocked(useSeat).mockReturnValue({
    status: 'chosen',
    choice: { version: 1, seatId: 'el_fixture', stateSeatIds: [] },
  } as never);
  mockDirectory.current = {
    electorates: {
      data: {
        electorates: [
          {
            electorate_id: 'el_fixture',
            status: 'current',
            jurisdiction: 'federal',
            chamber: 'representatives',
            representation_status: 'verified',
            representatives: [{ person_id: 'fixture-person' }],
          },
        ],
      },
    },
  };
  jest.mocked(client.askPost).mockResolvedValue(answer);
  const renderer = await mount();
  const seat = one('ask-starter-seat');
  expect(seat).toBeDefined();
  // One starter: with a seat saved it is the member's row, and nothing else.
  const order = renderer.root
    .findAll(
      (n) =>
        typeof n.props?.testID === 'string' &&
        /^ask-starter-(seat|\d)$/.test(n.props.testID) &&
        typeof n.type === 'string',
    )
    .map((n) => n.props.testID as string)
    .filter((id, i, all) => all.indexOf(id) === i);
  expect(order).toEqual(['ask-starter-seat']);
  expect(a11y('ask-starter-seat', 'accessibilityLabel')).toBe(
    'What has Sam Placeholder said in parliament this year?',
  );
  expect(a11y('ask-starter-seat', 'accessibilityHint')).toBe(
    'Puts this question in the box.',
  );
  await press('ask-starter-seat');
  expect(client.askPost).not.toHaveBeenCalled();
  expect(one('ask-question').props.value).toBe(
    'What has Sam Placeholder said in parliament this year?',
  );
  expect(askSession.snapshot().options).toMatchObject({
    speaker: 'Sam Placeholder',
    kind: 'speech',
  });
  // No general starter beside the member's, and no held place.
  expect(byId('ask-starter-0').length).toBe(0);
  expect(byId('ask-starter-held').length).toBe(0);
});

test('with no seat saved, the one starter is general and asks at once', async () => {
  jest.mocked(client.askPost).mockResolvedValue(answer);
  await mount();
  expect(byId('ask-starter-seat').length).toBe(0);
  expect(byId('ask-starter-1').length).toBe(0);
  const starter = a11y('ask-starter-0', 'accessibilityLabel')!;
  expect(a11y('ask-starter-0', 'accessibilityHint')).toBe(
    'Asks this question.',
  );
  await press('ask-starter-0');
  expect(jest.mocked(client.askPost).mock.calls[0]?.[1]).toMatchObject({
    question: starter,
  });
});

test('the sizing stand-ins are the pair the layout sweep chose, and the full-size one is hyphen-aware with no part as long as the question’s own longest word', () => {
  // Chosen by drawn height (system font, 17 to 53 pt, rows 200 to 330 pt
  // wide): the taller of the two is never shorter than the question about
  // any verified member of the House. Jest has no fonts, so the names are
  // pinned here and the rule that makes them hold is checked below.
  expect([...SIZING_MEMBERS]).toEqual([
    'Alexandrina Wetherington',
    'Annabelle Margaret Lee-Ray',
  ]);
  // A word breaks at spaces and at hyphens; each part must fit a line.
  const parts = (text: string) => text.split(/[\s-]+/).filter(Boolean);
  const longestPart = (text: string) =>
    Math.max(...parts(text).map((part) => part.replace(/\W/g, '').length));
  // The question's own longest word, which every real question carries.
  const template = longestPart(seatStarter(''));
  expect(template).toBe('parliament'.length);
  const [long, full] = SIZING_MEMBERS;
  // One name with a long word: its question is stepped down at large sizes.
  expect(longestPart(long)).toBeGreaterThan(template);
  // The other is drawn at full size. Letter count is not drawn width (a
  // ten-letter name of wide letters draws wider than "parliament" and is
  // stepped down), so every part is strictly shorter than that word.
  expect(longestPart(full)).toBeLessThan(template);
  expect(longestPart('Bernadette Annabelle Lee')).toBe(template);
  // The tallest real questions are for hyphenated names, which break at
  // the hyphen. The full-size stand-in is hyphenated too, and its question
  // is longer and has more parts than the roster's longest such name's.
  const hyphenated = 'Elizabeth Watson-Brown';
  expect(full).toContain('-');
  expect(full.length).toBeGreaterThan(hyphenated.length);
  expect(parts(full).length).toBeGreaterThan(parts(hyphenated).length);
  expect(longestPart(full)).toBeGreaterThanOrEqual(longestPart(hyphenated));
});

test.each([
  ['the default text size', 1],
  ['AX5', 3.12],
] as const)(
  'a seat still being read holds the one row’s box; the chosen row joins the sizing row and the box’s candidates never change, at %s',
  async (_size, fontScale) => {
    const original = Dimensions.get('window');
    Dimensions.set({
      window: { ...original, width: 402, height: 874, fontScale },
    });
    try {
      jest.mocked(useSeat).mockReturnValue({ status: 'loading' } as never);
      const renderer = await mount();
      const hostsOf = (id: string) =>
        renderer.root.findAll(
          (n) => typeof n.type === 'string' && n.props.testID === id,
        );
      const flat = (n: { props: { style?: unknown } }) =>
        StyleSheet.flatten(n.props.style as never) as Record<string, unknown>;
      // What sizes the box: every unseen candidate's words and styles.
      const places = () =>
        JSON.stringify(
          hostsOf('ask-starter-place').map((node) => ({
            style: flat(node),
            parts: node
              .findAll((n) => typeof n.type === 'string')
              .map((n) => [
                n.type,
                flat(n),
                n.props.maxFontSizeMultiplier,
                typeof n.props.children === 'string' ? n.props.children : null,
              ]),
          })),
        );
      const held = () => hostsOf('ask-starter-held')[0]!;
      // The nearest host element above a node, through any components.
      const hostAbove = (node: ReturnType<typeof held>) => {
        let at = node.parent!;
        while (typeof at.type !== 'string') at = at.parent!;
        return at;
      };
      // The box's own members, in order.
      const members = () =>
        held()
          .findAll(
            (n) =>
              typeof n.type === 'string' &&
              /^ask-starter-(chosen|place)$/.test(String(n.props.testID)),
          )
          .map((n) => n.props.testID as string);
      // One row, clipped at its edge, as tall as its tallest child.
      expect(flat(held())).toMatchObject({ flexDirection: 'row' });
      // It clips nothing: the starter's highlight reaches the group's edges.
      expect(flat(held()).overflow).toBeUndefined();
      expect(flat(held()).height).toBeUndefined();
      // Both candidates are laid out unseen, each the box's full width: the
      // general starter, and the member's question at its longest.
      expect(hostsOf('ask-starter-place').length).toBe(3);
      for (const place of hostsOf('ask-starter-place')) {
        expect(place.props).toMatchObject({
          pointerEvents: 'none',
          accessibilityElementsHidden: true,
          importantForAccessibility: 'no-hide-descendants',
        });
        expect(flat(place)).toMatchObject({
          width: '100%',
          flexShrink: 0,
          opacity: 0,
        });
        expect(hostAbove(place) === held()).toBe(true);
      }
      const labels = hostsOf('ask-starter-place').map(
        (place) =>
          place.find((n) => typeof n.props.accessibilityLabel === 'string')
            .props.accessibilityLabel as string,
      );
      expect(labels).toEqual([
        startersFor(Date.now(), 1)[0],
        ...SIZING_MEMBERS.map(
          (name) => `What has ${name} said in parliament this year?`,
        ),
      ]);
      // Nothing is drawn or pressable while the seat is unknown.
      expect(hostsOf('ask-starter-chosen').length).toBe(0);
      expect(byId('ask-starter-0').length).toBe(0);
      expect(byId('ask-starter-seat').length).toBe(0);
      const before = places();
      const redraw = async () => {
        await act(async () => {
          askSession.setDraft('x');
        });
        await act(async () => {
          askSession.setDraft('');
        });
      };
      // The row that is drawn is a member of the sizing row, in flow, so
      // the box is at least as tall as it: never laid over the box.
      const chosenInFlow = (id: string) => {
        const chosen = hostsOf('ask-starter-chosen');
        expect(chosen.length).toBe(1);
        expect(hostAbove(chosen[0]!) === held()).toBe(true);
        expect(members()).toEqual([
          'ask-starter-chosen',
          'ask-starter-place',
          'ask-starter-place',
          'ask-starter-place',
        ]);
        expect(flat(chosen[0]!)).toMatchObject({
          width: '100%',
          flexShrink: 0,
        });
        expect(flat(chosen[0]!).position).toBeUndefined();
        expect(flat(chosen[0]!).opacity).toBeUndefined();
        expect(
          chosen[0]!.findAll((n) => n.props.testID === id).length,
        ).toBeGreaterThan(0);
      };
      // The seat answers with a member.
      jest.mocked(useSeat).mockReturnValue({
        status: 'chosen',
        choice: { version: 1, seatId: 'el_fixture', stateSeatIds: [] },
      } as never);
      mockDirectory.current = {
        electorates: {
          data: {
            electorates: [
              {
                electorate_id: 'el_fixture',
                status: 'current',
                jurisdiction: 'federal',
                chamber: 'representatives',
                representation_status: 'verified',
                representatives: [{ person_id: 'fixture-person' }],
              },
            ],
          },
        },
      };
      await redraw();
      expect(places()).toBe(before);
      chosenInFlow('ask-starter-seat');
      expect(a11y('ask-starter-seat', 'accessibilityLabel')).toBe(
        'What has Sam Placeholder said in parliament this year?',
      );
      // And with no seat after all: the general starter, in the same box.
      jest.mocked(useSeat).mockReturnValue({ status: 'none' } as never);
      await redraw();
      expect(places()).toBe(before);
      expect(byId('ask-starter-seat').length).toBe(0);
      chosenInFlow('ask-starter-0');
    } finally {
      // The mounted screen redraws for the size: inside act, as it is told.
      await act(async () => {
        Dimensions.set({ window: original });
      });
    }
  },
);

test('with no seat saved on the device, a seat read still under way holds nothing: the general starter is final at once', async () => {
  jest.mocked(useSeat).mockReturnValue({ status: 'loading' } as never);
  jest.mocked(useSavedChoice).mockReturnValue(null);
  await mount();
  expect(byId('ask-starter-held').length).toBe(0);
  expect(byId('ask-starter-place').length).toBe(0);
  expect(byId('ask-starter-0').length).toBeGreaterThan(0);
});

test('a later read of the seat keeps the starter that is drawn: Try asking is never left empty', async () => {
  const chosen = {
    status: 'chosen',
    choice: { version: 1, seatId: 'el_fixture', stateSeatIds: [] },
  };
  jest.mocked(useSeat).mockReturnValue(chosen as never);
  mockDirectory.current = {
    electorates: {
      data: {
        electorates: [
          {
            electorate_id: 'el_fixture',
            status: 'current',
            jurisdiction: 'federal',
            chamber: 'representatives',
            representation_status: 'verified',
            representatives: [{ person_id: 'fixture-person' }],
          },
        ],
      },
    },
  };
  await mount();
  const redraw = async () => {
    await act(async () => {
      askSession.setDraft('x');
    });
    await act(async () => {
      askSession.setDraft('');
    });
  };
  expect(byId('ask-starter-held').length).toBe(0);
  expect(byId('ask-starter-seat').length).toBeGreaterThan(0);
  // A retry: the seat is being read again.
  jest.mocked(useSeat).mockReturnValue({ status: 'loading' } as never);
  await redraw();
  expect(byId('ask-starter-seat').length).toBeGreaterThan(0);
  expect(byId('ask-starter-0').length).toBe(0);
  // It answers that there is no member: the general starter replaces it.
  jest.mocked(useSeat).mockReturnValue({ status: 'none' } as never);
  await redraw();
  expect(byId('ask-starter-seat').length).toBe(0);
  expect(byId('ask-starter-0').length).toBeGreaterThan(0);
});

const FULL = 'Ask about the public record';
const SHORT = 'Ask about the record';
const placeholderLine = () =>
  view!.root.find(
    (n) => n.props.testID === 'ask-placeholder' && n.type === Text,
  );
const askField = () =>
  view!.root.find(
    (n) => typeof n.type === 'string' && n.props.testID === 'ask-field',
  );
test.each([
  ['the default size, 402 pt', 1, 402, FULL],
  ['the default size, 375 pt', 1, 375, FULL],
  ['xLarge, 402 pt', 1.118, 402, FULL],
  // 232.5 pt of words in a 231 pt field: cut, so the short line.
  ['xLarge, 375 pt', 1.118, 375, SHORT],
  ['xxLarge, 402 pt', 1.235, 402, SHORT],
  ['xxLarge, 375 pt', 1.235, 375, SHORT],
  // At the cap the placeholder draws exactly as it does at AX3.
  ['xxxLarge, 402 pt', 1.353, 402, SHORT],
  ['xxxLarge, 375 pt', 1.353, 375, SHORT],
  ['AX1, 402 pt', 1.786, 402, SHORT],
  ['AX3, 402 pt', 2.643, 402, SHORT],
  ['AX5, 402 pt', 3.571, 402, SHORT],
])(
  '%s: the composer draws the placeholder that fits, and VoiceOver hears the full words',
  async (_size, fontScale, width, drawn) => {
    const original = Dimensions.get('window');
    Dimensions.set({
      window: { ...original, width, height: 874, fontScale },
    });
    try {
      await mount();
      expect(placeholderLine().props.children).toBe(drawn);
      expect(one('ask-question').props.accessibilityHint).toBe(FULL);
      expect(one('ask-question').props.accessibilityLabel).toBe('Question');
      // The field's own width decides when it changes later.
      await act(async () => {
        askField().props.onLayout({ nativeEvent: { layout: { width: 120 } } });
      });
      expect(placeholderLine().props.children).toBe(SHORT);
      await act(async () => {
        askField().props.onLayout({ nativeEvent: { layout: { width: 600 } } });
      });
      expect(placeholderLine().props.children).toBe(FULL);
    } finally {
      Dimensions.set({ window: original });
    }
  },
);

test.each([
  // Public Sans is wider: about 218 dp of words in a 208 dp field.
  ['360 dp', 360, SHORT],
  ['412 dp', 412, FULL],
])(
  'Android at the default size, %s: the native hint is the line that fits, and TalkBack keeps the full words',
  async (_size, width, hint) => {
    const original = Dimensions.get('window');
    Dimensions.set({
      window: { ...original, width, height: 800, fontScale: 1 },
    });
    const platform = jest.replaceProperty(Platform, 'OS', 'android');
    try {
      await mount();
      expect(one('ask-question').props.placeholder).toBe(hint);
      expect(one('ask-question').props.accessibilityHint).toBe(
        hint === SHORT ? FULL : undefined,
      );
    } finally {
      platform.restore();
      Dimensions.set({ window: original });
    }
  },
);

test('with options chips the first frame already has the right line: the field is read before paint, with no onLayout', async () => {
  const original = Dimensions.get('window');
  // 402 pt at xLarge with chips: the stand-in says the full words fit
  // (250 pt of room for 247 pt), the field itself is narrower.
  Dimensions.set({
    window: { ...original, width: 402, height: 874, fontScale: 1.118 },
  });
  const read = jest
    .spyOn(measure, 'frameOf')
    .mockImplementation((ref) =>
      (ref.current as { props?: { testID?: string } } | null)?.props?.testID ===
      'ask-field'
        ? { width: 240, height: 44 }
        : null,
    );
  try {
    await act(async () => {
      askSession.options({ ...defaultOptions, kind: 'speech' });
    });
    await mount();
    // The chips are on: the field has its inset.
    expect(StyleSheet.flatten(askField().props.style).marginLeft).toBe(8);
    expect(read).toHaveBeenCalled();
    // No onLayout was sent: the choice came from the read before paint.
    expect(placeholderLine().props.children).toBe(SHORT);
    // The stand-in alone would have drawn the full words, then swapped.
    expect(
      placeholderFits({
        fontScale: 1.118,
        room: composerFieldRoomEstimate(402, true),
      }),
    ).toBe(true);
  } finally {
    read.mockRestore();
    await act(async () => {
      askSession.options({ ...defaultOptions });
    });
    Dimensions.set({ window: original });
  }
});

test('the fit rule: the full words at their drawn size against the field', () => {
  // 13 em of the drawn size on iOS; the size stops at the 23 pt cap.
  expect(placeholderEms()).toBe(13);
  expect(placeholderFits({ fontScale: 1, room: 221 })).toBe(true);
  expect(placeholderFits({ fontScale: 1, room: 220 })).toBe(false);
  expect(placeholderFits({ fontScale: 1.353, room: 299 })).toBe(true);
  expect(placeholderFits({ fontScale: 1.353, room: 298 })).toBe(false);
  expect(placeholderFits({ fontScale: 3.571, room: 299 })).toBe(true);
  // The stand-in for an unmeasured field.
  expect(composerFieldRoomEstimate(402, false)).toBe(258);
  expect(composerFieldRoomEstimate(402, true)).toBe(250);
  const platform = jest.replaceProperty(Platform, 'OS', 'android');
  try {
    // 13.5 em on Android, whose hint is not capped, and wider buttons.
    expect(placeholderEms()).toBe(13.5);
    expect(composerFieldRoomEstimate(360, false)).toBe(208);
    expect(placeholderFits({ fontScale: 1, room: 229 })).toBe(false);
    expect(placeholderFits({ fontScale: 1, room: 230 })).toBe(true);
    expect(placeholderFits({ fontScale: 2, room: 458 })).toBe(false);
  } finally {
    platform.restore();
  }
});

describe('the starter box is held from when Try asking is first seen, not first mounted (b80 sweep, AX3)', () => {
  // Ask is mounted with the tabs at launch, before any seat is read, and
  // opened later. The navigator says when it is the screen in front.
  const original = Dimensions.get('window');
  let focused = false;
  let onFocus: (() => void)[] = [];
  const navigation = {
    setOptions: jest.fn(),
    getState: () => ({ index: 0, routes: [{ key: 'ask', name: 'ask' }] }),
    isFocused: () => focused,
    addListener: (type: string, handler: () => void) => {
      if (type === 'focus') onFocus.push(handler);
      return () => {
        onFocus = onFocus.filter((item) => item !== handler);
      };
    },
  };
  const mountBehind = async () => {
    await act(async () => {
      view = create(
        <NavigationContext.Provider value={navigation as never}>
          <AskScreen />
        </NavigationContext.Provider>,
      );
    });
    return view!;
  };
  const redraw = () =>
    act(async () => {
      askSession.setDraft(' ');
      askSession.setDraft('');
    });
  const open = () =>
    act(async () => {
      focused = true;
      onFocus.forEach((handler) => handler());
    });
  beforeEach(() => {
    focused = false;
    onFocus = [];
    Dimensions.set({
      window: { ...original, width: 402, height: 874, fontScale: 2.643 },
    });
  });
  afterEach(() => Dimensions.set({ window: original }));

  test('mounted at launch with the seat unread, opened once there is none: the card is its starter, nothing held', async () => {
    jest.mocked(useSeat).mockReturnValue({ status: 'loading' } as never);
    jest.mocked(useSavedChoice).mockReturnValue(undefined);
    await mountBehind();
    // Behind the other tabs the box follows the seat: held while it is
    // being read.
    expect(byId('ask-starter-held').length).toBeGreaterThan(0);
    // The device answers that no seat is saved, long before Ask is opened:
    // the hold is let go, still unseen.
    jest.mocked(useSeat).mockReturnValue({ status: 'none' } as never);
    jest.mocked(useSavedChoice).mockReturnValue(null);
    await redraw();
    expect(byId('ask-starter-held').length).toBe(0);
    await open();
    // The card is the one starter at its own height: no unseen candidates
    // making it as tall as the longest member's question.
    expect(byId('ask-starter-held').length).toBe(0);
    expect(byId('ask-starter-place').length).toBe(0);
    expect(byId('ask-starter-0').length).toBeGreaterThan(0);
    // And it stays that way.
    await redraw();
    expect(byId('ask-starter-held').length).toBe(0);
  });

  test('opened while the seat is still being read: held, as before, and for the life of the page', async () => {
    jest.mocked(useSeat).mockReturnValue({ status: 'loading' } as never);
    jest.mocked(useSavedChoice).mockReturnValue(undefined);
    await mountBehind();
    // The tree the tab shows first, before the focus listener has run, is
    // already the held box: nothing grows in after first sight.
    const before = byId('ask-starter-place').length;
    expect(byId('ask-starter-held').length).toBeGreaterThan(0);
    expect(before).toBeGreaterThan(0);
    await open();
    expect(byId('ask-starter-place').length).toBe(before);
    expect(byId('ask-starter-held').length).toBeGreaterThan(0);
    expect(byId('ask-starter-place').length).toBeGreaterThan(0);
    jest.mocked(useSeat).mockReturnValue({ status: 'none' } as never);
    jest.mocked(useSavedChoice).mockReturnValue(null);
    await redraw();
    // The box does not change size once it has been seen.
    expect(byId('ask-starter-held').length).toBeGreaterThan(0);
    expect(byId('ask-starter-0').length).toBeGreaterThan(0);
  });
});

test('a seat already known when Try asking is first drawn needs no held box', async () => {
  await mount();
  expect(byId('ask-starter-held').length).toBe(0);
  expect(byId('ask-starter-place').length).toBe(0);
  expect(byId('ask-starter-0').length).toBeGreaterThan(0);
});

test.each(['before', 'after'] as const)(
  'turn layouts win when fallback frames run %s layout, including Ask next',
  async (frameOrder) => {
    const frames: FrameRequestCallback[] = [];
    let frameId = 0;
    const frame = jest
      .spyOn(global, 'requestAnimationFrame')
      .mockImplementation((callback) => {
        frames.push(callback);
        return ++frameId;
      });
    const reset = jest.spyOn(ScrollTop, 'scrollToTop');
    const runFrame = async () => {
      await act(async () => {
        // Frames queued by this frame belong to the next frame.
        frames.splice(0).forEach((callback) => callback(0));
      });
    };
    const fallback = async () => {
      await runFrame();
      await runFrame();
    };
    jest
      .mocked(client.askPost)
      .mockResolvedValueOnce(answer)
      .mockResolvedValueOnce({
        questions: [{ question: 'A grounded fixture follow-up?' }],
      })
      .mockResolvedValueOnce(answer)
      .mockResolvedValueOnce({ questions: [] });
    try {
      await mount();
      await type('A fixture question?');
      for (const [button, y] of [
        ['ask-submit', 400],
        ['ask-followup-0', 900],
      ] as const) {
        scrollTo.mockClear();
        await press(button);
        expect(frames.length).toBeGreaterThan(0);
        if (frameOrder === 'before') await fallback();
        await act(async () => {
          byId('ask-turn')[0]!.props.onLayout({
            nativeEvent: { layout: { y } },
          });
        });
        if (frameOrder === 'after') await fallback();
        // The fallback can also produce -44, without a New question reset.
        expect(reset).not.toHaveBeenCalled();
        expect(scrollTo).toHaveBeenLastCalledWith(
          expect.objectContaining({ y: y - 44 - rhythm.heading }),
        );
        expect(scrollTo).toHaveBeenCalledTimes(frameOrder === 'before' ? 2 : 1);
      }
      // Clearing a conversation cancels a reveal that has not had its layout.
      jest
        .mocked(client.askPost)
        .mockResolvedValueOnce(answer)
        .mockResolvedValueOnce({ questions: [] });
      await type('Another fixture question?');
      await press('ask-submit');
      await act(async () => barButton('New question')!.onPress());
      expect(scrollTo).toHaveBeenLastCalledWith({ y: -44, animated: false });
      expect(reset).toHaveBeenCalledTimes(1);
      scrollTo.mockClear();
      await fallback();
      expect(scrollTo).not.toHaveBeenCalled();
    } finally {
      frame.mockRestore();
      reset.mockRestore();
    }
  },
);

test('a sent question shows the status line, Stop, and is revealed below the header', async () => {
  clock.on();
  try {
    await sentQuestion();
  } finally {
    clock.off();
  }
});
async function sentQuestion() {
  let on: StreamHandlers | undefined,
    fail: (e: unknown) => void = () => {};
  jest.mocked(client.askPost).mockImplementationOnce(
    (_path, _body, _signal, handlers) =>
      new Promise((_resolve, reject) => {
        on = handlers;
        fail = reject;
      }),
  );
  await mount();
  await type('Who spoke on housing?');
  scrollTo.mockClear();
  await press('ask-submit');
  const turn = byId('ask-turn')[0]!;
  expect(turn.findAllByProps({ testID: 'ask-user-question' })).not.toEqual([]);
  expect(textOf('ask-user-question')).toBe('Who spoke on housing?');
  expect(textOf('ask-status')).toBe('Reading your question');
  // A system activity indicator leads the line and is never announced.
  const spinner = byId('ask-progress')[0]!.findAllByType(ActivityIndicator)[0]!;
  expect(spinner.props).toMatchObject({
    accessibilityElementsHidden: true,
    importantForAccessibility: 'no-hide-descendants',
  });
  // Send has become Stop; the composer was cleared for the next question.
  expect(one('ask-stop').props.accessibilityLabel).toBe('Stop answering');
  expect(byId('ask-submit')).toEqual([]);
  expect(one('ask-question').props.value).toBe('');
  // The reveal uses the turn's own layout and clears the native header
  // (no navigator here: 44pt), never the raw content y behind the bar.
  await act(async () => {
    turn.props.onLayout({ nativeEvent: { layout: { y: 400 } } });
  });
  expect(scrollTo).toHaveBeenLastCalledWith(
    expect.objectContaining({ y: 400 - 44 - rhythm.heading }),
  );
  await act(async () => {
    on!.stage('Searching the record');
  });
  // Status copy has a minimum dwell time, even for a fast lookup: the line
  // is held for the whole of it, to the millisecond, and changes at its end.
  expect(textOf('ask-status')).toBe('Reading your question');
  await pass(STATUS_HOLD_MS - 1);
  expect(textOf('ask-status')).toBe('Reading your question');
  await pass(1);
  expect(textOf('ask-status')).toBe('Searching the record');
  await act(async () => {
    on!.step?.({
      id: 'hearings',
      label: 'Checking committee hearings',
      arg: 'housing',
      state: 'running',
    });
  });
  // Held: the step's line never replaces it at once.
  expect(textOf('ask-status')).toBe('Searching the record');
  await pass(STATUS_HOLD_MS - 1);
  expect(textOf('ask-status')).toBe('Searching the record');
  await pass(1);
  expect(textOf('ask-status')).toBe('Checking committee hearings: housing');
  // An error after text keeps the question with one plain sentence, never
  // the server's words, and Try again.
  await act(async () => {
    fail(new AskFailure('partial', 'The answer stream failed.'));
  });
  expect(textOf('ask-failed-question')).toBe('Who spoke on housing?');
  expect(byId('ask-error-partial')).not.toEqual([]);
  expect(texts().join(' ')).toContain('This answer stopped partway.');
  expect(texts().join(' ')).not.toContain('The answer stream failed.');
  expect(byId('ask-retry')).not.toEqual([]);
  expect(byId('ask-progress')).toEqual([]);
  // The failed question returns to the empty composer.
  expect(one('ask-question').props.value).toBe('Who spoke on housing?');
}

test('a stream that stops partway keeps its text under one pill, read as Markdown', async () => {
  let on: StreamHandlers | undefined,
    fail: (e: unknown) => void = () => {};
  jest.mocked(client.askPost).mockImplementationOnce(
    (_path, _body, _signal, handlers) =>
      new Promise((_resolve, reject) => {
        on = handlers;
        fail = reject;
      }),
  );
  await mount();
  await type('Who spoke on housing?');
  await press('ask-submit');
  await act(async () => {
    on!.delta(
      'The bill had **support [1] across the House.\n\n| a | b |\n|---|---|\n| one | two',
    );
  });
  await act(async () => {
    fail(new AskFailure('partial', 'The answer stream failed.'));
  });
  const partial = byId('ask-partial');
  expect(partial).not.toEqual([]);
  // Every string drawn in the turn: no Markdown or raw markers survive.
  const strings: string[] = [];
  const walk = (node: unknown): void => {
    if (typeof node === 'string') strings.push(node);
    else if (Array.isArray(node)) node.forEach(walk);
    else if (node && typeof node === 'object' && 'children' in node)
      walk((node as { children: unknown }).children);
  };
  walk(view!.toJSON());
  const drawn = strings.join(' ');
  expect(drawn).toContain('across the House');
  expect(drawn).not.toMatch(/[*|]|\[1\]/);
  expect(
    byId('ask-machine-label').filter((n) => typeof n.type === 'string'),
  ).toHaveLength(1);
  expect(drawn).toContain('This answer stopped partway.');
  expect(byId('ask-retry')).not.toEqual([]);
});

describe('streamed text and VoiceOver', () => {
  const pieces = ['Housing was debated. ', 'The bill passed. ', 'Two opposed.'];
  // On the test clock: the two-second spacing between spoken stages and
  // the frames after a layout pass as told, not as the machine allows.
  const wait = pass;
  const move = jest.mocked(moveAccessibilityFocus);
  const tails = () =>
    move.mock.calls.filter(
      ([node]) =>
        (node as unknown as { props: { testID?: string } } | null)?.props
          .testID === 'ask-stream-tail',
    );
  let announce: jest.SpyInstance;
  let on: StreamHandlers | undefined;
  let finish: (value: unknown) => void;
  const said = () => announce.mock.calls.map(([text]) => String(text));
  beforeEach(() => {
    clock.on();
    takeFocusRequest('ask-status');
    move.mockClear();
    jest.mocked(announceAnswer).mockClear();
    announce = jest
      .spyOn(AccessibilityInfo, 'announceForAccessibilityWithOptions')
      .mockImplementation(() => undefined);
    // An earlier test's spy on the same method is this one: start clean.
    announce.mockClear();
    jest.mocked(client.askPost).mockImplementationOnce(
      (_path, _body, _signal, handlers) =>
        new Promise((resolve) => {
          on = handlers;
          finish = resolve;
        }),
    );
  });
  afterEach(() => {
    takeFocusRequest('ask-status');
    clock.off();
  });
  const stream = async () => {
    // "Reading your question" is spoken first, so the stage the first text
    // sets waits out the two-second spacing.
    await wait(50);
    for (const piece of pieces)
      await act(async () => {
        on!.delta(piece);
        await jest.advanceTimersByTimeAsync(40);
      });
    // The status line has faded out.
    await wait(200);
  };

  test('a composer send: no piece is announced, focus stays put, the answer is announced once and no stage follows it', async () => {
    await mount();
    await type('Who spoke on housing?');
    await press('ask-submit');
    expect(byId('ask-stream-tail')).toHaveLength(0);
    await stream();
    expect(byId('ask-status-row')).toHaveLength(0);
    // The tail is the busy element, and nothing in the turn is a live region.
    expect(byId('ask-stream-tail').at(-1)!.props).toMatchObject({
      accessible: true,
      accessibilityLabel: 'Writing the answer',
      accessibilityState: { busy: true },
      accessibilityLiveRegion: 'none',
    });
    const regions = byId('ask-progress')
      .at(-1)!
      .findAll((n) => typeof n.props.accessibilityLiveRegion === 'string')
      .map((n) => n.props.accessibilityLiveRegion);
    expect(regions.length).toBeGreaterThan(0);
    expect(regions.every((region) => region === 'none')).toBe(true);
    // The send asked for no status focus, so the tail takes none.
    expect(tails()).toHaveLength(0);
    expect(jest.mocked(announceAnswer)).not.toHaveBeenCalled();
    await act(async () => {
      finish(answer);
    });
    expect(jest.mocked(announceAnswer)).toHaveBeenCalledTimes(1);
    expect(byId('ask-progress')).toHaveLength(0);
    expect(byId('ask-stream-tail')).toHaveLength(0);
    // "Writing the answer" was still waiting out its spacing: it is dropped,
    // never spoken after the answer.
    await wait(2200);
    expect(said().filter((text) => text !== 'Reading your question')).toEqual(
      [],
    );
    expect(tails()).toHaveLength(0);
  });

  test('a send that put VoiceOver on the status line: focus moves to the tail once, which reads the stage itself', async () => {
    await mount();
    await type('Who spoke on housing?');
    requestFocus('ask-status');
    await press('ask-submit');
    await stream();
    expect(tails()).toHaveLength(1);
    // The waiting "Writing the answer" is dropped: the tail's label says it.
    await wait(2200);
    expect(said().filter((text) => text !== 'Reading your question')).toEqual(
      [],
    );
    // A server retry hands over again without moving focus again.
    await act(async () => {
      on!.retry();
    });
    expect(byId('ask-status-row').length).toBeGreaterThan(0);
    await stream();
    expect(tails()).toHaveLength(1);
    await act(async () => {
      finish(answer);
    });
    expect(jest.mocked(announceAnswer)).toHaveBeenCalledTimes(1);
    expect(
      said().some((text) => pieces.some((p) => text.includes(p.trim()))),
    ).toBe(false);
  });

  test('Android: text that draws nothing yet leaves the status row and its live region to speak the stage', async () => {
    await mount();
    await type('Who spoke on housing?');
    await press('ask-submit');
    await wait(50);
    // Not blank, but no block yet: the row has not left.
    await act(async () => {
      on!.delta('**');
    });
    announce.mockClear();
    // Android only while the stage comes due (the screen audit is per
    // platform, and this screen was drawn for iOS).
    const platform = jest.replaceProperty(Platform, 'OS', 'android');
    try {
      await wait(2200);
    } finally {
      platform.restore();
    }
    const row = byId('ask-status-row').at(-1)!;
    expect(row.props).toMatchObject({
      accessibilityLiveRegion: 'polite',
      accessibilityLabel: 'Writing the answer',
    });
    expect(byId('ask-stream-tail')).toHaveLength(0);
    // The live region speaks the label: an announcement would say it twice.
    expect(said()).toEqual([]);
    await act(async () => {
      finish(answer);
    });
  });

  describe('the thread follows the streaming text', () => {
    // One frame after the reports, the follow runs once.
    const lay = async (id: string, layout: Record<string, number>) =>
      act(async () => {
        byId(id)
          .find((n) => typeof n.props.onLayout === 'function')!
          .props.onLayout({ nativeEvent: { layout } });
        await jest.advanceTimersByTimeAsync(40);
      });
    const scroller = () => view!.root.findByType(ScrollView);
    const scrolled = async (y: number) =>
      act(async () => {
        scroller().props.onScroll({ nativeEvent: { contentOffset: { y } } });
        await jest.advanceTimersByTimeAsync(40);
      });
    const viewport = async (height: number) =>
      act(async () => {
        scroller().props.onLayout({
          nativeEvent: { layout: { x: 0, y: 0, width: 390, height } },
        });
        await jest.advanceTimersByTimeAsync(40);
      });
    const begin = async (thread = 8) => {
      await mount();
      await type('Who spoke on housing?');
      await press('ask-submit');
      await viewport(800);
      await lay('ask-thread', { y: thread });
      await lay('ask-turn', { y: 400 });
      await stream();
      scrollTo.mockClear();
    };
    // The thread's top, the turn's, the block's bottom edge and the gap,
    // less the room above the composer.
    const followed = (edge: number, thread = 8) =>
      thread + 400 + edge + rhythm.block - 800;

    test('it follows the growing end, then leaves a dragged thread alone', async () => {
      await begin();
      // Still fits: the question and first line stay under the bar.
      await lay('ask-progress', { y: 60, height: 200 });
      expect(scrollTo).not.toHaveBeenCalled();
      await lay('ask-progress', { y: 60, height: 600 });
      expect(scrollTo).toHaveBeenLastCalledWith({
        y: followed(660),
        animated: true,
      });
      // Where it was before the thread's own place counted: 8 pt of padding
      // and a 16 pt gap is the old 24 pt clearance.
      expect(followed(660)).toBe(400 + 660 + rhythm.group - 800);
      await lay('ask-progress', { y: 60, height: 700 });
      expect(scrollTo).toHaveBeenLastCalledWith({
        y: followed(760),
        animated: true,
      });
      expect(scrollTo).toHaveBeenCalledTimes(2);
      // The reader drags: this answer stays where they put it.
      await act(async () => {
        scroller().props.onScrollBeginDrag({ nativeEvent: {} });
      });
      await lay('ask-progress', { y: 60, height: 1200 });
      expect(scrollTo).toHaveBeenCalledTimes(2);
      await act(async () => {
        finish(answer);
      });
    });

    test('Android: under the in-content title at a large font the tail still clears the composer', async () => {
      // The root title at font scale 2, the 36 dp gap and the 16 dp padding.
      const thread = 162;
      await begin(thread);
      await lay('ask-progress', { y: 60, height: 600 });
      const y = scrollTo.mock.calls.at(-1)![0].y;
      expect(y).toBe(followed(660, thread));
      // The tail's bottom edge on screen: the gap above the composer, not
      // the thread's offset below it.
      expect(thread + 400 + 660 - y).toBe(800 - rhythm.block);
      // The thread reports its place from the scroll content itself: no
      // view sits between them to measure from instead.
      let node = byId('ask-thread').find(
        (n) => typeof n.type === 'string',
      )!.parent;
      const between: string[] = [];
      while (node && node.type !== ScrollView) {
        // 'ask-screen' is the scroll view's own host.
        if (
          typeof node.type === 'string' &&
          node.props.testID &&
          node.props.testID !== 'ask-screen'
        )
          between.push(node.props.testID);
        node = node.parent;
      }
      expect(node?.type).toBe(ScrollView);
      expect(between).toEqual([]);
      await act(async () => {
        finish(answer);
      });
    });

    test('a scroll that is not a drag (VoiceOver, a status-bar tap) stops it, and coming back resumes it', async () => {
      await begin();
      await lay('ask-progress', { y: 60, height: 600 });
      await scrolled(followed(660));
      expect(scrollTo).toHaveBeenCalledTimes(1);
      // No drag began: the offset fell.
      await scrolled(followed(660) - 250);
      await lay('ask-progress', { y: 60, height: 800 });
      await lay('ask-progress', { y: 60, height: 900 });
      expect(scrollTo).toHaveBeenCalledTimes(1);
      // Back within reach of the growing end.
      await scrolled(followed(960) - 10);
      expect(scrollTo).toHaveBeenLastCalledWith({
        y: followed(960),
        animated: true,
      });
      expect(scrollTo).toHaveBeenCalledTimes(2);
      await act(async () => {
        finish(answer);
      });
    });

    test('a flick is left its momentum; the follow resumes when it stops near the end', async () => {
      await begin();
      await lay('ask-progress', { y: 60, height: 600 });
      await scrolled(followed(660));
      scrollTo.mockClear();
      await act(async () => {
        scroller().props.onScrollBeginDrag({ nativeEvent: {} });
      });
      await scrolled(followed(660) - 12);
      await act(async () => {
        scroller().props.onScrollEndDrag({
          nativeEvent: { velocity: { x: 0, y: -1.2 } },
        });
        scroller().props.onMomentumScrollBegin({ nativeEvent: {} });
      });
      await lay('ask-progress', { y: 60, height: 608 });
      expect(scrollTo).not.toHaveBeenCalled();
      await act(async () => {
        scroller().props.onMomentumScrollEnd({ nativeEvent: {} });
        await jest.advanceTimersByTimeAsync(40);
      });
      expect(scrollTo).toHaveBeenLastCalledWith({
        y: followed(668),
        animated: true,
      });
      await act(async () => {
        finish(answer);
      });
    });

    test('nothing moves when the answer lands', async () => {
      await begin();
      await lay('ask-progress', { y: 60, height: 600 });
      expect(scrollTo).toHaveBeenCalledTimes(1);
      await act(async () => {
        finish(answer);
      });
      expect(byId('ask-progress')).toHaveLength(0);
      // The finished turn lays out again and the page gets shorter: the
      // last streamed edge is still held, and still nothing follows it.
      await lay('ask-turn', { y: 460 });
      await lay('ask-thread', { y: 60 });
      await viewport(500);
      await scrolled(followed(660));
      expect(scrollTo).toHaveBeenCalledTimes(1);
    });

    test('Reduce Motion jumps', async () => {
      const reduce = jest
        .spyOn(accessibility, 'useReduceMotion')
        .mockReturnValue(true);
      try {
        await begin();
        await lay('ask-progress', { y: 60, height: 600 });
        expect(scrollTo).toHaveBeenLastCalledWith({
          y: followed(660),
          animated: false,
        });
        await act(async () => {
          finish(answer);
        });
        await act(async () => view!.unmount());
      } finally {
        reduce.mockRestore();
      }
    });
  });

  test('the audit reaches the tail row, and its one finding is the recorded exception', async () => {
    await mount();
    await type('Who spoke on housing?');
    await press('ask-submit');
    await stream();
    const findings = auditAccessibility(view!.root, { platform: 'ios' }).filter(
      (finding) => finding.rule === 'live-region',
    );
    expect(findings.map(({ element }) => element)).toEqual(['ask-stream-tail']);
    const recorded = a11yExceptions.filter(
      (entry) =>
        entry.screens.includes('src/features/ask/AskScreen.tsx') &&
        entry.rule === 'live-region',
    );
    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject({
      screens: ['src/features/ask/AskScreen.tsx'],
      element: findings[0]!.element,
      detail: findings[0]!.detail,
    });
    expect(recorded[0]!.reason).toMatch(/second time/);
    await act(async () => {
      finish(answer);
    });
  });
});

test('Stop puts the question back in an empty composer and says so', async () => {
  const announce = jest
    .spyOn(AccessibilityInfo, 'announceForAccessibilityWithOptions')
    .mockImplementation(() => undefined);
  jest
    .mocked(client.askPost)
    .mockImplementationOnce(
      (_path, _body, signal) =>
        new Promise((_resolve, reject) =>
          signal.addEventListener('abort', () =>
            reject(new AskFailure('cancelled', 'Cancelled.')),
          ),
        ),
    );
  await mount();
  await type('Who spoke on housing?');
  await press('ask-submit');
  await press('ask-stop');
  expect(askSession.snapshot().busy).toBe(false);
  expect(one('ask-question').props.value).toBe('Who spoke on housing?');
  expect(byId('ask-turn')).toEqual([]);
  expect(byId('ask-error-cancelled')).toEqual([]);
  expect(announce).toHaveBeenCalledWith(
    'Stopped. Your question is back in the box.',
    { queue: true },
  );
  announce.mockRestore();
});

test('a reply with nothing to search on asks for a full question; its suggestion fills, never sends', async () => {
  const first = {
    answer: 'A fixture answer about housing affordability.',
    citations: {},
    sources: [],
  };
  jest
    .mocked(client.askPost)
    .mockResolvedValueOnce(first)
    .mockResolvedValueOnce(clarify);
  await mount();
  await type('What has Sam Placeholder proposed about housing affordability?');
  await press('ask-submit');
  await type('High');
  await press('ask-submit');
  // Sent as a follow-up, with the conversation as context.
  expect(jest.mocked(client.askPost).mock.calls[1]?.[1]).toMatchObject({
    question: 'High',
    context: [
      {
        author: 'user',
        text: 'What has Sam Placeholder proposed about housing affordability?',
      },
      { author: 'answer', text: first.answer },
    ],
  });
  const turn = byId('ask-turn')[0]!;
  expect(turn.findAllByProps({ testID: 'ask-clarify' })).not.toEqual([]);
  expect(textOf('ask-clarify-question')).toBe('High');
  expect(textOf('ask-clarify-message')).toBe(
    'Name a person, party, bill or topic.',
  );
  expect(
    turn.findAllByProps({ testID: 'ask-search-opax' })[0]!.props.question,
  ).toBe('High');
  // No answer, no "Answered as", and the earlier answer stays the thread.
  expect(byId('ask-answered-as')).toEqual([]);
  expect(
    byId('ask-user-question')
      .flatMap((n) => n.findAll(() => true))
      .map((n) => n.props.children),
  ).not.toContain('High');
  expect(askSession.snapshot().thread).toHaveLength(2);
  await press('ask-clarify-suggestion');
  expect(client.askPost).toHaveBeenCalledTimes(2);
  expect(one('ask-question').props.value).toBe(clarify.suggested_question);
});

test('Answered as shows only when the rewrite changed the meaning', async () => {
  jest
    .mocked(client.askPost)
    .mockResolvedValueOnce({
      ...answer,
      asked_as: 'How did each party vote on the Example Bill 2026?',
    })
    .mockResolvedValueOnce({ questions: [] });
  await mount();
  await type('How did they vote?');
  await press('ask-submit');
  expect(textOf('ask-answered-as')).toBe(
    'Answered as: How did each party vote on the Example Bill 2026?',
  );
  expect(byId('ask-understood')).toEqual([]);
});

test('Ask next rows send; New question is enabled once there is an answer', async () => {
  jest
    .mocked(client.askPost)
    .mockResolvedValueOnce(answer)
    .mockResolvedValueOnce({
      questions: [{ question: 'A grounded fixture follow-up?' }],
    })
    .mockResolvedValueOnce(answer)
    .mockResolvedValueOnce({ questions: [] });
  await mount();
  await type('A fixture question?');
  await press('ask-submit');
  expect(byId('ask-answer')).not.toEqual([]);
  expect(byId('ask-idle-line')).toEqual([]);
  expect(barButton('New question')?.disabled).toBe(false);
  await press('ask-followup-0');
  expect(jest.mocked(client.askPost).mock.calls[2]?.[1]).toMatchObject({
    question: 'A grounded fixture follow-up?',
  });
  const reset = jest.spyOn(ScrollTop, 'scrollToTop');
  await act(async () => barButton('New question')!.onPress());
  expect(askSession.snapshot().thread).toEqual([]);
  expect(byId('ask-idle-line')).not.toEqual([]);
  expect(reset).toHaveBeenCalledWith(expect.anything(), 44);
  expect(scrollTo).toHaveBeenLastCalledWith({ y: -44, animated: false });
  reset.mockRestore();
});

test('New question still rests a header above zero where Ask measures under its root bar', async () => {
  // Ask's scroll view starts at the window's top, under the translucent root
  // bar: the measured reset is the same -headerBottom as before.
  const measure = jest
    .spyOn(
      ScrollView.prototype as unknown as {
        measureInWindow: (callback: (x: number, y: number) => void) => void;
      },
      'measureInWindow',
    )
    .mockImplementation((callback) => callback(0, 0));
  try {
    jest
      .mocked(client.askPost)
      .mockResolvedValueOnce(answer)
      .mockResolvedValueOnce({ questions: [] });
    await mount();
    await type('A fixture question?');
    await press('ask-submit');
    scrollTo.mockClear();
    measure.mockClear();
    await act(async () => barButton('New question')!.onPress());
    expect(measure).toHaveBeenCalled();
    expect(scrollTo).toHaveBeenLastCalledWith({ y: -44, animated: false });
  } finally {
    measure.mockRestore();
  }
});

test('a failed follow-up hides the previous Ask next and holds Try again while OPAX is busy', async () => {
  jest
    .mocked(client.askPost)
    .mockResolvedValueOnce(answer)
    .mockResolvedValueOnce({
      questions: [{ question: 'A grounded fixture follow-up?' }],
    })
    .mockRejectedValueOnce(
      new AskFailure('rate-limited', 'Try again shortly.'),
    );
  await mount();
  await type('A fixture question?');
  await press('ask-submit');
  expect(byId('ask-followup-0')).not.toEqual([]);
  await type('A failing fixture question?');
  await press('ask-submit');
  expect(byId('ask-followups')).toEqual([]);
  expect(byId('ask-followup-0')).toEqual([]);
  expect(texts()).toContain('OPAX is busy right now.');
  expect(texts().join(' ')).not.toContain('Try again shortly.');
  const retry = one('ask-retry');
  expect(retry.props.disabled).toBe(true);
  expect(retry.props.accessibilityHint).toBe(
    'Available when the countdown ends',
  );
  expect(askSession.snapshot().thread).toHaveLength(2);
});

test.each(['401', '403', 'redirect'])(
  'a generic %s block offers Edit question with no rewording reason, keeping the draft and focus',
  async (block) => {
    const restore = immediateFocusRequests();
    try {
      jest
        .mocked(client.askPost)
        .mockRejectedValueOnce(
          new AskFailure('blocked', `Request blocked (${block})`),
        );
      await mount();
      await type('A fixture question?');
      await press('ask-submit');
      expect(texts()).toContain('This question couldn’t be sent.');
      expect(byId('ask-retry')).toEqual([]);
      expect(byId('ask-blocked-reason')).toEqual([]);
      expect(texts().join(' ')).not.toContain('rewording');
      const before = one('ask-question').props.value;
      jest.mocked(TextInput.prototype.focus).mockClear();
      await press('ask-edit-question');
      expect(TextInput.prototype.focus).toHaveBeenCalled();
      expect(one('ask-question').props.value).toBe(before);
      expect(before).toBe('A fixture question?');
    } finally {
      restore();
    }
  },
);

test('an arrival while an answer runs waits in the composer and sends a new conversation', async () => {
  let finish: (v: unknown) => void = () => {};
  jest
    .mocked(client.askPost)
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    )
    .mockResolvedValueOnce({ questions: [] })
    .mockResolvedValueOnce(answer)
    .mockResolvedValueOnce({ questions: [] });
  await mount();
  await type('A running question?');
  await press('ask-submit');
  await act(async () =>
    arriveInAsk({
      question: 'What has Sam Placeholder said in parliament this year?',
      speaker: 'Sam Placeholder',
      kind: 'speech',
    }),
  );
  // Nothing cancelled or sent; Stop stays until the answer completes.
  expect(askSession.snapshot().busy).toBe(true);
  expect(client.askPost).toHaveBeenCalledTimes(1);
  expect(byId('ask-stop')).not.toEqual([]);
  expect(textOf('ask-draft-new-conversation')).toContain(
    'Starts a new conversation',
  );
  expect(one('ask-question').props.value).toBe(
    'What has Sam Placeholder said in parliament this year?',
  );
  await act(async () => finish(answer));
  const first = askSession.snapshot().id;
  // The Person option is checked against the roster before it is sent.
  jest.mocked(catalogs.roster).mockResolvedValue({
    data: { people: [{ name: 'Sam Placeholder' }] },
  } as never);
  expect(askSession.snapshot().thread).toHaveLength(2);
  await press('ask-submit');
  const asked = jest.mocked(client.askPost).mock.calls[2]?.[1] as {
    question: string;
    context?: unknown[];
  };
  expect(asked.question).toBe(
    'What has Sam Placeholder said in parliament this year?',
  );
  expect(asked.context ?? []).toEqual([]);
  expect(askSession.snapshot().id).not.toBe(first);
  expect(askSession.snapshot().options).toMatchObject({
    speaker: 'Sam Placeholder',
    kind: 'speech',
  });
});

describe('a prefilled draft is shown from its start (J76-ask3)', () => {
  const long =
    'What has parliament said about the cost of housing for renters in regional towns and the changes to rental assistance since the last election?';
  const mount = () => {
    let r!: ReactTestRenderer;
    act(() => {
      r = create(
        <AskDock
          onSend={() => {}}
          onStop={() => {}}
          onOptions={() => {}}
          offline={false}
          keyboard={336}
        />,
      );
    });
    const field = () =>
      r.root.find(
        (n) => n.props.testID === 'ask-question' && n.props.style !== undefined,
      );
    const cap = () => StyleSheet.flatten(field().props.style).maxHeight;
    const content = (height: number) =>
      act(() =>
        field().props.onContentSizeChange({
          nativeEvent: { contentSize: { width: 300, height } },
        }),
      );
    const selected = (start: number, end = start) =>
      act(() =>
        field().props.onSelectionChange({
          nativeEvent: { selection: { start, end } },
        }),
      );
    return { r, field, cap, content, selected };
  };
  afterEach(() => act(() => askSession.start()));

  test('an arrival puts the caret at the start, so UIKit shows the first line', () => {
    const { r, field } = mount();
    expect(field().props.selection).toBeUndefined();
    act(() => arriveInAsk({ question: long }, 'prefill-1'));
    expect(field().props.value).toBe(long);
    expect(field().props.selection).toEqual({ start: 0, end: 0 });
    act(() => r.unmount());
  });

  test('taller than the field: the caret stays at the start, then is handed back', () => {
    const { r, field, cap, content, selected } = mount();
    act(() => arriveInAsk({ question: long }, 'prefill-2'));
    content(cap() + 60);
    expect(field().props.selection).toEqual({ start: 0, end: 0 });
    // UIKit reports the selection it now has: held no longer, or every tap
    // the reader makes would be put back.
    selected(0);
    expect(field().props.selection).toBeUndefined();
    // A later content size (the reader's own edits) changes nothing.
    content(cap() - 20);
    expect(field().props.selection).toBeUndefined();
    act(() => r.unmount());
  });

  test('a draft that fits moves the caret to its end, where typing continues it', () => {
    const { r, field, cap, content, selected } = mount();
    act(() => arriveInAsk({ question: long }, 'prefill-3'));
    selected(0);
    content(cap() - 20);
    expect(field().props.selection).toEqual({
      start: long.length,
      end: long.length,
    });
    selected(long.length);
    expect(field().props.selection).toBeUndefined();
    act(() => r.unmount());
  });

  test('a selection that is not the one held does not let go early', () => {
    const { r, field, selected } = mount();
    act(() => arriveInAsk({ question: long }, 'prefill-4'));
    // The value's own arrival reports the caret at the end first.
    selected(long.length);
    expect(field().props.selection).toEqual({ start: 0, end: 0 });
    act(() => r.unmount());
  });

  test('what the reader types is never moved', () => {
    const { r, field, content } = mount();
    act(() => field().props.onChangeText('What about'));
    expect(askSession.snapshot().draft).toBe('What about');
    expect(field().props.selection).toBeUndefined();
    content(400);
    expect(field().props.selection).toBeUndefined();
    // Typing over a prefill ends its hold at once.
    act(() => arriveInAsk({ question: long }, 'prefill-5'));
    expect(field().props.selection).toEqual({ start: 0, end: 0 });
    act(() => field().props.onChangeText(`${long} And`));
    expect(field().props.selection).toBeUndefined();
    act(() => r.unmount());
  });

  test('a draft already waiting when the composer mounts counts as a prefill', () => {
    act(() => arriveInAsk({ question: long }, 'prefill-6'));
    const { r, field } = mount();
    expect(field().props.selection).toEqual({ start: 0, end: 0 });
    act(() => r.unmount());
  });

  test('the rule, by itself', () => {
    const start = prefilledCaret(long)!;
    expect(prefilledCaret('')).toBeNull();
    expect(caretSelection(start, long)).toEqual({ start: 0, end: 0 });
    expect(caretSelection(start, 'another draft')).toBeUndefined();
    expect(caretSelection(null, long)).toBeUndefined();
    // Fits, to within a point of the cap.
    expect(caretAfterContent(start, long, 131, 130)).toMatchObject({
      at: 'end',
      done: false,
    });
    expect(caretAfterContent(start, long, 132, 130)).toEqual({
      ...start,
      sized: true,
    });
    expect(caretAfterContent(start, 'another draft', 10, 130)).toBe(start);
    const done = caretAfterSelection(start, long, { start: 0, end: 0 })!;
    expect(done.done).toBe(true);
    expect(caretSelection(done, long)).toBeUndefined();
    expect(caretAfterSelection(start, long, { start: 3, end: 3 })).toBe(start);
    // The selection is often reported before the content's height: a draft
    // that fits still gets its caret at the end, whichever comes first.
    expect(caretAfterContent(done, long, 50, 130)).toMatchObject({
      at: 'end',
      done: false,
    });
    // Judged once: a later height moves nothing.
    const tall = caretAfterContent(start, long, 400, 130);
    expect(caretAfterContent(tall, long, 50, 130)).toBe(tall);
  });

  test.each([1, 2.353])(
    'with options on, the draft is inset from the filled Options button (font scale %s)',
    (fontScale) => {
      const window = Dimensions.get('window');
      act(() => Dimensions.set({ window: { ...window, fontScale } }));
      const before = askSession.composerOptions();
      try {
        act(() =>
          arriveInAsk({ question: long }, `prefill-inset-${fontScale}`),
        );
        const { r } = mount();
        const wrapper = () =>
          StyleSheet.flatten(
            r.root.find(
              (n) =>
                typeof n.type === 'string' && n.props.testID === 'ask-field',
            ).props.style,
          );
        const button = () =>
          r.root.find(
            (n) =>
              n.props.testID === 'ask-composer-options' &&
              n.props.selected !== undefined,
          );
        // No options: the glyph sits inside its target; no extra inset.
        act(() => askSession.options({ ...before, topic: undefined }));
        if (!button().props.selected)
          expect(wrapper().marginLeft).toBeUndefined();
        // An option on: the button is a filled disc, and the text keeps
        // 8 pt from it (it used to touch).
        act(() => askSession.options({ ...before, topic: 'housing' }));
        expect(button().props.selected).toBe(true);
        expect(wrapper()).toMatchObject({ flex: 1, marginLeft: rhythm.tight });
        act(() => r.unmount());
      } finally {
        act(() => askSession.options(before));
        act(() => Dimensions.set({ window }));
      }
    },
  );

  test('the fit is judged like for like: the content height includes the field’s padding, as the cap does', () => {
    // Measured on the iOS 27 simulator: a field of n lines reports
    // n x 22 + 22 (its 11 pt of padding above and below), which is its
    // laid-out height until the cap. The cap at the standard size is 132:
    // five whole lines and both paddings.
    const cap = composerFieldCap({
      fontScale: 1,
      windowHeight: 874,
      chrome: 2 * rhythm.line,
    });
    expect(cap).toBe(5 * textStyles.body.lineHeight + 22);
    const reported = (lines: number) => lines * textStyles.body.lineHeight + 22;
    const start = prefilledCaret(long)!;
    // Four lines (110) fit: the caret goes to the end.
    expect(caretAfterContent(start, long, reported(4), cap)).toMatchObject({
      at: 'end',
    });
    // Five lines (132) are the cap exactly: they fit too.
    expect(caretAfterContent(start, long, reported(5), cap)).toMatchObject({
      at: 'end',
    });
    // Six lines (154) pass it, so the field scrolls: the caret stays at
    // the top.
    expect(caretAfterContent(start, long, reported(6), cap)).toMatchObject({
      at: 'start',
      sized: true,
    });
  });

  test('a reader who taps in before the height is judged keeps their caret', () => {
    const start = prefilledCaret(long)!;
    // The field took the held start, and the hold is let go.
    const released = caretAfterSelection(start, long, { start: 0, end: 0 })!;
    expect(released).toMatchObject({ done: true, sized: false });
    // The same place again is not the reader's doing: still to be judged.
    expect(caretAfterSelection(released, long, { start: 0, end: 0 })).toBe(
      released,
    );
    // The reader taps into the draft, or selects a word.
    for (const selection of [
      { start: 12, end: 12 },
      { start: 5, end: 9 },
    ]) {
      const theirs = caretAfterSelection(released, long, selection)!;
      expect(theirs).toMatchObject({ done: true, sized: true, at: 'start' });
      // The height then says the draft fits: no selection is held again,
      // so the caret is not pulled to the end.
      const judged = caretAfterContent(theirs, long, 50, 130);
      expect(judged).toBe(theirs);
      expect(caretSelection(judged, long)).toBeUndefined();
    }
    // Without a tap the draft that fits still gets its caret at the end.
    expect(
      caretSelection(caretAfterContent(released, long, 50, 130), long),
    ).toEqual({ start: long.length, end: long.length });
    // Another draft's caret is not this one's business.
    expect(caretAfterSelection(released, 'another', { start: 2, end: 2 })).toBe(
      released,
    );
  });

  test('in the field: an early tap is not overridden when the content’s height arrives', () => {
    act(() => arriveInAsk({ question: long }, 'prefill-early-tap'));
    const { r, field } = mount();
    expect(field().props.selection).toEqual({ start: 0, end: 0 });
    // The field reports the held start; the hold ends.
    act(() =>
      field().props.onSelectionChange({
        nativeEvent: { selection: { start: 0, end: 0 } },
      }),
    );
    expect(field().props.selection).toBeUndefined();
    // The reader taps into the middle of the question.
    act(() =>
      field().props.onSelectionChange({
        nativeEvent: { selection: { start: 20, end: 20 } },
      }),
    );
    // The height arrives and fits: nothing is held, their caret stays.
    act(() =>
      field().props.onContentSizeChange({
        nativeEvent: { contentSize: { width: 300, height: 44 } },
      }),
    );
    expect(field().props.selection).toBeUndefined();
    act(() => r.unmount());
  });
});

describe('the composer at AX5 (ask.md 2.11)', () => {
  const original = Dimensions.get('window');
  afterEach(() => act(() => Dimensions.set({ window: original })));
  const dock = (keyboard?: number) => {
    let r!: ReactTestRenderer;
    act(() => {
      r = create(
        <AskDock
          onSend={() => {}}
          onStop={() => {}}
          onOptions={() => {}}
          offline={false}
          keyboard={keyboard}
        />,
      );
    });
    const field = r.root.find(
      (n) => n.props.testID === 'ask-question' && n.props.style !== undefined,
    );
    return { r, field, style: StyleSheet.flatten(field.props.style) };
  };

  test("the question keeps the reader's text size: no font cap", () => {
    act(() =>
      Dimensions.set({
        window: { ...original, width: 402, height: 874, fontScale: 3.12 },
      }),
    );
    const { r, field, style } = dock();
    expect(field.props.allowFontScaling).toBe(true);
    expect(style.fontSize).toBe(textStyles.body.fontSize);
    expect(style.lineHeight).toBe(textStyles.body.lineHeight);
    act(() => r.unmount());
  });

  test('empty, it is one capped placeholder line with its symbols on it; typed text is uncapped (sweep 1, 2.1)', () => {
    act(() =>
      Dimensions.set({
        window: { ...original, width: 402, height: 874, fontScale: 2.643 },
      }),
    );
    const { r, field } = dock();
    // No native placeholder: a multiline one scales uncapped and wraps.
    expect(field.props.placeholder).toBeUndefined();
    expect(field.props.maxFontSizeMultiplier).toBe(chromeTextScaleCap);
    expect(field.props.accessibilityHint).toBe('Ask about the public record');
    const placeholder = r.root.find(
      (n) => n.props.testID === 'ask-placeholder' && n.type === Text,
    );
    // At accessibility sizes the drawn line is the short one, which fits;
    // the full words above stay VoiceOver's hint.
    expect(placeholder.props).toMatchObject({
      children: 'Ask about the record',
      numberOfLines: 1,
      maxFontSizeMultiplier: chromeTextScaleCap,
    });
    for (const icon of r.root.findAllByType(Icon))
      expect(icon.props.maxScale).toBe(chromeTextScaleCap);
    act(() => askSession.setDraft('What did the committee find?'));
    const typed = r.root.find(
      (n) => n.props.testID === 'ask-question' && n.props.style !== undefined,
    );
    expect(typed.props.maxFontSizeMultiplier).toBeUndefined();
    expect(
      r.root.findAll((n) => n.props.testID === 'ask-placeholder'),
    ).toHaveLength(0);
    act(() => askSession.setDraft(''));
    act(() => r.unmount());
  });

  test('Android keeps its native hint and unscaled symbols', () => {
    act(() =>
      Dimensions.set({
        window: { ...original, width: 402, height: 874, fontScale: 2.643 },
      }),
    );
    const platform = jest.replaceProperty(Platform, 'OS', 'android');
    try {
      const { r, field } = dock();
      // Still the native hint, at the reader's size. At this size the full
      // words do not fit one line, so it is the short line; TalkBack keeps
      // the full words.
      expect(field.props.placeholder).toBe('Ask about the record');
      expect(field.props.accessibilityHint).toBe('Ask about the public record');
      expect(field.props.maxFontSizeMultiplier).toBeUndefined();
      expect(
        r.root.findAll((n) => n.props.testID === 'ask-placeholder'),
      ).toHaveLength(0);
      for (const icon of r.root.findAllByType(Icon))
        expect(icon.props.maxScale).toBe(1);
      act(() => r.unmount());
    } finally {
      platform.restore();
    }
  });

  test('with the keyboard up the whole composer stays within 40% of what is visible', () => {
    act(() =>
      Dimensions.set({
        window: { ...original, width: 402, height: 874, fontScale: 3.12 },
      }),
    );
    for (const keyboard of [336, 420, 500]) {
      const { r, style } = dock(keyboard);
      // The composer's own chrome before measurement: its padding.
      const chrome = 2 * rhythm.line;
      expect(Number(style.maxHeight) + chrome).toBeLessThanOrEqual(
        COMPOSER_HEIGHT_SHARE * (874 - keyboard) + 0.001,
      );
      act(() => r.unmount());
    }
    // The cap is the smaller rule, and never under one 44 pt line.
    expect(
      composerFieldCap({
        fontScale: 3.12,
        windowHeight: 874,
        keyboard: 500,
        chrome: 40,
      }),
      // 109.6 pt of room holds one whole AX line (68.64) and its paddings.
    ).toBeCloseTo(textStyles.body.lineHeight * 3.12 + 22);
    expect(
      composerFieldCap({
        fontScale: 3.12,
        windowHeight: 874,
        keyboard: 800,
        chrome: 40,
      }),
      // No room for even one line: still one whole line, never part of one.
    ).toBeCloseTo(textStyles.body.lineHeight * 3.12 + 22);
  });

  test('at Large nothing changes: five lines, then the field scrolls', () => {
    expect(
      composerFieldCap({ fontScale: 1, windowHeight: 874, chrome: 8 }),
    ).toBe(textStyles.body.lineHeight * 5 + 22);
    expect(
      composerFieldCap({
        fontScale: 1,
        windowHeight: 874,
        keyboard: 336,
        chrome: 8,
      }),
    ).toBe(textStyles.body.lineHeight * 5 + 22);
  });

  describe('whole lines at the small sizes, under the touch floor and on Android (review)', () => {
    const fieldOf = (r: ReactTestRenderer) =>
      r.root.find(
        (n) => n.props.testID === 'ask-question' && n.props.style !== undefined,
      );
    const wrapperOf = (r: ReactTestRenderer) =>
      r.root.find(
        (n) => typeof n.type === 'string' && n.props.testID === 'ask-field',
      );
    const report = (r: ReactTestRenderer, height: number) =>
      act(() =>
        fieldOf(r).props.onContentSizeChange({
          nativeEvent: { contentSize: { width: 300, height } },
        }),
      );

    test.each([
      ['xSmall', 0.823],
      ['Small', 0.882],
      ['Medium', 0.941],
    ])(
      '%s: lines are counted at the size they are drawn, below the default too',
      (_name, fontScale) => {
        const line = textStyles.body.lineHeight * fontScale;
        const fits = composerFieldCap({
          fontScale,
          windowHeight: 874,
          chrome: 16,
        });
        const over = composerFieldCap({
          fontScale,
          windowHeight: 874,
          chrome: 16,
          overflowing: true,
        });
        // Five of the reader's own lines, not five default-size lines.
        expect(fits).toBeCloseTo(5 * line + 2 * COMPOSER_FIELD_PADDING, 6);
        expect(over).toBeCloseTo(5 * line + COMPOSER_FIELD_PADDING, 6);
        expect(fits).toBeLessThan(
          5 * textStyles.body.lineHeight + 2 * COMPOSER_FIELD_PADDING,
        );
      },
    );

    test('a short window with the keyboard up: the text view is one whole line, and the field keeps 44 pt', () => {
      act(() =>
        Dimensions.set({
          window: { ...original, width: 402, height: 500, fontScale: 1 },
        }),
      );
      const { r } = dock(350);
      const line = textStyles.body.lineHeight;
      const flat = (node: { props: { style?: unknown } }) =>
        StyleSheet.flatten(node.props.style as never) as Record<
          string,
          number | undefined
        >;
      // Room for one line: the text view is that line and nothing else.
      // The padding and the 44 pt floor are the field's, around it.
      expect(flat(fieldOf(r)).maxHeight).toBe(line);
      expect(flat(fieldOf(r)).minHeight).toBeUndefined();
      expect(flat(fieldOf(r)).paddingTop).toBe(0);
      expect(flat(fieldOf(r)).paddingBottom).toBe(0);
      expect(flat(wrapperOf(r))).toMatchObject({
        minHeight: 44,
        paddingVertical: COMPOSER_FIELD_PADDING,
      });
      // A tap in the field's padding still reaches the text view.
      expect(fieldOf(r).props.hitSlop).toEqual({
        top: COMPOSER_FIELD_PADDING,
        bottom: 44,
      });
      // Three lines: nothing changes. One whole line shows, wherever the
      // caret puts the text.
      report(r, 3 * line);
      expect(flat(fieldOf(r)).maxHeight).toBe(line);
      expect(flat(wrapperOf(r)).minHeight).toBe(44);
      act(() => r.unmount());
    });

    test('Android: the same paddings, so the same whole lines, and a 48 dp floor', () => {
      act(() =>
        Dimensions.set({
          window: { ...original, width: 402, height: 874, fontScale: 1 },
        }),
      );
      const platform = jest.replaceProperty(Platform, 'OS', 'android');
      try {
        const { r } = dock(336);
        const line = textStyles.body.lineHeight;
        const flat = () =>
          StyleSheet.flatten(fieldOf(r).props.style) as Record<
            string,
            number | string | undefined
          >;
        // The field's padding is 11 above and below on Android too.
        expect(flat().paddingTop).toBe(COMPOSER_FIELD_PADDING);
        expect(flat().paddingBottom).toBe(COMPOSER_FIELD_PADDING);
        expect(flat().maxHeight).toBe(5 * line + 22);
        expect(flat().minHeight).toBe(48);
        expect(flat().textAlignVertical).toBe('top');
        expect(composerFieldFloor(1)).toBe(48);
        expect(composerFieldFloor(2)).toBe(2 * line + 22);
        // Six lines: five whole lines from the top padding down.
        report(r, 6 * line + 22);
        expect(flat().maxHeight).toBe(5 * line + COMPOSER_FIELD_PADDING);
        act(() => r.unmount());
      } finally {
        platform.restore();
      }
      expect(composerFieldFloor(1)).toBe(44);
    });
  });

  describe('the field never ends part way through a line (b80 sweep)', () => {
    const sizes: [string, number][] = [
      ['the default size', 1],
      ['xxxLarge', 1.353],
      ['AX3', 2.643],
      ['AX5', 3.571],
    ];
    const rooms = [
      { windowHeight: 874, keyboard: 0, chrome: 16 },
      { windowHeight: 874, keyboard: 336, chrome: 16 },
      { windowHeight: 874, keyboard: 336, chrome: 60 },
      { windowHeight: 667, keyboard: 291, chrome: 52 },
      { windowHeight: 560, keyboard: 300, chrome: 52 },
    ];
    test.each(sizes)(
      '%s: the cap is whole lines and the paddings, in every room',
      (_name, fontScale) => {
        const line = textStyles.body.lineHeight * Math.max(1, fontScale);
        for (const room of rooms) {
          const fits = composerFieldCap({ fontScale, ...room });
          const over = composerFieldCap({
            fontScale,
            ...room,
            overflowing: true,
          });
          // A draft that fits: n lines and the padding above and below.
          const lines = (fits - 2 * COMPOSER_FIELD_PADDING) / line;
          expect(lines).toBeCloseTo(Math.round(lines), 6);
          expect(Math.round(lines)).toBeGreaterThanOrEqual(1);
          expect(Math.round(lines)).toBeLessThanOrEqual(
            composerLines(fontScale),
          );
          // One that overflows: the same lines and one padding, so the top
          // of the draft shows the top padding and whole lines, and its
          // end whole lines and the bottom padding. It is not lifted to the
          // touch floor: the field around it keeps that.
          expect(over).toBeCloseTo(lines * line + COMPOSER_FIELD_PADDING, 6);
          // Within the 40% rule whenever one line fits it at all.
          const room40 =
            COMPOSER_HEIGHT_SHARE * (room.windowHeight - room.keyboard) -
            room.chrome;
          if (room40 >= line + 2 * COMPOSER_FIELD_PADDING)
            expect(fits).toBeLessThanOrEqual(room40 + 0.001);
        }
      },
    );

    // Build 82 sweep, AX3: the padding scrolled with the text, and UIKit
    // keeps the caret's line on the text view's bottom edge with no padding
    // under it, so typing past the cap showed three lines under an 11 pt
    // slice of the line above. The text view is now whole lines tall over
    // content that is whole lines: every place the caret can put it is a
    // line's edge.
    test.each([
      ['the default size', 1],
      ['AX3', 2.643],
      ['AX5', 3.571],
    ])(
      '%s (iOS): the text view is whole lines and nothing else, grows by whole lines to its cap and stays there past it; the padding is outside what scrolls',
      (_name, fontScale) => {
        act(() =>
          Dimensions.set({
            window: { ...original, width: 402, height: 874, fontScale },
          }),
        );
        const { r } = dock(336);
        const line = textStyles.body.lineHeight * fontScale;
        const flat = (id: string, host = false) =>
          StyleSheet.flatten(
            r.root.find(
              (n) =>
                n.props.testID === id &&
                n.props.style !== undefined &&
                (!host || typeof n.type === 'string'),
            ).props.style,
          ) as Record<string, number | undefined>;
        const input = () => flat('ask-question');
        const report = (lines: number) =>
          act(() =>
            r.root
              .find(
                (n) =>
                  n.props.testID === 'ask-question' &&
                  n.props.style !== undefined,
              )
              .props.onContentSizeChange({
                // The text view has no padding: its content is its lines.
                nativeEvent: {
                  contentSize: { width: 300, height: lines * line },
                },
              }),
          );
        // No padding inside the text view, and no floor that could lift
        // it off a whole number of lines: it grows with its lines.
        expect(input().paddingTop).toBe(0);
        expect(input().paddingBottom).toBe(0);
        expect(input().minHeight).toBeUndefined();
        expect(input().height).toBeUndefined();
        // The cap is whole lines: as many as the lines rule and the room
        // allow, never fewer than one.
        const cap = input().maxHeight!;
        const held = cap / line;
        expect(held).toBeCloseTo(Math.round(held), 6);
        expect(Math.round(held)).toBeGreaterThanOrEqual(1);
        expect(Math.round(held)).toBeLessThanOrEqual(composerLines(fontScale));
        // The padding is the field's own, around the text view, with the
        // touch floor: it never scrolls.
        expect(flat('ask-field', true)).toMatchObject({
          paddingVertical: COMPOSER_FIELD_PADDING,
          minHeight: 44,
        });
        // Line by line up to the cap, and past it: the cap never moves, so
        // the field ends on a line at the top, at the end and in between.
        for (const lines of [1, Math.round(held), Math.round(held) + 1, 12]) {
          report(lines);
          expect(input().maxHeight).toBe(cap);
          expect(input().paddingTop).toBe(0);
          expect(flat('ask-field', true).paddingVertical).toBe(
            COMPOSER_FIELD_PADDING,
          );
        }
        act(() => r.unmount());
      },
    );

    test.each([
      ['AX3', 2.643],
      ['AX5', 3.571],
    ])(
      '%s: the text cap is the field cap’s lines, less its paddings, in every room',
      (_name, fontScale) => {
        const line = textStyles.body.lineHeight * fontScale;
        for (const room of rooms) {
          const text = composerTextCap({ fontScale, ...room });
          expect(text / line).toBeCloseTo(Math.round(text / line), 6);
          expect(text).toBeCloseTo(
            composerFieldCap({ fontScale, ...room, overflowing: true }) -
              COMPOSER_FIELD_PADDING,
            6,
          );
        }
      },
    );
  });
});

test('with the keyboard up the composer sits on a band of ground: nothing reads through it', () => {
  let r!: ReactTestRenderer;
  const band = () =>
    StyleSheet.flatten(
      r.root.find(
        (n) =>
          n.props.testID === 'ask-phone-dock' && n.props.style !== undefined,
      ).props.style,
    );
  act(() => {
    r = create(
      <PhoneDock keyboard={300} ground="sunken">
        {null}
      </PhoneDock>,
    );
  });
  expect(band()).toMatchObject({
    backgroundColor: colors.sunken,
    paddingBottom: 300,
    paddingTop: rhythm.tight,
  });
  // On the tab bar it floats, as the glass composer does there.
  act(() =>
    r.update(
      <PhoneDock keyboard={0} ground="sunken">
        {null}
      </PhoneDock>,
    ),
  );
  expect(band().backgroundColor).toBeUndefined();
  act(() => r.unmount());
});

test('Android observes IME show/hide and removes the bottom inset after native resize; iOS keeps will-change events', async () => {
  const original = Platform.OS;
  const window = Dimensions.get('window');
  const measured: ((
    x: number,
    y: number,
    width: number,
    height: number,
  ) => void)[] = [];
  const visible = jest.spyOn(Keyboard, 'isVisible').mockReturnValue(true);
  const measure = jest
    .spyOn(View.prototype, 'measureInWindow')
    .mockImplementation((callback) => {
      measured.push(callback);
    });
  const handlers = new Map<string, (event: unknown) => void>();
  const listener = jest
    .spyOn(Keyboard, 'addListener')
    .mockImplementation((name, handler) => {
      handlers.set(name, handler as (event: unknown) => void);
      return { remove: jest.fn() };
    });
  try {
    Platform.OS = 'android';
    const screen = await mount();
    act(() => Dimensions.set({ window: { ...window, height: 500 } }));
    expect(handlers.has('keyboardDidShow')).toBe(true);
    expect(handlers.has('keyboardWillChangeFrame')).toBe(false);
    act(() =>
      handlers.get('keyboardDidShow')!({ endCoordinates: { screenY: 500 } }),
    );
    const phone = () => screen.root.findByType(PhoneDock);
    expect(phone().props).toMatchObject({ keyboard: 0, keyboardVisible: true });
    // The old container bottom still excludes the tab bar at DidShow. Even
    // when that asynchronous measure catches up, the inset stays at zero.
    act(() => measured.forEach((callback) => callback(0, 0, 402, 450)));
    expect(phone().props.keyboard).toBe(0);
    act(() => handlers.get('keyboardDidHide')!({}));
    // A native measure that arrives after IME Back must not lift the dock again.
    visible.mockReturnValue(false);
    act(() => measured.forEach((callback) => callback(0, 0, 402, 900)));
    expect(phone().props).toMatchObject({
      keyboard: 0,
      keyboardVisible: false,
    });
    act(() => screen.unmount());
    view = null;
    handlers.clear();
    Platform.OS = 'ios';
    await mount();
    expect(handlers.has('keyboardWillChangeFrame')).toBe(true);
    expect(handlers.has('keyboardWillHide')).toBe(true);
    expect(handlers.has('keyboardDidShow')).toBe(false);
  } finally {
    listener.mockRestore();
    visible.mockRestore();
    measure.mockRestore();
    act(() => Dimensions.set({ window }));
    Platform.OS = original;
  }
});

test.each(
  (['android', 'ios'] as const).flatMap((platform) =>
    [1, 2].map((fontScale) => [platform, fontScale] as const),
  ),
)(
  '%s font %s: Ask headings clear their groups at large text sizes, on both platforms',
  async (platform, fontScale) => {
    const original = Platform.OS;
    const window = Dimensions.get('window');
    try {
      Platform.OS = platform;
      act(() => Dimensions.set({ window: { ...window, fontScale } }));
      const screen = await mount();
      const idle = screen.root.findByType(AskIdle);
      const heading = idle.findAllByType(SectionHeader)[0];
      const parent = heading.parent!;
      const gap = StyleSheet.flatten(parent.props.style)?.gap ?? 0;
      // At accessibility sizes the stacked heading takes back part of its
      // parent's gap. With no gap the card covers the foot of "Try asking"
      // (seen on iOS at AX3, build 78 sweep), so both platforms give it.
      if (fontScale === 2) {
        expect(gap).toBe(rhythm.block);
        const header = heading.findByType(View);
        const margin = StyleSheet.flatten(header.props.style).marginBottom ?? 0;
        expect(Number(gap) + Number(margin)).toBeGreaterThanOrEqual(
          rhythm.heading,
        );
      } else {
        expect(parent.props.style).toBeUndefined();
      }
    } finally {
      // Audit the mounted tree on its own platform before restoring dimensions
      // can rerender its controls using the next platform's target sizes.
      act(() => view?.unmount());
      view = null;
      Platform.OS = original;
      act(() => Dimensions.set({ window }));
    }
  },
);

test('Android dock has a tonal raised surface and removable option chips; iOS keeps its options line', () => {
  const original = Platform.OS;
  let dock!: ReactTestRenderer;
  try {
    Platform.OS = 'android';
    act(() => {
      askSession.options({
        ...askSession.composerOptions(),
        topic: 'housing',
        from: '2024',
        to: '2025',
      });
      dock = create(
        <AskDock
          onSend={() => {}}
          onStop={() => {}}
          onOptions={() => {}}
          offline={false}
        />,
      );
    });
    const surfaces = dock.root.findAll(
      (n) =>
        n.props.style && StyleSheet.flatten(n.props.style)?.elevation === 2,
    );
    expect(surfaces.length).toBeGreaterThan(0);
    const inputStyle = () =>
      StyleSheet.flatten(dock.root.findByType(TextInput).props.style);
    expect(inputStyle().minHeight).toBeGreaterThanOrEqual(48);
    expect(inputStyle().textAlignVertical).toBe('top');
    const remove = dock.root.find(
      (n) =>
        n.props.testID === 'ask-option-remove-years' &&
        typeof n.props.onPress === 'function',
    );
    expect(remove.props.accessibilityLabel).toBe('Remove Years, 2024 to 2025');
    act(() => remove.props.onPress());
    expect(askSession.composerOptions()).toMatchObject({
      from: '',
      to: '',
      topic: 'housing',
    });
    expect(
      dock.root.findAllByProps({ testID: 'ask-options-line' }).length,
    ).toBeGreaterThan(0);
    const clear = dock.root.find(
      (n) =>
        n.props.testID === 'ask-options-clear' &&
        typeof n.props.onPress === 'function',
    );
    expect(StyleSheet.flatten(clear.props.style).minHeight).toBe(48);
    act(() => clear.props.onPress());
    expect(askSession.composerOptions().topic).toBe('');
    expect(
      dock.root.findAllByProps({ testID: 'ask-options-line' }),
    ).toHaveLength(0);
    act(() =>
      askSession.options({ ...askSession.composerOptions(), topic: 'housing' }),
    );
    Platform.OS = 'ios';
    act(() =>
      dock.update(
        <AskDock
          onSend={() => {}}
          onStop={() => {}}
          onOptions={() => {}}
          offline={false}
        />,
      ),
    );
    expect(
      dock.root.findAllByProps({ testID: 'ask-option-remove-topic' }),
    ).toHaveLength(0);
    // iOS: the 44 pt floor is the padded field's, around a bare text view.
    expect(inputStyle().minHeight).toBeUndefined();
    expect(inputStyle().paddingTop).toBe(0);
    expect(
      StyleSheet.flatten(
        dock.root.find(
          (n) => typeof n.type === 'string' && n.props.testID === 'ask-field',
        ).props.style,
      ),
    ).toMatchObject({ minHeight: 44, paddingVertical: 11 });
    expect(inputStyle().textAlignVertical).toBeUndefined();
    expect(
      dock.root.findAllByProps({ testID: 'ask-options-line' }).length,
    ).toBeGreaterThan(0);
    expect(
      dock.root.findAll(
        (n) =>
          n.props.style && StyleSheet.flatten(n.props.style)?.elevation === 2,
      ),
    ).toHaveLength(0);
  } finally {
    act(() => dock?.unmount());
    Platform.OS = original;
  }
});

test('while an answer runs, Options and Clear are unavailable; an arrival waiting brings them back', async () => {
  let finish: (v: unknown) => void = () => {};
  jest.mocked(client.askPost).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  await mount();
  act(() =>
    askSession.options({ ...askSession.snapshot().options, kind: 'speech' }),
  );
  await type('A running question?');
  await press('ask-submit');
  const disabled = (id: string) =>
    view!.root.findAll(
      (n) =>
        n.props.testID === id && n.props.accessibilityState?.disabled === true,
    ).length > 0;
  expect(askSession.snapshot().busy).toBe(true);
  expect(disabled('ask-composer-options')).toBe(true);
  expect(disabled('ask-options-line')).toBe(true);
  expect(disabled('ask-options-clear')).toBe(true);
  await act(async () =>
    arriveInAsk({ question: 'A waiting fixture question?', kind: 'speech' }),
  );
  expect(disabled('ask-composer-options')).toBe(false);
  expect(disabled('ask-options-clear')).toBe(false);
  await act(async () => finish(answer));
});

// Build 61 on an unfolded iPhone Duo drew Try asking and Conversations in
// both panes, each with its own starter set (13 Nov, Jake's screenshots).
test.each([
  ['unfolded Duo, landscape beside the rail', 880, 669, true],
  ['unfolded Duo, portrait over the floating tab bar', 669, 951, false],
] as const)(
  '%s: one Try asking and one Conversations list across the panes',
  async (_name, width, height, docked) => {
    const window = Dimensions.get('window');
    const now = jest
      .spyOn(Date, 'now')
      .mockReturnValue(Date.parse('2026-11-13T04:00:00Z'));
    jest.mocked(chatsSnapshot).mockImplementation(() => oneChat);
    mockRealPane = true;
    act(() => {
      Dimensions.set({ window: { ...window, width, height } });
      setWindowTraitsOverride({
        horizontal: 'regular',
        vertical: 'regular',
        foldable: true,
        verticalBars: docked,
      });
      resetAdaptiveDeviceForTests();
    });
    try {
      await mount();
      expect(view!.root.findByType(AskColumns).props.docked).toBe(docked);
      const hostIds = (id: string) =>
        view!.root.findAll(
          (n) => typeof n.type === 'string' && n.props.testID === id,
        );
      const starterLists =
        hostIds('ask-starters').length + hostIds('ask-pane-starters').length;
      const conversationLists =
        hostIds('ask-conversations').length +
        hostIds('ask-pane-conversations').length;
      expect(starterLists).toBe(1);
      expect(conversationLists).toBe(1);
      // Docked, the pane is the detail side: the day's starters; the
      // conversations stay in the column with the composer.
      expect(hostIds('ask-pane-starters')).toHaveLength(docked ? 1 : 0);
      expect(hostIds('ask-conversations')).toHaveLength(1);
      expect(hostIds('ask-pane-idle-list')).toHaveLength(docked ? 1 : 0);
      const prefix = docked ? 'ask-pane' : 'ask';
      // One starter on every layout, phone and docked pane alike.
      const shown = [a11y(`${prefix}-starter-0`, 'accessibilityLabel')];
      expect(shown).toEqual(startersFor(Date.parse('2026-11-13T04:00:00Z'), 1));
      expect(byId(`${prefix}-starter-1`).length).toBe(0);
      // A regular iPhone keeps the large title at idle, as its Bills does.
      expect(mockBar.options.headerLargeTitleEnabled).toBe(true);
    } finally {
      await act(async () => {
        view?.unmount();
        view = null;
        Dimensions.set({ window });
        setWindowTraitsOverride(undefined);
        resetAdaptiveDeviceForTests();
      });
      mockRealPane = false;
      now.mockRestore();
    }
  },
);

test('a shorter starter list is the same day’s set, never a different one', () => {
  const day = Date.parse('2026-11-13T04:00:00Z');
  const four = startersFor(day, 4);
  for (const count of [1, 2, 3])
    expect(startersFor(day, count)).toEqual(four.slice(0, count));
});

// Duo audit A5-5 / 7a: on the folded display (402 x 678) at AX5 the resting
// composer and the tab bar took the lower third and covered Try asking; a
// tap on a starter seen through the band's clear edge focused the composer.
describe('the idle page at accessibility sizes', () => {
  const native = (id: string) =>
    view!.root.find(
      (node) => typeof node.type === 'string' && node.props.testID === id,
    );
  const COLUMN = 678;
  const AREA = COLUMN - 34; // layOut()'s default: less the home indicator's inset.
  const COMPOSER = 120;
  async function layOut(columnHeight = COLUMN) {
    const areaHeight = columnHeight - 34;
    await act(async () => {
      native('ask-conversation-column').props.onLayout({
        nativeEvent: {
          layout: { x: 0, y: 0, width: 402, height: columnHeight },
        },
      });
      native('ask-composer-bounds').props.onLayout({
        nativeEvent: { layout: { x: 0, y: 0, width: 402, height: areaHeight } },
      });
      native('ask-composer-position').props.onLayout({
        nativeEvent: {
          layout: {
            x: 0,
            y: areaHeight - COMPOSER,
            width: 402,
            height: COMPOSER,
          },
        },
      });
      view!.root.findByType(AskDock).props.onLayout({
        nativeEvent: {
          layout: { x: 0, y: 0, width: 402, height: COMPOSER - 16 },
        },
      });
    });
  }
  const scrollStyle = () =>
    StyleSheet.flatten(view!.root.findByType(ScrollView).props.style);
  const contentStyle = () =>
    StyleSheet.flatten(
      view!.root.findByType(ScrollView).props.contentContainerStyle,
    );
  async function at(fontScale: number, height = COLUMN) {
    const platform = jest.replaceProperty(Platform, 'OS', 'ios');
    const window = Dimensions.get('window');
    act(() =>
      Dimensions.set({
        window: { ...window, width: 402, height, fontScale },
      }),
    );
    return () => {
      act(() => Dimensions.set({ window }));
      platform.restore();
    };
  }

  test.each([
    ['AX3 Duo', 2.643, COLUMN],
    ['AX5 Duo', 3.571, COLUMN],
    ['AX3 phone', 2.643, 874],
    ['AX5 phone', 3.571, 874],
  ])(
    '%s: the page ends at the resting composer, so every starter in view takes its tap',
    async (_size, fontScale, height) => {
      const restore = await at(fontScale, height);
      try {
        await mount();
        await layOut(height);
        // The scroll view stops where the composer's band starts.
        const restTop = height - 34 - COMPOSER;
        expect(scrollStyle().marginBottom).toBe(height - restTop);
        expect(contentStyle().paddingBottom).toBe(rhythm.section);
        // A starter in that view asks; it does not focus the composer.
        const focus = jest.mocked(TextInput.prototype.focus);
        focus.mockClear();
        jest.mocked(client.askPost).mockReturnValue(new Promise(() => {}));
        const starter = byId('ask-starter-0').find(
          (node) => typeof node.props.onPress === 'function',
        )!;
        await act(async () => starter.props.onPress());
        expect(focus).not.toHaveBeenCalled();
        expect(client.askPost).toHaveBeenCalled();
      } finally {
        restore();
      }
    },
  );

  test('at the default size the glass composer still floats over the page', async () => {
    const restore = await at(1);
    try {
      await mount();
      await layOut();
      expect(scrollStyle().marginBottom).toBeUndefined();
      expect(contentStyle().paddingBottom).toBeGreaterThan(rhythm.section);
    } finally {
      restore();
    }
  });

  test('Android at 200%: the idle inset drops to zero on IME show and returns on hide', async () => {
    const platform = jest.replaceProperty(Platform, 'OS', 'android');
    const window = Dimensions.get('window');
    const handlers = new Map<string, (event: unknown) => void>();
    const listener = jest
      .spyOn(Keyboard, 'addListener')
      .mockImplementation((name, handler) => {
        handlers.set(name, handler as (event: unknown) => void);
        return { remove: jest.fn() };
      });
    const visible = jest.spyOn(Keyboard, 'isVisible').mockReturnValue(false);
    try {
      act(() =>
        Dimensions.set({
          window: { ...window, width: 402, height: COLUMN, fontScale: 2 },
        }),
      );
      await mount();
      await layOut();
      const inset = COLUMN - (AREA - COMPOSER);
      expect(scrollStyle().marginBottom).toBe(inset);
      visible.mockReturnValue(true);
      act(() =>
        handlers.get('keyboardDidShow')!({ endCoordinates: { screenY: 400 } }),
      );
      expect(scrollStyle().marginBottom ?? 0).toBe(0);
      expect(view!.root.findByType(PhoneDock).props.keyboardVisible).toBe(true);
      visible.mockReturnValue(false);
      act(() => handlers.get('keyboardDidHide')!({}));
      expect(scrollStyle().marginBottom).toBe(inset);
    } finally {
      listener.mockRestore();
      visible.mockRestore();
      act(() => Dimensions.set({ window }));
      platform.restore();
    }
  });

  test.each([
    ['phone Large', 1, false],
    ['phone AX3', 2.643, false],
    ['phone AX5', 3.571, false],
    ['undocked iPad Large', 1, true],
    ['undocked iPad AX5', 3.571, true],
  ] as const)(
    'a resting conversation on %s ends above the composer, hiding the stamp below it',
    async (_device, fontScale, pad) => {
      const restore = await at(fontScale);
      const idiom = jest.spyOn(Platform, 'isPad', 'get').mockReturnValue(pad);
      const handlers = new Map<string, Set<(event: unknown) => void>>();
      const listener = jest
        .spyOn(Keyboard, 'addListener')
        .mockImplementation((name, handler) => {
          const callbacks = handlers.get(name) ?? new Set();
          callbacks.add(handler as (event: unknown) => void);
          handlers.set(name, callbacks);
          return { remove: () => callbacks.delete(handler) };
        });
      const measure = jest
        .spyOn(View.prototype, 'measureInWindow')
        .mockImplementation((callback) => callback(0, 0, 402, COLUMN));
      try {
        jest.spyOn(askSession, 'snapshot').mockReturnValue({
          ...askSession.snapshot(),
          thread: oneChat.chats[0]!.thread,
        });
        await mount();
        await layOut();
        expect(view!.root.findByType(AskColumns).props.docked).toBe(false);
        expect(scrollStyle().marginBottom).toBe(COLUMN - (AREA - COMPOSER));
        expect(contentStyle().paddingBottom).toBe(rhythm.section);
        act(() =>
          handlers.get('keyboardWillChangeFrame')!.forEach((handler) =>
            handler({
              endCoordinates: {
                screenY: 400,
                width: 402,
                height: Dimensions.get('screen').height - 400,
              },
            }),
          ),
        );
        expect(scrollStyle().marginBottom ?? 0).toBe(0);
        expect(view!.root.findByType(PhoneDock).props.keyboardVisible).toBe(
          true,
        );
        expect(contentStyle().paddingBottom).toBeGreaterThan(rhythm.section);
        act(() =>
          handlers.get('keyboardWillHide')!.forEach((handler) => handler({})),
        );
        expect(scrollStyle().marginBottom).toBe(COLUMN - (AREA - COMPOSER));
      } finally {
        jest.mocked(askSession.snapshot).mockRestore();
        listener.mockRestore();
        measure.mockRestore();
        idiom.mockRestore();
        restore();
      }
    },
  );
});

test.each([
  ['phone', 'unspecified', 393, 852, false],
  ['Duo outer', 'trailing', 402, 678, false],
  ['vertical iPad bar', 'leading', 402, 678, true],
] as const)(
  'AX5 %s: Ask keeps the soft edge and fades into its ground from the first scroll point, clear again at rest',
  async (_device, edge, width, height, pad) => {
    const window = Dimensions.get('window');
    const barEdge = jest
      .spyOn(RootBar, 'useVerticalBarEdge')
      .mockReturnValue(edge);
    act(() =>
      Dimensions.set({
        window: { ...window, width, height, fontScale: 3.571 },
      }),
    );
    const version = Object.getOwnPropertyDescriptor(Platform, 'Version')!;
    Object.defineProperty(Platform, 'Version', {
      configurable: true,
      value: 26,
    });
    const platform = jest.replaceProperty(Platform, 'OS', 'ios');
    const idiom = jest.spyOn(Platform, 'isPad', 'get').mockReturnValue(pad);
    const appearance = jest.spyOn(BarAppearance, 'useRootBarAppearance');
    const route = { key: 'ask-root', name: 'ask' };
    const navigation = {
      setOptions: jest.fn((options) => {
        mockBar.options = { ...mockBar.options, ...options };
      }),
      getState: () => ({
        index: pushedAsk ? 1 : 0,
        routes: pushedAsk
          ? [{ key: 'today-root', name: 'index' }, route]
          : [route],
        routeNames: ['ask', 'bill/[key]', 'explore/[tool]'],
      }),
      isFocused: () => true,
      addListener: () => () => {},
    };
    let pushedAsk = false;
    const edges = () =>
      navigation.setOptions.mock.calls
        .map(([options]) => options.scrollEdgeEffects?.top)
        .filter(Boolean);
    const page = (height: number) => (
      <NavigationContext.Provider value={navigation as never}>
        <NavigationRouteContext.Provider value={route}>
          <HeaderHeightContext.Provider value={height}>
            <AskScreen />
          </HeaderHeightContext.Provider>
        </NavigationRouteContext.Provider>
      </NavigationContext.Provider>
    );
    const scrollTo = (y: number) =>
      act(() =>
        view!.root.findByType(ScrollView).props.onScroll({
          nativeEvent: { contentOffset: { y } },
        }),
      );
    try {
      await mount(page(120));
      expect(appearance.mock.calls.length).toBeGreaterThan(0);
      expect(
        appearance.mock.calls.every(
          ([, options]) => options?.owner === 'options',
        ),
      ).toBe(true);
      expect(edges().at(-1)).toBe('soft');
      navigation.setOptions.mockClear();
      scrollTo(-120);
      scrollTo(-121); // Pulling down is still at rest.
      expect(edges()).toEqual([]);
      // One fade layer under the clear bar, mounted with the page; its
      // opacity follows the scroll on the UI thread.
      expect(byId('bar-fade').length).toBeGreaterThan(0);
      scrollTo(-118); // Before UIKit reports a collapsed header.
      // No panel: the edge never turns hard. The page fades into its own
      // ground behind the title and the bar buttons instead.
      expect(edges()).not.toContain('hard');
      expect(byId('bar-fade').length).toBeGreaterThan(0);
      scrollTo(0);
      await act(async () =>
        view!.update(
          withNavigationOptions(page(68), (options) => {
            mockBar.options = options;
          }),
        ),
      );
      scrollTo(400);
      expect(edges()).not.toContain('hard');
      expect(byId('bar-fade').length).toBeGreaterThan(0);
      scrollTo(-68);
      expect(byId('bar-fade').length).toBeGreaterThan(0);

      openSavedConversation();
      scrollTo(400);
      expect(edges()).not.toContain('hard');
      expect(byId('bar-fade').length).toBeGreaterThan(0);
      // An open thread on an iPhone: UIKit still reports the large-title
      // band in the bar's height. Ask tells the fade how much of it is
      // hidden, so the fade ends at the bar on screen (it covered the
      // question at rest). No band beside a vertical bar or on iPad.
      await act(async () =>
        view!.update(
          withNavigationOptions(page(200), (options) => {
            mockBar.options = options;
          }),
        ),
      );
      const hidden = view!.root.findByType(BarFade).props.hidden as number;
      expect(hidden > 0).toBe(edge === 'unspecified' && !pad);
      // The thread rests its question just under the compact bar, inside
      // the band UIKit's soft edge blurs: on iOS 27.2 the question was
      // blurred and greyed at rest (build 87). An open thread hides the
      // native top edge, so its own fade is the only one: clear at rest,
      // and its ground whole to the foot of the bar's buttons once scrolled.
      expect(edges().at(-1)).toBe('hidden');
      expect(view!.root.findByType(BarFade).props.cover).toBe(16);
      // The fade ends there, so a pinned follow-up is whole below it.
      expect(view!.root.findByType(BarFade).props.tail).toBe(0);
      scrollTo(-68);
      expect(edges().at(-1)).toBe('hidden');
      await act(async () =>
        view!.update(
          withNavigationOptions(page(68), (options) => {
            mockBar.options = options;
          }),
        ),
      );
      await act(async () => barButton('New question')!.onPress());
      // scrollToTop is mocked and emits no event. Idle must already be soft.
      expect(byId('ask-idle').length).toBeGreaterThan(0);
      expect(edges()).not.toContain('hard');
      // Back on the idle page the native soft edge returns.
      expect(edges().at(-1)).toBe('soft');
      await act(async () =>
        view!.update(
          withNavigationOptions(page(120), (options) => {
            mockBar.options = options;
          }),
        ),
      );
      // A new header height must not re-read the previous thread's offset.
      expect(edges()).not.toContain('hard');

      // Ask pushed in another tab (a link, a keyboard shortcut) sits below
      // an opaque bar with its content at 0: no fade over the page's top.
      expect(byId('bar-fade').length).toBeGreaterThan(0);
      pushedAsk = true;
      scrollTo(0);
      scrollTo(400);
      expect(byId('bar-fade')).toHaveLength(0);
    } finally {
      await act(async () => {
        view?.unmount();
        view = null;
      });
      idiom.mockRestore();
      appearance.mockRestore();
      barEdge.mockRestore();
      act(() => Dimensions.set({ window }));
      platform.restore();
      Object.defineProperty(Platform, 'Version', version);
    }
  },
);

// Sweep 3, item 5: docked with nothing asked and nothing saved, the
// conversation column was one grey line over empty paper (iPad, build 63).
describe('the docked conversation column with nothing asked', () => {
  const hosts = (id: string) =>
    view!.root.findAll(
      (n) => typeof n.type === 'string' && n.props.testID === id,
    );
  const said = (id: string) => hosts(id).map((n) => String(n.props.children));
  async function at(
    width: number,
    height: number,
    traits: Parameters<typeof setWindowTraitsOverride>[0],
    pad: boolean,
    run: () => Promise<void>,
  ) {
    const window = Dimensions.get('window');
    const idiom = jest.spyOn(Platform, 'isPad', 'get').mockReturnValue(pad);
    act(() => {
      Dimensions.set({ window: { ...window, width, height } });
      setWindowTraitsOverride(traits);
      resetAdaptiveDeviceForTests();
    });
    try {
      await run();
    } finally {
      await act(async () => {
        view?.unmount();
        view = null;
        Dimensions.set({ window });
        setWindowTraitsOverride(undefined);
        resetAdaptiveDeviceForTests();
      });
      idiom.mockRestore();
    }
  }
  /**
   * The column, the room the empty state is given above a composer band of
   * `band` points (keyboard included), and the words' own measured height.
   */
  async function layOut(column: number, band: number, wordsHeight: number) {
    const event = (height: number, y = 0) => ({
      nativeEvent: { layout: { x: 0, y, width: 500, height } },
    });
    await act(async () => {
      hosts('ask-conversation-column')[0]!.props.onLayout(event(column));
      hosts('ask-composer-bounds')[0]!.props.onLayout(event(column));
      hosts('ask-composer-position')[0]!.props.onLayout(
        event(Math.min(band, 90), column - band),
      );
      hosts('ask-empty')[0]?.props.onLayout(event(column - band));
      hosts('ask-empty-words')[0]?.props.onLayout(event(wordsHeight));
    });
  }
  const pad = { horizontal: 'regular', vertical: 'regular' } as const;
  const duo = { ...pad, foldable: true } as const;

  test.each([
    ['iPad, portrait', 834, 1194, pad, true],
    ['iPad, landscape', 1194, 834, pad, true],
    [
      'unfolded Duo, landscape',
      880,
      669,
      { ...duo, verticalBars: true },
      false,
    ],
  ] as const)(
    '%s: the mark, the line and one more sentence, centred between the bar and the composer',
    async (_name, width, height, traits, isPad) => {
      await at(width, height, traits, isPad, async () => {
        await mount();
        expect(view!.root.findByType(AskColumns).props.docked).toBe(true);
        await layOut(height, 90, 60);
        const empty = hosts('ask-empty');
        expect(empty).toHaveLength(1);
        // The mark as an engraving at 96 pt, decorative.
        const mark = view!.root.findByType(EngravedMark);
        expect(mark.props.size).toBe(96);
        expect(hosts('ask-empty-mark')[0]!.props).toMatchObject({
          accessible: false,
          accessibilityElementsHidden: true,
        });
        // The existing line, once (not also top-left), then the sentence.
        expect(said('ask-idle-line')).toEqual([idleCopy.line]);
        expect(said('ask-empty-own')).toEqual([
          'Ask in your own words. Every answer lists the records it used.',
        ]);
        expect(
          hosts('ask-empty-words')[0]!.props.accessibilityElementsHidden,
        ).toBe(false);
        // No control, and no touches taken from the column under it.
        expect(empty[0]!.props.pointerEvents).toBe('none');
        expect(
          empty[0]!.findAll((n) => typeof n.props.onPress === 'function'),
        ).toHaveLength(0);
        // Centred in the room AskColumns gives it: from the column's top
        // (less the bar, its own top padding) to the composer band's top.
        expect(
          StyleSheet.flatten(hosts('ask-empty-area')[0]!.props.style),
        ).toMatchObject({ position: 'absolute', top: 0, bottom: 90 });
        const style = StyleSheet.flatten(empty[0]!.props.style);
        expect(style).toMatchObject({
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
        });
        expect(style.paddingTop).toBeGreaterThan(0);
        // The scroll view is still the column's first child.
        const first = hosts('ask-conversation-column')[0]!
          .children[0] as ReactTestInstance;
        expect(
          first.findAllByType(ScrollView).length +
            Number(first.type === ScrollView),
        ).toBeGreaterThan(0);
      });
    },
  );

  // Review P2: at AX5, or with the keyboard up in iPad landscape, the mark
  // (144 pt) and two sentences do not fit; they spilled under the bar and
  // the composer.
  test('AX5 with the keyboard up: the mark goes when it does not fit, and the whole state when the words do not', async () => {
    const window = Dimensions.get('window');
    try {
      await at(1194, 834, pad, true, async () => {
        act(() =>
          Dimensions.set({
            window: { ...Dimensions.get('window'), fontScale: 3.12 },
          }),
        );
        await mount();
        // Nothing measured yet: nothing drawn that could spill.
        expect(hosts('ask-empty-mark')).toHaveLength(0);
        expect(
          StyleSheet.flatten(hosts('ask-empty-words')[0]!.props.style).opacity,
        ).toBe(0);
        // Keyboard down: 834 less the bar and a 90 pt composer. The words
        // (300 pt at AX5) and the mark (144 + 24) both fit.
        await layOut(834, 90, 300);
        expect(hosts('ask-empty-mark')).toHaveLength(1);
        // Keyboard up (the area shrinks): the words fit, the mark does not.
        await layOut(834, 90 + 330, 300);
        expect(hosts('ask-empty-mark')).toHaveLength(0);
        expect(said('ask-idle-line')).toEqual([idleCopy.line]);
        expect(
          StyleSheet.flatten(hosts('ask-empty-words')[0]!.props.style).opacity,
        ).not.toBe(0);
        // Less room than the words need: the state draws nothing, VoiceOver
        // skips it, and the line is back in the scrolling page, once.
        await layOut(834, 90 + 420, 300);
        expect(hosts('ask-empty-mark')).toHaveLength(0);
        expect(
          StyleSheet.flatten(hosts('ask-empty-words')[0]!.props.style).opacity,
        ).toBe(0);
        expect(hosts('ask-empty-words')[0]!.props).toMatchObject({
          accessibilityElementsHidden: true,
          importantForAccessibility: 'no-hide-descendants',
        });
        expect(said('ask-idle-line')).toEqual([idleCopy.line]);
        expect(
          hosts('ask-idle')[0]!.findAll(
            (n) => n.props.testID === 'ask-idle-line',
          ).length,
        ).toBeGreaterThan(0);
        // Room again: centred again, and still said once.
        await layOut(834, 90, 300);
        expect(hosts('ask-empty-mark')).toHaveLength(1);
        expect(said('ask-idle-line')).toEqual([idleCopy.line]);
        expect(
          hosts('ask-idle')[0]!.findAll(
            (n) => n.props.testID === 'ask-idle-line',
          ),
        ).toHaveLength(0);
      });
    } finally {
      act(() => Dimensions.set({ window }));
    }
  });

  test('a shown mark goes as soon as it no longer fits: half a point short hides it, so it never overruns its room', async () => {
    // A first measurement shows the mark exactly when it fits, so fresh
    // mounts find the tallest words (to half a point) it still fits beside.
    const fitsFresh = async (words: number) => {
      let shown = false;
      await at(1194, 834, pad, true, async () => {
        await mount();
        await layOut(834, 90, words);
        shown = hosts('ask-empty-mark').length > 0;
      });
      return shown;
    };
    let fits = 100;
    let over = 744;
    expect(await fitsFresh(fits)).toBe(true);
    expect(await fitsFresh(over)).toBe(false);
    while (over - fits > 0.5) {
      const mid = Math.round(fits + over) / 2;
      if (await fitsFresh(mid)) fits = mid;
      else over = mid;
    }
    expect(over - fits).toBe(0.5);
    await at(1194, 834, pad, true, async () => {
      await mount();
      const markShown = () => hosts('ask-empty-mark').length > 0;
      // It just fits: shown.
      await layOut(834, 90, fits);
      expect(markShown()).toBe(true);
      // Half a point more and it does not: hidden at once.
      await layOut(834, 90, over);
      expect(markShown()).toBe(false);
      // Back to a bare fit is not room to spare: it stays hidden.
      await layOut(834, 90, fits);
      expect(markShown()).toBe(false);
      // A point to spare brings it back.
      await layOut(834, 90, fits - 1);
      expect(markShown()).toBe(true);
    });
  });

  test('the mark holds within a point of its threshold: heights half a point apart there change it once, not every time', async () => {
    await at(1194, 834, pad, true, async () => {
      await mount();
      const markShown = () => hosts('ask-empty-mark').length > 0;
      // Plenty of room: the mark is shown.
      await layOut(834, 90, 100);
      expect(markShown()).toBe(true);
      // Grow the words until the mark goes: coarsely, then by half points.
      let words = 100;
      while (markShown() && words < 900) {
        words += 16;
        await layOut(834, 90, words);
      }
      expect(markShown()).toBe(false);
      words -= 16;
      // Well clear of the threshold again, it comes back.
      await layOut(834, 90, words - 16);
      expect(markShown()).toBe(true);
      while (markShown() && words < 900) {
        words += 0.5;
        await layOut(834, 90, words);
      }
      expect(markShown()).toBe(false);
      // The words now measure half a point shorter, then taller, and so on,
      // as recentring them does. The mark stays as it is.
      const seen: boolean[] = [];
      for (let i = 0; i < 8; i += 1) {
        await layOut(834, 90, words - (i % 2 === 0 ? 0.5 : 0));
        seen.push(markShown());
      }
      expect(seen).toEqual(Array(8).fill(false));
      // A real change, well past the threshold, still brings it back.
      await layOut(834, 90, words - 4);
      expect(markShown()).toBe(true);
    });
  });

  test('saved conversations that could not be read: the error stands alone, with the line, and no centred state', async () => {
    jest.mocked(loadChats).mockRejectedValueOnce(new Error('disk'));
    await at(834, 1194, pad, true, async () => {
      await mount();
      expect(hosts('ask-conversations-failed').length).toBeGreaterThan(0);
      expect(hosts('ask-empty')).toHaveLength(0);
      expect(said('ask-idle-line')).toEqual([idleCopy.line]);
    });
  });

  test('unfolded Duo, portrait (669 by 951) is one pane: the starters fill it and there is no empty state', async () => {
    await at(669, 951, { ...duo, verticalBars: false }, false, async () => {
      await mount();
      expect(view!.root.findByType(AskColumns).props.docked).toBe(false);
      expect(hosts('ask-empty')).toHaveLength(0);
      expect(said('ask-idle-line')).toEqual([idleCopy.line]);
      expect(hosts('ask-starters')).toHaveLength(1);
    });
  });

  test('the phone is unchanged: the line over Try asking, no mark', async () => {
    await mount();
    expect(hosts('ask-empty')).toHaveLength(0);
    expect(view!.root.findAllByType(EngravedMark)).toHaveLength(0);
    expect(said('ask-idle-line')).toEqual([idleCopy.line]);
    expect(hosts('ask-starters')).toHaveLength(1);
  });

  test('with a saved conversation the column has its list, and the line stays top-left', async () => {
    jest.mocked(chatsSnapshot).mockImplementation(() => oneChat);
    await at(834, 1194, pad, true, async () => {
      await mount();
      expect(hosts('ask-empty')).toHaveLength(0);
      expect(said('ask-idle-line')).toEqual([idleCopy.line]);
      expect(hosts('ask-conversations')).toHaveLength(1);
    });
  });

  test.each([
    ['fades out as the first question is sent', false],
    ['goes at once under Reduce Motion', true],
  ] as const)('it %s', async (_name, reduced) => {
    const reduce = jest
      .spyOn(accessibility, 'useReduceMotion')
      .mockReturnValue(reduced);
    const base = askSession.snapshot();
    const snapshot = jest.spyOn(askSession, 'snapshot').mockReturnValue(base);
    try {
      await at(834, 1194, pad, true, async () => {
        await mount();
        expect(hosts('ask-empty')).toHaveLength(1);
        jest.useFakeTimers();
        try {
          snapshot.mockReturnValue({ ...base, busy: true });
          await act(async () => {
            view!.update(
              withNavigationOptions(<AskScreen />, (options) => {
                mockBar.options = options;
              }),
            );
          });
          // Leaving, it is still drawn (fading) but no longer read out.
          expect(hosts('ask-empty')).toHaveLength(reduced ? 0 : 1);
          if (!reduced)
            expect(hosts('ask-empty')[0]!.props).toMatchObject({
              accessibilityElementsHidden: true,
              importantForAccessibility: 'no-hide-descendants',
            });
          await act(async () => {
            jest.advanceTimersByTime(1000);
          });
          expect(hosts('ask-empty')).toHaveLength(0);
        } finally {
          jest.useRealTimers();
        }
      });
    } finally {
      snapshot.mockRestore();
      reduce.mockRestore();
    }
  });
});
