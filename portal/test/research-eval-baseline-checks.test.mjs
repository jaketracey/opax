// Offline tests for the grader check types the Ask baseline set uses (number, amount, date, matches,
// vote, and decline.or_match). Pure: canned answers only, no network and no corpus data.
import test from 'node:test'
import assert from 'node:assert/strict'
import { runCheck, gradeRow, answerNumbers, moneyFigures, amountStated, dateForms, voteStated } from '../../scripts/research_eval_grade.mjs'

const ctx = (answer) => ({ answer, payload: { answer }, ev: { cited: [], entries: [] }, roster: [], names: { bound: [] }, figures: { figures: [] } })
const status = (check, answer) => runCheck(check, ctx(answer)).status

test('number: digits, grouped digits and number words count; years in dates still count', () => {
  assert.deepEqual(answerNumbers('There were three divisions and 1,204 votes.').sort((a, b) => a - b), [3, 1204])
  assert.equal(status({ type: 'number', all: [13] }, 'The Senate held 13 divisions that day.'), 'pass')
  assert.equal(status({ type: 'number', all: [5] }, 'It held five divisions.'), 'pass')
  assert.equal(status({ type: 'number', all: [2016] }, 'He was first elected on 2 July 2016.'), 'pass')
  assert.equal(status({ type: 'number', all: [342, 276] }, '342 in 2012 against 267 in 2015.'), 'fail')
  assert.equal(status({ type: 'number', any: [4, 5] }, 'Five members crossed.'), 'pass')
  assert.equal(status({ type: 'number', all: [12] }, 'On 12 March there were 9.'), 'fail', 'a day of the month is not a count')
})

test('amount: exact figures within tolerance, rounded figures within 5%, with or without a dollar sign', () => {
  assert.deepEqual(moneyFigures('$1.2m and 3 billion and $45,000').map((f) => f.v), [1.2e6, 3e9, 45000])
  assert.equal(amountStated('Labor received $38,631,230.', 38631230), true)
  assert.equal(amountStated('Labor received about $38.6 million.', 38631230), true)
  assert.equal(amountStated('Labor received 38.6 million dollars.', 38631230), true)
  assert.equal(amountStated('Labor received $35 million.', 38631230), false)
  assert.equal(amountStated('The salary was $288,990.', 288990, 0.002), true)
  assert.equal(amountStated('The salary was $290,000.', 288990, 0.002), false, 'a rounded-up exact figure is not the rate')
  assert.equal(status({ type: 'amount', value: 136000, tol: 0.05 }, 'It received $136,000 in 2017-18.'), 'pass')
  assert.equal(status({ type: 'amount', any: [100, 136000] }, 'It received $136,000.'), 'pass')
  assert.equal(status({ type: 'amount', value: 136000 }, 'It received 4 donations.'), 'fail')
})

test('date: Australian, US, abbreviated, ordinal and numeric forms; month and year precision', () => {
  assert.ok(dateForms('2013-03-14').includes('14 March 2013'))
  for (const a of ['on 14 March 2013', 'on March 14, 2013', 'on 14 Mar 2013', 'on 2013-03-14', 'on 14/03/2013', 'on the 14th of March 2013']) assert.equal(status({ type: 'date', iso: '2013-03-14' }, a), 'pass', a)
  assert.equal(status({ type: 'date', iso: '2013-03-14' }, 'in March 2013'), 'fail')
  assert.equal(status({ type: 'date', iso: '2013-03-14', precision: 'month' }, 'in March 2013'), 'pass')
  assert.equal(status({ type: 'date', iso: '2013-03-14' }, 'on 4 March 2013'), 'fail')
  assert.equal(status({ type: 'date', any: ['2013-03-15', '2013-03-14'] }, 'on 14 March 2013'), 'pass')
})

test('matches: a positive regex over the answer', () => {
  assert.equal(status({ type: 'matches', match: '\\blapsed\\b', flags: 'i' }, 'The bill Lapsed at prorogation.'), 'pass')
  assert.equal(status({ type: 'matches', match: '\\blapsed\\b' }, 'The bill passed.'), 'fail')
})

test('vote: the named member or party must carry the recorded direction, and not the opposite', () => {
  assert.equal(voteStated('Penny Wong voted no.', 'Penny Wong', 'no'), true)
  assert.equal(voteStated('Senator Wong voted against the motion.', 'Penny Wong', 'no'), true)
  assert.equal(voteStated('Penny Wong voted aye.', 'Penny Wong', 'no'), false)
  assert.equal(voteStated('Wong did not vote for the bill; she voted against it.', 'Penny Wong', 'no'), true, 'negated aye is not an aye')
  assert.equal(voteStated('The Greens supported the amendment, which passed 33 to 30.', 'Greens', 'aye'), true)
  assert.equal(voteStated('Labor opposed it while the Greens backed it.', 'Greens', 'aye'), true)
  assert.equal(voteStated('Labor opposed it while the Greens backed it.', 'Labor', 'aye'), false)
  assert.equal(voteStated('The motion was negatived.', 'Penny Wong', 'aye'), false)
  assert.equal(status({ type: 'vote', person: 'Cathy McGowan', direction: 'no' }, 'The premise is wrong: Cathy McGowan voted no on that question.'), 'pass')
})

test('decline.or_match: a plain no-record reply counts as the expected decline', () => {
  const q = { id: 'NG', question: 'How did Senator Ingrid Tolliver vote on the budget?', expected: { kind: 'decline' }, must: [{ type: 'decline', or_match: '\\bno (?:record|senator)\\b' }, { type: 'must_not', match: 'Tolliver[^.]{0,40}voted' }] }
  const declined = gradeRow(q, { answered: true, answer: 'There is no senator named Ingrid Tolliver in the parliamentary record.', sources: [] })
  assert.equal(declined.refusal, true)
  assert.equal(declined.axes.decline, 'pass')
  const invented = gradeRow(q, { answered: true, answer: 'Ingrid Tolliver voted aye on the budget.', sources: [] })
  assert.equal(invented.refusal, false)
  assert.equal(invented.axes.decline, 'fail')
  const plain = { ...q, must: [{ type: 'decline' }] }
  assert.equal(gradeRow(plain, { answered: true, answer: 'There is no senator named Ingrid Tolliver in the parliamentary record.', sources: [] }).axes.decline, 'fail', 'without or_match the old REFUSAL wording still rules')
})
