import { withNavigationOptions } from './navigation-options';
// TestFlight build 32 (10 Oct): "App froze on this screen" on the idle Search
// tab, and Browse showed placeholder rows that "disappear without loading
// anything". Both came from the suggestion catalogs Search loads on focus.
import { act } from 'react';
import {
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import TestRenderer from 'react-test-renderer';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import Search from '../src/features/Search';
import { catalogs } from '../src/api/runtime';
import { memberSuggestionRoster } from '../src/api/catalog-search';
import { Skeleton, Screen } from '../src/design/primitives';
import { useScreenReady } from '../src/analytics/timing';
import { bills, index, roster, people, manifest, slugs } from './pinned';
import { IDLE_HOLD_MS, SearchIdle } from '../src/features/search/SearchIdle';
import { SearchSuggestions } from '../src/features/search/SearchSuggestions';
import { ResultsView } from '../src/features/search/ResultsView';
jest.mock('../src/analytics/timing', () => ({ useScreenReady: jest.fn() }));

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

test.each(['ios', 'android'] as const)(
  'Search on %s waits for the rendered Browse content layout',
  async (platform) => {
    const os = jest.replaceProperty(Platform, 'OS', platform);
    jest
      .mocked(catalogs.suggestionSourcesOnFocus)
      .mockReturnValue(new Promise(() => {}));
    let renderer!: TestRenderer.ReactTestRenderer;
    try {
      await act(async () => {
        renderer = TestRenderer.create(
          withNavigationOptions(<Search />, () => {}),
        );
      });
      // The catalogues are still loading: the idle lists wait for them only
      // so long, then draw once, in their final places.
      expect(ids(renderer)).not.toContain('search-browse-person');
      await act(
        async () => new Promise((done) => setTimeout(done, IDLE_HOLD_MS + 20)),
      );
      expect(ids(renderer)).toContain('search-browse-person');
      expect(useScreenReady).toHaveBeenLastCalledWith('/search', false);
      // A viewport measurement alone is not the content-ready signal.
      const scroll = renderer.root.findByType(ScrollView);
      const frame = (width: number, height: number) => ({
        nativeEvent: { layout: { width, height, x: 0, y: 0 } },
      });
      act(() => scroll.props.onLayout(frame(390, 800)));
      expect(useScreenReady).toHaveBeenLastCalledWith('/search', false);
      const onContentLayout =
        renderer.root.findByType(Screen).props.onContentLayout;
      const content = renderer.root
        .findAllByType(View)
        .find((node) => node.props.onLayout === onContentLayout)!;
      expect(content).toBeDefined();
      act(() => content.props.onLayout(frame(390, 0)));
      expect(useScreenReady).toHaveBeenLastCalledWith('/search', false);
      act(() => content.props.onLayout(frame(390, 400)));
      expect(useScreenReady).toHaveBeenLastCalledWith('/search', true);
    } finally {
      if (renderer) act(() => renderer.unmount());
      os.restore();
    }
  },
);

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
  await act(
    async () => new Promise((done) => setTimeout(done, IDLE_HOLD_MS + 20)),
  );
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

  test('with the field active nothing scrolls above the safe area; results that keep the bar are not cut', async () => {
    const version = Object.getOwnPropertyDescriptor(Platform, 'Version');
    Object.defineProperty(Platform, 'Version', {
      configurable: true,
      value: 26,
    });
    let renderer!: TestRenderer.ReactTestRenderer;
    try {
      await act(async () => {
        renderer = TestRenderer.create(
          <SafeAreaInsetsContext.Provider
            value={{ top: 62, bottom: 34, left: 0, right: 0 }}
          >
            {withNavigationOptions(<Search />, (options) => {
              if (options.headerSearchBarOptions) mockBar.options = options;
            })}
          </SafeAreaInsetsContext.Provider>,
        );
      });
      const frame = () =>
        StyleSheet.flatten(renderer.root.findByType(ScrollView).props.style);
      const top = () => frame().marginTop ?? 0;
      const bar = () => mockBar.options!.headerSearchBarOptions;
      const scroll = renderer.root.findByType(ScrollView);
      // Browse, under the large title: the bar is there, nothing is cut.
      expect(top()).toBe(0);
      // Results opened without the field taking focus (a link, a Try row):
      // the bar is still showing. Cutting the page here would put UIKit's
      // large title in the space and pin the scope control behind the bar.
      await type('zzzzzz');
      await act(async () =>
        renderer.root.findByType(SearchSuggestions).props.onSeeAll('people'),
      );
      expect(renderer.root.findAllByType(ResultsView)).toHaveLength(1);
      expect(top()).toBe(0);
      // The field takes focus: the bar is gone (iOS 26). The scroll view
      // starts at the status bar's lower edge, so no row is drawn above it
      // whatever the bar's background is. It keeps its own overflow.
      await act(async () => bar().onFocus());
      expect(top()).toBe(62);
      expect(frame().overflow).not.toBe('hidden');
      // Typing, and the results after it, with the keyboard down: the field
      // is still active and the page still cut. The same scroll view
      // throughout: nothing is remounted or laid over it.
      await type('hous');
      expect(top()).toBe(62);
      await act(async () =>
        renderer.root.findByType(SearchSuggestions).props.onSeeAll('people'),
      );
      expect(top()).toBe(62);
      const results = renderer.root.findByType(ScrollView);
      expect(results).toBe(scroll);
      expect(results.props.stickyHeaderIndices).toEqual([0]);
      // Cancel with a query submitted: the results return under the bar,
      // uncut.
      await act(async () => bar().onCancelButtonPress());
      expect(renderer.root.findAllByType(ResultsView)).toHaveLength(1);
      expect(top()).toBe(0);
    } finally {
      if (renderer) act(() => renderer.unmount());
      if (version) Object.defineProperty(Platform, 'Version', version);
    }
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
