import { withNavigationOptions } from './navigation-options';
// TestFlight build 32 (10 Oct): "App froze on this screen" on the idle Search
// tab, and Browse showed placeholder rows that "disappear without loading
// anything". Both came from the suggestion catalogs Search loads on focus.
import { act } from 'react';
import { Platform, RefreshControl, ScrollView, StyleSheet } from 'react-native';
import TestRenderer from 'react-test-renderer';
import Search from '../src/features/Search';
import { catalogs } from '../src/api/runtime';
import { memberSuggestionRoster } from '../src/api/catalog-search';
import { Skeleton } from '../src/design/primitives';
import { bills, index, roster, people, manifest, slugs } from './pinned';
import { SearchIdle } from '../src/features/search/SearchIdle';
import { SearchSuggestions } from '../src/features/search/SearchSuggestions';
import { ResultsView } from '../src/features/search/ResultsView';

jest.mock('../src/api/runtime', () => ({
  recordSearch: { search: jest.fn(), summary: jest.fn() },
  catalogs: {
    suggestionSources: jest.fn(),
    suggestionSourcesOnFocus: jest.fn(),
    search: jest.fn(),
  },
}));

test('building the suggestion roster folds each name a bounded number of times', () => {
  // The roster build joined every directory spelling for each person, folding
  // names with String#normalize about a million times over the pinned
  // release: seconds of blocked JS thread under Hermes, so taps (and focus on
  // the search field) did nothing. It is now linear in the catalogs.
  const normalize = jest.spyOn(String.prototype, 'normalize');
  const suggestions = memberSuggestionRoster(roster, {
    roster,
    manifest,
    slugs,
    people,
  });
  const names =
    roster.people.length +
    Object.keys(slugs.slugs).length +
    people.people.reduce((n, p) => n + 1 + p.aliases.length, 0);
  expect(suggestions.people.length).toBeGreaterThan(600);
  expect(normalize.mock.calls.length).toBeLessThan(10 * names);
  normalize.mockRestore();
});

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
const type = (text: string) =>
  act(async () =>
    mockBar.options!.headerSearchBarOptions.onChangeText({
      nativeEvent: { text },
    }),
  );
const ids = (r: TestRenderer.ReactTestRenderer) =>
  r.root
    .findAll((n) => typeof n.props?.testID === 'string')
    .map((n) => n.props.testID as string);
const sourceFor = (
  over: Partial<Record<'roster' | 'electorates' | 'bills', unknown>> = {},
) => {
  const source = { stale: false, savedAt: 1, asAt: null, sources: [] };
  return {
    roster: memberSuggestionRoster(roster, { roster, manifest, slugs, people }),
    people,
    manifest,
    slugs,
    electorates: index,
    bills,
    provenance: { people: source, electorates: source, bills: source },
    ...over,
  } as unknown as Awaited<ReturnType<typeof catalogs.suggestionSources>>;
};

test('idle Browse never shows a placeholder for suggestions it does not draw', async () => {
  let resolve!: (value: ReturnType<typeof sourceFor>) => void;
  jest.mocked(catalogs.suggestionSourcesOnFocus).mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(
      withNavigationOptions(<Search />, (options) => {
        if (options.headerSearchBarOptions) mockBar.options = options;
      }),
    );
  });
  // Idle, still loading: the Browse links and no placeholder rows.
  expect(renderer.root.findAllByType(Skeleton)).toHaveLength(0);
  expect(ids(renderer)).toContain('search-browse-person');
  expect(ids(renderer)).toContain('search-browse-topics');
  // First launch: a typed query keeps its two fixed rows while the
  // catalogues arrive, then the Top suggestion leads.
  await type('Albanese');
  expect(ids(renderer)).toContain('search-speeches-row');
  expect(ids(renderer)).toContain('search-ask-row');
  expect(renderer.root.findAllByType(Skeleton)).toHaveLength(1);
  await act(async () => resolve(sourceFor()));
  expect(renderer.root.findAllByType(Skeleton)).toHaveLength(0);
  expect(ids(renderer)).toContain('search-top-suggestion');
  await act(async () => renderer.unmount());
});

test('an empty roster never says "No suggestions": the two fixed rows remain', async () => {
  jest.mocked(catalogs.suggestionSourcesOnFocus).mockResolvedValue(
    sourceFor({
      roster: { ...roster, people: [] },
      electorates: { ...index, electorates: [] },
      bills: { ...bills, bills: [] },
    }),
  );
  let r!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    r = TestRenderer.create(
      withNavigationOptions(<Search />, (options) => {
        if (options.headerSearchBarOptions) mockBar.options = options;
      }),
    );
  });
  await type('zzzzzz');
  expect(ids(r)).not.toContain('search-suggestions-empty');
  expect(ids(r)).toContain('search-speeches-row');
  expect(ids(r)).toContain('search-ask-row');
  expect(ids(r)).not.toContain('search-top-suggestion');
  await act(async () => r.unmount());
});

describe('Search scroll region on iOS', () => {
  const originalOS = Platform.OS;

  beforeEach(() => {
    Platform.OS = 'ios';
    jest
      .mocked(catalogs.suggestionSourcesOnFocus)
      .mockResolvedValue(sourceFor());
    jest
      .mocked(catalogs.suggestionSources)
      .mockReturnValue(new Promise(() => {}));
  });

  afterEach(() => {
    Platform.OS = originalOS;
    jest.clearAllMocks();
  });

  async function renderSearch() {
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        withNavigationOptions(<Search />, (options) => {
          if (options.headerSearchBarOptions) mockBar.options = options;
        }),
      );
    });
    return renderer;
  }

  function expectScrollRegion(renderer: TestRenderer.ReactTestRenderer) {
    const scroll = renderer.root.findByType(ScrollView);
    expect(StyleSheet.flatten(scroll.props.style)).toMatchObject({ flex: 1 });
    expect(
      StyleSheet.flatten(scroll.props.contentContainerStyle),
    ).toMatchObject({
      flexGrow: 1,
    });
    expect(scroll.props.alwaysBounceVertical).toBe(true);
    expect(scroll.props.contentInsetAdjustmentBehavior).toBe('automatic');
    expect(scroll.props.keyboardDismissMode).toBe('on-drag');
    expect(scroll.props.keyboardShouldPersistTaps).toBe('handled');
    expect(mockBar.options!.headerSearchBarOptions.obscureBackground).toBe(
      false,
    );

    // Check the whole page, including siblings outside the ScrollView.
    // A transparent, full-height native view still intercepts blank-area drags.
    const overlays = renderer.root.findAll((node) => {
      if (typeof node.type !== 'string') return false;
      const style = StyleSheet.flatten(node.props.style);
      return (
        style?.position === 'absolute' &&
        ((style.top === 0 && style.bottom === 0) || style.height === '100%') &&
        !['box-none', 'none'].includes(
          node.props.pointerEvents ?? style.pointerEvents,
        )
      );
    });
    expect(overlays).toHaveLength(0);
    return scroll;
  }

  test('blank space below Browse fills the scroll region and retains pull to refresh', async () => {
    const renderer = await renderSearch();
    const scroll = expectScrollRegion(renderer);
    expect(renderer.root.findAllByType(SearchIdle)).toHaveLength(1);
    expect(renderer.root.findAllByType(SearchSuggestions)).toHaveLength(0);
    expect(renderer.root.findAllByType(ResultsView)).toHaveLength(0);
    expect(scroll.findByProps({ testID: 'search-browse-money' })).toBeDefined();
    expect(scroll.props.refreshControl.type).toBe(RefreshControl);
    expect(scroll.props.refreshControl.props.refreshing).toBe(false);
    await act(async () => scroll.props.refreshControl.props.onRefresh());
    expect(catalogs.suggestionSources).toHaveBeenCalledWith(true);
    expect(
      renderer.root.findByType(ScrollView).props.refreshControl.props
        .refreshing,
    ).toBe(true);
  });

  test('typing, short results and returning to Browse keep the same unobscured scroll region', async () => {
    const renderer = await renderSearch();
    const scroll = expectScrollRegion(renderer);
    await type('zzzzzz');
    expectScrollRegion(renderer);
    expect(renderer.root.findByType(ScrollView)).toBe(scroll);
    expect(renderer.root.findAllByType(SearchIdle)).toHaveLength(0);
    expect(renderer.root.findAllByType(SearchSuggestions)).toHaveLength(1);
    expect(renderer.root.findAllByType(ResultsView)).toHaveLength(0);

    // The local People scope settles with no matches, leaving blank space.
    await act(async () =>
      renderer.root.findByType(SearchSuggestions).props.onSeeAll('people'),
    );
    expectScrollRegion(renderer);
    expect(renderer.root.findByType(ScrollView)).toBe(scroll);
    expect(renderer.root.findAllByType(SearchIdle)).toHaveLength(0);
    expect(renderer.root.findAllByType(SearchSuggestions)).toHaveLength(0);
    expect(renderer.root.findByType(ResultsView).props.scope).toBe('people');

    await type('');
    await act(async () =>
      mockBar.options!.headerSearchBarOptions.onCancelButtonPress(),
    );
    expectScrollRegion(renderer);
    expect(renderer.root.findAllByType(SearchIdle)).toHaveLength(1);
    expect(renderer.root.findAllByType(SearchSuggestions)).toHaveLength(0);
    expect(renderer.root.findAllByType(ResultsView)).toHaveLength(0);
  });
});
