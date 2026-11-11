import { sourcePath, sourceRoute } from '../src/features/ask/AskRows';
import { fromWebPath } from '../src/navigation/external/paths';
import { decodeAnswer } from '../src/features/ask/model';
import { docRoute } from '../src/navigation/routes/records';
import { recordRoute } from '../src/features/records/route';

jest.mock('../src/api/runtime', () => ({}));

type Source = Parameters<typeof sourceRoute>[0];
const source = (href: string) => ({ href }) as unknown as Source;

test('a cited path opens its native route, with or without a query or fragment', () => {
  const bare = fromWebPath('/bills');
  expect(bare).not.toBeNull();
  expect(sourceRoute(source('/bills'))).toEqual(bare);
  // When the full href has no route, its path alone is tried, with no
  // production origin in the source (qa-static).
  for (const href of ['/bills?utm=x&y=1', '/bills#top', '/bills?x=1#top'])
    expect(sourceRoute(source(href))).toEqual(
      fromWebPath(href) ?? fromWebPath('/bills'),
    );
});

test('an absolute or empty href is not a native route', () => {
  expect(sourceRoute(source('https://example.test/bills'))).toBeNull();
  expect(sourceRoute(source(''))).toBeNull();
});

test.each([
  { href: 'https://opax.com.au/doc/speech-1205524?utm_source=answer#passage' },
  { href: 'https://www.opax.com.au/doc/speech-1205524' },
  { slug: 'speech-1205524' },
  { resource: 'speech-1205524' },
])('a decoded saved source repairs its reader destination: %j', (shape) => {
  const [record] = decodeAnswer({
    answer: 'A public record.',
    sources: [
      {
        resource: 'fe1234567890abcdef1234567890abcd',
        title: 'Housing',
        snippet: 'The housing measures apply across Australia.',
        ...shape,
      },
    ],
  }).sources;
  expect(sourceRoute(record!)).toEqual(
    docRoute('speech-1205524', 'Housing', {
      passage: 'The housing measures apply across Australia.',
    }),
  );
  expect(sourcePath(record!)).toBe(
    '/doc/speech-1205524?passage=The+housing+measures+apply+across+Australia.',
  );
});

test('the explicit reader link wins over a conflicting saved slug', () => {
  const [record] = decodeAnswer({
    answer: 'Record.',
    sources: [
      {
        resource: 'r1',
        title: 'Housing',
        href: '/doc/speech-1205524',
        slug: 'speech-999',
        snippet: '',
      },
    ],
  }).sources;
  expect(sourceRoute(record!)).toEqual(docRoute('speech-1205524', 'Housing'));
});

test.each([
  { href: 'https://other.test/doc/speech-1205524', slug: 'speech-1205524' },
  { href: 'javascript:alert(1)', slug: 'speech-1205524' },
  { href: 'https://opax.com.au@other.test/doc/speech-1205524' },
  { resource: 'fe1234567890abcdef1234567890abcd' },
  { slug: 'Andrew Wilkie' },
])(
  'an untrusted URL or non-public identifier never borrows a reader route: %j',
  (record) => {
    expect(recordRoute(record)).toBeNull();
  },
);
