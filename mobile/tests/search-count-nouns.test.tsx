import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import { catalogs } from '../src/api/runtime';
import { useGroupList } from '../src/features/search/GroupResults';
import {
  groupKey,
  request,
  resetSearchSession,
} from '../src/features/search/requests';
import { ResultsHeader } from '../src/features/search/ResultsHeader';
import { ResultsScreen } from '../src/features/search/ResultsScreen';
import { bills, index, roster } from './pinned';
import { withNavigationOptions } from './navigation-options';

let mockParams: Record<string, string> = {};
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

beforeEach(resetSearchSession);

test('one government agency is counted in the singular', async () => {
  let count: string | null = null;
  function Probe() {
    count = useGroupList('agencies', 'fixture').count;
    return null;
  }
  await act(async () => {
    await request(
      groupKey('agencies', 'fixture', 1),
      async () =>
        ({
          data: {
            page: 1,
            per_page: 20,
            total: 1,
            results: [
              {
                kind: 'agency',
                title: 'Fixture Agency',
                slug: 'fixture-agency',
                snippet: '',
              },
            ],
          },
          stale: false,
          savedAt: 1,
          asOf: null,
        }) as never,
    );
    TestRenderer.create(<Probe />);
  });
  expect(count).toBe('1 government agency');
});

test('a pushed local list with one match counts it in the singular', async () => {
  const source = { stale: false, savedAt: 1, asAt: null, sources: [] };
  jest.mocked(catalogs.suggestionSourcesOnFocus).mockResolvedValue({
    roster,
    electorates: index,
    bills,
    provenance: { people: source, electorates: source, bills: source },
  } as never);
  mockParams = { kind: 'parties', group: 'parties', q: 'Greens' };
  let view!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    view = TestRenderer.create(
      withNavigationOptions(<ResultsScreen />, () => {}),
    );
  });
  expect(view.root.findByType(ResultsHeader).props.count).toBe('1 party');
});
