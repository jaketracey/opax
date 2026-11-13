import * as accessibility from '../src/design/accessibility';
import * as myMember from '../src/features/your-mp/useIsMyMember';
import { Screen } from '../src/design/layout';
import { router } from 'expo-router';
import { withNavigationOptions } from './navigation-options';
import { act } from 'react';
import {
  AccessibilityInfo,
  Animated,
  ActionSheetIOS,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import TestRenderer from 'react-test-renderer';
import * as Reanimated from 'react-native-reanimated';
import * as c from '../src/api/catalogs';
import { catalogs as runtime } from '../src/api/runtime';
import { Button, FollowButton } from '../src/design/controls';
import { revealMotion } from '../src/design/reveal';
import { Card, Text } from '../src/design/primitives';
import { LinkRow } from '../src/design/rows';
import { StatusCapsule } from '../src/design/labels';
import { Portrait } from '../src/design/people';
import { rhythm } from '../src/design/tokens';
import {
  changeDate,
  checkedText,
  currentKeys,
  quietText,
} from '../src/features/follows/changes';
import Following, {
  NOTHING_FOLLOWED,
  NOTHING_FOLLOWED_TITLE,
  followGroups,
  type FollowEntry,
} from '../src/features/follows/Following';
import { FollowingSection } from '../src/features/follows/FollowingSection';
import {
  quarterEnd,
  followState as readFollowState,
  type FollowSources,
} from '../src/features/follows/markers';
import {
  FOLLOW_LIMIT,
  clearFollows,
  decodeFollows,
  follow,
  followKey,
  followWithFeedback,
  loadFollows,
  markSeen,
  resetFollowsForTests,
  unfollow,
  type Fingerprint,
  type Follow,
} from '../src/features/follows/store';
import { catalogs, index } from './pinned';
import { menuTitle } from '../src/design/menu-title';

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
let mockParams: Record<string, string> = {};
let mockOptions: Record<string, unknown> = {};
jest.mock('expo-router', () => {
  const React = jest.requireActual('react');
  const { Pressable } = jest.requireActual('react-native');
  const Link = ({ children, ...props }: { children: unknown }) =>
    React.createElement(Pressable, props, children);
  Link.Trigger = function Trigger({ children }: { children: unknown }) {
    return children;
  };
  Link.Preview = function Preview() {
    return null;
  };
  Link.Menu = function Menu() {
    return null;
  };
  Link.MenuAction = function MenuAction() {
    return null;
  };
  return {
    router: { push: jest.fn() },
    Link,
    useLocalSearchParams: () => mockParams,
    Stack: {
      Screen: function Screen({
        options,
      }: {
        options: Record<string, unknown>;
      }) {
        mockOptions = options;
        return null;
      },
    },
  };
});

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
const followState = (
  f: Parameters<typeof readFollowState>[0],
  s: Parameters<typeof readFollowState>[1],
) =>
  readFollowState(
    { ...f, ...(f.seen ? { seenKeys: currentKeys(f.seen) } : {}) },
    s,
  );
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
    ).toEqual([]);
    expect(
      readyState(
        followState(
          { kind: 'bill', id: BILL, seen: seenFor('bill', BILL) },
          moved,
        ),
      ).changes,
    ).toMatchObject([
      {
        marker: 'status',
        text: 'Passed',
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
      divisions: {
        value: 2919,
        words: 'They Vote For You',
        asAt: null,
        records: seenFor('person', ALBANESE).divisions?.records,
      },
      pay: { value: '2026-07-01|Minister|1', asAt: '2026-07-01' },
      expenses: { value: '2026Q01|1', asAt: '2026-06-01' },
    };
    const texts = readyState(
      followState({ kind: 'person', id: ALBANESE, seen }, sources()),
    ).changes.map((change) => change.text);
    expect(texts).toEqual([
      'Now Labor; was Greens',
      'Now Member for Grayndler; was Sydney',
      'Expenses to June 2026 published',
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
    expect(dated.map((change) => change.text)).toEqual([]);
  });
  test('register counts alone cannot identify a new record', () => {
    for (const value of [null, 30]) {
      const seen = {
        ...seenFor('person', ALBANESE),
        declarations: { value, asAt: null },
      };
      expect(
        readyState(
          followState({ kind: 'person', id: ALBANESE, seen }, sources()),
        ).changes,
      ).toEqual([]);
    }
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
        'Now represented by Anthony Albanese; was A Previous Member',
        '2026-09-04',
      ],
      ['Election result added', '2025-05-03'],
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
    ).toEqual(['Moved to a new stage']);
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
    await follow({ kind: 'party', id: 'labor', title: 'Labor' });
    await follow({ kind: 'person', id: ALBANESE, title: 'Anthony Albanese' });
    expect([...mockDisk.keys()].sort()).toEqual([
      'opax-follows-v1.b.json',
      'opax-follows-v1.json',
    ]);
    mockFailAt = 1;
    mockChanges = 0;
    await expect(
      follow({ kind: 'party', id: 'greens', title: 'Greens' }),
    ).rejects.toThrow();
    mockFailAt = 0;
    resetFollowsForTests();
    expect((await loadFollows()).map(followKey)).toEqual([
      'party:labor',
      'person:' + ALBANESE,
    ]);
    for (let i = 0; i < 48; i++)
      await follow({
        kind: 'party',
        id: 'fixture-party-' + i,
        title: 'Fixture party ' + i,
      });
    expect(await follow({ kind: 'party', id: 'extra', title: 'Extra' })).toBe(
      'limit',
    );
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
      `donor:${ALBANESE}`,
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
      r = TestRenderer.create(
        withNavigationOptions(element, (options) => {
          mockOptions = options;
        }),
      );
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
  test('pending followed records keep saved titles and a total failure never claims no changes', async () => {
    let fail!: (e: Error) => void;
    mock.followSources.mockImplementationOnce(
      () =>
        new Promise((_, reject) => {
          fail = reject;
        }),
    );
    await follow({ kind: 'bill', id: BILL, title: 'Saved bill title' });
    const r = await render(
      <FollowingSection refresh={0} refreshing={false} onRetry={jest.fn()} />,
    );
    // While pending, Today's one collapsed Following row (w5-today).
    expect(textOf(r)).toContain('Following');
    expect(textOf(r)).not.toContain('No changes since');
    expect(textOf(r)).not.toContain(NOTHING_FOLLOWED);
    await act(async () => fail(new Error('Offline')));
    expect(
      r.root.findAllByProps({ testID: 'today-following-error' }).length,
    ).toBeGreaterThan(0);
    expect(textOf(r)).not.toContain('No changes since');
    await act(async () => r.unmount());
  });
  test('followed items show no changes, then what changed after a refresh', async () => {
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
    // w5-today: Today lists changed follows only; with none, one row.
    const rows = (id: string) =>
      r.root.findAll(
        (n) =>
          typeof n.props.href === 'object' &&
          String(n.props.testID).startsWith('today-following-') &&
          String(n.props.testID).endsWith(id),
      );
    expect(rows(ALBANESE)).toHaveLength(0);
    expect(textOf(r)).toContain('Following');
    // Rows on the paper (design pass 4C): no card and no icon badge per follow.
    expect(r.root.findAllByType(Card)).toHaveLength(0);
    // A pull to refresh revalidates and finds the fixture's two changes.
    mock.followSources.mockResolvedValue(changedSources());
    await act(async () =>
      r.update(
        withNavigationOptions(
          <FollowingSection
            refresh={1}
            refreshing={false}
            onRetry={jest.fn()}
          />,
          (options) => {
            mockOptions = options;
          },
        ),
      ),
    );
    expect(mock.followSources).toHaveBeenLastCalledWith(
      { people: true, bills: true, electorates: false, parties: false },
      true,
    );
    expect(rows(ALBANESE)).toHaveLength(0);
    expect(rows(BILL)[0]!.props.accessibilityLabel).toContain('Changed:');
    expect(rows(BILL)[0]!.props.href.pathname).toBe('/bill/[key]');
    await act(async () => r.unmount());
  });
  test('a saved copy adds no notice of its own (Today has one offline line)', async () => {
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
    expect(textOf(r)).not.toContain('Showing the saved copy.');
    expect(
      r.root.findAll((n) => n.props.testID === 'today-following-stale'),
    ).toHaveLength(0);
    await act(async () => r.unmount());
  });
  test('the button says what it follows and whether it is on, and is saved on the device', async () => {
    mock.followSources.mockResolvedValue(sources());
    const r = await render(
      <FollowButton
        kind="electorate"
        id={GRAYNDLER}
        title="Grayndler"
        testID="electorate-follow"
      />,
    );
    const toggle = () =>
      r.root.find(
        (n) =>
          n.props.accessibilityRole === 'button' &&
          typeof n.props.onPress === 'function' &&
          String(n.props.testID).startsWith('electorate-follow-'),
      );
    expect(toggle().props).toMatchObject({
      accessibilityRole: 'button',
      accessibilityLabel: 'Follow Grayndler',
      accessibilityState: { selected: false, disabled: false },
      testID: 'electorate-follow-off',
    });
    await act(async () => toggle().props.onPress());
    expect(toggle().props.accessibilityState.selected).toBe(true);
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

describe('Following', () => {
  const mock = runtime as jest.Mocked<typeof runtime>;
  beforeEach(() => {
    mockDisk.clear();
    resetFollowsForTests();
    jest.clearAllMocks();
    mockParams = {};
    mockOptions = {};
  });
  async function render() {
    let r!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      r = TestRenderer.create(
        withNavigationOptions(<Following />, (options) => {
          mockOptions = options;
        }),
      );
    });
    return r;
  }
  type Item = { label: string; type: string; onPress?: () => void };
  const bar = (): Item[] =>
    (mockOptions.unstable_headerRightItems as (() => Item[]) | undefined)?.() ??
    [];
  const has = (r: TestRenderer.ReactTestRenderer, testID: string) =>
    r.root.findAll((n) => n.props.testID === testID).length > 0;
  const press = (r: TestRenderer.ReactTestRenderer, testID: string) =>
    r.root
      .find(
        (n) =>
          n.props.testID === testID && typeof n.props.onPress === 'function',
      )
      .props.onPress();
  const groupOrder = (r: TestRenderer.ReactTestRenderer) =>
    r.root
      .findAll(
        (n) =>
          typeof n.type !== 'string' &&
          /^follows-(changed|person|bill|party|electorate)$/.test(
            String(n.props.testID),
          ) &&
          'header' in n.props,
      )
      .map((n) => n.props.header);
  const row = (r: TestRenderer.ReactTestRenderer, testID: string) =>
    r.root.find((n) => n.type === LinkRow && n.props.testID === testID);

  test.each(['success', 'failure'] as const)(
    'pull to refresh shows its spinner until the catalogue check finishes with %s',
    async (outcome) => {
      mock.followSources.mockResolvedValue(sources());
      await follow({ kind: 'bill', id: BILL, title: 'Fixture bill' });
      const r = await render();
      let finish!: (next: FollowSources) => void;
      let fail!: (error: Error) => void;
      mock.followSources.mockReturnValueOnce(
        new Promise((resolve, reject) => {
          finish = resolve;
          fail = reject;
        }),
      );
      const control = () =>
        r.root.findByType(ScrollView).props.refreshControl.props;
      expect(control().refreshing).toBe(false);
      act(() => control().onRefresh());
      expect(control().refreshing).toBe(true);
      expect(mock.followSources).toHaveBeenLastCalledWith(
        expect.objectContaining({ bills: true }),
        true,
      );
      await act(async () => {
        if (outcome === 'success') finish(changedSources());
        else fail(new Error('fixture check failed'));
      });
      expect(control().refreshing).toBe(false);
      expect(has(r, `follows-row-bill-${BILL}`)).toBe(true);
    },
  );

  test('an older refresh settling cannot stop the current pull to refresh spinner', async () => {
    mock.followSources.mockResolvedValue(sources());
    await follow({ kind: 'bill', id: BILL, title: 'Fixture bill' });
    const r = await render();
    let first!: (next: FollowSources) => void;
    let second!: (next: FollowSources) => void;
    mock.followSources
      .mockReturnValueOnce(
        new Promise((resolve) => {
          first = resolve;
        }),
      )
      .mockReturnValueOnce(
        new Promise((resolve) => {
          second = resolve;
        }),
      );
    const control = () =>
      r.root.findByType(ScrollView).props.refreshControl.props;
    act(() => control().onRefresh());
    act(() => control().onRefresh());
    await act(async () => first(sources()));
    expect(control().refreshing).toBe(true);
    await act(async () => second(changedSources()));
    expect(control().refreshing).toBe(false);
  });

  test('with nothing followed: one ContentUnavailable, no Edit, no storage line', async () => {
    const r = await render();
    const empty = r.root.find(
      (n) => n.props.testID === 'follows-empty' && 'title' in n.props,
    );
    expect(empty.props).toMatchObject({
      symbol: 'bell',
      title: NOTHING_FOLLOWED_TITLE,
      body: NOTHING_FOLLOWED,
    });
    expect(bar()).toEqual([]);
    expect(
      r.root
        .findAllByType(Text)
        .flatMap((n) => n.props.children)
        .join(' '),
    ).not.toMatch(/Saved on this|backups/);
    expect(mock.followSources).not.toHaveBeenCalled();
    act(() =>
      r.root.findByType(ScrollView).props.refreshControl.props.onRefresh(),
    );
    expect(
      r.root.findByType(ScrollView).props.refreshControl.props.refreshing,
    ).toBe(false);
    expect(mock.followSources).not.toHaveBeenCalled();
    await act(async () => r.unmount());
  });

  test('the first grouped heading has the standard inset without a marker section gap', async () => {
    mock.followSources.mockResolvedValue(sources());
    await follow({ kind: 'person', id: ALBANESE, title: 'Anthony Albanese' });
    const r = await render();
    const marker = r.root.find(
      (node) =>
        typeof node.type === 'string' &&
        node.props.testID === 'follows-browsing',
    );
    expect(StyleSheet.flatten(marker.props.style).position).toBe('absolute');
    expect(
      StyleSheet.flatten(
        r.root.findByType(ScrollView).props.contentContainerStyle,
      ).paddingTop,
    ).toBe(rhythm.block);
    expect(groupOrder(r)[0]).toBe('People');
    await act(async () => r.unmount());
  });

  test('Following puts bill metadata above a full-width title with the same padding as people', async () => {
    mock.followSources.mockResolvedValue(sources());
    await follow({ kind: 'person', id: ALBANESE, title: 'Anthony Albanese' });
    await follow({ kind: 'bill', id: BILL, title: 'Ending Financial Abuse' });
    const r = await render();
    const bill = row(r, `follows-row-bill-${BILL}`);
    const person = row(r, `follows-row-person-${ALBANESE}`);
    expect(bill.props.leading).toBeUndefined();
    expect(bill.props.aboveTitle.type).toBe(View);
    expect(StyleSheet.flatten(bill.props.aboveTitle.props.style)).toMatchObject(
      {
        flexDirection: 'row',
        flexWrap: 'wrap',
        columnGap: rhythm.tight,
        rowGap: rhythm.line,
      },
    );
    const capsule = bill.findByType(StatusCapsule);
    const date = bill
      .findAllByType(Text)
      .find((node) => node.props.variant === 'secondary');
    const title = bill
      .findAllByType(Text)
      .find((node) => node.props.children === bill.props.title);
    const metadata = bill
      .findAllByType(View)
      .find(
        (node) =>
          StyleSheet.flatten(node.props.style)?.columnGap === rhythm.tight &&
          node.findAllByType(StatusCapsule).includes(capsule),
      )!;
    expect(metadata.findAllByType(Text)).toContain(date);
    expect(metadata.findAllByType(Text)).not.toContain(title);
    const words = bill.findAllByType(Text);
    expect(words.indexOf(date!)).toBeLessThan(words.indexOf(title!));
    expect(person.props.leading).toBeUndefined();
    expect(person.props.leadingAccessory.type).toBe(Portrait);
    for (const item of [person, bill]) {
      const pressable = item
        .findAll((node) => !!node.props.style)
        .find((node) => {
          const style = node.props.style;
          return (
            StyleSheet.flatten(
              typeof style === 'function' ? style({ pressed: false }) : style,
            )?.paddingVertical === rhythm.row
          );
        })!;
      const style = pressable.props.style;
      expect(
        StyleSheet.flatten(
          typeof style === 'function' ? style({ pressed: false }) : style,
        ),
      ).toMatchObject({
        paddingVertical: rhythm.row,
        paddingHorizontal: 16,
      });
    }
    await act(async () => r.unmount());
  });

  test('groups People, Bills, Electorates; Changed comes first after a change, newest change first', async () => {
    mock.followSources.mockResolvedValue(sources());
    await follow({ kind: 'person', id: ALBANESE, title: 'Anthony Albanese' });
    await follow({ kind: 'bill', id: BILL, title: 'Ending Financial Abuse' });
    await follow({ kind: 'electorate', id: GRAYNDLER, title: 'Grayndler' });
    const r = await render();
    expect(groupOrder(r)).toEqual(['People', 'Bills', 'Electorates']);
    expect(has(r, 'follows-count')).toBe(false);
    // No dot on an unchanged row; its line says nothing is new (sweep 1
    // item 6), never a change.
    expect(row(r, `follows-row-electorate-${GRAYNDLER}`).props.detail).toMatch(
      /^Nothing new since \d{1,2} [A-Z][a-z]{2}$/,
    );
    mock.followSources.mockResolvedValue(changedSources());
    await act(async () =>
      r.root
        .find((n) => typeof n.props.onRefresh === 'function')
        .props.onRefresh(),
    );
    // The bill passed; a register count alone names no record, so the
    // person stays with People. Each follow appears once.
    expect(groupOrder(r)).toEqual(['Changed', 'People', 'Electorates']);
    const changed = r.root
      .find((n) => n.props.testID === 'follows-changed' && 'header' in n.props)
      .findAll((n) => n.type === LinkRow)
      .map((n) => n.props.testID);
    expect(changed).toEqual([`follows-row-bill-${BILL}`]);
    expect(
      r.root.findAll(
        (n) =>
          n.type === LinkRow && n.props.testID === `follows-row-bill-${BILL}`,
      ),
    ).toHaveLength(1);
    // A changed row pushes its page at the changes, and says "Changed:".
    const bill = row(r, `follows-row-bill-${BILL}`);
    expect(bill.props.href.params.section).toBe('changes');
    expect(bill.props.accessibilityLabel).toMatch(/, bill\. Changed: /);
    // Tapping only pushes the page; the page's group marks it seen.
    expect(bill.props.onPress).toBeUndefined();
    expect(bill.props.select).toBeUndefined();
    await act(async () => r.unmount());
  });

  test('the ordering rule: changed newest first, then people by family name and the rest A to Z', () => {
    const entry = (
      kind: Follow['kind'],
      title: string,
      asAt?: string,
    ): FollowEntry => ({
      follow: {
        kind,
        id: title,
        title,
        followedAt: 0,
        seen: null,
        seenAt: null,
      },
      title,
      ownMP: false,
      state: asAt
        ? {
            status: 'ready',
            title,
            current: {},
            keys: [],
            changes: [{ marker: 'm', text: 'Changed', citation: '', asAt }],
          }
        : undefined,
    });
    const groups = followGroups([
      entry('electorate', 'Sydney'),
      entry('person', 'Zed Adams'),
      entry('person', 'Anna Young'),
      entry('bill', 'Old bill', '2026-08-01'),
      entry('party', 'Labor', '2026-09-02'),
      entry('electorate', 'Grayndler'),
    ]);
    expect(groups.map((g) => [g.title, g.rows.map((e) => e.title)])).toEqual([
      ['Changed', ['Labor', 'Old bill']],
      ['People', ['Zed Adams', 'Anna Young']],
      ['Electorates', ['Grayndler', 'Sydney']],
    ]);
  });

  test('a row menu ends with Unfollow, in its own section', async () => {
    mock.followSources.mockResolvedValue(sources());
    await follow({ kind: 'electorate', id: GRAYNDLER, title: 'Grayndler' });
    const r = await render();
    const menu = row(r, `follows-row-electorate-${GRAYNDLER}`).props.menu;
    expect(menu.slice(0, -1).map((m: { title: string }) => m.title)).toEqual([
      'Share',
      'Copy link',
    ]);
    expect(menu.at(-1)).toMatchObject({
      inline: true,
      items: [{ title: 'Unfollow', destructive: true }],
    });
    await act(async () => menu.at(-1).items[0].onPress());
    expect(await loadFollows()).toEqual([]);
    await act(async () => r.unmount());
  });

  test('Edit: a minus per row unfollows at once; Unfollow all asks with an action sheet; empty ends Edit', async () => {
    const sheet = jest
      .spyOn(ActionSheetIOS, 'showActionSheetWithOptions')
      .mockImplementation(() => {});
    mock.followSources.mockResolvedValue(sources());
    await follow({ kind: 'bill', id: BILL, title: 'Ending Financial Abuse' });
    await follow({ kind: 'electorate', id: GRAYNDLER, title: 'Grayndler' });
    await follow({ kind: 'person', id: ALBANESE, title: 'Anthony Albanese' });
    const r = await render();
    expect(bar().map((i) => i.label)).toEqual(['More', 'Edit']);
    const more = bar()[0] as unknown as {
      menu: { items: { label: string }[] };
    };
    expect(more.menu.items.map((i) => i.label)).toEqual([
      'Mark all as seen',
      menuTitle('Open on opax.com.au'),
    ]);
    expect(has(r, 'follows-unfollow-all')).toBe(false);
    await act(async () => bar().at(-1)!.onPress!());
    expect(bar().map((i) => i.label)).toEqual(['Done']);
    expect(has(r, 'follows-editing')).toBe(true);
    const minus = r.root.find(
      (n) =>
        n.props.testID === `follows-remove-electorate-${GRAYNDLER}` &&
        typeof n.props.onPress === 'function',
    );
    expect(minus.props.accessibilityLabel).toBe('Unfollow Grayndler');
    await act(async () => minus.props.onPress());
    expect((await loadFollows()).map((f) => f.kind)).toEqual([
      'bill',
      'person',
    ]);
    await act(async () => press(r, 'follows-unfollow-all'));
    const [options, answer] = sheet.mock.calls[0]!;
    expect(options).toMatchObject({
      title: 'Unfollow all 2?',
      message: 'Today stops showing their changes.',
      options: ['Unfollow all', 'Cancel'],
      destructiveButtonIndex: 0,
    });
    await act(async () => answer(0));
    expect(await loadFollows()).toEqual([]);
    expect(has(r, 'follows-empty')).toBe(true);
    expect(has(r, 'follows-editing')).toBe(false);
    sheet.mockRestore();
    await act(async () => r.unmount());
  });

  test('?edit=1 opens in Edit mode', async () => {
    mock.followSources.mockResolvedValue(sources());
    mockParams = { edit: '1' };
    await follow({ kind: 'bill', id: BILL, title: 'Ending Financial Abuse' });
    const r = await render();
    expect(has(r, `follows-remove-bill-${BILL}`)).toBe(true);
    expect(bar().map((i) => i.label)).toEqual(['Done']);
    await act(async () => r.unmount());
  });

  test('checks that fail say so once; rows read Not checked yet, never no change', async () => {
    mock.followSources.mockRejectedValue(new Error('broken'));
    await follow({ kind: 'bill', id: BILL, title: 'Ending Financial Abuse' });
    const r = await render();
    const error = r.root.find(
      (n) => n.props.testID === 'follows-check-error' && 'subject' in n.props,
    );
    expect(error.props.message).toBe("Changes couldn't be checked.");
    expect(row(r, `follows-row-bill-${BILL}`).props.detail).toBe(
      'Not checked yet',
    );
    await act(async () => r.unmount());
  });

  // Sweep 1 item 6: a quiet row says the app looked, and when.
  test('a checked follow with nothing new says since when; the list says when it was checked', async () => {
    const checkedAt = new Date();
    checkedAt.setHours(11, 17, 0, 0);
    mock.followSources.mockResolvedValue(
      sources({ savedAt: checkedAt.getTime() }),
    );
    await follow({ kind: 'bill', id: BILL, title: 'Fixture bill' });
    const followed = new Date();
    const r = await render();
    expect(row(r, `follows-row-bill-${BILL}`).props.detail).toBe(
      `Nothing new since ${changeDate(followed.getTime())}`,
    );
    const checked = r.root.find(
      (n) => n.props.testID === 'follows-checked' && n.type === Text,
    );
    expect(checked.props.children).toBe('Checked today, 11:17\u00a0am');
    // A change still shows its change line, not the quiet one.
    mock.followSources.mockResolvedValue(changedSources());
    const control = () =>
      r.root.findByType(ScrollView).props.refreshControl.props;
    await act(async () => control().onRefresh());
    expect(row(r, `follows-row-bill-${BILL}`).props.detail).not.toMatch(
      /^Nothing new/,
    );
    await act(async () => r.unmount());
  });
});

describe('quiet follow lines (sweep 1 item 6)', () => {
  test('since the last change seen, else the day followed', () => {
    const followedAt = new Date(2026, 10, 12, 9).getTime();
    expect(quietText({ followedAt, seenAt: null }, 2026)).toBe(
      'Nothing new since 12 Nov',
    );
    expect(
      quietText(
        { followedAt, seenAt: new Date(2026, 10, 13, 8).getTime() },
        2026,
      ),
    ).toBe('Nothing new since 13 Nov');
    expect(quietText({ followedAt, seenAt: null }, 2027)).toBe(
      'Nothing new since 12 Nov 2026',
    );
  });
  test('the check time reads today, yesterday or the date, with a 12-hour clock', () => {
    const now = new Date(2026, 10, 13, 15, 0);
    expect(checkedText(new Date(2026, 10, 13, 11, 17).getTime(), now)).toBe(
      'Checked today, 11:17\u00a0am',
    );
    expect(checkedText(new Date(2026, 10, 12, 21, 2).getTime(), now)).toBe(
      'Checked yesterday, 9:02\u00a0pm',
    );
    expect(checkedText(new Date(2026, 10, 10, 0, 5).getTime(), now)).toBe(
      'Checked 10 Nov, 12:05\u00a0am',
    );
  });
});

describe('delight follow moments', () => {
  beforeEach(() => {
    mockDisk.clear();
    resetFollowsForTests();
    jest.clearAllMocks();
    mockParams = {};
    mockOptions = {};
    jest.mocked(runtime.followSources).mockResolvedValue(sources());
  });
  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });
  async function mount(element: React.ReactElement) {
    let r!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      r = TestRenderer.create(element);
    });
    return r;
  }
  // The message's reveal measures its content, then animates its own height
  // (src/design/reveal.tsx): LayoutAnimation does nothing on iOS under
  // Reanimated 4.5, so the rows below jumped (build 61, bug 4).
  function layOut(
    r: TestRenderer.ReactTestRenderer,
    testID: string,
    height: number,
  ) {
    const content = r.root.find(
      (n) =>
        n.props.testID === `${testID}-reveal-content` &&
        typeof n.props.onLayout === 'function',
    );
    act(() =>
      content.props.onLayout({
        nativeEvent: { layout: { x: 0, y: 0, width: 320, height } },
      }),
    );
  }
  // Each height animation: its target, and what the reveal draws as it starts.
  function heightAnimations<T>(drawn: () => T) {
    const calls: [number, T][] = [];
    const timing = jest
      .spyOn(Reanimated, 'withTiming')
      .mockImplementation((to) => {
        calls.push([to as number, drawn()]);
        return to;
      });
    return { calls, timing };
  }
  test.each(['ios', 'android'] as const)(
    '%s fresh first follow renders once, holds four seconds, then fades; fourth never renders',
    async (platform) => {
      jest.replaceProperty(Platform, 'OS', platform);
      jest.useFakeTimers();
      const announce = jest.spyOn(
        AccessibilityInfo,
        'announceForAccessibility',
      );
      const timing = jest.spyOn(Animated, 'timing');
      const r = await mount(
        <FollowButton
          kind="party"
          id="fixture-party"
          title="Fixture party"
          testID="moment"
        />,
      );
      const shown = () =>
        r.root
          .findByType(FollowButton)
          .findAllByType(Text)
          .some(
            (text) => text.props.children === 'Changes will show on Today.',
          );
      // At rest nothing is reserved under the button: no hidden sentence.
      expect(shown()).toBe(false);
      expect(
        r.root
          .findByType(FollowButton)
          .findAll((n) => n.type === Text && n.props.variant === 'footnote'),
      ).toHaveLength(0);
      // The line opens its height over 200 ms with the standard ease once it
      // has measured, so the content below eases down instead of jumping.
      const { calls, timing: heights } = heightAnimations(shown);
      await act(async () => r.root.findByType(Button).props.onPress());
      expect(shown()).toBe(true);
      expect(calls).toEqual([]);
      layOut(r, 'moment', 18);
      expect(calls).toEqual([[18, true]]);
      expect(heights.mock.calls[0]![1]).toBe(revealMotion);
      expect(revealMotion.duration).toBe(200);
      expect(r.root.findByType(Button).props).toMatchObject({
        label: 'Following',
        symbol: 'checkmark',
        symbolAnimation: 'bounce',
      });
      expect(
        r.root
          .findAllByType(Text)
          .some((n) => n.props.testID === 'moment-message'),
      ).toBe(true);
      expect(announce).toHaveBeenCalledTimes(1);
      expect(announce).toHaveBeenCalledWith('Changes will show on Today.');
      expect(timing.mock.calls.map(([, config]) => config.duration)).toEqual([
        150, 150,
      ]);
      act(() => jest.advanceTimersByTime(4000));
      expect(
        r.root
          .findAllByType(Text)
          .some((n) => n.props.testID === 'moment-message'),
      ).toBe(true);
      // The line fades, then goes the same way it came: its height closes
      // while it is still drawn, and only then is it removed.
      act(() => jest.advanceTimersByTime(500));
      expect(calls).toEqual([
        [18, true],
        [0, true],
      ]);
      act(() => jest.advanceTimersByTime(revealMotion.duration - 1));
      expect(shown()).toBe(true);
      act(() => jest.advanceTimersByTime(1));
      expect(
        r.root
          .findAllByType(Text)
          .some((n) => n.props.testID === 'moment-message'),
      ).toBe(false);
      expect(shown()).toBe(false);
      // Nothing is left reserved under the button.
      expect(
        r.root.findAll((n) => n.props.testID === 'moment-reveal-content'),
      ).toHaveLength(0);
      act(() => r.unmount());
      for (const id of ['fixture-two', 'fixture-three'])
        await follow({ kind: 'party', id, title: id });
      // Restart memory only: the counter remains in the on-device two-slot file.
      resetFollowsForTests();
      const fourth = await mount(
        <FollowButton kind="party" id="fixture-four" title="Fixture Four" />,
      );
      await act(async () => fourth.root.findByType(Button).props.onPress());
      expect(fourth.root.findByType(Button).props.label).toBe('Following');
      expect(
        fourth.root
          .findAllByType(Text)
          .some((n) => n.props.testID === 'follow-message'),
      ).toBe(false);
      expect(announce).toHaveBeenCalledTimes(1);
      act(() => fourth.unmount());
    },
  );
  test('Reduce Motion uses zero-duration opacity, no layout animation and a four-second hold', async () => {
    jest.useFakeTimers();
    jest.spyOn(accessibility, 'useReduceMotion').mockReturnValue(true);
    const timing = jest.spyOn(Animated, 'timing');
    const { calls } = heightAnimations(() => true);
    const r = await mount(
      <FollowButton kind="party" id="fixture-party" title="Fixture party" />,
    );
    await act(async () => r.root.findByType(Button).props.onPress());
    layOut(r, 'follow', 18);
    expect(timing.mock.calls.map(([, config]) => config.duration)).toEqual([
      0, 0,
    ]);
    // The line takes its height in one step: no height animation at all.
    expect(calls).toEqual([]);
    act(() => jest.advanceTimersByTime(3999));
    expect(
      r.root
        .findAllByType(Text)
        .some((n) => n.props.testID === 'follow-message'),
    ).toBe(true);
    act(() => jest.advanceTimersByTime(100));
    expect(
      r.root
        .findAllByType(Text)
        .some((n) => n.props.testID === 'follow-message'),
    ).toBe(false);
    expect(calls).toEqual([]);
    act(() => r.unmount());
  });
  test.each(['ios', 'android'] as const)(
    '%s limit and save-error messages arrive and go with the same height animation',
    async (platform) => {
      jest.replaceProperty(Platform, 'OS', platform);
      for (let i = 1; i <= FOLLOW_LIMIT; i++)
        await follow({ kind: 'bill', id: `au-federal-r${i}`, title: `B${i}` });
      const r = await mount(
        <FollowButton kind="party" id="fixture-party" title="Fixture party" />,
      );
      const button = () => r.root.findAllByType(Button)[0]!;
      const message = () =>
        r.root
          .findAllByType(Text)
          .find((n) => n.props.testID === 'follow-message');
      const editFollowing = () =>
        r.root.findAll((n) => n.props.testID === 'follow-edit-following')
          .length > 0;
      const { calls, timing } = heightAnimations(() => [
        !!message(),
        editFollowing(),
      ]);
      expect(message()).toBeUndefined();
      await act(async () => button().props.onPress());
      expect(message()!.props.children).toBe(
        `You can follow up to ${FOLLOW_LIMIT}. Unfollow one to add this.`,
      );
      expect(editFollowing()).toBe(true);
      // The message and its Edit Following button sit in one reveal and
      // open in one animated change.
      const reveal = r.root.find(
        (n) => n.props.testID === 'follow-reveal-content',
      );
      expect(
        reveal.findAll((n) => n.props.testID === 'follow-edit-following')
          .length,
      ).toBeGreaterThan(0);
      layOut(r, 'follow', 60);
      expect(calls).toEqual([[60, [true, true]]]);
      // A save error replaces it: the limit message closes (animated, still
      // drawn as it goes), then the error opens (animated).
      await clearFollows();
      mockChanges = 0;
      mockFailAt = 1;
      try {
        await act(async () => button().props.onPress());
      } finally {
        mockFailAt = 0;
      }
      expect(String(message()!.props.children)).toMatch(/could not be saved/);
      expect(editFollowing()).toBe(false);
      layOut(r, 'follow', 24);
      expect(calls).toEqual([
        [60, [true, true]],
        [0, [true, true]],
        [60, [true, false]],
        [24, [true, false]],
      ]);
      for (const [, config] of timing.mock.calls)
        expect(config).toBe(revealMotion);
      act(() => r.unmount());
    },
  );
  test('clearing and duplicate follows never reset or spend the counter', async () => {
    const item = {
      kind: 'party' as const,
      id: 'fixture-party',
      title: 'Fixture party',
    };
    expect(await followWithFeedback(item)).toEqual({
      status: 'followed',
      showMessage: true,
    });
    expect(await followWithFeedback(item)).toEqual({
      status: 'already',
      showMessage: false,
    });
    await clearFollows();
    expect((await followWithFeedback(item)).showMessage).toBe(true);
    await clearFollows();
    expect((await followWithFeedback(item)).showMessage).toBe(true);
    await clearFollows();
    resetFollowsForTests();
    expect((await followWithFeedback(item)).showMessage).toBe(false);
  });
  test.each(['ios', 'android'] as const)(
    '%s empty Following with no seat centres and opens the chooser',
    async (platform) => {
      jest.replaceProperty(Platform, 'OS', platform);
      jest.spyOn(myMember, 'useSavedMember').mockReturnValue(null);
      const r = await mount(<Following />);
      expect(r.root.findByType(Screen).props.centred).toBe(true);
      const action = r.root
        .findAllByType(Button)
        .find((n) => n.props.testID === 'follows-empty-action')!;
      expect(action.props.label).toBe('Find your MP');
      act(() => action.props.onPress());
      expect(router.push).toHaveBeenCalledWith('/seat');
      act(() => r.unmount());
    },
  );
  test.each(['ios', 'android'] as const)(
    '%s saved member follows in place and the row replaces the empty state',
    async (platform) => {
      jest.replaceProperty(Platform, 'OS', platform);
      jest.spyOn(myMember, 'useSavedMember').mockReturnValue({
        canonicalPersonId: ALBANESE,
        slug: 'fixture-member',
        name: 'Casey Example',
      } as never);
      const r = await mount(<Following />);
      const action = r.root
        .findAllByType(Button)
        .find((n) => n.props.testID === 'follows-empty-action')!;
      expect(action.props.label).toBe('Follow Casey Example');
      await act(async () => action.props.onPress());
      expect(
        r.root.findAll((n) => n.props.testID === 'follows-empty'),
      ).toHaveLength(0);
      expect(
        r.root.findAll(
          (n) => n.props.testID === `follows-row-person-${ALBANESE}`,
        ).length,
      ).toBeGreaterThan(0);
      expect(r.root.findByType(Screen).props.centred).toBe(false);
      act(() => r.unmount());
    },
  );
});
