import { act } from 'react';
import { Text as NativeText } from 'react-native';
import TestRenderer from 'react-test-renderer';
import {
  BigFigure,
  ChoiceChips,
  Disclosure,
  MachineLabel,
  SegmentedControl,
  SourceLine,
  ViewOriginal,
} from '../src/design/primitives';
import { Results } from '../src/features/search/Results';
import { ResultRow } from '../src/features/search/ResultRow';
import {
  countLabel,
  resultMeta,
  resultTitle,
  savedCopy,
} from '../src/features/search/present';
import { decodeRecords } from '../src/features/search/decoders';
import records from '../scripts/fixtures/search/records.json';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

// Design pass 3D (concept board 4): each result is one row titled by the
// record's own title, a kind · date line, who spoke, and its passage; the
// count, sort and share share one line; the block ends in one source line.
const farrell = records.find((r) => r.slug === 'speech-828012')!;

test('a result is titled by its own title, never "Name — Kind — ISO date"', () => {
  expect(resultTitle(farrell)).toBe('Bills');
  expect(
    resultTitle({
      title: 'Wendy Lovell — Consumer and Planning Legislation Amendment (Housing Statement Reform) Bill 2024 - Second reading — 2025-02-20',
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

function page() {
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
    results: [
      {
        ...farrell,
        url: 'https://www.aph.gov.au/Parliamentary_Business/Hansard',
        source: 'Senate Hansard',
      },
    ],
    years: { '2023': 1 },
  });
  return { data, stale: false, savedAt: 0, asOf: '2026-10-09' };
}

function draw(readMode: 'passages' | 'briefs' = 'passages', briefs = {}) {
  const onOpen = jest.fn();
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(
      <Results
        result={page()}
        busy={false}
        filtered={false}
        sort="relevance"
        onSort={jest.fn()}
        onPage={jest.fn()}
        onOpen={onOpen}
        onShare={jest.fn()}
        readMode={readMode}
        onRead={jest.fn()}
        briefs={briefs}
        briefBusy={false}
        briefError={null}
        onBriefRetry={jest.fn()}
        summary={null}
        summaryBusy={false}
        summaryError={null}
        onSummary={jest.fn()}
        summaryAllowed
        onRecover={jest.fn()}
        onExample={jest.fn()}
      />,
    );
  });
  const text = renderer.root
    .findAllByType(NativeText)
    .map((n) => n.props.children)
    .flat(Infinity)
    .filter((c) => typeof c === 'string')
    .join('\n');
  return { renderer, text, onOpen };
}

test('the results block: one count line, one row per record, one source line', () => {
  const { renderer, text, onOpen } = draw();
  // Count, sort and share on one line, read correctly.
  expect(text).toContain('1 record');
  expect(text).not.toMatch(/\bmatches\b/);
  expect(renderer.root.findAllByType(BigFigure)).toHaveLength(0);
  // Passages and Briefs are the pill segmented control.
  expect(renderer.root.findAllByType(SegmentedControl)).toHaveLength(1);
  expect(renderer.root.findAllByType(ChoiceChips)).toHaveLength(0);
  // Summarise is a row that carries the machine label.
  expect(text).toContain('Summarise these records');
  expect(renderer.root.findAllByType(MachineLabel)).toHaveLength(1);
  // The row: its own title, the kind and formatted date, who spoke.
  const row = renderer.root.findByType(ResultRow);
  expect(row.props).toMatchObject({
    title: 'Bills',
    meta: 'Speech · 6 Mar 2023 · Federal',
    speaker: 'Don Farrell',
  });
  expect(text).not.toContain('Don Farrell — Bills — 2023-03-06');
  expect(text).not.toContain('2023-03-06');
  // No disclosure, "Read matching record" or per-row original under it.
  expect(renderer.root.findAllByType(Disclosure)).toHaveLength(0);
  expect(text).not.toMatch(/Read matching record|View original/);
  expect(renderer.root.findAllByType(ViewOriginal)).toHaveLength(0);
  // The record's original is in the block's one source line.
  const lines = renderer.root.findAllByType(SourceLine);
  expect(lines).toHaveLength(1);
  expect(lines[0]!.props.originals).toEqual([
    expect.objectContaining({ label: 'Senate Hansard' }),
  ]);
  // The whole row opens the record.
  act(() =>
    renderer.root
      .find(
        (n) =>
          n.props.testID === 'records-result-speech-828012' &&
          typeof n.props.onPress === 'function',
      )
      .props.onPress(),
  );
  expect(onOpen).toHaveBeenCalledWith(
    '/doc/speech-828012',
    farrell.title,
  );
  // A one-page result says nothing about pages.
  expect(text).not.toMatch(/Page 1 of 1/);
});

test('briefs carry one machine label for the list, not one per row', () => {
  const { renderer, text } = draw('briefs', {
    [farrell.resource]: 'A machine brief of the speech.',
  });
  const labels = renderer.root.findAllByType(MachineLabel);
  expect(labels.map((l) => l.props.testID)).toEqual([
    'records-brief-label',
    'records-summary-machine',
  ]);
  expect(text).toContain('A machine brief of the speech.');
});
