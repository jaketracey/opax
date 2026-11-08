import { act, type ReactNode } from 'react';
import { Animated } from 'react-native';
import TestRenderer, { type ReactTestInstance } from 'react-test-renderer';
import type { Change } from '../src/features/follows/changes';
import { FollowRow } from '../src/features/follows/FollowRow';
import { FollowingSection } from '../src/features/follows/FollowingSection';
import type { FollowState } from '../src/features/follows/markers';
import { followKey, type Follow } from '../src/features/follows/store';
import { useFollowStates } from '../src/features/follows/useFollowStates';
import {
  FOLLOWING_ROWS,
  FollowingBlock,
  changedFollows,
} from '../src/features/today/FollowingBlock';
import { followsRoute } from '../src/navigation/routes';

jest.mock('../src/features/follows/useFollowStates', () => ({
  useFollowStates: jest.fn(),
}));
jest.mock('../src/features/your-mp/useSeat', () => ({
  useSeat: () => ({ status: 'none' }),
  savedSeatDirectory: () => null,
}));
jest.mock('../src/api/runtime', () => ({
  portraits: { get: jest.fn(async () => null) },
  catalogs: {},
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
    router: { push: jest.fn(), navigate: jest.fn() },
    useSegments: () => [],
  };
});

const follow = (kind: Follow['kind'], id: string, title: string): Follow =>
  ({
    kind,
    id,
    title,
    followedAt: Date.parse('2026-10-01T00:00:00Z'),
    seen: {},
    seenAt: Date.parse('2026-10-01T00:00:00Z'),
  }) as Follow;
const change = (text: string, asAt: string): Change => ({
  marker: `m-${text}`,
  text,
  citation: 'ParlInfo bill records',
  asAt,
  key: `k-${text}`,
});
const ready = (title: string, changes: Change[]): FollowState => ({
  status: 'ready',
  title,
  current: {},
  keys: [],
  changes,
});
const bill = follow('bill', 'au-federal-r7549', 'Ending Financial Abuse');
const person = follow('person', 'person_2b850aa643795ce8902f754b', 'Albanese');
const party = follow('party', 'alp', 'Labor');
type Hook = ReturnType<typeof useFollowStates>;
const hook = (over: Partial<Hook>): Hook =>
  ({
    follows: [bill, person, party],
    states: new Map(),
    sources: { stale: false },
    savedResult: null,
    resultLoading: false,
    changeSetKey: '[]',
    ...over,
  }) as Hook;

const mounted: TestRenderer.ReactTestRenderer[] = [];
function render(value: Hook, attempt = 0) {
  jest.mocked(useFollowStates).mockReturnValue(value);
  let r!: TestRenderer.ReactTestRenderer;
  act(() => {
    r = TestRenderer.create(
      <FollowingBlock attempt={attempt} onRetry={() => {}} />,
    );
  });
  mounted.push(r);
  return r;
}
afterEach(() => {
  act(() => mounted.splice(0).forEach((r) => r.unmount()));
});
const host = (root: ReactTestInstance, testID: string) =>
  root.findAll(
    (node) => typeof node.type === 'string' && node.props.testID === testID,
  );
const strings = (node: ReactTestInstance) =>
  node
    .findAll((n) => n.type === 'Text')
    .flatMap((n) => ([] as unknown[]).concat(n.props.children))
    .filter((c): c is string => typeof c === 'string')
    .join(' ');

describe('changed follows', () => {
  test('only those with a change Today shows, newest change first, then by name', () => {
    const states = new Map<string, FollowState>([
      [
        followKey(bill),
        ready('Ending Financial Abuse', [change('Passed', '2026-10-01')]),
      ],
      [
        followKey(person),
        ready('Anthony Albanese', [change('Voted', '2026-10-05')]),
      ],
      [followKey(party), ready('Labor', [])],
    ]);
    expect(changedFollows([bill, person, party], states)).toEqual([
      person,
      bill,
    ]);
  });
  test('never the reader’s own MP, and expenses-only changes do not count', () => {
    const states = new Map<string, FollowState>([
      [
        followKey(person),
        ready('Anthony Albanese', [change('Voted', '2026-10-05')]),
      ],
      [
        followKey(bill),
        ready('Ending Financial Abuse', [
          { ...change('Expenses', '2026-10-02'), today: false },
        ]),
      ],
    ]);
    expect(
      changedFollows([bill, person], states, new Set([person.id])),
    ).toEqual([]);
  });
});

describe('Following on Today', () => {
  test('nothing followed: no block at all', () => {
    const r = render(hook({ follows: [] }));
    expect(r.toJSON()).toBeNull();
  });
  test('nothing changed: one collapsed row with the bell and the count, to Following', () => {
    const r = render(hook({}));
    const row = host(r.root, 'today-following-collapsed');
    expect(row.length).toBeGreaterThan(0);
    expect(strings(r.root)).toContain('Following');
    expect(strings(r.root)).toContain('3');
    expect(
      r.root.findAll(
        (n) =>
          n.props.testID === 'today-following-collapsed' &&
          n.props.symbol === 'bell',
      ).length,
    ).toBeGreaterThan(0);
    expect(
      r.root.findAll(
        (n) =>
          n.props.testID === 'today-following-collapsed' &&
          n.props.href === followsRoute,
      ).length,
    ).toBeGreaterThan(0);
    expect(strings(r.root)).not.toMatch(/Manage|since you last looked/);
  });
  test('changes: a Following header with See all, then the changed follows as rows', () => {
    const states = new Map<string, FollowState>([
      [
        followKey(bill),
        ready('Ending Financial Abuse', [change('Passed', '2026-10-01')]),
      ],
    ]);
    const r = render(hook({ states, changeSetKey: 'one' }));
    expect(host(r.root, 'today-following-collapsed')).toHaveLength(0);
    expect(host(r.root, 'today-following-all').length).toBeGreaterThan(0);
    const rows = r.root.findAllByType(FollowRow);
    expect(rows.map((row) => row.props.follow)).toEqual([bill]);
    expect(rows[0]!.props.surface).toBe('today');
    expect(rows[0]!.props.testID).toBe(`today-following-bill-${bill.id}`);
  });
  test('at most five rows', () => {
    const many = Array.from({ length: 8 }, (_, i) =>
      follow('bill', `au-federal-r${i}`, `Bill ${i}`),
    );
    const states = new Map<string, FollowState>(
      many.map((f, i) => [
        followKey(f),
        ready(f.title, [change(`c${i}`, `2026-10-0${i + 1}`)]),
      ]),
    );
    const r = render(hook({ follows: many, states }));
    expect(r.root.findAllByType(FollowRow)).toHaveLength(FOLLOWING_ROWS);
  });
  test('until the check answers, the stored result is drawn', () => {
    const r = render(
      hook({
        sources: null,
        savedResult: {
          states: [
            [
              followKey(bill),
              ready('Ending Financial Abuse', [change('Passed', '2026-10-01')]),
            ],
          ],
        } as unknown as Hook['savedResult'],
      }),
    );
    expect(r.root.findAllByType(FollowRow)).toHaveLength(1);
  });
  test('first-ever launch: the collapsed row until the first check', () => {
    const r = render(hook({ sources: null, savedResult: null }));
    expect(host(r.root, 'today-following-collapsed').length).toBeGreaterThan(0);
  });
  test('the same set redraws without a fade; a different set crossfades once', () => {
    const timing = jest.spyOn(Animated, 'timing');
    const states = new Map<string, FollowState>([
      [
        followKey(bill),
        ready('Ending Financial Abuse', [change('Passed', '2026-10-01')]),
      ],
    ]);
    const r = render(hook({ states, changeSetKey: 'a' }));
    jest
      .mocked(useFollowStates)
      .mockReturnValue(hook({ states, changeSetKey: 'a' }));
    act(() => r.update(<FollowingBlock attempt={1} onRetry={() => {}} />));
    expect(timing).not.toHaveBeenCalled();
    jest
      .mocked(useFollowStates)
      .mockReturnValue(hook({ states, changeSetKey: 'b' }));
    act(() => r.update(<FollowingBlock attempt={2} onRetry={() => {}} />));
    expect(timing).toHaveBeenCalledTimes(1);
    timing.mockRestore();
  });
  test('a failed check says so once, with Try again', () => {
    const states = new Map<string, FollowState>([
      [followKey(bill), { status: 'unavailable' }],
    ]);
    const r = render(
      hook({
        states,
        sources: { error: new Error('Offline') } as Hook['sources'],
      }),
    );
    expect(host(r.root, 'today-following-error').length).toBeGreaterThan(0);
    expect(strings(r.root)).toContain("Changes couldn't be checked.");
  });
  test('FollowingSection is Today’s block under its old name', () => {
    jest.mocked(useFollowStates).mockReturnValue(hook({}));
    let r!: TestRenderer.ReactTestRenderer;
    act(() => {
      r = TestRenderer.create(
        <FollowingSection refresh={0} refreshing={false} onRetry={() => {}} />,
      );
    });
    mounted.push(r);
    expect(r.root.findAllByType(FollowingBlock)).toHaveLength(1);
  });
});
