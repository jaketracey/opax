import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import { router } from 'expo-router';
import { catalogs as runtime } from '../src/api/runtime';
import * as c from '../src/api/catalogs';
import { Alert } from 'react-native';
import { Card, Text } from '../src/design/primitives';
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
import ManageFollows, {
  NOTHING_FOLLOWED,
} from '../src/features/follows/ManageFollows';
import { showRecordMenu } from '../src/features/today/RecordMenu';
import { FollowToggle } from '../src/features/follows/FollowToggle';
import { catalogs, index } from './pinned';

const mockDisk = new Map<string, string>();
// Interrupts the Nth file change from now (1-based; 0 never), as a crash or
// failed save would. Native semantics: File.write is not atomic (a cut-short
// write leaves a torn file), and File.move with overwrite deletes the
// destination before moving (FileSystemPath.swift).
let mockFailAt = 0;
let mockChanges = 0;
const mockInterrupted = () => mockFailAt > 0 && ++mockChanges === mockFailAt;
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
      if (mockInterrupted()) {
        mockDisk.set(this.name, body.slice(0, Math.floor(body.length / 2)));
        throw new Error('write cut short');
      }
      mockDisk.set(this.name, body);
    }
    move(to: File, options?: { overwrite?: boolean }) {
      if (options?.overwrite) mockDisk.delete(to.name);
      if (mockInterrupted()) throw new Error('move failed');
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
jest.mock('../src/features/today/RecordMenu', () => ({
  showRecordMenu: jest.fn(),
}));

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
  money: null,
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
    mockFailAt = 0;
    resetFollowsForTests();
  });
  test('party follows retain the cap, alternate saves and recover after a torn save', async () => {
    await follow({kind:'party', id:'labor', title:'Labor'});
    await follow({kind:'person', id:ALBANESE, title:'Anthony Albanese'});
    expect([...mockDisk.keys()].sort()).toEqual(['opax-follows-v1.b.json','opax-follows-v1.json']);
    mockFailAt=1;mockChanges=0;
    await expect(follow({kind:'party',id:'greens',title:'Greens'})).rejects.toThrow();
    mockFailAt=0;resetFollowsForTests();
    expect((await loadFollows()).map(followKey)).toEqual(['party:labor', 'person:'+ALBANESE]);
    for (let i=0;i<48;i++) await follow({kind:'party',id:'fixture-party-'+i,title:'Fixture party '+i});
    expect(await follow({kind:'party',id:'extra',title:'Extra'})).toBe('limit');
    expect((await loadFollows()).length).toBe(50);
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
    expect(
      [...mockDisk.values()].map((body) => JSON.parse(body).version),
    ).toEqual([1, 1]);
    await unfollow(`bill:${BILL}`);
    expect(await loadFollows()).toEqual([]);
    await follow({ kind: 'electorate', id: GRAYNDLER, title: 'Grayndler' });
    await clearFollows();
    resetFollowsForTests();
    expect(await loadFollows()).toEqual([]);
  });
  test('a save interrupted at any file step keeps a whole list, now and after a relaunch', async () => {
    const before = [`bill:${BILL}`, `electorate:${GRAYNDLER}`];
    const after = [...before, `person:${ALBANESE}`];
    for (const step of [1, 2, 3]) {
      mockDisk.clear();
      mockFailAt = 0;
      resetFollowsForTests();
      await follow({ kind: 'bill', id: BILL, title: 'Bill' });
      await follow({ kind: 'electorate', id: GRAYNDLER, title: 'Grayndler' });
      mockChanges = 0;
      mockFailAt = step;
      const saved = await follow({
        kind: 'person',
        id: ALBANESE,
        title: 'Anthony Albanese',
      }).then(
        () => true,
        () => false,
      );
      mockFailAt = 0;
      const shown = (await loadFollows()).map(followKey);
      expect(shown).toEqual(saved ? after : before);
      // A relaunch reads the files: never fewer follows than were saved.
      resetFollowsForTests();
      expect((await loadFollows()).map(followKey)).toEqual(
        saved ? after : before,
      );
    }
  });
  test('the newest whole copy wins; a torn or older slot is ignored', async () => {
    await follow({ kind: 'bill', id: BILL, title: 'Bill' });
    await follow({ kind: 'electorate', id: GRAYNDLER, title: 'Grayndler' });
    // Saves alternate between the two slots, each carrying its number.
    expect(
      [...mockDisk.entries()]
        .map(([name, body]) => [name, JSON.parse(body).generation])
        .sort(),
    ).toEqual([
      ['opax-follows-v1.b.json', 2],
      ['opax-follows-v1.json', 1],
    ]);
    mockDisk.set('opax-follows-v1.json', '{"version":1,"generation":3,"fol');
    resetFollowsForTests();
    expect((await loadFollows()).map(followKey)).toEqual([
      `bill:${BILL}`,
      `electorate:${GRAYNDLER}`,
    ]);
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
  test('with nothing followed, Today draws no Following block and reads no catalogs', async () => {
    const r = await render(
      <FollowingSection refresh={0} refreshing={false} onRetry={jest.fn()} />,
    );
    // Design pass 4C: an empty Following block does not render (no helper
    // card); the profile's Follow and Manage follows explain following.
    expect(
      r.root.findAll((n) => n.props.testID === 'today-following').length,
    ).toBe(0);
    expect(textOf(r)).toBe('');
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
      { people: true, bills: true, electorates: false, parties: false },
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
    // Rows on the paper (design pass 4C): no card and no icon badge per follow.
    expect(r.root.findAllByType(Card)).toHaveLength(0);
    // A pull to refresh revalidates and finds the fixture's two changes.
    mock.followSources.mockResolvedValue(changedSources());
    await act(async () =>
      r.update(
        <FollowingSection refresh={1} refreshing={false} onRetry={jest.fn()} />,
      ),
    );
    expect(mock.followSources).toHaveBeenLastCalledWith(
      { people: true, bills: true, electorates: false, parties: false },
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
  test('a saved copy says so once, with one source line in the saved state', async () => {
    mock.followSources.mockResolvedValue(
      sources({
        stale: true,
        savedAt: Date.UTC(2026, 9, 3, 2),
        staleReason: 'unavailable',
      }),
    );
    await follow({ kind: 'bill', id: BILL, title: 'Ending Financial Abuse' });
    const r = await render(
      <FollowingSection refresh={0} refreshing={false} onRetry={jest.fn()} />,
    );
    expect(textOf(r)).toContain(
      'The latest public export could not be loaded. Showing the saved copy.',
    );
    const line = r.root.find(
      (n) =>
        n.props.testID === 'today-following-stale' &&
        typeof n.props.onPress === 'function',
    );
    expect(line.props.accessibilityLabel).toBe(
      'Published records, Saved 3 Oct 2026',
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

describe('Manage follows', () => {
  beforeEach(() => {
    mockDisk.clear();
    resetFollowsForTests();
    jest.clearAllMocks();
  });
  async function render() {
    let r!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      r = TestRenderer.create(<ManageFollows />);
    });
    // Each row learns its width, which brings in its swipe action.
    await act(async () => {
      for (const node of r.root.findAll(
        (n) =>
          typeof n.type === 'string' && typeof n.props.onLayout === 'function',
      ))
        node.props.onLayout({ nativeEvent: { layout: { width: 390 } } });
    });
    return r;
  }
  const byID = (r: TestRenderer.ReactTestRenderer, testID: string) =>
    r.root.find(
      (n) => n.props.testID === testID && typeof n.props.onPress === 'function',
    );
  const count = (r: TestRenderer.ReactTestRenderer) =>
    [
      r.root.find(
        (n) => n.type === Text && n.props.testID === 'follows-count',
      ).props.children,
    ]
      .flat()
      .join('');
  test('with nothing followed, one sentence at the block size', async () => {
    const r = await render();
    const empty = r.root.find((n) => n.props.testID === 'follows-empty');
    expect(empty.props.message).toBe(NOTHING_FOLLOWED);
    expect(NOTHING_FOLLOWED.split('. ')).toHaveLength(1);
    expect(empty.props.size ?? 'block').toBe('block');
    await act(async () => r.unmount());
  });
  test('rows open their page; unfollow is a swipe action and a touch-and-hold choice', async () => {
    await follow({ kind: 'person', id: ALBANESE, title: 'Anthony Albanese' });
    await follow({ kind: 'bill', id: BILL, title: 'Ending Financial Abuse' });
    await follow({ kind: 'electorate', id: GRAYNDLER, title: 'Grayndler' });
    const r = await render();
    expect(count(r)).toBe('Following 3 of at most 50');
    // No drawn Unfollow under every row: the action sits behind the swipe,
    // and stays a button for VoiceOver and journeys.
    const action = byID(r, `follows-unfollow-electorate-${GRAYNDLER}`);
    expect(action.props.accessibilityLabel).toBe('Unfollow Grayndler');
    expect(action.props.accessibilityRole).toBe('button');
    await act(async () => byID(r, `follows-open-bill-${BILL}`).props.onPress());
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/bill/[key]',
      params: { key: BILL },
    });
    await act(async () => action.props.onPress());
    expect((await loadFollows()).map((f) => f.id)).toEqual([ALBANESE, BILL]);
    expect(count(r)).toBe('Following 2 of at most 50');
    // Touch and hold offers Open and Unfollow.
    await act(async () =>
      byID(r, `follows-open-person-${ALBANESE}`).props.onLongPress(),
    );
    const [title, actions] = jest.mocked(showRecordMenu).mock.calls[0]!;
    expect(title).toBe('Anthony Albanese');
    expect(actions.map((a) => a.title)).toEqual(['Open', 'Unfollow']);
    await act(async () => actions[1]!.onPress());
    expect((await loadFollows()).map((f) => f.id)).toEqual([BILL]);
    await act(async () => r.unmount());
  });
  test('unfollow all asks first, then leaves the empty sentence', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await follow({ kind: 'bill', id: BILL, title: 'Ending Financial Abuse' });
    const r = await render();
    await act(async () => byID(r, 'follows-clear').props.onPress());
    expect(alert).toHaveBeenCalledWith(
      'Unfollow all 1?',
      expect.any(String),
      expect.any(Array),
    );
    const buttons = alert.mock.calls[0]![2]!;
    await act(async () => buttons[1]!.onPress!());
    expect(await loadFollows()).toEqual([]);
    expect(
      r.root.find((n) => n.props.testID === 'follows-empty').props.message,
    ).toBe(NOTHING_FOLLOWED);
    alert.mockRestore();
    await act(async () => r.unmount());
  });
});
