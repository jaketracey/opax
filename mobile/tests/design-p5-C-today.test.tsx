// Design pass 5, lane C: Today's bill rows (P2-8, P2-17), the feeds' own
// source lines (P2-3), declarations grouped by member with no clamp
// (P3-10), and the declarations list's first screen (P2-19, P3-9).
import { act, type ReactElement } from 'react';
import { useWindowDimensions } from 'react-native';
import TestRenderer, { type ReactTestInstance } from 'react-test-renderer';
import snapshot from '../scripts/fixture-snapshot.json';
import { catalogs as runtime } from '../src/api/runtime';
import {
  Catalogs,
  decodeEdition,
  decodeRecentInterests,
  editionFor,
  recentBillsFor,
  recentDeclarationsFor,
} from '../src/api/catalogs';
import { dataAsOf, type ApiClient, type RecordResult } from '../src/api/client';
import { billDisplay } from '../src/api/bill-transforms';
import { editionPath } from '../src/api/policy';
import {
  BillRow,
  Button,
  PartyLabel,
  PersonRow,
  SourceLine,
  Text,
} from '../src/design/primitives';
import Today from '../src/features/Today';
import Declarations from '../src/features/declarations/Declarations';
import { FeedGroup } from '../src/features/declarations/FeedRow';
import { personRuns } from '../src/features/declarations/model';
import {
  BillFeed,
  billRowText,
  sponsorPartyName,
} from '../src/features/today/BillFeed';
import { DeclarationGroup } from '../src/features/today/DeclarationRow';
import {
  declarationsSources,
  editionSources,
} from '../src/features/today/sources';
import { responseBytes } from './fixture-bytes';
import { bills, catalogs as pinnedCatalogs, pinned, slugs } from './pinned';

jest.mock('../src/api/runtime', () => ({
  catalogs: {
    declarations: jest.fn(),
    today: jest.fn(),
    todayEdition: jest.fn(),
  },
  portraits: { get: jest.fn(async () => null) },
}));
jest.mock('../src/api/image-policy', () => ({
  localImageURI: (uri: string) => uri,
  remoteImageURI: (path: string) => `http://127.0.0.1:8918${path}`,
}));
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({}),
  router: { push: jest.fn(), navigate: jest.fn() },
  Stack: { Screen: () => null },
}));
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: jest.fn(),
}));
const standard = { width: 402, height: 874, scale: 3, fontScale: 1 };
const ax5 = { ...standard, fontScale: 3.571 };

const recentBills = recentBillsFor(bills, 6);
const recent = decodeRecentInterests(pinned('/interests/recent.json'));
const recentDeclarations = recentDeclarationsFor(recent, 6, pinnedCatalogs);
const all = recentDeclarationsFor(recent, 300, pinnedCatalogs).data!;
const edition = editionFor(
  decodeEdition(JSON.parse(responseBytes(snapshot, editionPath).toString())),
);

// A catalog client over the pinned files.
function fixture() {
  const client: Pick<ApiClient, 'get'> = {
    async get<T>(
      path: string,
      decode: (input: unknown) => T,
    ): Promise<RecordResult<T>> {
      const raw = path === '/api/person-slugs' ? slugs : pinned(path);
      return {
        data: decode(raw),
        asOf: dataAsOf(raw),
        stale: false,
        savedAt: 200,
      };
    },
  };
  return new Catalogs(client);
}
const mock = jest.mocked(runtime);
beforeEach(() => {
  jest.mocked(useWindowDimensions).mockReturnValue(standard);
  const catalogs = fixture();
  mock.declarations.mockImplementation((refresh) =>
    catalogs.declarations(refresh),
  );
});

function render(element: ReactElement) {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(element);
  });
  return renderer;
}
async function renderAsync(element: ReactElement) {
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(element);
  });
  return renderer;
}
const host = (root: ReactTestInstance, testID: string) =>
  root.findAll(
    (node) => typeof node.type === 'string' && node.props.testID === testID,
  );
const strings = (node: ReactTestInstance): string =>
  node
    .findAll((n) => n.type === 'Text')
    .flatMap((n) =>
      ([] as unknown[])
        .concat(n.props.children)
        .filter((c): c is string => typeof c === 'string'),
    )
    .join(' ');
// Host test IDs in drawing order.
const order = (root: ReactTestInstance) =>
  root
    .findAll((n) => typeof n.type === 'string' && !!n.props.testID)
    .map((n) => n.props.testID as string);

describe('Today’s bill rows (P2-8, P2-17)', () => {
  // A sponsored bill from the pinned index, with the party as a code.
  const sponsored = (code: string) =>
    billDisplay({
      ...bills.bills.find((b) => b.introduced)!,
      portfolio: null,
      sponsor: 'Lambie, Jacqui',
      sponsor_party: code,
    });
  test('draw the shared BillRow, keeping each row’s test ID', () => {
    const { root } = render(<BillFeed bills={recentBills.data!} />);
    const rows = root.findAllByType(BillRow);
    expect(rows.map((row) => row.props.testID)).toEqual(
      recentBills.data!.map((_, i) => `today-bill-${i}`),
    );
    // The serif title role, as on Bills.
    const title = root.find(
      (n) => n.type === Text && n.props.testID === 'today-bill-0-title',
    );
    expect(title.props.variant).toBe('subheading');
  });
  test.each([
    ['JLN', 'Jacqui Lambie Network'],
    ['NATS', 'Nationals'],
    ['Nationals', 'Nationals'],
  ])(
    'a sponsor’s party %s reads as a dot and its name, never a bare code',
    (code, name) => {
      const bill = sponsored(code);
      expect(sponsorPartyName(bill.sponsor_party)).toBe(name);
      const text = billRowText(bill);
      expect(text.by).toBe('Jacqui Lambie');
      expect(text.party).toEqual({ party: name, status: 'unknown' });
      const { root } = render(<BillFeed bills={[bill]} />);
      const label = root.findByType(PartyLabel);
      expect(label.props).toMatchObject({ party: name, nested: true });
      const row = host(root, 'today-bill-0')[0]!;
      expect(strings(row)).not.toMatch(/·\s*(JLN|NATS)\b|\bJLN\b|\bNATS\b/);
      expect(row.props.accessibilityLabel).toMatch(
        new RegExp(`Jacqui Lambie, ${name}$`),
      );
    },
  );
  test('a government bill names its portfolio and no party', () => {
    const bill = recentBills.data!.find((b) => b.portfolio)!;
    const { root } = render(<BillFeed bills={[bill]} />);
    expect(root.findAllByType(PartyLabel)).toHaveLength(0);
    expect(billRowText(bill).label).toContain(`${bill.portfolio} portfolio`);
  });
});

describe('Today’s feeds each carry their own source line (P2-3)', () => {
  const dated = {
    bills: { ...recentBills, asAt: '2026-09-17T08:00:00Z' },
    declarations: { ...recentDeclarations, asAt: '2026-09-04' },
  };
  test('each feed is dated with its own date; the foot carries the edition', async () => {
    mock.today.mockResolvedValue(dated);
    mock.todayEdition.mockResolvedValue(edition);
    const renderer = await renderAsync(<Today />);
    const root = renderer.root;
    expect(host(root, 'today-bills-as-at')[0]!.props.accessibilityLabel).toBe(
      'Updated 17 Sep 2026, ParlInfo bill records',
    );
    expect(
      host(root, 'today-declarations-as-at')[0]!.props.accessibilityLabel,
    ).toMatch(/^Updated 4 Sep 2026, /);
    expect(host(root, 'today-sources')[0]!.props.accessibilityLabel).toBe(
      'Updated 4 Oct 2026, OPAX daily edition',
    );
    // Each line closes its block: rows first, then the line.
    const ids = order(root);
    expect(ids.indexOf('today-bills-as-at')).toBeGreaterThan(
      ids.indexOf('today-bill-5'),
    );
    expect(ids.indexOf('today-declarations-as-at')).toBeGreaterThan(
      ids.indexOf('today-declaration-5'),
    );
    act(() => renderer.unmount());
  });
  test('a feed’s sheet dates each source and lists each declaration’s register page', () => {
    const details = declarationsSources(dated.declarations);
    expect(details.asOf).toBe('2026-09-04');
    expect(details.citation).toEqual([
      expect.objectContaining({ asOf: '2026-09-04' }),
    ]);
    expect(details.originals!.map((o) => o.url)).toEqual(
      recentDeclarations.data!.map((item) => item.url),
    );
    expect(editionSources(edition.data!).citation).toEqual([
      { label: 'OPAX daily edition', asOf: '2026-10-04' },
    ]);
  });
  test('a saved feed says so in its own line', () => {
    const savedAt = Date.parse('2026-10-03T01:00:00Z');
    const details = declarationsSources({
      ...recentDeclarations,
      stale: true,
      savedAt,
    });
    expect(details).toMatchObject({ state: 'saved', savedAt });
  });
});

describe('declarations by one member sit under one PersonRow (P3-10)', () => {
  test('consecutive entries by one person make one run, in order', () => {
    const runs = personRuns(all);
    expect(runs.flatMap((run) => run.entries.map((e) => e.index))).toEqual(
      all.map((_, i) => i),
    );
    expect(runs.length).toBeLessThan(all.length);
    for (const run of runs)
      expect(new Set(run.entries.map((e) => e.item.name)).size).toBe(1);
    for (let i = 1; i < runs.length; i++)
      expect(runs[i]!.entries[0]!.item.name).not.toBe(
        runs[i - 1]!.entries[0]!.item.name,
      );
  });
  const run = personRuns(all).find((r) => r.entries.length > 1)!;
  test.each([standard, ax5])(
    'Today: one PersonRow, then one element per entry, never clamped',
    (size) => {
      jest.mocked(useWindowDimensions).mockReturnValue(size);
      const { root } = render(<DeclarationGroup entries={run.entries} />);
      expect(root.findAllByType(PersonRow)).toHaveLength(1);
      expect(
        root.findAll((n) => n.props.numberOfLines !== undefined),
      ).toHaveLength(0);
      for (const { item, index } of run.entries) {
        const entry = host(root, `today-declaration-${index}`)[0]!;
        expect(entry.props.accessibilityLabel).toMatch(
          new RegExp(`^${item.name}, ${item.category}, `),
        );
      }
    },
  );
  test('the feed: one PersonRow opening the profile, every entry in full', () => {
    const open = jest.fn();
    const { root } = render(
      <FeedGroup entries={run.entries} onOpenPerson={open} />,
    );
    expect(root.findAllByType(PersonRow)).toHaveLength(1);
    const first = run.entries[0]!.index;
    act(() => root.findByType(PersonRow).props.onPress());
    expect(open).toHaveBeenCalledTimes(1);
    expect(host(root, `declaration-person-${first}`)).toHaveLength(1);
    for (const { item, index } of run.entries) {
      expect(host(root, `declaration-person-${index}`)).toHaveLength(
        index === first ? 1 : 0,
      );
      if (item.description)
        expect(strings(host(root, `declaration-text-${index}`)[0]!)).toBe(
          item.description,
        );
      expect(
        host(root, `declaration-entry-${index}`)[0]!.props.accessibilityLabel,
      ).toMatch(new RegExp(`^${item.name}, `));
    }
  });
  test('Today’s Just declared groups its rows the same way', async () => {
    const runs = personRuns(recentDeclarations.data!);
    mock.today.mockResolvedValue({
      bills: recentBills,
      declarations: recentDeclarations,
    });
    mock.todayEdition.mockResolvedValue(edition);
    const renderer = await renderAsync(<Today />);
    const section = host(renderer.root, 'today-declarations')[0]!;
    expect(section.findAllByType(PersonRow)).toHaveLength(runs.length);
    expect(
      recentDeclarations.data!.map(
        (_, i) => host(section, `today-declaration-${i}`).length,
      ),
    ).toEqual(recentDeclarations.data!.map(() => 1));
    act(() => renderer.unmount());
  });
});

describe('the declarations list’s first screen (P2-19, P3-9)', () => {
  test.each([standard, ax5])(
    'the count line is the Filters control, and the source line is at the list’s foot',
    async (size) => {
      jest.mocked(useWindowDimensions).mockReturnValue(size);
      const renderer = await renderAsync(<Declarations />);
      const root = renderer.root;
      const filters = root.find(
        (n) =>
          n.props.testID === 'declarations-filters' &&
          typeof n.props.onPress === 'function',
      );
      // No separate Filters button beside a caption.
      expect(
        root.findAllByType(Button).filter((b) => b.props.label === 'Filters'),
      ).toHaveLength(0);
      expect(
        filters.findAll(
          (n) =>
            typeof n.type === 'string' &&
            n.props.testID === 'declarations-count',
        ),
      ).toHaveLength(1);
      expect(host(root, 'declarations-filters')[0]!.props).toMatchObject({
        accessibilityRole: 'button',
        accessibilityLabel:
          '300 declarations · All chambers · Federal, Filters',
      });
      const ids = order(root);
      expect(ids.indexOf('declarations-source')).toBeGreaterThan(
        ids.indexOf('declaration-person-0'),
      );
      expect(ids.indexOf('declarations-source')).toBeGreaterThan(
        ids.indexOf('declarations-filters'),
      );
      expect(root.findAllByType(SourceLine)).toHaveLength(1);
      act(() => renderer.unmount());
    },
  );
});
