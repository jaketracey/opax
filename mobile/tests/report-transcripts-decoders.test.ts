import { ApiError } from '../src/api/errors';
import {
  decodeReport,
  decodeReportTranscripts,
} from '../src/api/report-decoders';
import robodebt from './fixtures/reports/report-rc-robodebt.json';
import belcarra from './fixtures/reports/report-integrity-belcarra.json';
import none from './fixtures/reports/report-integrity-none.json';
import page20 from './fixtures/reports/page-rc-robodebt-20.json';
import page40 from './fixtures/reports/page-rc-robodebt-40.json';
import antisemitism from './fixtures/reports/page-rc-antisemitism.json';
import empty from './fixtures/reports/page-none.json';
import notFound from './fixtures/reports/page-404.json';
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
test.each([
  ['Robodebt report', robodebt],
  ['Belcarra report', belcarra],
  ['report without transcripts', none],
])('decodes the saved %s', (_name, fixture) => {
  const report = decodeReport(fixture);
  if ('transcripts' in fixture)
    expect(report.transcripts).toEqual(fixture.transcripts);
  else expect(report.transcripts).toBeUndefined();
});
test.each([
  ['Robodebt offset 20', page20],
  ['Robodebt offset 40', page40],
  ['Antisemitism', antisemitism],
  ['empty page', empty],
])('decodes the saved %s', (_name, fixture) =>
  expect(decodeReportTranscripts(fixture, fixture.offset)).toEqual(fixture),
);
test('the saved 404 is not a transcript envelope', () =>
  expect(() => decodeReportTranscripts(notFound)).toThrow(ApiError));
test('ignores unknown envelope and item fields', () => {
  expect(
    decodeReportTranscripts(
      {
        ...page20,
        future: { ignored: true },
        items: page20.items.map((row) => ({ ...row, future: 'ignored' })),
      },
      20,
    ),
  ).toEqual(page20);
});
test.each([
  [
    'count type',
    (x: any) => {
      x.count = '47';
    },
  ],
  [
    'missing offset',
    (x: any) => {
      delete x.offset;
    },
  ],
  [
    'null label',
    (x: any) => {
      x.label = null;
    },
  ],
  [
    'empty label',
    (x: any) => {
      x.label = '';
    },
  ],
  [
    'items container',
    (x: any) => {
      x.items = {};
    },
  ],
  [
    'invalid first date',
    (x: any) => {
      x.first_date = '2022-02-30';
    },
  ],
  [
    'timestamp first date',
    (x: any) => {
      x.first_date += 'T00:00:00Z';
    },
  ],
  [
    'reversed range',
    (x: any) => {
      x.last_date = '2021-01-01';
    },
  ],
  [
    'missing date',
    (x: any) => {
      x.first_date = null;
    },
  ],
  [
    'hearing outside range',
    (x: any) => {
      x.items[0].hearing_date = '2024-01-01';
    },
  ],
  [
    'timestamp hearing date',
    (x: any) => {
      x.items[0].hearing_date += 'T00:00:00Z';
    },
  ],
  [
    'unsafe URL',
    (x: any) => {
      x.items[0].url = 'javascript:alert(1)';
    },
  ],
  [
    'negative pages',
    (x: any) => {
      x.items[0].pages = -1;
    },
  ],
  [
    'null optional pages',
    (x: any) => {
      x.items[0].pages = null;
    },
  ],
  [
    'missing redaction flag',
    (x: any) => {
      delete x.items[0].publisher_redacted;
    },
  ],
  [
    'invalid redaction flag',
    (x: any) => {
      x.items[0].publisher_redacted = 'false';
    },
  ],
  [
    'missing notes',
    (x: any) => {
      delete x.items[0].notes;
    },
  ],
  [
    'invalid notes',
    (x: any) => {
      x.items[0].notes = [{}];
    },
  ],
  [
    'missing orders',
    (x: any) => {
      delete x.items[0].orders;
    },
  ],
  [
    'invalid orders',
    (x: any) => {
      x.items[0].orders = ['not a link'];
    },
  ],
  [
    'insecure order',
    (x: any) => {
      x.items[0].orders = ['http://example.test/order'];
    },
  ],
  [
    'missing title and case',
    (x: any) => {
      delete x.items[0].title;
      delete x.items[0].case;
    },
  ],
  [
    'duplicate ID',
    (x: any) => {
      x.items[1].id = x.items[0].id;
    },
  ],
  [
    'next offset arithmetic',
    (x: any) => {
      x.next_offset = 39;
    },
  ],
  [
    'non-advancing page',
    (x: any) => {
      x.next_offset = 20;
    },
  ],
  [
    'premature final page',
    (x: any) => {
      x.next_offset = null;
    },
  ],
  [
    'empty unfinished page',
    (x: any) => {
      x.items = [];
      x.next_offset = 20;
    },
  ],
] as const)('rejects %s', (_name, damage) => {
  const page = clone(page20);
  damage(page);
  expect(() => decodeReportTranscripts(page, 20)).toThrow(ApiError);
});
test('checks the echoed offset against the request for first and later pages', () => {
  expect(() => decodeReportTranscripts(page20, 19)).toThrow(ApiError);
  expect(() => decodeReportTranscripts(page40, 0)).toThrow(ApiError);
  expect(
    decodeReport({ ...robodebt, transcripts: page20 }).transcripts,
  ).toBeUndefined();
});
test.each(['count', 'first_date', 'last_date'] as const)(
  'retains %s across pages',
  (field) => {
    const previous = clone(robodebt.transcripts);
    if (field === 'count') previous.count++;
    if (field === 'first_date') previous.first_date = '2022-09-26';
    if (field === 'last_date') previous.last_date = '2023-03-11';
    expect(() => decodeReportTranscripts(page20, 20, previous)).toThrow(
      ApiError,
    );
  },
);
test('accepts all three Robodebt pages with the same count and range', () => {
  const first = decodeReport(robodebt).transcripts!;
  const middle = decodeReportTranscripts(page20, first.next_offset!, first);
  const last = decodeReportTranscripts(page40, middle.next_offset!, first);
  expect(
    new Set(
      [...first.items, ...middle.items, ...last.items].map((row) => row.id),
    ).size,
  ).toBe(first.count);
  expect(last.next_offset).toBeNull();
});
test('empty pages have null dates and no rows', () => {
  expect(() =>
    decodeReportTranscripts({ ...empty, first_date: '2023-01-01' }),
  ).toThrow(ApiError);
  expect(() =>
    decodeReportTranscripts({ ...empty, items: [page20.items[0]] }),
  ).toThrow(ApiError);
});
