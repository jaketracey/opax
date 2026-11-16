// "Next in the record" (public/next-steps.js): two separate divisions can be drawn with the same
// words, one stage on one day (WEB-next-in-record-twin-votes). Each such row then says what was put
// to the vote, in the record's own words, and keeps its own address. Rows that already read
// differently are drawn as before.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { billNextSteps, memberVoteSteps, votesToTellApart, divisionMotion, nextStepsHTML, MEMBER_VOTES_DRAWN } from '../public/next-steps.js';
import { divisionRows } from '../public/vote-tables.js';
import { renderPersonAnswer, personBootBlocks } from '../src/seo-content.ts';

const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');

test('a motion is read from the chair\'s question, else the motion moved; nothing else in a question names one', () => {
  // The chair's question is what was divided on; the last one stated wins over an earlier motion.
  assert.equal(divisionMotion('Minister A I present the reasons for the House disagreeing to the Senate amendments and I move: That the reasons be adopted. Speaker B The question is that the reasons for disagreeing to the Senate amendments be adopted.'),
    'that the reasons for disagreeing to the Senate amendments be adopted');
  assert.equal(divisionMotion('Minister A I move: That the amendments be disagreed to. This bill is the result of more than 10 years of work.'), 'that the amendments be disagreed to');
  assert.equal(divisionMotion('The question is the amendment moved by the honourable member for Example be agreed to.'), 'that the amendment moved by the honourable member for Example be agreed to');
  assert.equal(divisionMotion('Presiding Officer C The question now is that the remaining stages of the bill be agreed to, and the bill be now passed.'), 'that the remaining stages of the bill be agreed to, and the bill be now passed');
  // "No. 3" is not the end of the sentence.
  assert.equal(divisionMotion('The question is that the Example Amendment (Reform No. 3) Bill 2026 be agreed to.'), 'that the Example Amendment (Reform No. 3) Bill 2026 be agreed to');
  // A speech that opens "That is …", a title, a summary and a question about something else name no motion.
  for (const question of ['That is the difference between the two parties.', 'Example Bill 2026', 'Council divided on new clause',
    'The majority voted against an [amendment](https://example.org/a) introduced by a member.', 'The question is whether we should care.',
    'Senator D I move the second reading amendment on sheet 1: At the end of the motion, add "but the Senate notes".', '', null, undefined, 42])
    assert.equal(divisionMotion(question), '', String(question));
  // A long motion is cut at a word, at most 100 characters.
  const long = divisionMotion(`Senator E I move: That there be laid on the table by the Minister ${'representing the Minister '.repeat(8)}by no later than Tuesday.`);
  assert.ok(long.length <= 100 && long.endsWith('…') && !/\s…$/.test(long), long);
});

// The two House divisions of 1 Jul 2026 on au-federal-r7406, as the bill's file records them.
const r7406 = JSON.parse(readFileSync(new URL('../public/bills/au-federal-r7406.json', import.meta.url), 'utf8'));
const billRows = (bill) => billNextSteps(bill, { divisions: divisionRows(bill.divisions || [], true).filter((d) => !d.procedural) })
  .filter((row) => row.kind === 'How members voted');

test('two divisions of one bill at one stage on one day each say what was put, at their own addresses', () => {
  const rows = billRows(r7406);
  assert.deepEqual(rows.map((row) => row.href), ['/doc/division-federal-representatives-10545', '/doc/division-federal-representatives-10546']);
  assert.deepEqual(rows.map((row) => row.text), [
    'Consideration of senate message, 1 Jul 2026: that the amendments be disagreed to',
    'Consideration of senate message, 1 Jul 2026: that the reasons for disagreeing to the Senate amendments be adopted',
  ]);
  assert.equal(new Set(rows.map((row) => row.text)).size, 2, 'no two rows read the same');
  assert.deepEqual(rows.map((row) => row.meta), ['House of Representatives · Ayes 90, noes 43 · Agreed', 'House of Representatives · Ayes 90, noes 43 · Agreed']);
  // The block draws them whole, as a known row is drawn.
  const nav = new JSDOM(nextStepsHTML(billNextSteps(r7406, { divisions: divisionRows(r7406.divisions, true) }), { pageType: 'bill', id: 'bill-next' })).window.document;
  assert.deepEqual([...nav.querySelectorAll('a.next-steps-link')].slice(0, 2).map((a) => a.textContent), rows.map((row) => row.text));
});

test('a bill\'s divisions that already read differently are drawn as before; one with no stated motion gives its number', () => {
  const division = (n, stage, question, date = '2026-07-01') => ({ key: `federal-representatives-${n}`, house: 'representatives', stage, date, ayes: 90, noes: 43, outcome: 'affirmative',
    url: `https://theyvoteforyou.org.au/divisions/representatives/${date}/${n}`, question });
  const differ = { divisions: [division(13, 'Second reading', 'I move: That the bill be now read a second time.'), division(14, 'Third reading', 'I move: That the bill be now read a third time.')] };
  assert.deepEqual(billRows(differ).map((row) => row.text), ['Second reading, 1 Jul 2026', 'Third reading, 1 Jul 2026']);
  // Same stage on different days: the dates tell them apart.
  assert.deepEqual(billRows({ divisions: [division(3, 'In committee', 'A', '2026-07-02'), division(4, 'In committee', 'B', '2026-07-01')] }).map((row) => row.text), ['In committee, 2 Jul 2026', 'In committee, 1 Jul 2026']);
  // No motion in either question: the division's number on its day.
  assert.deepEqual(billRows({ divisions: [division(13, 'In committee', 'The majority voted for it.'), division(14, 'In committee', '')] }).map((row) => row.text),
    ['In committee, 1 Jul 2026 (division 13)', 'In committee, 1 Jul 2026 (division 14)']);
  // The same motion twice: its words and the number.
  assert.deepEqual(billRows({ divisions: [division(13, 'In committee', 'The question is that the amendment be agreed to.'), division(14, 'In committee', 'The question is that the amendment be agreed to.')] }).map((row) => row.text),
    ['In committee, 1 Jul 2026: that the amendment be agreed to (division 13)', 'In committee, 1 Jul 2026: that the amendment be agreed to (division 14)']);
});

// Invented records in the recorded-vote export's shape.
const vote = (n, stage, date = '2026-10-29', extra = {}) => ({ title: `Example Bill 2026; ${stage}`, date, vote: 'No', href: `/doc/division-federal-representatives-oa-${date}-${n}`, ...extra });

test('a member\'s two newest votes that read alike say what was put; their questions are asked for only then', () => {
  const twins = [vote(23, 'Consideration in Detail'), vote(22, 'Consideration in Detail'), vote(20, 'Second Reading')];
  assert.equal(MEMBER_VOTES_DRAWN, 2);
  assert.deepEqual(votesToTellApart(twins), ['/doc/division-federal-representatives-oa-2026-10-29-23', '/doc/division-federal-representatives-oa-2026-10-29-22']);
  const questions = {
    '/doc/division-federal-representatives-oa-2026-10-29-23': 'The question is the amendment moved by the honourable member for Example be agreed to.',
    '/doc/division-federal-representatives-oa-2026-10-29-22': 'The question is that the amendment moved by the honourable member for Sample be agreed to.',
  };
  // A drawn vote is held to two lines of link, which a long title fills: what was put is the link, and the
  // bill and stage follow the vote and date.
  const steps = memberVoteSteps(twins, { questions });
  assert.deepEqual(steps.map((s) => [s.text, s.meta]), [
    ['That the amendment moved by the honourable member for Example be agreed to', 'No · 29 Oct 2026 · Example Bill 2026; Consideration in Detail'],
    ['That the amendment moved by the honourable member for Sample be agreed to', 'No · 29 Oct 2026 · Example Bill 2026; Consideration in Detail'],
    ['Example Bill 2026; Second Reading', 'No · 29 Oct 2026'],
  ]);
  assert.deepEqual(steps.map((s) => s.href), twins.map((v) => v.href));
  assert.deepEqual(Object.keys(steps[0]).sort(), ['href', 'kind', 'meta', 'text'], 'a row carries only what the block draws');
  // Before the questions arrive, or with none recorded: the division's number on its day, where a held row shows it.
  assert.deepEqual(memberVoteSteps(twins).slice(0, 2).map((s) => [s.text, s.meta]), [
    ['Example Bill 2026; Consideration in Detail', 'No · 29 Oct 2026 · division 23'],
    ['Example Bill 2026; Consideration in Detail', 'No · 29 Oct 2026 · division 22'],
  ]);
  // The newest two read differently (a member's Consideration in Detail and Second Reading): as before, and nothing is asked for.
  // A twin below the drawn rows changes nothing.
  const differ = [vote(23, 'Consideration in Detail'), vote(20, 'Second Reading'), vote(7, 'Second Reading')];
  assert.deepEqual(votesToTellApart(differ), []);
  assert.deepEqual(memberVoteSteps(differ, { questions }).map((s) => s.text), differ.map((v) => v.title));
  // Different days are told apart by their dates.
  assert.deepEqual(votesToTellApart([vote(5, 'Second Reading', '2026-10-29'), vote(5, 'Second Reading', '2026-10-28')]), []);
});

test('the Worker reads the two divisions\' questions and draws them in the member\'s first paint; the app does the same before it fills', async () => {
  const person = { name: 'Example Member', pid: 'fixture-member', current: true, states: ['federal'], chambers: ['representatives'] };
  const recent = [vote(23, 'Consideration in Detail'), vote(22, 'Consideration in Detail'), vote(20, 'Second Reading')]
    .map(({ href, title, ...v }) => ({ ...v, title: `BILLS - ${title}`, division_slug: href.slice('/doc/'.length), jur: 'federal' }));
  const files = {
    '/votes.json': { 'fixture-member': { name: person.name, jurisdiction: 'federal', for: [], against: [] } },
    '/seo/recent-votes.json': { _meta: { schema: 1, source: 'opax-parli-db', coverage: 'recorded' }, people: { 'fixture-member': { name: person.name, recent } } },
    '/divisions/division-federal-representatives-oa-2026-10-29-23.json': { question: 'The question is that the amendment moved by the honourable member for Example be agreed to.' },
    '/divisions/division-federal-representatives-oa-2026-10-29-22.json': { question: 'The question is that the amendments moved by the honourable member for Sample be agreed to.' },
  };
  const reads = [];
  const read = async (path) => { reads.push(path); if (path in files) return files[path]; throw new Error('No fixture asset'); };
  const content = await renderPersonAnswer(person, read, new Map());
  assert.deepEqual(reads.filter((path) => path.startsWith('/divisions/')).sort(), ['/divisions/division-federal-representatives-oa-2026-10-29-22.json', '/divisions/division-federal-representatives-oa-2026-10-29-23.json']);
  const boot = personBootBlocks(person, { voteRows: content.voteRows, voteQuestions: content.voteQuestions });
  const nav = new JSDOM(boot.blocks).window.document.getElementById('person-next');
  const links = [...nav.querySelectorAll('.next-steps-held a.next-steps-link')];
  assert.deepEqual(links.map((a) => a.textContent), [
    'That the amendment moved by the honourable member for Example be agreed to',
    'That the amendments moved by the honourable member for Sample be agreed to',
  ]);
  for (const a of links) assert.equal(a.getAttribute('title'), a.textContent, 'a held row keeps its whole text in its title');
  assert.deepEqual([...nav.querySelectorAll('.next-steps-held .next-steps-meta')].map((m) => m.textContent),
    ['No · 29 Oct 2026 · Example Bill 2026; Consideration in Detail', 'No · 29 Oct 2026 · Example Bill 2026; Consideration in Detail']);
  // The app asks for the same questions, by the same rule, before it fills the reserved places.
  const at = app.indexOf('nextSteps?.votesToTellApart?.(rows)');
  assert.ok(at > 0 && at < app.indexOf('nextSteps.memberVoteSteps(rows, { questions })'), 'the app reads the questions before it fills');
  assert.match(app, /fetch\(`\/divisions\/\$\{href\.slice\("\/doc\/"\.length\)\}\.json`\)/);
});
