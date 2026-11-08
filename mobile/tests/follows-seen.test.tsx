import { act, createRef, useRef } from 'react';
import TestRenderer from 'react-test-renderer';
import { Icon } from '../src/design/icon';
import { rhythm } from '../src/design/tokens';
import { View, StyleSheet } from 'react-native';
import {
  useSeenOnView,
  type SeenView,
} from '../src/features/follows/useSeenOnView';
import { AddedSinceGroup } from '../src/features/follows/AddedSinceGroup';
import { FollowRow, followRoute } from '../src/features/follows/FollowRow';
import { NewDot } from '../src/features/follows/NewDot';
import {
  LatestRows,
  latestRecord,
  latestRecords,
} from '../src/features/your-mp/LatestRows';
import {
  follow,
  followKey,
  loadFollows,
  markSeen,
  resetFollowsForTests,
  type Follow,
} from '../src/features/follows/store';
import {
  changeAccessibilityLabel,
  changesFor,
  seenKeysForChanges,
  type Change,
  type FollowRecord,
} from '../src/features/follows/changes';
import { NavigationContext } from 'expo-router/react-navigation';
import { router } from 'expo-router';
import { profileFor, personId } from '../src/api/catalogs';
import { catalogs as pinned } from './pinned';
import { Text } from '../src/design/text';
const mockDisk = new Map<string, string>();
jest.mock('expo-file-system', () => ({
  Paths: { document: 'documents' },
  File: class {
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
  },
}));
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
  return { router: { push: jest.fn() }, Link };
});
let renderer: TestRenderer.ReactTestRenderer | null = null;
let y = 50;
const keys = ['visible-only'];
const seen = jest.fn();
function Probe() {
  const ref = useRef<SeenView>({
    measureInWindow: (callback) => callback(0, y, 300, 100),
  });
  useSeenOnView(ref, keys, seen);
  return null;
}
const f: Follow = {
  kind: 'bill',
  id: 'au-federal-r7549',
  title: 'Housing Bill',
  followedAt: new Date('2026-09-01T12:00:00').getTime(),
  seenAt: new Date('2026-09-01T12:00:00').getTime(),
  seen: {},
  seenKeys: [],
};
const record: FollowRecord = {
  key: 'vote:late',
  kind: 'vote',
  title: 'Housing Bill',
  date: '2026-08-19',
  stage: 'Second reading',
  position: 'for',
  billKey: f.id,
  divisionKey: 'late',
};
const change: Change = {
  marker: 'divisions',
  text: 'Voted for a bill',
  asAt: record.date,
  key: record.key,
  record,
  citation: 'Parliament',
};
beforeEach(() => {
  jest.useFakeTimers();
  jest
    .spyOn(View.prototype, 'measureInWindow')
    .mockImplementation((callback) => callback(0, 50, 300, 100));
  seen.mockClear();
  mockDisk.clear();
  resetFollowsForTests();
  y = 50;
});
afterEach(() => {
  act(() => renderer?.unmount());
  renderer = null;
  jest.restoreAllMocks();
  jest.useRealTimers();
});
function mount(element: React.ReactElement = <Probe />) {
  act(() => {
    renderer = TestRenderer.create(element);
  });
}
function advance(ms: number) {
  act(() => jest.advanceTimersByTime(ms));
}

test('mount never marks, one full second with the top edge visible marks exactly once', () => {
  mount();
  expect(seen).not.toHaveBeenCalled();
  advance(999);
  expect(seen).not.toHaveBeenCalled();
  advance(1);
  expect(seen).toHaveBeenCalledWith(keys);
  advance(2000);
  expect(seen).toHaveBeenCalledTimes(1);
});
test('leaving after brief visibility marks only the shown keys', () => {
  mount();
  advance(100);
  act(() => renderer!.unmount());
  renderer = null;
  expect(seen).toHaveBeenCalledTimes(1);
  expect(seen).toHaveBeenCalledWith(['visible-only']);
});
test('rendering off screen and leaving never marks', () => {
  y = 10000;
  mount();
  advance(5000);
  act(() => renderer!.unmount());
  renderer = null;
  expect(seen).not.toHaveBeenCalled();
});
test('a top above the viewport is not visible, scrolling it in starts the one second clock', () => {
  y = -10;
  mount();
  advance(1000);
  expect(seen).not.toHaveBeenCalled();
  y = 50;
  advance(100);
  advance(999);
  expect(seen).not.toHaveBeenCalled();
  advance(1);
  expect(seen).toHaveBeenCalledTimes(1);
});
test('blur after visibility marks even when a native stack keeps the screen mounted', () => {
  const handlers = new Map<string, () => void>();
  const navigation = {
    isFocused: () => true,
    addListener: (event: string, callback: () => void) => {
      handlers.set(event, callback);
      return () => handlers.delete(event);
    },
  };
  mount(
    <NavigationContext.Provider value={navigation as never}>
      <Probe />
    </NavigationContext.Provider>,
  );
  advance(100);
  act(() => handlers.get('blur')!());
  expect(seen).toHaveBeenCalledTimes(1);
});
test('the page group carries the last-look header, own record date, Saved reading and marks only after visibility', async () => {
  await follow(f);
  await markSeen(followKey(f), {}, []);
  const ref = createRef<View>();
  await act(async () => {
    renderer = TestRenderer.create(
      <AddedSinceGroup
        follow={f}
        changes={[change]}
        testID="bill-added-since"
        current={{
          divisions: { value: 1, asAt: record.date, records: [record] },
        }}
        stale
        savedAt={f.seenAt}
      />,
      {
        createNodeMock: () => ({
          measureInWindow: (
            callback: (
              x: number,
              y: number,
              width: number,
              height: number,
            ) => void,
          ) => callback(0, 50, 300, 100),
        }),
      },
    );
  });
  expect(ref.current).toBeNull();
  const strings = renderer!.root
    .findAllByType(Text)
    .map((node) => node.props.children)
    .filter((text) => typeof text === 'string');
  expect(strings).toContain('Added since 1 Sep');
  expect(strings).toContain('Second reading · 19 Aug 2026');
  expect(
    renderer!.root.findAll(
      (node) => node.props.testID === 'bill-added-since-saved',
    ).length,
  ).toBeGreaterThan(0);
  expect((await loadFollows())[0]!.seenKeys).toEqual([]);
  await act(async () => {
    jest.advanceTimersByTime(1000);
  });
  expect((await loadFollows())[0]!.seenKeys).toEqual(['vote:late']);
});
test('empty or unavailable groups render nothing and mark nothing', () => {
  mount(
    <AddedSinceGroup
      follow={f}
      changes={[change]}
      unavailable
      testID="no-group"
    />,
  );
  expect(renderer!.toJSON()).toBeNull();
  advance(2000);
  act(() =>
    renderer!.update(
      <AddedSinceGroup follow={f} changes={[]} testID="empty" />,
    ),
  );
  expect(
    renderer!.root.findAll((node) => node.props.testID === 'no-group'),
  ).toHaveLength(0);
});
test('FollowRow route maps every kind, changes arrive at section=changes, menus expose Unfollow and taps do not mark', async () => {
  for (const [kind, path] of [
    ['person', '/person/[slug]'],
    ['party', '/party/[slug]'],
    ['bill', '/bill/[key]'],
    ['electorate', '/electorate/[id]'],
  ] as const)
    expect(followRoute({ kind, id: 'labor', changes: [change] })).toMatchObject(
      { pathname: path, params: { section: 'changes' } },
    );
  await follow(f);
  await markSeen(followKey(f), {}, []);
  mount(
    <FollowRow
      follow={f}
      state={{
        status: 'ready',
        title: f.title,
        current: {},
        keys: ['vote:late'],
        changes: [change],
      }}
    />,
  );
  expect(
    renderer!.root.findAll((node) =>
      node.props.accessibilityActions?.some(
        (action: { name: string }) => action.name === 'Unfollow',
      ),
    ).length,
  ).toBeGreaterThan(0);
  const row = renderer!.root.findAll(
    (node) =>
      node.props.testID === `follows-row-${f.kind}-${f.id}` &&
      node.props.accessibilityRole === 'link',
  )[0]!;
  act(() => row.props.onPress?.());
  expect((await loadFollows())[0]!.seenKeys).toEqual([]);
  expect(
    changeAccessibilityLabel({
      marker: 'party',
      text: 'Now Independent; was Labor',
      citation: 'Roster',
      asAt: null,
      dateNotPublished: true,
    }),
  ).toMatch(/date not published$/);
});
test('NewDot has New label; latest rows share the dated, clamped and routed anatomy', () => {
  const latest = latestRecord(record)!;
  expect(latest.href).toMatchObject({ params: { division: 'late' } });
  mount(
    <>
      <NewDot />
      <LatestRows records={[latest]} limit={3} />
    </>,
  );
  expect(
    renderer!.root.findAll((node) => node.props?.accessibilityLabel === 'New')
      .length,
  ).toBeGreaterThan(0);
  expect(
    latestRecord({
      ...record,
      billKey: undefined,
      url: 'https://theyvoteforyou.org.au/divisions/1',
    })?.href,
  ).toBeUndefined();
  expect(router.push).not.toHaveBeenCalled();
});
test('LatestRows composition excludes statements, procedural and unknown votes, and uses deterministic limits', () => {
  const profile = profileFor(
    personId('person_2b850aa643795ce8902f754b'),
    pinned,
  );
  const latest = latestRecords(profile, pinned.bills, 3);
  expect(latest).toHaveLength(3);
  expect(latest.every((r) => r.date && r.kind !== 'speech')).toBe(true);
  expect(
    latest.every(
      (r) =>
        r.kind !== 'vote' ||
        ['bill-stage', 'amendment'].includes(
          r.question_type ??
            (r.stage?.toLowerCase().includes('amendment')
              ? 'amendment'
              : 'bill-stage'),
        ),
    ),
  ).toBe(true);
});

test('the own-member card acknowledges only its displayed identities, plus party and seat', async () => {
  const person = {
    kind: 'person' as const,
    id: 'person_2b850aa643795ce8902f754b',
    title: 'Anthony Albanese',
  };
  await follow(person);
  await markSeen(followKey(person), {}, []);
  function Card() {
    const ref = useRef<SeenView>({
      measureInWindow: (callback) => callback(0, 50, 300, 100),
    });
    useSeenOnView(ref, ['shown-vote'], (keys) => {
      void markSeen(
        followKey(person),
        {
          party: { value: 'Labor', asAt: '2026-09-01' },
          seat: { value: 'Grayndler', asAt: '2026-09-01' },
        },
        keys,
      );
    });
    return null;
  }
  mount(<Card />);
  await act(async () => {
    jest.advanceTimersByTime(1000);
  });
  const saved = (await loadFollows())[0]!;
  expect(saved.seenKeys).toEqual(['shown-vote']);
  expect(saved.seenKeys).not.toContain('profile-only-vote');
  expect(Object.keys(saved.seen!)).toEqual(['party', 'seat']);
});

test('viewing a division acknowledges its hidden stage when the latest division later moves on', async () => {
  const stage: FollowRecord = {
    key: 'stage:second-reading',
    kind: 'stage',
    date: '2026-08-19',
    title: 'Second reading',
    stage: 'Second reading',
    chamber: 'Senate',
    billKey: f.id,
  };
  const division: FollowRecord = {
    ...stage,
    key: 'division:second-reading',
    kind: 'division',
    divisionKey: 'second-reading',
    outcome: 'agreed to',
  };
  const before = {
    moved: { value: 'old', asAt: null, records: [] },
    divisions: { value: 0, asAt: null, records: [] },
  };
  const current = {
    moved: { value: stage.date, asAt: stage.date, records: [stage] },
    divisions: { value: 1, asAt: division.date, records: [division] },
  };
  await follow(f);
  await markSeen(followKey(f), before, ['division:later']);
  const saved = (await loadFollows())[0]!;
  const changes = changesFor(saved, current);
  expect(changes).toHaveLength(1);
  expect(changes[0]!.coveredKeys).toEqual([stage.key]);
  expect(seenKeysForChanges(changes)).toEqual([division.key, stage.key]);
  await act(async () => {
    renderer = TestRenderer.create(
      <AddedSinceGroup
        follow={saved}
        changes={changes}
        testID="bill-added-since"
        current={current}
      />,
    );
  });
  await act(async () => {
    jest.advanceTimersByTime(1000);
  });
  const acknowledged = (await loadFollows())[0]!;
  expect(acknowledged.seenKeys).toEqual([
    division.key,
    stage.key,
    'division:later',
  ]);
  const next = {
    ...current,
    divisions: {
      value: 2,
      asAt: '2026-08-20',
      records: [
        {
          ...division,
          key: 'division:later',
          date: '2026-08-20',
          stage: 'Third reading',
        },
      ],
    },
  };
  expect(changesFor(acknowledged, next)).toEqual([]);
});

test('follow row speech uses the visible date rule and a separate remainder sentence', () => {
  jest.setSystemTime(new Date('2026-11-09T12:00:00'));
  const person = {
    ...f,
    kind: 'person' as const,
    id: 'person_2b850aa643795ce8902f754b',
    title: 'Anthony Albanese',
  };
  const changes = [
    change,
    ...Array.from({ length: 3 }, (_, i) => ({
      ...change,
      key: `older-${i}`,
      asAt: '2026-08-18',
    })),
  ];
  mount(
    <FollowRow
      follow={person}
      state={{
        status: 'ready',
        title: person.title,
        current: {},
        keys: [],
        changes,
      }}
    />,
  );
  expect(
    renderer!.root
      .findByType(FollowRow)
      .findAll(
        (node) =>
          node.props?.accessibilityLabel ===
          'Anthony Albanese, person. Changed: Voted for a bill, 19 August. And 3 more.',
      ).length,
  ).toBeGreaterThan(0);
  expect(changeAccessibilityLabel({ ...change, asAt: '2025-08-19' })).toBe(
    'Voted for a bill, 19 August 2025',
  );
  expect(
    renderer!.root.findAll((node) => node.props?.detail?.endsWith('and 3 more'))
      .length,
  ).toBeGreaterThan(0);
});

test('LatestRow keeps its year and caps both glyphs with the standard row gaps', () => {
  jest.setSystemTime(new Date('2026-11-09T12:00:00'));
  mount(<LatestRows records={[latestRecord(record)!]} />);
  const icons = renderer!.root.findAllByType(Icon);
  expect(icons).toHaveLength(2);
  expect(icons.map((icon) => icon.props.maxScale)).toEqual([1.5, 1.5]);
  const label = 'Voted for. Housing Bill. Second reading, 19 August 2026.';
  const row = renderer!.root.findAll(
    (node) =>
      node.props?.accessibilityLabel === label &&
      node.props?.accessibilityRole === 'link',
  )[0]!;
  const style = StyleSheet.flatten(
    typeof row.props.style === 'function'
      ? row.props.style({ pressed: false })
      : row.props.style,
  );
  expect(style.gap).toBe(rhythm.tight);
  const words = renderer!.root
    .findAllByType(View)
    .find((node) => StyleSheet.flatten(node.props.style)?.flex === 1)!;
  expect(StyleSheet.flatten(words.props.style)?.gap).toBe(rhythm.line);
});
