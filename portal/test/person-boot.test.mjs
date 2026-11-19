// A member's page keeps the Worker's first paint of its top (P2 perf lane, member CLS and LCP):
// the head's source line, the ask block and "Next in the record" are drawn by the Worker in the
// app's own markup, and the app keeps those nodes instead of drawing them again.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {JSDOM} from 'jsdom';
import {personHeadPrerender, personBootBlocks} from '../src/seo-content.ts';
import {nextStepsHTML, fillNextSteps, memberNextSteps} from '../public/next-steps.js';
import {CHAMBERS, findPerson, memberSeats} from '../public/member-seats.js';
import * as electorates from '../public/electorates.js';

const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const style = readFileSync(new URL('../public/style.css', import.meta.url), 'utf8');

// Invented people and records.
const person = {name: 'Rowan Banks', full: 'Rowan James Banks', party: 'Labor', current: true, states: ['federal'], chambers: ['representatives'],
  representation: [{electorate: 'Maitland', jurisdiction: 'federal', chamber: 'representatives'}]};
const seatPerson = {name: 'Rowan Banks', aliases: ['Ro Banks'], electorates: [
  {name: 'Maitland', url: '/subject/electorate/federal-representatives-nsw-maitland', chamber: 'representatives', jurisdiction: 'federal', current: true, as_of: '2026-09-04'},
  {name: 'Paterson', url: '/subject/electorate/federal-representatives-nsw-paterson', chamber: 'representatives', jurisdiction: 'federal', current: false},
]};
const votes = [
  {title: 'Example Amendment Bill 2026; Second Reading', href: '/doc/division-federal-representatives-1', date: '2026-10-29', vote: 'No'},
  {title: 'Example Amendment Bill 2026; Third Reading', href: '/doc/division-federal-representatives-2', date: '2026-10-30', vote: 'Aye'},
  {title: 'Procedural motion', href: '/doc/division-federal-representatives-3', date: '2026-10-31', vote: 'No', procedural: true},
];
const EMPTY = 'No votes on bills in the record for this member.';
const items = memberNextSteps({seats: memberSeats(seatPerson), party: {name: 'Labor', href: '/subject/party/labor'}});

const filledInBrowser = (fill) => {
  const {document} = new JSDOM(nextStepsHTML(items, {pageType: 'person', id: 'person-next', reserve: 2})).window;
  fillNextSteps(document.getElementById('person-next'), fill, EMPTY);
  return document.body.innerHTML;
};
const drawnFilled = (fill) => new JSDOM(nextStepsHTML(items, {pageType: 'person', id: 'person-next', reserve: 2, fill, empty: EMPTY})).window.document.body.innerHTML;

test('"Next in the record" drawn with its facts is the block fillNextSteps leaves', async () => {
  const {memberVoteSteps} = await import('../public/next-steps.js');
  for (const fill of [memberVoteSteps(votes), memberVoteSteps(votes.slice(0, 1)), []]) assert.equal(drawnFilled(fill), filledInBrowser(fill));
  assert.match(drawnFilled([]), new RegExp(EMPTY));
  // Without facts the two places are held for the app, as before.
  assert.equal(nextStepsHTML(items, {reserve: 2}), nextStepsHTML(items, {reserve: 2, fill: null}));
  assert.equal((nextStepsHTML(items, {reserve: 2}).match(/data-next-pending/g) || []).length, 2);
  assert.doesNotMatch(drawnFilled([]), /aria-busy|data-next-pending/);
});

test('a member\'s seat rows: current seats first, the same for the app and the Worker', () => {
  assert.deepEqual(memberSeats(seatPerson), [{name: 'Maitland', href: '/subject/electorate/federal-representatives-nsw-maitland', chamber: 'House of Representatives'}]);
  assert.deepEqual(memberSeats({electorates: seatPerson.electorates.map((e) => ({...e, current: false}))}).map((s) => s.name), ['Maitland', 'Paterson']);
  assert.deepEqual(memberSeats(null), []);
  assert.equal(findPerson([seatPerson], 'ro banks'), seatPerson);
  assert.equal(findPerson([seatPerson, {...seatPerson}], 'Rowan Banks'), null, 'two people with one name: neither');
  assert.equal(electorates.CHAMBERS, CHAMBERS);
  assert.equal(electorates.findPerson, findPerson);
  assert.equal(electorates.memberSeats, memberSeats);
  assert.match(app, /electorateReference\?\.module\.memberSeats\(electorateReference\.person\)/);
});

test('the Worker draws the source line, the ask block with a held question and the filled next steps', async () => {
  const {memberVoteSteps} = await import('../public/next-steps.js');
  const boot = personBootBlocks(person, {party: 'Labor', voteRows: votes, seatPerson, rosterUpdated: '2026-01-01'});
  const doc = new JSDOM(`<div id="head">${boot.source}</div>${boot.blocks}`).window.document;
  assert.equal(doc.querySelector('.ui-source summary').textContent.trim(), 'As at 4 Sep 2026 · Parliamentary roster');
  assert.equal(personBootBlocks(person, {seatPerson: null, rosterUpdated: '2026-01-01'}).source.includes('As at 1 Jan 2026'), true);
  assert.equal(doc.querySelector('#growth-ask-title').textContent, 'Ask about Rowan James Banks');
  assert.equal(doc.querySelector('#growth-ask-input').value, 'What has Rowan James Banks said in parliament?');
  assert.equal(doc.querySelectorAll('.growth-questions > .growth-question-held').length, 1);
  assert.deepEqual([...doc.querySelectorAll('#person-next .next-steps-kind')].map((k) => k.textContent), ['Electorate', 'Party', 'Latest vote', 'Latest vote']);
  assert.equal(doc.querySelector('#person-next a[href="/subject/party/labor"]').textContent, 'Labor');
  assert.equal(drawnFilled(memberVoteSteps(votes)), new JSDOM(boot.blocks).window.document.querySelector('#person-next').outerHTML);
  // A scoped speaker's votes are not read by the Worker: the app fills the held places.
  const scoped = new JSDOM(personBootBlocks(person, {party: 'Labor', seatPerson}).blocks).window.document;
  assert.equal(scoped.querySelectorAll('#person-next [data-next-pending]').length, 2);
});

test('the prerender: head, summary, then the kept blocks; a sitting member\'s current seat names the role', () => {
  const answer = '<section id="prerender" class="wrap"><h1>Rowan Banks</h1><p>Rowan Banks. Labor. Maitland.</p><h2>Party and representation</h2></section>';
  const boot = personBootBlocks(person, {party: 'Labor', voteRows: votes, seatPerson});
  const doc = new JSDOM(personHeadPrerender(answer, person, {party: 'Labor', seatsNow: seatPerson.electorates.filter((e) => e.current), ...boot})).window.document;
  const pre = doc.getElementById('prerender');
  assert.deepEqual([...pre.children].map((el) => el.tagName.toLowerCase() + (el.className ? '.' + el.className.split(' ')[0] : '')),
    ['div.subject-head', 'p', 'section.growth-ask', 'nav.next-steps', 'h2']);
  assert.equal(pre.querySelector('.subject-head + p').textContent, 'Rowan Banks. Labor. Maitland.');
  assert.ok(pre.querySelector('.subject-head > .subject-tag + .ui-source'));
  assert.match(pre.querySelector('.subject-tag').textContent, /Member for Maitland/);
  // Record text with a replacement pattern ($&, $') is drawn as written.
  const dollar = personHeadPrerender(answer, person, {blocks: '<p class="x">$& and $\'</p>'});
  assert.match(dollar, /<p class="x">\$& and \$'<\/p>/);
});

test('the app keeps the Worker\'s nodes in both skeletons, once, for the person the reader landed on', () => {
  const boot = personBootBlocks(person, {party: 'Labor', voteRows: votes, seatPerson});
  const answer = '<section id="prerender" class="wrap"><h1>Rowan Banks</h1><p>Summary.</p></section>';
  const skeleton = '<div class="subject-head"><span class="subject-portrait"></span><h1 id="subject-title"><span class="title-skel"></span></h1><p class="subject-tag"><span class="tag-skel"></span></p></div><div class="subject-grid"><div id="subject-main"></div></div>';
  const dom = new JSDOM(`<main>${personHeadPrerender(answer, person, {party: 'Labor', seatsNow: seatPerson.electorates, ...boot})}</main><div id="subject-body"></div>`,
    {url: 'https://opax.com.au/subject/person/rowan-banks'});
  const {document} = dom.window;
  let wired = 0;
  const timers = [];
  const code = app.slice(app.indexOf('let bootPerson;'), app.indexOf('async function openSubject('));
  const {seatBootPerson, settleGrid} = runInNewContext(`${code};({seatBootPerson, settleGrid})`, {
    document, location: dom.window.location, $: (id) => document.getElementById(id), wireGrowthAsk: () => { wired += 1; },
    setTimeout: (fn, ms) => timers.push([fn, ms]), decodeURIComponent,
  });
  const body = document.getElementById('subject-body');
  const kept = [document.querySelector('#prerender > .subject-head > .ui-source'), document.querySelector('#prerender > .growth-ask'), document.getElementById('person-next')];
  const tag = document.querySelector('#prerender .subject-tag').innerHTML;
  // First skeleton: the title is still a bar there.
  body.innerHTML = skeleton;
  settleGrid(body);
  seatBootPerson(body, 'rowan-banks', {title: true});
  assert.ok(body.querySelector('.subject-grid').classList.contains('is-settling'));
  assert.equal(timers[0][1], 4000, 'shown after four seconds at the latest');
  assert.equal(document.getElementById('subject-title').textContent, 'Rowan Banks');
  assert.equal(body.querySelector('.subject-tag').innerHTML, tag);
  assert.deepEqual([...body.children].map((el) => el.className.split(' ')[0]), ['subject-head', 'growth-ask', 'next-steps', 'subject-grid']);
  assert.equal(body.querySelector('.subject-tag + .ui-source'), kept[0]);
  assert.equal(body.querySelector('.growth-ask'), kept[1]);
  assert.equal(body.querySelector('#person-next'), kept[2]);
  assert.equal(document.querySelectorAll('#person-next, #growth-ask-input').length, 2, 'moved, never copied: one of each id');
  assert.equal(wired, 1);
  // Second skeleton (the name settled): the same nodes again.
  body.innerHTML = skeleton;
  seatBootPerson(body, 'rowan-banks');
  assert.equal(body.querySelector('.growth-ask'), kept[1]);
  assert.equal(body.querySelector('#person-next'), kept[2]);
  // Another person's page drops them for good.
  body.innerHTML = skeleton;
  seatBootPerson(body, 'someone-else');
  assert.equal(body.querySelector('.growth-ask'), null);
  body.innerHTML = skeleton;
  seatBootPerson(body, 'rowan-banks');
  assert.equal(body.querySelector('.growth-ask'), null);
});

const bootPage = (path) => {
  const boot = personBootBlocks(person, {party: 'Labor', voteRows: votes, seatPerson});
  const answer = '<section id="prerender" class="wrap"><h1>Rowan Banks</h1><p>Summary.</p></section>';
  const dom = new JSDOM(`<main>${personHeadPrerender(answer, person, {party: 'Labor', seatsNow: seatPerson.electorates, ...boot})}</main><div id="subject-body"></div>`, {url: `https://opax.com.au${path}`});
  const {document} = dom.window;
  const code = app.slice(app.indexOf('let bootPerson;'), app.indexOf('async function openSubject('));
  const {seatBootPerson, typingIn} = runInNewContext(`${code};({seatBootPerson, typingIn})`, {
    document, location: dom.window.location, $: (id) => document.getElementById(id), wireGrowthAsk: () => {}, setTimeout: () => {}, decodeURIComponent,
  });
  const body = document.getElementById('subject-body');
  body.innerHTML = '<div class="subject-head"><h1 id="subject-title"></h1><p class="subject-tag"></p></div><div class="subject-grid"></div>';
  return {document, body, seatBootPerson, typingIn};
};

test('a member page the app does not keep leaves no second person-next or ask field behind', () => {
  const {document, body, seatBootPerson} = bootPage('/subject/person/rowan-banks');
  seatBootPerson(body, 'someone-else');
  assert.equal(document.querySelector('#prerender > .growth-ask, #prerender > .next-steps'), null);
  assert.equal(document.querySelectorAll('#person-next, #growth-ask-input').length, 0);
});

test('a reader typing in the Worker\'s field keeps the focus and the caret when the app takes it over', () => {
  const {document, body, seatBootPerson, typingIn} = bootPage('/subject/person/rowan-banks');
  const field = document.getElementById('growth-ask-input');
  field.value = 'What has Rowan';
  field.focus();
  field.setSelectionRange(4, 8);
  seatBootPerson(body, 'rowan-banks');
  assert.equal(body.querySelector('#growth-ask-input'), field);
  assert.equal(document.activeElement, field);
  assert.deepEqual([field.selectionStart, field.selectionEnd], [4, 8]);
  // The second skeleton reads it before it clears the page (openSubject), then puts it back.
  field.setSelectionRange(2, 2);
  const typing = typingIn();
  body.innerHTML = '<div class="subject-head"><h1 id="subject-title"></h1><p class="subject-tag"></p></div><div class="subject-grid"></div>';
  assert.notEqual(document.activeElement, field);
  seatBootPerson(body, 'rowan-banks', {typing});
  assert.equal(document.activeElement, field);
  assert.deepEqual([field.selectionStart, field.selectionEnd], [2, 2]);
  assert.match(app, /const typing = kind === "person" \? typingIn\(\) : null;[^\n]*\n(?:.*\n){1,40}?\s*body\.innerHTML = subjectSkeleton\(SUBJECT_LABELS/);
  assert.match(app, /seatBootPerson\(body, subjectSegment, \{ typing \}\);/);
});

test('the person page fills the kept blocks in place, and its record stays out of the layout until they are final', () => {
  assert.match(style, /\.subject-grid\.is-settling \{ display: none; \}/);
  assert.doesNotMatch(style, /\.subject-grid\.is-settling \{ visibility: hidden; \}/, 'Chrome counts a hidden box that moves');
  assert.match(style, /#subject-body:has\(> \.subject-grid\.is-settling\) \{ min-height: 100vh; \}/);
  assert.match(style, /\.spa-booting\.spa-boot-compact:not\(\.spa-boot-search\):not\(\.spa-routed\) #prerender\.subject-person > :is\(\.growth-ask, \.next-steps\) \{ display: block; \}/);
  assert.match(style, /\.growth-question-held \{ visibility: hidden; \}/);
  assert.match(app, /head\.querySelector\(":scope > \.ui-source"\)\?\.remove\(\);\n {2}head\.insertAdjacentHTML\("beforeend", sourceLineHTML\(/);
  assert.match(app, /if \(!body\.querySelector\(":scope > \.growth-ask"\)\) head\.insertAdjacentHTML\("afterend", growthModules\.askBlockHTML\(\{name: promptName, pageType: "person", seed: `What has \$\{promptName\} said in parliament\?`, held: 1\}\)\);/);
  assert.match(app, /if \(!\$\("person-next"\)\) body\.querySelector\("\.growth-ask"\)\?\.insertAdjacentHTML\("afterend"/);
  assert.match(app, /if \(!form \|\| form\.dataset\.wired\) return;/);
  // Wired before growth-modules.js loads: until then the form submits as the Worker drew it (GET /ask).
  assert.match(app, /form\?\.addEventListener\("submit", event => \{\n(?:\s*\/\/[^\n]*\n)*\s*if \(!growthModules\) return;\n\s*event\.preventDefault\(\);/);
  // Both person skeletons settle the grid and seat the kept nodes.
  assert.equal((app.match(/settleGrid\(body\);\n\s+seatBootPerson\(body, /g) || []).length, 2);
});
