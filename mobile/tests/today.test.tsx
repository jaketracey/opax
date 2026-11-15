import { useNetworkState } from 'expo-network';
import { act, createRef, type ReactElement, type ReactNode } from 'react';
import {
  HeaderHeightContext,
  NavigationContext,
  NavigationRouteContext,
} from 'expo-router/react-navigation';
import {
  ActionSheetIOS,
  AppState,
  Dimensions,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import TestRenderer, { type ReactTestInstance } from 'react-test-renderer';
import snapshot from '../scripts/fixture-snapshot.json';
import * as c from '../src/api/catalogs';
import { editionPath } from '../src/api/policy';
import { catalogs as runtime } from '../src/api/runtime';
import { Screen } from '../src/design/layout';
import { rhythm } from '../src/design/tokens';
import {
  LONGEST_LINE,
  sinceSourceWords,
  sinceWords,
} from '../src/features/today/SinceLastVisit';
import * as sheets from '../src/navigation/sheets';
import { router } from 'expo-router';
import { recentRecordsRoute } from '../src/navigation/routes';
import {
  readVisit,
  refreshLikely,
  rememberVisit,
  REFRESH_AFTER_MS,
} from '../src/features/today/visit-store';
import { Text } from '../src/design/text';
import * as learnSettings from '../src/features/learn/settings';
import { OfflineLine } from '../src/design/states';
import Today from '../src/features/Today';
import { WelcomePage } from '../src/features/welcome/Welcome';
import { AustraliaDots } from '../src/features/today/AustraliaDots';
import { TodayEditionCard } from '../src/features/today/FeaturedPeopleCard';
import { TodayFoot } from '../src/features/today/Foot';
import { Masthead, mastheadDate } from '../src/features/today/Masthead';
import { useOverview as useElectionOverview } from '../src/features/vic-election/reads';
import { decodeOverview } from '../src/features/vic-election/decoders';
import electionOverview from '../scripts/fixtures/vic-election/overview.json';
import { readCachedEdition } from '../src/features/today/edition-store';
import { readInvitationDates } from '../src/features/today/invitation-store';
import {
  readTodayShape,
  rememberTodayShape,
  shapeKey,
} from '../src/features/today/shape-store';
import { addDays, sydneyDay } from '../src/features/today/rules';
import { invitationBody } from '../src/features/today/SeatInvitation';
import { loadChoice } from '../src/features/your-mp/choice-store';
import { resetSeatForTests } from '../src/features/your-mp/useSeat';
import { releaseSplash } from '../src/launch/splash';
import { largeTitleBar } from '../src/navigation/chrome';
import {
  resetTourForTests,
  welcomeDeclinedThisLaunch,
} from '../src/onboarding/state';
import { TwoSlotStore } from '../src/storage/two-slot';
import { responseBytes } from './fixture-bytes';
import {
  bills,
  catalogs,
  index,
  manifest,
  people,
  pinned,
  roster,
  slugs,
} from './pinned';

jest.mock('../src/api/runtime', () => ({
  portraits: { get: jest.fn(async () => null) },
  yearPictures: { get: jest.fn(async () => null) },
  catalogs: {
    todayEdition: jest.fn(),
    todayBills: jest.fn(),
    todayDeclarations: jest.fn(),
    todayDeclarationsProfiled: jest.fn(),
    recentDivisions: jest.fn(),
    directory: jest.fn(),
    yourMP: jest.fn(),
    electorateFor: jest.fn(),
    profileFor: jest.fn(),
    bills: jest.fn(),
    bill: jest.fn(() => new Promise(() => {})),
    roster: jest.fn(() => new Promise(() => {})),
    slugs: jest.fn(() => new Promise(() => {})),
    // No published calendar: no sitting line, the closing line's date alone.
    sittingDays: jest.fn(async () => null),
    // Nothing saved unless a test says so.
    sittingDaysSaved: jest.fn(async () => null),
    todayEditionSaved: jest.fn(async () => null),
    // The collection record: unreadable unless a test publishes one.
    corpus: jest.fn(),
    corpusSaved: jest.fn(async () => null),
  },
}));
jest.mock('../src/features/vic-election/reads', () => ({
  ...jest.requireActual('../src/features/vic-election/reads'),
  useOverview: jest.fn(),
}));
jest.mock('../src/features/vic-election/clock', () => ({
  useElectionNow: () => new Date('2026-11-20T10:00:00+11:00'),
}));
jest.mock('../src/features/your-mp/choice-store', () => ({
  loadChoice: jest.fn(),
  saveChoice: jest.fn(),
  subscribeChoice: jest.fn(() => () => undefined),
}));
jest.mock('../src/features/today/edition-store', () => ({
  readCachedEdition: jest.fn(),
  rememberEdition: jest.fn(async () => undefined),
}));
// The launch read is set per test; the card's own "Not now" runs the real
// store, so a test can read back what it saved.
jest.mock('../src/features/today/invitation-store', () => ({
  ...jest.requireActual('../src/features/today/invitation-store'),
  readInvitationDates: jest.fn(),
  overrideInvitationDates: jest.fn(),
}));
// Following has its own tests (today-following): here, a marker in its slot.
jest.mock('../src/features/follows/FollowingSection', () => ({
  FollowingSection: () =>
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('react').createElement(require('react-native').View, {
      testID: 'today-following',
    }),
}));
jest.mock('../src/features/explore/runtime', () => ({
  explore: { pictures: jest.fn(() => Promise.reject(new Error('Offline'))) },
}));
jest.mock('../src/launch/splash', () => ({ releaseSplash: jest.fn() }));
jest.mock('../src/launch/LaunchHandoff', () => ({ LaunchHandoff: () => null }));
jest.mock('../src/features/ask/open', () => ({
  useOpenAsk: () => jest.fn(),
  useAskNow: () => jest.fn(),
}));
jest.mock('../src/api/image-policy', () => ({
  localImageURI: (uri: string) => uri,
}));
jest.mock('expo-router', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require('react');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Native = require('react-native');
  const Wrap = ({ children, ...props }: { children?: ReactNode }) =>
    React.createElement(Native.View, props, children);
  const Link = Object.assign(
    (props: { children?: ReactNode }) => React.createElement(Wrap, props),
    {
      Trigger: (props: { children?: ReactNode }) =>
        React.createElement(Wrap, props),
      Preview: () => null,
      Menu: (props: { children?: ReactNode }) =>
        React.createElement(Wrap, props),
      MenuAction: (props: { children?: ReactNode }) =>
        React.createElement(Wrap, props),
    },
  );
  return {
    Link,
    router: { push: jest.fn(), navigate: jest.fn(), dismissTo: jest.fn() },
    useSegments: () => [],
    useNavigation: () => ({
      getParent: () => ({
        goBack: () => mockFocusEffects.forEach((effect) => effect()),
      }),
      addListener: () => () => undefined,
    }),
    Stack: { Screen: () => null },
    // Today's focus effects, kept so a test can "show" Today again.
    useFocusEffect: (effect: () => void) =>
      React.useEffect(() => {
        mockFocusEffects.push(effect);
      }, [effect]),
  };
});
const mockFocusEffects: (() => void)[] = [];
const mockWelcomeFiles = new Map<string, string>();
jest.mock('expo-file-system', () => ({
  Paths: { document: 'documents' },
  File: class {
    name: string;
    constructor(_directory: unknown, name: string) {
      this.name = name;
    }
    get exists() {
      return mockWelcomeFiles.has(this.name);
    }
    async text() {
      return mockWelcomeFiles.get(this.name)!;
    }
    write(body: string) {
      mockWelcomeFiles.set(this.name, body);
    }
  },
}));
jest.mock('../src/onboarding/state', () => ({
  ...jest.requireActual('../src/onboarding/state'),
  welcomeDeclinedThisLaunch: jest.fn(() => false),
}));

const mock = runtime as jest.Mocked<typeof runtime>;
const result = <T,>(data: T) => ({
  data,
  stale: false,
  savedAt: 1,
  asOf: null,
});
const directory = {
  manifest: result(manifest),
  people: result(people),
  roster: result(roster),
  slugs: result(slugs),
  electorates: result(index),
};
const grayndler = index.electorates.find((s) => s.name === 'Grayndler')!;
const today = sydneyDay();
const ready = c.editionFor(
  c.decodeEdition(JSON.parse(responseBytes(snapshot, editionPath).toString())),
);
/** The pinned edition, dated `days` before today (Sydney). */
const editionAged = (days: number) => ({
  ...ready,
  data: { ...ready.data!, date: addDays(today, -days) },
});
const declarations = c.recentDeclarationsFor(
  c.decodeRecentInterests(pinned('/interests/recent.json')),
  3,
  catalogs,
);

/** The top-level blocks in the order drawn. */
const BLOCKS = [
  'today-your-mp',
  'today-your-mp-pending',
  'today-invitation',
  'today-edition-card',
  'today-edition-loading',
  'today-pair',
  'today-following',
  'today-bills',
  'today-votes',
  'today-declarations',
  'today-explore',
  'today-ask',
  'today-foot',
];
const blocks = (root: ReactTestInstance) => {
  const seen: string[] = [];
  for (const node of root.findAll(
    (n) => typeof n.type === 'string' && BLOCKS.includes(n.props.testID),
  ))
    if (!seen.includes(node.props.testID)) seen.push(node.props.testID);
  return seen;
};
const strings = (node: ReactTestInstance): string =>
  node
    .findAll((n) => n.type === 'Text')
    .flatMap((n) =>
      ([] as unknown[])
        .concat(n.props.children)
        .filter((v): v is string => typeof v === 'string'),
    )
    .join(' ');

const mounted: TestRenderer.ReactTestRenderer[] = [];
async function render(element: ReactElement) {
  let r!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    r = TestRenderer.create(element);
  });
  // Let the second-pass reads (roster joins, profile) settle.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  mounted.push(r);
  return r;
}
afterEach(async () => {
  mockFocusEffects.splice(0);
  await act(async () => mounted.splice(0).forEach((r) => r.unmount()));
  resetTourForTests();
  mockWelcomeFiles.clear();
});

function setUp({
  seat = false,
  cached = null as Awaited<ReturnType<typeof readCachedEdition>>,
  edition = editionAged(1) as c.Block<c.EditionView>,
  hiddenUntil = null as string | null,
  welcomeDeclinedAt = null as string | null,
} = {}) {
  resetSeatForTests();
  jest.clearAllMocks();
  jest.mocked(useElectionOverview).mockReturnValue({
    record: null,
    error: null,
    loading: false,
    retry: jest.fn(),
  });
  mock.directory.mockResolvedValue(directory);
  jest
    .mocked(loadChoice)
    .mockResolvedValue(
      seat
        ? { version: 1, seatId: grayndler.electorate_id, stateSeatIds: [] }
        : null,
    );
  jest.mocked(readCachedEdition).mockResolvedValue(cached);
  jest
    .mocked(readInvitationDates)
    .mockResolvedValue({ hiddenUntil, welcomeDeclinedAt });
  mock.todayEdition.mockResolvedValue(edition);
  mock.todayEditionSaved.mockResolvedValue(null);
  mock.corpus.mockRejectedValue(new Error('offline'));
  mock.corpusSaved.mockResolvedValue(null);
  mock.sittingDaysSaved.mockResolvedValue(null);
  mock.todayBills.mockImplementation(async (limit = 3, kind = 'new') =>
    c.recentBillsFor(bills, limit, kind),
  );
  mock.todayDeclarations.mockResolvedValue(declarations);
  mock.todayDeclarationsProfiled.mockResolvedValue(declarations);
  mock.recentDivisions.mockResolvedValue({ status: 'missing' } as never);
  mock.yourMP.mockImplementation(async (id: string) =>
    c.yourMPFor(id, index, manifest, []),
  );
  mock.electorateFor.mockImplementation(async (path: string) =>
    result(c.electorateFor(c.decodeElectorate(pinned(path)))),
  );
  mock.profileFor.mockImplementation(
    async (id) => c.profileFor(id, catalogs) as never,
  );
  mock.bills.mockResolvedValue(result(bills) as never);
}

test.each(['index', 'your-mp', 'bills', 'search', 'ask'])(
  'Today at Large follows native header height without a final scroll event on the %s root',
  async (name) => {
    setUp();
    const window = Dimensions.get('window');
    act(() => Dimensions.set({ window: { ...window, fontScale: 1 } }));
    const version = Object.getOwnPropertyDescriptor(Platform, 'Version')!;
    Object.defineProperty(Platform, 'Version', {
      configurable: true,
      value: 26,
    });
    const route = { key: `${name}-root`, name };
    const setOptions = jest.fn();
    const navigation = {
      isFocused: () => true,
      addListener: () => () => {},
      getState: () => ({
        index: 0,
        routes: [route],
        routeNames: [name, 'bill/[key]', 'explore/[tool]'],
      }),
      setOptions,
    };
    const page = (height: number) => (
      <NavigationContext.Provider value={navigation as never}>
        <NavigationRouteContext.Provider value={route}>
          <SafeAreaInsetsContext.Provider
            value={{ top: 24, bottom: 0, left: 0, right: 0 }}
          >
            <HeaderHeightContext.Provider value={height}>
              <Today />
            </HeaderHeightContext.Provider>
          </SafeAreaInsetsContext.Provider>
        </NavigationRouteContext.Provider>
      </NavigationContext.Provider>
    );
    try {
      const renderer = await render(page(160));
      expect(renderer.root.findByType(Screen).props.onScroll).toBeUndefined();
      const expanded = setOptions.mock.calls.at(-1)![0];
      const ground = expanded.contentStyle.backgroundColor;
      expect(expanded).toMatchObject(largeTitleBar(ground));
      expect(expanded.headerStyle).toEqual({});
      expect(expanded.headerLargeStyle).toEqual({});
      setOptions.mockClear();
      for (const height of [160, 159.75, 160])
        act(() => renderer.update(page(height)));
      expect(setOptions).not.toHaveBeenCalled();
      for (const height of [159, 120, 100])
        act(() => renderer.update(page(height)));
      act(() => renderer.update(page(68)));
      act(() => renderer.update(page(160)));
      for (const height of [192, 160]) act(() => renderer.update(page(height)));
      expect(setOptions).not.toHaveBeenCalled();
    } finally {
      act(() => Dimensions.set({ window }));
      Object.defineProperty(Platform, 'Version', version);
    }
  },
);

describe('the launch order', () => {
  test('live welcome Not now moves the invitation even when Today focuses before the save finishes', async () => {
    resetTourForTests();
    mockWelcomeFiles.clear();
    setUp({ cached: 'missing' });
    jest
      .mocked(readInvitationDates)
      .mockImplementation(
        jest.requireActual('../src/features/today/invitation-store')
          .readInvitationDates,
      );
    jest
      .mocked(welcomeDeclinedThisLaunch)
      .mockImplementation(
        jest.requireActual('../src/onboarding/state').welcomeDeclinedThisLaunch,
      );
    const r = await render(
      <SafeAreaInsetsContext.Provider
        value={{ top: 59, bottom: 34, left: 0, right: 0 }}
      >
        <Today />
        <WelcomePage />
      </SafeAreaInsetsContext.Provider>,
    );
    expect(
      r.root.findAllByProps({ testID: 'welcome-screen' }).length,
    ).toBeGreaterThan(0);
    expect(blocks(r.root)[0]).toBe('today-invitation');
    let finishSave!: () => void;
    const pending = new Promise<void>((resolve) => {
      finishSave = resolve;
    });
    const save = TwoSlotStore.prototype.save;
    const slowSave = jest
      .spyOn(TwoSlotStore.prototype, 'save')
      .mockImplementationOnce(async function (value) {
        await pending;
        return save.call(this, value);
      });
    try {
      // The real Not now handler starts saving and closes the modal. Its
      // navigation callback focuses Today while the old flag is still on disk.
      await act(async () =>
        r.root
          .findByType(WelcomePage)
          .findByProps({
            testID: 'welcome-screen',
          })
          .props.onAccessibilityEscape(),
      );
      expect(mockWelcomeFiles.size).toBe(0);
      expect(blocks(r.root)[0]).toBe('today-pair');
      await act(async () => {
        finishSave();
        await pending;
      });
      const order = blocks(r.root);
      expect(order[0]).toBe('today-pair');
      expect(order.indexOf('today-invitation')).toBe(
        order.indexOf('today-bills') + 1,
      );
    } finally {
      finishSave();
      slowSave.mockRestore();
      jest.mocked(welcomeDeclinedThisLaunch).mockReturnValue(false);
    }
  });
  test('A, with a seat: Your MP, then the edition; the daily pair opens More to explore', async () => {
    setUp({ seat: true, cached: { date: addDays(today, -1) } });
    const r = await render(<Today />);
    expect(blocks(r.root)).toEqual([
      'today-your-mp',
      'today-edition-card',
      'today-following',
      'today-bills',
      'today-declarations',
      'today-explore',
      'today-pair',
      'today-ask',
      'today-foot',
    ]);
  });
  test('A, no seat: the edition, then the invitation', async () => {
    setUp({ cached: { date: addDays(today, -2) } });
    const r = await render(<Today />);
    expect(blocks(r.root).slice(0, 2)).toEqual([
      'today-edition-card',
      'today-invitation',
    ]);
  });
  test('B: the invitation, then the daily pair; an old edition is not drawn', async () => {
    setUp({ cached: 'missing', edition: editionAged(30) });
    const r = await render(<Today />);
    expect(blocks(r.root)).toEqual([
      'today-invitation',
      'today-pair',
      'today-following',
      'today-bills',
      'today-declarations',
      'today-explore',
      'today-ask',
      'today-foot',
    ]);
  });
  test('C: a recent edition collapses its top slot and draws after Just declared', async () => {
    setUp({ cached: null, edition: editionAged(7) });
    const r = await render(<Today />);
    expect(blocks(r.root)).toEqual([
      'today-invitation',
      'today-pair',
      'today-following',
      'today-bills',
      'today-declarations',
      'today-edition-card',
      'today-explore',
      'today-ask',
      'today-foot',
    ]);
  });
  test('C: the edition slot holds a skeleton until the read answers', async () => {
    setUp({ cached: null });
    mock.todayEdition.mockImplementation(() => new Promise(() => {}));
    const r = await render(<Today />);
    expect(blocks(r.root).slice(0, 3)).toEqual([
      'today-invitation',
      'today-edition-loading',
      'today-pair',
    ]);
  });
  test('after a welcome Not now, the invitation follows Bills for 7 days', async () => {
    setUp({ cached: 'missing', welcomeDeclinedAt: today });
    const r = await render(<Today />);
    const order = blocks(r.root);
    expect(order[0]).toBe('today-pair');
    expect(order.indexOf('today-invitation')).toBe(
      order.indexOf('today-bills') + 1,
    );
    setUp({ cached: 'missing', welcomeDeclinedAt: addDays(today, -8) });
    const later = await render(<Today />);
    expect(blocks(later.root)[0]).toBe('today-invitation');
  });
  test('a welcome Not now under a mounted Today moves the invitation when Today shows again', async () => {
    setUp({ cached: 'missing' });
    const r = await render(<Today />);
    expect(blocks(r.root)[0]).toBe('today-invitation');
    jest.mocked(welcomeDeclinedThisLaunch).mockReturnValue(true);
    jest
      .mocked(readInvitationDates)
      .mockResolvedValue({ hiddenUntil: null, welcomeDeclinedAt: today });
    await act(async () => mockFocusEffects.forEach((effect) => effect()));
    const order = blocks(r.root);
    expect(order[0]).toBe('today-pair');
    expect(order.indexOf('today-invitation')).toBe(
      order.indexOf('today-bills') + 1,
    );
    jest.mocked(welcomeDeclinedThisLaunch).mockReturnValue(false);
  });
  test('touch and hold the invitation: Not now hides it, saved 30 days on', async () => {
    setUp({ cached: 'missing' });
    const r = await render(<Today />);
    expect(blocks(r.root)[0]).toBe('today-invitation');
    const press = r.root.find(
      (n) =>
        n.props.testID === 'today-invitation-press' &&
        typeof n.props.onLongPress === 'function',
    );
    const sheet = jest
      .spyOn(ActionSheetIOS, 'showActionSheetWithOptions')
      .mockImplementation(() => undefined);
    await act(async () => press.props.onLongPress());
    expect(sheet.mock.calls.at(-1)![0].options).toEqual(['Not now', 'Cancel']);
    await act(async () => {
      sheet.mock.calls.at(-1)![1](0);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(blocks(r.root)).not.toContain('today-invitation');
    expect(blocks(r.root)[0]).toBe('today-pair');
    const saved = await jest
      .requireActual<
        typeof import('../src/features/today/invitation-store')
      >('../src/features/today/invitation-store')
      .readInvitationDates();
    expect(saved.hiddenUntil).toBe(addDays(today, 30));
    sheet.mockRestore();
  });
  test('VoiceOver: Not now is the headline’s action', async () => {
    setUp({ cached: 'missing' });
    const r = await render(<Today />);
    const title = r.root.find(
      (n) =>
        n.props.testID === 'today-invitation-title' &&
        typeof n.props.onAccessibilityAction === 'function',
    );
    expect(title.props.accessibilityActions).toEqual([
      { name: 'notNow', label: 'Not now' },
    ]);
    await act(async () => {
      title.props.onAccessibilityAction({
        nativeEvent: { actionName: 'notNow' },
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(blocks(r.root)).not.toContain('today-invitation');
  });
  test('the invitation is a form: headline, body and two buttons, each its own element', async () => {
    setUp({ cached: 'missing' });
    const r = await render(<Today />);
    const card = r.root.find(
      (n) =>
        typeof n.type === 'string' && n.props.testID === 'today-invitation',
    );
    // Nothing around them is an element, a button or a link.
    const wrappers = card.findAll(
      (n) =>
        typeof n.type === 'string' &&
        (n.props.accessible === true ||
          ['button', 'link'].includes(n.props.accessibilityRole)) &&
        n.findAll(
          (m) =>
            typeof m.type === 'string' &&
            m.props.testID === 'today-invitation-body',
        ).length > 0,
    );
    expect(wrappers).toEqual([]);
    expect(card.props.accessibilityRole).toBeUndefined();
    const host = (id: string) =>
      card.findAll((n) => typeof n.type === 'string' && n.props.testID === id);
    expect(host('today-invitation-title')[0]!.props.accessibilityRole).toBe(
      'header',
    );
    expect(host('today-invitation-body')).toHaveLength(1);
    for (const id of ['today-invitation-find', 'today-invitation-location']) {
      const button = host(id)[0]!;
      expect(button.props.accessibilityRole).toBe('button');
      expect(button.props.onLongPress).toBeUndefined();
    }
  });
  test('the card’s own Not now hides the invitation for 30 days', async () => {
    setUp({ cached: 'missing', hiddenUntil: addDays(today, 29) });
    const r = await render(<Today />);
    expect(blocks(r.root)).not.toContain('today-invitation');
    expect(blocks(r.root)[0]).toBe('today-pair');
  });
});

describe('the page', () => {
  const failed = (code: string) =>
    ({
      status: 'error',
      data: null,
      asAt: null,
      sources: [],
      stale: false,
      savedAt: null,
      error: { code, message: 'Failed.' },
    }) as never;
  const node = (r: TestRenderer.ReactTestRenderer, id: string) =>
    r.root.findAll((n) => typeof n.type === 'string' && n.props.testID === id);
  test('iOS 26.6.2 keeps content visible when a loading block collapses at the bottom', async () => {
    setUp({ cached: 'missing' });
    let finish!: (block: typeof declarations) => void;
    mock.todayDeclarationsProfiled.mockImplementation(
      () => new Promise(() => {}),
    );
    mock.todayDeclarations.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const version = Object.getOwnPropertyDescriptor(Platform, 'Version')!;
    Object.defineProperty(Platform, 'Version', {
      configurable: true,
      value: '26.6.2',
    });
    try {
      const r = await render(<Today />);
      expect(node(r, 'today-declarations-loading')).not.toHaveLength(0);
      const view = r.root.findByType(ScrollView);
      const scrollTo = jest.fn();
      view.instance.scrollTo = scrollTo;
      act(() => {
        view.props.onLayout({
          nativeEvent: { layout: { x: 0, y: 0, width: 402, height: 700 } },
        });
        view.props.onContentSizeChange(402, 5000);
        view.props.onScroll({
          nativeEvent: {
            contentOffset: { x: 0, y: 4383 },
            contentInset: { top: 160, bottom: 83, left: 0, right: 0 },
            layoutMeasurement: { width: 402, height: 700 },
            contentSize: { width: 402, height: 5000 },
          },
        });
      });
      expect(scrollTo).not.toHaveBeenCalled();
      await act(async () =>
        finish({ ...declarations, status: 'missing', data: null }),
      );
      expect(node(r, 'today-declarations')).toHaveLength(0);
      act(() => view.props.onContentSizeChange(402, 1000));
      expect(scrollTo).toHaveBeenLastCalledWith({ y: 383, animated: false });
      expect(blocks(r.root).at(-1)).toBe('today-foot');
    } finally {
      Object.defineProperty(Platform, 'Version', version);
    }
  });
  test('offline, never saved: Bills says so once with no Try again, and How parliament voted collapses', async () => {
    setUp({ cached: 'missing' });
    mock.todayBills.mockResolvedValue(failed('offline'));
    mock.recentDivisions.mockResolvedValue(failed('offline'));
    const r = await render(<Today />);
    expect(node(r, 'today-bills-error')).toHaveLength(1);
    expect(node(r, 'today-bills-error-retry')).toHaveLength(0);
    expect(blocks(r.root)).not.toContain('today-votes');
  });
  test('offline, never saved: Just declared says so once with no Try again', async () => {
    setUp({ cached: 'missing' });
    mock.todayDeclarations.mockResolvedValue(failed('offline'));
    mock.todayDeclarationsProfiled.mockResolvedValue(failed('offline'));
    const r = await render(<Today />);
    expect(node(r, 'today-declarations-error')).toHaveLength(1);
    expect(node(r, 'today-declarations-error-retry')).toHaveLength(0);
  });
  test('an online failure keeps Try again on each block', async () => {
    setUp({ cached: 'missing' });
    mock.todayBills.mockResolvedValue(failed('server'));
    mock.todayDeclarations.mockResolvedValue(failed('server'));
    mock.todayDeclarationsProfiled.mockResolvedValue(failed('server'));
    mock.recentDivisions.mockResolvedValue(failed('server'));
    const r = await render(<Today />);
    for (const id of ['today-bills', 'today-declarations', 'today-votes'])
      expect(node(r, `${id}-error-retry`).length).toBeGreaterThan(0);
  });
  test('Your MP loading is one element, read once', async () => {
    setUp({ seat: true, cached: { date: addDays(today, -1) } });
    // The tile's skeleton stands while the directory is on its way.
    mock.directory.mockImplementation(() => new Promise(() => {}));
    const r = await render(<Today />);
    // What VoiceOver can reach: not inside a hidden subtree.
    const hidden = (n: ReactTestInstance | null): boolean =>
      !!n &&
      ((typeof n.type === 'string' &&
        n.props.importantForAccessibility === 'no-hide-descendants') ||
        hidden(n.parent));
    const spoken = r.root.findAll(
      (n) =>
        typeof n.type === 'string' &&
        n.props.accessibilityLabel === 'Loading your MP' &&
        n.props.accessible === true &&
        !hidden(n.parent),
    );
    expect(spoken).toHaveLength(1);
    expect(spoken[0]!.props.testID).toBe('today-your-mp-loading');
  });
  test('releases the splash on first layout, including a skeleton', async () => {
    setUp({ cached: 'missing' });
    const renderer = await render(<Today />);
    expect(releaseSplash).not.toHaveBeenCalled();
    act(() =>
      renderer.root.findByType(Screen).props.onLayout({
        nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 844 } },
      }),
    );
    expect(releaseSplash).toHaveBeenCalledWith('today');
  });
  test('a grouped screen; How parliament voted is absent until its file exists', async () => {
    setUp({ seat: true, cached: { date: addDays(today, -1) } });
    const r = await render(<Today />);
    expect(r.root.findByType(Screen).props.grouped).toBe(true);
    expect(blocks(r.root)).not.toContain('today-votes');
  });
  test('Your MP: one tile for the member and its line; no records or senators on Home', async () => {
    setUp({ seat: true, cached: { date: addDays(today, -1) } });
    const r = await render(<Today />);
    const card = r.root.find(
      (n) => typeof n.type === 'string' && n.props.testID === 'today-your-mp',
    );
    const ids = card
      .findAll((n) => typeof n.type === 'string' && !!n.props.testID)
      .map((n) => n.props.testID as string);
    expect(ids).toContain('today-your-mp-member');
    expect(ids).toContain('today-your-mp-hook');
    expect(ids.filter((id) => id === 'today-your-mp-sources').length).toBe(1);
    for (const id of ids)
      expect(id).not.toMatch(/latest|senators|declaration|your-mp-group/);
    expect(strings(card)).toContain('Grayndler');
    expect(strings(card)).toContain('Represents you in federal parliament');
    expect(strings(card)).not.toMatch(/authoris/i);
  });
  test('no string says a retired or pipeline word, or an em dash', async () => {
    for (const options of [
      { seat: true, cached: { date: addDays(today, -1) } },
      { cached: null, edition: editionAged(7) },
    ]) {
      setUp(options);
      const r = await render(<Today />);
      const labels = r.root
        .findAll((n) => typeof n.props.accessibilityLabel === 'string')
        .map((n) => n.props.accessibilityLabel as string)
        .join(' ');
      for (const text of [strings(r.root), labels])
        expect(text).not.toMatch(
          /Daily edition ·|snapshot|export|indexed|native|Try again\.|—/i,
        );
    }
  });
});

/**
 * Jumpiness (ad-jank-today): the first frame of Today has the loaded page's
 * layout, so nothing already on screen moves. Each test fails without its
 * fix: the launch stand-in was the edition's outline whatever the page's
 * order, Your MP's tile waited a frame behind a skeleton of another shape,
 * and the edition was inserted in case A.
 */
describe('the first frame has the loaded page’s layout', () => {
  const hosts = (r: TestRenderer.ReactTestRenderer, id: string) =>
    r.root.findAll((n) => typeof n.type === 'string' && n.props.testID === id);
  const flat = (n: ReactTestInstance) =>
    (StyleSheet.flatten(n.props.style) ?? {}) as Record<string, unknown>;
  const pending = <T,>() => {
    let answer!: (value: T) => void;
    const promise = new Promise<T>((resolve) => {
      answer = resolve;
    });
    return { promise, answer };
  };
  const layOut = (r: TestRenderer.ReactTestRenderer) =>
    act(() =>
      r.root.findByType(Screen).props.onLayout({
        nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 844 } },
      }),
    );

  test('while the directory is read, the page is already in its order: Your MP’s skeleton, then the edition', async () => {
    setUp({ seat: true, cached: { date: addDays(today, -1) } });
    const directoryRead = pending<typeof directory>();
    mock.directory.mockReturnValue(directoryRead.promise as never);
    const r = await render(<Today />);
    // No stand-in of another shape: the page's own slots, in order.
    expect(hosts(r, 'today-launching')).toHaveLength(0);
    expect(blocks(r.root).slice(0, 4)).toEqual([
      'today-your-mp-pending',
      'today-edition-card',
      'today-following',
      'today-bills',
    ]);
    expect(hosts(r, 'today-your-mp-loading')).toHaveLength(1);
    // The tile's own id is the tile's alone: a journey waiting on it waits
    // for the tile, not for its place.
    expect(hosts(r, 'today-your-mp')).toHaveLength(0);
    const before = blocks(r.root);
    await act(async () => directoryRead.answer(directory));
    // The directory answers: the same order, the tile where its skeleton was.
    expect(blocks(r.root)).toEqual(
      before.map((id) =>
        id === 'today-your-mp-pending' ? 'today-your-mp' : id,
      ),
    );
    expect(hosts(r, 'today-your-mp-loading')).toHaveLength(0);
    expect(hosts(r, 'today-your-mp-member')).not.toHaveLength(0);
  });

  test('Your MP’s skeleton has the tile’s shape: the card, a 56 pt portrait, four lines of the tile’s type and the source band', async () => {
    setUp({ seat: true, cached: { date: addDays(today, -1) } });
    mock.directory.mockImplementation(() => new Promise(() => {}));
    const r = await render(<Today />);
    const tile = hosts(r, 'today-your-mp-loading-tile')[0]!;
    // The card's own face and padding, as the loaded tile's.
    expect(flat(tile)).toMatchObject({ padding: 20 });
    expect(flat(hosts(r, 'today-your-mp-loading-portrait')[0]!)).toMatchObject({
      width: 56,
      height: 56,
    });
    // Unseen lines of the real text styles set the heights, so they follow
    // the text size as the loaded lines do.
    const words = hosts(r, 'today-your-mp-loading-words')[0]!;
    const lines = words
      .findAll((n) => n.type === Text)
      .map((n) => n.props.variant);
    expect(lines).toEqual([
      'footnote',
      'subsectionTitle',
      'secondary',
      'secondary',
    ]);
    expect(flat(words)).toMatchObject({ gap: rhythm.line });
    expect(flat(hosts(r, 'today-your-mp-loading-source')[0]!).minHeight).toBe(
      Platform.OS === 'android' ? 48 : 44,
    );
  });

  test('the tile draws from the directory at once, with no skeleton frame while its own read is out', async () => {
    setUp({ seat: true, cached: { date: addDays(today, -1) } });
    mock.yourMP.mockImplementation(() => new Promise(() => {}));
    const r = await render(<Today />);
    expect(hosts(r, 'today-your-mp-loading')).toHaveLength(0);
    expect(hosts(r, 'today-your-mp-member')).not.toHaveLength(0);
    expect(strings(hosts(r, 'today-your-mp')[0]!)).toContain('Grayndler');
  });

  test('before the disk answers the body draws nothing, and the cover waits for the page’s order', async () => {
    setUp({ seat: true, cached: { date: addDays(today, -1) } });
    const choiceRead = pending<Awaited<ReturnType<typeof loadChoice>>>();
    jest.mocked(loadChoice).mockReturnValue(choiceRead.promise);
    const r = await render(<Today />);
    const launching = hosts(r, 'today-launching');
    expect(launching).toHaveLength(1);
    // It was the edition's outline, and the edition then landed under Your
    // MP and the guide card.
    expect(launching[0]!.children).toHaveLength(0);
    expect(hosts(r, 'today-edition-loading')).toHaveLength(0);
    layOut(r);
    expect(releaseSplash).not.toHaveBeenCalled();
    await act(async () =>
      choiceRead.answer({
        version: 1,
        seatId: grayndler.electorate_id,
        stateSeatIds: [],
      }),
    );
    expect(releaseSplash).toHaveBeenCalledWith('today');
    expect(blocks(r.root)[0]).toBe('today-your-mp');
  });

  test('a choice kept from 1.0 that is not a House seat: the next launch leads with the invitation from its first frame', async () => {
    const senate = index.electorates.find(
      (s) => s.jurisdiction === 'federal' && s.chamber === 'senate',
    )!;
    const legacy = {
      version: 1 as const,
      seatId: senate.electorate_id,
      stateSeatIds: [],
    };
    // The first launch has only the saved choice to go by.
    setUp({ cached: { date: addDays(today, -1) } });
    jest.mocked(loadChoice).mockResolvedValue(legacy);
    const first = await render(<Today />);
    expect(blocks(first.root)).toContain('today-invitation');
    expect(blocks(first.root)).not.toContain('today-your-mp');
    // What the directory answered is kept for this choice.
    await expect(readTodayShape()).resolves.toEqual({
      key: shapeKey(legacy),
      house: false,
      state: false,
    });
    // The next launch, the directory still out: no Your MP skeleton and no
    // reorder when the migration runs. It happened on every launch.
    setUp({ cached: { date: addDays(today, -1) } });
    jest.mocked(loadChoice).mockResolvedValue(legacy);
    const directoryRead = pending<typeof directory>();
    mock.directory.mockReturnValue(directoryRead.promise as never);
    const next = await render(<Today />);
    expect(blocks(next.root)).not.toContain('today-your-mp-pending');
    const before = blocks(next.root);
    expect(before).toContain('today-invitation');
    await act(async () => directoryRead.answer(directory));
    expect(blocks(next.root)).toEqual(before);
  });

  test('a kept shape for another choice is not used, and a kept state seat card holds its place beside Your MP', async () => {
    const choice = {
      version: 1 as const,
      seatId: grayndler.electorate_id,
      stateSeatIds: [],
    };
    await rememberTodayShape({ key: 'another|', house: false, state: true });
    setUp({ seat: true, cached: { date: addDays(today, -1) } });
    mock.directory.mockImplementation(() => new Promise(() => {}));
    const other = await render(<Today />);
    expect(blocks(other.root)[0]).toBe('today-your-mp-pending');
    expect(hosts(other, 'today-state-seat-pending')).toHaveLength(0);
    // The last launch drew a state seat card for this choice.
    await rememberTodayShape({
      key: shapeKey(choice),
      house: true,
      state: true,
    });
    setUp({ seat: true, cached: { date: addDays(today, -1) } });
    mock.directory.mockImplementation(() => new Promise(() => {}));
    const r = await render(<Today />);
    expect(hosts(r, 'today-state-seat-pending')).toHaveLength(1);
    expect(hosts(r, 'today-your-mp-pending')).toHaveLength(1);
  });

  test('a held, empty sitting line is given back once Today is out of view', async () => {
    setUp({ cached: { date: addDays(today, -1) } });
    const calendarRead = pending<null>();
    mock.sittingDays.mockReturnValueOnce(calendarRead.promise as never);
    const r = await render(<Today />);
    await act(async () => calendarRead.answer(null));
    // No calendar: the held place stays while Today is on screen.
    expect(hosts(r, 'today-sitting-reserved')).toHaveLength(1);
    // Today loses focus (a page over it, another tab), then shows again.
    const blur = mockFocusEffects
      .map((effect) => effect() as unknown)
      .filter((left): left is () => void => typeof left === 'function');
    await act(async () => blur.forEach((leave) => leave()));
    expect(hosts(r, 'today-sitting-reserved')).toHaveLength(0);
  });

  test('with no saved calendar the sitting line’s place is held while the read is out, and stays held when it has no line', async () => {
    setUp({ cached: { date: addDays(today, -1) } });
    const calendarRead = pending<null>();
    mock.sittingDays.mockReturnValueOnce(calendarRead.promise as never);
    const r = await render(<Today />);
    // One line of the sitting line's own type, unseen by VoiceOver.
    const held = hosts(r, 'today-sitting-reserved');
    expect(held).toHaveLength(1);
    expect(held[0]!.props.accessible).toBe(false);
    expect(
      hosts(r, 'today-masthead')[0]!.findAll((n) => n === held[0]),
    ).toHaveLength(1);
    // The read answers "no calendar": nothing on screen moves up.
    await act(async () => calendarRead.answer(null));
    expect(hosts(r, 'today-sitting-reserved')).toHaveLength(1);
    expect(hosts(r, 'today-sitting')).toHaveLength(0);
  });

  test('a saved calendar that has no line holds no place', async () => {
    setUp({ cached: { date: addDays(today, -1) } });
    // Saved, and it cannot say (its coverage ended long ago).
    mock.sittingDaysSaved.mockResolvedValue({
      data: {
        timezone: 'Australia/Sydney',
        expires: '2001-01-01',
        coverage: { first: '2000-01-01', last: '2000-12-31' },
        days: [],
        years: [],
      },
      stale: false,
      savedAt: 1,
    } as never);
    mock.sittingDays.mockReturnValueOnce(new Promise(() => {}) as never);
    const r = await render(<Today />);
    expect(hosts(r, 'today-sitting-reserved')).toHaveLength(0);
    expect(hosts(r, 'today-sitting')).toHaveLength(0);
  });

  test('How parliament voted holds its place while its file is read, and is absent when the file is not there', async () => {
    setUp({ cached: { date: addDays(today, -1) } });
    const votesRead = pending<{ status: 'missing' }>();
    mock.recentDivisions.mockReturnValue(votesRead.promise as never);
    const r = await render(<Today />);
    // Its heading and skeleton sit between Bills and Just declared, so the
    // block is not inserted above Just declared when the file answers.
    const order = blocks(r.root);
    expect(order.indexOf('today-votes')).toBe(order.indexOf('today-bills') + 1);
    expect(order.indexOf('today-declarations')).toBe(
      order.indexOf('today-votes') + 1,
    );
    expect(hosts(r, 'today-votes-title')).not.toHaveLength(0);
    await act(async () => votesRead.answer({ status: 'missing' }));
    expect(blocks(r.root)).not.toContain('today-votes');
  });

  test('A: the edition’s slot holds its skeleton until a read answers, so the edition is not inserted above Bills', async () => {
    setUp({ seat: true, cached: { date: addDays(today, -1) } });
    mock.todayEdition.mockImplementation(() => new Promise(() => {}));
    const r = await render(<Today />);
    expect(blocks(r.root).slice(0, 3)).toEqual([
      'today-your-mp',
      'today-edition-loading',
      'today-following',
    ]);
  });

  test('the saved edition draws first, with no request, and is not marked a saved copy', async () => {
    setUp({ seat: true, cached: { date: addDays(today, -1) } });
    mock.todayEdition.mockImplementation(() => new Promise(() => {}));
    mock.todayEditionSaved.mockResolvedValue(editionAged(1));
    const r = await render(<Today />);
    expect(blocks(r.root).slice(0, 2)).toEqual([
      'today-your-mp',
      'today-edition-card',
    ]);
    expect(hosts(r, 'today-edition-loading')).toHaveLength(0);
    expect(r.root.findAllByType(OfflineLine)).toHaveLength(0);
  });

  test('the guide card’s setting is read before the page is drawn, so the card is never inserted above the edition', async () => {
    setUp({ seat: true, cached: { date: addDays(today, -1) } });
    const settingsRead = pending<undefined>();
    const load = jest
      .spyOn(learnSettings, 'loadLearnSettings')
      .mockReturnValue(settingsRead.promise as never);
    try {
      const r = await render(<Today />);
      // Everything else has answered: the body still waits for the setting.
      expect(load).toHaveBeenCalled();
      expect(hosts(r, 'today-launching')).toHaveLength(1);
      expect(blocks(r.root)).toEqual([]);
      await act(async () => settingsRead.answer(undefined));
      expect(hosts(r, 'today-launching')).toHaveLength(0);
      expect(blocks(r.root)[0]).toBe('today-your-mp');
    } finally {
      load.mockRestore();
    }
  });
});

/**
 * "Since your last visit" (Jake's conditions): the last-open time stays on
 * the device, the line states only how many more records the collection
 * holds, with its source, and links to Just added; no paid read; and the
 * line is held from the first frame or never drawn that visit.
 */
describe('since your last visit', () => {
  const hosts = (r: TestRenderer.ReactTestRenderer, id: string) =>
    r.root.findAll((n) => typeof n.type === 'string' && n.props.testID === id);
  const flat = (n: ReactTestInstance) =>
    (StyleSheet.flatten(
      typeof n.props.style === 'function'
        ? n.props.style({ pressed: false })
        : n.props.style,
    ) ?? {}) as Record<string, unknown>;
  const corpus = (total: number, checkedAt: string) =>
    ({
      data: { expected_resources: total, refresh: { checked_at: checkedAt } },
      stale: false,
      savedAt: 1,
    }) as never;
  const longAgo = () =>
    new Date(Date.now() - REFRESH_AFTER_MS - 60_000).toISOString();
  const pendingRead = () => {
    let answer!: (value: unknown) => void;
    const promise = new Promise((resolve) => {
      answer = resolve;
    });
    return { promise, answer };
  };
  /** A last visit, and the collection record saved then. */
  const visited = async (total = 1000, checkedAt = longAgo()) => {
    await rememberVisit({ openedAt: 1, total, checkedAt });
    setUp({ cached: { date: addDays(today, -1) } });
    mock.corpusSaved.mockResolvedValue(corpus(total, checkedAt));
    return checkedAt;
  };
  const leaveAndReturn = async () => {
    const blur = mockFocusEffects
      .map((effect) => effect() as unknown)
      .filter((left): left is () => void => typeof left === 'function');
    await act(async () => blur.forEach((leave) => leave()));
  };

  test('the first ever launch draws no line and holds no place; it keeps the visit on the device', async () => {
    setUp({ cached: { date: addDays(today, -1) } });
    mock.corpus.mockResolvedValue(corpus(1000, '2026-11-15T03:00:00+00:00'));
    const r = await render(<Today />);
    expect(hosts(r, 'today-since')).toHaveLength(0);
    expect(hosts(r, 'today-since-reserved')).toHaveLength(0);
    const kept = await readVisit();
    expect(kept).toMatchObject({
      total: 1000,
      checkedAt: '2026-11-15T03:00:00+00:00',
    });
    expect(Math.abs(kept!.openedAt - Date.now())).toBeLessThan(60_000);
  });

  test('a later visit: the place is held from the first frame, then states the count with its source and opens Just added', async () => {
    await visited();
    const read = pendingRead();
    mock.corpus.mockReturnValue(read.promise as never);
    const r = await render(<Today />);
    // The record is still out: the line's place is already under the date,
    // unseen, unread and not a button yet.
    const held = hosts(r, 'today-since-reserved');
    expect(held).not.toHaveLength(0);
    const place = held.at(-1)!;
    expect(place.props.accessible).toBe(false);
    expect(place.props.importantForAccessibility).toBe('no-hide-descendants');
    expect(
      hosts(r, 'today-masthead')[0]!.findAll((n) => n === place),
    ).toHaveLength(1);
    expect(hosts(r, 'today-since-words')).toHaveLength(0);
    const box = flat(place);
    await act(async () =>
      read.answer(corpus(1412, '2026-11-15T03:00:00+00:00')),
    );
    expect(hosts(r, 'today-since-reserved')).toHaveLength(0);
    const line = hosts(r, 'today-since').at(-1)!;
    // The same box, before and after: nothing under it moves.
    expect(flat(line)).toEqual(box);
    expect(line.props.accessibilityRole).toBe('link');
    expect(line.props.accessibilityLabel).toBe(
      '412 more records in OPAX since your last visit. As at 15 Nov 2026, OPAX collection coverage record.',
    );
    expect(line.props.accessibilityLabel).not.toMatch(/—|–/);
    expect(line.props.accessibilityHint).toBe('Opens Just added');
    // It opens Just added; touch and hold, or its action, opens the sources.
    jest.mocked(router.push).mockClear();
    const owner = r.root.findAll(
      (n) => n.props.testID === 'today-since' && !!n.props.onPress,
    )[0]!;
    act(() => owner.props.onPress());
    expect(router.push).toHaveBeenCalledWith(recentRecordsRoute);
    const present = jest
      .spyOn(sheets, 'presentSource')
      .mockImplementation(() => undefined);
    try {
      act(() => owner.props.onLongPress());
      expect(present).toHaveBeenCalledTimes(1);
      expect(present.mock.calls[0]![0]).toMatchObject({
        asOf: '2026-11-15T03:00:00+00:00',
        citation: 'OPAX collection coverage record',
        originals: [{ url: '/corpus.json' }],
      });
      expect(line.props.accessibilityActions).toEqual([
        { name: 'sources', label: 'Sources' },
      ]);
      act(() =>
        owner.props.onAccessibilityAction({
          nativeEvent: { actionName: 'sources' },
        }),
      );
      expect(present).toHaveBeenCalledTimes(2);
    } finally {
      present.mockRestore();
    }
    // The visit kept for next time is this one.
    await expect(readVisit()).resolves.toMatchObject({ total: 1412 });
  });

  test('the place is as tall as the longest line can be: the unseen longest copy sets its size and the line is drawn over it', async () => {
    await visited();
    mock.corpus.mockResolvedValue(corpus(1001, '2026-11-15T03:00:00+00:00'));
    const r = await render(<Today />);
    // The size comes from the longest copy, in the line's own type, inside
    // the line's own box (its padding and hug), never from the line drawn.
    const size = hosts(r, 'today-since-place').at(-1)!;
    const sizer = r.root.findAll(
      (n) => n.type === Text && n.props.testID === 'today-since-place',
    )[0]!;
    expect(sizer.props.children).toBe(LONGEST_LINE);
    expect(sizer.props.variant).toBe('secondary');
    expect(StyleSheet.flatten(size.props.style)).toMatchObject({ opacity: 0 });
    const source = sinceSourceWords('2026-09-28');
    for (const words of [
      sinceWords(0),
      sinceWords(1),
      sinceWords(1234),
      sinceWords(8_888_888),
    ])
      expect(LONGEST_LINE.length).toBeGreaterThanOrEqual(
        `${words}. ${source}`.length,
      );
    // The drawn line takes no space of its own: it sits over the place, at
    // the place's width, so a shorter line leaves the box as it was.
    const drawnText = r.root.findAll(
      (n) => n.type === Text && n.props.testID === 'today-since-words',
    )[0]!;
    expect(drawnText.props.variant).toBe(sizer.props.variant);
    expect(drawnText.props.maxFontSizeMultiplier).toBe(
      sizer.props.maxFontSizeMultiplier,
    );
    expect(StyleSheet.flatten(drawnText.props.style)).toMatchObject({
      position: 'absolute',
      left: rhythm.tight,
      right: rhythm.tight,
    });
    expect(flat(hosts(r, 'today-since').at(-1)!)).toMatchObject({
      paddingHorizontal: rhythm.tight,
      marginHorizontal: -rhythm.tight,
    });
  });

  test('a held place is never left blank: a total that did not grow says so, with the same source and link', async () => {
    await visited();
    // The total fell: never a negative or a "fewer" line.
    mock.corpus.mockResolvedValue(corpus(990, '2026-11-15T03:00:00+00:00'));
    const r = await render(<Today />);
    expect(hosts(r, 'today-since-reserved')).toHaveLength(0);
    const line = hosts(r, 'today-since').at(-1)!;
    expect(line.props.accessibilityLabel).toBe(
      'The OPAX record count hasn’t grown since your last visit. As at 15 Nov 2026, OPAX collection coverage record.',
    );
    expect(line.props.accessibilityRole).toBe('link');
    expect(line.props.accessibilityHint).toBe('Opens Just added');
  });

  test('a record that cannot be reached: the saved copy answers with its own date, so a held place always ends in a line', async () => {
    const checked = await visited(1000, '2026-11-13T03:00:00+00:00');
    // setUp leaves the collection record unreachable.
    const r = await render(<Today />);
    expect(hosts(r, 'today-since-reserved')).toHaveLength(0);
    expect(hosts(r, 'today-since').at(-1)!.props.accessibilityLabel).toBe(
      'The OPAX record count hasn’t grown since your last visit. As at 13 Nov 2026, OPAX collection coverage record.',
    );
    await expect(readVisit()).resolves.toMatchObject({
      total: 1000,
      checkedAt: checked,
    });
  });

  test('nothing saved on the device holds no place, and a count that arrives is never inserted', async () => {
    await rememberVisit({ openedAt: 1, total: 1000, checkedAt: longAgo() });
    setUp({ cached: { date: addDays(today, -1) } });
    mock.corpus.mockResolvedValue(corpus(1412, '2026-11-15T03:00:00+00:00'));
    const r = await render(<Today />);
    expect(hosts(r, 'today-since')).toHaveLength(0);
    expect(hosts(r, 'today-since-reserved')).toHaveLength(0);
  });

  test('a visit soon after the last holds no place, and a count that arrives is never inserted', async () => {
    await visited(1000, new Date().toISOString());
    mock.corpus.mockResolvedValue(corpus(1412, new Date().toISOString()));
    const r = await render(<Today />);
    expect(hosts(r, 'today-since')).toHaveLength(0);
    expect(hosts(r, 'today-since-reserved')).toHaveLength(0);
  });

  test('a drawn line stays for the life of the screen: leaving Today and coming back removes nothing', async () => {
    await visited();
    mock.corpus.mockResolvedValue(corpus(1412, '2026-11-15T03:00:00+00:00'));
    const r = await render(<Today />);
    const before = hosts(r, 'today-since').at(-1)!.props.accessibilityLabel;
    await leaveAndReturn();
    expect(hosts(r, 'today-since').at(-1)!.props.accessibilityLabel).toBe(
      before,
    );
    // Nor does the app leaving the screen (it used to give the line back,
    // and the page moved on return).
    await visited();
    mock.corpus.mockResolvedValue(corpus(1412, '2026-11-15T03:00:00+00:00'));
    const again = await render(<Today />);
    const listeners = (
      AppState.addEventListener as unknown as {
        mock?: { calls: [string, (state: string) => void][] };
      }
    ).mock;
    await act(async () =>
      (listeners?.calls ?? [])
        .filter(([type]) => type === 'change')
        .forEach(([, handler]) => handler('background')),
    );
    expect(hosts(again, 'today-since')).not.toHaveLength(0);
  });

  test('the count is the collection record’s, free to read: no paid read, and nothing but the catalogue is asked', async () => {
    await visited();
    mock.corpus.mockResolvedValue(corpus(1001, '2026-11-15T03:00:00+00:00'));
    const r = await render(<Today />);
    expect(mock.corpus).toHaveBeenCalledTimes(1);
    // No argument carries the last-open time anywhere.
    expect(mock.corpus.mock.calls[0]).toEqual([]);
    expect(mock.corpusSaved.mock.calls[0]).toEqual([]);
    expect(hosts(r, 'today-since').at(-1)!.props.accessibilityLabel).toMatch(
      /^1 more record in OPAX since your last visit\./,
    );
  });

  test('the wording and the hold rule', () => {
    expect(sinceWords(12)).toBe(
      '12 more records in OPAX since your last visit',
    );
    expect(sinceWords(1234)).toBe(
      '1,234 more records in OPAX since your last visit',
    );
    const visit = {
      openedAt: 0,
      total: 1,
      checkedAt: '2026-11-14T03:00:00+00:00',
    };
    const checked = Date.parse(visit.checkedAt);
    expect(refreshLikely(visit, checked + REFRESH_AFTER_MS - 1)).toBe(false);
    expect(refreshLikely(visit, checked + REFRESH_AFTER_MS)).toBe(true);
    expect(refreshLikely({ ...visit, checkedAt: 'unknown' }, checked)).toBe(
      false,
    );
  });
});

describe('Today scroll range', () => {
  const event = (y: number, height = 3000, viewport = 700) => ({
    nativeEvent: {
      contentOffset: { x: 0, y },
      contentInset: { top: 160, bottom: 83, left: 0, right: 0 },
      contentSize: { width: 402, height },
      layoutMeasurement: { width: 402, height: viewport },
    },
  });
  const prepare = async (enabled = true) => {
    const ref = createRef<ScrollView>();
    const onScroll = jest.fn();
    const onLayout = jest.fn();
    const r = await render(
      <Screen
        grouped
        scrollRef={ref}
        clampScrollOnContentChange={enabled}
        onScroll={onScroll}
        onLayout={onLayout}
        refreshControl={
          <RefreshControl refreshing={false} onRefresh={jest.fn()} />
        }
      >
        <View testID="last-block" />
      </Screen>,
    );
    const view = r.root.findByType(ScrollView);
    expect(ref.current).toBe(view.instance);
    const scrollTo = jest.fn();
    ref.current!.scrollTo = scrollTo;
    act(() => {
      view.props.onLayout({
        nativeEvent: { layout: { x: 0, y: 0, width: 402, height: 700 } },
      });
      view.props.onContentSizeChange?.(402, 3000);
      view.props.onScroll(event(2383));
    });
    return { r, view, scrollTo, onScroll, onLayout };
  };
  test('repairs repeated shrinks and late momentum, using the measured insets', async () => {
    const { view, scrollTo, onScroll, onLayout } = await prepare();
    act(() => view.props.onContentSizeChange(402, 1000));
    expect(scrollTo).toHaveBeenLastCalledWith({ y: 383, animated: false });
    act(() => view.props.onScroll(event(2200))); // A stale event still has the old size.
    expect(scrollTo).toHaveBeenLastCalledWith({ y: 383, animated: false });
    act(() => view.props.onMomentumScrollEnd(event(383, 1000)));
    scrollTo.mockClear();
    act(() => {
      view.props.onScroll(event(300, 1000));
      view.props.onContentSizeChange(402, 800);
    });
    expect(scrollTo).toHaveBeenLastCalledWith({ y: 183, animated: false });
    expect(onScroll).toHaveBeenLastCalledWith(300);
    expect(onLayout).toHaveBeenCalledTimes(1);
  });
  test('short content returns to the expanded title rather than leaving a blank viewport', async () => {
    const { view, scrollTo } = await prepare();
    act(() => view.props.onContentSizeChange(402, 200));
    expect(scrollTo).toHaveBeenLastCalledWith({ y: -160, animated: false });
    act(() => view.props.onScrollEndDrag(event(-160, 200)));
    scrollTo.mockClear();
    act(() => view.props.onContentSizeChange(402, 200));
    expect(scrollTo).not.toHaveBeenCalled();
  });
  test('a larger viewport also clamps a reader at the old end', async () => {
    const { view, scrollTo } = await prepare();
    act(() =>
      view.props.onLayout({
        nativeEvent: {
          layout: { x: 0, y: 0, width: 874, height: 900 },
        },
      }),
    );
    expect(scrollTo).toHaveBeenLastCalledWith({ y: 2183, animated: false });
  });
  test('growth, unchanged heights, normal bounce and pull-to-refresh do not move the reader', async () => {
    const { view, scrollTo } = await prepare();
    act(() => {
      view.props.onContentSizeChange(402, 3000);
      view.props.onScroll(event(2450));
      view.props.onContentSizeChange(402, 3500);
      view.props.onScrollEndDrag(event(-230, 3500));
      view.props.onContentSizeChange(402, 1000);
    });
    expect(scrollTo).not.toHaveBeenCalled();
    expect(view.props.refreshControl.type).toBe(RefreshControl);
  });
  test('Today retains only the standard bottom gap and native bar adjustment', async () => {
    const { view } = await prepare();
    expect(
      StyleSheet.flatten(view.props.contentContainerStyle).paddingBottom,
    ).toBe(rhythm.section);
    expect(view.props.contentInsetAdjustmentBehavior).toBe('automatic');
    expect(view.props.contentInset).toBeUndefined();
  });
  test('other screens keep their existing scroll behaviour', async () => {
    const { view, scrollTo } = await prepare(false);
    expect(view.props.onContentSizeChange).toBeUndefined();
    expect(view.props.onScrollEndDrag).toBeUndefined();
    expect(view.props.onMomentumScrollEnd).toBeUndefined();
    expect(scrollTo).not.toHaveBeenCalled();
  });
  test('the animated callback ref keeps the native view through content updates', async () => {
    const ref = jest.fn();
    const page = (label: string) => (
      <Screen clampScrollOnContentChange scrollRef={ref}>
        <View testID={label} />
      </Screen>
    );
    const r = await render(page('loading'));
    const nativeView = r.root.findByType(ScrollView).instance;
    expect(ref).toHaveBeenCalledTimes(1);
    expect(ref).toHaveBeenLastCalledWith(nativeView);
    act(() => r.update(page('ready')));
    expect(ref).toHaveBeenCalledTimes(1);
    act(() => r.unmount());
    expect(ref).toHaveBeenLastCalledWith(null);
  });
});

describe('the invitation’s line', () => {
  const seat = (
    over: Partial<Parameters<typeof invitationBody>[0] & object>,
  ) => ({
    name: 'Grayndler',
    status: 'current',
    chamber: 'representatives',
    jurisdiction: 'federal',
    ...over,
  });
  test('the plain ask, an abolished seat, and a 1.0 choice set aside', () => {
    expect(invitationBody(null)).toBe(
      'Your MP is the one person elected to speak for your area in Parliament. Find your electorate to meet them.',
    );
    expect(invitationBody(seat({ name: 'Wills', status: 'historical' }))).toBe(
      'Wills is no longer an electorate.',
    );
    expect(
      invitationBody(seat({ name: 'New South Wales', chamber: 'senate' })),
    ).toBe('Choose your current federal electorate.');
  });
});

describe('the first second and the last line (sweep 3, lane A)', () => {
  const restore: (() => void)[] = [];
  afterEach(() => restore.splice(0).forEach((undo) => undo()));
  const hosts = (r: TestRenderer.ReactTestRenderer, id: string) =>
    r.root.findAll((n) => typeof n.type === 'string' && n.props.testID === id);
  test('the dot map draws in the first frame, neutral, holding the date’s place; the seat then tints it', async () => {
    setUp({ seat: true, cached: { date: addDays(today, -1) } });
    // A compact phone: the map is not drawn on a regular-width phone.
    const window = Dimensions.get('window');
    const screen = Dimensions.get('screen');
    Dimensions.set({
      window: { width: 402, height: 874, scale: 3, fontScale: 1 },
      screen: { width: 402, height: 874, scale: 3, fontScale: 1 },
    });
    restore.push(() => Dimensions.set({ window, screen }));
    let answer!: (choice: Awaited<ReturnType<typeof loadChoice>>) => void;
    jest.mocked(loadChoice).mockReturnValue(
      new Promise((resolve) => {
        answer = resolve;
      }),
    );
    const r = await render(<Today />);
    // The seat is still being read: the launch skeleton is up, and the map
    // with its clearance already sits ahead of the date (crop-01: none, and
    // the date dropped 16 pt when it came).
    expect(hosts(r, 'today-launching')).toHaveLength(1);
    const dots = r.root.findByType(AustraliaDots);
    expect(dots.props).toMatchObject({ state: null, neutral: true });
    const masthead = hosts(r, 'today-masthead')[0]!;
    const order = masthead
      .findAll(
        (n) =>
          typeof n.type === 'string' &&
          ['today-australia-dots-clearance', 'today-screen-message'].includes(
            n.props.testID,
          ),
      )
      .map((n) => n.props.testID);
    expect([...new Set(order)]).toEqual([
      'today-australia-dots-clearance',
      'today-screen-message',
    ]);
    await act(async () =>
      answer({ version: 1, seatId: grayndler.electorate_id, stateSeatIds: [] }),
    );
    expect(r.root.findByType(AustraliaDots).props).toMatchObject({
      state: 'nsw',
      neutral: false,
    });
    expect(hosts(r, 'today-australia-dots-clearance')).toHaveLength(1);
  });

  test('the page ends on the day’s sentence, above the independence line', async () => {
    setUp({ cached: { date: addDays(today, -1) } });
    const r = await render(<Today />);
    const foot = r.root.findByType(TodayFoot);
    // The sitting line's own read, asked once for both lines.
    expect(foot.props.ending).toMatchObject({ sitting: { record: null } });
    expect(mock.sittingDays).toHaveBeenCalledTimes(1);
    // The masthead's own date; no sitting calendar in this suite, so the
    // date alone.
    expect(strings(hosts(r, 'today-ending')[0]!)).toBe(
      `That’s the record for ${mastheadDate(r.root.findByType(Masthead).props.now)}.`,
    );
  });

  test('the late slot’s edition card draws its plate finished; the top slot’s draws', async () => {
    setUp({ cached: null, edition: editionAged(7) });
    const late = await render(<Today />);
    expect(blocks(late.root).indexOf('today-edition-card')).toBeGreaterThan(
      blocks(late.root).indexOf('today-declarations'),
    );
    expect(late.root.findByType(TodayEditionCard).props.still).toBe(true);
    setUp({ cached: { date: addDays(today, -1) } });
    const top = await render(<Today />);
    expect(blocks(top.root)[0]).toBe('today-edition-card');
    expect(top.root.findByType(TodayEditionCard).props.still).toBe(false);
  });

  test('no ending while the masthead says it shows a saved copy', async () => {
    setUp({ edition: { ...editionAged(1), savedAt: 1 } });
    jest.mocked(useNetworkState).mockReturnValue({ isConnected: false });
    try {
      const r = await render(<Today />);
      expect(r.root.findAllByType(OfflineLine)).toHaveLength(1);
      expect(r.root.findByType(TodayFoot).props.ending).toBeUndefined();
      expect(hosts(r, 'today-ending')).toHaveLength(0);
    } finally {
      jest.mocked(useNetworkState).mockReturnValue({});
    }
  });
});

describe('offline on a first install, nothing saved', () => {
  const offlineError = {
    status: 'error',
    data: null,
    asAt: null,
    sources: [],
    stale: false,
    savedAt: null,
    error: { code: 'offline', message: 'Failed.' },
  } as never;
  const hosts = (r: TestRenderer.ReactTestRenderer, id: string) =>
    r.root.findAll((n) => typeof n.type === 'string' && n.props.testID === id);
  const settle = async () => {
    for (let i = 0; i < 10; i++)
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
  };
  function offlineFirstInstall() {
    setUp({ cached: 'missing' });
    jest.mocked(useNetworkState).mockReturnValue({ isConnected: false });
    mock.todayEdition.mockResolvedValue(offlineError);
    mock.todayBills.mockResolvedValue(offlineError);
    mock.todayDeclarations.mockResolvedValue(offlineError);
    mock.todayDeclarationsProfiled.mockResolvedValue(offlineError);
  }
  afterEach(() => jest.mocked(useNetworkState).mockReturnValue({}));

  test('the page settles: Bills says so once, the blocks stay aside, the reads stop, and no closing line', async () => {
    offlineFirstInstall();
    const r = await render(<Today />);
    await settle();
    // Before the latch the blocks remounted on every report and read again
    // (416 Bills reads before the page stopped settling).
    expect(mock.todayBills.mock.calls.length).toBeLessThanOrEqual(2);
    const reads = mock.todayBills.mock.calls.length;
    await settle();
    expect(mock.todayBills).toHaveBeenCalledTimes(reads);
    expect(hosts(r, 'today-unavailable')).not.toHaveLength(0);
    expect(blocks(r.root)).not.toContain('today-bills');
    expect(blocks(r.root)).not.toContain('today-declarations');
    expect(r.root.findByType(TodayFoot).props.ending).toBeUndefined();
    expect(hosts(r, 'today-ending')).toHaveLength(0);
  });

  test('an edition that arrives with the background re-read ends the hold, with no pull', async () => {
    offlineFirstInstall();
    let late!: (block: c.Block<c.EditionView>) => void;
    // The launch read fails offline; the background re-read answers later.
    mock.todayEdition.mockResolvedValueOnce(offlineError).mockReturnValueOnce(
      new Promise((resolve) => {
        late = resolve;
      }),
    );
    const r = await render(<Today />);
    await settle();
    expect(hosts(r, 'today-unavailable')).not.toHaveLength(0);
    expect(blocks(r.root)).not.toContain('today-edition-card');
    const bills = mock.todayBills.mock.calls.length;
    await act(async () => late(editionAged(1)));
    await settle();
    // Drawn from the answer already in hand: no new attempt, no pull.
    expect(blocks(r.root)).toContain('today-edition-card');
    expect(hosts(r, 'today-unavailable')).toHaveLength(0);
    expect(mock.todayEdition).toHaveBeenCalledTimes(2);
    expect(mock.todayEdition.mock.calls.map(([refresh]) => refresh)).toEqual([
      false,
      'background',
    ]);
    // Bills comes back to say it could not load, once, and the page rests.
    expect(mock.todayBills.mock.calls.length - bills).toBeLessThanOrEqual(2);
    const settled = mock.todayBills.mock.calls.length;
    await settle();
    expect(mock.todayBills).toHaveBeenCalledTimes(settled);
  });

  test('coming back online retries once', async () => {
    offlineFirstInstall();
    const r = await render(<Today />);
    await settle();
    const edition = mock.todayEdition.mock.calls.length;
    const bills = mock.todayBills.mock.calls.length;
    // Still failing after the retry, so the page settles again.
    jest.mocked(useNetworkState).mockReturnValue({ isConnected: true });
    await act(async () => r.update(<Today />));
    await settle();
    // One new attempt: the edition is asked again once, with a refresh,
    // and Bills reads once more.
    expect(mock.todayEdition.mock.calls.slice(edition)).toEqual([[true]]);
    expect(mock.todayBills.mock.calls.length - bills).toBe(1);
    await settle();
    expect(mock.todayEdition.mock.calls.length).toBe(edition + 1);
    expect(hosts(r, 'today-unavailable')).not.toHaveLength(0);
  });

  test('a device that was never offline does not retry on its own', async () => {
    offlineFirstInstall();
    // Reads fail as offline while the device reports a connection.
    jest.mocked(useNetworkState).mockReturnValue({ isConnected: true });
    const r = await render(<Today />);
    await settle();
    const edition = mock.todayEdition.mock.calls.length;
    await act(async () => r.update(<Today />));
    await settle();
    expect(mock.todayEdition).toHaveBeenCalledTimes(edition);
    expect(hosts(r, 'today-unavailable')).not.toHaveLength(0);
  });
});

test.each(['edition', 'bills', 'declarations'] as const)(
  'device offline state draws one line for a fresh saved %s block',
  async (cached) => {
    setUp({ edition: { ...editionAged(1), savedAt: 1 } });
    jest.mocked(useNetworkState).mockReturnValue({ isConnected: false });
    if (cached !== 'edition')
      mock.todayEdition.mockResolvedValue({
        status: 'missing',
        data: null,
        asAt: null,
        sources: [],
        stale: false,
        savedAt: null,
      });
    if (cached === 'bills')
      mock.todayBills.mockResolvedValue({
        ...c.recentBillsFor(bills, 3),
        savedAt: 1,
        stale: false,
      });
    if (cached === 'declarations') {
      const saved = { ...declarations, savedAt: 1, stale: false };
      mock.todayDeclarations.mockResolvedValue(saved);
      mock.todayDeclarationsProfiled.mockResolvedValue(saved);
    }
    const r = await render(<Today />);
    try {
      expect(r.root.findAllByType(OfflineLine)).toHaveLength(1);
      expect(r.root.findByType(OfflineLine).props.testID).toBe('today-offline');
    } finally {
      await act(async () => r.unmount());
      jest.mocked(useNetworkState).mockReturnValue({});
    }
  },
);

test.each([
  { offline: false, stale: true },
  { offline: false, stale: false },
  { offline: true, stale: true },
  { offline: true, stale: false },
])(
  'election overview stale=$stale only draws the offline line when offline=$offline',
  async ({ offline, stale }) => {
    setUp();
    const resolved = new Intl.DateTimeFormat().resolvedOptions();
    const zone = jest
      .spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions')
      .mockReturnValue({ ...resolved, timeZone: 'Australia/Melbourne' });
    jest.mocked(useElectionOverview).mockReturnValue({
      record: {
        data: decodeOverview(electionOverview),
        stale,
        savedAt: 0,
        asOf: null,
      },
      loading: true,
      error: null,
      retry: jest.fn(),
    });
    jest.mocked(useNetworkState).mockReturnValue({ isConnected: !offline });
    try {
      const r = await render(<Today />);
      expect(r.root.findByType(Masthead).props.offlineSavedAt).toBe(
        offline ? 0 : null,
      );
      expect(r.root.findAllByType(OfflineLine)).toHaveLength(offline ? 1 : 0);
    } finally {
      zone.mockRestore();
      jest.mocked(useNetworkState).mockReturnValue({});
    }
  },
);
