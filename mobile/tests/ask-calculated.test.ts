import {
  asAtFor,
  caveat,
  figureBlocks,
  isCalculated,
  kindLine,
  pills,
} from '../src/features/ask/calculated';
import type { Answer, Source } from '../src/features/ask/model';

const src = (resource: string, date?: string, cited = true): Source => ({
  resource,
  title: `Record ${resource}`,
  slug: resource,
  href: `/doc/${resource}`,
  snippet: '',
  cited,
  answerRanges: [],
  ...(date ? { date } : {}),
});
const table = '| Office | Pay |\n|---|---|\n| Backbencher | $233,660 |';
// specs/ask.md 6.6 fixtures, with the neutral placeholder member.
const payOverview: Answer = {
  answer: table,
  answer_status: 'calculated',
  pay_answer: true,
  money_overview: 'Sam Placeholder is paid as a backbencher.',
  citations: {},
  sources: [src('det-2025', '2025-07-01'), src('det-2026', '2026-07-01')],
};
const moneyOverview: Answer = {
  answer: table,
  answer_status: 'calculated',
  money_ranking: true,
  money_overview: 'Example Party disclosed these receipts.',
  citations: {},
  sources: [src('ret-a', '2023-24'), src('ret-b', '2024–25')],
};
const deterministic: Answer = {
  answer: table,
  answer_status: 'calculated',
  pay_answer: true,
  citations: {},
  sources: [src('det', '2026-07-01')],
};
const undated: Answer = {
  answer: table,
  answer_status: 'calculated',
  pay_answer: true,
  citations: {},
  sources: [src('det')],
};

test('pay with an overview: one pill before the overview, dated by the newest determination', () => {
  expect(isCalculated(payOverview)).toBe(true);
  expect(pills(payOverview)).toEqual({ overview: true, body: false });
  expect(asAtFor(payOverview)).toBe('1 Jul 2026');
  expect(kindLine(payOverview)).toBe(
    'Calculated from the pay determinations as at 1 Jul 2026',
  );
  expect(caveat(payOverview)).toBe('Entitlements, not payslips.');
});

test('money with an overview reads its latest financial year', () => {
  expect(kindLine(moneyOverview)).toBe(
    'Calculated from disclosed receipts to 2024–25',
  );
  expect(pills(moneyOverview).overview).toBe(true);
  expect(caveat(moneyOverview)).toBe(
    'A selection of disclosed receipts, not every donor.',
  );
  // An ISO receipt date reads as the financial year that holds it.
  expect(asAtFor({ ...moneyOverview, sources: [src('r', '2025-08-03')] })).toBe(
    '2025–26',
  );
});

test('the Worker’s date wins, and is never the answer’s own time', () => {
  expect(asAtFor({ ...payOverview, data_as_at: '2026-01-01' })).toBe(
    '1 Jan 2026',
  );
  expect(asAtFor({ ...moneyOverview, data_as_at: '2023-24' })).toBe('2023–24');
});

test('a fully deterministic block has no pill; model-written calculated text does', () => {
  expect(pills(deterministic)).toEqual({ overview: false, body: false });
  expect(kindLine(deterministic)).toBe(
    'Calculated from the pay determinations as at 1 Jul 2026',
  );
  expect(
    pills({ ...deterministic, answer: 'A backbencher is paid a base salary.' }),
  ).toEqual({ overview: false, body: true });
  expect(pills({ ...deterministic, model_written: true }).body).toBe(true);
  expect(
    pills({ ...deterministic, answer: 'Some prose.', model_written: false })
      .body,
  ).toBe(false);
});

test('undated sources leave the clause off', () => {
  expect(asAtFor(undated)).toBeNull();
  expect(kindLine(undated)).toBe('Calculated from the pay determinations');
  expect(kindLine({ ...moneyOverview, sources: [src('r')] })).toBe(
    'Calculated from disclosed receipts',
  );
});

test('evidence-only answers are the record’s words: no pill', () => {
  const evidence: Answer = {
    answer: 'A passage.',
    answer_status: 'evidence_only',
    citations: {},
    sources: [src('a', '2026-08-18')],
  };
  expect(pills(evidence)).toEqual({ overview: false, body: false });
  expect(kindLine(evidence)).toBe('Passages from the record');
  expect(caveat(evidence)).toBeNull();
});

test('uncited answers carry the caveat; an unknown status is drawn as ordinary', () => {
  const uncited: Answer = {
    answer: 'Words.',
    answer_status: 'uncited',
    citations: {},
    sources: [],
  };
  expect(caveat(uncited)).toBe(
    'This answer has no citations. Check the records it found.',
  );
  expect(pills(uncited).body).toBe(true);
  const evaluative = { ...uncited, answer_status: 'neutral_evaluative' };
  expect(kindLine(evaluative)).toBeNull();
  expect(pills(evaluative)).toEqual({ overview: false, body: true });
  expect(caveat(evaluative)).toBeNull();
});

test('figure blocks need their own date and source, or are not drawn', () => {
  const answer: Answer = {
    ...deterministic,
    figures: [
      {
        value: '$233,660',
        label: 'Base salary',
        as_at: '2026-07-01',
        source: 'Remuneration Tribunal',
        path: '/doc/det',
      },
      { value: '$1', as_at: '2026-07-01' },
      { value: '$2', source: 'Remuneration Tribunal' },
    ],
  };
  expect(figureBlocks(answer)).toEqual([
    {
      value: '$233,660',
      label: 'Base salary',
      asAt: '1 Jul 2026',
      source: 'Remuneration Tribunal',
      path: '/doc/det',
    },
  ]);
  expect(figureBlocks(deterministic)).toEqual([]);
});
