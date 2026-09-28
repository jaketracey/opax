import assert from 'node:assert/strict'
import { test } from 'node:test'
import { normaliseTypography, validateSummary, validateTopics } from '../src/validate.ts'

const check = (text: string, summary: unknown, title = 'A speaker') => validateSummary(summary, { title, text })

// The cases below mirror parli/tests/test_enrichment_validation.py, which pins the Python validator.

test('a short question does not need padding', () => {
  assert.deepEqual(
    check(
      'How is the department strengthening capability among staff following the capability review?',
      'Asked how the department was strengthening staff capability following the capability review.',
    ),
    [],
  )
})

test('an unsupported number is rejected with the Python wording', () => {
  const problems = check('Staff capability was reviewed.', 'Reported that 27 staff had been appointed to improve departmental capability following the review.')
  assert.deepEqual(problems, ['figure 27 is not present in the supplied text'])
})

test('a real rejection: figure 2003 is not present in the supplied text', () => {
  const text = 'The minister said the scheme had run since 1998 and would be reviewed by the department next year for all participants.'
  const problems = check(text, 'Announced that the scheme, which has run since 1998, would be reviewed and that funding rose in 2003 for participants.')
  assert.ok(problems.includes('figure 2003 is not present in the supplied text'), problems.join('|'))
})

test('a percentage is not confused with the plain number', () => {
  assert.ok(check('27 applications were received.', 'Reported that 27% of applications were received by the department for assessment.').length > 0)
})

test('trailing punctuation does not change a number', () => {
  assert.deepEqual(check('There were 27 applications.', 'Reported that 27, including the applications under review, were received by the department.'), [])
})

test('thousands separators are ignored on both sides', () => {
  assert.deepEqual(check('About 12,500 people signed the petition presented today.', 'Presented a petition signed by 12500 people asking the parliament to act on the matter.'), [])
})

test('a shortened year range is rejected', () => {
  assert.ok(check('The funding runs from 2026 to 2027.', 'Reported that funding would run during 2026-27 to support the program.').length > 0)
})

test('a speaker name supported by the source is allowed', () => {
  assert.deepEqual(
    check('The motion appoints Anthony Carbines to the Standing Orders Committee.', 'Moved that Anthony Carbines join the Standing Orders Committee under the proposed membership motion.', 'Anthony Carbines — Committees — 2026-09-01'),
    [],
  )
})

test('naming the record speaker when the text does not is rejected', () => {
  const problems = check('The bridge should be rebuilt without delay for regional communities.', 'David Hodgett argued that the bridge should be rebuilt without delay for regional communities.', 'David Hodgett — Bridges — 2026-09-24')
  assert.ok(problems.includes('do not name or infer the record speaker'))
})

test('an alphanumeric model number is supported', () => {
  assert.deepEqual(check('The government was asked about parts for F-35s.', 'Asked whether the government would continue supplying F-35 parts under the current arrangements.'), [])
})

test('length limits: too short, too few words, too long', () => {
  assert.ok(check('text here that is long enough to matter', 'Asked about roads.').length > 0)
  const long = 'Argued that the government should '.concat('reconsider the plan and '.repeat(40))
  assert.ok(check('text', long).some((p) => p.includes('use 40-600 characters')))
})

test('non-ASCII punctuation is rejected (dashes), curly quotes are normalised first', () => {
  const source = 'The minister said the Government would fund the program in the electorate.'
  assert.ok(check(source, 'Argued that the Government — not the states — should fund the program in the electorate.').includes('use plain ASCII punctuation'))
  assert.equal(normaliseTypography('the Government’s “plan”'), 'the Government\'s "plan"')
  assert.deepEqual(check(source, normaliseTypography('Argued that the Government’s program should be funded in the electorate by the minister.')), [])
})

test('typography normalisation: dashes, ellipses and hyphens become plain ASCII; validation still runs afterwards', () => {
  assert.equal(normaliseTypography('report No. 66 of Portfolio Committee No. 5 \u2013 Justice and Communities'), 'report No. 66 of Portfolio Committee No. 5 - Justice and Communities')
  assert.equal(normaliseTypography('Disputed Claim of Privilege\u2014Resources Regulator'), 'Disputed Claim of Privilege - Resources Regulator')
  assert.equal(normaliseTypography('from 1998\u20132000 and 1998 \u2014 2000'), 'from 1998-2000 and 1998-2000')
  assert.equal(normaliseTypography('wait\u2026 then'), 'wait... then')
  assert.equal(normaliseTypography('non\u2011binding'), 'non-binding')
  // a range that the record does not support still fails the figure check once normalised
  const source = 'The funding runs from 2026 to 2027 for all schools in the region, the minister said.'
  const problems = check(source, normaliseTypography('Reported that funding would run during 2026\u201327 to support the program for schools in the region.'))
  assert.ok(problems.includes('figure 27 is not present in the supplied text'))
})

test('banned openers are rejected', () => {
  const source = 'The minister spoke about the new hospital being built in the region this year.'
  for (const opener of ['In this speech the member argued', 'This speech argued', 'The speaker says the', 'This release announced', 'Summary: the new hospital']) {
    const s = `${opener} that a new hospital is being built in the region and it should be supported by all sides.`
    assert.ok(check(source, s).some((p) => p.startsWith('do not open with a framing phrase')), opener)
  }
})

test('placeholder text and more than three sentences are rejected', () => {
  const source = 'A long enough source text about many things that were said in the chamber today by members.'
  assert.ok(check(source, 'Argued that {context} should be considered by members of the chamber today, at length.').includes('placeholder text'))
  assert.ok(check(source, 'Argued one thing. Then another. And a third. And a fourth. Finally a fifth thing about members.').includes('more than three sentences'))
})

test('a brief that copies the speech opening is rejected', () => {
  const source = 'Asked the minister to explain why the rail line has been delayed for the fifth year running despite repeated promises to the region.'
  assert.ok(check(source, source).includes("copies the speech's opening"))
})

test('a non-string brief is rejected', () => {
  assert.deepEqual(check('text', undefined), ['brief is not a string'])
  assert.deepEqual(check('text', ['a']), ['brief is not a string'])
})

test('vulgar fractions in the source count as numbers', () => {
  assert.deepEqual(check('Rates rose by 2½ per cent over the period, the minister said today in the chamber.', 'Reported that rates rose by 2.5 per cent over the period, the minister said in the chamber.'), [])
})

// ---------------------------------------------------------------- topics

test('topics: lowercased, de-duplicated, invalid dropped, capped at four', () => {
  const v = validateTopics(['Housing', 'housing', 'health', 'not-a-topic', 'tax_budget', 'education', 'gambling', 'immigration'])
  assert.deepEqual(v.problems, [])
  assert.deepEqual(v.topics, ['housing', 'health', 'tax-budget', 'education'])
})

test('topics: an empty list is a legitimate verdict', () => {
  assert.deepEqual(validateTopics([]), { topics: [], problems: [] })
})

test('topics: a list with no valid slug is rejected; a missing field is rejected', () => {
  assert.equal(validateTopics(['roads', 'schools']).problems.length, 1)
  assert.equal(validateTopics(undefined).problems.length, 1)
  assert.equal(validateTopics({ a: 1 }).problems.length, 1)
})

test('topics: a comma-separated string is tolerated', () => {
  assert.deepEqual(validateTopics('health, housing').topics, ['health', 'housing'])
})
