import { act, type ReactElement, type ReactNode } from 'react';
import TestRenderer, { type ReactTestInstance } from 'react-test-renderer';
import snapshot from '../scripts/fixture-snapshot.json';
import * as c from '../src/api/catalogs';
import { editionPath } from '../src/api/policy';
import { catalogs as runtime } from '../src/api/runtime';
import { Screen } from '../src/design/layout';
import Today from '../src/features/Today';
import { loadChoice } from '../src/features/your-mp/choice-store';
import { resetSeatForTests } from '../src/features/your-mp/useSeat';
import { readCachedEdition } from '../src/features/today/edition-store';
import { readInvitationDates } from '../src/features/today/invitation-store';
import { addDays, sydneyDay } from '../src/features/today/rules';
import { releaseSplash } from '../src/launch/splash';
import { welcomeDeclinedThisLaunch } from '../src/onboarding/state';
import { invitationBody } from '../src/features/today/SeatInvitation';
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
  test('the card’s own Not now hides the invitation for 30 days', async () => {
    setUp({ cached: 'missing', hiddenUntil: addDays(today, 29) });
    const r = await render(<Today />);
    expect(blocks(r.root)).not.toContain('today-invitation');
    expect(blocks(r.root)[0]).toBe('today-pair');
  });
});

describe('the page', () => {
  test('releases the splash once its first reads answer', async () => {
    setUp({ cached: 'missing' });
    await render(<Today />);
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
