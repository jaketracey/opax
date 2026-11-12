import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import { Keyboard } from 'react-native';
import { catalogs, recordSearch } from '../src/api/runtime';
import {
  ContentUnavailable,
  InlineError,
  Skeleton,
} from '../src/design/primitives';
import { ResultsScreen } from '../src/features/search/ResultsScreen';
import { ResultsView } from '../src/features/search/ResultsView';
import { bills, index, roster } from './pinned';
import { withNavigationOptions } from './navigation-options';
import { searchRouteFromWebPath } from '../src/navigation/routes/search';
import { webSearchPath } from '../src/features/search/scopes';
import { SpeechResults } from '../src/features/search/SpeechResults';

let mockParams: Record<string, string | string[] | undefined> = {};
jest.mock('expo-router', () => {
  const React = jest.requireActual('react');
  return {
    Link: Object.assign(({ children }: { children: unknown }) => children, {
      Trigger: ({ children }: { children: unknown }) => children,
      Preview: () => null,
      Menu: () => null,
      MenuAction: () => null,
    }),
    router: { push: jest.fn() },
    useSegments: () => [],
    useLocalSearchParams: () => mockParams,
    useFocusEffect: (effect: () => void) => React.useEffect(effect, [effect]),
  };
});
jest.mock('../src/api/runtime', () => ({
  recordSearch: { search: jest.fn(), summary: jest.fn() },
  catalogs: {
    suggestionSourcesOnFocus: jest.fn(),
    suggestionSources: jest.fn(),
  },
}));

const ready = () => {
  const source = { stale: false, savedAt: 1, asAt: null, sources: [] };
  return {
    roster,
    electorates: index,
    bills,
    provenance: { people: source, electorates: source, bills: source },
  } as Awaited<ReturnType<typeof catalogs.suggestionSources>>;
};

test.each(['all', 'speeches'])(
  'a pushed %s entity search retains aliases until its query changes',
  async (kind) => {
    mockParams = {
      kind,
      q: 'Example Union',
      aliases: JSON.stringify(['Example Workers Association']),
    };
    jest.mocked(catalogs.suggestionSourcesOnFocus).mockResolvedValue(ready());
    jest.mocked(recordSearch.search).mockReturnValue(new Promise(() => {}));
    let options: Record<string, unknown> = {};
    let view!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      view = TestRenderer.create(
        withNavigationOptions(<ResultsScreen />, (next) => {
          options = next;
        }),
      );
    });
    expect(view.root.findByType(SpeechResults).props.aliases).toEqual([
      'Example Workers Association',
    ]);
    const search = options.headerSearchBarOptions as {
      onSearchButtonPress: (event: { nativeEvent: { text: string } }) => void;
    };
    await act(async () =>
      search.onSearchButtonPress({
        nativeEvent: { text: 'A different query' },
      }),
    );
    expect(view.root.findByType(SpeechResults).props.aliases).toEqual([]);
    expect(recordSearch.search).toHaveBeenLastCalledWith(
      'A different query',
      expect.not.objectContaining({ aliases: expect.anything() }),
      1,
      'relevance',
    );
    await act(async () => view.unmount());
  },
);

test('a shared media release search applies its type, mode and sort on arrival and reuse', async () => {
  const arrival = (sort: 'newest' | 'oldest') =>
    searchRouteFromWebPath(
      webSearchPath(
        'fixture release arrival',
        { scope: 'speeches' },
        { type: 'press_release', mode: 'keyword' },
        sort,
      ),
    )!.params;
  mockParams = arrival('newest');
  jest.mocked(catalogs.suggestionSourcesOnFocus).mockResolvedValue(ready());
  jest.mocked(recordSearch.search).mockReturnValue(new Promise(() => {}));
  let view!: TestRenderer.ReactTestRenderer;
  const draw = () => withNavigationOptions(<ResultsScreen />, () => {});
  await act(async () => {
    view = TestRenderer.create(draw());
  });
  expect(view.root.findByType(ResultsView).props).toMatchObject({
    scope: 'speeches',
    filters: { kind: 'press_release', mode: 'keyword' },
    sort: 'newest',
  });
  expect(recordSearch.search).toHaveBeenLastCalledWith(
    'fixture release arrival',
    expect.objectContaining({ kind: 'press_release', mode: 'keyword' }),
    1,
    'newest',
  );
  await act(async () => {
    mockParams = arrival('oldest');
    view.update(draw());
  });
  expect(view.root.findByType(ResultsView).props.sort).toBe('oldest');
  expect(recordSearch.search).toHaveBeenLastCalledWith(
    'fixture release arrival',
    expect.objectContaining({ kind: 'press_release', mode: 'keyword' }),
    1,
    'oldest',
  );
});

test.each(['topics', 'electorates', 'parties'])(
  'a pushed %s list offers a retry when its catalogues fail',
  async (group) => {
    mockParams = { kind: group, group, q: 'housing' };
    jest
      .mocked(catalogs.suggestionSourcesOnFocus)
      .mockRejectedValue(new Error('offline'));
    jest.mocked(catalogs.suggestionSources).mockResolvedValue(ready());
    let view!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      view = TestRenderer.create(
        withNavigationOptions(<ResultsScreen />, () => {}),
      );
    });
    const error = view.root.findByType(InlineError);
    expect(error.props.testID).toBe('search-sources-error');
    await act(async () => error.props.onRetry());
    expect(catalogs.suggestionSources).toHaveBeenCalledWith(true);
    expect(view.root.findAllByType(InlineError)).toHaveLength(0);
    expect(view.root.findAllByType(Skeleton)).toHaveLength(0);
  },
);

test('a pushed local list shows progress while its catalogues are pending', async () => {
  mockParams = { kind: 'topics', q: 'housing' };
  jest
    .mocked(catalogs.suggestionSourcesOnFocus)
    .mockReturnValue(new Promise(() => {}));
  let view!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    view = TestRenderer.create(
      withNavigationOptions(<ResultsScreen />, () => {}),
    );
  });
  expect(
    view.root
      .findAllByType(Skeleton)
      .some((node) => node.props.label === 'Searching topics'),
  ).toBe(true);
});

test('a new arrival on a retained results screen applies its query, scope and filters', async () => {
  mockParams = { kind: 'people', q: 'housing', party: 'Labor' };
  jest.mocked(catalogs.suggestionSourcesOnFocus).mockResolvedValue(ready());
  let view!: TestRenderer.ReactTestRenderer;
  const draw = () => withNavigationOptions(<ResultsScreen />, () => {});
  await act(async () => {
    view = TestRenderer.create(draw());
  });
  expect(view.root.findByType(ResultsView).props).toMatchObject({
    q: 'housing',
    scope: 'people',
    filters: { party: 'Labor' },
  });
  await act(async () => {
    mockParams = {
      kind: 'bills',
      q: 'education',
      party: 'Greens',
      from: '2024',
    };
    view.update(draw());
  });
  expect(view.root.findByType(ResultsView).props).toMatchObject({
    q: 'education',
    scope: 'bills',
    filters: { party: 'Greens', from: '2024' },
  });
  // Ordinary rerenders must preserve an in-screen scope choice.
  await act(async () =>
    view.root.findByType(ResultsView).props.onScope('people'),
  );
  await act(async () => {
    mockParams = { ...mockParams };
    view.update(draw());
  });
  expect(view.root.findByType(ResultsView).props.scope).toBe('people');
});

test('submitting the pushed results field dismisses the iOS keyboard', async () => {
  mockParams = { kind: 'people', q: 'housing' };
  jest.mocked(catalogs.suggestionSourcesOnFocus).mockResolvedValue(ready());
  let bar!: Record<string, any>;
  await act(async () => {
    TestRenderer.create(
      withNavigationOptions(<ResultsScreen />, (options) => {
        if (options.headerSearchBarOptions)
          bar = options.headerSearchBarOptions;
      }),
    );
  });
  const nativeBar = { setText: jest.fn(), blur: jest.fn() };
  bar.ref.current = nativeBar;
  const dismiss = jest.spyOn(Keyboard, 'dismiss');
  try {
    await act(async () =>
      bar.onSearchButtonPress({ nativeEvent: { text: 'education' } }),
    );
    expect(nativeBar.blur).toHaveBeenCalled();
    expect(dismiss).toHaveBeenCalled();
  } finally {
    dismiss.mockRestore();
  }
});

test('a repeated query parameter cannot crash a pushed results screen', async () => {
  mockParams = { kind: 'people', q: ['housing', 'education'] };
  jest.mocked(catalogs.suggestionSourcesOnFocus).mockResolvedValue(ready());
  let view!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    view = TestRenderer.create(
      withNavigationOptions(<ResultsScreen />, () => {}),
    );
  });
  expect(view.root.findByType(ContentUnavailable).props.title).toBe(
    'No results',
  );
});
