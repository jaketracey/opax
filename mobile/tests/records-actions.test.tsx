import { withNavigationOptions } from './navigation-options';
// Filters and sort in Speeches (journeys/search.md 3.5): every Search
// filter opens /filters/search; a change made there is one request; the
// applied filters show as one line with Clear; Clear and a return to an
// earlier order are answered from the session cache.
import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import { router } from 'expo-router';
import { catalogs, recordSearch } from '../src/api/runtime';
import { SearchScreen } from '../src/features/search/SearchScreen';
import { ScopeBar } from '../src/features/search/ScopeBar';
import { FiltersLine } from '../src/features/search/FiltersLine';
import { resetSearchSession } from '../src/features/search/requests';
import { searchFilterStore } from '../src/features/search/filters';
import { decodeRecords } from '../src/features/search/decoders';
import { memberSuggestionRoster } from '../src/api/catalog-search';
import { bills, index, manifest, people, roster, slugs } from './pinned';

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

const page = () => ({
  data: decodeRecords({
    query: 'housing',
    kind: 'speech',
    sort: 'relevance',
    page: 1,
    per_page: 20,
    page_count: 1,
    total: 1,
    count: 1,
    truncated: false,
    years: {},
    results: [
      {
        kind: 'speech',
        title: 'Housing',
        slug: 'speech-1',
        resource: 'speech-1',
        speaker: 'Anthony Albanese',
        snippet: 'More homes.',
        href: '/doc/speech-1',
      },
    ],
  }),
  stale: false,
  savedAt: 1,
  asOf: null,
});

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
  jest
    .mocked(recordSearch.search)
    .mockImplementation(async () => page() as never);
});

const items = () =>
  (mockBar.options!.unstable_headerRightItems?.() ?? []) as {
    label: string;
    accessibilityLabel?: string;
    onPress?: () => void;
    menu?: {
      items: {
        label: string;
        items?: { label: string; onPress: () => void }[];
      }[];
    };
  }[];

async function speeches() {
  let r!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    r = TestRenderer.create(
      withNavigationOptions(<SearchScreen />, (options) => {
        if (options.headerSearchBarOptions) mockBar.options = options;
      }),
    );
  });
  await act(async () =>
    mockBar.options!.headerSearchBarOptions.onSearchButtonPress({
      nativeEvent: { text: 'housing' },
    }),
  );
  await act(async () => r.root.findByType(ScopeBar).props.onChange('speeches'));
  return r;
}

test('Filters opens /filters/search; a change there is one request and one filter line', async () => {
  const r = await speeches();
  expect(recordSearch.search).toHaveBeenCalledTimes(1);
  const filters = items().find((i) => i.label === 'Filters')!;
  expect(filters.accessibilityLabel).toBe('Filters');
  filters.onPress!();
  expect(router.push).toHaveBeenLastCalledWith({
    pathname: '/filters/[list]',
    params: { list: 'search', owner: 'search-root' },
  });
  // The sheet writes this owner's filters.
  const store = searchFilterStore('search-root')!;
  await act(async () => store.set({ ...store.get(), party: 'Labor' }));
  expect(recordSearch.search).toHaveBeenCalledTimes(2);
  expect(jest.mocked(recordSearch.search).mock.calls[1]![1]).toMatchObject({
    party: 'Labor',
  });
  const line = r.root.findByType(FiltersLine);
  expect(line.props.text).toBe('Labor');
  expect(items().find((i) => i.label === 'Filters')!.accessibilityLabel).toBe(
    'Filters, on',
  );
  // Tapping the line opens the same sheet; Clear goes back to the cache.
  line.props.onPress();
  expect(router.push).toHaveBeenLastCalledWith(
    expect.objectContaining({
      params: { list: 'search', owner: 'search-root' },
    }),
  );
  await act(async () => line.props.onClear());
  expect(r.root.findAllByType(FiltersLine)).toHaveLength(0);
  expect(recordSearch.search).toHaveBeenCalledTimes(2);
  await act(async () => r.unmount());
});

test('Sort is one request per new order; returning to an order costs nothing', async () => {
  const r = await speeches();
  const sort = () =>
    items()
      .find((i) => i.label === 'More')!
      .menu!.items.find((i) => i.label === 'Sort')!.items!;
  await act(async () =>
    sort()
      .find((s) => s.label === 'Newest first')!
      .onPress(),
  );
  expect(recordSearch.search).toHaveBeenCalledTimes(2);
  expect(jest.mocked(recordSearch.search).mock.calls[1]![3]).toBe('newest');
  await act(async () =>
    sort()
      .find((s) => s.label === 'Most relevant')!
      .onPress(),
  );
  expect(recordSearch.search).toHaveBeenCalledTimes(2);
  // Summaries are tap only.
  expect(recordSearch.summary).not.toHaveBeenCalled();
  await act(async () => r.unmount());
});

test('in All the Speeches group carries the filter line; its Clear clears', async () => {
  const r = await speeches();
  const store = searchFilterStore('search-root')!;
  await act(async () => store.set({ ...store.get(), party: 'Labor' }));
  await act(async () => r.root.findByType(ScopeBar).props.onChange('all'));
  // All's read by relevance is the Speeches read just made: no new request.
  expect(recordSearch.search).toHaveBeenCalledTimes(2);
  const groupLine = () =>
    r.root
      .findAllByType(FiltersLine)
      .filter((l) => l.props.testID === 'search-group-speeches-filters');
  expect(groupLine()).toHaveLength(1);
  expect(groupLine()[0]!.props.text).toBe('Labor');
  // The header carries no second line in All: the group's line is the one.
  expect(r.root.findAllByType(FiltersLine)).toHaveLength(1);
  groupLine()[0]!.props.onPress();
  expect(router.push).toHaveBeenLastCalledWith(
    expect.objectContaining({
      params: { list: 'search', owner: 'search-root' },
    }),
  );
  await act(async () => groupLine()[0]!.props.onClear());
  expect(groupLine()).toHaveLength(0);
  expect(store.get().party).toBe('');
  await act(async () => r.unmount());
});

test('People shows no filter line: its rows ignore the speech filters', async () => {
  const r = await speeches();
  const store = searchFilterStore('search-root')!;
  await act(async () => store.set({ ...store.get(), party: 'Labor' }));
  await act(async () => r.root.findByType(ScopeBar).props.onChange('people'));
  expect(r.root.findAllByType(FiltersLine)).toHaveLength(0);
  await act(async () => r.unmount());
});
