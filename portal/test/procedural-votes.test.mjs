import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import {JSDOM} from 'jsdom';
import * as tables from '../public/vote-tables.js';
import {renderBillAnswer} from '../src/seo-content.ts';
import {proceduralTitles} from '../scripts/build-procedural-titles.mjs';

const pub = new URL('../public/', import.meta.url);
const read = path => JSON.parse(readFileSync(new URL(path, pub), 'utf8'));
const titles = read('procedural-division-titles.json');
const fixtures = kind => JSON.parse(readFileSync(new URL(`fixtures/${kind}-division-titles.json`, import.meta.url), 'utf8'));
const screenSnapshot = JSON.parse(readFileSync(new URL('fixtures/procedural-title-screen.json', import.meta.url), 'utf8'));
const titleScreen = (divisions, asOf) => divisions.filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d.date || '') && d.date <= asOf
  && /closure|suspension|no longer heard|put the question|stop/i.test(d.name || d.title || ''));
// Thirty real titles each way, listed in these fixtures with their published division keys.
// Keep the wording verbatim so punctuation, legislative titles and stages cross the real boundary.
for (const [kind, expected] of [['procedural', true], ['substantive', false]]) {
  const cases = fixtures(kind);
  test(`30 published ${kind} titles`, () => {
    assert.equal(cases.length, 30);
    assert.equal(new Set(cases.map(d => d.title)).size, 30);
    for (const d of cases) {
      assert.equal(read(`divisions/division-${d.key}.json`).name, d.title, d.key);
      assert.equal(tables.isProceduralDivision(d.title), expected, d.title);
    }
  });
}

// Borderline records: the topic and stage alone must not decide the question's kind.
const borderline = [
  ['federal-senate-10080', false, 'An amendment on content, even though the stage is Limitation of Debate.'],
  ['federal-senate-10081', false, 'Changes safeguards, natural justice and compensation.'],
  ['federal-senate-10082', false, 'Passes the bill; a time-limited stage does not make passage procedural.'],
  ['federal-senate-9819', false, 'A bare Limitation of Debate heading does not identify the question put.'],
  ['federal-senate-10055', true, 'Put the question explicitly closes debate, even at first reading.'],
  ['federal-representatives-3351', true, 'Closes debate on whether to read a third time; not the third reading vote.'],
  ['federal-senate-7775', false, 'Suspends benefits and entitlements, not parliamentary rules.'],
  ['federal-representatives-5433', false, 'Suspends an opt-out policy phase, not debate.'],
  ['federal-senate-2750', false, 'Closure concerns Guantanamo Bay, not the debate.'],
  ['federal-senate-3362', false, 'Reversing a position on an agency closure is a content motion.'],
  ['federal-senate-1408', false, 'Leave schedules unchanged is a content amendment, not leave to move a motion.'],
  ['federal-representatives-5870', false, 'Stop privatisation is a content motion.'],
  ['federal-senate-8087', false, 'Disclosure in a bill title is not closure of debate.'],
  ['federal-representatives-3681', false, 'A member suspension heading alone does not show a debate motion.'],
  ['federal-representatives-4969', true, 'Suspending parliamentary rules is explicit in this title.'],
  ['federal-representatives-406', true, 'Speed things along is the closure motion, before the main question.'],
  ['federal-representatives-3540', true, 'End debate on the main idea closes debate rather than deciding the main idea.'],
  ['federal-representatives-3394', true, 'Put the motion is the closure question, not the second reading question.'],
  ['federal-senate-3235', false, 'A qualified disallowance heading is outside the exact Put the motion closure label.'],
  ['federal-representatives-4809', true, 'Speeaking is a recorded typo in a motion to stop an MP speaking.'],
  ['federal-representatives-6554', true, 'Spearking is a recorded typo in a motion to stop an MP speaking.'],
  ['federal-representatives-6479', true, 'Preventing a vote concerns the running of the debate.'],
  ['federal-representatives-7986', false, 'Stop considering bill does not identify a closure motion.'],
  ['federal-representatives-8062', false, 'Consider bill now does not identify a closure motion.'],
];
for (const [key, procedural, why] of borderline) test(why, () => {
  assert.equal(tables.isProceduralDivision(read(`divisions/division-${key}.json`).name), procedural);
});

test('explicit procedure phrases, missing titles and content words', () => {
  for (const title of ['That the question be now put', 'Closure of debate', 'Guillotine', 'Allotment of time',
    'Suspension of sessional orders', 'That the member be no longer heard', 'Adjournment of the debate',
    'That the debate be now adjourned', 'Leave to introduce a bill', 'Leave be granted',
    'Order of business', 'Business - Rearrangement']) assert.equal(tables.isProceduralDivision(title), true, title);
  for (const title of [undefined, null, '', 'Third reading', 'Amendments', 'Closure of a hospital',
    'Parental Leave Bill 2026 - Second reading', 'Order for the production of documents',
    'Business - Small business grants', 'Leave second reading motion unchanged']) assert.equal(tables.isProceduralDivision(title), false, title);
  assert.equal(tables.isProceduralDivision('BILLS &ndash; Example Bill; **That the question be now put**'), true);
});

test('closure wording is anchored and curly apostrophes do not change the classification', () => {
  for (const title of ['Mine pre-closure - rehabilitation', 'Non-stop talking points', 'Reverse position on closure',
    'Put the question to the people', 'Suspend the rules of origin',
    'Second Reading - Put the motion to the people', 'Put the motion (for disallowance)', 'Speed things along the coast',
    'Stop considering bill', 'Consider bill now']) assert.equal(tables.isProceduralDivision(title), false, title);
  for (const title of ['Speed things along', 'End debate', 'End debate on bill’s main idea',
    'Second Reading - Put the motion', 'Put the question [closure]', 'Put the question (to read a second time)',
    'Don’t let a vote happen', 'Don’t stop the MP from speaking']) assert.equal(tables.isProceduralDivision(title), true, title);
});

test('the published Speed things along titles are procedural, without inferring support for the bill', () => {
  const divisions = readdirSync(new URL('divisions/', pub)).filter(f => f.startsWith('division-')).map(f => read(`divisions/${f}`));
  const closure = divisions.filter(d => /speed things along\s*$/i.test(d.name || d.title || ''));
  assert.ok(closure.length > 0);
  for (const d of closure) {
    const title = d.name || d.title;
    assert.equal(tables.isProceduralDivision(title), true, d.key);
    const records = tables.personVoteRecords(['fixture'], {fixture:{name:'Example Member', for:[{title}]}}).rows;
    const [row] = tables.votingRows(records);
    assert.equal(row.vote, 'Aye', d.key);
    assert.equal(row.procedural, true, d.key);
  }
});

test('release title lookup is rebuilt from published records using the shared classifier', () => {
  assert.deepEqual(titles, proceduralTitles());
  assert.ok(Object.keys(titles).length > 1000);
  const groups = tables.billDivisionGroups([
    {key:'unknown', stage:'Limitation of debate', question:'That the question be now put'},
    {key:'federal-senate-10055', stage:'First reading'},
  ], titles);
  assert.equal(groups.substantive.length, 1, 'Do not guess from the stage or question text.');
  assert.equal(groups.procedural.length, 1, 'Use the division title when an older bill has none.');
});

test('lookup titles identify procedure without changing the exported stage narrative', () => {
  const division = {key:'fixture-lookup', stage:'First reading', date:'2026-08-19', house:'senate', outcome:'affirmative'};
  const groups = tables.billDivisionGroups([division], {'fixture-lookup':'Business - Rearrangement'});
  assert.equal(groups.procedural.length, 1);
  assert.equal(groups.procedural[0].kind, 'bill');
  const html = tables.billDivisionTablesHTML([division], {'fixture-lookup':'Business - Rearrangement'});
  assert.doesNotMatch(html, /division-story/);
  assert.match(html, /First reading/);
});

for (const [key, substantive, procedural] of [['au-federal-r7447', 11, 1], ['au-federal-r7363', 8, 1], ['au-federal-r5187', 8, 7]]) {
  test(`${key}: server and client separate counts, keep links and collapse procedure`, () => {
    const bill = {...read(`bills/${key}.json`), division_titles:titles};
    const groups = tables.billDivisionGroups(bill.divisions, titles);
    assert.equal(groups.substantive.length, substantive);
    assert.equal(groups.procedural.length, procedural);
    for (const html of [renderBillAnswer(bill, [], new Map()).html, tables.billDivisionTablesHTML(bill.divisions, titles)]) {
      const doc = new JSDOM(html).window.document;
      const disclosure = doc.querySelector('details.procedural-votes');
      assert.equal(disclosure.open, false);
      assert.match(disclosure.querySelector('summary').textContent, /^Procedural votes/);
      assert.equal(disclosure.querySelector('p').textContent, tables.PROCEDURAL_VOTES_NOTE);
      assert.equal(doc.querySelector('.bill-vote-summary').textContent, `${substantive} substantive votes; ${procedural} procedural vote${procedural === 1 ? '' : 's'}.`);
      assert.equal(doc.querySelector('table').caption.textContent, 'Divisions on the bill');
      const configs = [...doc.querySelectorAll('[data-vote-config]')].map(el => JSON.parse(el.textContent));
      const proceduralConfig = configs.find(c => c.urlKey === 'pv');
      assert.equal(configs.filter(c => c.urlKey !== 'pv').reduce((n, c) => n + c.rows.length, 0), substantive);
      assert.equal(proceduralConfig.rows.length, procedural);
      assert.ok(configs.every(c => !c.source), 'Hydration, filters, sorting and CSV use the same complete groups.');
      assert.equal(new Set(configs.flatMap(c => c.rows.map(r => r.href))).size, substantive + procedural, 'Every division appears in exactly one table.');
      const stageRows = [...groups.substantive, ...groups.procedural];
      const sentences = ['limitation', 'procedure'].flatMap(kind => tables.divisionGroupSentences(stageRows, kind));
      assert.equal(doc.querySelector('.division-story')?.textContent || '', sentences.join(' '), 'Keep the reviewed stage, scope and outcome narrative.');
      const visibleLinks = [...doc.querySelector('table').querySelectorAll('tbody a')].map(a => a.getAttribute('href'));
      for (const row of groups.procedural) assert.ok(!visibleLinks.includes(row.href));
      for (const row of groups.procedural) assert.ok(disclosure.querySelector(`a[href="${row.href}"]`));
    }
  });
}

test('person rows tag procedure and never describe it as support for the bill', () => {
  const title = fixtures('procedural')[0].title;
  const records = tables.personVoteRecords(['fixture'], {fixture:{name:'Example Member', for:[{title}], against:[{title}]}}).rows;
  const rows = tables.votingRows(records);
  assert.deepEqual(rows.map(r => r.vote), ['Aye', 'No']);
  assert.ok(rows.every(r => r.procedural));
  const config = tables.voteTableConfig('fixture');
  const doc = new JSDOM(tables.voteTableHTML(config, tables.voteTablePage(rows, config))).window.document;
  assert.equal(doc.querySelectorAll('.procedural-tag').length, 2);
  assert.doesNotMatch(doc.body.textContent, /For the bill|Against the bill/);
});

const app = readFileSync(new URL('app.js', pub), 'utf8');
const sourceFile = ts.createSourceFile('app.js', app, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const functionSource = name => sourceFile.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === name).getText(sourceFile);

test('a procedural-only bill keeps caller heading levels in the server and client', () => {
  const bill = {...read('bills/au-federal-s1393.json'), division_titles:titles};
  assert.equal(tables.billDivisionGroups(bill.divisions, titles).substantive.length, 0);
  const server = new JSDOM(renderBillAnswer(bill, [], new Map()).html).window.document;
  assert.equal([...server.querySelectorAll('h2')].find(h => h.textContent === 'Divisions')?.tagName, 'H2');
  const context = {voteTables:tables, growthModules:{moduleAttrs:() => ''},
    billDedupeDivisions:divisions => ({divisions, collapsed:0}), sourceLineHTML:() => ''};
  runInNewContext(functionSource('billDivisionsHTML') + '\nthis.render = billDivisionsHTML;', context);
  const client = new JSDOM(context.render(bill)).window.document;
  assert.equal(client.querySelector('section h2'), null);
  assert.equal(client.querySelector('section h3')?.textContent, 'Divisions');
});

test('the party vote section takes its place before the table module is ready', async () => {
  const dom = new JSDOM('<div id="sections"></div>');
  let ready, loads = 0;
  const context = {document:dom.window.document, currentSubjectKey:'fixture',
    voteTablesReady:new Promise(resolve => {ready = resolve;}),
    loadDivisionBills:async () => {loads++; return {bills:[]};}};
  runInNewContext(functionSource('renderPartyBillDivisions') + '\nthis.render = renderPartyBillDivisions;', context);
  const sections = dom.window.document.querySelector('#sections');
  const rendering = context.render('Example Party', sections, 'fixture');
  assert.equal(sections.firstElementChild?.id, 'party-bills');
  assert.equal(loads, 0);
  ready();
  await rendering;
  assert.equal(loads, 1);
  dom.window.close();
});

test('party vote rows, including folded runs, carry the procedural tag', async () => {
  const dom = new JSDOM('<div id="sections"></div>');
  const divisions = [
    {key:'procedure-one', title:'That the question be now put'},
    {key:'procedure-two', title:'That the question be now put'},
    {key:'content', title:'Second reading'},
  ].map(d => ({...d, stage:'Second reading', date:'2026-11-14', outcome:'affirmative', party_splits:{'Example Party':{ayes:5,noes:2}}}));
  const bill = {key:'fixture-bill', title:'Example Bill', divisions};
  const context = {
    document:dom.window.document, currentSubjectKey:'fixture', voteTablesReady:Promise.resolve(), voteTables:tables,
    loadDivisionBills:async () => ({bills:[{key:bill.key, divisions:3}]}), loadBill:async () => bill,
    billDedupeDivisions:rows => ({divisions:rows}), samePartyLabel:(a,b) => a === b,
    loadPartyPage:async () => ({recordedAsText:() => ''}), billStage:s => s, billOutcome:s => s,
    fmtDate:s => s, billName:b => b.title, billHash:key => `/bill/${key}`,
    entityHrefAttr:path => `href="${path}"`, sourceLineHTML:() => '', $:() => null,
    esc:s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
    PARTY_BILLS_SCAN:8, PARTY_BILLS_ENOUGH:8, PARTY_BILLS_SHOW:8,
  };
  runInNewContext(functionSource('renderPartyBillDivisions') + '\nthis.render = renderPartyBillDivisions;', context);
  await context.render('Example Party', dom.window.document.querySelector('#sections'), 'fixture');
  const rows = [...dom.window.document.querySelectorAll('.party-bill-div')];
  assert.equal(rows.length, 2);
  assert.equal(rows[0].querySelectorAll('.procedural-tag').length, 1, 'Folded procedural votes retain the tag.');
  assert.equal(rows[1].querySelector('.procedural-tag'), null, 'The substantive row keeps its wording.');
  assert.doesNotMatch(rows[0].textContent, /support(?:s|ed)? the bill/i);
  dom.window.close();
});

test('client tags person votes after server paging and uses Aye or No', async () => {
  const title = fixtures('procedural')[0].title;
  const config = tables.voteTableConfig('fixture');
  const rows = tables.votingRows([{title, vote:'aye'}]);
  // Simulate an older server projection that still calls the vote For the bill.
  const legacyPage = {rows:[{...rows[0], vote:'For the bill'}], total:1, page:1, pageSize:25};
  const dom = new JSDOM(tables.voteTableHTML(config, tables.voteTablePage(rows, config)), {url:'https://local.invalid/person/fixture'});
  const oldObserver = globalThis.MutationObserver, oldFetch = globalThis.fetch;
  globalThis.MutationObserver = dom.window.MutationObserver;
  globalThis.fetch = async () => Response.json(legacyPage);
  dom.window.fetch = globalThis.fetch;
  try {
    tables.mountVoteTables(dom.window.document);
    dom.window.document.querySelector('[data-sort="date"]').click();
    await new Promise(resolve => setTimeout(resolve, 30));
    assert.equal(dom.window.document.querySelectorAll('.procedural-tag').length, 1);
    assert.equal(dom.window.document.querySelector('td[data-label="Vote"] .dt-value').textContent, 'Aye');
  } finally {dom.window.close(); globalThis.MutationObserver = oldObserver; globalThis.fetch = oldFetch;}
});

test('client bill tables preserve groups through sorting, filtering and pagination', async () => {
  const divisions = Array.from({length:62}, (_, i) => ({key:`fixture-${i}`, title:i % 2 ? 'That the question be now put' : 'Second reading', date:`2026-11-${String(i % 14 + 1).padStart(2,'0')}`, ayes:i, noes:80-i}));
  const dom = new JSDOM(tables.billDivisionTablesHTML(divisions), {url:'https://local.invalid/bill/fixture', pretendToBeVisual:true});
  const oldObserver = globalThis.MutationObserver;
  globalThis.MutationObserver = dom.window.MutationObserver;
  try {
    tables.mountVoteTables(dom.window.document);
    const blocks = [...dom.window.document.querySelectorAll('[data-vote-table]')];
    assert.equal(blocks.length, 2);
    for (const [i, block] of blocks.entries()) {
      block.querySelector('[data-sort="date"]').click();
      await new Promise(resolve => setTimeout(resolve, 0));
      const config = JSON.parse(block.querySelector('[data-vote-config]').textContent);
      const allowed = new Set(config.rows.map(r => r.href));
      for (const a of block.querySelectorAll('tbody a')) assert.ok(allowed.has(a.getAttribute('href')));
      assert.equal(config.rows.every(r => Boolean(r.procedural) === Boolean(i)), true);
      const size = block.querySelector('[data-page-size]');
      size.value = '10'; size.dispatchEvent(new dom.window.Event('change', {bubbles:true}));
      await new Promise(resolve => setTimeout(resolve, 0));
      const firstPage = new Set([...block.querySelectorAll('tbody a')].map(a => a.getAttribute('href')));
      assert.equal(firstPage.size, 10);
      block.querySelector('button[data-page="2"]').click();
      await new Promise(resolve => setTimeout(resolve, 0));
      for (const a of block.querySelectorAll('tbody a')) {
        assert.ok(allowed.has(a.getAttribute('href')));
        assert.ok(!firstPage.has(a.getAttribute('href')), 'Pagination does not repeat the previous page.');
      }
      const search = block.querySelector('[data-search]');
      search.value = 'unmatchedterm'; search.dispatchEvent(new dom.window.Event('input', {bubbles:true}));
      await new Promise(resolve => setTimeout(resolve, 250));
      assert.equal(block.querySelectorAll('tbody a').length, 0, 'Search cannot pull rows from the other group.');
      const csv = (await import('../public/datatable.js')).toCSV(config.rows, config);
      assert.equal(csv.split('\r\n').length, config.rows.length + 1);
    }
    assert.equal(dom.window.document.querySelector('.procedural-votes').open, false);
    assert.equal(new Set([...dom.window.document.querySelectorAll('table')].map(t => t.id)).size, 2);
  } finally {dom.window.close(); globalThis.MutationObserver = oldObserver;}
});

test('real server routes render both groups and metadata counts without a table database', async () => {
  const {loadWorker, offline} = await import('./worker-harness.mjs');
  const restore = offline();
  try {
    const worker = await loadWorker(new URL('../src/index.ts', import.meta.url).pathname, pub.pathname);
    for (const [key, n, p] of [['au-federal-r7447',11,1], ['au-federal-r7363',8,1], ['au-federal-r5187',8,7]]) {
      const response = await worker.fetch(`/bill/${key}`);
      assert.equal(response.status, 200);
      const doc = new JSDOM(await response.text()).window.document;
      assert.ok(doc.querySelector('#prerender .procedural-votes table tbody a'));
      const description = doc.querySelector('meta[name="description"]').content;
      assert.match(description, new RegExp(`${n} substantive votes`));
      assert.match(description, new RegExp(`${p} procedural votes?`));
    }
  } finally {restore();}
});

// The supplied audit list is not present on this Mac. Reproduce its title screen
// against this checkout and keep every exception inspectable, without using parli.db.
test('dated published title screen: count candidates and retain every conservative exception', () => {
  const divisions = readdirSync(new URL('divisions/', pub)).filter(f => f.startsWith('division-')).map(f => read(`divisions/${f}`));
  assert.match(screenSnapshot.as_of, /^\d{4}-\d{2}-\d{2}$/);
  const candidates = titleScreen(divisions, screenSnapshot.as_of);
  const procedural = candidates.filter(d => tables.isProceduralDivision(d.name || d.title));
  const exceptions = candidates.filter(d => !tables.isProceduralDivision(d.name || d.title));
  const snapshot = screenSnapshot;
  assert.equal(candidates.length, snapshot.candidates);
  assert.equal(procedural.length, snapshot.procedural);
  assert.equal(new Set(candidates.flatMap(d => (d.bills || []).map(b => b.key))).size, snapshot.bill_pages);
  assert.deepEqual(exceptions.map(d => ({key:d.key, title:d.name || d.title})), snapshot.exceptions);
});

test('the audit snapshot includes its cutoff day and ignores later or undated divisions', () => {
  const date = new Date(`${screenSnapshot.as_of}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  const retained = {key:'fixture-cutoff', name:'Put the question', date:screenSnapshot.as_of};
  const later = {...retained, key:'fixture-later', date:date.toISOString().slice(0,10)};
  assert.deepEqual(titleScreen([retained, later, {...retained, date:undefined}], screenSnapshot.as_of), [retained]);
});
