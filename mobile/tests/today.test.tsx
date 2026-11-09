import { useNetworkState } from 'expo-network';
import { act, type ReactElement, type ReactNode } from 'react';
import {
  HeaderHeightContext,
  NavigationContext,
  NavigationRouteContext,
} from 'expo-router/react-navigation';
import { ActionSheetIOS, Platform, ScrollView } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import TestRenderer, { type ReactTestInstance } from 'react-test-renderer';
import snapshot from '../scripts/fixture-snapshot.json';
import * as c from '../src/api/catalogs';
import { editionPath } from '../src/api/policy';
import { catalogs as runtime } from '../src/api/runtime';
import { Screen } from '../src/design/layout';
import { OfflineLine } from '../src/design/states';
import Today from '../src/features/Today';
import { readCachedEdition } from '../src/features/today/edition-store';
import { readInvitationDates } from '../src/features/today/invitation-store';
import { addDays, sydneyDay } from '../src/features/today/rules';
import { invitationBody } from '../src/features/today/SeatInvitation';
import { loadChoice } from '../src/features/your-mp/choice-store';
import { resetSeatForTests } from '../src/features/your-mp/useSeat';
import { releaseSplash } from '../src/launch/splash';
import { largeTitleBar, todayTitleBar } from '../src/navigation/chrome';
import { welcomeDeclinedThisLaunch } from '../src/onboarding/state';
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
  },
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
jest.mock('../src/features/ask/open', () => ({ useOpenAsk: () => jest.fn() }));
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
    Stack: { Screen: () => null },
    // Today's focus effects, kept so a test can "show" Today again.
    useFocusEffect: (effect: () => void) =>
      React.useEffect(() => {
        mockFocusEffects.push(effect);
      }, [effect]),
  };
});
const mockFocusEffects: (() => void)[] = [];
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
  'Today scroll events protect its bar and leave the %s root options intact',
  async (name) => {
    setUp();
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
    try {
      const renderer = await render(
        <NavigationContext.Provider value={navigation as never}>
          <NavigationRouteContext.Provider value={route}>
            <SafeAreaInsetsContext.Provider
              value={{ top: 24, bottom: 0, left: 0, right: 0 }}
            >
              <HeaderHeightContext.Provider value={160}>
                <Today />
              </HeaderHeightContext.Provider>
            </SafeAreaInsetsContext.Provider>
          </NavigationRouteContext.Provider>
        </NavigationContext.Provider>,
      );
      const scroll = (distance: number) =>
        act(() =>
          renderer.root.findByType(ScrollView).props.onScroll({
            nativeEvent: { contentOffset: { y: distance - 160 } },
          }),
        );
      const expanded = setOptions.mock.calls.at(-1)![0];
      const ground = expanded.contentStyle.backgroundColor;
      expect(expanded).toEqual(
        (name === 'index' ? todayTitleBar : largeTitleBar)(ground),
      );
      expect(expanded.headerStyle).toEqual({});
      expect(expanded.headerLargeStyle).toEqual({});
      setOptions.mockClear();
      for (const distance of [0, -20, 0]) scroll(distance);
      expect(setOptions).not.toHaveBeenCalled();
      for (const distance of [0.5, 40, 300, 600, 40]) scroll(distance);
      if (name === 'index') {
        expect(setOptions).toHaveBeenCalledTimes(1);
        expect(setOptions).toHaveBeenLastCalledWith(
          todayTitleBar(ground, false, true),
        );
        scroll(0);
        expect(setOptions).toHaveBeenCalledTimes(2);
        expect(setOptions).toHaveBeenLastCalledWith(expanded);
      } else {
        scroll(0);
        expect(setOptions).not.toHaveBeenCalled();
      }
    } finally {
      Object.defineProperty(Platform, 'Version', version);
    }
  },
);

describe('the launch order', () => {
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
    mock.yourMP.mockImplementation(() => new Promise(() => {}));
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
  test('Your MP: the seat header, the member, the senators and the line last', async () => {
    setUp({ seat: true, cached: { date: addDays(today, -1) } });
    const r = await render(<Today />);
    const card = r.root.find(
      (n) => typeof n.type === 'string' && n.props.testID === 'today-your-mp',
    );
    const ids = card
      .findAll((n) => typeof n.type === 'string' && !!n.props.testID)
      .map((n) => n.props.testID as string);
    expect(ids).toContain('today-your-mp-seat');
    expect(ids).toContain('today-your-mp-member');
    expect(ids).toContain('today-senators');
    expect(ids.filter((id) => id === 'today-your-mp-sources').length).toBe(1);
    expect(strings(card)).toContain('Grayndler');
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
      'Add your electorate to see your MP, how they vote and the grants in your area.',
    );
    expect(invitationBody(seat({ name: 'Wills', status: 'historical' }))).toBe(
      'Wills is no longer an electorate.',
    );
    expect(
      invitationBody(seat({ name: 'New South Wales', chamber: 'senate' })),
    ).toBe('Choose your current federal electorate.');
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
