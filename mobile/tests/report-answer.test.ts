import { openSource } from '../src/navigation/external';
import { reportAnswer, reportAnswerUrl } from '../src/voice/report-answer';
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { extra: { supportPageAvailable: true } } },
}));
jest.mock('../src/navigation/external', () => ({
  canonicalUrl: (path: string) => {
    if (path.includes('..') || path.includes('%') || path.includes('\\'))
      throw new Error('Invalid path');
    return `https://opax.invalid${path}`;
  },
  openSource: jest.fn(),
}));

test('live support carries the canonical record path only', () => {
  const url = new URL(reportAnswerUrl('/bill/fixture-bill', true));
  expect(url.origin + url.pathname).toBe('https://opax.invalid/support');
  expect([...url.searchParams.entries()]).toEqual([
    ['record', '/bill/fixture-bill'],
  ]);
});
test('until support is published reports open GitHub with the record and a privacy reminder', async () => {
  const url = reportAnswerUrl('/doc/fixture-record', false);
  const parsed = new URL(url);
  expect(parsed.origin + parsed.pathname).toBe(
    'https://github.com/jaketracey/opax/issues/new',
  );
  expect(parsed.searchParams.get('body')).toContain(
    'Record: https://opax.invalid/doc/fixture-record',
  );
  expect(parsed.searchParams.get('body')).toContain(
    'do not include personal information',
  );
  await reportAnswer('/doc/fixture-record');
  expect(openSource).toHaveBeenCalledWith(
    reportAnswerUrl('/doc/fixture-record', true),
    'Report this answer',
  );
});
test('a missing record opens published support without a record and never throws', async () => {
  expect(reportAnswerUrl(null)).toBe('https://opax.invalid/support');
  await expect(reportAnswer(null)).resolves.toBeUndefined();
  expect(openSource).toHaveBeenCalledWith(
    'https://opax.invalid/support',
    'Report this answer',
  );
});
test('person slugs carry only their exact catalog path', () => {
  const url = new URL(reportAnswerUrl('/subject/person/fixture-person'));
  expect([...url.searchParams.entries()]).toEqual([
    ['record', '/subject/person/fixture-person'],
  ]);
});
test.each([
  '/api/voice/start',
  '/ask',
  '//foreign.test/doc/a',
  '/doc/a?token=secret',
  '/doc/a#secret',
  '/doc/..',
  '/doc/%2e%2e',
  '/doc/space here',
  '/doc/<markup>',
  '/doc/' + 'a'.repeat(301),
])('report rejects unsafe record path %s', (path) => {
  expect(() => reportAnswerUrl(path, true)).toThrow();
});
