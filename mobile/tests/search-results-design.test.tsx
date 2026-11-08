import { act } from 'react';
import { Text as NativeText } from 'react-native';
import TestRenderer from 'react-test-renderer';
import {
  BigFigure,
  Disclosure,
  RecordRow,
  SegmentedControl,
  ViewOriginal,
} from '../src/design/primitives';
import { SpeechResults } from '../src/features/search/SpeechResults';
import { ResultsHeader } from '../src/features/search/ResultsHeader';
import { speechSource, type SpeechList } from '../src/features/search/speeches';
import { defaultSpeechFilters } from '../src/features/search/filters';
import {
  countLabel,
  resultMeta,
  resultTitle,
  savedCopy,
} from '../src/features/search/present';
import { decodeRecords } from '../src/features/search/decoders';
import records from '../scripts/fixtures/search/records.json';

jest.mock('../src/api/runtime', () => ({
  recordSearch: { search: jest.fn(), summary: jest.fn() },
  catalogs: { search: jest.fn() },
}));
jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  useSegments: () => [],
  Link: Object.assign(({ children }: { children: unknown }) => children, {
    Trigger: ({ children }: { children: unknown }) => children,
    Preview: () => null,
    Menu: () => null,
    MenuAction: () => null,
  }),
}));

// Design pass 3D (concept board 4): each result is one row titled by the
// record's own title, a kind · date line, who spoke, and its passage; the
// count, sort and share share one line; the block ends in one source line.
const farrell = records.find((r) => r.slug === 'speech-828012')!;

test('a result is titled by its own title, never "Name — Kind — ISO date"', () => {
  expect(resultTitle(farrell)).toBe('Bills');
  expect(
    resultTitle({
      title:
        'Wendy Lovell — Consumer and Planning Legislation Amendment (Housing Statement Reform) Bill 2024 - Second reading — 2025-02-20',
      speaker: 'Wendy Lovell',
      date: '2025-02-20',
      kind: 'speech',
    }),
  ).toBe(
    'Consumer and Planning Legislation Amendment (Housing Statement Reform) Bill 2024 - Second reading',
  );
  // A subject with its own em dash comes back as written.
  expect(
    resultTitle({
      title: 'Ann Smith — Budget — the reply — 2024-05-16',
      speaker: 'Ann Smith',
      date: '2024-05-16',
      kind: 'speech',
    }),
  ).toBe('Budget — the reply');
  // A speaker-and-date title has no subject: the speech is named by who gave it.
  expect(
    resultTitle({
      title: 'Don Farrell — 2023-03-06',
      speaker: 'Don Farrell',
      date: '2023-03-06',
      kind: 'speech',
    }),
  ).toBe('Speech by Don Farrell');
  // A title with no speaker or date in it stands whole.
  const division = records.find((r) => r.kind === 'division')!;
  expect(resultTitle(division)).toBe(division.title);
});

test('the meta line says the kind once, the date formatted and the place', () => {
  expect(resultMeta(farrell)).toBe('Speech · 6 Mar 2023 · Federal');
  expect(resultMeta({ kind: 'press_release', date: null })).toBe(
    'Transcript or release',
  );
  expect(resultMeta({ kind: 'bill', dateLabel: 'Introduced 9 Feb 2023' })).toBe(
    'Bill · Introduced 9 Feb 2023',
  );
});

test('the count agrees with its number', () => {
  expect(countLabel(1, ['record', 'records'])).toBe('1 record');
  expect(countLabel(22, ['record', 'records'])).toBe('22 records');
  expect(countLabel(0, ['record', 'records'])).toBe('0 records');
  expect(countLabel(200, ['record', 'records'], true)).toBe('200+ records');
  expect(countLabel(1, ['person', 'people'])).toBe('1 person');
  expect(countLabel(1234, ['person', 'people'])).toBe('1,234 people');
});

test('a saved copy is a source line state, with its reason in the sheet', () => {
  expect(savedCopy(false)).toEqual({ state: null, note: null });
  expect(savedCopy(true)).toEqual({ state: 'offline', note: null });
  expect(savedCopy(true, 'unreadable').state).toBe('saved');
  expect(savedCopy(true, 'unavailable').note).toMatch(/could not be loaded/);
});

function page(rows = [farrell]) {
  const data = decodeRecords({
    query: 'Don Farrell',
    kind: 'speech',
    sort: 'relevance',
    page: 1,
    per_page: 20,
    page_count: 1,
    total: rows.length,
    count: rows.length,
    truncated: false,
    results: rows.map((row) => ({
      ...row,
      kind: 'speech',
      href: '/doc/' + row.slug,
      url: 'https://www.aph.gov.au/Parliamentary_Business/Hansard',
      source: 'Senate Hansard',
    })),
    years: { '2023': rows.length },
  });
  return { data, stale: false, savedAt: 0, asOf: '2026-10-09' };
}

function draw(rows = [farrell]) {
  const result = page(rows);
  const list: SpeechList = {
    first: { status: 'ready', result } as never,
    rows: result.data.results,
    total: result.data.total,
    more: false,
    next: null,
    pages: 1,
    source: speechSource(result as never, result.data.results, 'rule'),
    count: countLabel(result.data.total, ['speech', 'speeches']),
    load: jest.fn(),
    loadMore: jest.fn(),
    retry: jest.fn(),
  };
  const recover = {
    onAsk: jest.fn(),
    onAll: jest.fn(),
    onClearFilters: jest.fn(),
    onUnquote: jest.fn(),
    onSpeeches: jest.fn(),
  };
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(
      <>
        <ResultsHeader count={list.count} details={list.source} />
        <SpeechResults
          list={list}
          q="Don Farrell"
          filters={defaultSpeechFilters}
          sort="relevance"
          roster={null}
          variant="list"
          recover={recover}
        />
      </>,
    );
  });
  const text = renderer.root
    .findAllByType(NativeText)
    .map((n) => n.props.children)
    .flat(Infinity)
    .filter((c) => typeof c === 'string')
    .join('\n');
  return { renderer, text, list };
}

test('the results: one count and source line above, one row per record', () => {
  const { renderer, text, list } = draw();
  expect(text).toContain('1 speech');
  expect(renderer.root.findAllByType(BigFigure)).toHaveLength(0);
  // Passages | Summaries is retired: every row shows its passage.
  expect(renderer.root.findAllByType(SegmentedControl)).toHaveLength(0);
  // The row: its own title, the kind and formatted date, who spoke.
  const row = renderer.root.findByType(RecordRow);
  expect(row.props).toMatchObject({
    title: 'Bills',
    meta: 'Speech · 6 Mar 2023 · Federal',
    speaker: { name: 'Don Farrell' },
    compact: true,
  });
  expect(text).not.toContain('Don Farrell — Bills — 2023-03-06');
  expect(text).not.toContain('2023-03-06');
  expect(renderer.root.findAllByType(Disclosure)).toHaveLength(0);
  expect(text).not.toMatch(/Read matching record|View original/);
  expect(renderer.root.findAllByType(ViewOriginal)).toHaveLength(0);
  // The record's original is in the results' one source line (the header).
  expect(list.source?.originals).toEqual([
    expect.objectContaining({ label: 'Senate Hansard' }),
  ]);
  expect(
    renderer.root.findAll((n) => n.props?.testID === 'search-count'),
  ).not.toHaveLength(0);
  // The whole row opens the reader, with the query for its find bar.
  expect(row.props.href).toMatchObject({
    params: { slug: 'speech-828012', q: 'Don Farrell' },
  });
  // A one-page result offers no paging row.
  expect(text).not.toMatch(/Show 20 more|Page 1 of 1/);
});

test('Summarise sits after the third result and nowhere else', () => {
  const few = draw();
  expect(
    few.renderer.root.findAll((n) => n.props?.testID === 'results-summarise'),
  ).toHaveLength(0);
  const others = records
    .filter((r) => r.kind === 'speech' && r.slug !== farrell.slug)
    .slice(0, 4);
  const many = draw([farrell, ...others]);
  const order = many.renderer.root
    .findAll(
      (n) =>
        typeof n.props?.testID === 'string' &&
        /^(records-result-\d+|results-summarise)$/.test(n.props.testID) &&
        typeof n.type !== 'string',
    )
    .map((n) => n.props.testID)
    .filter((id, i, all) => all.indexOf(id) === i);
  expect(order.slice(0, 4)).toEqual([
    'records-result-0',
    'records-result-1',
    'records-result-2',
    'results-summarise',
  ]);
  expect(many.text).toContain('Summarise these speeches');
});
