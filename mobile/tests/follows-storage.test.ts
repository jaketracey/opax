import { act, createElement } from 'react';
import TestRenderer from 'react-test-renderer';
import { currentKeys } from '../src/features/follows/changes';
import {
  followState,
  type FollowSources,
} from '../src/features/follows/markers';
import { useFollowStates } from '../src/features/follows/useFollowStates';
import * as legacy from './fixtures/follows-1.0/store';
import {
  followResultKey,
  loadFollowResult,
  saveFollowResult,
  clearFollows,
  decodeFollows,
  follow,
  followKey,
  loadFollows,
  markAllSeen,
  markSeen,
  resetFollowsForTests,
} from '../src/features/follows/store';
import { catalogs as runtime } from '../src/api/runtime';
import { catalogs, index } from './pinned';
const mockDisk = new Map<string, string>();
let mockFail = false;
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
      if (mockFail) {
        mockDisk.set(this.name, body.slice(0, 10));
        throw new Error('interrupted');
      }
      mockDisk.set(this.name, body);
    }
  },
}));
jest.mock('../src/api/runtime', () => ({
  catalogs: { followSources: jest.fn() },
}));
const bill = { kind: 'bill' as const, id: 'au-federal-r7549', title: 'A bill' };
const row = { ...bill, followedAt: 1, seen: null, seenAt: null };
const topicBytes =
  ' {"version":1,"follows":[{"kind":"topic","id":"housing","extra":{"untouched":true}}],"generation":4}\n';
beforeEach(() => {
  mockDisk.clear();
  mockFail = false;
  resetFollowsForTests();
  legacy.resetFollowsForTests();
});

test('a frozen 1.0 reader reads and re-saves its directory without touching topic bytes', async () => {
  mockDisk.set(
    'opax-follows-v1.json',
    JSON.stringify({ version: 1, follows: [row] }),
  );
  mockDisk.set('opax-follows-topics-v1.json', topicBytes);
  expect(await legacy.loadFollows()).toEqual([row]);
  await legacy.markSeen(followKey(bill), {
    status: { value: 'passed', asAt: '2026-09-01' },
  });
  expect(mockDisk.get('opax-follows-topics-v1.json')).toBe(topicBytes);
  resetFollowsForTests();
  expect(await loadFollows()).toHaveLength(1);
  await markSeen(followKey(bill), {}, []);
  expect(mockDisk.get('opax-follows-topics-v1.json')).toBe(topicBytes);
});
test('a 1.0 directory with every supported kind reads and re-saves the same follows', async () => {
  const follows = [
    row,
    { ...row, kind: 'party', id: 'labor', title: 'Labor' },
    {
      ...row,
      kind: 'person',
      id: 'person_2b850aa643795ce8902f754b',
      title: 'Anthony Albanese',
    },
    {
      ...row,
      kind: 'electorate',
      id: 'el_5d600e7f6dca5b72ae04d686',
      title: 'Grayndler',
    },
  ];
  mockDisk.set('opax-follows-v1.json', JSON.stringify({ version: 1, follows }));
  expect(await loadFollows()).toEqual(follows);
  // A no-op re-save leaves legacy bytes, keys and generation untouched.
  const bytes = mockDisk.get('opax-follows-v1.json');
  await follow(bill);
  expect(mockDisk.get('opax-follows-v1.json')).toBe(bytes);
});
test('unknown kinds round-trip opaquely in the primary and topic files', async () => {
  const unknown = {
    kind: 'future-kind',
    id: 'abc',
    nested: [1, { a: true }],
    seenKeys: ['keep'],
    future: null,
  };
  expect(decodeFollows({ version: 1, follows: [unknown] })).toEqual([unknown]);
  mockDisk.set(
    'opax-follows-v1.json',
    JSON.stringify({ version: 1, follows: [unknown] }),
  );
  mockDisk.set('opax-follows-topics-v1.json', topicBytes);
  await follow(bill);
  const last = JSON.parse(mockDisk.get('opax-follows-v1.b.json')!);
  expect(last.follows).toContainEqual(unknown);
  expect(mockDisk.get('opax-follows-topics-v1.json')).toBe(topicBytes);
  await clearFollows();
  expect(JSON.parse(mockDisk.get('opax-follows-v1.json')!).follows).toEqual([
    unknown,
  ]);
});
test('the 50 cap counts both files, including opaque entries', async () => {
  mockDisk.set(
    'opax-follows-v1.json',
    JSON.stringify({
      version: 1,
      follows: Array.from({ length: 49 }, (_, i) => ({
        ...row,
        id: `au-federal-r${i + 1}`,
      })),
    }),
  );
  mockDisk.set('opax-follows-topics-v1.json', topicBytes);
  expect(await follow(bill)).toBe('limit');
  expect(mockDisk.get('opax-follows-topics-v1.json')).toBe(topicBytes);
});
test('seen keys are distinct, capped at 50, retain a disappeared identity and mark only shown keys', async () => {
  await follow(bill);
  await markSeen(followKey(bill), {}, ['old']);
  await markSeen(followKey(bill), {}, []);
  expect((await loadFollows())[0]!.seenKeys).toEqual(['old']);
  await markSeen(followKey(bill), {}, ['shown']);
  expect((await loadFollows())[0]!.seenKeys).toEqual(['shown', 'old']);
  await markSeen(
    followKey(bill),
    {},
    Array.from({ length: 60 }, (_, i) => String(i)),
  );
  expect((await loadFollows())[0]!.seenKeys).toEqual(
    Array.from({ length: 50 }, (_, i) => String(i)),
  );
  resetFollowsForTests();
  expect((await loadFollows())[0]!.seenKeys).toHaveLength(50);
});
test('partial reads preserve status markers and an interrupted save preserves the last complete follow', async () => {
  await follow(bill);
  await markSeen(followKey(bill), { status: { value: 'before', asAt: null } }, [
    'old',
  ]);
  await markSeen(followKey(bill), { moved: { value: 'stage', asAt: null } }, [
    'stage',
  ]);
  const saved = (await loadFollows())[0]!;
  expect(saved.seen?.status?.value).toBe('before');
  mockFail = true;
  await expect(markSeen(followKey(bill), {}, ['new'])).rejects.toThrow(
    'interrupted',
  );
  expect((await loadFollows())[0]).toEqual(saved);
  resetFollowsForTests();
  expect((await loadFollows())[0]).toEqual(saved);
});
test('mark all takes every ready follow current values and keys, and skips unavailable sources', async () => {
  await follow(bill);
  await follow({
    kind: 'electorate',
    id: 'el_5d600e7f6dca5b72ae04d686',
    title: 'Grayndler',
  });
  jest.mocked(runtime.followSources).mockResolvedValue({
    manifest: catalogs.manifest,
    people: catalogs.people,
    roster: catalogs.roster,
    slugs: catalogs.slugs,
    electorates: null,
    bills: catalogs.bills!,
    votes: null,
    interestIndex: null,
    pay: null,
    expenses: null,
    money: null,
    stale: true,
    savedAt: 1,
    error: null,
  });
  await markAllSeen();
  const [ready, unavailable] = await loadFollows();
  expect(ready?.seen?.status).toBeDefined();
  expect(ready?.seenKeys).toEqual([]);
  expect(unavailable?.seen).toBeNull();
  expect(unavailable?.seenKeys).toBeUndefined();
  expect(index.electorates.length).toBeGreaterThan(0);
});

test('stored Today result restores its shape, and a repeated set keeps the same layout key', async () => {
  expect(await loadFollowResult()).toBeNull();
  const result = {
    version: 1 as const,
    shape: 'expanded' as const,
    checkedAt: 100,
    states: [
      [
        followKey(bill),
        {
          status: 'ready' as const,
          title: bill.title,
          current: {},
          keys: [],
          changes: [
            {
              marker: 'status',
              text: 'Passed',
              asAt: '2026-09-01',
              citation: 'ParlInfo bill records',
            },
          ],
        },
      ],
    ] as [string, import('../src/features/follows/markers').FollowState][],
    sourceDates: { bills: '2026-09-01' },
  };
  await saveFollowResult(result);
  expect(await loadFollowResult()).toEqual(result);
  expect(
    followResultKey({ ...result, states: [...result.states].reverse() }),
  ).toBe(followResultKey(result));
  expect(followResultKey({ states: [] })).not.toBe(followResultKey(result));
  mockFail = true;
  await expect(
    saveFollowResult({ ...result, checkedAt: 200 }),
  ).rejects.toThrow();
  expect(await loadFollowResult()).toEqual(result);
});

function FollowStatesProbe({ refresh }: { refresh: number }) {
  useFollowStates(refresh);
  return null;
}
test.each(['introduced', 'divisions', 'declarations'])(
  'the loader silently saves only a newly readable %s marker',
  async (marker) => {
    const bills = structuredClone(catalogs.bills!);
    Object.assign(bills.bills[0]!, {
      sponsor: 'Anthony Albanese',
      introduced: '2026-08-12',
    });
    const interestIndex = structuredClone(catalogs.interestIndex!);
    Object.assign(
      Object.values(interestIndex.people).find(
        (r) => r.name === 'Anthony Albanese',
      )!,
      {
        latest: [
          {
            key: 'gift:recovered',
            description: 'A gift',
            category: 'gifts',
            date: '2026-08-31',
          },
        ],
      },
    );
    const recovered: FollowSources = {
      manifest: catalogs.manifest,
      people: catalogs.people,
      roster: catalogs.roster,
      slugs: catalogs.slugs,
      electorates: index,
      bills,
      votes: catalogs.votes!,
      interestIndex,
      pay: catalogs.pay!,
      expenses: catalogs.expenses!,
      money: null,
      stale: false,
      savedAt: 1,
      error: null,
    };
    const initial = {
      ...recovered,
      ...(marker === 'introduced'
        ? { bills: null }
        : marker === 'divisions'
          ? { votes: null }
          : { interestIndex: null }),
    };
    jest.mocked(runtime.followSources).mockResolvedValue(initial);
    const person = {
      kind: 'person' as const,
      id: 'person_2b850aa643795ce8902f754b',
      title: 'Anthony Albanese',
    };
    await follow(person);
    if (marker !== 'introduced') await follow(bill);
    let renderer!: TestRenderer.ReactTestRenderer;
    try {
      await act(async () => {
        renderer = TestRenderer.create(
          createElement(FollowStatesProbe, { refresh: 0 }),
        );
      });
      const saved = (await loadFollows()).find((f) => f.id === person.id)!;
      expect(saved.seen?.[marker]).toBeUndefined();
      await act(async () => {
        await markSeen(followKey(person), {
          party: { value: 'earlier', words: 'Earlier party', asAt: null },
        });
      });
      const before = (await loadFollows()).find((f) => f.id === person.id)!;
      jest.mocked(runtime.followSources).mockResolvedValue(recovered);
      await act(async () => {
        if (marker === 'introduced') await follow(bill);
        else renderer.update(createElement(FollowStatesProbe, { refresh: 1 }));
      });
      const after = (await loadFollows()).find((f) => f.id === person.id)!;
      const state = followState(after, recovered);
      if (state.status !== 'ready')
        throw new Error('Missing recovered reading');
      expect(after.seen).toMatchObject(before.seen!);
      expect(after.seen?.[marker]).toEqual(state.current[marker]);
      expect(after.seenKeys).toEqual(
        [
          ...new Set([
            ...currentKeys({ [marker]: state.current[marker]! }),
            ...before.seenKeys!,
          ]),
        ].slice(0, 50),
      );
      expect(state.changes.some((c) => c.marker === marker)).toBe(false);
      expect(state.changes.some((c) => c.marker === 'party')).toBe(true);
    } finally {
      if (renderer) await act(async () => renderer.unmount());
    }
  },
);
