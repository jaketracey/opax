import { act } from 'react';
import { StyleSheet, useWindowDimensions } from 'react-native';
import TestRenderer, { type ReactTestInstance } from 'react-test-renderer';
import { router } from 'expo-router';
import { Catalogs } from '../src/api/catalogs';
import { catalogs as runtime } from '../src/api/runtime';
import { showMenu } from '../src/design/menu';
import { BillRow, Button, LinkRow, PartyLabel } from '../src/design/primitives';
import BillDetail, { rulerPoints } from '../src/features/bills/BillDetail';
import BillsList from '../src/features/bills/BillsList';
import { billTextRoute } from '../src/navigation/routes';
import { pinned, slugs } from './pinned';

// Design pass 5, lane C (bills): the bill header's actions (P1-3), the
// shared bill row (P2-8), a lapsed bill's last stop (P2-9), the list's
// controls before its first row (P2-19) and the ⋯ menu's copy (P3-12).
const mockParams: { key?: string; bill?: string } = {};
jest.mock('expo-router', () => ({
  useSegments: () => [],
  useLocalSearchParams: () => mockParams,
  router: { push: jest.fn(), setParams: jest.fn() },
  Stack: { Screen: () => null },
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
jest.mock('../src/design/menu', () => ({
  ...jest.requireActual('../src/design/menu'),
  showMenu: jest.fn(),
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
/** The smallest host view that holds every one of `ids`. */
function holder(root: ReactTestInstance, ids: readonly string[]) {
  const views = root.findAll(
    (node) =>
      node.type === 'View' && ids.every((id) => host(node, id).length > 0),
  );
  return views.at(-1)!;
}

describe('bill header (P1-3)', () => {
  test.each([
    ['iPhone 17 Pro', 402],
    ['iPhone 16e', 390],
  ])(
    'on the %s at Large: Follow and ⋯ alone on one row; the bill text is a row under the meta line',
    async (_device, width) => {
      window(width, 1);
      mockParams.key = 'au-federal-r7534';
      const root = await render(<BillDetail />);
      const actions = host(root, 'bill-actions')[0]!;
      expect(StyleSheet.flatten(actions.props.style).flexDirection).toBe('row');
      // Two controls only: nothing can push ⋯ onto a line of its own.
      expect(order(actions).slice(1)).toEqual(['bill-follow-off', 'bill-more']);
      const follow = root.find(
        (node) =>
          node.type === Button && node.props.testID === 'bill-follow-off',
      );
      expect(follow.props.on).toBe(false);
      expect(follow.props.variant).toBeUndefined();
      // No navy primary on the page's header.
      expect(
        root.findAll(
          (node) => node.type === Button && node.props.variant === 'primary',
        ),
      ).toHaveLength(0);
      // "Bill text" is a navigation row, directly under the meta line.
      const text = root.find(
        (node) =>
          node.type === LinkRow && node.props.testID === 'bill-read-text',
      );
      expect(text.props.title).toBe('Bill text');
      const ids = order(root);
      expect(ids.indexOf('bill-read-text')).toBe(
        ids.indexOf('bill-introduced') + 1,
      );
      expect(ids.indexOf('bill-actions')).toBeGreaterThan(
        ids.indexOf('bill-read-text'),
      );
      act(() => text.props.onPress());
      expect(router.push).toHaveBeenCalledWith(
        billTextRoute('au-federal-r7534'),
      );
    },
  );

  test('at accessibility sizes the actions stack', async () => {
    window(402, 3.571);
    mockParams.key = 'au-federal-r7534';
    const root = await render(<BillDetail />);
    const actions = host(root, 'bill-actions')[0]!;
    expect(StyleSheet.flatten(actions.props.style).flexDirection).toBe(
      'column',
    );
  });

  test('⋯ holds Ask about this and the bill on the Parliament website (P3-12)', async () => {
    mockParams.key = 'au-federal-r7534';
    const root = await render(<BillDetail />);
    const more = root.find(
      (node) =>
        node.props.testID === 'bill-more' &&
        typeof node.props.onPress === 'function',
    );
    act(() => more.props.onPress());
    const items = jest.mocked(showMenu).mock.calls[0]![1];
    expect(items.map((item) => item.title)).toEqual([
      'Ask about this',
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
  test('rows are the shared bill row: serif title, status and date, sponsor with a party label', async () => {
    const root = await render(<BillsList />);
    const rows = root.findAllByType(BillRow);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.props.testID).toMatch(/^bill-row-/);
      expect(row.props.dragPath).toBe(
        `/bill/${row.props.testID.slice('bill-row-'.length)}`,
      );
      // iPhone: rows push, so none is a split row.
      expect(row.props.selected).toBeUndefined();
    }
    // A sponsored bill names its party as a label, never as words in a line.
    // (Searching by sponsor brings the pinned Wilkie bill into the first page.)
    act(() => host(root, 'bills-search')[0]!.props.onChangeText('Wilkie'));
    act(() => host(root, 'bills-search')[0]!.props.onSubmitEditing());
    const wilkie = root.find(
      (node) =>
        node.type === BillRow &&
        node.props.testID === 'bill-row-au-federal-r6850',
    );
    expect(wilkie.props).toMatchObject({
      status: 'Lapsed',
      date: 'Introduced 14 Feb 2022',
      by: 'Andrew Wilkie',
      party: { party: 'Independent', status: 'unknown' },
      detail: 'House of Representatives',
    });
    expect(wilkie.findAllByType(PartyLabel)).toHaveLength(1);
    expect(wilkie.findAllByType(PartyLabel)[0]!.props.nested).toBe(true);
  });

  test.each([
    ['Large', 1, 'row'],
    ['AX5', 3.571, 'column'],
  ])(
    'at %s: Filters sits in the count line; the source line is at the foot',
    async (_size, fontScale, direction) => {
      window(402, fontScale);
      const root = await render(<BillsList />);
      const line = holder(root, ['bills-count', 'bills-filters']);
      expect(StyleSheet.flatten(line.props.style).flexDirection).toBe(
        direction,
      );
      const ids = order(root);
      const lastRow = ids.findLastIndex((id) => id.startsWith('bill-row-'));
      // The field, the count line (with Filters), Division history, rows.
      expect(ids.indexOf('bills-search')).toBeLessThan(
        ids.indexOf('bills-count'),
      );
      expect(ids.indexOf('bills-as-at')).toBeGreaterThan(lastRow);
      expect(ids.indexOf('bills-division-history')).toBeLessThan(
        ids.findIndex((id) => id.startsWith('bill-row-')),
      );
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
