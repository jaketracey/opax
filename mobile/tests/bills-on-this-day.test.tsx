// On this day (delight round 3, record storytelling): a bill introduced on
// today's date in an earlier year, chosen by date alone, at the head of the
// Bills list. Invented bills prove the rule; the pinned register proves the
// row.
import { act, Profiler } from 'react';
import {
  AppState,
  RefreshControl,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import { NavigationContext } from 'expo-router/react-navigation';
import TestRenderer, { type ReactTestInstance } from 'react-test-renderer';
import { billName } from '../src/api/bill-transforms';
import { Catalogs, type Bill } from '../src/api/catalogs';
import { catalogs as runtime } from '../src/api/runtime';
import BillsList from '../src/features/bills/BillsList';
import {
  ON_THIS_DAY_RULE,
  onThisDay,
  shortBillName,
  titleBudget,
} from '../src/features/bills/on-this-day';
import { OnThisDayRow } from '../src/features/bills/OnThisDay';
import { SegmentedPicker } from '../src/design/controls';
import { formatDate } from '../src/design/format';
import * as sheets from '../src/navigation/sheets';
import { withNavigationOptions } from './navigation-options';
import { bills as pinnedBills, pinned, slugs } from './pinned';

const mockParams: { q?: string } = {};
jest.mock('expo-router', () => ({
  useIsPreview: () => false,
  useSegments: () => [],
  useLocalSearchParams: () => mockParams,
  router: { push: jest.fn(), setParams: jest.fn() },
  useNavigation: () => ({ setParams: jest.fn() }),
  useIsFocused: () => true,
  Stack: { Screen: () => null },
  Link: Object.assign(({ children }: { children?: unknown }) => children, {
    Trigger: ({ children }: { children?: unknown }) => children,
    Preview: () => null,
    Menu: () => null,
    MenuAction: () => null,
  }),
}));
jest.mock('../src/api/runtime', () => ({
  catalogs: {
    bills: jest.fn(),
    billFor: jest.fn(),
    billIndexRow: () => null,
    roster: jest.fn(),
    slugs: jest.fn(),
    directory: jest.fn(),
  },
}));
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: jest.fn(),
}));
let mockDay = '2026-11-15';
jest.mock('../src/features/bills/sydney-day', () => ({
  currentSydneyDay: () => mockDay,
}));

const invented = (key: string, introduced: string | null): Bill =>
  ({
    key,
    title: `Invented ${key} Bill`,
    short_title: null,
    introduced,
  }) as unknown as Bill;

describe('the rule', () => {
  const register = [
    invented('au-federal-r10', '2019-11-15'),
    invented('au-federal-r9', '2019-11-15'),
    invented('au-federal-s2', '2014-11-15'),
    invented('au-federal-r70', '2026-11-15'),
    invented('au-federal-r71', '2021-11-14'),
    invented('au-federal-r72', null),
  ];

  test('only this date, only earlier years, in the order introduced', () => {
    // 2026 mod 3 candidates = 1: the second in date then register order.
    expect(onThisDay(register, '2026-11-15')).toEqual({
      bill: register[1],
      year: 2019,
      date: '2019-11-15',
    });
  });

  test('several bills take turns year by year, each in its turn', () => {
    const turns = [2026, 2027, 2028].map(
      (year) => onThisDay(register, `${year}-11-15`)!.bill.key,
    );
    // 2026 itself is a candidate from 2027 on (four candidates).
    expect(turns).toEqual(['au-federal-r9', 'au-federal-r70', 'au-federal-s2']);
    const six = [0, 1, 2].map(
      (n) => onThisDay(register.slice(0, 3), `${2040 + n}-11-15`)!.bill.key,
    );
    expect(new Set(six).size).toBe(3);
  });

  test('the same day always gives the same bill, whatever order the register lists them in', () => {
    const reversed = [...register].reverse();
    expect(onThisDay(reversed, '2026-11-15')).toEqual(
      onThisDay(register, '2026-11-15'),
    );
  });

  test('no bill on this date in an earlier year: nothing', () => {
    expect(onThisDay(register, '2026-11-16')).toBeNull();
    expect(onThisDay(register, '2019-11-15')).toEqual({
      bill: register[2],
      year: 2014,
      date: '2014-11-15',
    });
    expect(onThisDay(register, '2014-11-15')).toBeNull();
    expect(onThisDay([], '2026-11-15')).toBeNull();
    expect(onThisDay(null, '2026-11-15')).toBeNull();
    expect(onThisDay(register, 'not a day')).toBeNull();
  });

  test('29 February matches only 29 February', () => {
    const leap = [invented('au-federal-r1', '2024-02-29')];
    expect(onThisDay(leap, '2028-02-29')?.year).toBe(2024);
    expect(onThisDay(leap, '2027-02-28')).toBeNull();
    expect(onThisDay(leap, '2027-03-01')).toBeNull();
  });

  test('the rule sheet names the source and no person or party', () => {
    expect(ON_THIS_DAY_RULE).toContain('ParlInfo');
    expect(ON_THIS_DAY_RULE).not.toMatch(/—|most|top|best/i);
  });
});

describe('a long name keeps its year (sweep 78)', () => {
  const long =
    'Australian Research Council Amendment (Ensuring Research Independence) Bill 2018';

  test('it is shortened in the middle, at a whole word, never at its end', () => {
    expect(shortBillName(long, 54)).toBe(
      'Australian Research Council Amendment… Bill 2018',
    );
    for (const budget of [24, 30, 40, 54, 60, 70, 78]) {
      const short = shortBillName(long, budget);
      expect(short.endsWith('Bill 2018')).toBe(true);
      expect(short.length).toBeLessThanOrEqual(Math.max(budget, 31));
      // Whole words only before the ellipsis, and nothing left hanging.
      const head = short.split('…')[0]!;
      expect(long.startsWith(head)).toBe(true);
      expect(long.charAt(head.length)).toBe(' ');
      expect(head).not.toMatch(/[\s,(\[]$/);
    }
  });

  test('a name that fits, or has no year at its end, is left alone', () => {
    expect(shortBillName(long, 80)).toBe(long);
    expect(shortBillName('Housing Bill 2026', 10)).toBe('Housing… Bill 2026');
    const noYear =
      'A very long name for a bill that carries no year at its end';
    expect(shortBillName(noYear, 20)).toBe(noYear);
  });

  test.each([
    [
      'Treasury Laws Amendment (Fairer for Families and Farmers) Bill (No. 2) 2024',
      'Bill (No. 2) 2024',
    ],
    [
      'Social Security and Other Legislation Amendment (Responding to Robodebt) Bill 2025 [No. 2]',
      'Bill 2025 [No. 2]',
    ],
    [
      'Interactive Gambling Amendment (Cost Recovery and Other Measures) Act 2026',
      'Act 2026',
    ],
  ])('%s keeps "%s"', (name, end) => {
    const short = shortBillName(name, 44);
    expect(short).toContain('… ');
    expect(short.endsWith(end)).toBe(true);
  });

  test('the budget is two generous lines of the row, and shrinks as text grows', () => {
    // 402 pt window: 284 pt of title at 0.6 em a character is 27 a line.
    expect(titleBudget(402, 1, 17)).toBe(54);
    expect(titleBudget(402, 1.353, 17)).toBeLessThan(titleBudget(402, 1, 17));
    expect(titleBudget(320, 1.353, 17)).toBeGreaterThanOrEqual(24);
  });

  const pick = {
    bill: {
      key: 'au-federal-r6222',
      title: long,
      short_title: null,
      introduced: '2018-11-15',
    } as unknown as Bill,
    year: 2018,
    date: '2018-11-15',
  };
  const drawnRow = (fontScale: number) => {
    jest
      .mocked(useWindowDimensions)
      .mockReturnValue({ width: 402, height: 874, scale: 3, fontScale });
    let r!: TestRenderer.ReactTestRenderer;
    act(() => {
      r = TestRenderer.create(<OnThisDayRow pick={pick} />);
    });
    const row = r.root.find(
      (node) =>
        typeof node.type === 'string' &&
        node.props.testID === 'bills-on-this-day-row',
    );
    const json = JSON.stringify(r.toJSON());
    const label = row.props.accessibilityLabel as string;
    act(() => r.unmount());
    return { json, label };
  };

  test('at the default size the row draws the name with its year, and VoiceOver hears all of it', () => {
    const { json, label } = drawnRow(1);
    expect(json).toContain('Australian Research Council Amendment… Bill 2018');
    // The whole name is only in the spoken label, never drawn.
    expect(json.split(long).length - 1).toBe(1);
    expect(label).toContain(long);
  });

  test('at AX3 the title is not clamped, so the whole name is drawn', () => {
    const { json, label } = drawnRow(2.643);
    expect(json).toContain(long);
    expect(json).not.toContain('…');
    expect(label).toContain(long);
  });
});

describe('the day', () => {
  const { currentSydneyDay } = jest.requireActual<
    typeof import('../src/features/bills/sydney-day')
  >('../src/features/bills/sydney-day');
  afterEach(() => jest.restoreAllMocks());

  test('is Sydney’s calendar day at the moment it is read', () => {
    const now = jest
      .spyOn(Date, 'now')
      // 13:30 UTC on 15 November is already the 16th in Sydney.
      .mockReturnValue(Date.UTC(2026, 10, 15, 13, 30));
    expect(currentSydneyDay()).toBe('2026-11-16');
    now.mockReturnValue(Date.UTC(2026, 10, 16, 13, 30));
    expect(currentSydneyDay()).toBe('2026-11-17');
  });
});

describe('the row on Bills', () => {
  const fixture = new Catalogs({
    get: async (path, decode) => ({
      data: decode(path === '/api/person-slugs' ? slugs : pinned(path)),
      stale: false,
      savedAt: 1000,
      asOf: null,
    }),
  });
  const mock = jest.mocked(runtime);
  // A date the pinned register has a bill for, read one year on.
  const source = pinnedBills.bills.find((b) => b.introduced)!;
  const dayWithBill = `${Number(source.introduced!.slice(0, 4)) + 1}${source.introduced!.slice(4, 10)}`;
  const mounted: TestRenderer.ReactTestRenderer[] = [];
  beforeEach(() => {
    jest.clearAllMocks();
    delete mockParams.q;
    mockDay = dayWithBill;
    jest
      .mocked(useWindowDimensions)
      .mockReturnValue({ width: 402, height: 874, scale: 3, fontScale: 1 });
    mock.bills.mockImplementation((refresh) => fixture.bills(refresh));
  });
  afterEach(() => {
    act(() => mounted.splice(0).forEach((tree) => tree.unmount()));
  });
  async function render() {
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        withNavigationOptions(<BillsList />, () => {}),
      );
    });
    mounted.push(renderer);
    return renderer.root;
  }
  const rows = (root: ReactTestInstance) =>
    root.findAll(
      (node) =>
        typeof node.type === 'string' &&
        node.props.testID === 'bills-on-this-day-row',
    );

  test('names the year, the bill and its introduction date as one link', async () => {
    const root = await render();
    const pick = onThisDay(pinnedBills.bills, dayWithBill)!;
    const [row] = rows(root);
    expect(row).toBeDefined();
    expect(row!.props.accessibilityRole).toBe('link');
    expect(row!.props.accessibilityLabel).toBe(
      `On this day in ${pick.year}, ${billName(pick.bill)}, introduced ${formatDate(pick.date)}`,
    );
    expect(row!.props.accessibilityHint).toBe('Opens the bill');
    expect(pick.date.slice(4)).toBe(dayWithBill.slice(4));
  });

  test('the long-press menu explains the rule', async () => {
    const present = jest
      .spyOn(sheets, 'presentSheet')
      .mockImplementation(() => undefined as never);
    const root = await render();
    const menu = root.find(
      (node) =>
        Array.isArray(node.props.menu) &&
        node.props.menu[0]?.title === 'How this is chosen',
    );
    act(() => menu.props.menu[0].onPress());
    expect(present).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'rule', rule: ON_THIS_DAY_RULE }),
    );
  });

  test('a date with no earlier bill draws no row', async () => {
    mockDay = '2026-01-01';
    expect(onThisDay(pinnedBills.bills, mockDay)).toBeNull();
    const root = await render();
    expect(rows(root)).toHaveLength(0);
  });

  const texts = (node: ReactTestInstance): string =>
    node.children
      .map((child) => (typeof child === 'string' ? child : texts(child)))
      .join('');
  const ids = (root: ReactTestInstance) =>
    root
      .findAll(
        (node) =>
          typeof node.type === 'string' &&
          typeof node.props.testID === 'string',
      )
      .map((node) => node.props.testID as string);

  test('it arrives in the frame the bills first draw, below everything already on screen', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    mock.bills.mockImplementation(async (refresh) => {
      await gate;
      return fixture.bills(refresh);
    });
    const root = await render();
    // Before the register answers: the header's controls, no row, no bills.
    const before = ids(root);
    expect(before).toContain('bills-votes');
    // The scope control is already drawn, and is what must not move.
    expect(root.findAllByType(SegmentedPicker)).toHaveLength(1);
    expect(before).not.toContain('bills-on-this-day-row');
    expect(before.some((id) => id.startsWith('bill-row-'))).toBe(false);
    await act(async () => {
      release();
    });
    await act(async () => {});
    const after = ids(root);
    const row = after.indexOf('bills-on-this-day-row');
    const firstBill = after.findIndex((id) => id.startsWith('bill-row-'));
    expect(row).toBeGreaterThan(-1);
    expect(firstBill).toBeGreaterThan(row);
    // Everything drawn before the data is still above the row: it was
    // inserted over nothing the reader could already see.
    const kept = before.filter((id) => after.includes(id));
    expect(kept).toContain('bills-votes');
    for (const id of kept) expect(after.indexOf(id)).toBeLessThan(row);
    const drawn = root.findAll(() => true);
    expect(drawn.indexOf(root.findByType(SegmentedPicker))).toBeLessThan(
      drawn.indexOf(rows(root)[0]!),
    );
    expect(after.indexOf('bills-count')).toBeLessThan(row);
    // It has no height animation of its own.
    expect(after).not.toContain('bills-on-this-day');
  });

  test('the first commit that draws a bill already has the row: nothing lands above the bills later', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    mock.bills.mockImplementation(async (refresh) => {
      await gate;
      return fixture.bills(refresh);
    });
    // What is on screen at each commit, read in the commit itself.
    const commits: string[][] = [];
    let renderer: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      renderer = TestRenderer.create(
        <Profiler
          id="bills"
          onRender={() => {
            if (renderer) commits.push(ids(renderer.root));
          }}
        >
          {withNavigationOptions(<BillsList />, () => {})}
        </Profiler>,
      );
    });
    mounted.push(renderer!);
    await act(async () => {
      release();
    });
    await act(async () => {});
    const hasBill = (commit: string[]) =>
      commit.some((id) => id.startsWith('bill-row-'));
    const first = commits.find(hasBill);
    expect(first).toBeDefined();
    // Commits before it drew no bill, so there was nothing to push down.
    expect(commits.slice(0, commits.indexOf(first!)).some(hasBill)).toBe(false);
    expect(first).toContain('bills-on-this-day-row');
    expect(first!.indexOf('bills-on-this-day-row')).toBeLessThan(
      first!.findIndex((id) => id.startsWith('bill-row-')),
    );
  });

  test.each([
    ['the default size', 1],
    ['AX5', 3.571],
  ])(
    'at %s the row whose day has passed lays out exactly as it did: both lines hold their space, and only which one is seen differs',
    (_name, fontScale) => {
      jest
        .mocked(useWindowDimensions)
        .mockReturnValue({ width: 402, height: 874, scale: 3, fontScale });
      const pick = onThisDay(pinnedBills.bills, dayWithBill)!;
      type Json = TestRenderer.ReactTestRendererJSON;
      const drawn = (passed: boolean) => {
        let r!: TestRenderer.ReactTestRenderer;
        act(() => {
          r = TestRenderer.create(<OnThisDayRow pick={pick} passed={passed} />);
        });
        mounted.push(r);
        return r.toJSON() as Json;
      };
      const layers = ['bills-on-this-day-kicker', 'bills-on-this-day-date'];
      // What takes part in layout: everything but the two layers' opacity.
      const seen: Record<string, boolean> = {};
      const cells: Json[] = [];
      const laidOut = (node: Json | string): Json | string => {
        if (typeof node === 'string') return node;
        const { accessibilityLabel: _label, ...props } = node.props;
        const style = { ...StyleSheet.flatten(props.style) };
        if (layers.includes(props.testID)) {
          seen[props.testID] = style.opacity !== 0;
          delete style.opacity;
          // In the layout, never lifted out of it: its lines make room.
          expect(style.position).toBeUndefined();
          expect(style.width).toBe('100%');
          expect(style.flexShrink).toBe(0);
        }
        if (
          node.children?.some(
            (child) =>
              typeof child !== 'string' && layers.includes(child.props.testID),
          )
        )
          cells.push(node);
        return {
          ...node,
          props: { ...props, style },
          children: node.children?.map(laidOut) ?? null,
        };
      };
      const fresh = laidOut(drawn(false));
      expect(seen).toEqual({
        'bills-on-this-day-kicker': true,
        'bills-on-this-day-date': false,
      });
      const passed = laidOut(drawn(true));
      expect(seen).toEqual({
        'bills-on-this-day-kicker': false,
        'bills-on-this-day-date': true,
      });
      // As text: handlers are new functions on every render.
      expect(JSON.stringify(passed)).toBe(JSON.stringify(fresh));
      // One cell holds both lines, the date laid back over the first line,
      // so the cell is as tall as whichever needs more lines.
      expect(cells).toHaveLength(2);
      for (const cell of cells) {
        expect(StyleSheet.flatten(cell.props.style)).toMatchObject({
          flexDirection: 'row',
          alignItems: 'flex-start',
        });
        const [first, second] = cell.children as Json[];
        expect(first!.props.testID).toBe('bills-on-this-day-kicker');
        expect(second!.props.testID).toBe('bills-on-this-day-date');
        expect(StyleSheet.flatten(second!.props.style).marginLeft).toBe(
          '-100%',
        );
        expect(
          StyleSheet.flatten(first!.props.style).marginLeft,
        ).toBeUndefined();
      }
      expect(JSON.stringify(passed)).toContain(`On this day in ${pick.year}`);
      expect(JSON.stringify(fresh)).toContain(formatDate(pick.date));
    },
  );

  describe('a list left mounted into a new day', () => {
    // A second date the pinned register has a different bill for.
    const other = pinnedBills.bills.find(
      (b) =>
        b.introduced && b.introduced.slice(5, 10) !== dayWithBill.slice(5, 10),
    )!;
    const nextDay = `${Number(other.introduced!.slice(0, 4)) + 1}${other.introduced!.slice(4, 10)}`;
    const label = (root: ReactTestInstance) =>
      rows(root)[0]?.props.accessibilityLabel as string | undefined;
    const labelFor = (day: string) => {
      const pick = onThisDay(pinnedBills.bills, day)!;
      return `On this day in ${pick.year}, ${billName(pick.bill)}, introduced ${formatDate(pick.date)}`;
    };
    let listeners: Record<string, (() => void)[]>;
    let appHandlers: ((state: string) => void)[];
    let appRemoved: number;
    let removed: number;
    let focused: boolean;
    // Other parts of the list listen to the app state too: tell them all.
    const appChange = (state: string) =>
      appHandlers.forEach((handler) => handler(state));
    async function renderWatched() {
      listeners = {};
      removed = 0;
      focused = true;
      appHandlers = [];
      appRemoved = 0;
      jest.spyOn(AppState, 'addEventListener').mockImplementation(((
        _type: string,
        handler: (state: string) => void,
      ) => {
        appHandlers.push(handler);
        return {
          remove: () => {
            appRemoved++;
          },
        };
      }) as never);
      const navigation = {
        setOptions: () => {},
        getState: () => ({ index: 0, routes: [{ key: 'r', name: 'index' }] }),
        isFocused: () => focused,
        addListener: (type: string, handler: () => void) => {
          (listeners[type] ??= []).push(handler);
          return () => {
            removed++;
          };
        },
        removeListener: () => {},
      };
      let renderer!: TestRenderer.ReactTestRenderer;
      await act(async () => {
        renderer = TestRenderer.create(
          <NavigationContext.Provider value={navigation as never}>
            <BillsList />
          </NavigationContext.Provider>,
        );
      });
      mounted.push(renderer);
      return renderer;
    }
    const emit = (type: string) =>
      act(() => listeners[type]!.forEach((handler) => handler()));
    afterEach(() => jest.restoreAllMocks());

    test('the two days name different bills', () => {
      expect(labelFor(nextDay)).not.toBe(labelFor(dayWithBill));
    });

    const title = (root: ReactTestInstance) =>
      label(root)?.replace(/^On this day in \d{4}, /, '');
    const part = (root: ReactTestInstance, id: string) =>
      root.findAll(
        (node) => typeof node.type === 'string' && node.props.testID === id,
      );
    /** Whether a layer of the row's top line is the one the reader sees. */
    const shown = (root: ReactTestInstance, id: string) =>
      StyleSheet.flatten(part(root, id)[0]!.props.style).opacity !== 0;
    // Every way the list hears about the world while it has the focus.
    const whileFocused: [string, () => void][] = [
      ['a refresh', () => {}],
      ['the screen takes focus again', () => emit('focus')],
      ['the app returns', () => act(() => appChange('active'))],
      [
        'the app goes to the background',
        () => act(() => appChange('background')),
      ],
      ['Control Centre covers it', () => act(() => appChange('inactive'))],
    ];

    test.each(whileFocused)(
      'in front of the reader, %s on a new day never changes the bill or moves the list',
      async (_name, event) => {
        const r = await renderWatched();
        const before = ids(r.root);
        const bill = title(r.root);
        expect(label(r.root)).toBe(labelFor(dayWithBill));
        mockDay = nextDay;
        await act(async () => {
          r.root.findByType(RefreshControl).props.onRefresh();
        });
        await act(async () => {});
        event();
        // The same bill, in the same place, with the same things around it.
        expect(title(r.root)).toBe(bill);
        // The date was laid out all along, so nothing is added or removed.
        expect(ids(r.root)).toEqual(before);
      },
    );

    test.each(whileFocused)(
      'in front of the reader, %s on a day with no bill never takes the row away',
      async (_name, event) => {
        const r = await renderWatched();
        mockDay = '2026-01-01';
        event();
        expect(rows(r.root)).toHaveLength(1);
      },
    );

    test.each([
      ['the screen takes focus again', () => emit('focus')],
      ['the app returns', () => act(() => appChange('active'))],
    ])(
      'when %s on a new day, the row stops saying "On this day" and gives the bill’s date',
      async (_name, event) => {
        const r = await renderWatched();
        const pick = onThisDay(pinnedBills.bills, dayWithBill)!;
        expect(shown(r.root, 'bills-on-this-day-date')).toBe(false);
        expect(shown(r.root, 'bills-on-this-day-kicker')).toBe(true);
        mockDay = nextDay;
        event();
        expect(label(r.root)).toBe(
          `${billName(pick.bill)}, introduced ${formatDate(pick.date)}`,
        );
        const [date] = part(r.root, 'bills-on-this-day-date');
        expect(texts(date!)).toBe(formatDate(pick.date));
        expect(shown(r.root, 'bills-on-this-day-date')).toBe(true);
        expect(shown(r.root, 'bills-on-this-day-kicker')).toBe(false);
        // The next blur chooses again, and the row is today's once more.
        focused = false;
        emit('blur');
        expect(label(r.root)).toBe(labelFor(nextDay));
        expect(shown(r.root, 'bills-on-this-day-date')).toBe(false);
      },
    );

    test.each([
      ['the screen blurs', () => emit('blur')],
      [
        'the app goes to the background behind another screen',
        () => act(() => appChange('background')),
      ],
      [
        'the app returns behind another screen',
        () => act(() => appChange('active')),
      ],
    ])(
      'out of sight, when %s on a new day, it chooses again',
      async (_name, hide) => {
        const r = await renderWatched();
        focused = false;
        // Out of sight on the same day: nothing to change.
        hide();
        expect(label(r.root)).toBe(labelFor(dayWithBill));
        mockDay = nextDay;
        hide();
        expect(label(r.root)).toBe(labelFor(nextDay));
      },
    );

    test('out of sight, a new day with no earlier bill takes the row away', async () => {
      const r = await renderWatched();
      mockDay = '2026-01-01';
      focused = false;
      emit('blur');
      expect(rows(r.root)).toHaveLength(0);
    });

    test('unmounting stops listening', async () => {
      const r = await renderWatched();
      act(() => r.unmount());
      mounted.length = 0;
      // Blur and focus, and every app-state listener.
      expect(listeners.blur?.length).toBeGreaterThan(0);
      expect(listeners.focus?.length).toBeGreaterThan(0);
      expect(removed).toBe(listeners.blur!.length + listeners.focus!.length);
      expect(appHandlers.length).toBeGreaterThan(0);
      expect(appRemoved).toBe(appHandlers.length);
    });
  });

  test('it is never inserted, or taken away, after the list has drawn', async () => {
    mockDay = '2026-01-01';
    const without = await render();
    expect(rows(without)).toHaveLength(0);
    const settled = ids(without);
    mockDay = dayWithBill;
    await act(async () => {
      without.findByType(RefreshControl).props.onRefresh();
    });
    await act(async () => {});
    expect(mock.bills).toHaveBeenCalledTimes(2);
    expect(rows(without)).toHaveLength(0);
    expect(ids(without)).toEqual(settled);

    const withRow = await render();
    expect(rows(withRow)).toHaveLength(1);
    mockDay = '2026-01-01';
    await act(async () => {
      withRow.findByType(RefreshControl).props.onRefresh();
    });
    await act(async () => {});
    expect(rows(withRow)).toHaveLength(1);
  });

  test('a search hides it, as it hides Votes in parliament', async () => {
    mockParams.q = 'bill';
    const root = await render();
    expect(rows(root)).toHaveLength(0);
  });
});
