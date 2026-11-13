import { partyDivisions } from '../src/api/party-page';
import { decodeBill } from '../src/api/catalog-decoders';
import { divisionRows } from '../src/features/directories/model';
import {
  divisionMeta,
  divisionMotion,
  divisionTitle,
  isProcedural,
} from '../src/features/bills/divisions';
import { pinned } from './pinned';

const stage = 'Limitation of debate';
const where = 'Senate · 19 Aug 2026';

test.each([
  ['the bill be now passed.', 'Third reading'],
  ['the bill now be passed.', 'Third reading'],
  ['the bills be read a third time.', 'Third reading'],
  ['the bills be now read a second time.', 'Second reading'],
  ['the remaining stages of the bill be agreed to.', 'Remaining stages'],
  ['the amendments on sheet 1234 be agreed to.', 'Amendments'],
  [
    'Australian Greens amendments (1) and (2) be agreed to.',
    'Amendments (Greens)',
  ],
  ['clause 43 stand as printed.', 'Clauses as printed'],
  // Later transcript references to amendments do not rename a clause vote.
  [
    'section 62E stand as printed. This is item (7) of the Australian Greens amendments.',
    'Clauses as printed',
  ],
])('the time-limited question "%s" is titled %s', (motion, title) => {
  const division = {
    stage,
    title: stage,
    question: `Morgan Reed The question is that ${motion}`,
  };
  expect(divisionTitle(division)).toBe(title);
  expect(divisionMeta(division, where)).toBe(`${where} · under a time limit`);
  expect(isProcedural(stage, division.question)).toBe(false);
});

test('a Greens announcement names the mover when the question only says amendments', () => {
  expect(
    divisionTitle({
      stage,
      question:
        'Morgan Reed I will now deal with the amendments circulated by the Australian Greens. The question now is that the amendments on sheet 1234 be agreed to.',
    }),
  ).toBe('Amendments (Greens)');
});

test.each([
  null,
  '',
  'Long debate text truncated.',
  'Morgan Reed I advise senators that there will be one-minute bells.',
  'Morgan Reed I will now deal with the remaining stages of the bill.',
  'The question is that the motion as moved be agreed to.',
  'Example Bill - Limitation of Debate - Review and lawful political expression',
])(
  'an unparsed time-limit question keeps its recorded title: %s',
  (question) => {
    const division = { title: stage, stage, question };
    expect(divisionTitle(division)).toBe(stage);
    expect(divisionMeta(division, where)).toBe(where);
  },
);

test('ordinary recorded stages keep their title even if their question names a reading', () => {
  expect(
    divisionTitle({
      stage: 'In committee',
      question: 'That the bill be read a third time.',
    }),
  ).toBe('In committee');
  expect(
    divisionTitle({ title: stage, question: 'That the bill be now passed.' }),
  ).toBe('Third reading');
});

test.each([
  [
    'Morgan Reed The question is that the first amendment be agreed to. The question now is that the bill be now passed. Question agreed to.',
    'That the bill be now passed.',
  ],
  [
    'Morgan Reed The question before the chair is that Australian Greens amendments be agreed to.',
    'That Australian Greens amendments be agreed to.',
  ],
  [
    '**Morgan Reed** That the bill be now read a second time. One-minute bells.',
    'That the bill be now read a second time.',
  ],
  [
    'The majority voted against a [motion](https://example.com/division) *that clause 43 stand as printed.*',
    'That clause 43 stand as printed.',
  ],
  ['That the amendments be agreed to', 'That the amendments be agreed to.'],
  [
    'Morgan Reed Senators voted for an earlier motion. The question is that the bill be now passed.',
    'That the bill be now passed.',
  ],
  [
    'The question is that the Example Bill (No. 1) be now read a second time. Question agreed to.',
    'That the Example Bill (No. 1) be now read a second time.',
  ],
  [
    'Morgan Reed Pursuant to order agreed yesterday, the time allotted has expired.',
    null,
  ],
  [
    'Morgan Reed I advise senators that, if further divisions are required, there will be one-minute bells.',
    null,
  ],
  [null, null],
])('the party motion is one sentence or absent: %s', (question, motion) => {
  expect(divisionMotion(question)).toBe(motion);
});

test('party and directory projections use the same vote presentation', () => {
  const bill = decodeBill(pinned('/bills/au-federal-r7534.json'));
  const party = partyDivisions('Labor', [bill]);
  const directory = divisionRows([bill]);
  expect(party.length).toBeGreaterThan(0);
  for (const row of party) {
    expect(row.question).toBe(divisionMotion(row.division.question));
    if (row.question) expect(row.question).toMatch(/^That /);
  }
  for (const row of directory) {
    const source = bill.divisions.find((d) => row.key.endsWith(`:${d.key}`))!;
    expect(row.voteTitle).toBe(divisionTitle(source));
    expect(row.voteQualifier).toBe(divisionMeta(source, '') || null);
  }
});
