import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ApiClient } from '../src/api/client';
import {
  CatalogCache,
  type CacheEntry,
  type CacheIndexEntry,
  type CacheStore,
} from '../src/api/cache';
import { assertAllowedPath } from '../src/api/policy';
import { fromWebPath } from '../src/navigation/routes';
import { ReportsRepository } from '../src/features/reports/repository';
import * as d from '../src/features/reports/model';
import { pinned, pinnedBytes } from './pinned';
import { reportsFixture } from '../scripts/reports-fixture';
import copy from '../src/features/reports/methods-copy.json';

const fixture = reportsFixture(pinnedBytes);
class MemoryStore implements CacheStore {
  entries = new Map<string, CacheEntry>();
  index: CacheIndexEntry[] = [];
  async readIndex() {
    return this.index;
  }
  async writeIndex(index: CacheIndexEntry[]) {
    this.index = index;
  }
  async read(url: string) {
    return this.entries.get(url);
  }
  async write(entry: CacheEntry) {
    this.entries.set(entry.url, entry);
  }
  async remove(url: string) {
    this.entries.delete(url);
  }
}
test.each(d.reportSlugs)(
  'decodes every static report and keeps section numbering and exact prose: %s',
  (slug) => {
    const raw = pinned(`/reports/${slug}.json`) as d.Report;
    const report = d.decodeReport(raw);
    expect(report.lede?.text).toBe(raw.lede?.text);
    const sections = d.numberedSections(report);
    expect(sections.map((s) => s.number)).toEqual(
      sections.map((_, i) => i + 1),
    );
    expect(sections[report.now!.sections.length]?.item).toEqual(
      report.over_time!.eras[0],
    );
    const sources = d.allSources(report);
    expect(new Set(sources.map((s) => s.slug)).size).toBe(sources.length);
    expect(sources.length).toBeGreaterThan(100);
    for (const s of raw.lede!.sources)
      expect(sources.some((row) => row.slug === s.slug)).toBe(true);
    expect(() =>
      d.decodeReport({ ...raw, generated_at: 'yesterday' }),
    ).toThrow();
  },
);
test('index includes all seven; grants stays delegated to its owning lane', () => {
  const index = d.decodeReportIndex(pinned('/reports/index.json'));
  expect(index.reports).toHaveLength(7);
  expect(index.reports.some((r) => r.slug === 'grants-allocation')).toBe(true);
  expect(fromWebPath('/reports/grants-allocation')).toBeNull();
  expect(() => d.decodeReportIndex({ reports: [{ slug: '../x' }] })).toThrow();
});
test('Unicode citation offsets preserve paragraphs and source numbers; retrieved sources stay separate', () => {
  const source = d.decodeSource({
    slug: 'speech-1',
    cited: true,
    answer_ranges: [[2, 5]],
  });
  const paragraphs = d.citedParagraphs('😀 first\n\nSecond [2]', [
    source,
    d.decodeSource({ slug: 'speech-2' }),
  ]);
  expect(paragraphs).toEqual([
    { text: '😀 first', citations: [1] },
    { text: 'Second [2]', citations: [2] },
  ]);
  expect(() => d.decodeSource({ slug: '../bad' })).toThrow();
  expect(() =>
    d.decodeSource({ slug: 'speech-1', answer_ranges: [[0]] }),
  ).toThrow();
});
test.each([
  ['/api/topics', d.decodeTopics, { labelled: -1, topics: [] }],
  ['/api/topic/gambling', d.decodeTopic, { count: '3' }],
  [
    '/api/tide',
    d.decodeTide,
    { scope: 'federal', decades: [], topics: { gambling: [{ share: 'bad' }] } },
  ],
  [
    '/api/stats',
    d.decodeStats,
    { resources: 2, paragraphs: -2, kinds: null, speeches_by_state: null },
  ],
  [
    '/api/matrix',
    d.decodeMatrix,
    {
      labelled: 0,
      parties: [],
      cells: { gambling: { Labor: -1 } },
      totals: {},
    },
  ],
  [
    d.arcPath('gambling'),
    d.decodeSpeeches,
    { results: [{ slug: 'bad/name', title: 'x' }] },
  ],
] as const)(
  'paid response contract is decoded and malformed data refused: %s',
  (path, decode, bad) => {
    expect(() => decode(JSON.parse(fixture(path)!.toString()))).not.toThrow();
    expect(() => decode(bad)).toThrow();
  },
);
test('money is selected by donor industry, sums edges, and keeps matrix denominators and Other honest', () => {
  const money = d.decodeIndustryMoney(pinned('/graph/money.json'));
  const matrix = d.decodeMatrix({
    labelled: 100,
    parties: ['Labor', 'Other'],
    cells: { gambling: { Labor: 15, Other: 20 } },
    totals: { gambling: 50 },
  });
  const rows = d.moneyRows(money, ['gambling'], matrix, 'gambling');
  expect(rows.rows.find((r) => r.party === 'Labor')?.share).toBe(0.3);
  expect(rows.rows.some((r) => r.party === 'Other')).toBe(false);
  expect(rows.donors.every((n) => n.industry === 'gambling')).toBe(true);
  expect(() =>
    d.decodeIndustryMoney({
      ...money,
      edges: [{ source: 'x', target: 'y', total: NaN, count: 0 }],
    }),
  ).toThrow();
});
test.each(Object.keys(d.topicNames))(
  'the exact topic and arc request is allowed: %s',
  (slug) => {
    expect(() => assertAllowedPath(`/api/topic/${slug}`)).not.toThrow();
    expect(() => assertAllowedPath(d.arcPath(slug))).not.toThrow();
  },
);
test('topic drill-down requests retain the web filters and refuse unsupported widening', () => {
  const path = d.arcPath('gambling', {
    party: 'Labor',
    state: 'federal',
    from: '2020-01-01',
    to: '2026-12-31',
  });
  const params = new URLSearchParams(path.split('?')[1]);
  expect(params.get('from')).toBe('2020');
  expect(params.get('to')).toBe('2026');
  expect(() => assertAllowedPath(path)).not.toThrow();
  expect(() =>
    assertAllowedPath(d.arcPath('gambling', { party: 'A made-up party' })),
  ).toThrow();
  expect(() =>
    assertAllowedPath(d.arcPath('gambling', { state: 'anywhere' })),
  ).toThrow();
  expect(() =>
    assertAllowedPath(d.arcPath('gambling', { from: '1992', to: '2026' })),
  ).toThrow();
  expect(() =>
    assertAllowedPath(d.arcPath('gambling', { from: '2026', to: '1993' })),
  ).toThrow();
  expect(() => assertAllowedPath(path + '&scope=all')).toThrow();
  const response = d.decodeSpeeches(JSON.parse(fixture(path)!.toString()));
  expect(
    response.results.every((s) => s.party === 'Labor' && s.state === 'federal'),
  ).toBe(true);
});
test.each([
  '/reports/index.json',
  '/api/topics',
  '/api/tide',
  '/api/stats',
  '/api/matrix',
  ...d.reportSlugs.map((s) => `/reports/${s}.json`),
])('reviewed path allowed: %s', (path) =>
  expect(() => assertAllowedPath(path)).not.toThrow(),
);
test.each([
  '/reports/unknown.json',
  '/reports/grants-allocation.json',
  '/api/topic/not-a-topic',
  '/api/topics?',
  '/api/stats?retry=1',
  '/api/tide?scope=all',
  '/api/matrix?prefetch=1',
  d.arcPath('gambling') + '&topic=gambling',
  d.arcPath('gambling').replace('per=200', 'per=201'),
  d.arcPath('gambling').replace('mode=hybrid', 'mode=semantic'),
  d.arcPath('gambling').replace('page=1', 'page=2'),
  d.arcPath('gambling') + '&token=x',
])('request widening refused: %s', (path) =>
  expect(() => assertAllowedPath(path)).toThrow(),
);
test('all canonical share paths resolve, section numbering is positive and grants delegates', () => {
  expect(fromWebPath('/reports')).toEqual({ pathname: '/reports' });
  expect(fromWebPath('/reports/gambling/s/9')).toEqual({
    pathname: '/report/[slug]',
    params: { slug: 'gambling', section: '9' },
  });
  expect(fromWebPath('/reports/gambling/s/0')).toBeNull();
  expect(fromWebPath('/subject/topic/gambling')).toEqual({
    pathname: '/topic/[slug]',
    params: { slug: 'gambling' },
  });
  expect(fromWebPath('/stats')).toEqual({ pathname: '/stats' });
  expect(fromWebPath('/methods')).toEqual({ pathname: '/methods' });
});
test('Methods text is copied from the web panel exactly after HTML whitespace normalization', () => {
  const panel = readFileSync(
    resolve(__dirname, '../../portal/public/index.html'),
    'utf8',
  )
    .split('<section id="panel-methods"')[1]!
    .split('</section>')[0]!;
  const text = panel
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  for (const block of copy) expect(text).toContain(block.text);
});
test('reader construction, static report reading, session revisits and failures do not produce unrequested paid calls', async () => {
  const calls: string[] = [];
  const client = new ApiClient({
    origin: 'http://127.0.0.1:8944',
    version: 'test',
    build: '7',
    cache: new CatalogCache(new MemoryStore()),
    transport: jest.fn(async (input) => {
      const path =
        new URL(String(input)).pathname + new URL(String(input)).search;
      calls.push(path);
      const body = fixture(path) ?? pinnedBytes(path);
      return new Response(body.toString(), {
        status: 200,
        headers: { 'cache-control': 'no-store' },
      });
    }) as typeof fetch,
  });
  const reader = new ReportsRepository(client);
  expect(calls).toEqual([]);
  await Promise.all([
    reader.corpus(),
    reader.report('gambling'),
    reader.index(),
  ]);
  expect(calls.some((p) => p.startsWith('/api/'))).toBe(false);
  await Promise.all([
    reader.topics(),
    reader.topics(),
    reader.tide(),
    reader.tide(),
  ]);
  await reader.topic('gambling');
  await reader.speeches('gambling');
  await reader.stats();
  await reader.matrix();
  await Promise.all([
    reader.topics(),
    reader.tide(),
    reader.topic('gambling'),
    reader.speeches('gambling'),
    reader.stats(),
    reader.matrix(),
  ]);
  for (const path of [
    '/api/topics',
    '/api/tide',
    '/api/topic/gambling',
    d.arcPath('gambling'),
    '/api/stats',
    '/api/matrix',
  ])
    expect(calls.filter((p) => p === path)).toHaveLength(1);
  const failing = jest.fn(async () => new Response('{}', { status: 503 }));
  const errorReader = new ReportsRepository(
    new ApiClient({
      origin: 'http://127.0.0.1:8944',
      version: 'test',
      build: '7',
      cache: new CatalogCache(new MemoryStore()),
      transport: failing as typeof fetch,
    }),
  );
  await expect(errorReader.stats()).rejects.toThrow();
  expect(failing).toHaveBeenCalledTimes(1);
  await expect(errorReader.stats()).rejects.toThrow();
  expect(failing).toHaveBeenCalledTimes(2);
});
