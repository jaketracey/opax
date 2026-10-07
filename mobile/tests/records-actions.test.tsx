import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import { Button, LinkRow } from '../src/design/primitives';
import { RecordSearchForm } from '../src/features/search/RecordSearchForm';
import { ResultFilters, Results } from '../src/features/search/Results';
import { FiltersSheet } from '../src/features/search/FiltersSheet';
import { recordSearch } from '../src/api/runtime';
import { defaultFilters } from '../src/features/search/contracts';
import { decodeRecords, decodeSummary } from '../src/features/search/decoders';
import { searchFixture } from '../scripts/search-fixture';
import { roster } from './pinned';
jest.mock('../src/api/runtime', () => ({
  recordSearch: { search: jest.fn(), summary: jest.fn(), briefs: jest.fn() },
}));
jest.mock('../src/features/search/navigation', () => ({
  openSearchPath: jest.fn(),
}));
jest.mock('../src/navigation/share', () => ({ shareRecord: jest.fn() }));
const parsed = (path: string) =>
  JSON.parse(
    searchFixture(
      new URL(path, 'http://127.0.0.1:8942'),
      roster,
    )!.body.toString(),
  );
const props = {
  query: 'housing',
  scope: 'records',
  roster,
  onSubmitted: jest.fn(),
  onQuery: jest.fn(),
  submitRef: { current: null },
  submitAction: { current: null },
};
beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  jest.mocked(recordSearch.search).mockResolvedValue({
    data: decodeRecords(parsed('/api/search?q=housing&kind=all')),
    savedAt: 1000,
    stale: false,
    asOf: null,
  });
  jest.mocked(recordSearch.briefs).mockResolvedValue(null);
  jest.mocked(recordSearch.summary).mockResolvedValue({
    data: decodeSummary({ status: 'empty' }),
    savedAt: 1000,
    stale: false,
    asOf: null,
  });
});
afterEach(() => jest.useRealTimers());
async function mount() {
  let r!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    r = TestRenderer.create(<RecordSearchForm {...props} />);
  });
  return r;
}
function button(r: TestRenderer.ReactTestRenderer, id: string) {
  return [
    ...r.root.findAllByType(Button),
    ...r.root.findAllByType(LinkRow),
  ].find((b) => b.props.testID === id)!;
}
async function submit(r: TestRenderer.ReactTestRenderer) {
  await act(async () => button(r, 'search-submit').props.onPress());
  await act(async () => jest.advanceTimersByTime(400));
}
test('launch, mount, typing and filter dismissal call no paid route; submit coalesces and debounces 400 ms', async () => {
  const r = await mount();
  expect(recordSearch.search).not.toHaveBeenCalled();
  await act(async () =>
    r.update(<RecordSearchForm {...props} query="housing affordability" />),
  );
  await act(async () => button(r, 'search-filters').props.onPress());
  await act(async () => r.root.findByType(FiltersSheet).props.onClose());
  expect(recordSearch.search).not.toHaveBeenCalled();
  await act(async () => {
    button(r, 'search-submit').props.onPress();
    button(r, 'search-submit').props.onPress();
    jest.advanceTimersByTime(399);
  });
  expect(recordSearch.search).not.toHaveBeenCalled();
  await act(async () => jest.advanceTimersByTime(1));
  expect(recordSearch.search).toHaveBeenCalledTimes(1);
  expect(recordSearch.briefs).not.toHaveBeenCalled();
  expect(recordSearch.summary).not.toHaveBeenCalled();
  await act(async () => r.unmount());
});
test('Apply makes one request, reset page one; sort and paging make one each; summaries and briefs are tap-only', async () => {
  const r = await mount();
  await submit(r);
  await act(async () => button(r, 'search-filters').props.onPress());
  const f = {
    ...defaultFilters,
    party: 'Labor',
    from: '2025',
    to: '2026',
    kind: 'speech',
  };
  await act(async () => r.root.findByType(FiltersSheet).props.onApply(f));
  expect(recordSearch.search).toHaveBeenLastCalledWith(
    'housing',
    f,
    1,
    'relevance',
  );
  expect(recordSearch.search).toHaveBeenCalledTimes(2);
  await act(async () => r.root.findByType(Results).props.onSort('newest'));
  expect(recordSearch.search).toHaveBeenCalledTimes(3);
  await act(async () => r.root.findByType(Results).props.onPage(2));
  expect(recordSearch.search).toHaveBeenLastCalledWith(
    'housing',
    f,
    2,
    'newest',
  );
  expect(recordSearch.search).toHaveBeenCalledTimes(4);
  expect(recordSearch.summary).not.toHaveBeenCalled();
  expect(recordSearch.briefs).not.toHaveBeenCalled();
  await act(async () => r.root.findByType(Results).props.onRead('briefs'));
  expect(recordSearch.briefs).toHaveBeenCalledTimes(1);
  await act(async () => r.root.findByType(Results).props.onSummary());
  expect(recordSearch.summary).toHaveBeenCalledTimes(1);
  await act(async () => r.unmount());
});
test('changing the query before the debounce and unmounting cancel pending submissions', async () => {
  const r = await mount();
  await act(async () => button(r, 'search-submit').props.onPress());
  await act(async () =>
    r.update(<RecordSearchForm {...props} query="changed" />),
  );
  await act(async () => jest.advanceTimersByTime(400));
  expect(recordSearch.search).not.toHaveBeenCalled();
  await act(async () => button(r, 'search-submit').props.onPress());
  await act(async () => r.unmount());
  await act(async () => jest.advanceTimersByTime(400));
  expect(recordSearch.search).not.toHaveBeenCalled();
});
test('clearing filters and choosing an example preserve the selected grant catalog', async () => {
  let r!: TestRenderer.ReactTestRenderer;
  const base = { ...defaultFilters, kind: 'grant', mode: 'keyword' as const };
  await act(async () => {
    r = TestRenderer.create(
      <RecordSearchForm {...props} scope="grant" query="Community" />,
    );
  });
  await submit(r);
  await act(async () => button(r, 'search-filters').props.onPress());
  expect(r.root.findByType(FiltersSheet).props.fixedKind).toBe('grant');
  await act(async () =>
    r.root
      .findByType(FiltersSheet)
      .props.onApply({ ...defaultFilters, party: 'Labor' }),
  );
  expect(recordSearch.search).toHaveBeenLastCalledWith(
    'Community',
    { ...base, party: 'Labor' },
    1,
    'relevance',
  );
  await act(async () => r.root.findByType(ResultFilters).props.onRemove('all'));
  expect(recordSearch.search).toHaveBeenLastCalledWith(
    'Community',
    base,
    1,
    'relevance',
  );
  await act(async () => r.root.findByType(Results).props.onExample('Woodside'));
  expect(recordSearch.search).toHaveBeenLastCalledWith(
    'Woodside',
    base,
    1,
    'relevance',
  );
  await act(async () => r.unmount());
});
