// Pages that say what happened (web critique 2, lane C): the bill page's divisions told in a sentence
// and grouped, the person page's scope lines, and the three record-backed lines of item 11. Every
// date here is pinned; nothing reads the clock.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {divisionKind, divisionIdentity, divisionRows, divisionGroupSentences, billDivisionsTablesHTML, voteScopeLine} from '../public/vote-tables.js';
import {interestShownNote} from '../public/register-tables.js';
import {speechSpanLine, mentionTitleCase, mentionNamesPerson, mentionAliases} from '../public/held-back-transcripts.js';
import {mostDividedLine} from '../public/home-data.js';
import {heldSinceLine, profileHTML} from '../public/electorates.js';
import {latestReturnLine} from '../public/party-page.js';
import {renderBillAnswer} from '../src/seo-content.ts';

// The shape of the Interactive Gambling (Cost Recovery Levy) Bill 2026: eleven Senate votes the record
// files under limitation of debate on one day (5 agreed, 6 not agreed) and one committee vote.
const OUTCOMES = ['negative','negative','affirmative','negative','affirmative','negative','affirmative','negative','affirmative','negative','affirmative'];
const gamblingDivisions = [
  ...OUTCOMES.map((outcome, i) => ({key:`senate-2026-08-19-${i + 1}`, date:'2026-08-19', house:'senate', stage:'Limitation of debate', outcome, ayes:10 + i, noes:30 - i})),
  {key:'senate-2026-08-19-20', date:'2026-08-19', house:'senate', stage:'In committee', outcome:'negative', ayes:11, noes:29},
];
const textOf = html => html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

test('a division is grouped by the stage or heading the record files it under, never by its question', () => {
  assert.equal(divisionKind({stage:'Limitation of debate'}), 'limitation');
  assert.equal(divisionKind({stage:'Business motion'}), 'procedure');
  assert.equal(divisionKind({stage:'Declaration of Urgency'}), 'procedure');
  assert.equal(divisionKind({title:'BUSINESS - Suspension of Standing and Sessional Orders'}), 'procedure');
  assert.equal(divisionKind({name:'BUSINESS - Rearrangement'}), 'procedure');
  assert.equal(divisionKind({stage:'Second reading'}), 'bill');
  assert.equal(divisionKind({stage:'second_reading'}), 'bill');
  // A question that talks about closure or standing orders is still the reading it was.
  assert.equal(divisionKind({stage:'Third reading', question:'I move: That the question be now put. So much of the standing orders be suspended'}), 'bill');
  assert.equal(divisionKind({}), 'bill');
});

test('the limitation-of-debate sentence counts the rows it sits above, split agreed and not agreed', () => {
  const rows = divisionRows(gamblingDivisions, true);
  const folded = rows.filter(r => r.kind === 'limitation');
  assert.equal(folded.length, 11);
  const [sentence] = divisionGroupSentences(rows, 'limitation');
  const agreed = folded.filter(r => r.outcome === 'Agreed').length, not = folded.filter(r => r.outcome === 'Not agreed').length;
  assert.equal(agreed, 5); assert.equal(not, 6);
  assert.equal(sentence, `On 19 Aug 2026 the Senate voted 11 times on this bill under a limitation of debate, a time limit set on the debate: ${agreed} agreed, ${not} not agreed.`);
  // Across days, one vote, and no outcome recorded.
  const spread = divisionRows([{key:'a', date:'2026-08-19', house:'senate', stage:'Limitation of debate', outcome:'affirmative'},
    {key:'b', date:'2026-08-20', house:'senate', stage:'Limitation of debate'}]);
  assert.equal(divisionGroupSentences(spread, 'limitation')[0],
    'Between 19 Aug 2026 and 20 Aug 2026 the Senate voted 2 times on this bill under a limitation of debate, a time limit set on the debate: 1 agreed, 0 not agreed, 1 with no recorded outcome.');
  const one = divisionRows([{key:'c', date:'2026-03-02', house:'representatives', stage:'Business motion', outcome:'negative'}]);
  assert.equal(divisionGroupSentences(one, 'procedure')[0],
    'On 2 Mar 2026 the House of Representatives voted once on procedure for this bill, such as business motions or suspending standing orders, and the question was not agreed.');
  assert.deepEqual(divisionGroupSentences(one, 'limitation'), []);
});

test('two divisions on one day with identical tallies are both shown and both counted', () => {
  // federal-senate-10701 and -10702 on the Interactive Gambling Amendment (Gambling Reform) Bill 2026:
  // different questions, Senate divisions 6 and 7 of 19 Aug 2026, both 11 ayes to 24 noes.
  const pair = [
    {key:'federal-senate-10701', date:'2026-08-19', house:'senate', stage:'Limitation of debate', outcome:'negative', ayes:11, noes:24,
      url:'https://theyvoteforyou.org.au/divisions/senate/2026-08-19/6', question:'Sheet 4005 amendment'},
    {key:'federal-senate-10702', date:'2026-08-19', house:'senate', stage:'Limitation of debate', outcome:'negative', ayes:11, noes:24,
      url:'https://theyvoteforyou.org.au/divisions/senate/2026-08-19/7', question:'Second reading amendment'},
  ];
  assert.notEqual(divisionIdentity(pair[0]), divisionIdentity(pair[1]));
  const rows = divisionRows(pair, true);
  assert.equal(rows.length, 2);
  assert.equal(divisionGroupSentences(rows, 'limitation')[0],
    'On 19 Aug 2026 the Senate voted 2 times on this bill under a limitation of debate, a time limit set on the debate: 0 agreed, 2 not agreed.');
  // One division recorded twice (same chamber, day and number) is one row.
  assert.equal(divisionRows([pair[0], {...pair[0], key:'repeat-record'}], true).length, 1);
  // No identity at all: kept, never merged on tally.
  assert.equal(divisionRows([{date:'2026-08-19', stage:'Second reading', ayes:1, noes:2}, {date:'2026-08-19', stage:'Second reading', ayes:1, noes:2}], true).length, 2);
  // The browser's own bill dedupe uses the same identity.
  const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  const code = app.slice(app.indexOf('function billDedupeDivisions('), app.indexOf('/* The record writes its questions as'));
  const {billDedupeDivisions} = runInNewContext(code + ';({billDedupeDivisions})', {voteTables:{divisionIdentity}, billQuestionParts:() => ({head:'x'})});
  const deduped = billDedupeDivisions([...pair, {...pair[1], key:'repeat-of-7'}], {});
  assert.equal(deduped.divisions.length, 2);
  assert.equal(deduped.collapsed, 1);
  // And the server render counts both.
  const html = renderBillAnswer({key:'au-federal-r7520', title:'Fixture Bill 2026', divisions:pair, sources:[]}, [], new Map(), [], {}).html;
  assert.match(html, /voted 2 times on this bill under a limitation of debate, a time limit set on the debate: 0 agreed, 2 not agreed\./);
});

test('a bill page states the sentence above the divisions and folds the limitation rows apart from the rest', () => {
  const rows = divisionRows(gamblingDivisions, true);
  const html = billDivisionsTablesHTML(rows, {bill:'au-federal-r7534'});
  const group = html.indexOf('class="ui-disclosure division-group"');
  assert.ok(html.startsWith('<p class="division-story">') && group > html.indexOf('data-vote-table'), 'the sentence comes first, the folded group after the main table');
  assert.match(html, /<summary>11 votes under limitation of debate<\/summary>/);
  // The main table holds the committee vote only; the folded table the eleven.
  const configs = [...html.matchAll(/<script type="application\/json" data-vote-config>([\s\S]*?)<\/script>/g)].map(m => JSON.parse(m[1]));
  assert.deepEqual(configs.map(c => [c.id, c.rows.length, c.source]), [['division-table', 1, undefined], ['division-limitation-table', 11, undefined]]);
  assert.notEqual(configs[0].urlKey, configs[1].urlKey);
  // One outcome vocabulary in what a reader sees.
  assert.doesNotMatch(textOf(html), /negatived/i);
  assert.match(textOf(html), /Not agreed/);
  // Folded with nothing else to show, the group is open.
  const only = billDivisionsTablesHTML(rows.filter(r => r.kind === 'limitation'), {bill:'x'});
  assert.match(only, /division-group" data-kind="limitation" open>/);
  // A bill with no folded votes keeps its one server-backed table and no sentence.
  const plain = billDivisionsTablesHTML(rows.filter(r => r.kind === 'bill'), {bill:'au-federal-r7534'});
  assert.doesNotMatch(plain, /division-story|division-group/);
  assert.match(plain, /"endpoint":"\/api\/table\/divisions"/);
});

test('the server-rendered bill page tells the same story, and its stages never say negatived', () => {
  const bill = {key:'au-federal-r7534', title:'Interactive Gambling (Cost Recovery Levy) Bill 2026', status:'passed',
    key_dates:[{stage:'second_reading', date:'2026-08-18', house:'senate', url:'', negatived:true}],
    divisions:gamblingDivisions, sources:[]};
  const html = renderBillAnswer(bill, [], new Map(), [], {}).html;
  assert.match(html, /On 19 Aug 2026 the Senate voted 11 times on this bill under a limitation of debate, a time limit set on the debate: 5 agreed, 6 not agreed\./);
  assert.match(html, /Second reading \(not agreed\)/);
  assert.doesNotMatch(textOf(html), /negatived/i);
  assert.match(html, /id="division-table-ssr"|data-dt-id="division-table-ssr"|division-table-ssr/);
});

test('the browser bill page uses the shared renderer and one outcome vocabulary', () => {
  const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.match(app, /const BILL_OUTCOMES = \{ affirmative: "Agreed", negative: "Not agreed" \};/);
  assert.match(app.slice(app.indexOf('function billDivisionsHTML('), app.indexOf('const BILL_SPEECH_BRIEF_NOTE')), /voteTables\.billDivisionsTablesHTML\(rows, \{bill: bill\.key\}\)/);
  // Suggestions wrap instead of clipping under an ellipsis or a line clamp.
  const css = readFileSync(new URL('../public/style.css', import.meta.url), 'utf8');
  const rule = css.slice(css.indexOf('.growth-questions a {'), css.indexOf('}', css.indexOf('.growth-questions a {')));
  assert.doesNotMatch(rule, /nowrap|ellipsis/);
  assert.doesNotMatch(css, /\.growth-questions a \{[^}]*line-clamp/);
});

test('the vote block says how many of the whole count its table holds', () => {
  assert.equal(voteScopeLine(10, 2938), 'The 10 most recent of 2,938 recorded divisions.');
  assert.equal(voteScopeLine(1, 40), 'The most recent of 40 recorded divisions.');
  assert.equal(voteScopeLine(12, 12), 'All 12 recorded divisions.');
  assert.equal(voteScopeLine(8, 120, false), 'The 8 latest votes on bills, from 120 recorded divisions.');
  assert.equal(voteScopeLine(0, 120), '');
});

test('declared interests explain a table shorter than its count', () => {
  const register = {total:28, buckets:{memberships:{count:17, items:Array(6).fill({})}, liabilities:{count:2, items:Array(2).fill({})}, other:{count:9, items:Array(6).fill({})}}};
  assert.equal(interestShownNote(register, 14, 'https://www.aph.gov.au/register.pdf'),
    '14 entries are listed here, up to 6 in each category. All 28 are in <a href="https://www.aph.gov.au/register.pdf" rel="noopener" target="_blank">the register ↗︎</a>.');
  assert.equal(interestShownNote(register, 14, 'javascript:alert(1)'), '14 entries are listed here, up to 6 in each category. All 28 are in the register.');
  assert.equal(interestShownNote({...register, total:14}, 14), '');
});

test('the interests note claims no order across categories (a full category can hold back a newer entry)', () => {
  // The shape of the reviewer's case, under an invented senator: travel's six places hold entries newer
  // than 15 Feb 2026, so a 15 Feb travel entry is left out while a 7 Jan superannuation entry is listed.
  const travel = ['2026-06-01','2026-05-01','2026-04-20','2026-04-01','2026-03-15','2026-03-01'].map(date => ({date, description:'Travel'}));
  const register = {total:19, buckets:{
    travel:{count:7, items:travel},
    other:{count:6, items:[{date:'2026-01-07', description:'Superannuation fund'}, ...Array(5).fill({date:'2025-12-01', description:'Other'})]},
    gifts:{count:6, items:Array(2).fill({date:'2025-11-01', description:'Gift'})},
  }};
  const shown = Object.values(register.buckets).reduce((n, b) => n + b.items.length, 0);
  assert.equal(shown, 14);
  const note = interestShownNote(register, shown);
  assert.equal(note, '14 entries are listed here, up to 6 in each category. All 19 are in the register.');
  assert.doesNotMatch(note, /most recent|newest|latest/);
});

test('the speech span says where the record stops, and only a sitting member is told later speeches are missing', () => {
  assert.equal(speechSpanLine('2024-09-11', {current:true, today:'2026-11-13'}), 'Speeches in the record run to 11 Sep 2024. Later speeches are not yet in the record.');
  assert.equal(speechSpanLine('2024-09-11', {current:false, today:'2026-11-13'}), 'Speeches in the record run to 11 Sep 2024.');
  assert.equal(speechSpanLine('2026-10-29', {current:true, today:'2026-11-13'}), 'Speeches in the record run to 29 Oct 2026.');
  assert.equal(speechSpanLine('', {current:true, today:'2026-11-13'}), '');
});

test('mentions read in sentence case and keep only rows whose passage names the person', () => {
  assert.equal(mentionTitleCase('STATEMENTS BY SENATORS'), 'Statements by senators');
  assert.equal(mentionTitleCase('BILLS - Treasury Laws Amendment Bill 2026'), 'Bills - Treasury Laws Amendment Bill 2026');
  assert.equal(mentionTitleCase('NDIS FUNDING'), 'NDIS funding');
  assert.equal(mentionTitleCase('Questions without notice'), 'Questions without notice');
  assert.equal(mentionNamesPerson({snippet:'The member for Seaview, Mr Example, said'}, 'Alex Example'), true);
  assert.equal(mentionNamesPerson({snippet:'Senator Other spoke on the motion.'}, 'Alex Example'), false);
  assert.equal(mentionNamesPerson({snippet:'An Examplesson report'}, 'Alex Example'), false);
  // A name cut off where the row's passage ends is not one the reader sees.
  const cut = `${'x'.repeat(205)} refer to Alex Example and more`;
  assert.equal(mentionNamesPerson({snippet:cut}, 'Alex Example'), false);
  assert.equal(mentionNamesPerson({snippet:cut}, 'Alex Example', {shown:400}), true);
});

test('office aliases are complete titles, and a qualifier before an alias makes it someone else\'s', () => {
  // An invented member, with real-shaped Handbook posts: Leader of the House and a long portfolio in 2008,
  // Treasurer from 2022, member for Seaview throughout; recorded as Labor.
  const aliases = mentionAliases({
    party:'Labor',
    electorates:[{name:'Seaview', chamber:'representatives', party:'Labor', periods:[{start:'1996-03-02', end:null}]}],
    spells:[['2008-02-12','2010-09-14','Leader of the House, Minister for Infrastructure, Transport, Regional Development and Local Government',75,1],
      ['2010-09-14','2013-06-27','Minister for Health and Minister for Ageing (Cabinet)',75,1],
      ['2022-06-01',null,'Treasurer',60,1]],
  });
  const phrases = aliases.map(a => a.phrase);
  assert.ok(phrases.includes('Minister for Infrastructure, Transport, Regional Development and Local Government'));
  assert.ok(phrases.includes('Leader of the House'));
  // "Minister for X and Minister for Y" splits only because both halves are titles in their own right.
  assert.ok(phrases.includes('Minister for Health') && phrases.includes('Minister for Ageing'));
  // Never a portfolio fragment.
  for (const fragment of ['Transport', 'Regional Development and Local Government', 'Local Government']) assert.ok(!phrases.includes(fragment), fragment);
  const ask = (snippet, date) => mentionNamesPerson({snippet, date}, 'Alex Example', {aliases});
  // Control 1: another person's shadow office that shares a portfolio word.
  assert.equal(ask('Warren Truss MP, the shadow minister for transport, has already underlined the principal reasons.', '2008-05-27'), false);
  assert.equal(ask('Transport costs have increased.', '2008-05-27'), false);
  // Control 2: a youth parliamentarian for the person's own seat.
  assert.equal(ask('And a big thankyou to Tenzin for being the youth member for Seaview.', '2026-08-17'), false);
  // Control 3: a former holder of the person's current office, with a party the person was not.
  assert.equal(ask('The former Liberal Treasurer told the chamber.', '2026-08-12'), false);
  assert.equal(ask('The Liberal Treasurer told the chamber.', '2026-08-12'), false);
  // Other people: a state member, the speaker recalling their own time in a seat.
  assert.equal(ask('The state member for Seaview opened the hospital.', '2026-08-12'), false);
  assert.equal(ask('The Victorian member for Seaview opened the hospital.', '2026-08-12'), false);
  assert.equal(ask('back then when I was the member for Seaview. I recall it clearly.', '2026-08-12'), false);
  // Kept: the complete title on a date it was held, a same-party adjective, and a plain address.
  assert.equal(ask('The Minister for Infrastructure, Transport, Regional Development and Local Government announced the funding.', '2009-03-01'), true);
  assert.equal(ask('The Labor member for Seaview spoke on the bill.', '2026-08-12'), true);
  assert.equal(ask('I thank my friend the member for Seaview for his contribution.', '2026-08-12'), true);
  // A qualifier in an earlier appositive belongs to that phrase, not to the alias after the comma.
  assert.equal(ask('a tribute to the previous minister, the member for Seaview, for her work', '2026-08-12'), true);
  // One plainly addressed use is enough even when another is qualified.
  assert.equal(ask('The former Treasurer was wrong, as the Treasurer said yesterday.', '2026-08-12'), true);
});

test('"the Prime Minister" is kept on a date the person held it, and not on one they did not', () => {
  const aliases = mentionAliases({party:'Labor', spells:[['2019-05-27','2022-05-23','Leader of the Opposition',85,1], ['2022-05-23',null,'Prime Minister',160,1]]});
  const ask = (snippet, date) => mentionNamesPerson({snippet, date}, 'Alex Example', {aliases});
  assert.equal(ask('The Prime Minister told the chamber.', '2024-02-08'), true);
  assert.equal(ask('The Prime Minister told the chamber.', '2021-02-08'), false);
  assert.equal(ask('The Leader of the Opposition told the chamber.', '2021-02-08'), true);
  assert.equal(ask('The former Australian Prime Minister told the chamber.', '2024-02-08'), false);
  assert.equal(ask('The Deputy Prime Minister told the chamber.', '2024-02-08'), false);
});

test('a mention addressed to a seat or office the person held on its date is kept; anyone else\'s is not', () => {
  // An invented member: Seaview from 2010 to 2016, then Harbourside from 2016; Treasurer 2019 to 2022,
  // then Prime Minister. Seats and offices come from the dated records, never the current ones.
  const aliases = mentionAliases({
    electorates:[{name:'Seaview', chamber:'representatives', periods:[{start:'2010-08-21', end:'2016-07-02'}]},
      {name:'Harbourside', chamber:'representatives', periods:[{start:'2016-07-02', end:null}]},
      {name:'New South Wales', chamber:'senate', periods:[{start:'2000-01-01', end:null}]}],
    spells:[['2010-08-21','2019-05-27','Member of Parliament',0,1], ['2019-05-27','2022-05-23','Treasurer (Cabinet)',60,1],
      ['2022-05-23',null,'Leader of the House, Prime Minister',160,1]],
  });
  const ask = (snippet, date) => mentionNamesPerson({snippet, date}, 'Alex Example', {aliases});
  // An electorate-addressed passage on a date the person held the seat: kept.
  assert.equal(ask('The member for Harbourside said in this place last week that', '2026-08-12'), true);
  assert.equal(ask('As the member for Seaview told the House,', '2014-03-01'), true);
  // A different member's electorate: rejected.
  assert.equal(ask('The member for Riverbend said in this place last week that', '2026-08-12'), false);
  // An electorate the person held only later: rejected for an earlier passage.
  assert.equal(ask('The member for Harbourside said', '2014-03-01'), false);
  // And one they held only earlier: rejected for a later passage.
  assert.equal(ask('The member for Seaview said', '2026-08-12'), false);
  // An office held on the day counts; one held by someone else that day, or a qualified title, does not.
  assert.equal(ask('The Prime Minister told the chamber', '2024-02-08'), true);
  assert.equal(ask('The Prime Minister told the chamber', '2020-02-08'), false);
  assert.equal(ask('The Treasurer told the chamber', '2020-02-08'), true);
  assert.equal(ask('The Treasurer told the chamber', '2024-02-08'), false);
  assert.equal(ask('The Deputy Prime Minister told the chamber', '2024-02-08'), false);
  assert.equal(ask('The former Prime Minister told the chamber', '2024-02-08'), false);
  // A shared upper-house seat and the generic posts identify nobody.
  assert.deepEqual(aliases.map(a => a.phrase).sort(), ['Leader of the House', 'Prime Minister', 'Treasurer', 'member for Harbourside', 'member for Seaview']);
  // No date, no dated alias.
  assert.equal(ask('The member for Harbourside said', ''), false);
});

const hubs = {weeks:[
  {start:'2026-10-12', end:'2026-10-15', divisions:[{key:'1', name:'BILLS - Older Bill 2026; Second Reading', jurisdiction:'federal'}, {key:'2', name:'BILLS - Older Bill 2026; Third Reading', jurisdiction:'federal'}]},
  {start:'2026-10-26', end:'2026-10-29', divisions:[
    {key:'3', name:'BILLS - Example Safety Bill 2026; Second Reading', jurisdiction:'federal'},
    {key:'4', name:'BILLS - Example Safety Bill 2026; Consideration in Detail', jurisdiction:'federal'},
    {key:'5', name:'BILLS - Example Safety Bill 2026; Consideration in Detail', jurisdiction:'federal'},
    {key:'6', name:'BILLS - Example Tax Bill 2026; Second Reading', jurisdiction:'federal'},
    {key:'7', name:'BUSINESS - Rearrangement', jurisdiction:'federal'},
    {key:'8', name:'BUSINESS - Rearrangement', jurisdiction:'federal'},
    {key:'9', name:'BUSINESS - Rearrangement', jurisdiction:'federal'}]},
  {start:'2026-11-16', end:'2026-11-19', divisions:[]},
]};

test('home: the bill most divided on in the last completed sitting week, by rule', () => {
  assert.deepEqual(mostDividedLine(hubs, '2026-11-13'), {href:'/sitting/2026-10-26', text:'Most divisions last sitting week: Example Safety Bill 2026, 3'});
  // During the week itself, the week before is the last completed one.
  assert.deepEqual(mostDividedLine(hubs, '2026-10-28'), {href:'/sitting/2026-10-12', text:'Most divisions last sitting week: Older Bill 2026, 2'});
  // Two bills level are both named; three level, or a lead of one division, is no line.
  const tie = {weeks:[{start:'2026-10-26', end:'2026-10-29', divisions:['A','A','B','B'].map((b, i) => ({key:String(i), name:`BILLS - ${b} Bill; Second Reading`}))}]};
  assert.equal(mostDividedLine(tie, '2026-11-13').text, 'Most divisions last sitting week: A Bill and B Bill, 2 each');
  const three = {weeks:[{start:'2026-10-26', end:'2026-10-29', divisions:['A','A','B','B','C','C'].map((b, i) => ({key:String(i), name:`BILLS - ${b} Bill; Second Reading`}))}]};
  assert.equal(mostDividedLine(three, '2026-11-13'), null);
  const single = {weeks:[{start:'2026-10-26', end:'2026-10-29', divisions:[{key:'x', name:'BILLS - A Bill; Second Reading'}]}]};
  assert.equal(mostDividedLine(single, '2026-11-13'), null);
  // Missing data is no line.
  assert.equal(mostDividedLine(null, '2026-11-13'), null);
  assert.equal(mostDividedLine({weeks:[]}, '2026-11-13'), null);
  assert.equal(mostDividedLine(hubs, '2026-10-01'), null);
  assert.equal(mostDividedLine(hubs, 'not a date'), null);
  const html = readFileSync(new URL('../public/home.html', import.meta.url), 'utf8');
  assert.match(html, /<p id="hp-sitting" class="hp-sitting" hidden><\/p>\s*<p id="hp-most-divided" class="hp-sitting hp-most-divided" hidden><\/p>/);
});

const seat = (terms, extra = {}) => ({name:'Example', chamber:'representatives', state_code:'nsw', status:'current', capacity:1, terms,
  boundaries:[], relations:[], elections:[], demographics:[], people:{}, representatives:[], rosters:[], sources:[], electorate_id:'el_x', detail_url:'/x.json', ...extra});
test('electorate: "Held by <party> since <year>" from the service records, limited to the years they cover', () => {
  const grayndlerLike = seat([
    {person_id:'a', start:'1989-08-29', end:'1993-03-13', party_periods:[]},
    {person_id:'b', start:'1993-03-13', end:'1996-01-29', party_periods:[{party:'Labor', start:'1993-03-13', end:'1996-01-29'}]},
    {person_id:'c', start:'1996-03-02', end:null, party_periods:[{party:'Labor', start:'1996-03-02', end:null}]},
  ]);
  assert.equal(heldSinceLine(grayndlerLike).text, 'Held by Labor since at least 1993');
  const changed = seat([
    {person_id:'a', start:'2010-08-21', end:'2022-05-21', party_periods:[{party:'Liberal', start:'2010-08-21', end:'2022-05-21'}]},
    {person_id:'b', start:'2022-05-21', end:null, party_periods:[{party:'Independent', start:'2022-05-21', end:null}]},
  ]);
  assert.equal(heldSinceLine(changed).text, 'Held by Independent since 2022');
  assert.match(profileHTML(changed), /<p class="ui-page-meta el-held-since">Held by Independent since 2022<\/p>/);
  // Absent: no open record, no party, a multi-member electorate, a historical seat, an as-at view.
  assert.equal(heldSinceLine(seat([{person_id:'a', start:'2010-08-21', end:'2022-05-21', party_periods:[{party:'Liberal', start:'2010-08-21'}]}])), null);
  assert.equal(heldSinceLine(seat([{person_id:'a', start:'2022-05-21', end:null, party_periods:[]}])), null);
  assert.equal(heldSinceLine({...changed, capacity:5}), null);
  assert.equal(heldSinceLine({...changed, status:'historical'}), null);
  assert.doesNotMatch(profileHTML(changed, '2024-01-01'), /el-held-since/);
});

test('party: the latest annual return in the header, with its scope, and nothing without a return', () => {
  const money = n => `$${(n / 1e6).toFixed(1)}m`;
  const rows = [['2023-24', 120_000_000, 0, 0, 9], ['2024-25', 161_800_000, 0, 0, 9], ['2025-26', 0, 0, 0, 0]];
  assert.deepEqual(latestReturnLine(rows, money), {year:'2024-25', receipts:161_800_000, text:'On its 2024–25 annual return: $161.8m in receipts, 9 branches summed.'});
  assert.equal(latestReturnLine([['2019-20', 50_000, 0, 0, 1]], money).text, 'On its 2019–20 annual return: $0.1m in receipts.');
  assert.equal(latestReturnLine([], money), null);
  assert.equal(latestReturnLine(undefined, money), null);
  assert.equal(latestReturnLine([['2024-25', 0, 0, 0, 3]], money), null);
});
