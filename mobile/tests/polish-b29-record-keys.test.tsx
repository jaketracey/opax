// iPad (polish b29): in the Search split the keyboard's Up and Down walk the
// result rows in the order they are drawn, the pane opens on the first row
// rather than an empty pane, and the arrows go quiet while Search is not
// the focused screen.
import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import { NavigationContext } from 'expo-router/react-navigation';
import Search from '../src/features/Search';
import { dispatchKeyCommand } from '../src/design/keyboard';
import { SplitLayout } from '../src/design/primitives';
import { ScopeBar } from '../src/features/search/ScopeBar';
import { catalogs, recordSearch } from '../src/api/runtime';
import { memberSuggestionRoster } from '../src/api/catalog-search';
import { bills, index, manifest, people, roster, slugs } from './pinned';
import { decodeRecords } from '../src/features/search/decoders';

const mockFocus = { active: true, listeners: new Set<() => void>() };
const mockNavigation = {
  setOptions: (options: Record<string, unknown>) => {
    if (options.headerSearchBarOptions) mockBar.options = options;
  },
  isFocused: () => mockFocus.active,
  addListener: (_event: string, listener: () => void) => {
    mockFocus.listeners.add(listener);
    return () => mockFocus.listeners.delete(listener);
  },
};
const mockBar: { options?: Record<string, any> } = {};
const mockDetail: string[] = [];
jest.mock('expo-router', () => ({
  useIsPreview: () => false,
  router: { push: jest.fn(), setParams: jest.fn() },
  Link: Object.assign(({ children }: { children: unknown }) => children, {
    Trigger: ({ children }: { children: unknown }) => children,
    Preview: () => null,
    Menu: () => null,
    MenuAction: () => null,
  }),
  useSegments: () => [],
  Stack: {
    Screen: ({ options }: { options?: Record<string, any> }) => {
      if (options?.headerSearchBarOptions) mockBar.options = options;
      return null;
    },
  },
  useLocalSearchParams: () => ({}),
  useFocusEffect: (effect: () => void | (() => void)) => {
    jest.requireActual('react').useEffect(() => {
      let cleanup: void | (() => void);
      const changed = () => {
        if (typeof cleanup === 'function') cleanup();
        cleanup = mockFocus.active ? effect() : undefined;
      };
      changed();
      mockFocus.listeners.add(changed);
      return () => {
        mockFocus.listeners.delete(changed);
        if (typeof cleanup === 'function') cleanup();
      };
    }, [effect]);
  },
}));
jest.mock('../src/design/adaptive', () => ({
  ...jest.requireActual('../src/design/adaptive'),
  isPad: true,
  useAdaptiveDevice: () => true,
  useLayout: () => ({
    rule: 'pad',
    size: 'regular',
    regular: true,
    wide: true,
    split: true,
    width: 1180,
    height: 800,
    window: { width: 1180, height: 800 },
    landscape: true,
  }),
}));
jest.mock('../src/api/runtime', () => ({
  catalogs: {
    suggestionSourcesOnFocus: jest.fn(),
    suggestionSources: jest.fn(),
    search: jest.fn(),
  },
  recordSearch: { search: jest.fn(), summary: jest.fn() },
}));
jest.mock('../src/features/split/RecordDetail', () => ({
  RecordDetail: ({ entry }: { entry: { kind: string; key: string } }) => {
    mockDetail.push(`${entry.kind}:${entry.key}`);
    return null;
  },
  RecordShare: () => null,
}));

beforeEach(() => {
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
  jest.mocked(recordSearch.search).mockResolvedValue({
    data: decodeRecords({
      query: 'fixture',
      kind: 'speech',
      sort: 'relevance',
      page: 1,
      per_page: 20,
      page_count: 1,
      total: 2,
      count: 2,
      truncated: false,
      years: {},
      results: ['speech-1', 'speech-2'].map((slug) => ({
        kind: 'speech',
        title: `Fixture ${slug}`,
        slug,
        resource: slug,
        speaker: 'Anthony Albanese',
        snippet: '',
        href: `/doc/${slug}`,
      })),
    }),
    stale: false,
    savedAt: 0,
    asOf: null,
  } as never);
});

test('result rows keep arrow order, and the pane opens on the first row', async () => {
  let tree!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    tree = TestRenderer.create(
      <NavigationContext.Provider
        value={
          mockNavigation as unknown as React.ContextType<
            typeof NavigationContext
          >
        }
      >
        <Search />
      </NavigationContext.Provider>,
    );
  });
  await act(async () =>
    mockBar.options!.headerSearchBarOptions.onSearchButtonPress({
      nativeEvent: { text: 'fixture' },
    }),
  );
  await act(async () =>
    tree.root.findByType(ScopeBar).props.onChange('speeches'),
  );
  const split = () => tree.root.findByType(SplitLayout).props;
  expect(split().keys).toEqual(['doc:speech-1', 'doc:speech-2']);
  // Never an empty pane: the first row opens there.
  expect(mockDetail.at(-1)).toBe('doc:speech-1');
  const refocus = (active: boolean) =>
    act(() => {
      mockFocus.active = active;
      for (const listener of [...mockFocus.listeners]) listener();
    });
  try {
    refocus(false);
    expect(dispatchKeyCommand('list-down')).toBe(false);
    refocus(true);
    act(() => {
      expect(dispatchKeyCommand('list-down')).toBe(true);
    });
    expect(mockDetail.at(-1)).toBe('doc:speech-2');
  } finally {
    act(() => tree.unmount());
    mockFocus.active = true;
    mockFocus.listeners.clear();
  }
});
