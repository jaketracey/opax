import { withNavigationOptions } from './navigation-options';
import { useState } from 'react';
import { HeaderHeightContext } from 'expo-router/react-navigation';
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
  Dimensions,
  InteractionManager,
  Keyboard,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import AskScreen, { PhoneDock } from '../src/features/ask/AskScreen';
import { useScreenReady } from '../src/analytics/timing';
import {
  AskDock,
  COMPOSER_HEIGHT_SHARE,
  composerFieldCap,
  composerLines,
} from '../src/features/ask/AskDock';
import clarify from '../scripts/fixtures/ask-clarify.json';
import { catalogs, client } from '../src/api/runtime';
import { arriveInAsk, askSession } from '../src/features/ask/session';
import { reconcileChats, syncSubmittedChat } from '../src/features/ask/sync';
import { chatsSnapshot } from '../src/features/ask/store';
import { openAskOptions } from '../src/features/ask/Options';
import { AskFailure, type StreamHandlers } from '../src/features/ask/stream';
import { colors, rhythm, textStyles } from '../src/design/tokens';
import { designFlags } from '../src/design/flags';
import * as ScrollTop from '../src/design/scroll-to-top';
import { askRoute, conversationsRoute } from '../src/navigation/routes/ask';
import { useSeat } from '../src/features/your-mp/useSeat';
import { startersFor } from '../src/features/ask/starters';
import {
  dispatchKeyCommand,
  requestFocus,
  takeFocusRequest,
} from '../src/design/keyboard';
import { useOpenAsk } from '../src/features/ask/open';
import { fromWebPath } from '../src/navigation/external';
import * as Duo from '../modules/opax-duo';
import {
  resetAdaptiveDeviceForTests,
  setWindowTraitsOverride,
} from '../src/design/adaptive';
import { ReservedRegionsProvider } from '../src/design/fold-area';
import { AskColumns } from '../src/features/ask/AskLayout';
import { AskThread } from '../src/features/ask/AskThread';
import { emptyReservedRegions } from '../src/design/fold';

// The bar's items, as AskScreen sets them through Stack.Screen.
const mockBar: { options: Record<string, unknown> } = { options: {} };
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
jest.mock('../src/features/ask/SourcesPane', () => ({
  AskPaneProvider: ({ children }: { children: unknown }) => children,
  useAskSources: () => ({ context: null, onScroll: undefined, pane: null }),
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
  jest.mocked(catalogs.roster).mockRejectedValue(new Error('Offline'));
  mockDirectory.current = null;
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
    const docked = adaptive && width >= 560;
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
        expect(mockBar.options.headerLargeTitleEnabled).toBe(
          os === 'ios' ? state === 'idle' && !docked : undefined,
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
    const shown = [0, 1, 2, 3].map((i) =>
      a11y(`ask-starter-${i}`, 'accessibilityLabel'),
    );
    expect(shown).toEqual(startersFor(Date.UTC(2026, 10, 10, 2), 4));
    expect(shown).not.toEqual(startersFor(Date.UTC(2026, 10, 9, 2), 4));
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
  // With room to spare and no keyboard, the lines rule alone sets the cap.
  expect(input.maxHeight).toBe(
    textStyles.body.lineHeight *
      Math.max(1, fontScale) *
      composerLines(fontScale) +
      20,
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
  // Sweep 1 item 7.2: the member's row leads the four, above the day's three.
  const order = renderer.root
    .findAll(
      (n) =>
        typeof n.props?.testID === 'string' &&
        /^ask-starter-(seat|\d)$/.test(n.props.testID) &&
        typeof n.type === 'string',
    )
    .map((n) => n.props.testID as string)
    .filter((id, i, all) => all.indexOf(id) === i);
  expect(order).toEqual([
    'ask-starter-seat',
    'ask-starter-0',
    'ask-starter-1',
    'ask-starter-2',
  ]);
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
  // Three rotating starters plus the seat starter.
  expect(byId('ask-starter-3')).toEqual([]);
  // A fresh page: the seat starter's Person option set the composer's.
  await act(async () => {
    askSession.newConversation();
  });
  const starter = a11y('ask-starter-0', 'accessibilityLabel')!;
  await press('ask-starter-0');
  expect(jest.mocked(client.askPost).mock.calls[0]?.[1]).toMatchObject({
    question: starter,
  });
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
    // Status copy has a minimum dwell time, even for a fast lookup.
    await new Promise((resolve) => setTimeout(resolve, 650));
  });
  expect(textOf('ask-status')).toBe('Searching the record');
  await act(async () => {
    on!.step?.({
      id: 'hearings',
      label: 'Checking committee hearings',
      arg: 'housing',
      state: 'running',
    });
    await new Promise((resolve) => setTimeout(resolve, 650));
  });
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
});

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
      expect(texts()).toContain("This question couldn't be sent.");
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
    ).toBeCloseTo(0.4 * 374 - 40);
    expect(
      composerFieldCap({
        fontScale: 3.12,
        windowHeight: 874,
        keyboard: 800,
        chrome: 40,
      }),
    ).toBe(44);
  });

  test('at Large nothing changes: five lines, then the field scrolls', () => {
    expect(
      composerFieldCap({ fontScale: 1, windowHeight: 874, chrome: 8 }),
    ).toBe(textStyles.body.lineHeight * 5 + 20);
    expect(
      composerFieldCap({
        fontScale: 1,
        windowHeight: 874,
        keyboard: 336,
        chrome: 8,
      }),
    ).toBe(textStyles.body.lineHeight * 5 + 20);
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
    expect(handlers.has('keyboardDidShow')).toBe(true);
    expect(handlers.has('keyboardWillChangeFrame')).toBe(false);
    act(() =>
      handlers.get('keyboardDidShow')!({ endCoordinates: { screenY: 500 } }),
    );
    expect(measured.length).toBeGreaterThan(0);
    const phone = () => screen.root.findByType(PhoneDock);
    expect(phone().props).toMatchObject({ keyboard: 0, keyboardVisible: true });
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
    Platform.OS = original;
  }
});

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
    expect(inputStyle().minHeight).toBe(44);
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
