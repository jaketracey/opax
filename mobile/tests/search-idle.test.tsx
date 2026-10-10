// TestFlight build 32 (10 Oct): "App froze on this screen" on the idle Search
// tab, and Browse showed placeholder rows that "disappear without loading
// anything". Both came from the suggestion catalogs Search loads on focus.
import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import Search from '../src/features/Search';
import { catalogs } from '../src/api/runtime';
import { memberSuggestionRoster } from '../src/api/catalog-search';
import { Field, LoadingState, PersonRow } from '../src/design/primitives';
import { bills, index, roster, people, manifest, slugs } from './pinned';

jest.mock('../src/api/runtime', () => ({
  catalogs: {
    suggestionSources: jest.fn(),
    suggestionSourcesOnFocus: jest.fn(),
    search: jest.fn(),
  },
}));
jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  useFocusEffect: (effect: () => void | (() => void)) =>
    jest
      .requireActual<typeof import('react')>('react')
      .useEffect(effect, [effect]),
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

test('idle Browse never shows a placeholder for suggestions it does not draw', async () => {
  const source = { stale: false, savedAt: null, asAt: null, sources: [] };
  const sources = {
    roster: memberSuggestionRoster(roster, { roster, manifest, slugs, people }),
    people,
    manifest,
    slugs,
    electorates: index,
    bills,
    provenance: { people: source, electorates: source, bills: source },
  } as unknown as Awaited<ReturnType<typeof catalogs.suggestionSources>>;
  let resolve!: (value: typeof sources) => void;
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
  expect(renderer.root.findAllByType(LoadingState)).toHaveLength(0);
  expect(
    renderer.root.findAllByProps({ testID: 'search-browse-person' }).length,
  ).toBeGreaterThan(0);
  // A typed query waits on them visibly, then resolves to suggestions.
  await act(async () =>
    renderer.root.findByType(Field).props.onChangeText('Albanese'),
  );
  expect(renderer.root.findAllByType(LoadingState)).toHaveLength(1);
  await act(async () => resolve(sources));
  expect(renderer.root.findAllByType(LoadingState)).toHaveLength(0);
  expect(renderer.root.findAllByType(PersonRow).length).toBeGreaterThan(0);
  await act(async () => renderer.unmount());
});
