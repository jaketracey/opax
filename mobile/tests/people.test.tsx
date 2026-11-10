// Lane P, part 2 (people.md 2.1, 2.2): the person profile and the party
// page on the shared templates. Each block holds one acceptance check.
import { act } from 'react';
import { FlatList, ScrollView } from 'react-native';
import TestRenderer from 'react-test-renderer';
import * as c from '../src/api/catalogs';
import { ApiError } from '../src/api/errors';
import { peopleDepth, catalogs as runtime } from '../src/api/runtime';
import { PadGrid } from '../src/design/adaptive';
import {
  formatCount,
  formatMoney,
  formatMoneyCompact,
  moneyAccessibilityLabel,
} from '../src/design/format';
import { Section } from '../src/design/layout';
import { partySlug } from '../src/design/party';
import { Text } from '../src/design/primitives';
import { followKey, useFollows } from '../src/features/follows/store';
import { useFollowStates } from '../src/features/follows/useFollowStates';
import Party from '../src/features/Party';
import {
  annualPay,
  decodeAccess,
  decodeFunding,
  decodeRecords,
  interestsCount,
  payRateLine,
  stripSources,
  votesCount,
} from '../src/features/people/model';
import RecordList from '../src/features/people/RecordList';
import Person from '../src/features/Person';
import type { ProfileView } from '../src/features/your-mp/model';
import { catalogs, manifest, people, pinned, roster, slugs } from './pinned';

// The party page reads the pinned snapshot through the real catalogue code.
const partyApi = new c.Catalogs({
  get: async (path, decoder) => ({
    data: decoder(path === '/api/person-slugs' ? slugs : pinned(path)),
    stale: false,
    savedAt: 1000,
    asOf: null,
  }),
});

jest.mock('../src/api/runtime', () => ({
  portraits: { get: jest.fn() },
  catalogs: {
    person: jest.fn(),
    profileFor: jest.fn(),
    rosterProfileFor: jest.fn(),
    directory: jest.fn(),
    partyPage: jest.fn(),
    followSources: jest.fn(),
  },
  peopleDepth: {
    access: jest.fn(),
    funding: jest.fn(),
    mentions: jest.fn(),
    news: jest.fn(),
    list: jest.fn(),
  },
}));
// A live iPad flag: the page reads `isPad` and `useLayout` at render.
jest.mock('../src/design/adaptive', () => {
  const actual = jest.requireActual('../src/design/adaptive');
  const pad = () => !!(globalThis as { __opaxTestPad?: boolean }).__opaxTestPad;
  const out = {
    ...actual,
    useLayout: () => {
      const layout = actual.useLayout();
      return pad() ? { ...layout, regular: true } : layout;
    },
  };
  Object.defineProperty(out, 'isPad', { get: pad, enumerable: true });
  return out;
});
const setPad = (on: boolean) => {
  (globalThis as { __opaxTestPad?: boolean }).__opaxTestPad = on;
};
jest.mock('@shopify/react-native-skia', () => ({
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- inert host view
  Canvas: require('react-native').View,
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- inert host element
  Rect: (props: object) => require('react').createElement('Rect', props),
}));
jest.mock('../src/api/image-policy', () => ({
  localImageURI: (uri: string) => uri,
}));
const mockParams: {
  slug?: string;
  name?: string;
  section?: string;
  kind?: string;
  person?: string;
} = {};
jest.mock('expo-router', () => ({
  useIsPreview: () => false,
  Link: Object.assign(({ children }: { children?: unknown }) => children, {
    Trigger: ({ children }: { children?: unknown }) => children,
    Preview: () => null,
    Menu: () => null,
    MenuAction: () => null,
  }),
  useSegments: () => [],
  useLocalSearchParams: () => mockParams,
  router: { push: jest.fn(), navigate: jest.fn() },
  Stack: { Screen: () => null },
}));
jest.mock('../src/features/follows/store', () => ({
  ...jest.requireActual('../src/features/follows/store'),
  useFollows: jest.fn(() => []),
}));
jest.mock('../src/features/follows/useFollowStates', () => ({
  markSeenNow: jest.fn(async () => undefined),
  useFollowStates: jest.fn(() => ({ states: new Map() })),
}));
// The group's own seen-marking is the follows lane's; here it only stands.
jest.mock('../src/features/follows/AddedSinceGroup', () => {
  const { View: MockView } = jest.requireActual('react-native');
  return {
    AddedSinceGroup: ({ testID }: { testID: string }) => (
      <MockView testID={testID} />
    ),
  };
});

const result = <T,>(data: T) => ({
  data,
  stale: false,
  savedAt: 1,
  asOf: null,
});
const mock = runtime as jest.Mocked<typeof runtime>;
const directory = {
  manifest: result(manifest),
  people: result(people),
  roster: result(roster),
  slugs: result(slugs),
  electorates: result(c.decodeElectorateIndex(pinned(manifest.index_url))),
};

const text = (r: TestRenderer.ReactTestRenderer) =>
  r.root
    .findAllByType(Text)
    .flatMap((n) => n.props.children)
    .filter((v) => typeof v === 'string')
    .join(' ')
    .replace(/\s+/g, ' ');
// Every string drawn, whichever text component draws it.
const drawn = (r: TestRenderer.ReactTestRenderer) =>
  r.root
    .findAll((n) => typeof n.type === 'string')
    .flatMap((n) => [n.props.children].flat())
    .filter((v) => typeof v === 'string')
    .join(' ');
const has = (r: TestRenderer.ReactTestRenderer, testID: string) =>
  r.root.findAll((n) => n.props.testID === testID).length > 0;
const host = (r: TestRenderer.ReactTestRenderer, testID: string) =>
  r.root.find((n) => typeof n.type === 'string' && n.props.testID === testID);

async function wong() {
  mockParams.slug = 'penny-wong';
  const person = c.joinPerson('penny-wong', slugs, roster, people, manifest);
  const profile = c.profileFor(person.canonicalPersonId!, {
    ...catalogs,
    interest: c.decodeInterest(pinned('/interests/10678.json')),
  });
  mock.person.mockResolvedValue(result(person));
  mock.profileFor.mockResolvedValue(profile);
  let r!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    r = TestRenderer.create(<Person />);
  });
  return { r, person, profile };
}

beforeEach(() => {
  jest.clearAllMocks();
  delete mockParams.section;
  mock.directory.mockResolvedValue(directory as never);
  jest.mocked(useFollows).mockReturnValue([]);
  jest.mocked(useFollowStates).mockReturnValue({ states: new Map() } as never);
});

describe('profile', () => {
  test('strip and sections agree: each tile reads its section’s selector', async () => {
    const { r, profile } = await wong();
    const votes = votesCount(profile)!;
    const interests = interestsCount(profile)!;
    const pay = annualPay(profile)!;
    expect(votes).toBeGreaterThan(0);
    expect(interests).toBeGreaterThan(0);
    expect(pay).toBeGreaterThan(0);
    const tile = (id: string) =>
      host(r, `person-figure-${id}`).props.accessibilityLabel as string;
    expect(tile('votes')).toContain(formatCount(votes));
    expect(tile('interests')).toContain(formatCount(interests));
    expect(tile('pay')).toContain(formatMoney(pay));
    // The sections draw the same figures.
    expect(text(r)).toContain(`Voted in ${formatCount(votes)} divisions`);
    expect(host(r, 'person-pay-salary').props.accessibilityLabel).toContain(
      moneyAccessibilityLabel(pay),
    );
    expect(text(r)).toContain(formatMoney(pay));
    const buckets = Object.values(
      profile.blocks.interests.data!.buckets,
    ).reduce((sum, b) => sum + b.count, 0);
    expect(buckets).toBe(interests);
    await act(async () => r.unmount());
  });

  test('D6 order with every block held, and the interests tile counts what the section draws', async () => {
    const { r, profile } = await wong();
    // The fixture holds each block the order names.
    for (const block of ['votes', 'interests', 'pay', 'expenses'] as const)
      expect(profile.blocks[block].data).not.toBeNull();
    const ORDER = [
      'person-votes',
      'person-speeches',
      'person-interests',
      'person-pay',
      'person-expenses',
      'person-receipts',
      'person-more',
    ];
    const drawnOrder = r.root
      .findAll(
        (n) => typeof n.type === 'string' && ORDER.includes(n.props.testID),
      )
      .map((n) => n.props.testID as string)
      .filter((id, i, all) => all.indexOf(id) === i);
    expect(drawnOrder).toEqual(ORDER);
    // The headings read in the same order.
    const headings = r.root
      .findAllByType(Section)
      .map((n) => n.props.title as string | undefined)
      .filter((t): t is string =>
        [
          'Voting record',
          'Declared interests',
          'Pay',
          'Expenses',
          'Party receipts',
          'More from the record',
        ].includes(t ?? ''),
      );
    expect(headings).toEqual([
      'Voting record',
      'Declared interests',
      'Pay',
      'Expenses',
      'Party receipts',
      'More from the record',
    ]);
    // The section's categories add up to the strip's interests figure.
    const drawnTotal = r.root
      .findAll(
        (n) =>
          typeof n.props.testID === 'string' &&
          /^interest-bucket-[^-]+$/.test(n.props.testID) &&
          typeof n.props.value === 'string',
      )
      .filter(
        (n, i, all) =>
          all.findIndex((m) => m.props.testID === n.props.testID) === i,
      )
      .reduce((sum, n) => sum + Number(n.props.value.replace(/,/g, '')), 0);
    const interests = interestsCount(profile)!;
    expect(drawnTotal).toBe(interests);
    expect(
      host(r, 'person-figure-interests').props.accessibilityLabel,
    ).toContain(formatCount(drawnTotal));
    await act(async () => r.unmount());
  });

  test('the strip’s source line carries the oldest contributing date and names that source first', () => {
    const block = (asAt: string | null) => ({ asAt });
    const profile = {
      blocks: {
        identity: block('2026-09-04'),
        votes: { ...block('2026-08-26'), data: { total: 10, years: [2006] } },
        interests: { ...block('2026-08-14'), data: { total: 28 } },
        pay: {
          ...block('2026-09-17'),
          data: { person: { now: { salary: 622102 } } },
        },
      },
    } as unknown as Pick<ProfileView, 'blocks'>;
    const strip = stripSources(profile);
    expect(strip.asOf).toBe('2026-08-14');
    expect(strip.citation).toHaveLength(4);
    expect(strip.citation[0]).toMatchObject({
      label: 'Register of interests',
      asOf: '2026-08-14',
    });
    // Every source keeps its own date in the sheet.
    expect(strip.citation.map((s) => s.asOf).sort()).toEqual([
      '2026-08-14',
      '2026-08-26',
      '2026-09-04',
      '2026-09-17',
    ]);
  });

  test('pay is dated by its rate, never by when the post began', () => {
    const pay = (from: string) =>
      ({
        person: {
          now: {
            post: 'Prime Minister',
            pct: 160,
            salary: 622102,
            since: '2022-05-23',
            assumed: false,
          },
          spells: [['2022-05-23', null, 'Prime Minister', 160, 622102]],
          by_year: [],
        },
        base: { from, amount: 239270, source: '', url: '' },
      }) as unknown as Parameters<typeof payRateLine>[0];
    expect(payRateLine(pay('2026-07-01'))).toEqual({
      line: 'a year as Prime Minister, rate from 1 Jul 2026',
      dated: true,
    });
    const undated = payRateLine(pay(''));
    expect(undated).toEqual({ line: 'a year as Prime Minister', dated: false });
    expect(undated.line).not.toMatch(/2022|May/);
    const member = pay('2026-07-01');
    member.person.now!.post = 'Member of the House of Representatives';
    expect(payRateLine(member).line).toBe(
      'a year, base salary, rate from 1 Jul 2026',
    );
  });

  test('nothing the profile draws or speaks has an em dash', async () => {
    const { r } = await wong();
    const said = r.root
      .findAll(
        (n) =>
          typeof n.props.accessibilityLabel === 'string' ||
          typeof n.props.children === 'string',
      )
      .flatMap((n) => [n.props.accessibilityLabel, n.props.children])
      .filter((v): v is string => typeof v === 'string');
    expect(said.length).toBeGreaterThan(20);
    for (const words of [...said, text(r)]) expect(words).not.toContain('—');
    await act(async () => r.unmount());
  });

  test('an unknown person is "not in OPAX" only after the directory read succeeds', async () => {
    // The state's composite: its title and its one action.
    const state = (r: TestRenderer.ReactTestRenderer, testID: string) =>
      r.root.findAll(
        (n) => n.props.testID === testID && typeof n.props.title === 'string',
      )[0];
    mockParams.slug = 'no-such-person';
    mock.person.mockRejectedValue(
      new ApiError('not-found', 'This person is not in the public directory.'),
    );
    let r!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      r = TestRenderer.create(<Person />);
    });
    const missing = state(r, 'person-not-found')!;
    expect(missing.props.title).toBe('This person isn’t in OPAX');
    expect(has(r, 'person-not-found-search')).toBe(true);
    expect(has(r, 'person-error')).toBe(false);
    expect(drawn(r)).not.toContain('Try again');
    await act(async () => r.unmount());

    // A failed read is never a fact about the person.
    mock.person.mockRejectedValue(new ApiError('server', 'Unavailable'));
    await act(async () => {
      r = TestRenderer.create(<Person />);
    });
    expect(has(r, 'person-not-found')).toBe(false);
    const failed = state(r, 'person-error')!;
    expect(failed.props.title).toBe('Couldn’t load this profile');
    expect(failed.props.action.label).toBe('Try again');
    await act(async () => r.unmount());
  });

  test('?section=changes scrolls to Added since; an unchanged page has no group', async () => {
    // Unchanged: no group, and nothing scrolls.
    mockParams.section = 'changes';
    const scrollTo = jest
      .spyOn(ScrollView.prototype, 'scrollTo')
      .mockImplementation(() => undefined);
    const quiet = await wong();
    expect(has(quiet.r, 'person-added-since')).toBe(false);
    expect(scrollTo).not.toHaveBeenCalled();
    await act(async () => quiet.r.unmount());

    // Followed, with a change since the reader last looked.
    const person = c.joinPerson('penny-wong', slugs, roster, people, manifest);
    const follow = {
      kind: 'person' as const,
      id: person.canonicalPersonId!,
      title: 'Penny Wong',
      followedAt: 1,
      seen: {},
      seenAt: 1,
    };
    jest.mocked(useFollows).mockReturnValue([follow] as never);
    jest.mocked(useFollowStates).mockReturnValue({
      states: new Map([
        [
          `person:${person.canonicalPersonId}`,
          {
            status: 'ready',
            title: 'Penny Wong',
            current: {},
            keys: [],
            changes: [
              {
                marker: 'declarations',
                text: 'Declared a gift',
                citation: 'Register of interests',
                asAt: '2026-10-01',
              },
            ],
          },
        ],
      ]),
    } as never);
    const { r } = await wong();
    expect(has(r, 'person-added-since')).toBe(true);
    // The group's place arrives with its layout; the page then scrolls there.
    const group = host(r, 'person-added-since');
    let holder: TestRenderer.ReactTestInstance | null = group.parent;
    while (holder && typeof holder.props.onLayout !== 'function')
      holder = holder.parent;
    await act(async () =>
      holder!.props.onLayout({ nativeEvent: { layout: { y: 900 } } }),
    );
    expect(scrollTo).toHaveBeenCalled();
    const target = scrollTo.mock.calls.at(-1)![0] as { y: number };
    expect(target.y).toBeGreaterThan(0);
    expect(target.y).toBeLessThanOrEqual(900);
    // It lands above Voting record: the group comes first.
    const order = r.root
      .findAll(
        (n) =>
          typeof n.type === 'string' &&
          ['person-added-since', 'person-votes'].includes(n.props.testID),
      )
      .map((n) => n.props.testID);
    expect(order[0]).toBe('person-added-since');
    scrollTo.mockRestore();
    await act(async () => r.unmount());
  });
});

describe('party', () => {
  type PartyView = Awaited<ReturnType<typeof partyApi.partyPage>>;
  const views: Record<string, PartyView> = {};
  beforeAll(async () => {
    for (const name of ['Labor', 'Liberal'])
      views[name] = await partyApi.partyPage(name);
  });
  beforeEach(() => {
    jest
      .mocked(runtime.partyPage)
      .mockImplementation(async (name: string) => views[name]!);
    jest
      .mocked(peopleDepth.access)
      .mockResolvedValue(result(decodeAccess(pinned('/access.json'))) as never);
    jest
      .mocked(peopleDepth.funding)
      .mockResolvedValue(
        result(decodeFunding(pinned('/graph/aec-extras.json'))) as never,
      );
  });
  afterEach(() => {
    delete mockParams.name;
  });
  async function party(name: string) {
    mockParams.slug = name;
    mockParams.name = name;
    let r!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      r = TestRenderer.create(<Party />);
    });
    return r;
  }
  // The page's sections, in the order they are drawn.
  const SECTIONS = [
    'party-figures',
    'party-figure-members',
    'party-figure-receipts',
    'party-figures-source',
    'party-members',
    'party-members-all',
    'party-current-count',
    'party-receipts',
    'party-receipts-total',
    'party-debts-section',
    'party-divisions',
    // Meetings and lobbying collapses when the snapshot has neither half.
    'party-more',
    'party-end',
  ];
  const layout = (r: TestRenderer.ReactTestRenderer) =>
    r.root
      .findAll(
        (n) => typeof n.type === 'string' && SECTIONS.includes(n.props.testID),
      )
      .map((n) => n.props.testID as string)
      .filter((id, i, all) => all.indexOf(id) === i);

  test('two parties draw the same layout', async () => {
    const labor = await party('Labor');
    const liberal = await party('Liberal');
    expect(views.Labor!.data?.label).toBe('Labor');
    expect(views.Liberal!.data?.label).toBe('Liberal');
    expect(layout(labor)).toEqual(SECTIONS);
    expect(layout(liberal)).toEqual(layout(labor));
    await act(async () => {
      labor.unmount();
      liberal.unmount();
    });
  });

  test('the strip has two tiles, each the figure its section draws', async () => {
    const r = await party('Labor');
    const data = views.Labor!.data!;
    const tiles = r.root.findAll(
      (n) =>
        typeof n.type !== 'string' &&
        typeof n.props.testID === 'string' &&
        n.props.testID.startsWith('party-figure-') &&
        typeof n.props.value === 'string',
    );
    expect(
      [...new Set(tiles.map((t) => t.props.testID as string))].sort(),
    ).toEqual(['party-figure-members', 'party-figure-receipts']);
    const members = data.members.data!.currentCount;
    const total = data.receipts.data!.node.total;
    expect(members).toBeGreaterThan(0);
    expect(total).toBeGreaterThan(0);
    const tile = (id: string) => host(r, id).props.accessibilityLabel as string;
    expect(tile('party-figure-members')).toContain(formatCount(members));
    expect(tile('party-figure-receipts')).toContain(formatMoneyCompact(total));
    // The sections draw the same figures.
    expect(tile('party-current-count')).toContain(formatCount(members));
    expect(tile('party-receipts-total')).toContain(
      moneyAccessibilityLabel(total),
    );
    expect(drawn(r)).toContain(formatMoney(total));
    await act(async () => r.unmount());
  });

  test('?section=changes on an unchanged party draws no group and does not scroll', async () => {
    mockParams.section = 'changes';
    const scrollTo = jest
      .spyOn(ScrollView.prototype, 'scrollTo')
      .mockImplementation(() => undefined);
    const r = await party('Labor');
    expect(has(r, 'party-added-since')).toBe(false);
    expect(scrollTo).not.toHaveBeenCalled();
    scrollTo.mockRestore();
    await act(async () => r.unmount());
  });

  test('?section=changes with a followed party scrolls to Added since, above Members', async () => {
    mockParams.section = 'changes';
    const scrollTo = jest
      .spyOn(ScrollView.prototype, 'scrollTo')
      .mockImplementation(() => undefined);
    const follow = {
      kind: 'party' as const,
      id: partySlug('Labor'),
      title: 'Labor',
      followedAt: 1,
      seen: {},
      seenAt: 1,
    };
    jest.mocked(useFollows).mockReturnValue([follow] as never);
    jest.mocked(useFollowStates).mockReturnValue({
      states: new Map([
        [
          followKey(follow),
          {
            status: 'ready',
            title: 'Labor',
            current: {},
            keys: [],
            changes: [
              {
                marker: 'members',
                text: 'A new sitting member',
                citation: 'Parliamentary roster',
                asAt: '2026-10-01',
              },
            ],
          },
        ],
      ]),
    } as never);
    const r = await party('Labor');
    try {
      expect(has(r, 'party-added-since')).toBe(true);
      // It lands above Members: the group comes first.
      const order = r.root
        .findAll(
          (n) =>
            typeof n.type === 'string' &&
            ['party-added-since', 'party-members'].includes(n.props.testID),
        )
        .map((n) => n.props.testID);
      expect(order[0]).toBe('party-added-since');
      // The group's own wrapper reports its place; the page then scrolls.
      let holder: TestRenderer.ReactTestInstance | null = host(
        r,
        'party-added-since',
      ).parent;
      while (holder && typeof holder.props.onLayout !== 'function')
        holder = holder.parent;
      expect(holder).not.toBeNull();
      expect(
        holder!.findAll((n) => n.props.testID === 'party-members'),
      ).toHaveLength(0);
      await act(async () =>
        holder!.props.onLayout({ nativeEvent: { layout: { y: 900 } } }),
      );
      expect(scrollTo).toHaveBeenCalled();
      const target = scrollTo.mock.calls.at(-1)![0] as { y: number };
      expect(target.y).toBeGreaterThan(0);
      expect(target.y).toBeLessThanOrEqual(900);
    } finally {
      scrollTo.mockRestore();
      await act(async () => r.unmount());
    }
  });

  // Every string the page draws or speaks, by the row it sits in.
  const spoken = (r: TestRenderer.ReactTestRenderer) =>
    r.root
      .findAll(
        (n) =>
          typeof n.props.accessibilityLabel === 'string' ||
          typeof n.props.children === 'string',
      )
      .map((n) => {
        let row: TestRenderer.ReactTestInstance | null = n;
        while (row && !String(row.props.testID ?? '').startsWith('party-'))
          row = row.parent;
        return {
          division: String(row?.props.testID ?? '').startsWith('party-bill-'),
          words: [n.props.accessibilityLabel, n.props.children].filter(
            (v): v is string => typeof v === 'string',
          ),
        };
      });

  test('nothing the party page draws or speaks has retired wording, or an em dash outside the vote rows', async () => {
    for (const name of ['Labor', 'Liberal']) {
      const r = await party(name);
      const said = spoken(r);
      expect(said.length).toBeGreaterThan(20);
      for (const { words } of said)
        for (const w of words)
          for (const retired of [
            'Political party',
            'Public money',
            'Rank',
            'in this export',
          ])
            expect(w).not.toContain(retired);
      for (const { division, words } of said)
        if (!division) for (const w of words) expect(w).not.toContain('\u2014');
      for (const retired of ['Political party', 'Public money', 'Rank'])
        expect(drawn(r)).not.toContain(retired);
      await act(async () => r.unmount());
    }
  });

  test('on an iPad at regular width, Members pairs with Recent votes and Receipts with Debts', async () => {
    const sectionsIn = (n: TestRenderer.ReactTestInstance) =>
      n
        .findAll(
          (m) =>
            typeof m.type === 'string' &&
            [
              'party-members',
              'party-divisions',
              'party-receipts',
              'party-debts-section',
            ].includes(m.props.testID),
        )
        .map((m) => m.props.testID as string)
        .filter((id, i, all) => all.indexOf(id) === i);
    // iPhone: one column, nothing paired, the phone order kept.
    const phone = await party('Labor');
    expect(phone.root.findAllByType(PadGrid)).toHaveLength(0);
    expect(layout(phone)).toEqual(SECTIONS);
    await act(async () => phone.unmount());
    setPad(true);
    try {
      const pad = await party('Labor');
      const grids = pad.root.findAllByType(PadGrid);
      expect(grids.map(sectionsIn)).toEqual([
        ['party-members', 'party-divisions'],
        ['party-receipts', 'party-debts-section'],
      ]);
      await act(async () => pad.unmount());
    } finally {
      setPad(false);
    }
  });

  test('?section=receipts still lands on Receipts when the sections pair', async () => {
    setPad(true);
    mockParams.section = 'receipts';
    const scrollTo = jest
      .spyOn(ScrollView.prototype, 'scrollTo')
      .mockImplementation(() => {});
    try {
      const r = await party('Labor');
      const anchors = r.root.findAll(
        (n) =>
          typeof n.type === 'string' &&
          typeof n.props.onLayout === 'function' &&
          n.findAllByType(PadGrid).length === 1 &&
          n.findAll((m) => m.props.testID === 'party-receipts').length > 0 &&
          n.findAll((m) => m.props.testID === 'party-members').length === 0,
      );
      expect(anchors.length).toBeGreaterThan(0);
      await act(async () => {
        anchors[anchors.length - 1]!.props.onLayout({
          nativeEvent: { layout: { x: 0, y: 900, width: 1000, height: 400 } },
        });
      });
      expect(scrollTo).toHaveBeenCalled();
      const y = (scrollTo.mock.calls.at(-1)![0] as { y: number }).y;
      expect(y).toBeGreaterThan(700);
      await act(async () => r.unmount());
    } finally {
      scrollTo.mockRestore();
      setPad(false);
    }
  });

  test('the Recent votes rows draw no em dash', async () => {
    const r = await party('Labor');
    try {
      const rows = spoken(r).filter((s) => s.division);
      expect(rows.length).toBeGreaterThan(0);
      for (const { words } of rows)
        for (const w of words) expect(w).not.toContain('\u2014');
      expect(drawn(r)).not.toContain('\u2014');
    } finally {
      await act(async () => r.unmount());
    }
  });
});

describe('record list', () => {
  beforeEach(() => jest.mocked(peopleDepth.list).mockReset());
  afterEach(() => {
    delete mockParams.kind;
    delete mockParams.person;
    delete mockParams.name;
  });
  async function list(kind: string) {
    mockParams.kind = kind;
    mockParams.person = 'penny-wong';
    mockParams.name = 'Penny Wong';
    let r!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      r = TestRenderer.create(<RecordList />);
    });
    return r;
  }

  const page = (start: number, count: number) => ({
    records: result(
      decodeRecords({
        results: Array.from({ length: count }, (_, index) => ({
          slug: `speech-fixture-${start + index}`,
          title: `Fixture speech ${start + index}`,
        })),
      }),
    ),
    briefs: {},
  });

  test('a failed next page keeps loaded speeches and offers an explicit retry of that page', async () => {
    jest
      .mocked(peopleDepth.list)
      .mockResolvedValueOnce(page(0, 20))
      .mockRejectedValueOnce(new ApiError('server', 'Unavailable'))
      .mockResolvedValueOnce(page(20, 1));
    const r = await list('speeches');
    await act(async () => r.root.findByType(FlatList).props.onEndReached());
    expect(r.root.findByType(FlatList).props.data).toHaveLength(20);
    const error = r.root.find(
      (node) =>
        node.props.testID === 'record-list-page-error' && !!node.props.onRetry,
    );
    // Scrolling again cannot repeatedly retry a failed paid read.
    await act(async () => r.root.findByType(FlatList).props.onEndReached());
    expect(peopleDepth.list).toHaveBeenCalledTimes(2);
    await act(async () => error.props.onRetry());
    expect(peopleDepth.list).toHaveBeenLastCalledWith(
      'Penny Wong',
      'speeches',
      2,
    );
    expect(r.root.findByType(FlatList).props.data).toHaveLength(21);
    expect(has(r, 'record-list-page-error')).toBe(false);
    await act(async () => r.unmount());
  });

  test('repeated end events start one page read and overlapping pages draw each record once', async () => {
    let finish!: (value: ReturnType<typeof page>) => void;
    jest
      .mocked(peopleDepth.list)
      .mockResolvedValueOnce(page(0, 20))
      .mockImplementation(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      );
    const r = await list('speeches');
    await act(async () => {
      const next = r.root.findByType(FlatList).props.onEndReached;
      next();
      next();
    });
    expect(peopleDepth.list).toHaveBeenCalledTimes(2);
    await act(async () => finish(page(19, 2)));
    expect(r.root.findByType(FlatList).props.data).toHaveLength(21);
    await act(async () => r.unmount());
  });

  test('news is not available yet: no read, and no Try again that cannot work', async () => {
    const r = await list('news');
    expect(peopleDepth.list).not.toHaveBeenCalled();
    const state = r.root.find(
      (n) =>
        n.props.testID === 'record-list-unavailable' &&
        n.props.title !== undefined,
    );
    expect(state.props.title).toBe('News isn’t available yet');
    expect(state.props.symbol).toBe('newspaper');
    expect(state.props.body).toBeUndefined();
    expect(state.props.action).toBeUndefined();
    expect(has(r, 'record-list-error')).toBe(false);
    await act(async () => r.unmount());
  });

  test('a failed speeches read keeps its Try again', async () => {
    jest
      .mocked(peopleDepth.list)
      .mockRejectedValue(new ApiError('server', 'down'));
    const r = await list('speeches');
    expect(peopleDepth.list).toHaveBeenCalled();
    const error = r.root.find(
      (n) =>
        n.props.testID === 'record-list-error' && n.props.title !== undefined,
    );
    expect(error.props.action?.label).toBe('Try again');
    expect(has(r, 'record-list-unavailable')).toBe(false);
    await act(async () => r.unmount());
  });
});
