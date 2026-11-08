// Wave 4, lane B (specs/bills.md): the status event (2.1), the vote order
// and words (4.2.5), the list's filter helpers (2.2), the bill page's
// arrivals (`?division=`, 4.4) and Added since (4.2.1), the saved-seat line
// under a vote, and the bill read that no longer waits for the index (4.10).
import { act } from 'react';
import { useWindowDimensions } from 'react-native';
import TestRenderer, { type ReactTestInstance } from 'react-test-renderer';
import { billTimeline } from '../src/api/bill-transforms';
import * as d from '../src/api/catalogs';
import { Catalogs } from '../src/api/catalogs';
import { catalogs as runtime } from '../src/api/runtime';
import { router } from 'expo-router';
import { MachinePill } from '../src/design/labels';
import { resultsRoute } from '../src/navigation/routes/search';
import { StatusCapsule } from '../src/design/primitives';
import BillDetail from '../src/features/bills/BillDetail';
import {
  countWords,
  isProcedural,
  orderDivisions,
  outcomeWord,
  voteTier,
} from '../src/features/bills/divisions';
import {
  billRows,
  facetCounts,
  type BillListRow,
} from '../src/features/bills/filters';
import { partyBloc } from '../src/features/bills/party-codes';
import {
  statusEvent,
  statusEventText,
} from '../src/features/bills/status-event';
import { memberPosition } from '../src/features/bills/your-mp-vote';
import {
  divisionFilters,
  filterDivisions,
} from '../src/features/directories/DivisionHistory';
import type { DivisionRow } from '../src/features/directories/model';
import { useFollowStates } from '../src/features/follows/useFollowStates';
import { bills, pinned, slugs } from './pinned';

const mockParams: { key: string; division?: string; section?: string } = {
  key: 'au-federal-r7520',
};
jest.mock('expo-router', () => ({
  useSegments: () => [],
  useLocalSearchParams: () => mockParams,
  router: { push: jest.fn(), setParams: jest.fn() },
  useNavigation: () => ({ setParams: jest.fn() }),
  useIsFocused: () => true,
  Stack: {
    Screen: () => null,
    Toolbar: Object.assign(() => null, {
      Button: () => null,
      Spacer: () => null,
    }),
  },
  Link: Object.assign(({ children }: { children?: unknown }) => children, {
    Trigger: ({ children }: { children?: unknown }) => children,
    Preview: () => null,
    Menu: () => null,
    MenuAction: () => null,
  }),
}));
jest.mock('../src/api/runtime', () => ({
  catalogs: { billFor: jest.fn(), directory: jest.fn(), votes: jest.fn() },
}));
jest.mock('../src/features/follows/useFollowStates', () => ({
  useFollowStates: jest.fn(),
}));
// The group itself is the follows lane's; here only where it sits and what
// its rows open.
jest.mock('../src/features/follows/AddedSinceGroup', () => ({
  AddedSinceGroup: (props: object) =>
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('react').createElement('AddedSince', props),
}));
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: jest.fn(),
}));

const detail = (key: string) => d.decodeBill(pinned(`/bills/${key}.json`));
const view = (key: string) => d.billFor(detail(key), bills);

describe('the status event (2.1)', () => {
  test('Interactive Gambling: Royal Assent on 26 Aug, never "Passed 26 Aug"', () => {
    const bill = detail('au-federal-r7534');
    const event = statusEvent(bill);
    expect(event).toEqual({
      label: 'Royal Assent',
      date: '2026-08-26',
      resolved: true,
    });
    expect(statusEventText(event!)).toBe(
      'Royal Assent 26 Aug 2026'.replace(/ /g, ' '),
    );
    expect(statusEventText(event!, 'long')).toBe('Royal Assent 26 August 2026');
  });

  test('passed but not assented reads "Passed both houses"', () => {
    const bill = detail('au-federal-r7534');
    const event = statusEvent({
      ...bill,
      status_as_of: '2026-08-19',
      key_dates: bill.key_dates.filter((k) => k.stage !== 'royal_assent'),
    });
    expect(event).toMatchObject({
      label: 'Passed both houses',
      date: '2026-08-19',
    });
  });

  test('a date with no recorded stage is "Status as at", unresolved', () => {
    const bill = detail('au-federal-r7534');
    expect(statusEvent({ ...bill, status_as_of: '2026-09-30' })).toMatchObject({
      label: 'Status as at',
      resolved: false,
    });
    expect(statusEvent({ ...bill, key_dates: [] })).toMatchObject({
      label: 'Status as at',
      date: '2026-08-26',
    });
  });
});

describe('votes: order and words (4.2.5)', () => {
  test('procedural stages are named, and a missing stage never is', () => {
    for (const stage of [
      'Limitation of debate',
      'Closure',
      'Suspension of standing orders',
      'adjournment',
    ])
      expect(isProcedural(stage)).toBe(true);
    for (const stage of ['Third reading', 'Second reading', '', null])
      expect(isProcedural(stage)).toBe(false);
    expect(voteTier('Third reading')).toBe(1);
    expect(voteTier('Consideration in detail')).toBe(2);
    expect(voteTier(null)).toBe(2);
    expect(voteTier('Limitation of debate')).toBe(3);
  });

  test('third readings first, then the rest newest first; procedural apart', () => {
    const rows = view('au-federal-r7520').divisions.data!.rows;
    const { main, procedural } = orderDivisions(rows);
    expect(main[0]!.stage).toBe('Third reading');
    expect(main.length + procedural.length).toBe(rows.length);
    expect(procedural.every((r) => isProcedural(r.stage))).toBe(true);
    expect(main.some((r) => isProcedural(r.stage))).toBe(false);
    for (let i = 2; i < main.length; i++)
      expect(main[i - 1]!.date >= main[i]!.date).toBe(true);
  });

  test('outcomes are "Agreed to" or "Not agreed to"; counts are words', () => {
    expect(outcomeWord('affirmative')).toBe('Agreed to');
    expect(outcomeWord('negative')).toBe('Not agreed to');
    expect(outcomeWord('', { ayes: 30, noes: 10 })).toBe('Agreed to');
    expect(countWords(12, 27)).toBe('12 ayes, 27 noes');
    expect(countWords(0, 25)).toBe('25 noes');
    expect(countWords(0, 25, { spoken: true })).toBe('no ayes, 25 noes');
    expect(countWords(1, 1)).toBe('1 aye, 1 no');
  });

  test('parties group as Labor, the Coalition and the crossbench', () => {
    expect(partyBloc('Australian Labor Party')).toBe('labor');
    expect(partyBloc('Liberal')).toBe('coalition');
    expect(partyBloc('Nationals')).toBe('coalition');
    expect(partyBloc('Greens')).toBe('crossbench');
    expect(partyBloc(null)).toBe('crossbench');
  });
});

describe('the list (2.2, 3.2)', () => {
  const rows = d.billsFor(bills).data! as BillListRow[];
  test('a scope narrows by status; facet counts match what a choice would show', () => {
    const passed = billRows(rows, {}, 'passed');
    expect(passed.every((b) => b.status === 'passed')).toBe(true);
    const chambers = facetCounts(rows, {}, 'all', 'chamber');
    for (const [chamber, count] of Object.entries(chambers))
      expect(billRows(rows, { chamber: chamber as never }, 'all').length).toBe(
        count,
      );
  });
});

describe('Votes in parliament filters (6.2)', () => {
  const row = (n: number, extra: Partial<DivisionRow>): DivisionRow => ({
    key: `b:${n}`,
    billKey: 'b',
    title: 'A Bill 2026',
    stage: 'Third reading',
    date: '2026-08-19',
    house: 'senate',
    question: '',
    ayes: 30,
    noes: 10,
    outcome: 'affirmative',
    ...extra,
  });
  const all = [
    row(1, {}),
    row(2, { stage: 'Limitation of debate' }),
    row(3, { stage: null }),
    row(4, { house: 'representatives', outcome: 'negative' }),
  ];
  test('procedural votes leave only when asked; a vote with no stage stays', () => {
    expect(filterDivisions(all, divisionFilters({}))).toHaveLength(4);
    const kept = filterDivisions(all, divisionFilters({ procedural: true }));
    expect(kept.map((r) => r.key)).toEqual(['b:1', 'b:3', 'b:4']);
  });
  test('chamber and outcome narrow; search reads the bill and the stage', () => {
    expect(
      filterDivisions(all, divisionFilters({ chamber: 'house' })).map(
        (r) => r.key,
      ),
    ).toEqual(['b:4']);
    expect(
      filterDivisions(all, divisionFilters({ outcome: 'not-agreed' })),
    ).toHaveLength(1);
    expect(filterDivisions(all, {}, 'limitation')).toHaveLength(1);
  });
});

describe('your MP under a vote (journeys/my-mp.md 3.7)', () => {
  const bill = { title: 'A Bill 2026', shortTitle: null };
  const third = { date: '2026-08-18', stage: 'third_reading' };
  test('one clear match says how the member voted', () => {
    expect(
      memberPosition(
        {
          for: [
            { name: 'A Bill 2026', stage: 'Third reading', date: '2026-08-18' },
          ],
          against: [],
        },
        bill,
        third,
        [third],
      ),
    ).toBe('for');
  });
  test('two votes on the same stage and day say nothing', () => {
    expect(
      memberPosition(
        {
          for: [
            { name: 'A Bill 2026', stage: 'Third reading', date: '2026-08-18' },
          ],
          against: [],
        },
        bill,
        third,
        [third, { ...third }],
      ),
    ).toBeNull();
  });
});

describe('reading a bill (4.10)', () => {
  test('the bill resolves without waiting for the bills index', async () => {
    let indexReads = 0;
    const catalogs = new Catalogs({
      get: (path, decode) => {
        if (path === '/bills/index.json') {
          indexReads++;
          return new Promise(() => undefined);
        }
        return Promise.resolve({
          data: decode(pinned(path)),
          stale: false,
          savedAt: 1,
          asOf: null,
        });
      },
    });
    const bill = await catalogs.billFor('au-federal-r7534');
    expect(bill.data.identity.data!.key).toBe('au-federal-r7534');
    // The index is read for next time, not waited on.
    expect(indexReads).toBe(1);
  });
});

// The page over the pinned files.
const fixture = new Catalogs({
  get: async (path, decode) => ({
    data: decode(path === '/api/person-slugs' ? slugs : pinned(path)),
    stale: false,
    savedAt: 1000,
    asOf: null,
  }),
});
const follows = (changes: object[] = []) =>
  jest.mocked(useFollowStates).mockReturnValue({
    follows: changes.length
      ? [
          {
            kind: 'bill',
            id: mockParams.key,
            title: 'Bill',
            followedAt: 1,
            seen: null,
            seenAt: null,
          },
        ]
      : [],
    states: new Map(
      changes.length
        ? [[`bill:${mockParams.key}`, { status: 'ready', changes }]]
        : [],
    ),
  } as unknown as ReturnType<typeof useFollowStates>);
beforeEach(() => {
  jest.clearAllMocks();
  mockParams.key = 'au-federal-r7520';
  delete mockParams.division;
  delete mockParams.section;
  jest
    .mocked(useWindowDimensions)
    .mockReturnValue({ width: 402, height: 874, scale: 3, fontScale: 1 });
  jest
    .mocked(runtime.billFor)
    .mockImplementation((key, refresh) => fixture.billFor(key, refresh));
  jest.mocked(runtime.directory).mockRejectedValue(new Error('not here'));
  follows();
});
const mounted: TestRenderer.ReactTestRenderer[] = [];
afterEach(() => {
  act(() => mounted.splice(0).forEach((tree) => tree.unmount()));
});
async function render() {
  let r!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    r = TestRenderer.create(<BillDetail />);
  });
  mounted.push(r);
  return r.root;
}
const host = (root: ReactTestInstance, testID: string) =>
  root.findAll(
    (node) => typeof node.type === 'string' && node.props.testID === testID,
  );
/** The vote rows' keys in draw order, from their spoken labels. */
const expandedVotes = (root: ReactTestInstance) =>
  root
    .findAll(
      (node) =>
        typeof node.type === 'string' &&
        /^bill-division-\d+-more$/.test(node.props.testID ?? '') &&
        node.props.accessibilityState?.expanded === true,
    )
    .map((node) => node.props.testID as string);

/** Opens "All N stages", where the date rows are. */
const openAllStages = (root: ReactTestInstance) =>
  act(async () =>
    root
      .find(
        (node) =>
          node.props.testID === 'bill-dates-all' &&
          typeof node.props.onPress === 'function',
      )
      .props.onPress(),
  );

describe('the bill page', () => {
  test('?division= reveals the seventh vote, expanded, and nothing else', async () => {
    const { main } = orderDivisions(
      view('au-federal-r7520').divisions.data!.rows,
    );
    mockParams.division = main[6]!.key;
    const root = await render();
    expect(host(root, 'bill-division-6')).toHaveLength(1);
    expect(expandedVotes(root)).toEqual(['bill-division-6-more']);
    expect(host(root, 'bill-division-6-body')).toHaveLength(1);
    // "Show fewer" is on offer, since the rest were revealed.
    expect(host(root, 'bill-divisions-more')).toHaveLength(1);
  });

  test('a procedural vote opens its group first', async () => {
    const { main, procedural } = orderDivisions(
      view('au-federal-r7520').divisions.data!.rows,
    );
    mockParams.division = procedural[0]!.key;
    const root = await render();
    expect(expandedVotes(root)).toEqual([`bill-division-${main.length}-more`]);
  });

  test('a folded duplicate lands on the vote it was folded into; an unknown key does nothing', async () => {
    const data = view('au-federal-r7520').divisions.data!;
    const shown = new Set(data.rows.map((r) => r.key));
    const folded = data.rawRows!.find((r) => !shown.has(r.key))!;
    mockParams.division = folded.key;
    let root = await render();
    expect(expandedVotes(root)).toHaveLength(1);
    act(() => mounted.splice(0).forEach((tree) => tree.unmount()));
    mockParams.division = 'federal-senate-0';
    root = await render();
    expect(expandedVotes(root)).toHaveLength(0);
  });

  test('a followed bill with changes shows Added since right after the header source line; its vote row opens the vote', async () => {
    const { main } = orderDivisions(
      view('au-federal-r7520').divisions.data!.rows,
    );
    const target = main[7]!;
    follows([
      {
        marker: 'division',
        text: 'Vote recorded',
        citation: 'They Vote For You',
        asAt: target.date,
        key: target.key,
        record: {
          key: target.key,
          kind: 'division',
          date: target.date,
          title: 'Consideration in detail',
          billKey: mockParams.key,
          divisionKey: target.key,
        },
      },
    ]);
    const root = await render();
    const group = root.find(
      (node) =>
        node.type === ('AddedSince' as never) &&
        node.props.testID === 'bill-added-since',
    );
    // Directly after the header's source line, before In short.
    const ids = root
      .findAll(
        (node) =>
          node.type === ('AddedSince' as never) ||
          (typeof node.type === 'string' &&
            typeof node.props.testID === 'string'),
      )
      .map((node) =>
        node.type === ('AddedSince' as never)
          ? 'added-since'
          : (node.props.testID as string),
      )
      .filter((id) => !id.startsWith('bill-source-'));
    const at = ids.indexOf('added-since');
    expect(ids.lastIndexOf('bill-source')).toBe(at - 1);
    expect(ids.indexOf('bill-summary')).toBeGreaterThan(at);
    // The new vote carries the dot.
    expect(host(root, 'bill-division-7-new')).toHaveLength(0);
    await act(async () => group.props.onRowPress(group.props.changes[0]));
    expect(expandedVotes(root)).toEqual(['bill-division-7-more']);
    expect(host(root, 'bill-division-7-new')).toHaveLength(1);
  });

  test('a vote on the same day as a stage marks the vote, never the stage row', async () => {
    const data = view('au-federal-r7520');
    const { main } = orderDivisions(data.divisions.data!.rows);
    const entries = billTimeline(data.keyDates.data ?? []).entries;
    const target = main
      .slice(0, 5)
      .find((v) => entries.some((e) => e.from === v.date))!;
    expect(target).toBeDefined();
    const index = main.indexOf(target);
    // The people feed's fallback key carries the date, as speech slugs do.
    follows([
      {
        marker: 'division',
        text: 'Vote recorded',
        citation: 'They Vote For You',
        asAt: target.date,
        key: `vote:federal:${target.date}:Bill:${target.stage}`,
        record: {
          key: `vote:federal:${target.date}:Bill:${target.stage}`,
          kind: 'vote',
          date: target.date,
          title: 'Bill',
          stage: target.stage,
          divisionKey: target.key,
        },
      },
    ]);
    const root = await render();
    await openAllStages(root);
    expect(host(root, 'bill-date-0').length).toBe(1);
    expect(host(root, `bill-division-${index}-new`)).toHaveLength(1);
    expect(
      root.findAll(
        (node) =>
          typeof node.type === 'string' &&
          /^bill-date-\d+-new$/.test(node.props.testID ?? ''),
      ),
    ).toHaveLength(0);
  });

  test('a stage change marks the date row its day falls in', async () => {
    const entries = billTimeline(
      view('au-federal-r7520').keyDates.data ?? [],
    ).entries;
    const last = entries.length - 1;
    const date = entries[last]!.to ?? entries[last]!.from;
    follows([
      {
        marker: 'stage',
        text: 'Moved',
        citation: 'ParlInfo',
        asAt: date,
        key: `stage:${date}`,
        record: { key: `stage:${date}`, kind: 'stage', date, title: 'Bill' },
      },
    ]);
    const root = await render();
    await openAllStages(root);
    const marked = root
      .findAll(
        (node) =>
          typeof node.type === 'string' &&
          /^bill-date-\d+-new$/.test(node.props.testID ?? ''),
      )
      .map((node) => node.props.testID);
    expect(marked).toEqual([`bill-date-${last}-new`]);
  });

  test('an unchanged bill shows neither Added since nor a new dot', async () => {
    const root = await render();
    expect(
      root.findAll((node) => node.type === ('AddedSince' as never)),
    ).toHaveLength(0);
    expect(
      root.findAll(
        (node) =>
          typeof node.type === 'string' &&
          /-new$/.test(node.props.testID ?? ''),
      ),
    ).toHaveLength(0);
  });

  test('the machine summary carries the pill, never a status capsule', async () => {
    const root = await render();
    const summary = root.find(
      (node) =>
        typeof node.type === 'string' && node.props.testID === 'bill-summary',
    );
    expect(summary.findAllByType(MachinePill).length).toBeGreaterThan(0);
    expect(summary.findAllByType(StatusCapsule)).toHaveLength(0);
  });

  test('after the speeches, one row searches every speech for the bill', async () => {
    mockParams.key = 'au-federal-r7534';
    const root = await render();
    const ids = root
      .findAll(
        (node) =>
          typeof node.type === 'string' &&
          typeof node.props.testID === 'string',
      )
      .map((node) => node.props.testID as string);
    expect(ids.indexOf('bill-speeches-search')).toBeGreaterThan(
      ids.findLastIndex((id) => /^bill-speech-\d+$/.test(id)),
    );
    const row = root.find(
      (node) =>
        node.props.testID === 'bill-speeches-search' &&
        typeof node.props.onPress === 'function',
    );
    act(() => row.props.onPress());
    expect(router.push).toHaveBeenCalledWith(
      resultsRoute('all', {
        scope: 'speeches',
        q: 'Interactive Gambling (Cost Recovery Levy) Bill 2026',
      }),
    );
  });
});
