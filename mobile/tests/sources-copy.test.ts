import {
  code,
  datasets,
  portraitTerms,
  statement,
} from '../src/features/sources/datasets';
import { withLoaded, type Loaded } from '../src/features/sources/loader';
import { sourcesCopy } from '../src/features/sources/parts';
import { aboutCopy } from '../src/features/about/copy';
import {
  coverageCopy,
  kindNames,
  methodsCopy,
  parliamentNames,
} from '../src/features/methods/copy';

jest.mock('../src/api/runtime', () => ({ catalogs: {}, apiClient: {} }));
jest.mock('../src/navigation/external', () => ({
  canonicalUrl: (path: string) => `https://opax.invalid${path}`,
  openSource: jest.fn(),
}));

// account.md 4.4: no pipeline tails, pipeline words, em dashes or straight
// marks in anything a dataset says (1.8 asks for typographic marks).
const guard =
  /parli\.db|ext_|\(source [a-z_]+\)|export|snapshot|labelling pass|corpus|indexed|—|['"]/i;
// The brief's pipeline words, on any reference page.
const pipeline = /\b(export|release|manifest|snapshot|corpus|indexed)\b/i;

const strings = (value: unknown): string[] =>
  typeof value === 'string'
    ? [value]
    : typeof value === 'function'
      ? strings(call(value as (arg: unknown) => unknown))
      : Array.isArray(value)
        ? value.flatMap(strings)
        : value && typeof value === 'object'
          ? Object.values(value).flatMap(strings)
          : [];

/** A copy function's output, called with a sample count or list. */
function call(fn: (arg: unknown) => unknown): unknown {
  try {
    return fn('3,335');
  } catch {
    return fn(['NSW Parliament from 2015']);
  }
}

/** A dataset's reader-facing words: everything but its id and link URLs. */
const datasetWords = (list: typeof datasets) =>
  list.flatMap((d) => [
    d.name,
    d.publisher,
    d.licence ?? '',
    ...d.terms,
    ...d.links.map((l) => l.label),
  ]);

const loaded: Loaded = {
  registers: [['AusTender register', 'https://www.tenders.gov.au/']],
  release: [
    {
      label: 'AEC two-candidate votes, 18 May 2019 election',
      url: 'https://results.aec.gov.au/',
    },
  ],
  pay: [{ label: 'Remuneration Tribunal: Determination', url: 'https://x' }],
  dates: {},
  partial: new Set(),
  offline: false,
};

test.each(datasetWords(withLoaded(datasets, loaded)))(
  'dataset copy passes the guard: %s',
  (text) => {
    expect(text).not.toMatch(guard);
  },
);

test('the statement, portraits and code copy pass the guard', () => {
  for (const text of [
    statement,
    portraitTerms.official.terms,
    portraitTerms.commons,
    code.title,
    code.licence,
    ...strings(sourcesCopy),
  ])
    expect(text).not.toMatch(guard);
});

test('the hub statement is one paragraph, as account.md 4.8 writes it', () => {
  expect(statement).toBe(
    'Every figure in OPAX comes from a public record and keeps its publisher’s copyright and licence. Check the licence on the original before reuse. OPAX leaves out sources without public reuse rights and grants no new licence over source data.',
  );
});

test('the 4.4 renames and rewrites hold', () => {
  const byId = (id: string) => datasets.find((d) => d.id === id)!;
  expect(byId('topics-preview').name).toBe(
    'Topic labels and homepage previews',
  );
  expect(byId('search-catalog').name).toBe('Search and topic labels');
  expect(byId('parliamentary-directory').publisher).toBe(
    'Parliament of Australia; OPAX',
  );
  expect(byId('topics-preview').terms).toContain(
    'Homepage previews are copied from OPAX’s homepage, which gives no date.',
  );
  expect(byId('money-qld').terms).toContain(
    'Electoral Commission of Queensland, Electronic Disclosure System (gifts to registered political parties).',
  );
  expect(byId('grantconnect').terms.join(' ')).toContain(
    'GrantConnect (Department of Finance), grant award records',
  );
  // Licence values are short names; long wording moved to the terms.
  for (const dataset of datasets)
    if (dataset.licence) expect(dataset.licence.length).toBeLessThan(40);
  // No Reports link or report wording survives (next build 1). Publishers'
  // own "disclosure reports" and "expenditure reports" are not OPAX reports.
  const words = datasetWords(datasets).join(' ');
  expect(words).not.toMatch(/\bReports\b|research reports?|OPAX reports?/);
  for (const dataset of datasets)
    for (const link of dataset.links) expect(link.label).not.toBe('Reports');
});

test('every About, Methods, Coverage and Sources string is plain and typographic', () => {
  for (const text of [
    ...strings(aboutCopy),
    ...strings(methodsCopy),
    ...strings(coverageCopy),
    ...strings(kindNames),
    ...strings(parliamentNames),
    ...strings(sourcesCopy),
  ]) {
    expect(text).not.toMatch(pipeline);
    expect(text).not.toMatch(/['"—]/);
  }
});
