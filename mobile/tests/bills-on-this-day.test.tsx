// On this day (delight round 3, record storytelling): a bill introduced on
// today's date in an earlier year, chosen by date alone, at the head of the
// Bills list. Invented bills prove the rule; the pinned register proves the
// row.
import { act } from 'react';
import { RefreshControl, useWindowDimensions } from 'react-native';
import TestRenderer, { type ReactTestInstance } from 'react-test-renderer';
import { billName } from '../src/api/bill-transforms';
import { Catalogs, type Bill } from '../src/api/catalogs';
import { catalogs as runtime } from '../src/api/runtime';
import BillsList from '../src/features/bills/BillsList';
import { ON_THIS_DAY_RULE, onThisDay } from '../src/features/bills/on-this-day';
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
  useSydneyDay: () => mockDay,
}));
let mockReduced = false;
jest.mock('../src/design/accessibility', () => ({
  ...jest.requireActual('../src/design/accessibility'),
  useReduceMotion: () => mockReduced,
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

describe('the day', () => {
  const { useSydneyDay } = jest.requireActual<
    typeof import('../src/features/bills/sydney-day')
  >('../src/features/bills/sydney-day');
  afterEach(() => jest.restoreAllMocks());

  test('is Sydney’s calendar day as the screen first saw it, for the whole visit', () => {
    const now = jest
      .spyOn(Date, 'now')
      // 13:30 UTC on 15 November is already the 16th in Sydney.
      .mockReturnValue(Date.UTC(2026, 10, 15, 13, 30));
    const seen: string[] = [];
    function Probe({ n }: { n: number }) {
      seen.push(`${n}:${useSydneyDay()}`);
      return null;
    }
    let r!: TestRenderer.ReactTestRenderer;
    act(() => {
      r = TestRenderer.create(<Probe n={1} />);
    });
    now.mockReturnValue(Date.UTC(2026, 10, 16, 13, 30));
    act(() => r.update(<Probe n={2} />));
    expect(seen.at(0)).toBe('1:2026-11-16');
    expect(seen.at(-1)).toBe('2:2026-11-16');
    act(() => r.unmount());
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
    mockReduced = false;
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

  test.each([
    ['with motion', false],
    ['under Reduce Motion', true],
  ])(
    'names the year, the bill and its introduction date as one link (%s)',
    async (_name, reduced) => {
      mockReduced = reduced;
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
    },
  );

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
    expect(before).toEqual(
      expect.arrayContaining(['bills-votes', 'bills-scope']),
    );
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
    expect(kept).toEqual(
      expect.arrayContaining(['bills-votes', 'bills-scope']),
    );
    for (const id of kept) expect(after.indexOf(id)).toBeLessThan(row);
    expect(after.indexOf('bills-count')).toBeLessThan(row);
    // Only bills follow it, and it has no height animation of its own.
    expect(after.slice(row + 1, firstBill)).toEqual([]);
    expect(after).not.toContain('bills-on-this-day');
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
