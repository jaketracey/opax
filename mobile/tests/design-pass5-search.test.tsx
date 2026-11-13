import { withNavigationOptions } from './navigation-options';
import { expectPublicSiteAction } from './more-menu-web';
// Design pass 5, lane A, carried into the four-scope Search
// (journeys/search.md 3.4 to 3.6). P1-1: once a query is answered nothing
// asks again (no Kind, no submit pill): the scope control and the count
// line are all that sit above the first result, Filters and ⋯ are bar items
// on Speeches only, and Summarise sits after the third result. P2-11: the
// results' source line names the records' own sources, dated. P3-12: idle
// draws no Refresh, and a cut passage ends in one ellipsis.
import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import { catalogs, recordSearch } from '../src/api/runtime';
import { SearchScreen } from '../src/features/search/SearchScreen';
import { ScopeBar } from '../src/features/search/ScopeBar';
import { ResultsHeader } from '../src/features/search/ResultsHeader';
import { resetSearchSession } from '../src/features/search/requests';
import { resultSources } from '../src/features/search/speeches';
import { oneEllipsis } from '../src/features/search/Excerpt';
import { decodeRecords } from '../src/features/search/decoders';
import { memberSuggestionRoster } from '../src/api/catalog-search';
import records from '../scripts/fixtures/search/records.json';
import { bills, index, roster, people, manifest, slugs } from './pinned';
import { menuTitle } from '../src/design/menu-title';

jest.mock('../src/api/runtime', () => ({
  recordSearch: { search: jest.fn(), summary: jest.fn() },
  catalogs: {
    suggestionSources: jest.fn(),
    suggestionSourcesOnFocus: jest.fn(),
    search: jest.fn(),
  },
}));
const mockBar: { options?: Record<string, any> } = {};
jest.mock('expo-router', () => {
  const React = jest.requireActual('react');
  return {
    Link: Object.assign(({ children }: { children: unknown }) => children, {
      Trigger: ({ children }: { children: unknown }) => children,
      Preview: () => null,
      Menu: () => null,
      MenuAction: () => null,
    }),
    router: { push: jest.fn(), navigate: jest.fn() },
    useSegments: () => [],
    useLocalSearchParams: () => ({}),
    useFocusEffect: (effect: () => void) => React.useEffect(effect, [effect]),
    Stack: {
      Screen: ({ options }: { options?: Record<string, any> }) => {
        if (options?.headerSearchBarOptions) mockBar.options = options;
        return null;
      },
    },
  };
});

const farrell = records.find((r) => r.slug === 'speech-828012')!;
const speeches = records.filter((r) => r.kind === 'speech').slice(0, 5);
function page(rows = speeches) {
  return {
    data: decodeRecords({
      query: 'housing',
      kind: 'speech',
      sort: 'relevance',
      page: 1,
      per_page: 20,
      page_count: 1,
      total: rows.length,
      count: rows.length,
      truncated: false,
      results: rows.map((r) => ({ ...r, href: `/doc/${r.slug}` })),
      years: {},
    }),
    stale: false,
    savedAt: 1,
    asOf: null,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  resetSearchSession();
  const source = { stale: false, savedAt: 1, asAt: null, sources: [] };
  jest.mocked(catalogs.suggestionSourcesOnFocus).mockResolvedValue({
    roster: memberSuggestionRoster(roster, { roster, manifest, slugs, people }),
    people,
    manifest,
    slugs,
    electorates: index,
    bills,
    provenance: { people: source, electorates: source, bills: source },
  } as never);
  jest.mocked(recordSearch.search).mockResolvedValue(page() as never);
});

const ids = (renderer: TestRenderer.ReactTestRenderer) =>
  renderer.root
    .findAll((n) => typeof n.props?.testID === 'string')
    .map((n) => n.props.testID as string);
const bar = () => mockBar.options!;
const items = () =>
  (bar().unstable_headerRightItems?.() ?? []) as {
    label: string;
    menu?: {
      items: {
        label: string;
        onPress?: () => void;
        items?: { label: string }[];
      }[];
    };
  }[];

async function submitted(q = 'housing') {
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(
      withNavigationOptions(<SearchScreen />, (options) => {
        if (options.headerSearchBarOptions) mockBar.options = options;
      }),
    );
  });
  await act(async () =>
    bar().headerSearchBarOptions.onSearchButtonPress({
      nativeEvent: { text: q },
    }),
  );
  return renderer;
}

test('an answered search stops asking: the scope control and count line head the results', async () => {
  const renderer = await submitted();
  expect(ids(renderer)).not.toContain('search-submit');
  expect(ids(renderer)).not.toContain('search-kind-menu');
  const header = renderer.root.find(
    (n) => n.props?.testID === 'search-results-header',
  );
  // Only the scope control and the count line sit above the first result.
  expect(header.findAllByType(ScopeBar)).toHaveLength(1);
  expect(header.findAllByType(ResultsHeader)).toHaveLength(1);
  expect(header.findByType(ResultsHeader).props.filters).toBeUndefined();
  expect(renderer.root.findByType(ScopeBar).props.value).toBe('all');
  await act(async () => renderer.unmount());
});

test('bars: All has Share; Speeches has Filters and ⋯ with Sort and Share', async () => {
  const renderer = await submitted();
  const labels = () => items().map((i) => i.label);
  expect(labels()).toEqual(['Account', 'Share']);
  await act(async () =>
    renderer.root.findByType(ScopeBar).props.onChange('speeches'),
  );
  expect(labels()).toEqual(['Account', 'More', 'Filters']);
  const more = items().find((i) => i.label === 'More')!;
  expect(more.menu!.items.map((i) => i.label)).toEqual([
    'Sort',
    'Share',
    menuTitle('Open on opax.com.au'),
  ]);
  expect(more.menu!.items[0]!.items!.map((i) => i.label)).toEqual([
    'Most relevant',
    'Newest first',
    'Oldest first',
  ]);
  expectPublicSiteAction(more.menu!.items, '/');
  await act(async () => renderer.unmount());
});

test('Summarise sits after the third result, with its pill only once tapped', async () => {
  const renderer = await submitted();
  await act(async () =>
    renderer.root.findByType(ScopeBar).props.onChange('speeches'),
  );
  const order = ids(renderer).filter(
    (id, i, all) =>
      all.indexOf(id) === i &&
      (id === 'results-summarise' || /^records-result-\d+$/.test(id)),
  );
  expect(order.indexOf('results-summarise')).toBe(3);
  expect(ids(renderer)).not.toContain('records-summary-machine');
  expect(recordSearch.summary).not.toHaveBeenCalled();
  await act(async () => renderer.unmount());
});

test('idle Search draws no Refresh row and no suggestions', async () => {
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(
      withNavigationOptions(<SearchScreen />, (options) => {
        if (options.headerSearchBarOptions) mockBar.options = options;
      }),
    );
  });
  expect(ids(renderer)).toContain('search-browse-person');
  expect(ids(renderer)).not.toContain('search-refresh');
  expect(ids(renderer)).not.toContain('search-suggestions');
  await act(async () => renderer.unmount());
});

test('the results source line names the records’ own sources, dated by the records', () => {
  expect(
    resultSources([
      { kind: 'speech', source: null, date: '2023-03-06' },
      { kind: 'speech', source: null, date: '2024-01-02' },
      { kind: 'bill', source: 'Bill register', date: '2023-02-09' },
    ] as never),
  ).toEqual([
    { label: 'Hansard', asOf: '2024-01-02' },
    { label: 'Bill register', asOf: '2023-02-09' },
  ]);
  expect(resultSources([{ ...farrell, source: null }] as never)).toEqual([
    { label: 'Hansard', asOf: '2023-03-06' },
  ]);
});

test('a cut passage ends in one ellipsis', () => {
  expect(oneEllipsis('ambitious commitments on housing.…')).toBe(
    'ambitious commitments on housing…',
  );
  expect(oneEllipsis('on housing....')).toBe('on housing…');
  expect(oneEllipsis('A whole sentence.')).toBe('A whole sentence.');
  expect(oneEllipsis('cut here…')).toBe('cut here…');
});
