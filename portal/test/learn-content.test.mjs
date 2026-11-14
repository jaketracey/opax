import test from 'node:test';
import assert from 'node:assert/strict';
import { runCheck, fkGrade, syllables, screenText, GRADE_TARGET, GLOSSARY_TERMS } from '../../scripts/learn/check.mjs';

test('the Learn guide passes its content check', () => {
  const { errors, report, counts } = runCheck();
  assert.deepEqual(errors, []);
  assert.ok(counts.glossary >= GLOSSARY_TERMS[0] && counts.glossary <= GLOSSARY_TERMS[1]);
  assert.deepEqual(report.map((r) => r.chapter), ['whos-who', 'bill-to-act', 'how-votes-work', 'watching-parliament', 'money-and-interests', 'elections', 'federal-and-state']);
  for (const r of report) {
    for (const s of r.overTarget) assert.ok(s.reason, `${r.file} screen ${s.screen} is over grade ${GRADE_TARGET} with no reason`);
  }
});

test('screen text drops markers and keeps glossary words', () => {
  assert.equal(screenText('## Head\n\nA {{bills|bill}} passes. [[f:x]]'), 'A bills passes.');
});

test('the grade rises with long words and long sentences', () => {
  assert.equal(syllables('cat'), 1);
  assert.equal(syllables('parliament'), 3);
  const easy = fkGrade('The cat sat. The dog ran. We had fun.').grade;
  const hard = fkGrade('Constitutional considerations necessitate parliamentary deliberation regarding appropriation legislation.').grade;
  assert.ok(easy < hard);
});
