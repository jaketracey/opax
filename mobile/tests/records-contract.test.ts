import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { assertAllowedPath } from '../src/api/policy';
import {
  defaultFilters,
  documentKinds,
  excludedKinds,
  filterChips,
  jurisdictions,
  moreCatalogKinds,
  normaliseFilters,
  recordTypes,
  searchParams,
  searchWebPath,
  sorts,
  topics,
} from '../src/features/search/contracts';
import {
  decodeBriefs,
  decodeManifest,
  decodeRecords,
  decodeReports,
  decodeSummary,
  summaryStreamBody,
} from '../src/features/search/decoders';
import {
  eligibleRecord,
  eligibleSummary,
  isGrantProgram,
} from '../src/features/search/eligibility';
import { richerSuggestions } from '../src/features/search/suggestions';
import { fromWebPath } from '../src/navigation/routes';
import { canonicalUrl, sourceUrl } from '../src/navigation/external';
import { searchFixture } from '../scripts/search-fixture';
import manifest from '../scripts/fixtures/search/search-catalog-manifest.json';
import reports from '../scripts/fixtures/search/reports-index.json';
import grants from '../scripts/fixtures/search/grants.json';
import bills from '../scripts/fixtures/search/bills.json';
import provenance from '../scripts/fixtures/search/provenance.json';
import { roster } from './pinned';

test('web option lists and fixture source hashes remain pinned to the authoritative handlers and static exports', () => {
  for (const [path, hash] of Object.entries(provenance.sourceHashes))
    expect(
      createHash('sha256')
        .update(readFileSync('../' + path))
        .digest('hex'),
    ).toBe(hash);
  const html = readFileSync('../portal/public/index.html', 'utf8');
  const block = /<select id="search-kind"[\s\S]*?<\/select>/.exec(html)![0];
  expect(recordTypes).toEqual(
    [...block.matchAll(/<option value="([^"]+)">([^<]+)<\/option>/g)].map(
      (m) => ({ value: m[1], label: m[2] }),
    ),
  );
  expect(recordTypes).toHaveLength(24);
  expect(jurisdictions).toHaveLength(9);
  expect(Object.keys(topics)).toHaveLength(21);
  expect(sorts).toHaveLength(6);
});
test.each(documentKinds)(
  'explicit document kind %s uses the exact web query parameters',
  (kind) => {
    const p = searchParams(' housing ', {
      ...defaultFilters,
      kind,
      party: 'Labor',
      from: '2025',
      to: '2026',
    });
    expect(p.toString()).toBe(
      `q=housing&kind=${kind}&mode=hybrid&page=1&per=20&sort=relevance&party=Labor&from=2025&to=2026`,
    );
    expect(() => assertAllowedPath('/api/search?' + p)).not.toThrow();
  },
);
test.each(moreCatalogKinds)(
  'organisation or public-record catalog %s is explicitly allowed',
  (kind) =>
    expect(() =>
      assertAllowedPath(
        '/api/search-all?' +
          searchParams('Community', {
            ...defaultFilters,
            kind,
            mode: 'keyword',
          }),
      ),
    ).not.toThrow(),
);
test.each(Object.keys(excludedKinds))(
  'unsafe mixed catalog %s is refused and has a documented reason',
  (kind) => {
    expect(excludedKinds[kind]).toBeTruthy();
    expect(() =>
      assertAllowedPath(
        '/api/search-all?' +
          searchParams('Example', { ...defaultFilters, kind }),
      ),
    ).toThrow();
    expect(() =>
      assertAllowedPath(
        '/api/search-summary?stream=1&' +
          searchParams('Example', { ...defaultFilters, kind }),
      ),
    ).toThrow();
  },
);
test.each([
  'mode=nope',
  'sort=random',
  'topic=nope',
  'from=1992',
  'to=2027',
  'state=none',
  'nocache=1',
  'top_k=200',
  'page=0',
  'per=201',
  'q=second',
  'kind=donor',
  'sort=newest&sort=oldest',
])('unreviewed or duplicate search parameter %s is refused', (extra) =>
  expect(() =>
    assertAllowedPath(
      '/api/search?' + searchParams('housing', defaultFilters) + '&' + extra,
    ),
  ).toThrow(),
);
test('summary and brief paths have exact action contracts', () => {
  const summary =
    '/api/search-summary?stream=1&' +
    searchParams('housing', { ...defaultFilters, kind: 'speech' });
  expect(() => assertAllowedPath(summary)).not.toThrow();
  for (const path of [
    summary.replace('stream=1', 'stream=0'),
    summary.replace('page=1', 'page=2'),
    summary.replace('sort=relevance', 'sort=newest'),
    '/api/brief?rids=x',
    '/api/brief?rids=' + Array(25).fill('a'.repeat(32)).join(','),
    '/api/brief?rids=' + 'a'.repeat(32) + '&nocache=1',
  ])
    expect(() => assertAllowedPath(path)).toThrow();
  expect(() =>
    assertAllowedPath('/api/brief?rids=' + 'a'.repeat(32)),
  ).not.toThrow();
  for (const path of ['/search-catalog/manifest.json', '/reports/index.json'])
    expect(() => assertAllowedPath(path)).not.toThrow();
});
test('decoders handle real pinned rows, strict pagination, optional briefs and SSE cache hits', () => {
  const url = new URL(
    '/api/search?' + searchParams('housing', defaultFilters),
    'http://127.0.0.1:8942',
  );
  const page = JSON.parse(searchFixture(url, roster)!.body.toString());
  expect(decodeRecords(page).results.length).toBeGreaterThan(0);
  expect(() => decodeRecords({ ...page, page: 0 })).toThrow();
  expect(() => decodeRecords({ ...page, count: 2 })).toThrow();
  expect(() =>
    decodeRecords({
      ...page,
      results: [{ ...page.results[0], href: '//bad.test' }],
    }),
  ).toThrow();
  expect(decodeBriefs({ briefs: {} })).toEqual({ briefs: {} });
  expect(() => decodeBriefs({ briefs: { bad: 'text' } })).toThrow();
  expect(decodeReports(reports).reports).toHaveLength(7);
  expect(decodeManifest(manifest).counts.grant).toBeGreaterThan(0);
  const response = searchFixture(
    new URL(
      '/api/search-summary?stream=1&' + searchParams('housing', defaultFilters),
      'http://127.0.0.1:8942',
    ),
    roster,
  )!;
  const summary = decodeSummary(summaryStreamBody(response.body.toString()));
  expect(summary.status).toBe('ready');
  expect(() => eligibleSummary(summary, roster)).not.toThrow();
  expect(() =>
    decodeSummary({
      ...summary,
      points: [{ text: 'Claim', source_ids: ['missing'] }],
    }),
  ).toThrow();
  expect(() => summaryStreamBody('event: error\ndata: {}\n\n')).toThrow();
  expect(() => summaryStreamBody('event: point\ndata: {}\n\n')).toThrow();
  expect(
    decodeSummary({ status: 'empty', points: [], sources: [] }).status,
  ).toBe('empty');
});
test('private people and grant recipients are excluded without guessing entity names or ABNs', () => {
  expect(bills.length).toBe(30);
  for (const bill of bills) {
    const row = decodeRecords({
      query: 'Bill',
      kind: 'bill',
      mode: 'keyword',
      sort: 'relevance',
      page: 1,
      per_page: 20,
      page_count: 1,
      total: 1,
      count: 1,
      results: [bill],
      years: {},
      truncated: false,
    }).results[0]!;
    expect(eligibleRecord(row, roster)).toBe(true);
    expect(fromWebPath(row.href!)).toEqual({
      pathname: '/bill/[key]',
      params: { key: row.href!.slice(6) },
    });
  }
  const program = grants[0]!;
  expect(isGrantProgram(program)).toBe(true);
  expect(isGrantProgram({ ...program, slug: 'catalog-1' })).toBe(false);
  expect(
    isGrantProgram({
      ...program,
      href: '/money/grants/federal/recipient/example',
    }),
  ).toBe(false);
  const row = decodeRecords(
    JSON.parse(
      searchFixture(
        new URL(
          '/api/search?' + searchParams('housing', defaultFilters),
          'http://127.0.0.1:8942',
        ),
        roster,
      )!.body.toString(),
    ),
  ).results[0]!;
  expect(eligibleRecord(row, roster)).toBe(true);
  expect(
    eligibleRecord(
      { ...row, speaker: 'Private Fixture Witness', speaker_type: 'witness' },
      roster,
    ),
  ).toBe(false);
  expect(
    eligibleRecord({ ...row, speaker: 'Private Fixture Individual' }, roster),
  ).toBe(false);
  expect(eligibleRecord({ ...row, kind: 'contract' }, roster)).toBe(false);
  expect(eligibleRecord({ ...row, kind: 'grant' }, roster)).toBe(false);
});
test('richer suggestions use only static catalogs and the roster, with canonical destinations', () => {
  const sources = [
    roster,
    decodeManifest(manifest),
    decodeReports(reports),
  ] as const;
  expect(richerSuggestions('Labor', ...sources).parties).toContain('Labor');
  expect(richerSuggestions('Housing', ...sources).topics).toEqual([
    { slug: 'housing', title: 'Housing' },
  ]);
  expect(richerSuggestions('Housing', ...sources).reports[0]?.slug).toBe(
    'housing',
  );
  expect(
    richerSuggestions('Private Fixture Individual', ...sources).parties,
  ).toEqual([]);
  expect(richerSuggestions('h', ...sources)).toEqual({
    parties: [],
    topics: [],
    reports: [],
  });
});
test('year normalisation, removable chips and sharing preserve filter state without submitting on mount', () => {
  const f = normaliseFilters({
    ...defaultFilters,
    kind: 'speech',
    from: '2026',
    to: '2025',
    party: 'Labor',
  });
  expect(f.from).toBe('2025');
  expect(f.to).toBe('2026');
  expect(filterChips(f).map((c) => c.id)).toEqual(['party', 'years', 'kind']);
  const path = searchWebPath('housing', f, 2, 'newest');
  expect(fromWebPath(path)).toMatchObject({
    pathname: '/search',
    params: {
      q: 'housing',
      kind: 'speech',
      from: '2025',
      to: '2026',
      party: 'Labor',
      page: '2',
      sort: 'newest',
    },
  });
  expect(canonicalUrl(path)).toContain('/ask?view=search&q=housing');
  expect(() => sourceUrl(canonicalUrl(path))).toThrow();
  expect(fromWebPath('/ask?view=search&q=Example&kind=donor')).toBeNull();
});
