// Design pass 5, lane A (docs/design/review-2026-10/pass5-app-critique.md):
// Search after submitting. P1-1: once a query is answered the form stops
// asking (no Kind row, no submit pill), Filters joins the count line and
// share goes under ⋯ (P3-14), and Summarise sits under the first three
// results. P2-11: one machine pill for a list of briefs, and the results'
// source line names the records' own sources, dated. P3-12: no Refresh
// without suggestions, and one ellipsis after a cut passage.
import { act } from 'react';
import { Text as NativeText } from 'react-native';
import TestRenderer from 'react-test-renderer';
import Search from '../src/features/Search';
import { catalogs } from '../src/api/runtime';
import { showMenu } from '../src/design/menu';
import {
  Button,
  Field,
  IconButton,
  LinkRow,
  MachineLabel,
  SourceLine,
  sourceLineParts,
} from '../src/design/primitives';
import { KindPicker } from '../src/features/search/KindPicker';
import {
  Results,
  SUMMARY_AFTER,
  resultDates,
  resultSources,
} from '../src/features/search/Results';
import { oneEllipsis } from '../src/features/search/Excerpt';
import { decodeRecords } from '../src/features/search/decoders';
import records from '../scripts/fixtures/search/records.json';
import { bills, index, roster, people, manifest, slugs } from './pinned';

jest.mock('../src/api/runtime', () => ({
  catalogs: {
    suggestionSources: jest.fn(),
    suggestionSourcesOnFocus: jest.fn(),
    search: jest.fn(),
  },
}));
jest.mock('../src/design/menu', () => ({ showMenu: jest.fn() }));
jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  useFocusEffect: (effect: () => void | (() => void)) =>
    jest
      .requireActual<typeof import('react')>('react')
      .useEffect(effect, [effect]),
}));

beforeEach(() => {
  jest.clearAllMocks();
  const source = { stale: false, savedAt: null, asAt: null, sources: [] };
  jest.mocked(catalogs.suggestionSourcesOnFocus).mockResolvedValue({
    roster,
    people,
    manifest,
    slugs,
    electorates: index,
    bills,
    provenance: { people: source, electorates: source, bills: source },
  } as unknown as Awaited<ReturnType<typeof catalogs.suggestionSources>>);
});

const ids = (renderer: TestRenderer.ReactTestRenderer) =>
  renderer.root
    .findAll((n) => typeof n.props.testID === 'string')
    .map((n) => n.props.testID as string);

test('an answered search stops asking: no Kind row or submit pill, the kind is its scope', async () => {
  jest.mocked(catalogs.search).mockResolvedValue({
    data: {
      query: 'zzzz',
      results: [],
      warnings: [],
      total: 0,
      page: 1,
      pages: 1,
    },
    stale: false,
    savedAt: 100,
    asOf: null,
  } as unknown as Awaited<ReturnType<typeof catalogs.search>>);
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(<Search />);
  });
  await act(async () =>
    renderer.root.findByType(Field).props.onChangeText('zzzz'),
  );
  // Asking: the Kind row and the submit pill.
  expect(renderer.root.findByType(KindPicker).props.compact).toBe(false);
  expect(
    renderer.root
      .findAllByType(LinkRow)
      .some((r) => r.props.testID === 'search-kind-menu'),
  ).toBe(true);
  await act(async () =>
    renderer.root
      .findAllByType(Button)
      .find((b) => b.props.testID === 'search-submit')!
      .props.onPress(),
  );
  // Answered: one quiet "People ⌄" under the field, and no pill.
  expect(renderer.root.findByType(KindPicker).props.compact).toBe(true);
  const kind = renderer.root
    .findAllByType(Button)
    .find((b) => b.props.testID === 'search-kind-menu')!;
  expect(kind.props).toMatchObject({
    label: 'People',
    accessibilityLabel: 'Kind: People',
    variant: 'quiet',
  });
  expect(ids(renderer)).not.toContain('search-submit');
  // The keyboard's Search key still submits.
  expect(renderer.root.findByType(Field).props.returnKeyType).toBe('search');
  await act(async () =>
    renderer.root.findByType(Field).props.onSubmitEditing(),
  );
  expect(catalogs.search).toHaveBeenCalledTimes(2);
  // Typing a new query asks again.
  await act(async () =>
    renderer.root.findByType(Field).props.onChangeText('zzzy'),
  );
  expect(renderer.root.findByType(KindPicker).props.compact).toBe(false);
  expect(ids(renderer)).toContain('search-submit');
  await act(async () => renderer.unmount());
});

test('idle Search draws no Refresh with no suggestions on screen', async () => {
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(<Search />);
  });
  expect(ids(renderer)).toContain('search-browse-person');
  expect(ids(renderer)).not.toContain('search-refresh');
  await act(async () =>
    renderer.root.findByType(Field).props.onChangeText('zzzzqqqq'),
  );
  expect(ids(renderer)).toContain('search-suggestions-empty');
  expect(ids(renderer)).not.toContain('search-refresh');
  await act(async () =>
    renderer.root.findByType(Field).props.onChangeText('Albanese'),
  );
  expect(ids(renderer)).toContain('search-refresh');
  await act(async () => renderer.unmount());
});

function page(count: number) {
  const docs = records.filter((r) => r.resource).slice(0, count);
  const data = decodeRecords({
    query: 'housing',
    kind: 'all',
    sort: 'relevance',
    page: 1,
    per_page: 20,
    page_count: 1,
    total: docs.length,
    count: docs.length,
    truncated: false,
    results: docs,
    years: {},
  });
  return { data, stale: false, savedAt: 0, asOf: null };
}

function draw(
  count: number,
  extra: Partial<Parameters<typeof Results>[0]> = {},
) {
  const props = {
    result: page(count),
    busy: false,
    filtered: false,
    sort: 'relevance' as const,
    onSort: jest.fn(),
    onPage: jest.fn(),
    onOpen: jest.fn(),
    onShare: jest.fn(),
    readMode: 'passages' as const,
    onRead: jest.fn(),
    briefs: {},
    briefBusy: false,
    briefError: null,
    onBriefRetry: jest.fn(),
    summary: null,
    summaryBusy: false,
    summaryError: null,
    onSummary: jest.fn(),
    summaryAllowed: true,
    onRecover: jest.fn(),
    onExample: jest.fn(),
    ...extra,
  };
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<Results {...props} />);
  });
  return { renderer, props };
}

test('the count line holds sort, Filters and ⋯; share is under ⋯, not a glyph', () => {
  const onFilters = jest.fn();
  const { renderer, props } = draw(1, { onFilters, filterCount: 2 });
  expect(ids(renderer)).not.toContain('records-share');
  expect(
    renderer.root.findAllByType(IconButton).map((b) => b.props.symbol),
  ).toEqual(['ellipsis']);
  const filters = renderer.root
    .findAllByType(Button)
    .find((b) => b.props.testID === 'search-filters')!;
  expect(filters.props.label).toBe('Filters (2)');
  act(() => filters.props.onPress());
  expect(onFilters).toHaveBeenCalled();
  act(() => renderer.root.findByType(IconButton).props.onPress());
  const [, actions] = jest.mocked(showMenu).mock.calls[0]!;
  expect(actions.map((a) => a.title)).toEqual(['Share this search']);
  actions[0]!.onPress();
  expect(props.onShare).toHaveBeenCalled();
  // Before the form collapses Filters stays in the form, not the count line.
  expect(
    ids(draw(1).renderer).filter((id) => id === 'search-filters'),
  ).toHaveLength(0);
});

test('Summarise sits under the first three results, with its pill', () => {
  const { renderer } = draw(5);
  const order = ids(renderer).filter(
    (id) =>
      id === 'records-summary' ||
      (id.startsWith('records-result-') && !id.endsWith('-title')),
  );
  const at = order.indexOf('records-summary');
  expect(at).toBeGreaterThan(0);
  expect(new Set(order.slice(0, at)).size).toBe(SUMMARY_AFTER);
  expect(
    new Set(order.slice(at + 1).filter((id) => id !== 'records-summary')).size,
  ).toBe(2);
  expect(ids(renderer)).toContain('records-summary-machine');
});

test('Briefs: one pill at the head of the list and none on Summarise', () => {
  const result = page(2);
  const briefs = Object.fromEntries(
    result.data.results.map((r) => [r.resource, `A brief of ${r.slug}.`]),
  );
  const { renderer } = draw(2, { readMode: 'briefs', briefs });
  expect(
    renderer.root.findAllByType(MachineLabel).map((l) => l.props.testID),
  ).toEqual(['records-brief-label']);
});

test('the results source line names the records’ own sources, dated by the records', () => {
  expect(
    resultSources([
      { kind: 'speech', source: null, date: '2023-03-06' },
      { kind: 'speech', source: null, date: '2024-01-02' },
      { kind: 'bill', source: 'Bill register', date: '2023-02-09' },
    ]),
  ).toEqual([
    { label: 'Hansard', asOf: '2024-01-02' },
    { label: 'Bill register', asOf: '2023-02-09' },
  ]);
  // Only a record with no source of its own falls back to the search.
  expect(resultSources([{ kind: 'grant', source: null, date: null }])).toEqual([
    { label: 'OPAX public record search', asOf: null },
  ]);
  expect(resultDates([{ date: '2023-03-06' }])).toBe('6 Mar 2023');
  expect(resultDates([{ date: '2023-03-06' }, { date: '2024-01-02' }])).toBe(
    '6 Mar 2023 to 2 Jan 2024',
  );
  expect(resultDates([{ date: null }])).toBeUndefined();
  const farrell = records.find((r) => r.slug === 'speech-828012')!;
  const data = decodeRecords({
    query: 'Don Farrell',
    kind: 'all',
    sort: 'relevance',
    page: 1,
    per_page: 20,
    page_count: 1,
    total: 1,
    count: 1,
    truncated: false,
    results: [{ ...farrell, source: null }],
    years: {},
  });
  const { renderer } = draw(1, {
    result: { data, stale: false, savedAt: 0, asOf: null },
  });
  const line = renderer.root
    .findAllByType(SourceLine)
    .find((s) => s.props.testID === 'records-sources')!;
  const parts = sourceLineParts(line.props);
  // Not "Date not published · OPAX public record search" under a dated row.
  expect([parts.date, parts.name]).toEqual(['6 Mar 2023', 'Hansard']);
  const text = renderer.root
    .findAllByType(NativeText)
    .map((n) => n.props.children)
    .flat(Infinity)
    .filter((c) => typeof c === 'string')
    .join('\n');
  expect(text).not.toContain('Date not published');
});

test('a cut passage ends in one ellipsis', () => {
  expect(oneEllipsis('ambitious commitments on housing.…')).toBe(
    'ambitious commitments on housing…',
  );
  expect(oneEllipsis('on housing....')).toBe('on housing…');
  expect(oneEllipsis('A whole sentence.')).toBe('A whole sentence.');
  expect(oneEllipsis('cut here…')).toBe('cut here…');
});
