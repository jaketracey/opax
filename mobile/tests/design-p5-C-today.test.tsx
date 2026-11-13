// Design pass 5, lane C: Today's bill rows (P2-8, P2-17), the feeds' own
// source lines (P2-3), declarations grouped by member with no clamp
// (P3-10), and the declarations list's first screen (P2-19, P3-9).
import { act, type ReactElement } from 'react';
import { SectionList, StyleSheet, useWindowDimensions } from 'react-native';
import TestRenderer, { type ReactTestInstance } from 'react-test-renderer';
import { catalogs as runtime } from '../src/api/runtime';
import {
  Catalogs,
  decodeRecentInterests,
  recentBillsFor,
  recentDeclarationsFor,
} from '../src/api/catalogs';
import { dataAsOf, type ApiClient, type RecordResult } from '../src/api/client';
import { SurfaceContext } from '../src/design/row-padding';
import { colors, rhythm } from '../src/design/tokens';
import { billDisplay } from '../src/api/bill-transforms';
import {
  BillRow,
  Button,
  PartyLabel,
  PersonRow,
  Text,
} from '../src/design/primitives';
import Declarations from '../src/features/declarations/Declarations';
import { FeedGroup } from '../src/features/declarations/FeedRow';
import { personRuns } from '../src/features/declarations/model';
import {
  BillFeed,
  BillsBlock,
  billRowText,
  sponsorPartyName,
} from '../src/features/today/BillFeed';
import {
  DeclarationGroup,
  DeclarationEntry,
  DeclarationsBlock,
} from '../src/features/today/DeclarationRow';
import { declarationsSources } from '../src/features/today/sources';
import { bills, catalogs as pinnedCatalogs, pinned, slugs } from './pinned';

jest.mock('../src/api/runtime', () => ({
  catalogs: {
    declarations: jest.fn(),
    todayDeclarationsProfiled: jest.fn(),
    todayBills: jest.fn(),
    todayDeclarations: jest.fn(),
  },
  portraits: { get: jest.fn(async () => null) },
}));
jest.mock('../src/api/image-policy', () => ({
  localImageURI: (uri: string) => uri,
  remoteImageURI: (path: string) => `http://127.0.0.1:8918${path}`,
}));
jest.mock('expo-router', () => {
  // Just declared entries open a native menu (Link.Menu) on touch and hold.
  const React = jest.requireActual('react');
  const Link = function Link({ children }: { children: unknown }) {
    return React.createElement(React.Fragment, null, children);
  };
  Link.Trigger = function Trigger({ children }: { children: unknown }) {
    return children;
  };
  Link.Preview = function Preview() {
    return null;
  };
  Link.Menu = function Menu() {
    return null;
  };
  Link.MenuAction = function MenuAction() {
    return null;
  };
  return {
    useLocalSearchParams: () => ({}),
    useSegments: () => [],
    router: { push: jest.fn(), navigate: jest.fn() },
    Stack: { Screen: () => null },
    Link,
  };
});
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: jest.fn(),
}));
const standard = { width: 402, height: 874, scale: 3, fontScale: 1 };
const ax5 = { ...standard, fontScale: 3.571 };

const recentBills = recentBillsFor(bills, 3);
const recent = decodeRecentInterests(pinned('/interests/recent.json'));
const recentDeclarations = recentDeclarationsFor(recent, 3, pinnedCatalogs);
const all = recentDeclarationsFor(recent, 300, pinnedCatalogs).data!;

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
// Whether a React element (not yet drawn) holds a test ID.
const holds = (node: unknown, testID: string): boolean => {
  if (Array.isArray(node)) return node.some((n) => holds(n, testID));
  if (!node || typeof node !== 'object' || !('props' in node)) return false;
  const props = (node as { props: Record<string, unknown> }).props;
  return props.testID === testID || holds(props.children, testID);
};
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
    expect(title.props.variant).toBe('rowRecord');
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
      expect(text.meta).toEqual({ sponsor: 'Jacqui Lambie', party: name });
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
  test('each feed is dated with its own date, in a line after its rows', async () => {
    mock.todayBills.mockResolvedValue(dated.bills);
    mock.todayDeclarations.mockResolvedValue(dated.declarations);
    mock.todayDeclarationsProfiled.mockResolvedValue(dated.declarations);
    const renderer = await renderAsync(
      <>
        <BillsBlock attempt={0} onRetry={() => {}} />
        <DeclarationsBlock attempt={0} onRetry={() => {}} />
      </>,
    );
    const root = renderer.root;
    expect(host(root, 'today-bills-sources')[0]!.props.accessibilityLabel).toBe(
      'Updated 17 Sep 2026, ParlInfo',
    );
    expect(
      host(root, 'today-declarations-sources')[0]!.props.accessibilityLabel,
    ).toMatch(/^Updated 4 Sep 2026, Registers of interests/);
    // Each line closes its block: rows first, then the line.
    const ids = order(root);
    expect(ids.indexOf('today-bills-sources')).toBeGreaterThan(
      ids.indexOf('today-bill-2'),
    );
    expect(ids.indexOf('today-declarations-sources')).toBeGreaterThan(
      ids.indexOf('today-declaration-2'),
    );
    act(() => renderer.unmount());
  });
  test('a feed’s sheet dates each source and lists each declaration’s register page', () => {
    const details = declarationsSources(dated.declarations);
    expect(details.asOf).toBe('2026-09-04');
    expect(details.citation).toEqual([
      expect.objectContaining({ asOf: '2026-09-04' }),
    ]);
    // Each register once, at the first entry's page.
    const registers = new Map<string, string>();
    for (const item of recentDeclarations.data!)
      if (!registers.has(item.sourceLabel))
        registers.set(item.sourceLabel, item.url);
    expect(details.originals!.map((o) => o.url)).toEqual([
      ...registers.values(),
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

describe('declaration identities in Today and the full feed', () => {
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
    'Today: one accessible link per entry; only the words clamp, at Large',
    (size) => {
      jest.mocked(useWindowDimensions).mockReturnValue(size);
      const { root } = render(<DeclarationGroup entries={run.entries} />);
      expect(root.findAllByType(PersonRow)).toHaveLength(0);
      expect(root.findAllByType(DeclarationEntry)).toHaveLength(
        run.entries.length,
      );
      // Names, party and meta are never clamped; an entry's words show three
      // lines at Large and in full at accessibility sizes.
      for (const node of root.findAll(
        (n) =>
          typeof n.type === 'string' && n.props.numberOfLines !== undefined,
      )) {
        expect(node.props.testID).toMatch(/^today-declaration-text-\d+$/);
        expect(node.props.numberOfLines).toBe(3);
        expect(size.fontScale).toBe(1);
      }
      for (const { item, index } of run.entries) {
        const entry = host(root, `today-declaration-${index}`)[0]!;
        expect(entry.props.accessibilityLabel).toContain(item.name);
        expect(entry.props.accessibilityLabel).toContain(item.category);
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
      // The member's words first; the PersonRow already said the name.
      expect(
        host(root, `declaration-entry-${index}`)[0]!.props.accessibilityLabel,
      ).toMatch(new RegExp(`${item.category}\\..*, Register of interests$`));
    }
  });
  test('Today’s Just declared renders one independent row per entry', async () => {
    mock.todayDeclarations.mockResolvedValue(recentDeclarations);
    mock.todayDeclarationsProfiled.mockResolvedValue(recentDeclarations);
    const renderer = await renderAsync(
      <DeclarationsBlock attempt={0} onRetry={() => {}} />,
    );
    const section = host(renderer.root, 'today-declarations')[0]!;
    expect(section.findAllByType(DeclarationEntry)).toHaveLength(
      recentDeclarations.data!.length,
    );
    expect(
      recentDeclarations.data!.map(
        (_, i) => host(section, `today-declaration-${i}`).length,
      ),
    ).toEqual(recentDeclarations.data!.map(() => 1));
    act(() => renderer.unmount());
  });
  test.each([standard, ax5])(
    'consecutive declarations have dividers at the content column and card edge padding',
    async (size) => {
      jest.mocked(useWindowDimensions).mockReturnValue(size);
      const item = recentDeclarations.data![0]!;
      const data = [item, { ...item, id: `${item.id}-next` }];
      const block = { ...recentDeclarations, data };
      mock.todayDeclarations.mockResolvedValue(block);
      mock.todayDeclarationsProfiled.mockResolvedValue(block);
      const renderer = await renderAsync(
        <SurfaceContext.Provider value="sunken">
          <DeclarationsBlock attempt={0} onRetry={() => {}} />
        </SurfaceContext.Provider>,
      );
      const group = host(renderer.root, 'today-declarations-group')[0]!;
      expect(group.findAllByType(DeclarationEntry)).toHaveLength(2);
      const dividers = group.findAll(
        (node) =>
          node.type === 'View' &&
          StyleSheet.flatten(node.props.style)?.backgroundColor ===
            colors.dividerSubtle,
      );
      expect(dividers).toHaveLength(1);
      expect(StyleSheet.flatten(dividers[0]!.props.style).marginLeft).toBe(
        size.fontScale === 1 ? 16 + 40 + rhythm.heading : 16,
      );
      for (let index = 0; index < data.length; index++) {
        const row = host(group, `today-declaration-${index}`)[0]!;
        const pressable = row.find(
          (node) =>
            node.type === 'View' &&
            node.props.accessible === false &&
            node.props.accessibilityRole === 'link',
        );
        expect(StyleSheet.flatten(pressable.props.style)).toMatchObject({
          paddingTop: rhythm.row,
          paddingBottom: rhythm.row + rhythm.heading,
          paddingHorizontal: 16,
          marginHorizontal: -16,
        });
      }
      act(() => renderer.unmount());
    },
  );
});

describe('the declarations list’s first screen (P2-19, P3-9; people.md 2.7)', () => {
  test.each([standard, ax5])(
    'nothing above the first row; weeks pin; the source line and count close the list',
    async (size) => {
      jest.mocked(useWindowDimensions).mockReturnValue(size);
      const renderer = await renderAsync(<Declarations />);
      const root = renderer.root;
      // No lede, field, count line or Filters capsule above the rows.
      for (const id of [
        'declarations-lede',
        'declarations-member',
        'declarations-count',
        'declarations-filters',
        'declarations-filter-line',
      ])
        expect(host(root, id)).toHaveLength(0);
      expect(
        root.findAllByType(Button).filter((b) => b.props.label === 'Filters'),
      ).toHaveLength(0);
      const list = root.findByType(SectionList);
      expect(list.props.stickySectionHeadersEnabled).toBe(true);
      const sections = list.props.sections as {
        title: string;
        data: ReturnType<typeof personRuns>;
      }[];
      for (const section of sections)
        expect(section.title).toMatch(
          /^(This week|Last week|Week of \d{1,2} [A-Z][a-z]+( \d{4})?)$/,
        );
      // Every row once, in order, under its week.
      expect(
        sections.flatMap((section) =>
          section.data.flatMap((run) => run.entries.map((e) => e.index)),
        ),
      ).toEqual(all.map((_, i) => i));
      // The source line is the list's foot, never between rows.
      expect(holds(list.props.ListFooterComponent, 'declarations-source')).toBe(
        true,
      );
      expect(
        sections.some((section) =>
          section.data.some((item, index) =>
            holds(
              list.props.renderItem({ item, index, section }),
              'declarations-source',
            ),
          ),
        ),
      ).toBe(false);
      act(() => renderer.unmount());
    },
  );
});

test('Today bill previews clamp titles to three lines and portfolio or sponsor metadata to one', () => {
  const { root } = render(<BillFeed bills={recentBills.data!} />);
  for (const row of root.findAllByType(BillRow)) {
    expect(row.props.preview).toBe(true);
    const title = row
      .findAllByType(Text)
      .find((node) => node.props.variant === 'rowRecord')!;
    expect(title.props).toMatchObject({
      numberOfLines: 3,
      ellipsizeMode: 'tail',
      wordSafe: false,
    });
    const meta = row
      .findAllByType(Text)
      .filter((node) => node.props.children === row.props.meta?.portfolio);
    for (const line of meta)
      expect(line.props).toMatchObject({
        numberOfLines: 1,
        ellipsizeMode: 'tail',
      });
  }
  const bill = billDisplay({
    ...bills.bills.find((b) => b.introduced)!,
    portfolio: null,
    sponsor: 'Taylor, Alex',
    sponsor_party: 'NATS',
  });
  const sponsored = render(<BillFeed bills={[bill]} />).root.findByType(
    PartyLabel,
  );
  expect(sponsored.props).toMatchObject({
    singleLine: true,
    prefix: 'Alex Taylor',
  });
  expect(
    sponsored
      .findAllByType(Text)
      .every((node) => node.props.numberOfLines === 1),
  ).toBe(true);
});

test('Bills rows outside Today keep their full titles and metadata', () => {
  const { root } = render(
    <BillRow
      title="A complete record title"
      status="Introduced"
      meta={{ portfolio: 'A complete portfolio name' }}
      menu={[]}
    />,
  );
  const lines = root.findAllByType(Text);
  expect(lines.every((node) => node.props.numberOfLines === undefined)).toBe(
    true,
  );
  expect(
    lines
      .filter((node) => ['rowRecord', 'secondary'].includes(node.props.variant))
      .every((node) => node.props.wordSafe),
  ).toBe(true);
});
