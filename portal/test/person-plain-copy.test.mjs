import {fy} from '../public/money-scope.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';

// The person page's copy helpers, lifted out of app.js as they ship.
const source = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const app = ts.createSourceFile('app.js', source, ts.ScriptTarget.Latest, true);
const functions = ['topicsHeading', 'isRosterPassage', 'mentionTitle', 'goodMentions', 'personClosingHTML', 'partyLatestYear', 'returnsSpan'];
const declarations = app.statements.filter(n => ts.isFunctionDeclaration(n) && functions.includes(n.name?.text)).map(n => n.getText(app)).join('\n');
const esc = s => String(s ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
const api = runInNewContext(`${declarations};({${functions.join(',')}})`, {
  esc, fy,
  titleSubject: r => r.subject || '',
  growthModules: {askEntry: (q, from) => `/ask?${new URLSearchParams({q, from})}`},
  URLSearchParams,
});

test('the topics heading counts speeches and their years, never "labelled" or "so far"', () => {
  const all = {label: 'All years', from: 1993, to: 2026, labelled: 7546};
  assert.equal(api.topicsHeading(all, 'all', {first: 1998, last: 2026}), 'Topics in 7,546 speeches, 1998 to 2026');
  assert.equal(api.topicsHeading(all, 'all', {}), 'Topics in 7,546 speeches');
  assert.equal(api.topicsHeading({from: 2010, to: 2019, labelled: 900}, 'then', {first: 2013, last: 2026}), 'Topics in 900 speeches, 2013 to 2019');
  assert.equal(api.topicsHeading({from: 2020, to: 2026, labelled: 1}, 'now', {}), 'Topics in 1 speech, 2020 to 2026');
  for (const heading of [api.topicsHeading(all, 'all', {first: 1998, last: 2026})]) assert.doesNotMatch(heading, /labelled|so far/);
  assert.doesNotMatch(source.slice(source.indexOf('async function renderPersonTopics'), source.indexOf('async function renderPersonSpeeches')), /labelled speeches|whole labelled record/i);
});

test('mentions drop attendance and ministry lists, and rows with no debate to title them', () => {
  const roster = 'Anthony Albanese MPShadow Minister for TourismHon. Anthony Albanese MPShadow Minister for Infrastructure';
  assert.equal(api.isRosterPassage(roster), true);
  assert.equal(api.isRosterPassage('The Prime Minister said the bill would help renters, and the member for Grayndler agreed.'), false);
  const rows = [
    {slug: 'a', title: 'Bill Shorten — 2017-10-24', subject: '', snippet: 'A sentence about housing.'},
    {slug: 'b', debate: 'Questions without Notice: Housing', snippet: roster},
    {slug: 'c', debate: 'Questions without Notice: Housing', snippet: 'The Prime Minister answered.'},
    {slug: 'd', subject: 'Appropriation Bill (No. 1) 2024-2025', snippet: 'Funding for schools.'},
    {slug: 'e', subject: '2017-10-24', snippet: 'Prose.'},
    {slug: 'f', debate: 'Adjournment', snippet: 'Prose.'},
    {slug: 'g', debate: 'Matters of Public Importance', snippet: 'Prose.'},
  ];
  const good = api.goodMentions(rows);
  assert.deepEqual(good.map(r => r.slug), ['c', 'd', 'f'], 'three good rows at most, in the search order');
  for (const r of good) assert.doesNotMatch(api.mentionTitle(r), /\d{4}-\d{2}-\d{2}/);
  assert.deepEqual(api.goodMentions(rows.slice(0, 2)).length, 0, 'nothing worth showing hides the block');
});

test('the person page ends on a closing row: all speeches, and a question about the person', () => {
  const html = api.personClosingHTML('Alex Example', '/ask?view=search&speaker=Alex+Example');
  assert.match(html, /^<nav class="person-closing" aria-label="More about Alex Example"><a href="\/ask\?view=search&amp;speaker=Alex\+Example">All speeches<\/a><a href="\/ask\?q=What\+has\+Alex\+Example\+said\+in\+parliament%3F&amp;from=person" rel="nofollow">Ask about Alex Example<\/a><\/nav>$/);
  const end = source.slice(source.indexOf('await subjectMentions(name, mentions, "Mentions in parliament"'));
  assert.ok(end.indexOf('personClosingHTML(') < end.indexOf('\n}\n'), 'the closing row is drawn after mentions, last');
});

test('the voting block opens with its heading, above the figures', () => {
  const votes = source.slice(source.indexOf('async function renderPersonVotes'), source.indexOf('async function renderPersonTopics'));
  assert.ok(votes.indexOf('Voting record</h3>') < votes.indexOf('votes-tiles'));
  const css = readFileSync(new URL('../public/style.css', import.meta.url), 'utf8');
  assert.match(css, /\.subject-person #subject-votes \.dt caption \{ position: absolute;/);
});

test('the party receipts row carries the latest financial year, every receipt type summed', () => {
  const node = {by_type_year: {'2023-24': {donation_received: [1, 1]}, '2024-25': {donation_received: [13583106, 208], other_receipt: [11902894, 412]}}};
  assert.deepEqual(JSON.parse(JSON.stringify(api.partyLatestYear(node))), {label: '2024–25', total: 25486000});
  assert.equal(api.partyLatestYear({}), null);
  assert.equal(api.partyLatestYear({by_type_year: {'2024-25': {}}}), null);
});

test('party and donor headers say the years of their returns, not "Active"', () => {
  assert.equal(api.returnsSpan(1998, 2024), 'Returns 1998–99 to 2024–25');
  assert.equal(api.returnsSpan(2019, 2019), 'Returns in 2019–20');
  assert.equal(api.returnsSpan(null, null), '');
  assert.doesNotMatch(source, /entry-active">Active /);
});

test('the transcript notes sit with the speeches, not in the head', () => {
  const from = source.indexOf('const speechNotes =');
  const person = source.slice(from, source.indexOf('renderPersonFirstSpeech(name', from));
  assert.match(person, /renderPersonSpeeches\(speechSpeaker, speeches, chambers, sections, \{ scope: speechScope, notes: speechNotes \}\)/);
  assert.doesNotMatch(source, /head\.insertAdjacentHTML\('beforeend', heldBackHelpers/);
});
