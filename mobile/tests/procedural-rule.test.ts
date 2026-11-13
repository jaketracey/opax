/**
 * What counts as a procedural vote, read from the stage and the question put.
 * The questions are public parliamentary records from the release data
 * (portal/public/bills), Senate 2026.
 */
import {
  isProcedural,
  orderDivisions,
  voteTier,
} from '../src/features/bills/divisions';

const LIMIT = 'Limitation of debate';

describe('votes under a time limit (Limitation of debate)', () => {
  test.each([
    [
      'the bill passing',
      'Sue Lines The question now is that the remaining stages of the bill be agreed to and the bill be now passed.',
    ],
    [
      'the bills passing',
      'Sue Lines The question now is that the remaining stages of the bill be agreed to, and the bills be now passed.',
    ],
    [
      'an amendment, after the time-limit preamble',
      'Sue Lines I will now deal with the remaining second reading amendments circulated by the opposition. The question is that the amendments on sheet 3884, 3887 and 3892 be agreed to.',
    ],
    [
      'an amendment, the chair naming the expired time first',
      'Slade Brockman Minister, please resume your seat. Pursuant to order agreed on 18 August, the time allotted for the remaining stages of these bills has expired. The question before the chair is that Australian Greens amendments (1) and (2) on sheet 3901 be agreed to.',
    ],
    [
      'a second reading',
      'Sue Lines The question is that these bills be now read a second time.',
    ],
    [
      "They Vote For You's title for an amendment",
      'Combatting Antisemitism, Hate and Extremism (Criminal and Migration Laws) Bill 2026 - Limitation of Debate - Review and lawful political expression',
    ],
    [
      "They Vote For You's title for the passage",
      'Combatting Antisemitism, Hate and Extremism (Firearms and Customs Laws) Bill 2026 - Limitation of Debate - Pass the bill',
    ],
    [
      "They Vote For You's summary of a third reading",
      'The majority voted in favour of a [motion](https://www.openaustralia.org.au/senate/?gid=2026-03-12.177.1) *that the remaining stages of the bill be agreed to and the bill now be passed.*',
    ],
    [
      'a clause standing as printed',
      'The majority voted against a [motion](https://www.openaustralia.org.au/senate/?id=2026-04-01.23.1) that clause 43 stand as printed.',
    ],
  ])('%s is substantive', (_, question) => {
    expect(isProcedural(LIMIT, question)).toBe(false);
    expect(voteTier(LIMIT, question)).toBe(2);
  });

  test.each([
    [
      'the time-limit motion itself',
      'Sue Lines The question is that the motion as moved by Senator David Pocock be agreed to.',
    ],
    [
      'an amendment to the time-limit motion; a bill title saying "Amendment" is not one',
      'David Pocock I move: That the motion be amended as follows: At the end of the motion, add "and the provisions of Schedule 1 to the Treasury Laws Amendment (Tax Reform No. 1) Bill 2026 and the provisions of the Income Tax Rates Amendment (Tax Reform No. 1) Bill 2026 be referred to the Economics Legislation Committee for inquiry and report by 14 September 2026".',
    ],
    ['a record with no motion text', 'Long debate text truncated.'],
    ['no question at all', null],
  ])('%s stays procedural', (_, question) => {
    expect(isProcedural(LIMIT, question)).toBe(true);
    expect(voteTier(LIMIT, question)).toBe(3);
  });
});

describe('procedural stages', () => {
  test.each([
    'Business motion',
    'Declaration of Urgency',
    'Motion to Dissent from Ruling',
    'Urgency motion',
    'Let a vote happen',
    'Closure',
    'Suspension of standing orders',
  ])('%s is procedural whatever its question says', (stage) => {
    expect(isProcedural(stage)).toBe(true);
    // A business motion's amendment is an amendment to the motion, and a
    // bill named in it is not its passage.
    expect(
      isProcedural(
        stage,
        'The majority voted against an amendment to a motion that the Fair Work Legislation Amendment Bill be now passed.',
      ),
    ).toBe(true);
  });

  test('stages that are not procedural stay that way', () => {
    for (const stage of [
      'Third reading',
      'Second reading',
      'Business',
      '',
      null,
    ])
      expect(isProcedural(stage)).toBe(false);
  });
});

describe('the bill page orders by the same rule', () => {
  test('a guillotined passage is main; the time-limit motion folds; stage falls back to title', () => {
    const rows = [
      {
        key: 'a',
        date: '2026-08-20',
        stage: LIMIT,
        question:
          'Sue Lines The question now is that the remaining stages of the bill be agreed to and the bill be now passed.',
      },
      {
        key: 'b',
        date: '2026-08-20',
        stage: LIMIT,
        question:
          'Sue Lines The question is that the motion as moved by Senator David Pocock be agreed to.',
      },
      { key: 'c', date: '2026-08-19', stage: null, title: 'Business motion' },
    ];
    const { main, procedural } = orderDivisions(rows);
    expect(main.map((d) => d.key)).toEqual(['a']);
    expect(procedural.map((d) => d.key)).toEqual(['b', 'c']);
  });
});
