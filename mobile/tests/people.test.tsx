// Lane P, part 2 (people.md 2.1, 2.2): the person profile and the party
// page on the shared templates. Each block holds one acceptance check.
import { act } from 'react';
import { ScrollView } from 'react-native';
import TestRenderer from 'react-test-renderer';
import { catalogs as runtime } from '../src/api/runtime';
import * as c from '../src/api/catalogs';
import { ApiError } from '../src/api/errors';
import Person from '../src/features/Person';
import { Text } from '../src/design/primitives';
import {
  formatCount,
  formatMoney,
  moneyAccessibilityLabel,
} from '../src/design/format';
import {
  annualPay,
  interestsCount,
  payRateLine,
  stripSources,
  votesCount,
} from '../src/features/people/model';
import type { ProfileView } from '../src/features/your-mp/model';
import { useFollows } from '../src/features/follows/store';
import { useFollowStates } from '../src/features/follows/useFollowStates';
import { catalogs, manifest, people, pinned, roster, slugs } from './pinned';

jest.mock('../src/api/runtime', () => ({
  portraits: { get: jest.fn() },
  catalogs: {
    person: jest.fn(),
    profileFor: jest.fn(),
    rosterProfileFor: jest.fn(),
    directory: jest.fn(),
  },
}));
jest.mock('../src/api/image-policy', () => ({
  localImageURI: (uri: string) => uri,
}));
const mockParams: { slug?: string; section?: string } = {};
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
