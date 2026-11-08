// TestFlight build 32 (10 Oct): "App froze on this screen" on the idle Search
// tab, and Browse showed placeholder rows that "disappear without loading
// anything". Both came from the suggestion catalogs Search loads on focus.
import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import Search from '../src/features/Search';
import { catalogs } from '../src/api/runtime';
import { memberSuggestionRoster } from '../src/api/catalog-search';
import { Skeleton } from '../src/design/primitives';
import { bills, index, roster, people, manifest, slugs } from './pinned';

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
    renderer = TestRenderer.create(<Search />);
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
    r = TestRenderer.create(<Search />);
  });
  await type('zzzzzz');
  expect(ids(r)).not.toContain('search-suggestions-empty');
  expect(ids(r)).toContain('search-speeches-row');
  expect(ids(r)).toContain('search-ask-row');
  expect(ids(r)).not.toContain('search-top-suggestion');
  await act(async () => r.unmount());
});
