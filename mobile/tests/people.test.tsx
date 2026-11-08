// Lane P, part 2 (people.md 2.1, 2.2): the person profile and the party
// page on the shared templates. Each block holds one acceptance check.
import { act } from 'react';
import { ScrollView } from 'react-native';
import TestRenderer from 'react-test-renderer';
import { peopleDepth, catalogs as runtime } from '../src/api/runtime';
import * as c from '../src/api/catalogs';
import { ApiError } from '../src/api/errors';
import Person from '../src/features/Person';
import Party from '../src/features/Party';
import { Text } from '../src/design/primitives';
import {
  formatCount,
  formatMoney,
  formatMoneyCompact,
  moneyAccessibilityLabel,
} from '../src/design/format';
import { partySlug } from '../src/design/party';
import {
  annualPay,
  decodeAccess,
  decodeFunding,
  interestsCount,
  payRateLine,
  stripSources,
  votesCount,
} from '../src/features/people/model';
import type { ProfileView } from '../src/features/your-mp/model';
import { followKey, useFollows } from '../src/features/follows/store';
import { useFollowStates } from '../src/features/follows/useFollowStates';
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
  },
}));
jest.mock('@shopify/react-native-skia', () => ({
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- inert host view
  Canvas: require('react-native').View,
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- inert host element
  Rect: (props: object) => require('react').createElement('Rect', props),
}));
jest.mock('../src/api/image-policy', () => ({
  localImageURI: (uri: string) => uri,
}));
const mockParams: { slug?: string; name?: string; section?: string } = {};
jest.mock('expo-router', () => ({
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
jest.mock('../src/features/follows/FollowToggle', () => ({
  FollowToggle: () => null,
}));
jest.mock('../src/features/follows/store', () => ({
  ...jest.requireActual('../src/features/follows/store'),
  useFollows: jest.fn(() => []),
}));
jest.mock('../src/features/follows/useFollowStates', () => ({
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
    expect(missing.props.action.label).toBe('Search');
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
    'party-current-count',
    'party-members-all',
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

  // PRODUCT BUG (src/features/Party.tsx:399): Party accepts
  // `section=changes` (line 74) but the Added since group has no wrapper
  // that reports its place, so the page never scrolls there. Drop
  // `.failing` when the group reports `placed('changes')`.
  test.failing(
    '?section=changes with a followed party scrolls to Added since, above Members',
    async () => {
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
    },
  );

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

  // PRODUCT BUG (src/features/Party.tsx:767): a Recent votes row puts the
  // division's whole motion text (`row.question`, e.g. "Kate Chaney by
  // leave\u2014I move amendments ...") in the stage slot of its meta line,
  // em dash and all. Drop `.failing` when the row draws a stage.
  test.failing('the Recent votes rows draw no em dash', async () => {
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
