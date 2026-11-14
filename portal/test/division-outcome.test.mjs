import test from 'node:test';
import assert from 'node:assert/strict';
import {divisionOutcome, notAgreedWording, AGREED, NOT_AGREED} from '../public/division-outcome.js';
import * as labels from '../public/labels.js';

test('a recorded result reads "Agreed" or "Not agreed", never the record\'s own token', () => {
  assert.equal(divisionOutcome('affirmative'), 'Agreed');
  assert.equal(divisionOutcome('negative'), 'Not agreed');
  assert.equal(divisionOutcome('Affirmative'), AGREED);
  assert.equal(divisionOutcome('negatived'), NOT_AGREED);
  assert.equal(divisionOutcome('Agreed to'), AGREED);
  assert.equal(divisionOutcome('not_agreed_to'), NOT_AGREED);
  // A named result wins over the counts.
  assert.equal(divisionOutcome('negative', {ayes: 40, noes: 10}), NOT_AGREED);
});

test('an unknown result reads from the counts; with no counts it is not recorded', () => {
  assert.equal(divisionOutcome(undefined, {ayes: 30, noes: 10}), AGREED);
  assert.equal(divisionOutcome('', {ayes: 10, noes: 30}), NOT_AGREED);
  assert.equal(divisionOutcome(null, {ayes: 10, noes: 10}), NOT_AGREED);
  assert.equal(divisionOutcome('not recorded', {ayes: 30, noes: 10}), AGREED);
  assert.equal(divisionOutcome(''), '');
  assert.equal(divisionOutcome('something else', {ayes: 3}), '');
});

test('the register\'s "negatived" in a stage line reads as not agreed', () => {
  assert.equal(notAgreedWording('Second reading negatived'), 'Second reading not agreed');
  assert.equal(notAgreedWording('Negatived at third reading'), 'Not agreed at third reading');
});

test('labels.js carries the one wording to the SPA and the Worker', () => {
  assert.equal(labels.divisionOutcome, divisionOutcome);
  assert.equal(labels.AGREED, AGREED);
});
