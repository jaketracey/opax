import { act, type ReactElement, type ReactNode } from 'react';
import { RefreshControl, ScrollView } from 'react-native';
import TestRenderer from 'react-test-renderer';
import snapshot from '../scripts/fixture-snapshot.json';
import * as c from '../src/api/catalogs';
import { editionPath } from '../src/api/policy';
import { catalogs as runtime } from '../src/api/runtime';
import { Screen } from '../src/design/layout';
import Today from '../src/features/Today';
import { readCachedEdition } from '../src/features/today/edition-store';
import { readInvitationDates } from '../src/features/today/invitation-store';
import { addDays, sydneyDay } from '../src/features/today/rules';
import { loadChoice } from '../src/features/your-mp/choice-store';
import { resetSeatForTests } from '../src/features/your-mp/useSeat';
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
jest.mock('../src/features/today/invitation-store', () => ({
  readInvitationDates: jest.fn(),
  subscribeInvitation: jest.fn(() => () => undefined),
  overrideInvitationDates: jest.fn(),
  hideInvitation: jest.fn(async () => undefined),
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
    Stack: { Screen: () => null },
  };
});

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

test('first reads use the cache and leave the spinner idle; a pull revalidates every block and settles', async () => {
  setUp({ seat: true, cached: { date: addDays(today, -1) } });
  const r = await render(<Today />);
  const control = () =>
    r.root.findByType(Screen).props.refreshControl as ReactElement<{
      refreshing: boolean;
      onRefresh: () => void;
    }>;
  expect(control().type).toBe(RefreshControl);
  expect(control().props.refreshing).toBe(false);
  expect(mock.todayEdition).toHaveBeenNthCalledWith(1, false);
  expect(mock.todayBills).toHaveBeenNthCalledWith(1, 3, 'new', false);
  expect(mock.todayDeclarations).toHaveBeenNthCalledWith(1, 3, false);
  expect(mock.recentDivisions).toHaveBeenNthCalledWith(1, false);
  let answer!: (block: c.Block<c.EditionView>) => void;
  mock.todayEdition.mockImplementationOnce(
    () => new Promise((resolve) => (answer = resolve)),
  );
  await act(async () => control().props.onRefresh());
  expect(control().props.refreshing).toBe(true);
  expect(mock.todayEdition).toHaveBeenLastCalledWith(true);
  expect(mock.todayBills).toHaveBeenLastCalledWith(3, 'new', true);
  expect(mock.todayDeclarations).toHaveBeenLastCalledWith(3, true);
  expect(mock.recentDivisions).toHaveBeenLastCalledWith(true);
  // The blocks keep their content while they revalidate, in their slots.
  expect(
    r.root.findAll(
      (n) => typeof n.type === 'string' && n.props.testID === 'today-bill-0',
    ).length,
  ).toBeGreaterThan(0);
  await act(async () => answer(editionAged(1)));
  expect(control().props.refreshing).toBe(false);
});

test('a failed revalidation keeps the edition already drawn', async () => {
  setUp({ cached: { date: addDays(today, -1) } });
  const r = await render(<Today />);
  const control = () =>
    r.root.findByType(Screen).props.refreshControl as ReactElement<{
      onRefresh: () => void;
    }>;
  mock.todayEdition.mockResolvedValueOnce({
    status: 'error',
    data: null,
    asAt: null,
    sources: [],
    stale: false,
    savedAt: null,
  } as never);
  await act(async () => control().props.onRefresh());
  expect(
    r.root.findAll(
      (n) =>
        typeof n.type === 'string' && n.props.testID === 'today-edition-card',
    ),
  ).toHaveLength(1);
});

// b67 (flow 66, iOS 26.3 and 27): after the welcome's seat search, Today
// opened with its title collapsed and the Your MP tile under the bar. React
// Native's keyboard handler hears every keyboard in the window and, through
// a clamp that ignores UIKit's automatic inset, moved Today's rest offset
// under the large title (-headerBottom) to 0. Today has no text field.
test('a seat search over Today cannot move it: its scroll view takes no keyboard insets', async () => {
  setUp();
  const r = await render(<Today />);
  const scroll = r.root.findAll(
    (n) =>
      n.type === ScrollView &&
      n.props.testID === 'today-screen' &&
      'automaticallyAdjustKeyboardInsets' in n.props,
  );
  expect(scroll.length).toBeGreaterThan(0);
  expect(scroll[0]!.props.automaticallyAdjustKeyboardInsets).toBe(false);
});
