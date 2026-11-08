import { act } from 'react';
import { StyleSheet, useWindowDimensions } from 'react-native';
import TestRenderer, { type ReactTestInstance } from 'react-test-renderer';
import { router } from 'expo-router';
import { Catalogs } from '../src/api/catalogs';
import { catalogs as runtime } from '../src/api/runtime';
import {
  BillRow,
  Button,
  FollowButton,
  LinkRow,
  PartyLabel,
} from '../src/design/primitives';
import { SegmentedPicker } from '../src/design/controls';
import BillDetail, { rulerPoints } from '../src/features/bills/BillDetail';
import BillsList from '../src/features/bills/BillsList';
import { billTextRoute } from '../src/navigation/routes';
import { pinned, slugs } from './pinned';

// Design pass 5, lane C (bills): the bill header's actions (P1-3), the
// shared bill row (P2-8), a lapsed bill's last stop (P2-9), the list's
// controls before its first row (P2-19) and the ⋯ menu's copy (P3-12).
const mockParams: { key?: string; bill?: string; scope?: string; q?: string } =
  {};
// Every Stack.Screen's options, newest last: the bar's items live there.
const mockScreens: Record<string, unknown>[] = [];
jest.mock('expo-router', () => ({
  useSegments: () => [],
  useLocalSearchParams: () => mockParams,
  router: { push: jest.fn(), setParams: jest.fn() },
  useNavigation: () => ({ setParams: jest.fn() }),
  useIsFocused: () => true,
  // The bill page's bottom toolbar, and rows that link through Link.
  Stack: {
    Screen: ({ options }: { options?: Record<string, unknown> }) => {
      if (options) mockScreens.push(options);
      return null;
    },
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
    bills: jest.fn(),
    billFor: jest.fn(),
    roster: jest.fn(),
    slugs: jest.fn(),
    directory: jest.fn(),
  },
}));
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: jest.fn(),
}));

const fixture = new Catalogs({
  get: async (path, decode) => ({
    data: decode(path === '/api/person-slugs' ? slugs : pinned(path)),
    stale: false,
    savedAt: 1000,
    asOf: null,
  }),
});
const mock = jest.mocked(runtime);
const window = (width: number, fontScale: number) =>
  jest
    .mocked(useWindowDimensions)
    .mockReturnValue({ width, height: 874, scale: 3, fontScale });
beforeEach(() => {
  jest.clearAllMocks();
  delete mockParams.key;
  delete mockParams.bill;
  delete mockParams.scope;
  delete mockParams.q;
  mockScreens.length = 0;
  window(402, 1);
  mock.bills.mockImplementation((refresh) => fixture.bills(refresh));
  mock.billFor.mockImplementation((key, refresh) =>
    fixture.billFor(key, refresh),
  );
  mock.roster.mockImplementation(() => fixture.roster());
  mock.slugs.mockImplementation(() => fixture.slugs());
  mock.directory.mockRejectedValue(new Error('not in this test'));
});

const mounted: TestRenderer.ReactTestRenderer[] = [];
afterEach(() => {
  act(() => mounted.splice(0).forEach((tree) => tree.unmount()));
});
async function render(element: React.ReactElement) {
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(element);
  });
  mounted.push(renderer);
  return renderer.root;
}
const host = (root: ReactTestInstance, testID: string) =>
  root.findAll(
    (node) => typeof node.type === 'string' && node.props.testID === testID,
  );
/** Host testIDs in the order they draw. */
const order = (root: ReactTestInstance) =>
  root
    .findAll(
      (node) =>
        typeof node.type === 'string' && typeof node.props.testID === 'string',
    )
    .map((node) => node.props.testID as string);
const texts = (root: ReactTestInstance): string[] =>
  root.children.flatMap((child) =>
    typeof child === 'string' ? [child] : texts(child),
  );
/** The bar's trailing items, from the newest Stack.Screen options. */
function barItems() {
  const options = mockScreens.findLast(
    (o) => typeof o.unstable_headerRightItems === 'function',
  );
  return (
    options!.unstable_headerRightItems as () => {
      type: string;
      label: string;
      menu?: { items: { label: string }[] };
    }[]
  )();
}

describe('bill header (P1-3)', () => {
  // At accessibility sizes the shared Button takes the column's width, so
  // Follow hugs only below them (Follow-up: FollowToggle, specs/bills.md 4.5).
  test.each([
    ['iPhone 17 Pro', 402, 1],
    ['iPhone 16e', 390, 1],
    ['iPhone 17 Pro at AX5', 402, 3.571],
  ])(
    'on the %s: Follow has no ⋯ beside it; the bill text is a row after the header',
    async (_device, width, fontScale) => {
      window(width, fontScale);
      mockParams.key = 'au-federal-r7534';
      const root = await render(<BillDetail />);
      // The menus live in the bar; nothing in the content sits beside Follow.
      expect(host(root, 'bill-more')).toHaveLength(0);
      expect(host(root, 'bill-actions')).toHaveLength(0);
      const follow = root.findByType(FollowButton);
      expect(follow.props.testID).toBe('bill-follow');
      if (fontScale === 1) {
        const button = follow.find(
          (node) =>
            typeof node.type === 'string' &&
            node.props.testID === 'bill-follow-off',
        );
        const style = StyleSheet.flatten(
          typeof button.props.style === 'function'
            ? button.props.style({ pressed: false })
            : button.props.style,
        );
        expect(style.alignSelf).toBe('flex-start');
      }
      // No navy primary on the page's header.
      expect(
        root.findAll(
          (node) => node.type === Button && node.props.variant === 'primary',
        ),
      ).toHaveLength(0);
      // "Bill text" is a navigation row, after the header's source line.
      const text = root.find(
        (node) =>
          node.type === LinkRow && node.props.testID === 'bill-read-text',
      );
      expect(text.props.title).toBe('Bill text');
      const ids = order(root);
      expect(ids.indexOf('bill-read-text')).toBeGreaterThan(
        ids.indexOf('bill-source'),
      );
      act(() => text.props.onPress());
      expect(router.push).toHaveBeenCalledWith(
        billTextRoute('au-federal-r7534'),
      );
    },
  );

  test("the bar's ⋯ holds the links; Ask and Share are the toolbar (P3-12)", async () => {
    mockParams.key = 'au-federal-r7534';
    await render(<BillDetail />);
    const menu = barItems().find((item) => item.type === 'menu')!;
    expect(menu.menu!.items.map((item) => item.label)).toEqual([
      'Copy link',
      'Open on the Parliament website',
      'Open on opax.com.au',
    ]);
  });
});

describe('how it moved: a terminal status names the last stop (P2-9)', () => {
  const entries = (last: string) => [
    {
      from: '2023-02-13',
      to: null,
      stages: [{ stage: 'Introduced', house: 'representatives', days: 1 }],
    },
    {
      from: '2023-09-05',
      to: null,
      stages: [{ stage: last, house: null, days: 1 }],
    },
  ];
  const lastLabel = (stage: string, status: string | null) =>
    rulerPoints(entries(stage), status).at(-1)!.label;

  test.each([
    ['lapsed', 'Lapsed'],
    ['withdrawn', 'Withdrawn'],
    ['negatived', 'Negatived'],
    ['not_proceeded_with', 'Not proceeded with'],
    ['discharged', 'Discharged'],
  ])('"Other" on a %s bill reads "%s"', (status, word) => {
    expect(lastLabel('Other', status)).toBe(word);
  });

  test('a bill still moving, or one that passed, keeps the recorded stage', () => {
    expect(lastLabel('Other', 'before_parliament')).toBe('Other');
    expect(lastLabel('Other', 'passed')).toBe('Other');
    expect(lastLabel('Other', null)).toBe('Other');
    // Only "Other" is renamed: a named stage is the record's own word.
    expect(lastLabel('Second reading', 'lapsed')).toBe('Second reading');
  });

  test('the first stop and its date stay as recorded', () => {
    const points = rulerPoints(entries('Other'), 'lapsed');
    expect(points[0]).toMatchObject({
      label: 'Introduced',
      date: '2023-02-13',
    });
    expect(points.at(-1)).toMatchObject({
      label: 'Lapsed',
      date: '2023-09-05',
    });
  });

  test('a pinned lapsed bill whose register ends on "other" says Lapsed', async () => {
    mockParams.key = 'au-federal-r6850';
    const root = await render(<BillDetail />);
    const ruler = host(root, 'bill-dates-ruler')[0]!;
    expect(ruler.props.accessibilityLabel).toMatch(/; Lapsed, \d+ \w+ \d{4}$/);
    expect(ruler.props.accessibilityLabel).not.toMatch(/Other/);
    expect(texts(ruler)).toContain('Lapsed');
  });
});

describe('Bills list (P2-8, P2-19)', () => {
  test('rows are the shared bill row: serif title, status and its dated event, sponsor with a party label', async () => {
    mockParams.scope = 'all';
    mockParams.q = 'Wilkie';
    const root = await render(<BillsList pushed />);
    const rows = root.findAllByType(BillRow);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.props.testID).toMatch(/^bill-row-/);
      // iPhone: rows push, so none is a split row.
      expect(row.props.selected).toBeUndefined();
    }
    const wilkie = root.find(
      (node) =>
        node.type === BillRow &&
        node.props.testID === 'bill-row-au-federal-r6850',
    );
    expect(wilkie.props).toMatchObject({
      status: 'Lapsed',
      showStatus: true,
      meta: { sponsor: 'Andrew Wilkie', party: 'Independent' },
    });
    // The row never names the chamber.
    expect(texts(wilkie).join(' ')).not.toMatch(/House of Representatives/);
    expect(wilkie.findAllByType(PartyLabel)).toHaveLength(1);
  });

  test.each([
    ['Large', 1],
    ['AX5', 3.571],
  ])(
    'at %s: Votes in parliament and the scope come before the rows; Filters is in the bar; the source line is at the foot',
    async (_size, fontScale) => {
      window(402, fontScale);
      const root = await render(<BillsList />);
      const ids = order(root);
      const firstRow = ids.findIndex((id) => id.startsWith('bill-row-'));
      const lastRow = ids.findLastIndex((id) => id.startsWith('bill-row-'));
      expect(firstRow).toBeGreaterThan(-1);
      expect(ids.indexOf('bills-votes')).toBeLessThan(
        ids.indexOf('bills-count'),
      );
      expect(ids.indexOf('bills-count')).toBeLessThan(firstRow);
      expect(ids.indexOf('bills-as-at')).toBeGreaterThan(lastRow);
      expect(host(root, 'bills-filters')).toHaveLength(0);
      expect(barItems().map((item) => item.label)).toContain('Filters');
    },
  );

  test.each([
    ['segments that do not fit', 1],
    ['AX5', 3.571],
  ])(
    'with %s the scope is one "Showing" menu row, never a label beside a button',
    async (_case, fontScale) => {
      window(402, fontScale);
      const root = await render(<BillsList />);
      // The hidden probe measures each segment's label; make them too wide.
      const segments = root.findByType(SegmentedPicker);
      const probe = segments.parent!.findAll(
        (node) =>
          typeof node.type === 'string' &&
          node.props.accessibilityElementsHidden === true,
      )[0]!;
      await act(async () => {
        for (const text of probe.findAll(
          (node) =>
            typeof node.type === 'string' &&
            typeof node.props.onTextLayout === 'function',
        ))
          text.props.onTextLayout({ nativeEvent: { lines: [{ width: 400 }] } });
        segments.parent!.props.onLayout({
          nativeEvent: { layout: { width: 370 } },
        });
      });
      const scope = root.findAll(
        (node) =>
          typeof node.type !== 'string' &&
          node.props.testID === 'bills-scope' &&
          node.props.label === 'Showing',
      );
      expect(scope.length).toBeGreaterThan(0);
      expect(scope.every((node) => node.props.row === true)).toBe(true);
      // "Showing" is said once, by the row itself.
      const inside = new Set(scope.flatMap((node) => node.findAll(() => true)));
      const outside = root.findAll(
        (node) =>
          !inside.has(node) &&
          !scope.includes(node) &&
          typeof node.type === 'string' &&
          node.children.includes('Showing'),
      );
      expect(outside).toHaveLength(0);
    },
  );

  test('the iPhone never opens a bill on its own', async () => {
    const root = await render(<BillsList />);
    expect(root.findAllByType(BillRow).length).toBeGreaterThan(0);
    expect(router.setParams).not.toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalled();
  });
});

describe('party codes on bill rows (P2-17)', () => {
  test('a recorded code is drawn and said as the party name', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { partyFromCode } = require('../src/features/bills/party-codes');
    expect(partyFromCode('JLN')).toBe('Jacqui Lambie Network');
    expect(partyFromCode(' nats ')).toBe('Nationals');
    expect(partyFromCode('Labor')).toBe('Labor');
    expect(partyFromCode('')).toBeNull();
    expect(partyFromCode(null)).toBeNull();
  });
});
