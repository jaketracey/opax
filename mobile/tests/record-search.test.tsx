import { withNavigationOptions } from './navigation-options';
// The cost guard (journeys/search.md 3.4 and 10): zero requests while
// typing, at most one paid request per explicit action, scope switches and
// Back from the session cache, paging only on tap, and superseded requests
// still counted (an abandoned ARAG read may be charged).
import { HeaderHeightContext } from 'expo-router/react-navigation';
import { act } from 'react';
import { ScrollView } from 'react-native';
import TestRenderer from 'react-test-renderer';
import { searchFixture } from '../scripts/search-fixture';
import { ScopeBar } from '../src/features/search/ScopeBar';
import { resetSearchSession } from '../src/features/search/requests';
import { resetShownPages } from '../src/features/search/speeches';
import { memberSuggestionRoster } from '../src/api/catalog-search';
import { bills, index, manifest, people, roster, slugs } from './pinned';

const mockCalls: string[] = [];
const mockGate: { hold: boolean; release: (() => void)[] } = {
  hold: false,
  release: [],
};
jest.mock('../src/api/runtime', () => {
  const { ApiClient } = jest.requireActual('../src/api/client');
  const { CatalogCache } = jest.requireActual('../src/api/cache');
  const { RecordSearch } = jest.requireActual('../src/features/search/api');
  const { searchFixture: fixture } = jest.requireActual(
    '../scripts/search-fixture',
  );
  const { roster: pinnedRoster } = jest.requireActual('./pinned');
  const store = {
    index: [] as unknown[],
    data: new Map(),
    readIndex: async () => store.index,
    writeIndex: async (v: unknown[]) => {
      store.index = v;
    },
    read: async (url: string) => store.data.get(url),
    write: async (v: { url: string }) => {
      store.data.set(v.url, v);
    },
    remove: async (url: string) => {
      store.data.delete(url);
    },
  };
  const transport = async (url: RequestInfo | URL) => {
    const u = new URL(String(url));
    mockCalls.push(u.pathname + u.search);
    if (mockGate.hold && u.searchParams.get('kind') !== 'report')
      await new Promise<void>((done) => mockGate.release.push(done));
    const body = fixture(u, pinnedRoster);
    if (!body) return new Response('{}', { status: 404 });
    let text = body.body.toString();
    // "tax" stands for a long result list: three pages of speeches.
    if (u.pathname === '/api/search' && u.searchParams.get('q') === 'tax') {
      const page = JSON.parse(text);
      page.page = Number(u.searchParams.get('page') ?? 1);
      page.page_count = 3;
      page.total = Math.max(page.total, 60);
      text = JSON.stringify(page);
    }
    return new Response(text, {
      headers: {
        'content-type': body.contentType ?? 'application/json',
        'cache-control': 'no-store',
      },
    });
  };
  return {
    recordSearch: new RecordSearch(
      new ApiClient({
        origin: 'https://example.test',
        version: '0.1.0',
        build: '7',
        cache: new CatalogCache(store),
        transport,
        retries: 0,
        sleep: async () => undefined,
      }),
    ),
    catalogs: {
      search: jest.fn(),
      suggestionSources: jest.fn(),
      suggestionSourcesOnFocus: jest.fn(),
    },
  };
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

const { catalogs } = jest.requireMock('../src/api/runtime');
const { SearchScreen } = jest.requireActual<
  typeof import('../src/features/search/SearchScreen')
>('../src/features/search/SearchScreen');

beforeEach(() => {
  mockCalls.length = 0;
  mockGate.hold = false;
  mockGate.release = [];
  resetSearchSession();
  resetShownPages();
  const source = { stale: false, savedAt: 1, asAt: null, sources: [] };
  const ready = {
    roster: memberSuggestionRoster(roster, { roster, manifest, slugs, people }),
    people,
    manifest,
    slugs,
    electorates: index,
    bills,
    provenance: { people: source, electorates: source, bills: source },
  };
  catalogs.suggestionSourcesOnFocus.mockResolvedValue(ready);
  catalogs.suggestionSources.mockResolvedValue(ready);
});

const paid = () =>
  mockCalls.filter(
    (path) =>
      /^\/api\/search(-summary|-all)?\?/.test(path) &&
      new URL(path, 'https://example.test').searchParams.get('kind') !==
        'report',
  );
const bar = () => mockBar.options!.headerSearchBarOptions;
const type = (text: string) =>
  act(async () => bar().onChangeText({ nativeEvent: { text } }));
const submit = (text: string) =>
  act(async () => bar().onSearchButtonPress({ nativeEvent: { text } }));
const byID = (r: TestRenderer.ReactTestRenderer, id: string) =>
  r.root.findAll((n) => n.props.testID === id && n.props.onPress)[0];

async function mount() {
  let r!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    r = TestRenderer.create(
      withNavigationOptions(<SearchScreen />, (options) => {
        if (options.headerSearchBarOptions) mockBar.options = options;
      }),
    );
  });
  return r;
}

test('typing makes no paid request; Search reads speeches and reports; scope switches reuse both', async () => {
  const r = await mount();
  expect(paid()).toEqual([]);
  for (const text of ['h', 'ho', 'hou', 'hous', 'housi', 'housing'])
    await type(text);
  expect(
    r.root.findAll((n) => n.props.testID === 'search-suggestions'),
  ).not.toHaveLength(0);
  expect(paid()).toEqual([]);
  await submit('housing');
  expect(paid()).toHaveLength(1);
  expect(paid()[0]).toMatch(/^\/api\/search\?/);
  expect(
    mockCalls.filter(
      (path) =>
        new URL(path, 'https://example.test').searchParams.get('kind') ===
        'report',
    ),
  ).toHaveLength(1);
  const scopes = () => r.root.findByType(ScopeBar).props.onChange;
  await act(async () => scopes()('people'));
  await act(async () => scopes()('bills'));
  await act(async () => scopes()('all'));
  // Speeches by relevance is All's own read: still one.
  await act(async () => scopes()('speeches'));
  expect(paid()).toHaveLength(1);
  // Re-submitting the same words is answered by the session cache.
  await submit('housing');
  expect(paid()).toHaveLength(1);
  await act(async () => r.unmount());
});

test('"Show 20 more" and Summarise are one request per tap, never on render', async () => {
  const r = await mount();
  // RecordSearch keeps a session per path: each test uses its own words.
  await submit('tax');
  await act(async () => r.root.findByType(ScopeBar).props.onChange('speeches'));
  expect(paid()).toHaveLength(1);
  const more = byID(r, 'results-more');
  expect(more.props.title).toBe('Show 20 more speeches');
  await act(async () => more.props.onPress());
  expect(paid()).toHaveLength(2);
  expect(paid()[1]).toContain('page=2');
  const summarise = byID(r, 'results-summarise');
  expect(paid().filter((p) => p.startsWith('/api/search-summary'))).toEqual([]);
  await act(async () => summarise.props.onPress());
  expect(paid()).toHaveLength(3);
  expect(paid().at(-1)).toMatch(/^\/api\/search-summary\?/);
  await act(async () => r.unmount());
});

test('a superseded submit is still counted, and its late answer is never drawn', async () => {
  const r = await mount();
  mockGate.hold = true;
  await submit('energy');
  await submit('climate');
  // Two explicit actions, two requests: the first may still be charged.
  expect(paid()).toHaveLength(2);
  mockGate.hold = false;
  // Answer the newer request first, then the abandoned one.
  await act(async () => {
    mockGate.release[1]?.();
    mockGate.release[0]?.();
  });
  await act(async () => undefined);
  const shown = r.root.findAll(
    (n) =>
      typeof n.props.testID === 'string' &&
      n.props.testID.startsWith('search-results-'),
  );
  expect(shown.length).toBeGreaterThan(0);
  // The view is keyed by "climate": its rows are the "climate" page's.
  const highlighted = r.root
    .findAll((n) => n.props.excerpt?.highlight)
    .flatMap((n) => n.props.excerpt.highlight as string[]);
  expect(highlighted.every((word) => /climate/i.test(word))).toBe(true);
  expect(paid()).toHaveLength(2);
  await act(async () => r.unmount());
});

test.each([
  // Search's translucent root bar lies over a scroll view at the window's
  // top: the rest is unchanged, a header above zero.
  ['under its translucent root bar', 0, -116],
  // With its large title off and a solid bar, the root bar is opaque and
  // react-native-screens lays the page out below it: the rest is 0.
  ['below a solid bar', 116, 0],
] as const)(
  'a submitted search starts at its resting top %s',
  async (_case, top, y) => {
    const measure = jest
      .spyOn(
        ScrollView.prototype as unknown as {
          measureInWindow: (callback: (x: number, y: number) => void) => void;
        },
        'measureInWindow',
      )
      .mockImplementation((callback) => callback(0, top));
    const scrollTo = jest
      .spyOn(
        ScrollView.prototype as unknown as { scrollTo: () => void },
        'scrollTo',
      )
      .mockImplementation(() => undefined);
    let r!: TestRenderer.ReactTestRenderer;
    try {
      await act(async () => {
        r = TestRenderer.create(
          <HeaderHeightContext.Provider value={116}>
            {withNavigationOptions(<SearchScreen />, (options) => {
              if (options.headerSearchBarOptions) mockBar.options = options;
            })}
          </HeaderHeightContext.Provider>,
        );
      });
      scrollTo.mockClear();
      await submit('housing');
      expect(scrollTo).toHaveBeenLastCalledWith({ y, animated: false });
    } finally {
      await act(async () => r?.unmount());
      measure.mockRestore();
      scrollTo.mockRestore();
    }
  },
);

test('the fixture answers searches the way the cost guard expects', () => {
  const page = searchFixture(
    new URL('https://example.test/api/search?q=housing&kind=speech&per=20'),
    roster,
  );
  expect(page).not.toBeNull();
});
