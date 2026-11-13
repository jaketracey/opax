import { Screen } from '../src/design/layout';
import { ContentUnavailable } from '../src/design/states';
import { RouteOptions } from '../src/navigation/preview';
import { billsScreens } from '../src/navigation/stack/bills';
// Wave 4, lane B (specs/bills.md): the status event (2.1), the vote order
// and words (4.2.5), the list's filter helpers (2.2), the bill page's
// arrivals (`?division=`, 4.4) and Added since (4.2.1), the saved-seat line
// under a vote, and the bill read that no longer waits for the index (4.10).
import { router, Stack } from 'expo-router';
import {
  NavigationContext,
  NavigationRouteContext,
} from 'expo-router/react-navigation';
import { act } from 'react';
import {
  LayoutAnimation,
  Platform,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import TestRenderer, { type ReactTestInstance } from 'react-test-renderer';
import { billTimeline } from '../src/api/bill-transforms';
import * as d from '../src/api/catalogs';
import { Catalogs } from '../src/api/catalogs';
import { catalogs as runtime } from '../src/api/runtime';
import { formatDate } from '../src/design/format';
import { MachinePill } from '../src/design/labels';
import {
  RegionProvider,
  Button,
  SourceLine,
  StatusCapsule,
} from '../src/design/primitives';
import { bindRecordTitle } from '../src/design/record-title';
import { HeightReveal } from '../src/design/reveal';
import BillDetail, {
  footSection,
  sameSourceLine,
  shareSourceLine,
} from '../src/features/bills/BillDetail';
import { sourceLineParts } from '../src/design/source';
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
import DivisionHistory, {
  divisionFilters,
  filterDivisions,
} from '../src/features/directories/DivisionHistory';
import * as divisionData from '../src/features/directories/division-data';
import type { DivisionRow } from '../src/features/directories/model';
import { useFollowStates } from '../src/features/follows/useFollowStates';
import { resultsRoute } from '../src/navigation/routes/search';
import { bills, pinned, slugs } from './pinned';

const mockParams: { key: string; division?: string; section?: string } = {
  key: 'au-federal-r7520',
};
jest.mock('expo-router', () => ({
  useIsPreview: () => false,
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
  catalogs: {
    billFor: jest.fn(),
    billIndexRow: jest.fn(),
    directory: jest.fn(),
    votes: jest.fn(),
  },
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

describe('Votes in parliament: the votes sit under the bill title (6.1)', () => {
  const row = (n: number): DivisionRow => ({
    key: `au-federal-r7534:d${n}`,
    billKey: 'au-federal-r7534',
    title: 'Interactive Gambling Amendment Bill 2026',
    stage: 'Third reading',
    date: '2026-08-19',
    house: 'senate',
    question: 'That the bill be now read a third time.',
    ayes: 30,
    noes: 11,
    outcome: 'agreed',
  });
  test.each([
    ['the measured text column', 28, 28],
    ['a third of the column at most', 150, 100],
  ])('the inset is %s', async (_case, textColumn, inset) => {
    const load = jest.spyOn(divisionData, 'loadDivisionHistory');
    load.mockResolvedValue({
      rows: [row(1), row(2)],
      total: 1,
      loaded: 1,
      failed: 0,
      stale: false,
    } as Awaited<ReturnType<typeof divisionData.loadDivisionHistory>>);
    let r!: TestRenderer.ReactTestRenderer;
    const route = { key: 'votes', name: 'division-history' };
    const navigation = {
      setOptions: jest.fn(),
      isFocused: () => true,
      addListener: () => () => {},
      getState: () => ({ routes: [{ key: 'root', name: 'bills' }, route] }),
    };
    const registration = billsScreens().find(
      (screen) => screen.props.name === 'division-history',
    )!;
    expect(registration.props.options({ route, navigation })).toMatchObject({
      headerBackTitle: 'Bills',
      headerBackButtonDisplayMode: 'default',
      headerBackButtonMenuEnabled: true,
    });
    await act(async () => {
      r = TestRenderer.create(
        <NavigationContext.Provider value={navigation as never}>
          <NavigationRouteContext.Provider value={route}>
            <DivisionHistory />
          </NavigationRouteContext.Provider>
        </NavigationContext.Provider>,
      );
    });
    mounted.push(r);
    const root = r.root;
    expect(root.findByType(RouteOptions).props.options).toMatchObject({
      title: 'Votes in parliament',
    });
    expect(root.findByType(RouteOptions).props.options).not.toHaveProperty(
      'headerBackTitle',
    );
    // The probe marks the top left of the bill header's text column.
    const probeAt = () =>
      root.findAll(
        (node) =>
          typeof node.type === 'string' &&
          node.props.pointerEvents === 'none' &&
          typeof node.props.onLayout === 'function' &&
          StyleSheet.flatten(node.props.style)?.position === 'absolute',
      )[0]!;
    let header = probeAt().parent!;
    while (
      !(
        typeof header.type === 'string' &&
        typeof header.props.onLayout === 'function'
      )
    )
      header = header.parent!;
    await act(async () =>
      header.props.onLayout({ nativeEvent: { layout: { width: 300 } } }),
    );
    // The view's measurement, as the native view would answer it.
    let view = probeAt();
    while (typeof view.instance?.measureLayout !== 'function')
      view = view.parent!;
    view.instance.measureLayout = (
      _from: unknown,
      done: (x: number, y: number, w: number, h: number) => void,
    ) => done(textColumn, 0, 0, 0);
    await act(async () => probeAt().props.onLayout({ nativeEvent: {} }));
    const vote = host(root, 'division-history-au-federal-r7534-0')[0]!;
    let wrapper = vote.parent!;
    while (
      StyleSheet.flatten(wrapper.props.style)?.paddingLeft === undefined &&
      wrapper.parent
    )
      wrapper = wrapper.parent;
    expect(StyleSheet.flatten(wrapper.props.style).paddingLeft).toBe(inset);
    const separators = root.findAll(
      (node) =>
        typeof node.type === 'string' &&
        StyleSheet.flatten(node.props.style)?.height ===
          StyleSheet.hairlineWidth &&
        StyleSheet.flatten(node.props.style)?.marginLeft !== undefined,
    );
    expect(separators.length).toBeGreaterThan(0);
    for (const separator of separators)
      expect(StyleSheet.flatten(separator.props.style).marginLeft).toBe(inset);
    load.mockRestore();
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

  test('the index row is read from memory only, never the network', async () => {
    const paths: string[] = [];
    const catalogs = new Catalogs({
      get: async (path, decode) => {
        paths.push(path);
        return {
          data: decode(pinned(path)),
          stale: false,
          savedAt: 1,
          asOf: null,
        };
      },
    });
    expect(catalogs.billIndexRow('au-federal-r7534')).toBeNull();
    expect(paths).toEqual([]);
    await catalogs.bills();
    expect(catalogs.billIndexRow('au-federal-r7534')?.title).toBe(
      bills.bills.find((b) => b.key === 'au-federal-r7534')!.title,
    );
    expect(catalogs.billIndexRow('au-federal-r0000000')).toBeNull();
    expect(paths).toEqual(['/bills/index.json']);
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
  jest.mocked(runtime.billIndexRow).mockReturnValue(null);
  follows();
});
const mounted: TestRenderer.ReactTestRenderer[] = [];
afterEach(() => {
  act(() => mounted.splice(0).forEach((tree) => tree.unmount()));
});
async function render(embedded = false, paneWidth?: number) {
  let r!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    r = TestRenderer.create(
      <RegionProvider
        value={paneWidth ? { width: paneWidth, height: 874 } : null}
      >
        <BillDetail embedded={embedded} />
      </RegionProvider>,
    );
  });
  mounted.push(r);
  return r.root;
}
const texts = (node: ReactTestInstance): string[] =>
  node.children.flatMap((child) =>
    typeof child === 'string' ? [child] : texts(child),
  );
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

describe('loading a bill (4.3)', () => {
  // The bar's items (Share beside ⋯) as label: disabled, and whether the
  // "Ask about this bill" button is drawn. iOS draws no bottom toolbar.
  const actions = (root: ReactTestInstance) => {
    const options = root.findAllByType(RouteOptions).at(-1)!.props.options as {
      unstable_headerRightItems?: () => { label: string; disabled?: boolean }[];
    };
    return {
      ...Object.fromEntries(
        (options.unstable_headerRightItems?.() ?? []).map((item) => [
          item.label,
          !!item.disabled,
        ]),
      ),
      ask: host(root, 'bill-ask').length === 1,
      toolbars: root.findAllByType(Stack.Toolbar).length,
    };
  };
  const statusText = (root: ReactTestInstance) => {
    const status = host(root, 'bill-status')[0]!;
    return {
      label: status.props.accessibilityLabel as string,
      text: status
        .findAll((node) => typeof node.type === 'string')
        .flatMap((node) => node.children)
        .filter((child): child is string => typeof child === 'string')
        .join(' '),
    };
  };

  test('with the index read, the header draws from its row before the bill file arrives', async () => {
    mockParams.key = 'au-federal-r7534';
    const row = bills.bills.find((b) => b.key === mockParams.key)!;
    jest.mocked(runtime.billIndexRow).mockReturnValue(row);
    let arrive!: () => void;
    jest.mocked(runtime.billFor).mockImplementation(
      (key, refresh) =>
        new Promise((resolve) => {
          arrive = () => resolve(fixture.billFor(key, refresh));
        }),
    );
    const root = await render();
    // The title is the row's, in the page's own heading.
    const title = host(root, 'bill-title');
    expect(title).toHaveLength(1);
    // The heading binds its short last word (design/record-title.ts).
    expect(texts(title[0]!).join('')).toBe(bindRecordTitle(row.title));
    // No event beside the status until the key dates resolve it.
    expect(statusText(root).label).toBe('Status: Passed');
    expect(statusText(root).text).not.toMatch(/\d{4}/);
    expect(host(root, 'bill-follow-off')).toHaveLength(1);
    expect(host(root, 'bill-loading')).toHaveLength(1);
    // Share and ⋯ wait for the bill; the Ask button comes with the page.
    expect(actions(root)).toEqual({
      Share: true,
      More: true,
      ask: false,
      toolbars: 0,
    });
    await act(async () => arrive());
    expect(host(root, 'bill-loading')).toHaveLength(0);
    expect(host(root, 'bill-title')).toHaveLength(1);
    expect(statusText(root).label).toBe(
      'Status: Passed. Royal Assent, 26 August 2026',
    );
    expect(actions(root)).toEqual({
      Share: false,
      More: false,
      ask: true,
      toolbars: 0,
    });
  });

  test('a cold load is one "Loading the bill" skeleton, with Ask and Share waiting', async () => {
    jest
      .mocked(runtime.billFor)
      .mockImplementation(() => new Promise(() => undefined));
    const root = await render();
    const loading = host(root, 'bill-loading');
    expect(loading).toHaveLength(1);
    expect(loading[0]!.props.accessibilityLabel).toBe('Loading the bill');
    expect(host(root, 'bill-title')).toHaveLength(0);
    expect(host(root, 'bill-status')).toHaveLength(0);
    expect(actions(root)).toEqual({
      Share: true,
      More: true,
      ask: false,
      toolbars: 0,
    });
  });
});

describe('the bill page', () => {
  test.each([
    ['introduced', '2025-08-26', '2025-08-26', null],
    ['royal_assent', '2026-08-26', '2025-08-26', 'Royal Assent'],
    ['passed_both_houses', '2026-08-26', '2025-08-26', 'Passed both houses'],
    ['royal_assent', '2025-08-26', '2025-08-26', 'Royal Assent'],
    ['introduced', '2026-08-26', '2025-08-26', 'Introduced'],
    ['unrecognised', '2025-08-26', '2025-08-26', 'Status as at'],
    ['introduced', '2026-08-26', null, 'Introduced'],
  ])(
    '%s on %s beside the status only repeats introduction when its date differs from %s',
    async (stage, date, introduced, eventLabel) => {
      const record = await fixture.billFor('au-federal-r7534');
      const identity = record.data.identity.data!;
      Object.assign(identity, {
        introduced,
        statusAsOf: date,
        status: stage === 'introduced' ? 'before_parliament' : 'passed',
        statusLabel: stage === 'introduced' ? 'Before parliament' : 'Passed',
      });
      record.data.keyDates.data = [
        { ...record.data.keyDates.data![0]!, stage: stage!, date: date! },
      ];
      jest.mocked(runtime.billFor).mockResolvedValue(record);
      const root = await render();
      const status = host(root, 'bill-status')[0]!;
      expect(status.props.accessibilityLabel).toBe(
        `Status: ${identity.statusLabel}${eventLabel ? `. ${eventLabel}, ${formatDate(date!)}` : ''}`,
      );
      expect(root.findAllByType(StatusCapsule)[0]!.props.status).toBe(
        identity.statusLabel,
      );
      expect(texts(status).join(' ').replace(/\s+/g, ' ')).toBe(
        [
          identity.statusLabel,
          eventLabel ? `${eventLabel} ${formatDate(date!, 'short')}` : null,
        ]
          .filter(Boolean)
          .join(' '),
      );
      const meta = host(root, 'bill-introduced');
      if (introduced) {
        expect(meta).toHaveLength(1);
        expect(texts(meta[0]!).join('')).toContain(
          `Introduced ${formatDate(introduced, 'short')}`,
        );
      } else expect(meta).toHaveLength(0);
    },
  );

  test('a seeded introduction is said once before and after the bill arrives', async () => {
    mockParams.key = 'au-federal-r7534';
    const row = bills.bills.find((bill) => bill.key === mockParams.key)!;
    const introduced = '2025-08-26';
    jest.mocked(runtime.billIndexRow).mockReturnValue({
      ...row,
      status: 'before_parliament',
      introduced,
      status_as_of: introduced,
      status_stage: 'introduced',
    });
    const record = await fixture.billFor(mockParams.key);
    Object.assign(record.data.identity.data!, {
      status: 'before_parliament',
      statusLabel: 'Before parliament',
      introduced,
      statusAsOf: introduced,
    });
    record.data.keyDates.data = [
      {
        ...record.data.keyDates.data![0]!,
        stage: 'introduced',
        date: introduced,
      },
    ];
    let arrive!: () => void;
    jest.mocked(runtime.billFor).mockImplementation(
      () =>
        new Promise((resolve) => {
          arrive = () => resolve(record);
        }),
    );
    const root = await render();
    for (const loaded of [false, true]) {
      if (loaded) await act(async () => arrive());
      expect(host(root, 'bill-status')[0]!.props.accessibilityLabel).toBe(
        'Status: Before parliament',
      );
      expect(texts(host(root, 'bill-introduced')[0]!).join('')).toContain(
        'Introduced 26 Aug 2025',
      );
      expect(
        root
          .findAllByType(SourceLine)
          .filter((line) => line.props.testID === 'bill-source'),
      ).toHaveLength(loaded ? 1 : 0);
    }
  });

  test.each([
    ['phone', 402, 1, false, undefined],
    ['iPad', 1194, 1, false, undefined],
    ['Duo detail pane at AX5', 1114, 3.1, true, 540],
  ] as const)(
    '%s places the page provenance after every section',
    async (_label, width, fontScale, embedded, paneWidth) => {
      jest
        .mocked(useWindowDimensions)
        .mockReturnValue({ width, height: 874, scale: 3, fontScale });
      const root = await render(embedded, paneWidth);
      const lines = root.findAllByType(SourceLine);
      expect(
        lines.filter((line) => line.props.testID === 'bill-source'),
      ).toHaveLength(1);
      expect(lines.at(-1)!.props.testID).toBe('bill-source');
      expect(
        lines.some((line) => line.props.testID === 'bill-summary-source'),
      ).toBe(true);
      const target = host(root, 'bill-source')[0]!;
      expect(target.props.accessibilityLabel).toContain('ParlInfo');
      expect(target.props.accessibilityHint).toBe('Opens the sources');
      const button = root.find(
        (node) =>
          node.props.testID === 'bill-source' &&
          typeof node.props.onPress === 'function',
      );
      await act(async () => button.props.onPress());
      expect(jest.mocked(router.push).mock.calls.at(-1)![0]).toMatchObject({
        pathname: '/source',
      });
      const ids = root
        .findAll((node) => typeof node.type === 'string' && node.props.testID)
        .map((node) => node.props.testID);
      expect(ids.indexOf('bill-source')).toBeGreaterThan(
        ids.indexOf('bill-related'),
      );
    },
  );

  test('iOS draws no bottom toolbar a tab bar would cover: Share is beside ⋯, Ask is a button', async () => {
    const root = await render();
    expect(root.findAllByType(Stack.Toolbar)).toHaveLength(0);
    const options = root.findAllByType(RouteOptions).at(-1)!.props.options;
    const items = options.unstable_headerRightItems() as { label: string }[];
    expect(items.map((item) => item.label)).toEqual(['Share', 'More']);
    const ask = root.find(
      (node) =>
        node.props.testID === 'bill-ask' &&
        typeof node.props.onPress === 'function',
    );
    expect(ask.props.label).toBe('Ask about this bill');
    expect(ask.props.accessibilityLabel).toContain('Ask about this bill:');
    expect(
      root
        .findAllByType(Button)
        .find((node) => node.props.testID === 'bill-ask')!.props.variant,
    ).toBe('primary');
    const ids = root
      .findAll((node) => typeof node.type === 'string' && node.props.testID)
      .map((node) => node.props.testID);
    expect(ids.indexOf('bill-ask')).toBeGreaterThan(
      ids.indexOf('bill-summary-text'),
    );
  });
  test('the bar title is the short name, anchored on the H1', async () => {
    mockParams.key = 'au-federal-r7534';
    const root = await render();
    const heading = host(root, 'bill-title')[0]!;
    let anchor: ReactTestInstance | null = heading.parent;
    while (anchor && typeof anchor.props.onLayout !== 'function')
      anchor = anchor.parent;
    expect(anchor).not.toBeNull();
  });
  test('at AX5 the status capsule keeps to its word (w4-bill-ax5-01)', async () => {
    jest
      .mocked(useWindowDimensions)
      .mockReturnValue({ width: 402, height: 874, scale: 3, fontScale: 3.1 });
    mockParams.key = 'au-federal-r7534';
    const root = await render();
    const capsule = root.findAllByType(StatusCapsule)[0]!;
    const wrapper = capsule.parent!.parent!;
    expect(StyleSheet.flatten(wrapper.props.style)).toMatchObject({
      alignSelf: 'flex-start',
    });
  });

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

  test('a vote opens its party votes in place, and the further votes ease in below the first five', async () => {
    // LayoutAnimation does nothing on iOS under Reanimated 4.5, so both
    // jumped; each now opens and closes its own height (src/design/reveal.tsx).
    const configure = jest.spyOn(LayoutAnimation, 'configureNext');
    const root = await render();
    const press = (testID: string) =>
      act(async () =>
        root
          .find(
            (node) =>
              node.props.testID === testID &&
              typeof node.props.onPress === 'function',
          )
          .props.onPress(),
      );
    const inReveal = (testID: string) =>
      root
        .findAllByType(HeightReveal)
        .some((reveal) => host(reveal, testID).length > 0);
    expect(host(root, 'bill-division-5')).toHaveLength(0);
    await press('bill-division-0-more');
    expect(host(root, 'bill-division-0-body')).toHaveLength(1);
    expect(inReveal('bill-division-0-body')).toBe(true);
    await press('bill-divisions-more');
    expect(host(root, 'bill-division-5')).toHaveLength(1);
    expect(inReveal('bill-division-5')).toBe(true);
    // The first five stay where they are, outside the reveal.
    expect(inReveal('bill-division-4')).toBe(false);
    await press('bill-divisions-more');
    expect(host(root, 'bill-division-5')).toHaveLength(0);
    expect(configure).not.toHaveBeenCalled();
    configure.mockRestore();
  });

  test('an opened vote says what its party rows rest on', async () => {
    const record = await fixture.billFor('au-federal-r7520');
    const { main } = orderDivisions(record.data.divisions.data!.rows);
    const index = 0;
    const target = main[index]!;
    // A vote whose party rows fall short of its count, as the web notes it.
    target.splits.notes = ['2 not placed with a party', '2 paired'];
    jest.mocked(runtime.billFor).mockResolvedValue(record);
    mockParams.key = 'au-federal-r7520';
    mockParams.division = target.key;
    const root = await render();
    const notes = host(root, `bill-division-${index}-parties-notes`);
    expect(notes).toHaveLength(1);
    expect(texts(notes[0]!).join('')).not.toMatch(/ paired/);
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

  test('a followed bill with changes shows Added since after Follow; its vote row opens the vote', async () => {
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
    // Directly after Follow, before In short. Page provenance is last.
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
    expect(ids.lastIndexOf('bill-follow-off')).toBeLessThan(at);
    expect(ids.lastIndexOf('bill-source')).toBeGreaterThan(at);
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
    // The row is one accessible element: its label must carry the dot's "New".
    const spoken = (index: number) =>
      root.find(
        (node) =>
          typeof node.type === 'string' &&
          node.props.testID === `bill-date-${index}`,
      ).props.accessibilityLabel as string;
    expect(spoken(last)).toMatch(/\. New$/);
    if (last > 0) expect(spoken(0)).not.toMatch(/New/);
  });

  // Related bills is the last section, and its own line would say what the
  // page's line says just below it, so it carries the page's one line
  // (build 61, bug 5).
  const relatedLine = (root: ReactTestInstance) => {
    const lines = host(root, 'bill-related')[0]!.findAllByType(SourceLine);
    expect(lines.map((line) => line.props.testID)).toEqual(['bill-source']);
    expect(
      root
        .findAllByType(SourceLine)
        .filter((line) =>
          ['bill-source', 'bill-related-source'].includes(line.props.testID),
        ),
    ).toHaveLength(1);
    return lines[0]!.props;
  };
  test("Related bills carry the page's one ParlInfo line, with the related note", async () => {
    // r7534 with the draft's related link, as a bill in parliament carries it.
    const draft = view('au-federal-ed-online-safety-digital-duty-of-care-2026');
    mockParams.key = 'au-federal-r7534';
    jest.mocked(runtime.billFor).mockImplementation(async (key, refresh) => {
      const record = await fixture.billFor(key, refresh);
      return { ...record, data: { ...record.data, related: draft.related } };
    });
    const root = await render();
    const line = relatedLine(root);
    expect(line).toMatchObject({
      asOf: view('au-federal-r7534').identity.asAt,
      citation: 'ParlInfo',
    });
    // The page's originals, bill home included; the related section's own
    // link to the same record is not listed twice.
    expect(line.originals).toContainEqual(
      expect.objectContaining({
        label: 'Parliament of Australia',
        record: 'bill home',
      }),
    );
    const urls = (line.originals as { url: string }[]).map((o) => o.url);
    expect(new Set(urls).size).toBe(urls.length);
    expect(line.notes).toContain(
      'Relations between bills are as ParlInfo records them.',
    );
  });

  test('How it moved, last on the page, carries the page line once', async () => {
    mockParams.key = 'au-federal-r7534';
    jest.mocked(runtime.billFor).mockImplementation(async (key, refresh) => {
      const record = await fixture.billFor(key, refresh);
      const data = record.data;
      return {
        ...record,
        data: {
          ...data,
          related: [],
          became: null,
          acts: { ...data.acts, data: [] },
          speeches: { ...data.speeches, data: [] },
          divisions: {
            ...data.divisions,
            data: { ...data.divisions.data!, rows: [], rawRows: [] },
          },
        },
      };
    });
    const root = await render();
    const lines = root.findAllByType(SourceLine);
    const ids = lines.map((line) => line.props.testID);
    expect(ids).not.toContain('bill-dates-source');
    expect(ids.filter((id) => id === 'bill-source')).toHaveLength(1);
    const dates = host(root, 'bill-key-dates')[0]!.findAllByType(SourceLine);
    expect(dates.map((line) => line.props.testID)).toEqual(['bill-source']);
    // One line, at the foot of How it moved, and the last on the page.
    expect(ids.at(-1)).toBe('bill-source');
    const line = dates[0]!.props;
    expect(line.originals).toContainEqual(
      expect.objectContaining({ record: 'bill home' }),
    );
    expect(line.notes).toContain(
      'Most questions are decided on the voices, without a recorded vote.',
    );
    // The drawn words appear once on the page.
    const drawn = lines.map((l) => JSON.stringify(sourceLineParts(l.props)));
    expect(new Set(drawn).size).toBe(drawn.length);
  });

  test('a section line that reads differently keeps its own line', () => {
    const page = {
      asOf: '2026-09-17',
      citation: 'ParlInfo',
      originals: [{ label: 'Parliament of Australia', url: 'https://a' }],
      notes: ['Page note.'],
      licence: 'CC BY-NC-ND 4.0',
    };
    const dates = {
      asOf: '2026-09-17',
      citation: 'ParlInfo',
      originals: [
        { label: 'ParlInfo', url: 'https://a' },
        { label: 'ParlInfo', url: 'https://b' },
      ],
      notes: ['Section note.'],
    };
    expect(sameSourceLine(page, dates)).toBe(true);
    expect(sameSourceLine(page, { ...dates, asOf: '2026-09-18' })).toBe(false);
    expect(sameSourceLine(page, { ...dates, citation: 'Hansard' })).toBe(false);
    expect(shareSourceLine(page, dates)).toEqual({
      ...page,
      originals: [
        { label: 'Parliament of Australia', url: 'https://a' },
        { label: 'ParlInfo', url: 'https://b' },
      ],
      notes: ['Page note.', 'Section note.'],
    });
  });

  test('the foot section is the last one the page draws', () => {
    const base = view('au-federal-r7534');
    const bare = {
      ...base,
      related: [],
      became: null,
      acts: { ...base.acts, data: [] },
      speeches: { ...base.speeches, data: [] },
    };
    expect(footSection(bare, false)).toBe('dates');
    expect(footSection(bare, true)).toBe('votes');
    expect(
      footSection({ ...bare, keyDates: { ...bare.keyDates, data: [] } }, false),
    ).toBeNull();
    expect(footSection({ ...bare, became: 'au-federal-r1' }, true)).toBe(
      'related',
    );
  });

  test("an exposure draft's related bills cite the draft's own pages", async () => {
    mockParams.key = 'au-federal-ed-online-safety-digital-duty-of-care-2026';
    const root = await render();
    const line = relatedLine(root);
    expect(line.citation).toEqual(['Exposure draft', 'Consultation page']);
    expect((line.originals as { label: string }[]).map((o) => o.label)).toEqual(
      ['Exposure draft', 'Consultation page'],
    );
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

test.each(['ios', 'android'] as const)(
  '%s missing bill has a centred symbol, title, body and Search bills capsule',
  async (platform) => {
    jest.replaceProperty(Platform, 'OS', platform);
    mockParams.key = 'invalid-fixture-key';
    const root = await render();
    expect(root.findByType(Screen).props.centred).toBe(true);
    const state = root.findByType(ContentUnavailable);
    expect(state.props).toMatchObject({
      symbol: 'doc.text.magnifyingglass',
      title: 'Bill not found',
      body: 'This link may be old.',
      action: { label: 'Search bills' },
    });
    act(() => state.props.action.onPress());
    expect(router.push).toHaveBeenCalledWith(
      expect.objectContaining({ pathname: '/bill-list' }),
    );
  },
);
