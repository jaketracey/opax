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
  ['these bills be now read a second time.', 'Second reading'],
  ['the remaining stages of the bill be agreed to.', 'Remaining stages'],
  ['the amendments on sheet 1234 be agreed to.', 'Amendments'],
  ['the amendment on sheet 1234 be agreed to.', 'Amendment'],
  [
    'the amendment to the motion that the bill be now read a second time be agreed to.',
    'Amendment',
  ],
  [
    'the amendments to the motion that the bill be now read a third time be agreed to.',
    'Amendments',
  ],
  [
    'the opposition amendment (1) to Australian Greens amendment (2) be agreed to.',
    'Amendment',
  ],
  ['Australian Greens amendments (1) and (2) be agreed to.', 'Amendments'],
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

test('an announcement never adds a mover to the title', () => {
  expect(
    divisionTitle({
      stage,
      question:
        'Morgan Reed I will now deal with the amendments circulated by the Australian Greens. The question now is that the amendments on sheet 1234 be agreed to.',
    }),
  ).toBe('Amendments');
});

test.each([
  [
    'the Treasury Laws Amendment (Measures No. 1) Bill 2026 be now read a second time.',
    'Second reading',
  ],
  [
    'the Treasury Laws Amendment Bills be now read a second time.',
    'Second reading',
  ],
  [
    'the Social Services Legislation Amendment (Other Measures) Bills 2026 be now read a third time.',
    'Third reading',
  ],
  [
    'the Public Governance Amendment (Supporting Small Businesses To Be Paid On Time) Bills 2026 be now read a second time.',
    'Second reading',
  ],
  [
    'the Environment (Consequential Amendments) Bills be now passed.',
    'Third reading',
  ],
  [
    'the Public Governance, Performance and Accountability Amendment (Supporting Small Businesses To Be Paid On Time) Bill 2026 be now read a second time.',
    'Second reading',
  ],
  [
    'the Social Services Legislation Amendment (Other Measures) Bill 2025 be now read a third time.',
    'Third reading',
  ],
  [
    'the Treasury Laws Amendment and Other Measures Bill 2026 be now read a second time.',
    'Second reading',
  ],
  [
    'the Social Security and Other Legislation Amendment (Other Measures) Bill 2025 be now read a third time.',
    'Third reading',
  ],
  [
    'the Environment (Consequential Amendments) Bill 2026 be now read a third time.',
    'Third reading',
  ],
  ['the bill be now read a third time.', 'Third reading'],
  [
    'the amendment to the Treasury Laws Amendment Bill be agreed to.',
    'Amendment',
  ],
  [
    'the amendment to the Treasury Laws Amendment Bills be agreed to.',
    'Amendment',
  ],
  [
    'the amendments to the Environment (Consequential Amendments) Bills be agreed to.',
    'Amendments',
  ],
  [
    'the amendment to the Treasury Laws Amendment and Other Measures Bill 2026 be agreed to.',
    'Amendment',
  ],
  [
    'the amendments to the Social Services Legislation Amendment (Other Measures) Bill 2025 be agreed to.',
    'Amendments',
  ],
])('a bill name is not the amendment being voted on: %s', (motion, title) => {
  expect(divisionTitle({ stage, question: `That ${motion}` })).toBe(title);
});

test('a Consequential Amendments bill retains its third reading when the question only says the bill', () => {
  expect(
    divisionTitle({
      title: stage,
      stage,
      head: 'Environment (Consequential Amendments) Bill 2026',
      question: 'That the bill be now read a third time.',
    }),
  ).toBe('Third reading');
});

test.each([
  null,
  '',
  'Long debate text truncated.',
  'Morgan Reed I advise senators that there will be one-minute bells.',
  'Morgan Reed I will now deal with the remaining stages of the bill.',
  'The question is that the motion as moved be agreed to.',
  'Example Bill - Limitation of Debate - Review and lawful political expression',
  'The question is that the time allotted for the remaining stages of the bill be extended.',
  'The question is that the time for consideration of the remaining stages be extended.',
  'The question is that part 4 stand as amended and section 59D stand as printed.',
  'The majority voted against an amendment to the motion that the bill be now read a second time.',
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
  [
    'The majority voted against an amendment to the question is that the bill be read a second time.',
    null,
  ],
  [
    'The majority voted for a motion to amend the bill so that the FWC can act.',
    null,
  ],
  [
    'The majority voted for a motion to read the bill. The party that introduced it is listed below.',
    null,
  ],
  ['The question is that "', null],
  [
    'The question is that, in schedule 1, part 9 stand as printed.',
    'That in schedule 1, part 9 stand as printed.',
  ],
  [
    'The question is that item 3 of Sch. 1 and cl. 2 in Pt. 3 of Bill No. 1 stand as printed.',
    'That item 3 of Sch. 1 and cl. 2 in Pt. 3 of Bill No. 1 stand as printed.',
  ],
  [
    'The question is that "the amendments be agreed to." More transcript follows.',
    'That the amendments be agreed to.',
  ],
])('the party motion is one sentence or absent: %s', (question, motion) => {
  expect(divisionMotion(question)).toBe(motion);
});

test('a party motion above 240 characters is absent, never truncated into a different motion', () => {
  const question = `The question is that the amendments ${'on sheet 1234 '.repeat(20)}be agreed to.`;
  expect(divisionMotion(question)).toBeNull();
  expect(divisionTitle({ stage, question })).toBe(stage);
});

test.each(['10190', '10192', '10193'])(
  'r7375 %s votes on an amendment, not the reading quoted in its summary',
  (key) => {
    const bill = decodeBill(pinned('/bills/au-federal-r7375.json'));
    const division = bill.divisions.find(
      (d) => d.key === `federal-senate-${key}`,
    )!;
    expect(division.question).toContain('amendment');
    expect(divisionMotion(division.question)).toBeNull();
    expect(divisionTitle(division)).toBe('Limitation of debate');
    expect(divisionMeta(division, where)).toBe(where);
  },
);

test.each([
  ['r7494', 'federal-representatives-10324'],
  ['s1496', 'federal-senate-10578'],
  ['s1496', 'federal-senate-10579'],
])(
  '%s %s never turns an explanatory relative clause into a motion',
  (billKey, divisionKey) => {
    const bill = decodeBill(pinned(`/bills/au-federal-${billKey}.json`));
    expect(
      divisionMotion(
        bill.divisions.find((d) => d.key === divisionKey)!.question,
      ),
    ).toBeNull();
  },
);

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
