import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import { router } from 'expo-router';
import { catalogs as runtime } from '../src/api/runtime';
import * as c from '../src/api/catalogs';
import { Text } from '../src/design/primitives';
import {
  followState,
  quarterEnd,
  type FollowSources,
} from '../src/features/follows/markers';
import {
  FOLLOW_LIMIT,
  clearFollows,
  decodeFollows,
  follow,
  followKey,
  loadFollows,
  markSeen,
  resetFollowsForTests,
  unfollow,
  type Fingerprint,
} from '../src/features/follows/store';
import { FollowingSection } from '../src/features/follows/FollowingSection';
import { FollowToggle } from '../src/features/follows/FollowToggle';
import { catalogs, index } from './pinned';

const mockDisk = new Map<string, string>();
jest.mock('expo-file-system', () => {
  class File {
    name: string;
    constructor(_directory: unknown, name: string) {
      this.name = name;
    }
    get exists() {
      return mockDisk.has(this.name);
    }
    async text() {
      return mockDisk.get(this.name)!;
    }
    write(body: string) {
      mockDisk.set(this.name, body);
    }
    move(to: File) {
      mockDisk.set(to.name, mockDisk.get(this.name)!);
      mockDisk.delete(this.name);
    }
  }
  return { File, Paths: { document: 'documents' } };
});
jest.mock('../src/api/runtime', () => ({
  catalogs: { followSources: jest.fn() },
}));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

const ALBANESE = 'person_2b850aa643795ce8902f754b';
const BILL = 'au-federal-r7549';
const GRAYNDLER = 'el_5d600e7f6dca5b72ae04d686';
const sources = (over: Partial<FollowSources> = {}): FollowSources => ({
  manifest: catalogs.manifest,
  roster: catalogs.roster,
  slugs: catalogs.slugs,
  people: catalogs.people,
  electorates: index,
  bills: catalogs.bills!,
  votes: catalogs.votes!,
  interestIndex: catalogs.interestIndex!,
  pay: catalogs.pay!,
  expenses: catalogs.expenses!,
  stale: false,
  savedAt: 1,
  error: null,
  ...over,
});
const readyState = (s: ReturnType<typeof followState>) => {
  if (s.status !== 'ready') throw new Error(`Not ready: ${s.status}`);
  return s;
};
const seenFor = (kind: 'person' | 'bill' | 'electorate', id: string) =>
  readyState(followState({ kind, id, seen: null }, sources())).current;
// The changed-data fixture's two synthetic bumps (scripts/fixture-server.ts).
function changedSources() {
  const interestIndex = structuredClone(catalogs.interestIndex!);
  interestIndex.people[c.interestKey('10007')]!.total += 1;
  const bills = structuredClone(catalogs.bills!);
  Object.assign(bills.bills.find((b) => b.key === BILL)!, {
    status: 'passed',
    status_as_of: '2026-10-01',
  });
  return sources({ interestIndex, bills });
}

describe('change markers', () => {
  test('each follow reads its markers and their dates from the shared catalogs', () => {
    const person = seenFor('person', ALBANESE);
    expect(person.declarations).toEqual({
      value: 28,
      words: 'Register of Members’ Interests',
      asAt: '2026-09-04',
    });
    expect(person.divisions).toMatchObject({ value: 2929, asAt: null });
    expect(person.party).toMatchObject({ value: 'current|Labor' });
    expect(person.seat).toMatchObject({ value: GRAYNDLER, words: 'Grayndler' });
    expect(person.pay).toMatchObject({
      value: '2026-09-17|Prime Minister|622102',
      asAt: '2026-09-17',
    });
    expect(person.expenses).toMatchObject({
      value: '2026Q02|24402773',
      asAt: '2026-09-02T00:16:57Z',
    });
    expect(seenFor('bill', BILL).status).toEqual({
      value: 'before_parliament',
      words: 'before parliament',
      asAt: '2026-09-17',
    });
    expect(seenFor('electorate', GRAYNDLER)).toMatchObject({
      representatives: { value: ALBANESE, asAt: '2026-09-04' },
      election: { value: '2025-05-03|3', asAt: '2025-05-03' },
    });
  });
  test('the same record reads as no change', () => {
    for (const [kind, id] of [
      ['person', ALBANESE],
      ['bill', BILL],
      ['electorate', GRAYNDLER],
    ] as const)
      expect(
        readyState(
          followState({ kind, id, seen: seenFor(kind, id) }, sources()),
        ).changes,
      ).toEqual([]);
  });
  test("the changed fixture's declaration and bill stage read in plain words with source and date", () => {
    const moved = changedSources();
    expect(
      readyState(
        followState(
          { kind: 'person', id: ALBANESE, seen: seenFor('person', ALBANESE) },
          moved,
        ),
      ).changes,
    ).toEqual([
      {
        marker: 'declarations',
        text: '1 new declared entry',
        citation: 'Register of Members’ Interests',
        asAt: '2026-09-04',
      },
    ]);
    expect(
      readyState(
        followState(
          { kind: 'bill', id: BILL, seen: seenFor('bill', BILL) },
          moved,
        ),
      ).changes,
    ).toEqual([
      {
        marker: 'status',
        text: 'Now passed; was before parliament',
        citation: 'ParlInfo bill records',
        asAt: '2026-10-01',
      },
    ]);
  });
  test('party, seat, votes, pay and expenses changes name what moved', () => {
    const seen: Fingerprint = {
      ...seenFor('person', ALBANESE),
      party: { value: 'current|Greens', words: 'Greens', asAt: '2026-01-01' },
      seat: { value: 'el_x', words: 'Sydney', asAt: '2026-01-01' },
      divisions: { value: 2919, words: 'They Vote For You', asAt: null },
      pay: { value: '2026-07-01|Minister|1', asAt: '2026-07-01' },
      expenses: { value: '2026Q01|1', asAt: '2026-06-01' },
    };
    const texts = readyState(
      followState({ kind: 'person', id: ALBANESE, seen }, sources()),
    ).changes.map((change) => change.text);
    expect(texts).toEqual([
      '10 new recorded divisions',
      'Party now recorded as Labor; was Greens',
      'Seat now recorded as Grayndler; was Sydney',
      'Pay now recorded as $622,102 a year as Prime Minister',
      'Expenses now cover to June 2026: $24,402,773 recorded',
    ]);
    // An as-at date alone moving is an update, not a new rate.
    const dated = readyState(
      followState(
        {
          kind: 'person',
          id: ALBANESE,
          seen: {
            ...seenFor('person', ALBANESE),
            pay: {
              value: '2026-08-17|Prime Minister|622102',
              asAt: '2026-08-17',
            },
          },
        },
        sources(),
      ),
    ).changes;
    expect(dated.map((change) => change.text)).toEqual(['Pay records updated']);
  });
  test('a register file that appears or goes says so', () => {
    const seen = {
      ...seenFor('person', ALBANESE),
      declarations: { value: null, asAt: null },
    };
    expect(
      readyState(followState({ kind: 'person', id: ALBANESE, seen }, sources()))
        .changes[0]!.text,
    ).toBe('Register file now held, with 28 declared entries');
    const fewer = {
      ...seenFor('person', ALBANESE),
      declarations: { value: 30, asAt: null },
    };
    expect(
      readyState(
        followState({ kind: 'person', id: ALBANESE, seen: fewer }, sources()),
      ).changes[0]!.text,
    ).toBe('2 fewer declared entries');
  });
  test('electorates report a new representative and a new election result', () => {
    const seen: Fingerprint = {
      ...seenFor('electorate', GRAYNDLER),
      representatives: {
        value: 'person_000000000000000000000000',
        words: 'A Previous Member',
        asAt: '2025-01-01',
      },
      election: { value: '2022-05-21|2', asAt: '2022-05-21' },
    };
    expect(
      readyState(
        followState({ kind: 'electorate', id: GRAYNDLER, seen }, sources()),
      ).changes.map((change) => [change.text, change.asAt]),
    ).toEqual([
      [
        'Representative now recorded as Anthony Albanese; was A Previous Member',
        '2026-09-04',
      ],
      ['New election result: 3 May 2025', '2025-05-03'],
    ]);
  });
  test('bills report new divisions and speeches, and a new stage date', () => {
    const seen: Fingerprint = {
      ...seenFor('bill', 'au-federal-r7534'),
      moved: { value: '2026-08-19', asAt: '2026-08-19' },
      divisions: { value: 10, asAt: null },
      speeches: { value: 0, asAt: null },
    };
    expect(
      readyState(
        followState({ kind: 'bill', id: 'au-federal-r7534', seen }, sources()),
      ).changes.map((change) => change.text),
    ).toEqual([
      'New stage recorded on 26 August 2026',
      '2 new divisions',
      '1 new speech',
    ]);
  });
  test('a record gone from the catalog is missing; unread catalogs are unavailable', () => {
    expect(
      followState({ kind: 'bill', id: 'au-federal-r1', seen: null }, sources())
        .status,
    ).toBe('missing');
    expect(
      followState(
        { kind: 'bill', id: BILL, seen: null },
        sources({ bills: null }),
      ).status,
    ).toBe('unavailable');
    expect(
      followState({ kind: 'person', id: ALBANESE, seen: null }, null).status,
    ).toBe('unavailable');
  });
  test('a failed optional catalog skips its marker instead of reporting a change', () => {
    const seen = seenFor('person', ALBANESE);
    const state = readyState(
      followState(
        { kind: 'person', id: ALBANESE, seen },
        sources({ votes: null, pay: null }),
      ),
    );
    expect(state.current.divisions).toBeUndefined();
    expect(state.current.pay).toBeUndefined();
    expect(state.changes).toEqual([]);
  });
  test('IPEA quarters read as their last month', () => {
    expect(quarterEnd('2026Q02')).toBe('June 2026');
    expect(quarterEnd('2025Q04')).toBe('December 2025');
  });
});

describe('the follows store', () => {
  beforeEach(() => {
    mockDisk.clear();
    resetFollowsForTests();
  });
  test('saved follows decode strictly: known kinds, valid IDs, no duplicates, at most the cap', () => {
    const row = (id: string, kind = 'bill') => ({
      kind,
      id,
      title: 'A bill',
      followedAt: 1,
      seen: { status: { value: 'passed', asAt: null }, bad: { value: {} } },
      seenAt: 2,
    });
    const decoded = decodeFollows({
      version: 1,
      follows: [
        row(BILL),
        row(BILL),
        row('not-a-key'),
        row(ALBANESE, 'donor'),
        row(ALBANESE, 'person'),
      ],
    });
    expect(decoded.map(followKey)).toEqual([
      `bill:${BILL}`,
      `person:${ALBANESE}`,
    ]);
    expect(decoded[0]!.seen).toEqual({
      status: { value: 'passed', asAt: null },
    });
    expect(decodeFollows({ version: 2, follows: [row(BILL)] })).toEqual([]);
    expect(
      decodeFollows({
        version: 1,
        follows: Array.from({ length: 60 }, (_, i) =>
          row(`au-federal-r${i + 1}`),
        ),
      }),
    ).toHaveLength(FOLLOW_LIMIT);
  });
  test('follows persist on the device, keep earlier markers on a partial look, and clear', async () => {
    expect(await follow({ kind: 'bill', id: BILL, title: 'Bill' })).toBe(
      'followed',
    );
    expect(await follow({ kind: 'bill', id: BILL, title: 'Bill' })).toBe(
      'already',
    );
    await markSeen(`bill:${BILL}`, {
      status: { value: 'before_parliament', asAt: '2026-09-17' },
      divisions: { value: 0, asAt: null },
    });
    await markSeen(`bill:${BILL}`, {
      status: { value: 'passed', asAt: '2026-10-01' },
    });
    resetFollowsForTests();
    const [saved] = await loadFollows();
    expect(saved!.seen).toEqual({
      status: { value: 'passed', asAt: '2026-10-01' },
      divisions: { value: 0, asAt: null },
    });
    expect(JSON.parse(mockDisk.get('opax-follows-v1.json')!).version).toBe(1);
    await unfollow(`bill:${BILL}`);
    expect(await loadFollows()).toEqual([]);
    await follow({ kind: 'electorate', id: GRAYNDLER, title: 'Grayndler' });
    await clearFollows();
    resetFollowsForTests();
    expect(await loadFollows()).toEqual([]);
  });
  test('the cap refuses a new follow', async () => {
    for (let i = 1; i <= FOLLOW_LIMIT; i++)
      await follow({ kind: 'bill', id: `au-federal-r${i}`, title: `B${i}` });
    expect(await follow({ kind: 'bill', id: BILL, title: 'Bill' })).toBe(
      'limit',
    );
    expect(await loadFollows()).toHaveLength(FOLLOW_LIMIT);
  });
});

describe('Following on Today and the follow switch', () => {
  const mock = runtime as jest.Mocked<typeof runtime>;
  const textOf = (r: TestRenderer.ReactTestRenderer) =>
    r.root
      .findAllByType(Text)
      .flatMap((n) => n.props.children)
      .filter((v) => typeof v === 'string')
      .join(' ');
  beforeEach(() => {
    mockDisk.clear();
    resetFollowsForTests();
    jest.clearAllMocks();
  });
  async function render(element: React.ReactElement) {
    let r!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      r = TestRenderer.create(element);
    });
    return r;
  }
  test('with nothing followed, Today explains follows and reads no catalogs', async () => {
    const r = await render(
      <FollowingSection refresh={0} refreshing={false} onRetry={jest.fn()} />,
    );
    expect(
      r.root.findAll((n) => n.props.testID === 'today-following-empty').length,
    ).toBeGreaterThan(0);
    expect(textOf(r)).toContain('Follows are saved on this iPhone only');
    expect(mock.followSources).not.toHaveBeenCalled();
    await act(async () => r.unmount());
  });
  test('followed items show no changes, then what changed after a refresh; opening one marks it seen', async () => {
    mock.followSources.mockResolvedValue(sources());
    await follow({ kind: 'person', id: ALBANESE, title: 'Anthony Albanese' });
    await follow({ kind: 'bill', id: BILL, title: 'Ending Financial Abuse' });
    const r = await render(
      <FollowingSection refresh={0} refreshing={false} onRetry={jest.fn()} />,
    );
    expect(mock.followSources).toHaveBeenLastCalledWith(
      { people: true, bills: true, electorates: false },
      false,
    );
    const row = (id: string) =>
      r.root.find(
        (n) =>
          typeof n.props.onPress === 'function' &&
          String(n.props.testID).startsWith('today-following-') &&
          String(n.props.testID).endsWith(id),
      );
    expect(row(ALBANESE).props.accessibilityLabel).toMatch(
      /^Anthony Albanese, Parliamentarian, No changes since \d+ \w+ 2026$/,
    );
    expect(textOf(r)).toContain('No changes since you last looked.');
    // A pull to refresh revalidates and finds the fixture's two changes.
    mock.followSources.mockResolvedValue(changedSources());
    await act(async () =>
      r.update(
        <FollowingSection refresh={1} refreshing={false} onRetry={jest.fn()} />,
      ),
    );
    expect(mock.followSources).toHaveBeenLastCalledWith(
      { people: true, bills: true, electorates: false },
      true,
    );
    expect(row(ALBANESE).props.accessibilityLabel).toMatch(
      /^Anthony Albanese, Parliamentarian, 1 change since \d+ \w+ 2026, 1 new declared entry, Register of Members’ Interests, as at 4 September 2026$/,
    );
    expect(row(BILL).props.accessibilityLabel).toContain(
      'Now passed; was before parliament, ParlInfo bill records, as at 1 October 2026',
    );
    expect(textOf(r)).toContain('1 new declared entry');
    expect(textOf(r)).toContain('2 of 2 changed since you last looked.');
    await act(async () => row(BILL).props.onPress());
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/bill/[key]',
      params: { key: BILL },
    });
    expect(row(BILL).props.accessibilityLabel).toMatch(/No changes since/);
    expect(textOf(r)).toContain('1 of 2 changed since you last looked.');
    expect(row(ALBANESE).props.accessibilityLabel).toContain(
      '1 new declared entry',
    );
    await act(async () => r.unmount());
  });
  test('the switch says what it follows and whether it is on, and is saved on the device', async () => {
    mock.followSources.mockResolvedValue(sources());
    const r = await render(
      <FollowToggle
        kind="electorate"
        id={GRAYNDLER}
        title="Grayndler"
        testID="electorate-follow"
      />,
    );
    const toggle = () =>
      r.root.find(
        (n) =>
          n.props.accessibilityRole === 'switch' &&
          typeof n.props.onPress === 'function' &&
          String(n.props.testID).startsWith('electorate-follow-'),
      );
    expect(toggle().props).toMatchObject({
      accessibilityRole: 'switch',
      accessibilityLabel: 'Follow Grayndler',
      accessibilityState: { checked: false, disabled: false },
      testID: 'electorate-follow-off',
    });
    await act(async () => toggle().props.onPress());
    expect(toggle().props.accessibilityState.checked).toBe(true);
    expect(toggle().props.testID).toBe('electorate-follow-on');
    expect(textOf(r)).toContain('Following');
    // Following takes the record as published now as what was seen.
    const [saved] = await loadFollows();
    expect(saved!.seen?.representatives?.value).toBe(ALBANESE);
    await act(async () => toggle().props.onPress());
    expect(toggle().props.testID).toBe('electorate-follow-off');
    expect(await loadFollows()).toEqual([]);
    await act(async () => r.unmount());
  });
});
