import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {mentionTerms, mentions, noRecordMentions, normaliseText, stem, MEANING_FLOOR} from '../src/search-mention.ts';

const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');

test('query and passage are read the same way: stems, joined and dotted forms, quotes and hyphens', () => {
  assert.deepEqual(mentionTerms('zzqxv plorthub').map(t => t.words[0]), ['zzqxv', 'plorthub']);
  assert.deepEqual(mentionTerms('what did they say about the NDIS').map(t => t.compact), ['ndis']);
  assert.deepEqual(mentionTerms('of an'), []);
  assert.equal(mentionTerms('"housing affordability" now')[0].phrase, true);
  for (const [a, b] of [['studies', 'study'], ['crises', 'crisis'], ['taxes', 'tax'], ['jobs', 'job'], ['women', 'woman'], ['mice', 'mouse'], ['houses', 'house'], ['policies', 'policy']])
    assert.equal(stem(a), stem(b), `${a}/${b}`);
  assert.equal(normaliseText('Labour’s ﬁnance, Robo-debt\nN.D.I.S.'), 'labors finance robo debt n d i s');
});

// The review's probes (13 Nov). "Must not fire": the passage does mention the query.
const said = (query, passage) => mentions({ title: 'Debate', snippet: passage }, mentionTerms(query));
const MENTIONED = [
  ['studies', 'One study found it.'], ['study', 'Several studies found it.'],
  ['crises', 'The housing crisis.'], ['crisis', 'A run of crises.'],
  ['women', 'Every woman in the workforce.'], ['woman', 'Women in the workforce.'],
  ['mice', 'A mouse plague.'], ['mouse', 'Mice ate the crop.'],
  ['jobs', 'A job for every graduate.'], ['job', 'Jobs growth.'],
  ['taxes', 'A tax on profits.'], ['tax', 'Taxes on profits.'],
  ['robodebt', 'The Robo-debt scheme.'], ['robo-debt', 'The robodebt scheme.'],
  ['NDIS', 'Funding for the N.D.I.S. this year.'], ['N.D.I.S.', 'The NDIS review.'],
  ['Labor', 'The labour market.'], ['labour', 'The Labor government.'],
  ['"climate change"', 'Action on climate-change now.'], ['"climate change"', 'Action on climate\nchange now.'],
  ['“climate change”', 'Climate change, again.'],
  ['"the minister’s statement"', "The minister's statement was tabled."],
  ['"the minister\'s statement"', 'The minister’s statement was tabled.'],
  ['café', 'The Cafe on the corner.'], ['Māori', 'Maori land.'], ['ﬁnance', 'Finance committee.'],
  ['COVID-19', 'The covid 19 response.'], ['affordable', 'Housing affordability fell.'],
];
// "Fires": no record mentions the query.
const NOT_MENTIONED = [
  ['zzqxv plorthub', 'GovHubs in regional Victoria bring services together.'],
  ['robodebt', 'Debt recovery and robotics in industry.'],
  ['women', 'Men in the workforce.'],
  ['"climate change"', 'A change in the climate of debate.'],
  ['taxes', 'The budget for roads.'],
];

test('the review\'s probes: a passage that mentions the query is read as mentioning it', () => {
  for (const [query, passage] of MENTIONED) assert.equal(said(query, passage), true, `${query} / ${passage}`);
});

test('the review\'s probes: a passage that does not mention the query is read as not mentioning it', () => {
  for (const [query, passage] of NOT_MENTIONED) assert.equal(said(query, passage), false, `${query} / ${passage}`);
  // Short words alone (NT, AI) never make the claim.
  assert.deepEqual(mentionTerms('NT AI'), []);
});

test('the checks stay linear on long, punctuation-heavy text', () => {
  const passage = '-'.repeat(200000) + ' x'.repeat(50000);
  const started = Date.now();
  said('"a b c d e f"', passage); said('zzqxv', passage);
  assert.ok(Date.now() - started < 1500);
});

test('a meaning-only result set is flagged only when nothing mentions the query and nothing scores high', () => {
  const docs = [{title: 'GovHubs in regional Victoria', snippet: 'Services together.', score: 0.4}];
  assert.equal(noRecordMentions({query: 'zzqxv plorthub', mode: null, catalogTotal: 0, documents: docs}), true);
  assert.equal(noRecordMentions({query: 'zzqxv plorthub', mode: 'hybrid', catalogTotal: 0, documents: docs}), true);
  assert.equal(noRecordMentions({query: 'govhubs', mode: null, catalogTotal: 0, documents: docs}), false, 'a word in a title');
  assert.equal(noRecordMentions({query: 'zzqxv plorthub', mode: 'keyword', catalogTotal: 0, documents: docs}), false, 'keyword mode keeps its own recovery');
  assert.equal(noRecordMentions({query: 'zzqxv plorthub', mode: null, catalogTotal: 1, documents: docs}), false, 'a register record matched by name');
  assert.equal(noRecordMentions({query: 'zzqxv plorthub', mode: null, catalogTotal: 0, documents: [{...docs[0], score: MEANING_FLOOR}]}), false, 'a strong meaning match');
  assert.equal(noRecordMentions({query: '*', mode: null, catalogTotal: 0, documents: docs}), false);
  assert.equal(noRecordMentions({query: 'zzqxv', mode: null, catalogTotal: 0, documents: []}), false, 'no results is the existing empty state');
});

test('the count line says what the records are, and never "strongest matches"', () => {
  const fn = runInNewContext(`${app.slice(app.indexOf('function resultsCountLine('), app.indexOf('// How many numbered slots'))}; resultsCountLine`, {});
  assert.equal(fn({total: 200, truncated: true, pageCount: 10, page: 1, perPage: 20}), '1–20 of 200 closest records');
  assert.equal(fn({total: 37, truncated: false, pageCount: 1, page: 1, perPage: 20}), '37 records');
  assert.equal(fn({total: 1, truncated: false, pageCount: 1, page: 1, perPage: 20}), '1 record');
  assert.ok(!app.includes('strongest matches</'), 'no strongest matches in the UI');
  assert.ok(!app.includes('The record holds more. </span>'));
});

test('no mention: recovery first, then the closest records behind a closed heading; keyword copy unchanged', () => {
  const recovery = app.slice(app.indexOf('function renderSearchRecovery('), app.indexOf('$("search-form").addEventListener("submit"'));
  assert.match(recovery, /meaning \? `No records mention “\$\{esc\(q \|\| f\.speaker\)\}”`/);
  assert.match(recovery, /: `No matches for “\$\{esc\(q \|\| f\.speaker\)\}”`/, 'the keyword-mode title stays');
  assert.match(recovery, /id="search-meaning-toggle" aria-expanded="\$\{open\}" aria-controls="search-results">Closest by meaning/);
  const run = app.slice(app.indexOf('async function runSearch('), app.indexOf('function searchRecoverySuggestions('));
  assert.match(run, /const noMention = Boolean\(data\.no_mention\) && q !== "\*";/);
  assert.match(run, /classList\.toggle\("is-meaning-closed", noMention && searchMeaningOpen !== key\)/);
  const css = readFileSync(new URL('../public/style.css', import.meta.url), 'utf8');
  assert.match(css, /#panel-search\.is-meaning-closed :is\(#results-bar, #search-answer, #search-results, #search-pager\) \{ display: none !important; \}/);
});
