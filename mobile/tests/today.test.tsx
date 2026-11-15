import { useNetworkState } from 'expo-network';
import { act, createRef, type ReactElement, type ReactNode } from 'react';
import {
  HeaderHeightContext,
  NavigationContext,
  NavigationRouteContext,
} from 'expo-router/react-navigation';
import {
  ActionSheetIOS,
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
import { formatDate } from '../src/design/format';
import { rhythm } from '../src/design/tokens';
import { sinceWords } from '../src/features/today/SinceLastVisit';
import { SourceAffordance } from '../src/design/source';
import * as sheets from '../src/navigation/sheets';
import { router } from 'expo-router';
import { recentRecordsRoute } from '../src/navigation/routes';
import {
  readVisit,
  rememberVisit,
  SOURCE_LIMIT_DAYS,
  sourceCurrent,
} from '../src/features/today/visit-store';
import { Text } from '../src/design/text';
import * as learnSettings from '../src/features/learn/settings';
import { OfflineLine } from '../src/design/states';
import Today, { EDITION_HEADING } from '../src/features/Today';
import { WelcomePage } from '../src/features/welcome/Welcome';
import { AustraliaDots } from '../src/features/today/AustraliaDots';
import { TodayEditionCard } from '../src/features/today/FeaturedPeopleCard';
import { TodayFoot } from '../src/features/today/Foot';
import { Masthead, mastheadDate } from '../src/features/today/Masthead';
import {
  ElectionUnavailable,
  electionReads,
  useOverview as useElectionOverview,
} from '../src/features/vic-election/reads';
import { decodeOverview } from '../src/features/vic-election/decoders';
import electionOverview from '../scripts/fixtures/vic-election/overview.json';
import { readCachedEdition } from '../src/features/today/edition-store';
import { readInvitationDates } from '../src/features/today/invitation-store';
import {
  readTodayShape,
  rememberTodayShape,
  type TodayShape,
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
    // No saved directory unless a test says so.
    directorySaved: jest.fn(async () => null),
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
let mockElectionNow = new Date('2026-11-20T10:00:00+11:00');
jest.mock('../src/features/vic-election/clock', () => ({
  useElectionNow: () => mockElectionNow,
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
  mock.directorySaved.mockResolvedValue(null);
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
    // The group's rows hold its place while the directory is on its way.
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
        n.props.accessibilityLabel === 'Loading your representatives' &&
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
  test('Your representatives: a heading, one group with the member\u2019s row and its line; no records on Home', async () => {
    setUp({ seat: true, cached: { date: addDays(today, -1) } });
    const r = await render(<Today />);
    const card = r.root.find(
      (n) => typeof n.type === 'string' && n.props.testID === 'today-your-mp',
    );
    const ids = card
      .findAll((n) => typeof n.type === 'string' && !!n.props.testID)
      .map((n) => n.props.testID as string);
    expect(ids[1]).toBe('today-reps-heading');
    expect(ids).toContain('today-rep-federal');
    expect(ids).not.toContain('today-rep-state');
    expect(ids).toContain('today-reps-senators');
    expect(ids.filter((id) => id === 'today-your-mp-sources').length).toBe(1);
    for (const id of ids)
      expect(id).not.toMatch(/latest|declaration|your-mp-group|your-mp-mark/);
    expect(strings(card)).toContain('Your representatives');
    expect(strings(card)).toContain('Federal · Grayndler');
    // The eyebrow and its line are gone: the heading says whose they are.
    expect(strings(card)).not.toMatch(/Your MP\b/);
    expect(strings(card)).not.toContain('Represents you in federal parliament');
    expect(strings(card)).not.toMatch(/authoris/i);
  });
  test('the featured edition has its heading, in the heading style the representatives and the election share', async () => {
    setUp({ seat: true, cached: { date: today }, edition: editionAged(0) });
    const r = await render(<Today />);
    const heading = (id: string) =>
      r.root.findAll((n) => n.type === 'Text' && n.props.testID === id)[0]!;
    const edition = heading('today-edition-heading');
    const reps = heading('today-reps-heading');
    expect(strings(edition.parent!)).toContain(EDITION_HEADING);
    expect(EDITION_HEADING).toBe('Daily edition');
    expect(edition.props.accessibilityRole).toBe('header');
    // One text style for both, so side by side they share a baseline.
    expect(StyleSheet.flatten(edition.props.style)).toEqual(
      StyleSheet.flatten(reps.props.style),
    );
    expect(StyleSheet.flatten(edition.props.style)).toMatchObject({
      fontSize: StyleSheet.flatten(
        r.root.findAll(
          (n) => n.type === 'Text' && n.props.accessibilityRole === 'header',
        )[0]!.props.style,
      ).fontSize,
    });
    // The heading is over the card, in the card's own block.
    const block = r.root.findAll(
      (n) =>
        n.type === 'View' &&
        n.findAll((c) => c.props.testID === 'today-edition-heading').length >
          0 &&
        n.findAll((c) => c.props.testID === 'today-edition-card').length > 0,
    );
    expect(block.length).toBeGreaterThan(0);
    expect(StyleSheet.flatten(block.at(-1)!.props.style)).toMatchObject({
      gap: rhythm.tight,
    });
  });
  test('a featured parliamentarian’s day: the skeleton stands under the carousel’s own two-line heading, so nothing moves when the carousel lands', async () => {
    // The last launch kept the edition's kind with its date.
    setUp({ cached: { date: today, kind: 'politician' } });
    mock.todayEdition.mockImplementation(() => new Promise(() => {}));
    const r = await render(<Today />);
    const ids = r.root
      .findAll((n) => typeof n.type === 'string' && !!n.props.testID)
      .map((n) => n.props.testID as string);
    expect(ids).toContain('today-edition-loading');
    expect(ids).not.toContain('today-edition-heading');
    expect(ids.indexOf('today-featured-title')).toBeGreaterThan(-1);
    expect(ids.indexOf('today-featured-context')).toBeLessThan(
      ids.indexOf('today-edition-loading'),
    );
    // Any other saved edition keeps the one-line heading.
    setUp({ cached: { date: today, kind: 'bill' } });
    mock.todayEdition.mockImplementation(() => new Promise(() => {}));
    const plain = await render(<Today />);
    const plainIds = plain.root
      .findAll((n) => typeof n.type === 'string' && !!n.props.testID)
      .map((n) => n.props.testID as string);
    expect(plainIds).toContain('today-edition-heading');
    expect(plainIds).not.toContain('today-featured-title');
  });
  test('a featured parliamentarian’s edition whose people cannot be named still has a heading over its card', async () => {
    const base = editionAged(0);
    const edition = {
      ...base,
      data: { ...base.data!, kind: 'politician', title: 'Nobody By This Name' },
    } as typeof base;
    setUp({ seat: true, cached: { date: today }, edition });
    const r = await render(<Today />);
    const ids = r.root
      .findAll((n) => typeof n.type === 'string' && !!n.props.testID)
      .map((n) => n.props.testID as string);
    expect(ids).toContain('today-edition-card');
    expect(ids).not.toContain('today-featured-title');
    expect(ids.filter((id) => id === 'today-edition-heading')).toHaveLength(1);
    expect(ids.indexOf('today-edition-heading')).toBeLessThan(
      ids.indexOf('today-edition-card'),
    );
  });
  test('the saved edition’s kind is kept with its date for the next launch’s heading', async () => {
    const store = jest.requireActual('../src/features/today/edition-store');
    await store.rememberEdition(editionAged(0));
    await expect(store.readCachedEdition()).resolves.toEqual({
      date: editionAged(0).data!.date.slice(0, 10),
      kind: editionAged(0).data!.kind,
    });
  });
  test('the edition\u2019s heading stands over its skeleton, so the card never moves when the edition lands', async () => {
    setUp({ cached: null });
    mock.todayEdition.mockImplementation(() => new Promise(() => {}));
    const r = await render(<Today />);
    const ids = r.root
      .findAll((n) => typeof n.type === 'string' && !!n.props.testID)
      .map((n) => n.props.testID as string);
    expect(ids).toContain('today-edition-loading');
    expect(ids.indexOf('today-edition-heading')).toBeGreaterThan(-1);
    expect(ids.indexOf('today-edition-heading')).toBeLessThan(
      ids.indexOf('today-edition-loading'),
    );
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
    expect(hosts(r, 'today-rep-federal')).not.toHaveLength(0);
    // The heading was there from the first frame, and is the same one.
    expect(hosts(r, 'today-reps-heading')).toHaveLength(1);
  });

  test('the representatives\u2019 place has the group\u2019s shape: the heading, a row with a 44 pt portrait and the row\u2019s three lines of type, the senators row and the source band', async () => {
    setUp({ seat: true, cached: { date: addDays(today, -1) } });
    mock.directory.mockImplementation(() => new Promise(() => {}));
    const r = await render(<Today />);
    expect(hosts(r, 'today-reps-heading')).toHaveLength(1);
    // No kept shape and no saved state seat: one member row.
    expect(hosts(r, 'today-rep-federal-loading')).toHaveLength(1);
    expect(hosts(r, 'today-rep-state-loading')).toHaveLength(0);
    expect(hosts(r, 'today-reps-loading-senators')).toHaveLength(1);
    const row = hosts(r, 'today-rep-federal-loading')[0]!;
    // Unseen lines of the real text styles set the heights, so they follow
    // the text size as the loaded lines do.
    expect(
      row.findAll((n) => n.type === Text).map((n) => n.props.variant),
    ).toEqual(['name', 'secondary', 'secondary']);
    expect(flat(row)).toMatchObject({ paddingVertical: rhythm.row });
    expect(
      row.findAll(
        (n) =>
          n.type === 'View' && flat(n).width === 44 && flat(n).height === 44,
      ),
    ).toHaveLength(1);
    expect(flat(hosts(r, 'today-reps-loading-source')[0]!).minHeight).toBe(
      Platform.OS === 'android' ? 48 : 44,
    );
  });

  test('the tile draws from the directory at once, with no skeleton frame while its own read is out', async () => {
    setUp({ seat: true, cached: { date: addDays(today, -1) } });
    mock.yourMP.mockImplementation(() => new Promise(() => {}));
    const r = await render(<Today />);
    expect(hosts(r, 'today-your-mp-loading')).toHaveLength(0);
    expect(hosts(r, 'today-rep-federal')).not.toHaveLength(0);
    expect(strings(hosts(r, 'today-your-mp')[0]!)).toContain(
      'Federal · Grayndler',
    );
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
      senators: false,
      stateRow: null,
      members: null,
      withdrawn: false,
      electionDay: null,
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

  describe('the representatives group across launches', () => {
    const maribyrnong = index.electorates.find(
      (s) =>
        s.name === 'Maribyrnong' &&
        s.jurisdiction === 'federal' &&
        s.status !== 'historical',
    )!;
    const essendon = index.electorates.find(
      (s) => s.name === 'Essendon' && s.chamber === 'vic_la',
    )!;
    const victorian = {
      version: 1 as const,
      seatId: maribyrnong.electorate_id,
      stateSeatIds: [essendon.electorate_id],
    };
    const overview = decodeOverview(electionOverview);
    const record = (
      value: Partial<ReturnType<typeof useElectionOverview>> = {},
    ) =>
      jest.mocked(useElectionOverview).mockReturnValue({
        record: null,
        loading: false,
        error: null,
        retry: jest.fn(),
        ...value,
      });
    const atHand = { data: overview, stale: false, savedAt: 0, asOf: null };
    /** A launch for a saved choice, the directory held back until told. */
    const launch = async (
      choice: typeof victorian,
      election: Parameters<typeof record>[0] = {},
    ) => {
      setUp({ cached: { date: addDays(today, -1) } });
      jest.mocked(loadChoice).mockResolvedValue(choice);
      record(election);
      const directoryRead = pending<typeof directory>();
      mock.directory.mockReturnValue(directoryRead.promise as never);
      const r = await render(<Today />);
      return {
        r,
        answer: () => act(async () => directoryRead.answer(directory)),
      };
    };
    // The row's lines as they are kept. This suite draws at an accessibility
    // size, where the house line stacks its two parts with no dot
    // (drawnHouseLine): read back here as the line it was drawn from.
    const lines = (r: TestRenderer.ReactTestRenderer) =>
      r.root
        .findAll(
          (n) =>
            n.type === 'Text' &&
            /^today-rep-state-line-/.test(n.props.testID ?? ''),
        )
        .map((n) => String(n.props.children).replace('\n', '\u00a0·\u00a0'));
    const shared = jest.spyOn(electionReads, 'loadOverviewShared');
    beforeEach(() => {
      shared.mockReset();
      shared.mockResolvedValue(undefined);
    });
    const shape = (
      stateRow: TodayShape['stateRow'],
      withdrawn = false,
      electionDay: string | null = null,
    ) => ({
      key: shapeKey(victorian),
      house: true,
      state: true,
      senators: true,
      stateRow,
      // The federal member's words; the state row here is never a member's.
      members: {
        federal: {
          name: 'Jo Briskey',
          party: 'Labor',
          partyStatus: 'current' as const,
          role: 'Federal · Maribyrnong',
        },
        state: null,
      },
      withdrawn,
      electionDay,
    });

    test('a kept shape for another choice is not used; the kept shape for this choice sets the rows held for the group', async () => {
      const choice = {
        version: 1 as const,
        seatId: grayndler.electorate_id,
        stateSeatIds: [],
      };
      await rememberTodayShape({
        key: 'another|',
        house: false,
        state: true,
        senators: false,
        stateRow: { kind: 'member', until: null },
        withdrawn: false,
        electionDay: null,
      });
      setUp({ seat: true, cached: { date: addDays(today, -1) } });
      mock.directory.mockImplementation(() => new Promise(() => {}));
      const other = await render(<Today />);
      expect(blocks(other.root)[0]).toBe('today-your-mp-pending');
      expect(hosts(other, 'today-rep-state-loading')).toHaveLength(0);
      expect(hosts(other, 'today-reps-loading-senators')).toHaveLength(1);
      // The last launch drew a state member's row and no senators row.
      await rememberTodayShape({
        key: shapeKey(choice),
        house: true,
        state: true,
        senators: false,
        stateRow: { kind: 'member', until: null },
        withdrawn: false,
        electionDay: null,
      });
      setUp({ seat: true, cached: { date: addDays(today, -1) } });
      mock.directory.mockImplementation(() => new Promise(() => {}));
      const r = await render(<Today />);
      expect(hosts(r, 'today-rep-federal-loading')).toHaveLength(1);
      expect(hosts(r, 'today-rep-state-loading')).toHaveLength(1);
      expect(hosts(r, 'today-reps-loading-senators')).toHaveLength(0);
      expect(hosts(r, 'today-your-mp-pending')).toHaveLength(1);
    });

    test('dissolved: the four-line row’s place from the first frame, the row when the directory answers, and its lines kept for the next launch', async () => {
      const first = await launch(victorian, { record: atHand });
      // Nothing kept: the stand-in holds four lines, and no member's row.
      expect(hosts(first.r, 'today-rep-state-lines-loading')).toHaveLength(1);
      expect(hosts(first.r, 'today-rep-state-loading')).toHaveLength(0);
      expect(lines(first.r)).toHaveLength(4);
      await first.answer();
      expect(hosts(first.r, 'today-rep-state-dissolved')).toHaveLength(1);
      expect(hosts(first.r, 'today-rep-state')).toHaveLength(0);
      const drawn = lines(first.r);
      expect(drawn.slice(0, 3)).toEqual([
        'Victoria\u00a0·\u00a0Legislative Assembly',
        'Essendon',
        'Assembly dissolved for the 28 November election',
      ]);
      expect(drawn[3]).toMatch(/^Last member: /);
      await expect(readTodayShape()).resolves.toEqual(
        shape(
          {
            kind: 'dissolved',
            electionDay: overview.election_day,
            lines: drawn,
          },
          false,
          overview.election_day,
        ),
      );
      // The next launch holds the very lines it will draw, record or not.
      for (const election of [{ record: atHand }, {}]) {
        const next = await launch(victorian, election);
        expect(hosts(next.r, 'today-rep-state-lines-loading')).toHaveLength(1);
        expect(lines(next.r)).toEqual(drawn);
        await next.answer();
        expect(hosts(next.r, 'today-rep-state-dissolved')).toHaveLength(1);
        expect(lines(next.r)).toEqual(drawn);
      }
    });

    test('a kept member row answers while the record is out: a member’s place, then the member’s row, never the stand-in between', async () => {
      // The last launch decided the member (the result is loaded).
      await rememberTodayShape(shape({ kind: 'member', until: null }));
      const seen: string[][] = [];
      const forms = (r: TestRenderer.ReactTestRenderer) =>
        [
          'today-rep-state-loading',
          'today-rep-state-lines-loading',
          'today-rep-state',
          'today-rep-state-dissolved',
          'today-rep-state-neutral',
        ].filter((id) => hosts(r, id).length > 0);
      // The record is not at hand and is still said to be loading, as
      // after a withdrawal wipes the saved copy.
      const next = await launch(victorian, { loading: true });
      seen.push(forms(next.r));
      await next.answer();
      seen.push(forms(next.r));
      expect(seen).toEqual([['today-rep-state-loading'], ['today-rep-state']]);
      // Decided: Today asks for nothing more.
      expect(shared).not.toHaveBeenCalled();
    });

    test('no record and nothing kept: the neutral row from the first frame, and nobody is drawn as the member', async () => {
      const first = await launch(victorian);
      await expect(readTodayShape()).resolves.toBeNull();
      // The neutral stand-in's three lines hold the place.
      expect(hosts(first.r, 'today-rep-state-lines-loading')).toHaveLength(1);
      expect(lines(first.r)).toHaveLength(3);
      await first.answer();
      expect(hosts(first.r, 'today-rep-state-neutral')).toHaveLength(1);
      expect(hosts(first.r, 'today-rep-state')).toHaveLength(0);
      expect(hosts(first.r, 'today-rep-federal')).toHaveLength(1);
      expect(hosts(first.r, 'today-reps-senators')).toHaveLength(1);
      expect(lines(first.r)[2]).toMatch(/^On the roster at 9 Sep 2026: /);
      expect(strings(hosts(first.r, 'today-your-mp')[0]!)).not.toMatch(
        /member for|Victorian Legislative Assembly ·/,
      );
      // The old state seat card is gone: one group, not two cards.
      expect(hosts(first.r, 'today-state-seat')).toHaveLength(0);
      await expect(readTodayShape()).resolves.toEqual(
        shape({ kind: 'neutral', lines: lines(first.r) }),
      );
    });

    describe('the electorates index says it for itself (dissolved_for)', () => {
      const withField = (value: string | null) => ({
        ...directory,
        electorates: {
          ...directory.electorates,
          data: {
            ...index,
            electorates: index.electorates.map((s) =>
              s.electorate_id === essendon.electorate_id
                ? { ...s, dissolved_for: value }
                : s,
            ),
          },
        },
      });
      const launchWith = async (
        value: string | null,
        election: Parameters<typeof record>[0] = {},
      ) => {
        setUp({ cached: { date: addDays(today, -1) } });
        jest.mocked(loadChoice).mockResolvedValue(victorian);
        record(election);
        mock.directory.mockResolvedValue(withField(value) as never);
        return render(<Today />);
      };

      test('dissolved from the index alone: the four-line row with no election record and no request, in or out of the block’s window', async () => {
        const window = mockElectionNow;
        for (const now of [window, new Date('2027-02-01T10:00:00+11:00')]) {
          mockElectionNow = now;
          try {
            const r = await launchWith('2026-11-28', { loading: true });
            expect(hosts(r, 'today-rep-state-dissolved')).toHaveLength(1);
            expect(lines(r)[2]).toBe(
              'Assembly dissolved for the 28 November election',
            );
            expect(shared).not.toHaveBeenCalled();
          } finally {
            mockElectionNow = window;
          }
        }
        // Kept for that election, so the next launch holds the same lines.
        await expect(readTodayShape()).resolves.toMatchObject({
          electionDay: '2026-11-28',
          stateRow: { kind: 'dissolved', electionDay: '2026-11-28' },
        });
      });

      test('null in the index: the post-result roster is loaded, the member’s row draws and nothing is asked, even with a dissolved row kept', async () => {
        const kept = await launchWith('2026-11-28');
        expect(hosts(kept, 'today-rep-state-dissolved')).toHaveLength(1);
        const window = mockElectionNow;
        mockElectionNow = new Date('2027-02-01T10:00:00+11:00');
        try {
          const r = await launchWith(null, { loading: true });
          expect(hosts(r, 'today-rep-state')).toHaveLength(1);
          expect(hosts(r, 'today-rep-state-dissolved')).toHaveLength(0);
          expect(shared).not.toHaveBeenCalled();
        } finally {
          mockElectionNow = window;
        }
      });

      test('a kept dissolved row makes no request once the index carries the field', async () => {
        // Kept from the election record, before the field shipped.
        const before = await launch(victorian, { record: atHand });
        await before.answer();
        await expect(readTodayShape()).resolves.toMatchObject({
          stateRow: { kind: 'dissolved' },
        });
        // That screen is gone before the clock moves on.
        act(() => before.r.unmount());
        const window = mockElectionNow;
        mockElectionNow = new Date('2026-12-10T10:00:00+11:00');
        try {
          // No field yet, after the block retires: the kept row stands, and
          // the record is asked for once through the shared read.
          const without = await launch(victorian, { loading: true });
          await without.answer();
          expect(hosts(without.r, 'today-rep-state-dissolved')).toHaveLength(1);
          expect(shared).toHaveBeenCalledTimes(1);
          shared.mockClear();
          // The field lands: the same row, and no request at all.
          const r = await launchWith('2026-11-28', { loading: true });
          expect(hosts(r, 'today-rep-state-dissolved')).toHaveLength(1);
          expect(shared).not.toHaveBeenCalled();
        } finally {
          mockElectionNow = window;
        }
      });
    });

    describe('kept decisions belong to one election', () => {
      const next = {
        ...overview,
        election_day: '2030-11-30',
        key_dates: overview.key_dates.map((d) =>
          d.id === 'caretaker'
            ? { ...d, passes_at: '2026-11-01T18:00:00+11:00' }
            : d,
        ),
      };
      test('"member, decided" for one election does not stand once the record names another', async () => {
        await rememberTodayShape(
          shape({ kind: 'member', until: null }, false, overview.election_day),
        );
        const r = await launch(victorian, {
          record: { ...atHand, data: next },
        });
        await r.answer();
        expect(hosts(r.r, 'today-rep-state-dissolved')).toHaveLength(1);
        expect(lines(r.r)[2]).toBe(
          'Assembly dissolved for the 30 November election',
        );
        await expect(readTodayShape()).resolves.toMatchObject({
          electionDay: '2030-11-30',
          stateRow: { kind: 'dissolved', electionDay: '2030-11-30' },
        });
      });

      test('"withdrawn" for one election is reset when the index names another: the record may be asked for again', async () => {
        await rememberTodayShape(
          shape(
            { kind: 'neutral', lines: ['a', 'b', 'c'] },
            true,
            '2026-11-28',
          ),
        );
        // Still that election: withdrawn stands, nothing is asked.
        const window = mockElectionNow;
        mockElectionNow = new Date('2030-12-10T10:00:00+11:00');
        try {
          const same = await launch(victorian, { loading: true });
          await same.answer();
          expect(shared).not.toHaveBeenCalled();
          expect(hosts(same.r, 'today-rep-state-neutral')).toHaveLength(1);
          await expect(readTodayShape()).resolves.toMatchObject({
            withdrawn: true,
            electionDay: '2026-11-28',
          });
          // The record at hand is for a new election: decided afresh, and
          // withdrawn no longer kept.
          const fresh = await launch(victorian, {
            record: { ...atHand, data: next },
          });
          await fresh.answer();
          expect(hosts(fresh.r, 'today-rep-state-dissolved')).toHaveLength(1);
          await expect(readTodayShape()).resolves.toMatchObject({
            withdrawn: false,
            electionDay: '2030-11-30',
          });
        } finally {
          mockElectionNow = window;
        }
      });
    });

    describe('the election record is asked for once, only when the row needs it', () => {
      test('not for a saved choice with no Victorian state seat, whatever stray ids it holds', async () => {
        // A New South Wales seat saved with a stray state id: the read
        // migration sets the id aside, and Today asks for nothing.
        const nsw = index.electorates.find((s) => s.chamber === 'nsw_la')!;
        const stray = {
          version: 1 as const,
          seatId: grayndler.electorate_id,
          stateSeatIds: [nsw.electorate_id],
        };
        const out = await launch(stray, { loading: true });
        await out.answer();
        expect(hosts(out.r, 'today-rep-federal')).toHaveLength(1);
        expect(shared).not.toHaveBeenCalled();
        expect(jest.mocked(useElectionOverview)).not.toHaveBeenCalledWith(
          true,
          expect.anything(),
        );
        for (const call of jest.mocked(useElectionOverview).mock.calls)
          expect(call[0]).toBe(false);
      });

      test('after the election block retires, an undecided row asks once through the shared, cache-aware read', async () => {
        const window = mockElectionNow;
        mockElectionNow = new Date('2026-12-10T10:00:00+11:00');
        try {
          const out = await launch(victorian, { loading: true });
          // Not before the directory names the migrated state seat.
          expect(shared).not.toHaveBeenCalled();
          await out.answer();
          expect(shared).toHaveBeenCalledTimes(1);
          // Never the forced read, and never the hook's own trigger.
          for (const call of jest.mocked(useElectionOverview).mock.calls)
            expect(call[0]).toBe(false);
          // Held meanwhile: nobody is drawn as the member.
          expect(hosts(out.r, 'today-rep-state-lines-loading')).toHaveLength(1);
          expect(hosts(out.r, 'today-rep-state')).toHaveLength(0);
        } finally {
          mockElectionNow = window;
        }
      });

      test('not beside the election block’s own read, in its window', async () => {
        // The mocked election clock is inside the block's window.
        const out = await launch(victorian, { loading: true });
        await out.answer();
        expect(hosts(out.r, 'today-rep-state-lines-loading')).toHaveLength(1);
        expect(shared).not.toHaveBeenCalled();
      });

      test('not when the record is at hand, and not once it is withdrawn', async () => {
        const held = await launch(victorian, { record: atHand });
        await held.answer();
        expect(shared).not.toHaveBeenCalled();
        const gone = await launch(victorian, {
          error: new ElectionUnavailable('not_published'),
        });
        await gone.answer();
        expect(shared).not.toHaveBeenCalled();
        // Withdrawn is kept, so the next launch does not ask either; the
        // dissolved row the device kept still stands (no result is loaded).
        await expect(readTodayShape()).resolves.toMatchObject({
          withdrawn: true,
          stateRow: { kind: 'dissolved' },
        });
        const next = await launch(victorian, { loading: true });
        await next.answer();
        expect(hosts(next.r, 'today-rep-state-dissolved')).toHaveLength(1);
        expect(shared).not.toHaveBeenCalled();
      });
    });
  });

  /**
   * Nothing kept for the saved choice (the first launch of a build that
   * keeps the shape): the directory the device saved decides the first
   * frame, with no request. Each test fails without it: the page was laid
   * out from the choice as 1.0 wrote it.
   */
  describe('nothing kept: the saved directory decides the first frame', () => {
    const seatNamed = (name: string, chamber: string) =>
      index.electorates.find(
        (s) =>
          s.name === name && s.chamber === chamber && s.status !== 'historical',
      )!;
    const maribyrnong = seatNamed('Maribyrnong', 'representatives');
    const essendon = seatNamed('Essendon', 'vic_la');
    const senate = index.electorates.find(
      (s) => s.jurisdiction === 'federal' && s.chamber === 'senate',
    )!;
    /** The directory with what the index says of Essendon's house. */
    const saying = (value: string | null) => ({
      ...directory,
      electorates: {
        ...directory.electorates,
        data: {
          ...index,
          electorates: index.electorates.map((s) =>
            s.electorate_id === essendon.electorate_id
              ? { ...s, dissolved_for: value }
              : s,
          ),
        },
      },
    });
    /** A launch with nothing kept: a saved directory, the read held back. */
    const launch = async (
      choice: { seatId: string; stateSeatIds: string[] },
      held: typeof directory = directory,
    ) => {
      setUp({ cached: { date: addDays(today, -1) } });
      jest.mocked(loadChoice).mockResolvedValue({ version: 1, ...choice });
      mock.directorySaved.mockResolvedValue(held as never);
      const directoryRead = pending<typeof directory>();
      mock.directory.mockReturnValue(directoryRead.promise as never);
      const r = await render(<Today />);
      await expect(readTodayShape()).resolves.toBeNull();
      return {
        r,
        answer: () => act(async () => directoryRead.answer(held)),
      };
    };
    const lines = (r: TestRenderer.ReactTestRenderer) =>
      r.root
        .findAll(
          (n) =>
            n.type === 'Text' &&
            /^today-rep-state-line-/.test(n.props.testID ?? ''),
        )
        .map((n) => n.props.children);

    test.each([
      ['Senate', () => ({ seatId: senate.electorate_id, stateSeatIds: [] })],
      [
        'Victorian',
        () => ({ seatId: essendon.electorate_id, stateSeatIds: [] }),
      ],
    ])(
      'a 1.0 %s seatId draws the final layout in the first render, with no invitation after a skeleton',
      async (_name, choice) => {
        const first = await launch(choice());
        const before = blocks(first.r.root);
        expect(before).toContain('today-invitation');
        expect(before).not.toContain('today-your-mp-pending');
        expect(hosts(first.r, 'today-your-mp-loading')).toHaveLength(0);
        await first.answer();
        expect(blocks(first.r.root)).toEqual(before);
        // Decided from the disk: the one directory read is the seat's own.
        expect(mock.directory).toHaveBeenCalledTimes(1);
      },
    );

    test('the saved directory is read beside the launch reads, once, and not after them', async () => {
      setUp({ cached: { date: addDays(today, -1) } });
      jest.mocked(loadChoice).mockResolvedValue({
        version: 1,
        seatId: senate.electorate_id,
        stateSeatIds: [],
      });
      mock.directorySaved.mockResolvedValue(directory as never);
      mock.directory.mockReturnValue(new Promise(() => {}) as never);
      // The launch's own disk reads are still out.
      const dates = pending<Awaited<ReturnType<typeof readInvitationDates>>>();
      jest.mocked(readInvitationDates).mockReturnValue(dates.promise);
      const r = await render(<Today />);
      expect(hosts(r, 'today-launching')).toHaveLength(1);
      expect(mock.directorySaved).toHaveBeenCalledTimes(1);
      await act(async () =>
        dates.answer({ hiddenUntil: null, welcomeDeclinedAt: null }),
      );
      // The page is drawn from it at once, with no second read and no
      // request of its own.
      expect(blocks(r.root)).toContain('today-invitation');
      expect(blocks(r.root)).not.toContain('today-your-mp-pending');
      expect(mock.directorySaved).toHaveBeenCalledTimes(1);
      expect(mock.directory).toHaveBeenCalledTimes(1);
    });

    test('a federal and Victorian reader’s pending view reserves the state row at the final height', async () => {
      const victorian = {
        seatId: maribyrnong.electorate_id,
        stateSeatIds: [essendon.electorate_id],
      };
      // The index says the Assembly is dissolved: the four lines the row
      // will draw hold its place, under the one heading.
      const dissolved = await launch(victorian, saying('2026-11-28'));
      expect(hosts(dissolved.r, 'today-your-mp-pending')).toHaveLength(1);
      expect(hosts(dissolved.r, 'today-reps-heading')).toHaveLength(1);
      expect(hosts(dissolved.r, 'today-rep-state-lines-loading')).toHaveLength(
        1,
      );
      const held = lines(dissolved.r);
      expect(held).toHaveLength(4);
      await dissolved.answer();
      expect(hosts(dissolved.r, 'today-rep-state-dissolved')).toHaveLength(1);
      expect(hosts(dissolved.r, 'today-reps-heading')).toHaveLength(1);
      expect(lines(dissolved.r)).toEqual(held);
      // The index says the member sits: a member's row holds the place.
      mockWelcomeFiles.clear();
      const sitting = await launch(victorian, saying(null));
      expect(hosts(sitting.r, 'today-rep-state-loading')).toHaveLength(1);
      expect(hosts(sitting.r, 'today-rep-state-lines-loading')).toHaveLength(0);
      await sitting.answer();
      expect(hosts(sitting.r, 'today-rep-state')).toHaveLength(1);
    });

    test('an NSW reader’s pending view reserves nothing for a state row', async () => {
      // A state seat id left beside an NSW seat: the migration sets it
      // aside, so no row follows and none is held.
      const first = await launch({
        seatId: grayndler.electorate_id,
        stateSeatIds: [essendon.electorate_id],
      });
      expect(hosts(first.r, 'today-your-mp-pending')).toHaveLength(1);
      expect(hosts(first.r, 'today-rep-federal-loading')).toHaveLength(1);
      expect(hosts(first.r, 'today-rep-state-loading')).toHaveLength(0);
      expect(hosts(first.r, 'today-rep-state-lines-loading')).toHaveLength(0);
      expect(hosts(first.r, 'today-reps-loading-senators')).toHaveLength(1);
      await first.answer();
      expect(hosts(first.r, 'today-rep-federal')).toHaveLength(1);
      expect(hosts(first.r, 'today-reps-senators')).toHaveLength(1);
      for (const id of [
        'today-rep-state',
        'today-rep-state-dissolved',
        'today-rep-state-neutral',
      ])
        expect(hosts(first.r, id)).toHaveLength(0);
    });
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
  const corpus = (total: number, checkedAt: string) =>
    ({
      data: { expected_resources: total, refresh: { checked_at: checkedAt } },
      stale: false,
      savedAt: 1,
    }) as never;
  /** A record checked a few hours ago: within the source limit. */
  const FRESH = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
  const DAY_MS = 24 * 60 * 60 * 1000;
  const pendingRead = () => {
    let answer!: (value: unknown) => void;
    const promise = new Promise((resolve) => {
      answer = resolve;
    });
    return { promise, answer };
  };
  /** A last visit, and the collection record saved then. */
  /** The record the last visit read: checked a night before. */
  const LAST_NIGHT = new Date(Date.now() - 21 * 60 * 60 * 1000).toISOString();
  /** A record's date as the line says it: "14 Nov", no year this year. */
  const day = (iso: string) =>
    formatDate(iso, 'short').replace(` ${new Date().getFullYear()}`, '');
  const visited = async (total = 1000, checkedAt = LAST_NIGHT) => {
    await rememberVisit({ total, checkedAt });
    setUp({ cached: { date: addDays(today, -1) } });
    mock.corpusSaved.mockResolvedValue(corpus(total, checkedAt));
    return checkedAt;
  };
  /** Today's first frame: the page is laid out and the cover lifts. */
  const firstFrame = (r: TestRenderer.ReactTestRenderer) =>
    act(() =>
      r.root.findByType(Screen).props.onLayout({
        nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 844 } },
      }),
    );
  /** Everything under the date, by id, in order. */
  const masthead = (r: TestRenderer.ReactTestRenderer) =>
    hosts(r, 'today-masthead')[0]!
      .findAll((n) => typeof n.type === 'string' && !!n.props.testID)
      .map((n) => n.props.testID as string);
  const leaveAndReturn = async () => {
    const blur = mockFocusEffects
      .map((effect) => effect() as unknown)
      .filter((left): left is () => void => typeof left === 'function');
    await act(async () => blur.forEach((leave) => leave()));
  };
  const owner = (r: TestRenderer.ReactTestRenderer, id: string) =>
    r.root.findAll((n) => n.props.testID === id && !!n.props.onPress)[0]!;

  test('the first ever launch draws no line; it keeps the visit on the device', async () => {
    setUp({ cached: { date: addDays(today, -1) } });
    mock.corpus.mockResolvedValue(corpus(1000, FRESH));
    const r = await render(<Today />);
    firstFrame(r);
    expect(hosts(r, 'today-since')).toHaveLength(0);
    const kept = await readVisit();
    expect(kept).toEqual({ total: 1000, checkedAt: FRESH });
  });

  test('an answer in hand before the first frame, with records added, draws the count and its source line; both open Just added', async () => {
    await visited();
    mock.corpus.mockResolvedValue(corpus(1412, FRESH));
    const r = await render(<Today />);
    // The cover is not held for it: it lifts as it would with no line.
    expect(releaseSplash).not.toHaveBeenCalled();
    firstFrame(r);
    expect(releaseSplash).toHaveBeenCalledWith('today');
    expect(hosts(r, 'today-since')).toHaveLength(1);
    expect(
      hosts(r, 'today-masthead')[0]!.findAll(
        (n) => n === hosts(r, 'today-since')[0],
      ),
    ).toHaveLength(1);
    const count = hosts(r, 'today-since-count').at(-1)!;
    expect(count.props.accessibilityRole).toBe('link');
    expect(count.props.accessibilityLabel).toBe(
      `412 more records in OPAX since ${day(LAST_NIGHT)}`,
    );
    expect(count.props.accessibilityHint).toBe('Opens Just added');
    // The source is the source line Today's other sources draw: the
    // glyph, "Updated {date}" and the record's full name, in navy.
    const date = `Updated ${formatDate(FRESH, 'short')}`;
    const source = hosts(r, 'today-since-source').at(-1)!;
    expect(
      r.root
        .findAllByType(SourceAffordance)
        .filter((n) => n.props.testID === 'today-since-source'),
    ).toHaveLength(1);
    expect(hosts(r, 'today-since-source-glyph')).toHaveLength(1);
    expect(source.props.accessibilityRole).toBe('link');
    expect(source.props.accessibilityLabel).toBe(
      `${date}, OPAX collection coverage record`,
    );
    expect(source.props.accessibilityHint).toBe('Opens Just added');
    const name = source.findAll(
      (n) => n.type === Text && n.props.tone === 'navy',
    );
    expect(name).toHaveLength(1);
    expect(name[0]!.props.children).toBe('OPAX collection coverage record');
    expect(name[0]!.props.variant).toBe('footnote');
    expect(strings(source)).toContain(`${date} · `);
    expect(strings(hosts(r, 'today-since')[0]!)).not.toMatch(/As at|—|–/);
    // The count and the source line both open Just added.
    for (const id of ['today-since-count', 'today-since-source']) {
      jest.mocked(router.push).mockClear();
      act(() => owner(r, id).props.onPress());
      expect(router.push).toHaveBeenCalledWith(recentRecordsRoute);
    }
    // Touch and hold on the count, or its action, opens the sources.
    const present = jest
      .spyOn(sheets, 'presentSource')
      .mockImplementation(() => undefined);
    try {
      act(() => owner(r, 'today-since-count').props.onLongPress());
      expect(present.mock.calls[0]![0]).toMatchObject({
        asOf: FRESH,
        citation: 'OPAX collection coverage record',
        originals: [{ url: '/corpus.json' }],
      });
      expect(count.props.accessibilityActions).toEqual([
        { name: 'sources', label: 'Sources' },
      ]);
      act(() =>
        owner(r, 'today-since-count').props.onAccessibilityAction({
          nativeEvent: { actionName: 'sources' },
        }),
      );
      expect(present).toHaveBeenCalledTimes(2);
    } finally {
      present.mockRestore();
    }
    // The visit kept for next time is this one, once its save has run.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await expect(readVisit()).resolves.toMatchObject({ total: 1412 });
    // Once drawn it stays for the life of the screen.
    await leaveAndReturn();
    expect(hosts(r, 'today-since')).toHaveLength(1);
  });

  test('an answer after the first frame draws nothing this session: no place was held, no line is inserted and nothing under the date moves', async () => {
    await visited();
    const read = pendingRead();
    mock.corpus.mockReturnValue(read.promise as never);
    const r = await render(<Today />);
    firstFrame(r);
    // The first frame: no line and no place held for one.
    const before = masthead(r);
    expect(before.filter((id) => /^today-since/.test(id))).toEqual([]);
    const page = blocks(r.root);
    // Records were added, but the answer is late.
    await act(async () => read.answer(corpus(1412, FRESH)));
    expect(masthead(r)).toEqual(before);
    expect(blocks(r.root)).toEqual(page);
    await leaveAndReturn();
    expect(masthead(r)).toEqual(before);
  });

  test('a late answer with records added leaves the last visit as it was, so that growth is not lost', async () => {
    const checked = await visited();
    const read = pendingRead();
    mock.corpus.mockReturnValue(read.promise as never);
    const r = await render(<Today />);
    firstFrame(r);
    await act(async () => read.answer(corpus(1412, FRESH)));
    expect(hosts(r, 'today-since')).toHaveLength(0);
    // Not drawn, so not counted as told: the total the reader last saw
    // stands, with its date and its time, untouched.
    await expect(readVisit()).resolves.toEqual({
      total: 1000,
      checkedAt: checked,
    });
  });

  test('the line says what is counted and from when: "412 more records in OPAX since 14 Nov", the date of the copy the count starts from', async () => {
    await visited();
    mock.corpus.mockResolvedValue(corpus(1412, FRESH));
    const r = await render(<Today />);
    firstFrame(r);
    const words = `412 more records in OPAX since ${day(LAST_NIGHT)}`;
    expect(hosts(r, 'today-since-count').at(-1)!.props.accessibilityLabel).toBe(
      words,
    );
    expect(strings(hosts(r, 'today-since-count').at(-1)!)).toBe(words);
    expect(strings(hosts(r, 'today-since')[0]!)).not.toMatch(
      /last visit|records added/,
    );
    // The wording, with the year only for a copy from another year.
    expect(sinceWords(412, '2026-11-14T03:00:00+00:00', 2026)).toBe(
      '412 more records in OPAX since 14 Nov',
    );
    expect(sinceWords(1, '2026-11-14', 2026)).toBe(
      '1 more record in OPAX since 14 Nov',
    );
    expect(sinceWords(1204, '2025-12-30', 2026)).toBe(
      '1,204 more records in OPAX since 30 Dec 2025',
    );
    // The source line beneath still carries the later copy's own date.
    expect(
      hosts(r, 'today-since-source').at(-1)!.props.accessibilityLabel,
    ).toBe(
      `Updated ${formatDate(FRESH, 'short')}, OPAX collection coverage record`,
    );
    // Which copy the device kept is the device's own: no read carries it.
    expect(mock.corpus.mock.calls.flat()).toEqual([]);
    expect(mock.corpusSaved.mock.calls.flat()).toEqual([]);
  });

  test('a total from a copy checked before the visit names the copy’s date, not the visit’s, whichever launch draws it; once drawn, the date moves on', async () => {
    // The copy was checked nine days ago, well before any visit since.
    const copy = new Date(Date.now() - 9 * DAY_MS).toISOString();
    await visited(1000, copy);
    expect(day(copy)).not.toBe(day(new Date().toISOString()));
    // A launch since then: the growth answered late, so nothing was drawn
    // and the total kept (with its copy's date) stayed as it was.
    const read = pendingRead();
    mock.corpus.mockReturnValue(read.promise as never);
    const late = await render(<Today />);
    firstFrame(late);
    await act(async () => read.answer(corpus(1412, FRESH)));
    expect(hosts(late, 'today-since')).toHaveLength(0);
    await expect(readVisit()).resolves.toMatchObject({ checkedAt: copy });
    // This launch draws it from the saved copy: since the first copy's date.
    setUp({ cached: { date: addDays(today, -1) } });
    mock.corpusSaved.mockResolvedValue(corpus(1412, FRESH));
    mock.corpus.mockResolvedValue(corpus(1412, FRESH));
    const r = await render(<Today />);
    firstFrame(r);
    expect(hosts(r, 'today-since-count').at(-1)!.props.accessibilityLabel).toBe(
      `412 more records in OPAX since ${day(copy)}`,
    );
    // Drawn, so the total kept is now the drawn copy's, with its date.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await expect(readVisit()).resolves.toMatchObject({
      total: 1412,
      checkedAt: FRESH,
    });
  });

  test('the sheet’s notes name both copies’ dates, and say only what is kept on the device', async () => {
    const from = new Date(Date.now() - 3 * DAY_MS).toISOString();
    await visited(1000, from);
    mock.corpus.mockResolvedValue(corpus(1412, FRESH));
    const r = await render(<Today />);
    firstFrame(r);
    const present = jest
      .spyOn(sheets, 'presentSource')
      .mockImplementation(() => undefined);
    try {
      act(() => owner(r, 'today-since-count').props.onLongPress());
      const details = present.mock.calls[0]![0];
      // The sheet's own date is the later copy's; the notes give both.
      expect(details.asOf).toBe(FRESH);
      expect(details.notes).toEqual([
        `The number is the change in the total number of records between the copy of the record checked on ${formatDate(from, 'short')} and the copy checked on ${formatDate(FRESH, 'short')}.`,
        'The copy the count starts from is kept on this device only.',
      ]);
      expect(formatDate(from, 'short')).not.toBe(formatDate(FRESH, 'short'));
      expect(details.notes!.join(' ')).not.toMatch(
        /date shown|last saw|last opened|—|–/,
      );
    } finally {
      present.mockRestore();
    }
  });

  /** The visit record's two slots, as builds 77 to 82 wrote them. */
  const oldRecords = () =>
    new TwoSlotStore<Record<string, unknown>>(
      ['opax-today-visit-v1.json', 'opax-today-visit-v1.b.json'],
      (raw) => raw as Record<string, unknown>,
      (value) => value,
    );
  const visitFiles = () =>
    [...mockWelcomeFiles].filter(([name]) => /^opax-today-visit/.test(name));

  test('a new visit record has no last-open time: only the total and its copy’s date are written', async () => {
    // Drawn, and with nothing added: both paths that write.
    for (const total of [1412, 1000]) {
      mockWelcomeFiles.clear();
      await visited();
      mock.corpus.mockResolvedValue(corpus(total, FRESH));
      const r = await render(<Today />);
      firstFrame(r);
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
      await expect(readVisit()).resolves.toEqual({ total, checkedAt: FRESH });
      expect(visitFiles()).not.toHaveLength(0);
      // Both slots: the record just written, and the one before it.
      expect(visitFiles().some(([, body]) => body.includes(FRESH))).toBe(true);
      for (const [, body] of visitFiles()) {
        expect(body).not.toMatch(/openedAt|opened/);
        // No instant of this launch, in any form.
        expect(body).not.toContain(String(Date.now()).slice(0, 8));
      }
    }
  });

  test('an old record that has a last-open time still reads, as its total and date alone, and the line counts from it', async () => {
    await oldRecords().save({
      version: 1,
      openedAt: 1_794_000_000_000,
      total: 1000,
      checkedAt: LAST_NIGHT,
    });
    await expect(readVisit()).resolves.toEqual({
      total: 1000,
      checkedAt: LAST_NIGHT,
    });
    setUp({ cached: { date: addDays(today, -1) } });
    mock.corpusSaved.mockResolvedValue(corpus(1000, LAST_NIGHT));
    mock.corpus.mockResolvedValue(corpus(1412, FRESH));
    const r = await render(<Today />);
    firstFrame(r);
    expect(hosts(r, 'today-since-count').at(-1)!.props.accessibilityLabel).toBe(
      `412 more records in OPAX since ${day(LAST_NIGHT)}`,
    );
    // The record written next no longer carries it.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    for (const [, body] of visitFiles())
      if (body.includes(FRESH)) expect(body).not.toContain('openedAt');
  });

  test('two old copies that both carry a last-open time have none left after one save, and the line still counts from their total and date', async () => {
    // As builds 77 to 82 left the store: both alternating copies written,
    // each with its visit time.
    const old = oldRecords();
    const before = new Date(Date.now() - 2 * DAY_MS).toISOString();
    await old.save({
      version: 1,
      openedAt: 1_793_000_000_000,
      total: 900,
      checkedAt: before,
    });
    await old.save({
      version: 1,
      openedAt: 1_794_000_000_000,
      total: 1000,
      checkedAt: LAST_NIGHT,
    });
    expect(visitFiles()).toHaveLength(2);
    for (const [, body] of visitFiles()) expect(body).toContain('openedAt');
    // The read path is as it was: the newer copy's total and date.
    await expect(readVisit()).resolves.toEqual({
      total: 1000,
      checkedAt: LAST_NIGHT,
    });
    setUp({ cached: { date: addDays(today, -1) } });
    mock.corpusSaved.mockResolvedValue(corpus(1000, LAST_NIGHT));
    mock.corpus.mockResolvedValue(corpus(1412, FRESH));
    const r = await render(<Today />);
    firstFrame(r);
    expect(hosts(r, 'today-since-count').at(-1)!.props.accessibilityLabel).toBe(
      `412 more records in OPAX since ${day(LAST_NIGHT)}`,
    );
    // The one save the drawn line makes clears the time from both copies.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(visitFiles()).toHaveLength(2);
    for (const [, body] of visitFiles()) {
      expect(body).not.toMatch(/openedAt|1793000000000|1794000000000/);
      expect(JSON.parse(body)).toMatchObject({
        version: 1,
        total: 1412,
        checkedAt: FRESH,
      });
    }
    await expect(readVisit()).resolves.toEqual({
      total: 1412,
      checkedAt: FRESH,
    });
    // A store already clean is written once, as before.
    const save = jest.spyOn(TwoSlotStore.prototype, 'save');
    try {
      await rememberVisit({ total: 1500, checkedAt: FRESH });
      expect(save).toHaveBeenCalledTimes(1);
    } finally {
      save.mockRestore();
    }
  });

  test('the next launch draws that growth from the saved copy of the record, in the first frame, with the network still out', async () => {
    // The last launch's late answer is the copy the device now holds.
    await visited();
    mock.corpusSaved.mockResolvedValue(corpus(1412, FRESH));
    mock.corpus.mockReturnValue(new Promise(() => {}) as never);
    const r = await render(<Today />);
    firstFrame(r);
    expect(hosts(r, 'today-since-count').at(-1)!.props.accessibilityLabel).toBe(
      `412 more records in OPAX since ${day(LAST_NIGHT)}`,
    );
    expect(
      hosts(r, 'today-since-source').at(-1)!.props.accessibilityLabel,
    ).toBe(
      `Updated ${formatDate(FRESH, 'short')}, OPAX collection coverage record`,
    );
    // Nothing of the visit rides on either read.
    expect(mock.corpusSaved.mock.calls.flat()).toEqual([]);
    expect(mock.corpus.mock.calls.flat()).toEqual([]);
  });

  test('a drawn line advances the last visit to the total it drew, not to a later answer the reader was never shown', async () => {
    await visited();
    mock.corpusSaved.mockResolvedValue(corpus(1412, FRESH));
    const read = pendingRead();
    mock.corpus.mockReturnValue(read.promise as never);
    const r = await render(<Today />);
    firstFrame(r);
    expect(hosts(r, 'today-since')).toHaveLength(1);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    const kept = await readVisit();
    expect(kept).toEqual({ total: 1412, checkedAt: FRESH });
    // More arrives after the first frame: the line stays as drawn, and
    // the rest waits for the next launch.
    const later = new Date().toISOString();
    await act(async () => read.answer(corpus(1500, later)));
    expect(hosts(r, 'today-since-count').at(-1)!.props.accessibilityLabel).toBe(
      `412 more records in OPAX since ${day(LAST_NIGHT)}`,
    );
    await expect(readVisit()).resolves.toMatchObject({ total: 1412 });
  });

  test('the source line is spaced as a Today block’s source line: its touch band overlaps upward, a group gap under the count', async () => {
    await visited();
    mock.corpus.mockResolvedValue(corpus(1412, FRESH));
    const r = await render(<Today />);
    firstFrame(r);
    const flat = (n: ReactTestInstance) =>
      (StyleSheet.flatten(
        typeof n.props.style === 'function'
          ? n.props.style({ pressed: false })
          : n.props.style,
      ) ?? {}) as Record<string, unknown>;
    const affordance = (id: string) =>
      r.root
        .findAllByType(SourceAffordance)
        .find((n) => n.props.testID === id)!;
    expect(affordance('today-since-source').props.overlap).toBe(true);
    expect(affordance('today-bills-sources').props.overlap).toBe(true);
    const since = flat(hosts(r, 'today-since-source').at(-1)!);
    const block = flat(hosts(r, 'today-bills-sources').at(-1)!);
    // No 44 pt row with its own gap above the text: the same frame.
    for (const key of [
      'marginTop',
      'paddingVertical',
      'alignItems',
      'minHeight',
      'gap',
    ])
      expect(since[key]).toEqual(block[key]);
    expect(since.marginTop).toBeLessThan(0);
    expect(flat(hosts(r, 'today-since')[0]!).gap).toBe(rhythm.group);
  });

  test('no records added draws nothing: no "no change" line and no place, before or after the first frame', async () => {
    for (const total of [1000, 990]) {
      await visited();
      // The total is the same, or fell: never a "no change" or "fewer" line.
      mock.corpus.mockResolvedValue(corpus(total, FRESH));
      const r = await render(<Today />);
      firstFrame(r);
      expect(masthead(r).filter((id) => /^today-since/.test(id))).toEqual([]);
      expect(strings(r.root)).not.toMatch(
        /hasn’t grown|more records? in OPAX|last visit|collection coverage/,
      );
      await expect(readVisit()).resolves.toMatchObject({ total });
    }
  });

  test('no line when the source is older than the limit: a record checked more than 14 days ago is not cited, however much it grew', async () => {
    const old = new Date(Date.now() - 15 * DAY_MS).toISOString();
    await visited();
    mock.corpus.mockResolvedValue(corpus(1412, old));
    const stale = await render(<Today />);
    firstFrame(stale);
    expect(hosts(stale, 'today-since')).toHaveLength(0);
    // Inside the limit the same growth is a line.
    const recent = new Date(Date.now() - 13 * DAY_MS).toISOString();
    await visited();
    mock.corpus.mockResolvedValue(corpus(1412, recent));
    const current = await render(<Today />);
    firstFrame(current);
    expect(
      hosts(current, 'today-since-source').at(-1)!.props.accessibilityLabel,
    ).toBe(
      `Updated ${formatDate(recent, 'short')}, OPAX collection coverage record`,
    );
    // The limit is stated in the code, to the millisecond.
    expect(SOURCE_LIMIT_DAYS).toBe(14);
    const checked = Date.parse(recent);
    const limit = SOURCE_LIMIT_DAYS * DAY_MS;
    expect(sourceCurrent(recent, checked + limit)).toBe(true);
    expect(sourceCurrent(recent, checked + limit + 1)).toBe(false);
    expect(sourceCurrent('unknown', checked)).toBe(false);
  });

  test('a record that cannot be reached: the saved copy answers, which holds nothing new, so no line is drawn and the visit is kept', async () => {
    const checked = await visited(
      1000,
      new Date(Date.now() - 2 * DAY_MS).toISOString(),
    );
    // setUp leaves the collection record unreachable.
    const r = await render(<Today />);
    firstFrame(r);
    expect(hosts(r, 'today-since')).toHaveLength(0);
    await expect(readVisit()).resolves.toMatchObject({
      total: 1000,
      checkedAt: checked,
    });
  });

  test('the last-open time stays on the device: the record is asked for once, with nothing of the visit, and no paid read', async () => {
    await visited();
    mock.corpus.mockResolvedValue(corpus(1001, FRESH));
    const r = await render(<Today />);
    firstFrame(r);
    expect(mock.corpus).toHaveBeenCalledTimes(1);
    // No argument carries the last-open time anywhere.
    expect(mock.corpus.mock.calls[0]).toEqual([]);
    expect(mock.corpusSaved.mock.calls.flat()).toEqual([]);
    expect(hosts(r, 'today-since-count').at(-1)!.props.accessibilityLabel).toBe(
      `1 more record in OPAX since ${day(LAST_NIGHT)}`,
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
    // A compact phone, where this test's bar and column sizes hold.
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
