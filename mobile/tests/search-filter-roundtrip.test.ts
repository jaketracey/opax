import {
  defaultSpeechFilters,
  filtersFromParams,
  filtersLine,
  filtersToParams,
  registerSearchFilters,
  requestFilters,
  searchFilterStore,
  hasFilters,
  clearedFilters,
} from '../src/features/search/filters';
import { webSearchPath } from '../src/features/search/scopes';
import { searchRouteFromWebPath } from '../src/navigation/routes/search';

test('the filter sheet retains media releases and Exact words only through request and route params', () => {
  const changed = jest.fn();
  registerSearchFilters(
    'record-type-regression',
    defaultSpeechFilters,
    changed,
  );
  const store = searchFilterStore('record-type-regression')!;
  store.set({ ...store.get(), kind: 'press_release', mode: 'keyword' });
  const filters = changed.mock.calls.at(-1)![0];
  expect(filters.kind).toBe('press_release');
  expect(requestFilters(filters)).toMatchObject({
    kind: 'press_release',
    mode: 'keyword',
  });
  const params = filtersToParams(filters);
  expect(params).toMatchObject({ type: 'press_release', mode: 'keyword' });
  expect(filtersFromParams(params)).toEqual(filters);
  expect(filtersLine(filters)).toContain('Media releases and transcripts');
});

test('Exact words only is an applied filter that Clear filters removes', () => {
  const filters = { ...defaultSpeechFilters, mode: 'keyword' };
  expect(hasFilters(filters)).toBe(true);
  expect(filtersLine(filters)).toBe('Exact words only');
  expect(clearedFilters()).toEqual(defaultSpeechFilters);
});

test('a shared speech link reopens the speech scope with its filters', () => {
  const path = webSearchPath(
    'housing',
    { scope: 'speeches' },
    { party: 'Labor' },
  );
  expect(searchRouteFromWebPath(path)?.params).toMatchObject({
    kind: 'speeches',
    q: 'housing',
    party: 'Labor',
  });
});

test('All shares the speech filters it applies', () => {
  const path = webSearchPath(
    'housing',
    { scope: 'all' },
    { party: 'Labor', mode: 'keyword' },
  );
  const params = new URLSearchParams(path.split('?')[1]);
  expect(params.get('party')).toBe('Labor');
  expect(params.get('mode')).toBe('keyword');
});

test('a shared speech link keeps the chosen sort and record type', () => {
  const path = webSearchPath(
    'fixture',
    { scope: 'speeches' },
    { type: 'press_release', mode: 'keyword' },
    'newest',
  );
  const params = new URLSearchParams(path.split('?')[1]);
  expect(params.get('kind')).toBe('press_release');
  expect(params.get('mode')).toBe('keyword');
  expect(params.get('sort')).toBe('newest');
  const route = searchRouteFromWebPath(path);
  expect(route?.params).toMatchObject({
    kind: 'speeches',
    type: 'press_release',
    mode: 'keyword',
    sort: 'newest',
    link: '1',
  });
  expect(filtersFromParams(route!.params)).toMatchObject({
    kind: 'press_release',
    mode: 'keyword',
  });
});

test.each(['interests', 'pay', 'expenses'] as const)(
  'a shared %s list names its record kind',
  (group) => {
    const path = webSearchPath('fixture', { group });
    expect(new URLSearchParams(path.split('?')[1]).get('kind')).toBe(
      { interests: 'interest', pay: 'pay', expenses: 'expense' }[group],
    );
  },
);
