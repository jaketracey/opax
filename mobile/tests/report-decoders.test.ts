import { ApiError } from '../src/api/errors';
import { decodeReport } from '../src/api/report-decoders';
import { assertAllowedPath } from '../src/api/policy';
import { decodeRecord, decodeRecords } from '../src/features/search/decoders';
import { eligibleRecord } from '../src/features/search/eligibility';
import { RecordSearch } from '../src/features/search/api';
import { defaultFilters } from '../src/features/search/contracts';
import { OfficialReports } from '../src/features/reports/official';
import type { Roster } from '../src/api/catalog-decoders';
import royal from './fixtures/reports/royal.json';
import integrity from './fixtures/reports/integrity.json';
import annual from './fixtures/reports/annual.json';
import agency from './fixtures/reports/agency.json';
jest.mock('../src/api/runtime', () => ({}));

// Unchanged schema-1 projections from the portal report catalogue described by
// private/apple-design/briefs/search-reports-contract.md (12 Nov 2026).
const fixtures = [royal, integrity, annual, agency];
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
function searchRow(
  report: {
    slug: string;
    body: string;
    citation: { url: string };
    [key: string]: unknown;
  } = royal,
) {
  return {
    kind: 'report',
    ...Object.fromEntries(
      [
        'report_type',
        'title',
        'body',
        'jurisdiction',
        'date',
        'year',
        'slug',
        'snippet',
        'citation',
      ].map((k) => [k, report[k]]),
    ),
    href: `/report/${report.slug}`,
    source_url: report.citation.url,
    source: report.body,
    resource: '',
  };
}
test.each(fixtures)(
  'decodes the published $report_type projection without rewording evidence',
  (fixture) => {
    const report = decodeReport(fixture);
    expect(report.title).toBe(fixture.title);
    expect(report.facts.map((f) => f.quote)).toEqual(
      fixture.facts.map((f) => f.quote),
    );
    expect(report.record.recommendations?.map((r) => r.text)).toEqual(
      'recommendations' in fixture.record
        ? fixture.record.recommendations.map((r) => r.text)
        : undefined,
    );
  },
);
test.each([
  (v: any) => {
    v.schema = 2;
  },
  (v: any) => {
    v.citation.url = 'javascript:alert(1)';
  },
  (v: any) => {
    v.date = '2023-02-30';
  },
  (v: any) => {
    v.record.recommendations[0].text = {};
  },
  (v: any) => {
    v.record.recommendations[0].cite.page = -1;
  },
  (v: any) => {
    v.record.recommendations = null;
  },
  (v: any) => {
    v.caveats = 'caveat';
  },
  (v: any) => {
    v.slug = 'annual-report-wrong-kind';
  },
])('rejects malformed report evidence', (damage) => {
  const value = clone(royal);
  damage(value);
  expect(() => decodeReport(value)).toThrow(ApiError);
});
test('rejects malformed findings, figures, table references and headline sources', () => {
  const i = clone(integrity);
  (i.record.findings[0] as any).label = null;
  expect(() => decodeReport(i)).toThrow(ApiError);
  const a = clone(agency);
  (a.facts[0] as any).value = '123';
  expect(() => decodeReport(a)).toThrow(ApiError);
  const t = clone(annual);
  (t.tables[0]!.rows as any[]).push({
    kind: 'kmp',
    record_id: 'row',
    table_id: 'table',
    source_row: '1',
  });
  expect(() => decodeReport(t)).toThrow(ApiError);
  const h = clone(annual);
  (h.headline as any).ongoing_staff.codename = {};
  expect(() => decodeReport(h)).toThrow(ApiError);
});
test('validates numeric cells and retains published checks, ranges and row references', () => {
  const fixture = clone(annual);
  const row = fixture.tables[0]!.rows[0]! as any;
  row.base_salary = 'bad';
  expect(() => decodeReport(fixture)).toThrow(ApiError);
  row.base_salary = 200475;
  row.source_row = 12;
  row.checks = ['Shown as published.'];
  row.as_published = { base_salary: '$200,475' };
  const decoded = decodeReport(fixture).tables[0]!.rows[0]!;
  expect(decoded.source_row).toBe(12);
  expect(decoded.as_published).toEqual(row.as_published);
  expect(decoded.checks).toEqual(row.checks);
});
test('preserves null report dates and quoted remuneration ranges', () => {
  expect(decodeReport(annual).date).toBeNull();
  const a = clone(agency);
  (a.facts[0] as any).value = null;
  a.facts[0]!.value_as_published = '$770,000-$780,000';
  expect(decodeReport(a).facts[0]!.value_as_published).toBe(
    '$770,000-$780,000',
  );
});
test.each(fixtures)(
  'admits report search rows and their native destination: $report_type',
  (fixture) => {
    const row = decodeRecord(searchRow(fixture));
    expect(eligibleRecord(row, { people: [] } as unknown as Roster)).toBe(true);
    expect(() => assertAllowedPath(`/api/report/${row.slug}`)).not.toThrow();
  },
);
test.each(['report_type', 'body', 'jurisdiction', 'citation', 'source_url'])(
  'requires report search metadata: %s',
  (key) => {
    const row = searchRow();
    delete (row as any)[key];
    expect(() => decodeRecord(row)).toThrow(ApiError);
  },
);
test('rejects mismatched links and unreviewed report paths', () => {
  expect(() =>
    decodeRecord({ ...searchRow(), href: '/report/annual-report-wrong' }),
  ).toThrow(ApiError);
  const row = decodeRecord(searchRow());
  expect(
    eligibleRecord({ ...row, href: '/doc/speech-1' }, {
      people: [],
    } as unknown as Roster),
  ).toBe(false);
  for (const path of [
    '/api/report/../../index',
    '/api/report/constructor',
    `/api/report/${royal.slug}?fresh=1`,
    `/api/report/${royal.slug}/extra`,
    `/api/report/${'annual-report-' + 'a'.repeat(261)}`,
  ])
    expect(() => assertAllowedPath(path)).toThrow();
});
test('searches the report catalogue and preserves API order', async () => {
  const get = jest.fn(async (path, decode) => ({
    data: decode({
      query: 'robodebt',
      kind: 'report',
      sort: 'relevance',
      page: 1,
      per_page: 20,
      page_count: 1,
      count: 2,
      total: 2,
      truncated: false,
      years: {},
      results: [searchRow(royal), searchRow(integrity)],
    }),
  }));
  const search = new RecordSearch({ get } as never);
  const result = await search.search('robodebt', {
    ...defaultFilters,
    kind: 'report',
  });
  expect(get.mock.calls[0]![0]).toMatch(/^\/api\/search-all\?.*kind=report/);
  expect(result.data.results.map((r) => r.slug)).toEqual([
    royal.slug,
    integrity.slug,
  ]);
  expect(() =>
    decodeRecords({
      ...result.data,
      results: [{ ...searchRow(), date: 'invalid' }],
    }),
  ).toThrow();
});
test('one opened report reuses its read and rejects a mismatched identity', async () => {
  const get = jest.fn(async (_path, decode) => ({ data: decode(royal) }));
  const reports = new OfficialReports({ get } as never);
  await reports.read(royal.slug);
  await reports.read(royal.slug);
  expect(get).toHaveBeenCalledTimes(1);
  expect(get.mock.calls[0]![0]).toBe(`/api/report/${royal.slug}`);
  await expect(reports.read(integrity.slug)).rejects.toMatchObject({
    code: 'invalid-data',
  });
  await expect(reports.read('../index')).rejects.toMatchObject({
    code: 'not-found',
  });
});
