import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { contradictedByRecord, decidingDivision, divisionReading, divisionOutcomeWord } from '../public/bill-division.js';

// Real bill and division records, pinned (see its _about): a data refresh does not move these tests, and they run
// on branches whose exports are older.
const RECORDS = JSON.parse(readFileSync(new URL('./fixtures/bill-division-records.json', import.meta.url), 'utf8'));
const bill = (key) => RECORDS.bills[`au-federal-${key}`];
const division = (b, key) => b.divisions.find(d => d.key === key);
/** The deciding division as the vote slide asks for it: the bill's house and its own progress. */
const decided = (b) => {
  const contradicted = [];
  const found = decidingDivision(b.divisions, { originatingHouse: b.originating_house, bill: b, onContradicted: (x) => contradicted.push(x.division.key) });
  return { found, contradicted, line: found ? `${found.division.key} ${found.reading} ${found.outcome} ${found.division.ayes}-${found.division.noes}` : null };
};

// The Senate's third reading of the Defence Amendment (Parliamentary Joint Committee on Defence) Bill 2025, 4 March
// 2026: a closure moved on the third reading (9971) and the third reading itself (9972), filed under one name.
const NAME = 'Bills \u2014 Defence Amendment (Parliamentary Joint Committee on Defence) Bill 2025; Third Reading';
const CLOSURE_9971 = "Jenny McAllister I move: That the question be now put. Nick McKim On a point of order, I would like to make a contribution on the third reading, and I would ask for the minister's indulgence to withdraw\u2014 Sue Lines As you are aware, it is the minister's prerogative to move that the question be put. You can vote either way, but the motion has been moved. Steph Hodgins-May The question is that the question be put on the third reading.";
const THIRD_9972 = 'Steph Hodgins-May The question now is that the bill be read a third time.';
const exported = (over) => ({ date: '2026-03-04', house: 'senate', stage: 'Third reading', outcome: 'affirmative', ayes: 30, noes: 18, ...over });
const d9971 = exported({ key: 'federal-senate-9971', question: CLOSURE_9971, ayes: 29 });
const d9972 = exported({ key: 'federal-senate-9972', question: THIRD_9972 });

test('9971/9972: the closure on the third reading is never the vote on the bill; the third reading is', () => {
  assert.equal(divisionReading(d9971), null);
  assert.equal(divisionReading(d9972), 'third');
  for (const divisions of [[d9971, d9972], [d9972, d9971]]) {
    const found = decidingDivision(divisions, { originatingHouse: 'representatives' });
    assert.equal(found?.division.key, 'federal-senate-9972');
    assert.equal(found?.reading, 'third');
    assert.equal(found?.outcome, 'Passed');
  }
  // The same pair as division files give it: a name (with the record's own dash) and a result, no stage. The name is the same for both.
  const file = (d) => ({ key: d.key, date: d.date, house: d.house, name: NAME, question: d.question, result: d.outcome, ayes: d.ayes, noes: d.noes });
  assert.equal(decidingDivision([file(d9971), file(d9972)])?.division.key, 'federal-senate-9972');
  // A later closure (by date or by division number) still does not win; alone, it gives nothing.
  assert.equal(decidingDivision([d9972, { ...d9971, date: '2026-03-05' }])?.division.key, 'federal-senate-9972');
  assert.equal(decidingDivision([d9972, { ...d9971, key: 'federal-senate-9999' }])?.division.key, 'federal-senate-9972');
  assert.equal(decidingDivision([d9971]), null);
});

test('9971/9972 as the exports held them: the bill file and the two division files', () => {
  const r7378 = bill('r7378');
  const found = decidingDivision(r7378.divisions, { originatingHouse: r7378.originating_house, bill: r7378 });
  assert.equal(found?.division.key, 'federal-senate-9972');
  assert.equal(found?.outcome, 'Passed');
  const files = ['federal-senate-9971', 'federal-senate-9972'].map(key => RECORDS.divisions[key]);
  assert.equal(files[0].name, files[1].name);
  assert.deepEqual(files.map(d => divisionReading(d)), [null, 'third']);
});

test('only the division record decides: a Hansard extract that quotes no Chair\'s question decides nothing, whatever its speeches say', () => {
  // r7456 passed and had Royal Assent on 27 Mar 2026. Its Senate division of 26 Mar (10126, 10 to 25, lost) is filed
  // under "Second reading", and its text is the minister's "I move: That this bill be now read a second time" and
  // the speech after it: the division was on something else. r5760 and r5761 (4421, 12 to 45, lost) are the same.
  for (const [key, div] of [['r7456', 'federal-senate-10126'], ['r5760', 'federal-senate-4421'], ['r5761', 'federal-senate-4421']]) {
    const b = bill(key);
    const d = division(b, div);
    assert.equal(d.outcome, 'negative', div);
    assert.match(d.question, /I move:? that (?:this|the|these) bills? be now read a second time/i, div);
    assert.doesNotMatch(d.question, /\bquestion (?:now )?is\b/i, div);
    assert.equal(divisionReading(d), null, div);
    assert.equal(decided(b).line, null, key);
  }
  // The same motion and speech under a third-reading stage decide nothing either.
  const speech = division(bill('r7456'), 'federal-senate-10126');
  assert.equal(divisionReading({ ...speech, stage: 'Third reading', question: speech.question.replace(/second time/gi, 'third time') }), null);
  // The division record still decides: a They Vote For You summary (first sentence), a division's name, the Chair's question.
  const base = { stage: 'Second reading', outcome: 'negative' };
  assert.equal(divisionReading({ ...base, question: 'The majority voted against a motion to read the bill for a second time. The minister moved amendments.' }), 'second');
  assert.equal(divisionReading({ ...base, question: 'This division relates to the Policy For x. The majority voted against a motion to read the bill for a second time.' }), 'second');
  assert.equal(divisionReading({ ...base, question: 'Example Bill 2026 - Second Reading - Read a second time' }), 'second');
  assert.equal(divisionReading({ ...base, question: 'Sue Lines The question is that the bill be now read a second time.' }), 'second');
  // The summary's opening line about the policy is not the motion: r5271's Senate third reading (3243), Passed 39 to 11.
  assert.equal(decided(bill('r5271')).line, 'federal-senate-3243 third Passed 39-11');
});

test('the Chair\'s question decides only if the record\'s result agrees with the division', () => {
  // r5790, House, 29 Nov 2016: 4444 (69 to 79, lost) quotes the second reading last, then "Bill read a second time":
  // the reading was carried, so the lost division was on the amendment put before it.
  const r5790 = bill('r5790');
  const d4444 = division(r5790, 'federal-representatives-4444');
  assert.equal(d4444.outcome, 'negative');
  assert.match(d4444.question, /Bill read a second time/);
  assert.equal(divisionReading(d4444), null);
  assert.equal(decided(r5790).line, 'federal-senate-4510 third Passed 43-19');
  assert.equal(divisionReading({ stage: 'Second reading', outcome: 'affirmative', question: 'The question is that the bill be now read a second time. Question negatived.' }), null);
  assert.equal(divisionReading({ stage: 'Second reading', outcome: 'negative', question: 'The question is that the bill be now read a second time. Question negatived.' }), 'second');
});

test('a lost reading the bill\'s own record contradicts is dropped, never shown as "Not agreed", and reported', () => {
  // r5738 lost a Senate second reading (4425, 30 to 31) and then passed: alone, 4425 would be its vote.
  const r5738 = bill('r5738');
  const d4425 = division(r5738, 'federal-senate-4425');
  assert.equal(decidingDivision([d4425])?.outcome, 'Not agreed');
  const seen = [];
  assert.equal(decidingDivision([d4425], { bill: r5738, onContradicted: (x) => seen.push(`${x.division.key} ${x.reading}`) }), null);
  assert.deepEqual(seen, ['federal-senate-4425 second']);
  // A bill that passed, or has Royal Assent, lost none of its readings.
  assert.equal(contradictedByRecord(d4425, 'second', { status: 'passed' }), true);
  assert.equal(contradictedByRecord(d4425, 'second', { status: 'lapsed', key_dates: [{ stage: 'royal_assent', date: '2016-12-02', house: 'senate' }] }), true);
  // Nor did one that went on in that house the same day or later; a later stage in the other house, or an earlier
  // one, says nothing.
  const lapsed = (stage, date, house = 'senate') => ({ status: 'lapsed', key_dates: [{ stage, date, house }] });
  assert.equal(contradictedByRecord(d4425, 'second', lapsed('committee', '2016-11-23')), true);
  assert.equal(contradictedByRecord(d4425, 'second', lapsed('third_reading', '2016-11-24')), true);
  assert.equal(contradictedByRecord(d4425, 'second', lapsed('third_reading', '2016-11-24', 'representatives')), false);
  assert.equal(contradictedByRecord(d4425, 'second', lapsed('third_reading', '2016-11-22')), false);
  assert.equal(contradictedByRecord(d4425, 'second', lapsed('second_reading', '2016-11-24')), false);
  assert.equal(contradictedByRecord({ ...d4425, outcome: 'affirmative' }, 'second', { status: 'passed' }), false);
  // A lost third reading: the bill's later passing in that house, or a later third reading there.
  const third = { ...d4425, stage: 'Third reading' };
  assert.equal(contradictedByRecord(third, 'third', lapsed('third_reading', '2016-11-23')), false);
  assert.equal(contradictedByRecord(third, 'third', lapsed('third_reading', '2016-11-24')), true);
  assert.equal(contradictedByRecord(third, 'third', lapsed('passed', '2016-11-23')), true);
  // Every pinned bill that passed: never "Not agreed".
  for (const b of Object.values(RECORDS.bills)) {
    if (b.status !== 'passed' && !b.key_dates.some(k => k.stage === 'royal_assent')) continue;
    assert.notEqual(decided(b).found?.outcome, 'Not agreed', b.key);
  }
});

test('They Vote For You\'s usual second-reading wordings count: "the bill\'s main idea", "the main idea of the bill"', () => {
  // s1470, Senate, 24 Jun 2026: "voted against a motion to agree with the bill's main idea".
  assert.equal(decided(bill('s1470')).line, 'federal-senate-10327 second Not agreed 27-34');
  // r7408, House, 10 Feb 2026: "voted in favour of a motion to agree with the main idea of the bill".
  assert.equal(decided(bill('r7408')).line, 'federal-representatives-9906 second Agreed 97-38');
  // s1430: the 2026 vote (9890, "- Second Reading - Agree with bill's main idea") is the latest, not the 2024 one (9176).
  const s1430 = bill('s1430');
  assert.equal(divisionReading(division(s1430, 'federal-senate-9890')), 'second');
  assert.equal(decided(s1430).line, 'federal-senate-9890 second Not agreed 12-29');
  for (const question of [
    'The majority voted in favour of agreeing with the main idea of the bill.',
    'The majority voted in favour of the main idea of the bills.',
    'Example Bill 2026 - Second Reading - Agree with the bills\' main idea',
  ]) assert.equal(divisionReading({ stage: 'Second reading', outcome: 'affirmative', question }), 'second', question);
  // Their negations are motions against the bill, not its reading.
  for (const question of [
    'Example Bill 2026 - Second Reading - Don\'t agree with the main idea of the bill',
    'Example Bill 2026 - Second Reading - Don\'t agree with the bill\'s main idea',
  ]) assert.equal(divisionReading({ stage: 'Second reading', outcome: 'negative', question }), null, question);
});

test('procedural questions are never the bill\'s division, whatever stage they sit under', () => {
  const procedural = [
    ['Third reading', 'Tony Smith The question is that the question be now put.'],
    ['Limitation of debate', 'Katy Gallagher I move: That the time allotted for the remaining stages of these bills be as follows. The question is that the motion moved by the Leader of the Government in the Senate be agreed to.'],
    ['Third reading', 'The question is that so much of the standing orders be suspended as would prevent the member moving a motion.'],
    ['Second reading', 'The question is that the debate be now adjourned.'],
    ['Third reading', 'The question is that the member be no longer heard.'],
    ['Second reading', 'The majority voted in favour of a motion that the debate be not adjourned.'],
    ['Third reading', 'Bill 2014 - Third Reading - Put the question'],
    ['Third reading', 'Bill 2014 - Third Reading - Speed things along'],
    ['Third reading', 'Bill 2014 - Third Reading - Suspend standing orders'],
    // The third reading was put, then a suspension was moved on it: the division was on the suspension.
    ['Third reading', 'Mr Speaker The question is that this bill be now read a third time. The Manager of Opposition Business? I move: That so much of the standing orders be suspended as would prevent the members speaking on the bill\'s third reading.'],
  ];
  for (const [stage, question] of procedural) assert.equal(divisionReading({ stage, question, outcome: 'affirmative' }), null, question);
  // A key the bill pages list as procedural is procedural, whatever its text.
  assert.equal(divisionReading(d9972, { 'federal-senate-9972': 'Put the question' }), null);
});

test('a guillotined bill\'s own readings count, though the export files them under "Limitation of debate"', () => {
  const guillotined = [
    exported({ key: 'federal-senate-10001', stage: 'Limitation of debate', question: 'The question is that the motion for the allotment of time be agreed to.', date: '2026-03-01' }),
    exported({ key: 'federal-senate-10002', stage: 'Limitation of debate', question: 'Sue Lines The question is that these bills be now read a second time.', date: '2026-03-02' }),
    exported({ key: 'federal-senate-10003', stage: 'Limitation of debate', question: 'Sue Lines The question now is that the remaining stages of the bill be agreed to, and the bills be now passed.', date: '2026-03-02' }),
  ];
  assert.deepEqual(guillotined.map(d => divisionReading(d)), [null, 'second', 'third']);
  assert.equal(decidingDivision(guillotined)?.division.key, 'federal-senate-10003');
  // "(No. 2)" in the bill's name does not cut the question short.
  assert.equal(divisionReading(exported({ question: 'The question is that the remaining stages of the Tax Laws Amendment (2013 Measures No. 2) Bill 2013 be agreed to and the bill be now passed.' })), 'third');
});

test('9818: under a guillotine, a Senate vote named only "Limitation of Debate - Pass the bill" is the bill\'s third reading', () => {
  // r7421 passed the House on 20 Jan 2026 (9809) and the Senate the same day under a limitation of debate. The
  // Senate's passing vote (9818, 38 to 26) has no text but its name, in the bill export and in its division file.
  const r7421 = bill('r7421');
  const d9818 = division(r7421, 'federal-senate-9818');
  assert.match(d9818.question, / Bill 2026 - Limitation of Debate - Pass the bill$/);
  assert.equal(divisionReading(d9818), 'third');
  assert.equal(divisionReading(RECORDS.divisions['federal-senate-9818']), 'third');
  // So the second house's third reading decides, not the House's.
  const { line, contradicted } = decided(r7421);
  assert.equal(line, 'federal-senate-9818 third Passed 38-26');
  assert.deepEqual(contradicted, []);
  // The other divisions under the same guillotine stay out: the allotment of time, the amendments, the report.
  for (const key of ['9812', '9813', '9814', '9815', '9816', '9817']) assert.equal(divisionReading(division(r7421, `federal-senate-${key}`)), null, key);
  // Only "Pass the bill(s)" as the last part of a name: any other last part, or the words with more after them, decide nothing.
  for (const question of [
    'Example Bill 2026 - Limitation of Debate - Nationals amendments',
    'Example Bill 2026 - Limitation of Debate - Agree to the motion',
    'Example Bill 2026 - Limitation of Debate - Pass the bill. Senator Example I move that the question be now put.',
    'Example Bill 2026 - Limitation of Debate - Pass the bill to committee',
  ]) assert.equal(divisionReading({ stage: 'Limitation of debate', question, outcome: 'affirmative' }), null, question);
  // Two bills under one guillotine (federal-senate-10042) read the same; a lost passing vote is "Not agreed".
  const pair = { key: 'federal-senate-10042', date: '2026-03-25', house: 'senate', stage: 'Limitation of debate', outcome: 'negative', ayes: 22, noes: 33, question: 'Example Bill 2026 and another - Limitation of Debate - Pass the bills' };
  assert.equal(divisionReading(pair), 'third');
  assert.equal(decidingDivision([pair])?.outcome, 'Not agreed');
});

test('amendments and motions to decline the bill are not its reading', () => {
  const amendments = [
    ['Second reading', 'Family Assistance Bill 2014 - Second Reading - Decline to read a second time'],
    ['Second reading', 'Bill 2014 - Second Reading - Don\'t agree with the bill\'s main idea'],
    ['Second reading', 'The majority voted against adding the text below to the usual second reading motion, which is "that the bills be read a second time".'],
    ['Second reading', 'The majority agreed to add a proviso to the motion to agree with the bills\' main idea.'],
    ['Second reading', 'The question is that the amendment be agreed to.'],
    ['Second reading', 'The question is that the words proposed to be omitted stand part of the question.'],
    ['Third reading', 'The question is that the amendment moved to the motion for the third reading be agreed to.'],
    // A summary under consideration in detail that mentions the third reading only in passing.
    ['Consideration in detail', 'The majority voted in favour of a motion "that the bill, as amended, be agreed to." This means they can now vote on whether to read the bill for a third time.'],
  ];
  for (const [stage, question] of amendments) assert.equal(divisionReading({ stage, question, outcome: 'negative' }), null, question);
});

test('the second house\'s third reading first, then the latest third reading, then the latest second reading; never anything else', () => {
  const house = exported({ key: 'federal-representatives-1', house: 'representatives', date: '2026-03-10', question: 'The question is that this bill be now read a third time.' });
  const senate = exported({ key: 'federal-senate-2', house: 'senate', date: '2026-03-04', question: THIRD_9972 });
  assert.equal(decidingDivision([house, senate], { originatingHouse: 'representatives' })?.division.key, 'federal-senate-2');
  assert.equal(decidingDivision([house, senate])?.division.key, 'federal-representatives-1');
  assert.equal(decidingDivision([house])?.division.key, 'federal-representatives-1');

  const second = exported({ key: 'federal-senate-3', stage: 'Second reading', outcome: 'negative', ayes: 20, noes: 31, date: '2026-02-01', question: 'The majority voted against a motion to read the bill for a second time.' });
  const amendment = exported({ key: 'federal-senate-4', stage: 'In committee', date: '2026-02-02', question: 'The question is that the amendment be agreed to.' });
  const found = decidingDivision([second, amendment, d9971]);
  assert.equal(found?.division.key, 'federal-senate-3');
  assert.equal(found?.reading, 'second');
  assert.equal(found?.outcome, 'Not agreed');
  assert.equal(decidingDivision([amendment, d9971]), null);
  assert.equal(decidingDivision([]), null);
  // No recorded result, no reading.
  assert.equal(divisionReading({ ...d9972, outcome: undefined }), null);
});

test('a bill whose divisions are all procedural or amendments has no deciding division: null, never the latest', () => {
  // One bill, both houses, every division on the way to a reading but none on the reading itself. The latest
  // (the Senate closure) is the one a "latest division" rule would have shown.
  const bill = [
    exported({ key: 'federal-representatives-101', house: 'representatives', stage: 'Second reading', outcome: 'negative', ayes: 40, noes: 83, date: '2026-08-18',
      question: 'Mr Speaker The original question was that this bill be now read a second time. To this the honourable member has moved as an amendment that all words after "That" be omitted with a view to substituting other words. The question now is that the amendment be agreed to.' }),
    exported({ key: 'federal-representatives-102', house: 'representatives', stage: 'Second reading', outcome: 'negative', ayes: 41, noes: 82, date: '2026-08-18',
      question: 'Example Payments Bill 2026 - Second Reading - Decline to read a second time' }),
    exported({ key: 'federal-representatives-103', house: 'representatives', stage: 'Third reading', outcome: 'affirmative', ayes: 84, noes: 40, date: '2026-08-19',
      question: 'Mr Speaker The question is that so much of the standing orders be suspended as would prevent the bill being passed through its remaining stages without delay.' }),
    exported({ key: 'federal-senate-104', house: 'senate', stage: 'Limitation of debate', outcome: 'affirmative', ayes: 35, noes: 30, date: '2026-08-20',
      question: 'The President The question is that the motion for the allotment of time be agreed to.' }),
    exported({ key: 'federal-senate-105', house: 'senate', stage: 'Third reading', outcome: 'affirmative', ayes: 36, noes: 29, date: '2026-08-20',
      question: 'Minister I move: That the question be now put. The President The question is that the question be put.' }),
  ];
  assert.deepEqual(bill.map(d => divisionReading(d)), [null, null, null, null, null]);
  assert.equal(decidingDivision(bill, { originatingHouse: 'representatives' }), null);
  assert.equal(decidingDivision(bill), null);
  // The same divisions as division files give them: a name and a result, no stage.
  const files = bill.map(({ stage, outcome, ...d }) => ({ ...d, name: `Bills \u2014 Example Payments Bill 2026; ${stage}`, result: outcome }));
  assert.equal(decidingDivision(files), null);
});

test('outcome words come from the division\'s result', () => {
  assert.equal(divisionOutcomeWord({ outcome: 'affirmative' }, 'third'), 'Passed');
  assert.equal(divisionOutcomeWord({ result: 'affirmative' }, 'second'), 'Agreed');
  assert.equal(divisionOutcomeWord({ outcome: 'negative' }, 'third'), 'Not agreed');
  assert.equal(divisionOutcomeWord({ outcome: 'negative' }, 'second'), 'Not agreed');
});
