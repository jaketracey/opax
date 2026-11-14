import { withNavigationOptions } from './navigation-options';
// Sweep 2, item 8: Search after the first search. Clearing returns the idle
// list to its top, only a query that found something enters Recent, Try
// titles clamp to two lines, and No results drops "0 results" from the
// source line with its action a block under the body.
import { act } from 'react';
import { ScrollView } from 'react-native';
import TestRenderer from 'react-test-renderer';
import { catalogs, recordSearch } from '../src/api/runtime';
import { ContentUnavailable } from '../src/design/states';
import { LinkRow } from '../src/design/rows';
import { SearchScreen } from '../src/features/search/SearchScreen';
import { ResultsHeader } from '../src/features/search/ResultsHeader';
import { TRY_TITLE_LINES } from '../src/features/search/SearchIdle';
import { recentSearches } from '../src/features/search/recent';
import { resetSearchSession } from '../src/features/search/requests';
import { decodeRecords } from '../src/features/search/decoders';
import { memberSuggestionRoster } from '../src/api/catalog-search';
import records from '../scripts/fixtures/search/records.json';
import { bills, index, roster, people, manifest, slugs } from './pinned';

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

const speeches = records.filter((r) => r.kind === 'speech').slice(0, 5);
function page(q: string, rows: typeof speeches, kind = 'speech') {
  return {
    data: decodeRecords({
      query: q,
      kind,
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
  recentSearches.clear();
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
  // Speeches find five for any query but the nonsense one; the report
  // catalogue finds none.
  jest
    .mocked(recordSearch.search)
    .mockImplementation(async (q: string, filters?: { kind?: string }) =>
      filters?.kind === 'report'
        ? (page(q, [], 'report') as never)
        : (page(q, q === 'zzqqxxvv' ? [] : speeches) as never),
    );
});

const bar = () => mockBar.options!.headerSearchBarOptions;
const recent = () => recentSearches.snapshot().items.map((item) => item.q);
const frame = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 40));
  });

async function mount() {
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(
      withNavigationOptions(<SearchScreen />, (options) => {
        if (options.headerSearchBarOptions) mockBar.options = options;
      }),
    );
  });
  return renderer;
}
async function search(q: string) {
  await act(async () =>
    bar().onSearchButtonPress({ nativeEvent: { text: q } }),
  );
  await frame();
}

test('only a query that found something enters Recent', async () => {
  const renderer = await mount();
  await search('housing');
  expect(recent()).toEqual(['housing']);
  await search('zzqqxxvv');
  expect(recent()).toEqual(['housing']);
  await act(async () => renderer.unmount());
});

test('the same query submitted again while its results stay up moves to the top of Recent', async () => {
  // Review of sweep 2 lane A: the results did not report again (same query,
  // same scope), so the query waited for a count that never came.
  const renderer = await mount();
  await search('housing');
  await act(async () => recentSearches.add('water', 'all'));
  expect(recent()).toEqual(['water', 'housing']);
  await search('housing');
  expect(recent()).toEqual(['housing', 'water']);
  await act(async () => renderer.unmount());
});

test('no results: no "0 results" on the source line, the action a block under the body', async () => {
  const renderer = await mount();
  await search('zzqqxxvv');
  expect(renderer.root.findByType(ResultsHeader).props.count).toBeNull();
  const empty = renderer.root.findByType(ContentUnavailable);
  expect(empty.props.title).toBe('No results');
  // Drawn inline, so SwiftUI's own padding does not stand between the body
  // and "Ask OPAX about this".
  expect(empty.props.inline).toBe(true);
  await search('housing');
  expect(renderer.root.findByType(ResultsHeader).props.count).toMatch(
    /results?$/,
  );
  await act(async () => renderer.unmount());
});

test('clearing a search shows the idle list from its top', async () => {
  const renderer = await mount();
  await search('housing');
  const scroll = renderer.root.findByType(ScrollView).instance as {
    scrollTo: (options: { y: number; animated: boolean }) => void;
  };
  const scrollTo = jest.fn();
  scroll.scrollTo = scrollTo;
  // The field's clear button: the text goes, Recent and Try come back.
  await act(async () => bar().onChangeText({ nativeEvent: { text: '' } }));
  await frame();
  expect(
    renderer.root.findAll((n) => n.props?.testID === 'search-browse').length,
  ).toBeGreaterThan(0);
  expect(scrollTo).toHaveBeenCalledWith(
    expect.objectContaining({ animated: false }),
  );
  const { y } = scrollTo.mock.calls.at(-1)![0];
  expect(y).toBeLessThanOrEqual(0);
  await act(async () => renderer.unmount());
});

test('a Try title clamps to two lines', async () => {
  expect(TRY_TITLE_LINES).toBe(2);
  const renderer = await mount();
  const tries = renderer.root
    .findAllByType(LinkRow)
    .filter((row) => String(row.props.testID).startsWith('search-try-'));
  expect(tries.length).toBeGreaterThan(0);
  for (const row of tries) expect(row.props.titleLines).toBe(2);
  await act(async () => renderer.unmount());
});
