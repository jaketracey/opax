import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {mentionTerms, mentions, noRecordMentions, MEANING_FLOOR} from '../src/search-mention.ts';

const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');

test('the words a record must hold: quoted phrases whole, else stems of the longer words', () => {
  assert.deepEqual(mentionTerms('zzqxv plorthub'), ['zzqxv', 'plort']);
  assert.deepEqual(mentionTerms('"housing affordability" now'), ['housing affordability']);
  assert.deepEqual(mentionTerms('what did they say about the NDIS'), ['ndis']);
  assert.deepEqual(mentionTerms('of an'), []);
  assert.ok(mentions({snippet: 'Housing was less affordable.'}, mentionTerms('affordability')));
  assert.ok(mentions({speaker: 'Morgan Example'}, mentionTerms('morgan')));
  assert.ok(mentions({title: 'Café policy'}, mentionTerms('cafe')));
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
