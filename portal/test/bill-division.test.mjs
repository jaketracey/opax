import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { decidingDivision, divisionReading, divisionOutcomeWord } from '../public/bill-division.js';

const json = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));

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

test('9971/9972 as the repo exports them: the bill file and the two division files', () => {
  const bill = json('../public/bills/au-federal-r7378.json');
  const found = decidingDivision(bill.divisions, { originatingHouse: bill.originating_house });
  assert.equal(found?.division.key, 'federal-senate-9972');
  assert.equal(found?.outcome, 'Passed');
  const files = ['federal-senate-9971', 'federal-senate-9972'].map(key => json(`../public/divisions/division-${key}.json`));
  assert.equal(files[0].name, files[1].name);
  assert.deepEqual(files.map(d => divisionReading(d)), [null, 'third']);
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

test('outcome words come from the division\'s result', () => {
  assert.equal(divisionOutcomeWord({ outcome: 'affirmative' }, 'third'), 'Passed');
  assert.equal(divisionOutcomeWord({ result: 'affirmative' }, 'second'), 'Agreed');
  assert.equal(divisionOutcomeWord({ outcome: 'negative' }, 'third'), 'Not agreed');
  assert.equal(divisionOutcomeWord({ outcome: 'negative' }, 'second'), 'Not agreed');
});
