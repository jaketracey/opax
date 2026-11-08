import {
  reportMail,
  reportReasons,
  reportText,
} from '../src/features/ask/report-mail';
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

describe('the report sheet’s Mail fallback (journeys/ask.md 4.9)', () => {
  const question = {
    role: 'user' as const,
    text: 'What has Sam Placeholder said about the example levy in parliament this year, in detail?',
  };
  const source = (n: number) => ({
    resource: String(n).repeat(32).slice(0, 32),
    title: `Example record ${n}`,
    slug: `fixture-${n}`,
    href: `/doc/fixture-${n}`,
    snippet: 'A passage that must never be quoted in the report.',
    cited: true,
    answerRanges: [[0, 4]] as [number, number][],
  });
  const long = Array.from({ length: 1700 }, (_, i) => `word${i}`).join(' ');
  const answer = {
    role: 'answer' as const,
    text: long,
    at: Date.parse('2026-11-08T23:30:00Z'),
    result: {
      answer: long,
      citations: {},
      sources: [source(1), source(2)],
    },
  };
  const mail = reportMail({
    reason: reportReasons[1],
    note: 'The date is a day out.',
    question,
    answer,
  });
  test('addressed to corrections, the subject cut at 60 characters', () => {
    expect(mail.url.startsWith('mailto:corrections@opax.com.au?subject=')).toBe(
      true,
    );
    expect(mail.subject.startsWith('Report: ')).toBe(true);
    expect(mail.subject.length).toBeLessThanOrEqual('Report: '.length + 60);
    expect(mail.subject.endsWith('…')).toBe(true);
    const url = new URL(mail.url);
    expect(url.searchParams.get('body')).toBe(mail.body);
  });
  test('a long answer is cut at a word boundary; the body stays under 2,000', () => {
    expect(long.length).toBeGreaterThan(10_000);
    expect(mail.body.length).toBeLessThan(2000);
    expect(mail.body).toMatch(/word\d+…/);
    expect(mail.body).toContain('Reason: A date, name or figure is wrong');
    expect(mail.body).toContain('Detail: The date is a day out.');
    expect(mail.body).toContain(`Question: ${question.text}`);
    expect(mail.body).toMatch(/Answered \d{1,2} Nov 2026, \d{1,2}:\d{2} [ap]m/);
  });
  test('records are linked, not quoted', () => {
    expect(mail.body).toContain('https://opax.invalid/doc/fixture-1');
    expect(mail.body).toContain('https://opax.invalid/doc/fixture-2');
    expect(mail.body).not.toContain('must never be quoted');
    expect(reportText(mail)).toBe(
      `To: corrections@opax.com.au\nSubject: ${mail.subject}\n\n${mail.body}`,
    );
  });
});
