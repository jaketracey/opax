// Recovery in Search (journeys/search.md 3.9): a failure never reads as
// empty, an error sits in the group or at the row that failed, Try again
// repeats only that, and every empty state has a way on.
import { router } from 'expo-router';
import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import Search from '../src/features/Search';
import { catalogs, recordSearch } from '../src/api/runtime';
import { openSuggestedPerson } from '../src/features/search/navigation';
import { resetSearchSession } from '../src/features/search/requests';
import { ScopeBar } from '../src/features/search/ScopeBar';
import {
  InlineError,
  PersonRow,
  SuggestionRow,
} from '../src/design/primitives';
import { ApiError } from '../src/api/errors';
import { memberSuggestionRoster } from '../src/api/catalog-search';
import { electorateRoute } from '../src/navigation/routes';
import { decodeRecords } from '../src/features/search/decoders';
import { bills, index, roster, people, manifest, slugs } from './pinned';

jest.mock('../src/api/runtime', () => ({
  recordSearch: { search: jest.fn(), summary: jest.fn() },
  catalogs: {
    suggestionSources: jest.fn(),
    suggestionSourcesOnFocus: jest.fn(),
    search: jest.fn(),
  },
}));
jest.mock('../src/features/search/navigation', () => ({
  ...jest.requireActual('../src/features/search/navigation'),
  openSuggestedPerson: jest.fn(),
  openSearchPerson: jest.fn(),
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

const source = { stale: false, savedAt: 1, asAt: null, sources: [] };
const sources = (identity = true) =>
  ({
    roster: memberSuggestionRoster(roster, { roster, manifest, slugs, people }),
    // Without the people catalogue a row has no canonical ID yet.
    people: identity ? people : undefined,
    manifest,
    slugs,
    electorates: index,
    bills,
    provenance: { people: source, electorates: source, bills: source },
  }) as unknown as Awaited<ReturnType<typeof catalogs.suggestionSources>>;
const empty = () => ({
  data: decodeRecords({
    query: 'x',
    kind: 'speech',
    sort: 'relevance',
    page: 1,
    per_page: 20,
    page_count: 1,
    total: 0,
    count: 0,
    truncated: false,
    results: [],
    years: {},
  }),
  stale: false,
  savedAt: 1,
  asOf: null,
});

beforeEach(() => {
  jest.clearAllMocks();
  resetSearchSession();
  jest.mocked(catalogs.suggestionSourcesOnFocus).mockResolvedValue(sources());
  jest.mocked(catalogs.suggestionSources).mockResolvedValue(sources());
});
const bar = () => mockBar.options!.headerSearchBarOptions;
const type = (text: string) =>
  act(async () => bar().onChangeText({ nativeEvent: { text } }));
const submit = (text: string) =>
  act(async () => bar().onSearchButtonPress({ nativeEvent: { text } }));
const ids = (r: TestRenderer.ReactTestRenderer) =>
  r.root
    .findAll((n) => typeof n.props?.testID === 'string')
    .map((n) => n.props.testID as string);
async function mount() {
  let r!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    r = TestRenderer.create(<Search />);
  });
  return r;
}

test('suggestions that could not load offer Try again, which reads them again', async () => {
  jest
    .mocked(catalogs.suggestionSourcesOnFocus)
    .mockRejectedValueOnce(new Error('offline'));
  const r = await mount();
  await type('Albanese');
  const error = r.root
    .findAllByType(InlineError)
    .find((e) => e.props.testID === 'search-suggestions-error')!;
  expect(error.props.message).toBe("Suggestions couldn't be loaded.");
  // The two fixed rows stay: the reader can still search or ask.
  expect(ids(r)).toContain('search-speeches-row');
  await act(async () => error.props.onRetry());
  expect(catalogs.suggestionSources).toHaveBeenCalledWith(true);
  expect(ids(r)).toContain('search-top-suggestion');
  expect(recordSearch.search).not.toHaveBeenCalled();
  await act(async () => r.unmount());
});

test('Try again repeats a failed person open at its row, without searching', async () => {
  // Without the people catalogue the identity is resolved on tap.
  jest
    .mocked(catalogs.suggestionSourcesOnFocus)
    .mockResolvedValue(sources(false));
  jest
    .mocked(openSuggestedPerson)
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValue(undefined);
  const r = await mount();
  await type('Anthony Albanese');
  const row = () =>
    r.root
      .findAllByType(SuggestionRow)
      .find((s) => s.props.name === 'Anthony Albanese')!;
  await act(async () => row().props.onPress());
  expect(openSuggestedPerson).toHaveBeenCalledTimes(1);
  const error = r.root.findByType(InlineError);
  expect(error.props.message).toBe("This page couldn't be opened.");
  await act(async () => error.props.onRetry());
  expect(openSuggestedPerson).toHaveBeenCalledTimes(2);
  expect(openSuggestedPerson).toHaveBeenLastCalledWith('Anthony Albanese');
  expect(recordSearch.search).not.toHaveBeenCalled();
  expect(r.root.findAllByType(InlineError)).toHaveLength(0);
  await act(async () => r.unmount());
});

test('offline, Speeches says it needs a connection while on-device groups stay', async () => {
  jest
    .mocked(recordSearch.search)
    .mockRejectedValue(new ApiError('offline', 'offline'));
  const r = await mount();
  await submit('Anthony Albanese');
  const error = r.root
    .findAllByType(InlineError)
    .find((e) => e.props.testID === 'search-speeches-error')!;
  expect(error.props.message).toBe('Speeches need a connection.');
  expect(ids(r)).toContain('search-result-anthony-albanese');
  expect(ids(r)).not.toContain('search-empty');
  await act(async () => error.props.onRetry());
  expect(recordSearch.search).toHaveBeenCalledTimes(2);
  await act(async () => r.unmount());
});

test('people suggestions carry party and place in the row', async () => {
  const r = await mount();
  await type('Anthony Albanese');
  const row = r.root
    .findAllByType(SuggestionRow)
    .find((s) => s.props.name === 'Anthony Albanese')!;
  expect(row.props.secondary).toBe(
    'Labor · Member for Grayndler, New South Wales',
  );
  await act(async () => r.unmount());
});

test('electorate suggestions open the native identifier route', async () => {
  const r = await mount();
  await type('Grayndler');
  const seat = index.electorates.find(
    (s) => s.name === 'Grayndler' && s.status !== 'historical',
  )!;
  const row = r.root
    .findAllByType(SuggestionRow)
    .find((s) => s.props.name === 'Grayndler')!;
  expect(row.props.href).toEqual(
    electorateRoute(seat.electorate_id, undefined, 'Grayndler'),
  );
  expect(recordSearch.search).not.toHaveBeenCalled();
  expect(router.push).not.toHaveBeenCalled();
  await act(async () => r.unmount());
});

test('a scope with nothing offers Show all results, which keeps the query', async () => {
  jest.mocked(recordSearch.search).mockResolvedValue(empty() as never);
  const r = await mount();
  await submit('zzzznevermatching');
  // All finds nothing anywhere: No results with Ask OPAX about this.
  expect(ids(r)).toContain('search-empty-ask');
  await act(async () => r.root.findByType(ScopeBar).props.onChange('people'));
  expect(ids(r)).toContain('search-empty-all-results');
  const all = r.root.find(
    (n) =>
      n.props?.testID === 'search-empty-all-results' &&
      typeof n.props.onPress === 'function',
  );
  await act(async () => all.props.onPress());
  expect(r.root.findByType(ScopeBar).props.value).toBe('all');
  expect(recordSearch.search).toHaveBeenCalledTimes(1);
  await act(async () => r.unmount());
});

test('submitted people rows keep the roster party and place, with no snippet line', async () => {
  jest.mocked(recordSearch.search).mockResolvedValue(empty() as never);
  const r = await mount();
  await submit('Anthony Albanese');
  const row = r.root
    .findAllByType(PersonRow)
    .find((p) => p.props.testID === 'search-result-anthony-albanese')!;
  expect(row.props).toMatchObject({
    name: 'Anthony Albanese',
    party: 'Labor',
    partyStatus: 'current',
    place: 'Member for Grayndler, New South Wales',
  });
  // Wave 1: no serif snippet with a raw ISO date under a person.
  expect(row.props.detail).toBeUndefined();
  for (const value of Object.values(row.props))
    if (typeof value === 'string')
      expect(value).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  await act(async () => r.unmount());
});

test('the people top hit carries its id on a plain view around the row, outside its link', async () => {
  jest.mocked(recordSearch.search).mockResolvedValue(empty() as never);
  const r = await mount();
  await submit('Anthony Albanese');
  const top = r.root.find(
    (n) => typeof n.type === 'string' && n.props.testID === 'search-top-hits',
  );
  const slot = top.find(
    (n) =>
      typeof n.type === 'string' &&
      n.props.testID === 'search-result-anthony-albanese' &&
      n.props.collapsable === false,
  );
  // Neither accessible nor inside the row's link, so no native wrapper
  // around the link can keep the id out of the hierarchy.
  expect(slot.props.accessible).toBeUndefined();
  expect(slot.findAllByType(PersonRow)).toHaveLength(1);
  let parent = slot.parent;
  while (parent) {
    expect(parent.type).not.toBe(PersonRow);
    expect((parent.type as { name?: string }).name).not.toBe('RowLink');
    parent = parent.parent;
  }
  await act(async () => r.unmount());
});
