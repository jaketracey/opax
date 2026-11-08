import {
  answerCopyText,
  answeredLong,
  answeredText,
  questionShare,
} from '../src/features/ask/share-answer';
import type { Source, Turn } from '../src/features/ask/model';

jest.mock('../src/navigation/external', () => ({
  canonicalUrl: (path: string) => `https://opax.com.au${path}`,
}));
jest.mock('../src/navigation/share', () => ({
  questionShareURL: (text: string) =>
    `https://opax.com.au/ask?q=${encodeURIComponent(text)}`,
}));

const at = Date.parse('2026-11-08T23:30:00Z');
const speech: Source = {
  resource: 'a'.repeat(32),
  title: 'Sam Placeholder — Bills — 2026-05-14',
  slug: 'placeholder-speech',
  href: '/doc/placeholder-speech',
  snippet: '',
  cited: true,
  speaker: 'PLACEHOLDER, Sam, MP',
  party: 'Example Party',
  date: '2026-05-14',
  answerRanges: [[0, 16]],
};
const bill: Source = {
  resource: 'b'.repeat(32),
  title: 'Example Levy Bill 2026',
  slug: 'bill-example',
  href: '/bill/example',
  snippet: '',
  cited: true,
  date: '2026-08-17',
  answerRanges: [[17, 32]],
};
const question: Turn = { role: 'user', text: 'What did parliament say?' };
const answer: Turn = {
  role: 'answer',
  text: 'The levy passed. It took effect.',
  at,
  result: {
    answer: 'The levy passed. It took effect.',
    citations: {},
    sources: [speech, bill],
  },
};

test('answer time in the reader’s zone across the Sydney/UTC boundary', () => {
  expect(answeredText(answer, null, 'Australia/Sydney')).toBe(
    'Answered 9 Nov 2026, 10:30 am · OPAX',
  );
  expect(answeredText(answer, null, 'UTC')).toBe(
    'Answered 8 Nov 2026, 11:30 pm · OPAX',
  );
  expect(answeredLong(answer, null, 'UTC')).toBe(
    'Answered 8 November 2026, 11:30 pm',
  );
});

test('legacy answers read their conversation’s dates, never "Saved"', () => {
  const legacy: Turn = { ...answer, at: undefined };
  const created = Date.parse('2026-11-03T02:00:00Z') / 1000;
  expect(answeredText(legacy, { at: created, bound: false }, 'UTC')).toBe(
    'Answered 3 Nov 2026 · OPAX',
  );
  expect(answeredText(legacy, { at: created, bound: true }, 'UTC')).toBe(
    'Answered by 3 Nov 2026 · OPAX',
  );
  expect(answeredText(legacy, null)).toBe('OPAX');
});

test('Copy answer: question, answer, machine line, then records with links', () => {
  const text = answerCopyText(
    { ...question, askedAs: 'What did parliament say about the levy?' },
    answer,
    null,
    'UTC',
  );
  expect(text).toBe(
    [
      'What did parliament say?',
      'Answered as: What did parliament say about the levy?',
      '',
      'The levy passed. [1] It took effect. [2]',
      '',
      'Machine-written by OPAX on 8 Nov 2026',
      '',
      'Records cited',
      '[1] Bills, 14 May 2026, https://opax.com.au/doc/placeholder-speech',
      '[2] Example Levy Bill 2026, 17 Aug 2026, https://opax.com.au/bill/example',
    ].join('\n'),
  );
  expect(text).not.toMatch(/—|\d{4}-\d{2}-\d{2}|PLACEHOLDER/);
});

test('an uncited answer lists "Records found" without numerals', () => {
  const uncited: Turn = {
    ...answer,
    result: {
      answer: 'Words.',
      answer_status: 'uncited',
      citations: {},
      sources: [{ ...bill, cited: false, answerRanges: [] }],
    },
  };
  const text = answerCopyText(question, uncited, null, 'UTC');
  expect(text).toContain(
    'Records found\n- Example Levy Bill 2026, 17 Aug 2026, https://opax.com.au/bill/example',
  );
  expect(text).not.toContain('Records cited');
});

test('Share question carries the question and its asking link, not the answer', () => {
  expect(questionShare(question, answer)).toEqual({
    message: 'What did parliament say?',
    url: 'https://opax.com.au/ask?q=What%20did%20parliament%20say%3F',
  });
});
