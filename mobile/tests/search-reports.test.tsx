import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import { router } from 'expo-router';
import { recordSearch } from '../src/api/runtime';
import { decodeRecord } from '../src/features/search/decoders';
import { SearchSuggestions } from '../src/features/search/SearchSuggestions';
import { AllResults } from '../src/features/search/AllResults';
import { ReportResults, ReportRow } from '../src/features/search/ReportResults';
import { GroupResults } from '../src/features/search/GroupResults';
import { ResultsView } from '../src/features/search/ResultsView';
import { ResultsHeader } from '../src/features/search/ResultsHeader';
import { defaultSpeechFilters } from '../src/features/search/filters';
import { ApiError } from '../src/api/errors';
import {
  resetSearchSession,
  type GroupPage,
} from '../src/features/search/requests';
import { reportRoute } from '../src/navigation/routes/records';
import { resultsRoute } from '../src/navigation/routes/search';
import royal from './fixtures/reports/royal.json';
import agency from './fixtures/reports/agency.json';
jest.mock('../src/api/runtime', () => ({
  recordSearch: { search: jest.fn() },
}));
jest.mock('expo-router', () => ({
  useIsPreview: () => false,
  useSegments: () => [],
  router: { push: jest.fn() },
  Link: Object.assign(({ children }: { children: unknown }) => children, {
    Trigger: ({ children }: { children: unknown }) => children,
    Preview: () => null,
    Menu: () => null,
    MenuAction: () => null,
  }),
}));
const rows = [agency, royal].map((r) =>
  decodeRecord({
    ...r,
    resource: '',
    source_url: r.citation.url,
    source: r.body,
    href: `/report/${r.slug}`,
  }),
);
const data: GroupPage = {
  results: rows as GroupPage['results'],
  total: 2,
  page: 1,
  per_page: 20,
  query: 'robodebt',
  warnings: [],
};
const ready = {
  status: 'ready' as const,
  result: { data, stale: false, savedAt: 1, asOf: null },
};
const recover = {
  onAsk: jest.fn(),
  onAll: jest.fn(),
  onClearFilters: jest.fn(),
  onUnquote: jest.fn(),
};
beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  resetSearchSession();
  jest.mocked(recordSearch.search).mockResolvedValue({
    ...ready.result,
    data: { ...data, kind: 'report' },
  } as never);
});
afterEach(() => jest.useRealTimers());
const suggestions = (q: string) => (
  <SearchSuggestions
    q={q}
    sources={null}
    loading={false}
    failed={false}
    onRetry={jest.fn()}
    onSearchSpeeches={jest.fn()}
    onAsk={jest.fn()}
    onSeeAll={jest.fn()}
  />
);
const activate = (tree: TestRenderer.ReactTestRenderer, id: string) => {
  const node = tree.root.findAll(
    (n) =>
      n.props.testID === id && (n.props.onAccessibilityTap || n.props.onPress),
  )[0]!;
  return (node.props.onAccessibilityTap || node.props.onPress)();
};
test('debounces report suggestions, retains API order, and opens a native report from a row', async () => {
  let tree!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    tree = TestRenderer.create(suggestions('ro'));
  });
  await act(async () => jest.advanceTimersByTime(200));
  await act(async () => tree.update(suggestions('robodebt')));
  await act(async () => jest.advanceTimersByTime(349));
  expect(recordSearch.search).not.toHaveBeenCalled();
  await act(async () => jest.advanceTimersByTime(1));
  expect(recordSearch.search).toHaveBeenCalledTimes(1);
  expect(recordSearch.search).toHaveBeenCalledWith(
    'robodebt',
    expect.objectContaining({ kind: 'report' }),
    1,
  );
  expect(
    tree.root.findAllByType(ReportRow).map((n) => n.props.row.slug),
  ).toEqual([agency.slug, royal.slug]);
  await act(async () =>
    activate(tree, `search-suggestions-reports-${royal.slug}`),
  );
  expect(router.push).toHaveBeenCalledWith(
    reportRoute(royal.slug, royal.title),
  );
  await act(async () => activate(tree, 'search-suggestions-reports-all'));
  expect(router.push).toHaveBeenLastCalledWith(
    resultsRoute('reports', { group: 'reports', q: 'robodebt' }),
  );
});
test('All draws Reports and See all opens the group list in API order', async () => {
  let tree!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    tree = TestRenderer.create(
      <AllResults
        q="robodebt"
        sources={null}
        roster={null}
        filters={{} as never}
        speeches={{ first: { status: 'ready' }, rows: [] } as never}
        reports={ready}
        onScope={jest.fn()}
        recover={recover as never}
      />,
    );
  });
  expect(tree.root.findByType(ReportResults).props.read).toBe(ready);
  expect(
    tree.root.findAllByType(ReportRow).map((n) => n.props.row.slug),
  ).toEqual([agency.slug, royal.slug]);
  await act(async () => activate(tree, 'search-group-reports-all'));
  expect(router.push).toHaveBeenCalledWith(
    resultsRoute('reports', { group: 'reports', q: 'robodebt' }),
  );
});
test('the Reports list uses the shared native rows and quiet type, body and date line', async () => {
  let tree!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    tree = TestRenderer.create(
      <GroupResults
        group="reports"
        q="robodebt"
        list={{ first: ready, rows, more: false } as never}
        recover={recover as never}
      />,
    );
  });
  expect(
    tree.root.findAllByType(ReportRow).map((n) => n.props.row.slug),
  ).toEqual([agency.slug, royal.slug]);
  expect(JSON.stringify(tree.toJSON())).toContain('Royal commission');
  expect(JSON.stringify(tree.toJSON())).toContain(royal.body);
  await act(async () => activate(tree, 'results-reports-1'));
  expect(router.push).toHaveBeenCalledWith(
    reportRoute(royal.slug, royal.title),
  );
});
test('a late suggestion response cannot replace the current query', async () => {
  let resolve!: (value: unknown) => void;
  jest.mocked(recordSearch.search).mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }) as never,
  );
  let tree!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    tree = TestRenderer.create(suggestions('robodebt'));
  });
  await act(async () => jest.advanceTimersByTime(350));
  await act(async () => tree.update(suggestions('unmatched')));
  jest.mocked(recordSearch.search).mockResolvedValue({
    ...ready.result,
    data: { ...data, kind: 'report', results: [], total: 0 },
  } as never);
  await act(async () => jest.advanceTimersByTime(350));
  await act(async () =>
    resolve({ ...ready.result, data: { ...data, kind: 'report' } }),
  );
  expect(tree.root.findAllByType(ReportRow)).toHaveLength(0);
});
test('All loads the report group, counts its results, and reuses the read after a scope change', async () => {
  jest.mocked(recordSearch.search).mockImplementation(
    async (_q, f) =>
      ({
        ...ready.result,
        data:
          f.kind === 'report'
            ? { ...data, kind: 'report' }
            : { ...data, results: [], total: 0, kind: 'speech' },
      }) as never,
  );
  const provenance = { stale: false, savedAt: 1, asAt: null, sources: [] };
  const sources = {
    roster: { people: [] },
    topics: [],
    provenance: {
      people: provenance,
      electorates: provenance,
      bills: provenance,
    },
  };
  const view = (scope: 'all' | 'bills') => (
    <ResultsView
      q="robodebt"
      scope={scope}
      sources={sources as never}
      filters={defaultSpeechFilters}
      sort="relevance"
      onScope={jest.fn()}
      onOpenFilters={jest.fn()}
      recover={recover as never}
    />
  );
  let tree!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    tree = TestRenderer.create(view('all'));
  });
  expect(tree.root.findAllByType(ReportRow)).toHaveLength(2);
  expect(tree.root.findByType(ResultsHeader).props.count).toBe('2 results');
  expect(recordSearch.search).toHaveBeenCalledTimes(2);
  await act(async () => tree.update(view('bills')));
  await act(async () => tree.update(view('all')));
  expect(recordSearch.search).toHaveBeenCalledTimes(2);
});
test('a failed report group shows the existing inline error and recovers only on retry', async () => {
  jest
    .mocked(recordSearch.search)
    .mockRejectedValueOnce(new ApiError('invalid-data', 'Invalid report row'));
  let tree!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    tree = TestRenderer.create(suggestions('robodebt'));
  });
  await act(async () => jest.advanceTimersByTime(350));
  expect(tree.root.findAllByType(ReportRow)).toHaveLength(0);
  expect(recordSearch.search).toHaveBeenCalledTimes(1);
  const { InlineError } = jest.requireActual('../src/design/primitives');
  const error = tree.root
    .findAllByType(InlineError)
    .find((n) => n.props.testID === 'search-suggestions-reports-error')!;
  await act(async () => error.props.onRetry());
  expect(tree.root.findAllByType(ReportRow)).toHaveLength(2);
  expect(recordSearch.search).toHaveBeenCalledTimes(2);
});
