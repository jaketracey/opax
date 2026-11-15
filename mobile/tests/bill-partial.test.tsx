// Build 80, review round 1: a bill that lost one of its sub-records (the
// tolerant decoder) must say so. Its source lines read "partial" and their
// sheets carry the standard note, and its status pill rests on the bill's
// own status alone, never on what is left of an incomplete record.
import { act } from 'react';
import { useWindowDimensions } from 'react-native';
import TestRenderer, { type ReactTestInstance } from 'react-test-renderer';
import { billEnding, billStatusLabel } from '../src/api/bill-status';
import { Catalogs, decodeBill } from '../src/api/catalogs';
import { catalogs as runtime } from '../src/api/runtime';
import { billFor } from '../src/api/selectors';
import { isPartialCatalog } from '../src/api/validation';
import { SourceLine } from '../src/design/source';
import BillDetail from '../src/features/bills/BillDetail';
import { partialNote } from '../src/features/CatalogNotice';
import { withNavigationOptions } from './navigation-options';
import { bills as index, pinned, slugs } from './pinned';

const mockParams: { key?: string } = {};
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

const KEY = 'au-federal-r7534';
type Raw = Record<string, unknown> & {
  key_dates: Record<string, unknown>[];
  divisions: Record<string, unknown>[];
};
/** A lapsed bill whose record shows it lost its second reading on a count. */
function votedDown(): Raw {
  const bill = structuredClone(pinned(`/bills/${KEY}.json`)) as Raw;
  bill.status = 'lapsed';
  bill.status_as_of = '2026-03-04';
  delete bill.ended;
  delete bill.ended_label;
  bill.acts = [];
  bill.key_dates = [
    {
      stage: 'Introduced',
      date: '2026-03-02',
      house: 'representatives',
      url: null,
    },
    {
      stage: 'Second reading',
      date: '2026-03-04',
      house: 'representatives',
      url: null,
    },
  ];
  bill.divisions = [
    {
      ...bill.divisions[0]!,
      date: '2026-03-04',
      house: 'representatives',
      stage: 'Second reading',
      question: 'That the bill be read a second time.',
      outcome: 'negative',
    },
  ];
  return bill;
}

let served: Raw;
const fixture = new Catalogs({
  // As the client does: a decode that dropped rows is a partial record.
  get: async (path, decode) => {
    const data = decode(
      path === '/api/person-slugs'
        ? slugs
        : path === `/bills/${KEY}.json`
          ? served
          : pinned(path),
    );
    return {
      data,
      ...(isPartialCatalog(data) ? { partial: true } : {}),
      stale: false,
      savedAt: 1000,
      asOf: null,
    };
  },
});
const mock = jest.mocked(runtime);
const mounted: TestRenderer.ReactTestRenderer[] = [];
beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  mockParams.key = KEY;
  jest
    .mocked(useWindowDimensions)
    .mockReturnValue({ width: 402, height: 874, scale: 3, fontScale: 1 });
  mock.bills.mockImplementation((refresh) => fixture.bills(refresh));
  mock.billFor.mockImplementation((key, refresh) =>
    fixture.billFor(key, refresh),
  );
  mock.roster.mockImplementation(() => fixture.roster());
  mock.slugs.mockImplementation(() => fixture.slugs());
  mock.directory.mockRejectedValue(new Error('not in this test'));
});
afterEach(() => {
  act(() => mounted.splice(0).forEach((tree) => tree.unmount()));
  jest.restoreAllMocks();
});
async function open(bill: Raw) {
  served = bill;
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(
      withNavigationOptions(<BillDetail />, () => {}),
    );
  });
  await act(async () => {});
  mounted.push(renderer);
  return renderer.root;
}
const lines = (root: ReactTestInstance) =>
  root.findAllByType(SourceLine).map((line) => ({
    id: line.props.testID as string,
    state: (line.props.state ?? null) as string | null,
    notes: ((line.props.notes ?? []) as unknown[]).filter(Boolean),
  }));
const texts = (node: ReactTestInstance): string[] =>
  node.children.flatMap((child) =>
    typeof child === 'string' ? [child] : texts(child),
  );
/** The pill's word: the first text in the status block. */
const pill = (root: ReactTestInstance) =>
  texts(
    root.find(
      (node) =>
        typeof node.type === 'string' && node.props.testID === 'bill-status',
    ),
  )[0];

describe('the status pill', () => {
  test('the whole record says the bill was voted down', () => {
    const whole = decodeBill(votedDown());
    expect(isPartialCatalog(whole)).toBe(false);
    expect(billFor(whole, index).identity.data!.statusLabel).toBe('Voted down');
  });

  test.each([
    [
      'a stage',
      (bill: Raw) => bill.key_dates.push({ stage: '', date: 'never' }),
    ],
    ['a division', (bill: Raw) => bill.divisions.push({ key: null })],
  ])(
    'with %s dropped it rests on the bill’s own status, as in every list row',
    (_name, damage) => {
      const bill = votedDown();
      damage(bill);
      const partial = decodeBill(bill);
      expect(isPartialCatalog(partial)).toBe(true);
      const own = billStatusLabel(partial.status, billEnding(partial));
      expect(own).not.toBe('Voted down');
      expect(billFor(partial, index).identity.data!.statusLabel).toBe(own);
    },
  );

  test('a dropped speech or source leaves the stages and votes whole, and the pill as it was', () => {
    const bill = votedDown();
    (bill.speeches as unknown[]).push({ slug: '' });
    const partial = decodeBill(bill);
    expect(isPartialCatalog(partial)).toBe(true);
    expect(billFor(partial, index).identity.data!.statusLabel).toBe(
      'Voted down',
    );
  });
});

describe('the bill page', () => {
  test('a whole bill has no partial line and no note', async () => {
    const root = await open(votedDown());
    const drawn = lines(root);
    expect(drawn.length).toBeGreaterThan(1);
    expect(drawn.filter((line) => line.state === 'partial')).toEqual([]);
    expect(drawn.filter((line) => line.notes.includes(partialNote))).toEqual(
      [],
    );
    expect(pill(root)).toBe('Voted down');
  });

  const hostTexts = (root: ReactTestInstance, id: string) =>
    root
      .findAll(
        (node) => typeof node.type === 'string' && node.props.testID === id,
      )
      .flatMap(texts);

  test('the lapsed bill with one division dropped: the pill, its date and the stages all rest on the bill’s own status', async () => {
    const bill = votedDown();
    bill.divisions.push({ ...bill.divisions[0]!, key: 'x', ayes: 'many' });
    const root = await open(bill);
    const own = billStatusLabel('lapsed', billEnding(decodeBill(votedDown())));
    // "[Lapsed] Voted down 4 Mar 2026" was the disagreement: the pill gated,
    // its date still read from the incomplete record.
    const status = hostTexts(root, 'bill-status').join(' ');
    expect(pill(root)).toBe(own);
    expect(status).not.toMatch(/Voted down/);
    expect(status).toMatch(/Status\sas\sat/);
    // The tracker, which would stop on "voted down", steps aside for the
    // plain dated stages; nothing on the page says the bill was voted down.
    expect(hostTexts(root, 'bill-tracker')).toEqual([]);
    expect(texts(root).join(' ')).not.toMatch(/voted down/i);
    // The stages that were read are still listed.
    expect(hostTexts(root, 'bill-key-dates').join(' ')).toMatch(
      /Second reading/,
    );
  });

  test('the whole lapsed bill does say it, in all three places', async () => {
    const root = await open(votedDown());
    const status = hostTexts(root, 'bill-status').join(' ');
    expect(pill(root)).toBe('Voted down');
    expect(status).not.toMatch(/Status\sas\sat/);
    expect(hostTexts(root, 'bill-tracker').join(' ')).toMatch(/voted down/i);
  });

  const partialLines = (root: ReactTestInstance) =>
    lines(root)
      .filter((line) => line.state === 'partial')
      .map((line) => line.id);
  const noted = (root: ReactTestInstance) =>
    lines(root)
      .filter((line) => line.notes.includes(partialNote))
      .map((line) => line.id);

  test('a dropped division marks the votes line alone, with the standard note once', async () => {
    const bill = votedDown();
    bill.divisions.push({ ...bill.divisions[0]!, key: 'x', ayes: 'many' });
    const root = await open(bill);
    expect(partialLines(root)).toEqual(['bill-divisions-source']);
    expect(noted(root)).toEqual(['bill-divisions-source']);
    const votes = lines(root).find(
      (line) => line.id === 'bill-divisions-source',
    )!;
    expect(votes.notes.filter((note) => note === partialNote)).toHaveLength(1);
    // The good division is still on the page: its original is cited.
    const cited = root
      .findAllByType(SourceLine)
      .find((line) => line.props.testID === 'bill-divisions-source')!.props
      .originals as { url: string }[];
    expect(cited.map((original) => original.url)).toEqual([
      bill.divisions[0]!.url,
    ]);
  });

  test('a dropped stage marks the stages line alone', async () => {
    const bill = votedDown();
    bill.key_dates.push({ stage: '', date: 'never' });
    const root = await open(bill);
    const marked = partialLines(root);
    expect(marked).toHaveLength(1);
    expect(marked).toEqual(noted(root));
    // The stages line, or the page's line when it carries the stages' sheet.
    expect(['bill-dates-source', 'bill-source']).toContain(marked[0]);
    expect(marked).not.toContain('bill-divisions-source');
  });

  test('a dropped speech marks the speeches line alone, and changes nothing else', async () => {
    const bill = votedDown();
    (bill.speeches as unknown[]).push({ slug: '' });
    const root = await open(bill);
    expect(partialLines(root)).toEqual(['bill-speeches-source']);
    expect(pill(root)).toBe('Voted down');
  });
});
