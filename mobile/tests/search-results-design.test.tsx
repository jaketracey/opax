import { act } from 'react';
import { StyleSheet, Text as NativeText } from 'react-native';
import TestRenderer from 'react-test-renderer';
import { Text } from '../src/design/text';
import records from '../scripts/fixtures/search/records.json';
import {
  Disclosure,
  RecordRow,
  SegmentedControl,
} from '../src/design/primitives';
import { decodeRecords } from '../src/features/search/decoders';
import { defaultSpeechFilters } from '../src/features/search/filters';
import {
  countLabel,
  resultMeta,
  resultTitle,
  savedCopy,
} from '../src/features/search/present';
import {
  COUNT_STAND_IN,
  ResultsHeader,
  sourcesCounted,
} from '../src/features/search/ResultsHeader';
import { groups } from '../src/features/search/scopes';
import { speechSource, type SpeechList } from '../src/features/search/speeches';
import { SpeechResults } from '../src/features/search/SpeechResults';

jest.mock('../src/api/runtime', () => ({
  recordSearch: { search: jest.fn(), summary: jest.fn() },
  catalogs: { search: jest.fn() },
}));
jest.mock('expo-router', () => ({
  useIsPreview: () => false,
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
    nextCount: 0,
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

describe('the count line', () => {
  const host = (renderer: TestRenderer.ReactTestRenderer, testID: string) =>
    renderer.root.find(
      (n) => typeof n.type === 'string' && n.props.testID === testID,
    );
  const has = (renderer: TestRenderer.ReactTestRenderer, testID: string) =>
    renderer.root.findAll(
      (n) => typeof n.type === 'string' && n.props.testID === testID,
    ).length > 0;
  const lineStyle = (renderer: TestRenderer.ReactTestRenderer) =>
    StyleSheet.flatten(host(renderer, 'search-count').props.style);
  /** The line is drawn (not held unseen). */
  const shown = (renderer: TestRenderer.ReactTestRenderer) =>
    lineStyle(renderer).opacity !== 0;
  const said = (renderer: TestRenderer.ReactTestRenderer) =>
    host(renderer, 'search-count')
      .findAllByType(NativeText)
      .flatMap((n) => [n.props.children].flat())
      .filter((v) => typeof v === 'string')
      .join('');
  const layout = (height: number) => ({ nativeEvent: { layout: { height } } });
  // The stand-in's box and the unseen full line, as the device lays them out.
  const layBox = (renderer: TestRenderer.ReactTestRenderer, height: number) =>
    host(renderer, 'search-count-stand-in').props.onLayout(layout(height));
  const layFull = (renderer: TestRenderer.ReactTestRenderer, height: number) =>
    host(renderer, 'search-count-probe').props.onLayout(layout(height));
  const NAME =
    'Royal Commission into Violence, Abuse, Neglect and Exploitation of People with Disability';
  const commission = {
    asOf: '2026-09-30',
    citation: [
      { label: NAME, title: 'Royal Commission transcripts' },
      { label: 'Hansard', title: 'Hansard' },
    ],
  };
  const draw = (count = '57 results') => (
    <ResultsHeader count={count} details={commission} />
  );
  const dimensions = (width: number, fontScale: number) =>
    jest
      .spyOn(jest.requireActual('react-native'), 'useWindowDimensions')
      .mockReturnValue({ width, height: 844, scale: 3, fontScale });
  afterEach(() => jest.restoreAllMocks());

  test('its place is the stand-in, laid out before the count is known and after; the real line adds no height', () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <ResultsHeader count={null} details={null} />,
      );
    });
    const check = () => {
      const standIn = host(renderer, 'search-count-stand-in');
      expect(StyleSheet.flatten(standIn.props.style)).toMatchObject({
        minHeight: 44,
        opacity: 0,
      });
      expect(standIn.props.accessibilityElementsHidden).toBe(true);
      const words = standIn.findByType(Text);
      expect(words.props.variant).toBe('footnote');
      expect(words.props.children).toBe(COUNT_STAND_IN);
    };
    check();
    expect(has(renderer, 'search-count')).toBe(false);
    act(() =>
      renderer.update(<ResultsHeader count="122 results" details={null} />),
    );
    // Still there with the count in: it is what gives the line its height.
    check();
    // The real line lies over it and cannot push anything: out of the flow,
    // exactly the stand-in's box, and nothing it draws leaves that box.
    act(() => layBox(renderer, 224));
    expect(lineStyle(renderer)).toMatchObject({
      position: 'absolute',
      height: 224,
      overflow: 'hidden',
    });
    // The box is the stand-in's latest layout: it shrinks as well as grows.
    act(() => layBox(renderer, 44));
    expect(lineStyle(renderer).height).toBe(44);
    // A line with no source names has nothing to count: no measuring copy,
    // and it is drawn at once.
    expect(has(renderer, 'search-count-probe')).toBe(false);
    expect(shown(renderer)).toBe(true);
  });

  test('the stand-in is never shorter than the counted form, whatever is counted', () => {
    for (const { noun } of Object.values(groups))
      expect(
        `9,999+ ${noun} · Updated 30 Sep 2026 · ${sourcesCounted(99)}`.length,
      ).toBeLessThanOrEqual(COUNT_STAND_IN.length);
    // "and 3 more" never breaks in the real line, so not in the stand-in.
    expect(COUNT_STAND_IN).toContain('and\u00a03\u00a0more');
    expect(sourcesCounted(1)).toBe('1 source');
  });

  test('the names are never drawn and then replaced: the line stays unseen until the full line is measured', () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(draw());
    });
    // Nothing measured: the line is in place but unseen.
    expect(shown(renderer)).toBe(false);
    // The measuring copy is the full line, unseen, out of the flow, with no
    // height of its own, and never spoken or touched.
    const probe = host(renderer, 'search-count-probe');
    const probeStyle = StyleSheet.flatten(probe.props.style);
    expect(probeStyle).toMatchObject({ position: 'absolute', opacity: 0 });
    expect(Object.keys(probeStyle)).not.toContain('height');
    expect(Object.keys(probeStyle)).not.toContain('minHeight');
    expect(probe.props.accessibilityElementsHidden).toBe(true);
    expect(probe.props.pointerEvents).toBe('none');
    expect(
      probe
        .findAllByType(NativeText)
        .flatMap((n) => [n.props.children].flat())
        .join(''),
    ).toContain(NAME);
    // Either measurement alone decides nothing.
    act(() => layBox(renderer, 224));
    expect(shown(renderer)).toBe(false);
    // AX5: the full line needs twice the held place. It is counted in the
    // same render that draws it, so the names were never on screen.
    act(() => layFull(renderer, 448));
    expect(shown(renderer)).toBe(true);
    expect(said(renderer)).not.toContain('Royal Commission');
    expect(said(renderer)).toContain(`57 results · `);
    expect(said(renderer)).toContain(sourcesCounted(2));
    expect(
      renderer.root.findAll((n) => n.props.numberOfLines != null),
    ).toHaveLength(0);
    // What is drawn is also said, with the names; the line opens the sources.
    const button = host(renderer, 'search-count');
    expect(button.props.accessibilityLabel).toContain('2 sources');
    expect(button.props.accessibilityLabel).toContain(`Source: ${NAME}`);
    expect(button.props.accessibilityHint).toBe('Opens the sources');
    // The other order: the full line is measured before the box.
    act(() => {
      renderer = TestRenderer.create(draw());
    });
    act(() => layFull(renderer, 448));
    expect(shown(renderer)).toBe(false);
    act(() => layBox(renderer, 224));
    expect(shown(renderer)).toBe(true);
    expect(said(renderer)).toContain(sourcesCounted(2));
    // New words are measured afresh: unseen again until their copy is in.
    act(() => renderer.update(draw('58 results')));
    expect(shown(renderer)).toBe(false);
    act(() => layFull(renderer, 448));
    expect(shown(renderer)).toBe(true);
    expect(said(renderer)).toContain('58 results');
  });

  test('heights are compared, not line counts: two lines that fit the 44 pt target keep their names', () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(draw());
    });
    // Default size on a wide phone: a one-line stand-in in its 44 pt box,
    // and a full line of two 18 pt lines.
    act(() => {
      layBox(renderer, 44);
      layFull(renderer, 36);
    });
    expect(shown(renderer)).toBe(true);
    expect(said(renderer)).toContain(NAME);
    expect(
      host(renderer, 'search-count').props.accessibilityLabel,
    ).not.toContain('2 sources');
    // Three lines do not fit.
    act(() => layFull(renderer, 54));
    expect(said(renderer)).toContain(sourcesCounted(2));
  });

  test('a rotation, a resize or a new text size that lands with its layouts in one render leaves the right form', () => {
    dimensions(390, 3.1);
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(draw());
    });
    act(() => {
      layBox(renderer, 224);
      layFull(renderer, 448);
    });
    expect(said(renderer)).toContain(sourcesCounted(2));
    // Rotated: the window, the box and the full line all change in one
    // render. Nothing is keyed by the window, so nothing goes stale.
    act(() => {
      dimensions(844, 3.1);
      renderer.update(draw());
      layBox(renderer, 168);
      layFull(renderer, 168);
    });
    expect(shown(renderer)).toBe(true);
    expect(said(renderer)).toContain(NAME);
    // Back again, the same way: counted, not left clipped in full.
    act(() => {
      dimensions(390, 3.1);
      renderer.update(draw());
      layBox(renderer, 224);
      layFull(renderer, 448);
    });
    expect(shown(renderer)).toBe(true);
    expect(said(renderer)).toContain(sourcesCounted(2));
    expect(said(renderer)).not.toContain('Royal Commission');
    // A window change that moves neither height changes nothing and needs
    // no new measurement.
    act(() => {
      dimensions(400, 3.1);
      renderer.update(draw());
    });
    expect(shown(renderer)).toBe(true);
    expect(said(renderer)).toContain(sourcesCounted(2));
    // A smaller text size: back to one 44 pt target.
    act(() => {
      dimensions(390, 1);
      renderer.update(draw());
      layBox(renderer, 44);
      layFull(renderer, 36);
    });
    expect(said(renderer)).toContain(NAME);
    expect(lineStyle(renderer).height).toBe(44);
  });
});

test('the results: one count and source line above, one row per record', () => {
  const { renderer, text, list } = draw();
  expect(text).toContain('1 speech');
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
