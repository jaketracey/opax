import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {Worker} from 'node:worker_threads';
import ts from 'typescript';
import {JSDOM} from 'jsdom';
import {donorLabelHTML,donorLookup} from '../public/donor-disclosure.js';
import {foldDonorName,MONEY_GRAPHS} from '../public/donor-entity.js';
import {partyLabels,partyMembers,partyMembersHTML,partySlug,partyStateMoneyHTML,resolvePartyLabel} from '../public/party-page.js';

// Jake, 16 Oct: every donor in the directory links to its donor page, and every
// party page works. Names here are invented, or derived from the published data.
const PUBLIC = new URL('../public/', import.meta.url);
const json = path => JSON.parse(readFileSync(new URL('.' + path, PUBLIC), 'utf8'));
const app = readFileSync(new URL('app.js', PUBLIC), 'utf8');
const ast = ts.createSourceFile('app.js', app, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const fnSource = name => { const fn = ast.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === name); assert.ok(fn, name); return app.slice(fn.getStart(ast), fn.end); };
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));

/** The app's own buildDonorsDirectory, over the given money files and donor index. */
async function donorsDirectory(files, indexRecords) {
  const index = donorLookup(indexRecords);
  const disclosed = name => index.get(foldDonorName(name)) || {label: name};
  const context = {
    donorViewReady: Promise.resolve(), donorViewIndex: index,
    loadMoneyFile: async jur => files[jur] || null, loadAccess: async () => ({donors: {}}), loadFits: async () => ({}),
    normName: new Function('x', fnSource('normName').replace(/^function normName\(x\) \{|\}$/g, '')),
    byNumDesc: () => () => 0, byName: () => 0, moneyFor: () => 0, STATE_NOT_SUMMED: '', AEC_NOTE: '', esc,
    donorNameHTML: name => donorLabelHTML(disclosed(name)), donorGroupColour: () => '#000', industryLabel: v => String(v || ''),
    yearSpan: (a, b) => `${a}–${b}`, fmtMoney: v => `$${v}`, anyPartyDotHTML: () => '', entityHrefAttr: h => h ? `href="${esc(h)}"` : '',
    subjectHash: (kind, label) => `/subject/${kind}/${encodeURIComponent(label)}`,
  };
  runInNewContext(fnSource('buildDonorsDirectory') + '\nthis.build=buildDonorsDirectory;', context);
  return context.build();
}
// One fragment parse per row and per page: a JSDOM window each (1,940 rows, ~200 pages) took 8 s
// of this file on the Mac and 44-103 s on the refresh box, past the old 60 s timeout (17 Oct).
const rowLinks = html => [...JSDOM.fragment(html).querySelectorAll('.dir-name a[href]')].map(a => a.getAttribute('href'));

test('directory: every row links to its donor page, whatever the match evidence', async () => {
  const ref = {return_type: 'AEC annual return', year: '2024-25', url: 'https://example.test/r'};
  const node = (id, label, match, extra = {}) => ({id, label, source_name: label, kind: 'donor', industry: 'other', group: 'other', total: 100, count: 1, firstYear: 2024, lastYear: 2024, match, returnReferences: [ref], ...extra});
  const confident = node('donor:pat', 'EXAMPLE, PAT', {confidence: 1, method: 'exact', entity_id: 'pat', href: '/subject/donor/EXAMPLE%2C%20PAT'});
  const uncertain = node('donor:sons', 'Fixture & Sons Pty Limited', {confidence: 0.9, method: 'rule', entity_id: 'sons', href: null});
  const stateOnly = node('donor:hold:qld', "O'Fixture Holdings Pty Ltd", {confidence: 0, method: 'unresolved', href: null});
  const sameName = node('donor:pat:qld', 'EXAMPLE, PAT', {confidence: 0.9, method: 'rule', href: null}); // a second jurisdiction: a collision in the index
  const party = {id: 'party:Labor', label: 'Labor', kind: 'party', total: 300, count: 3};
  const files = {
    federal: {meta: {}, nodes: [confident, uncertain, party], edges: [{source: confident.id, target: party.id, total: 100}, {source: uncertain.id, target: party.id, total: 100}]},
    qld: {meta: {}, nodes: [stateOnly, sameName, party], edges: [{source: stateOnly.id, target: party.id, total: 100}]},
  };
  const indexOnly = {...node('donor:trading', 'Fixture Trading A/B Pty Limited', {confidence: 0.9, method: 'rule', href: null}), jurisdiction: 'federal'};
  const reference = {id: 'donor:uni', kind: 'reference', label: 'Fixture University', source_name: 'Fixture University', jurisdiction: 'federal', match: {confidence: 0, method: 'unresolved', href: null}, returnReferences: [ref]};
  const index = [{...confident, jurisdiction: 'federal'}, {...uncertain, jurisdiction: 'federal'}, {...stateOnly, jurisdiction: 'qld'}, {...sameName, jurisdiction: 'qld'}, indexOnly, reference];
  const directory = await donorsDirectory(files, index);
  assert.equal(directory.items.length, 5);
  for (const item of directory.items) {
    const links = rowLinks(directory.row(item));
    assert.equal(links.length, 1, item.label);
    assert.match(links[0], /^\/subject\/donor\/[^/]+$/, 'one path segment, whatever the name holds');
    assert.equal(decodeURIComponent(links[0].split('/')[3]), item.label, 'the page for the exact disclosure spelling');
    assert.equal(directory.href(item), links[0], 'the quick search opens the same page');
  }
});

test('directory over the published data: every row links, and names with &, commas, apostrophes, slashes and "Pty Limited" open a real donor page', {timeout: 180_000}, async () => {
  const files = Object.fromEntries(MONEY_GRAPHS.map(path => [path.endsWith('money.json') ? 'federal' : path.split('.')[1], json(path)]));
  const directory = await donorsDirectory(files, json('/graph/donor-index.json').donors);
  assert.ok(directory.items.length > 1000);
  const hrefs = directory.items.map(item => [item, rowLinks(directory.row(item))]);
  const unlinked = hrefs.filter(([, links]) => links.length !== 1).map(([item]) => item.label);
  assert.equal(unlinked.length, 0, `${unlinked.length} directory rows have no donor link`);
  // The Worker answers each page: awkward spellings in full, and a spread of the rest.
  const awkward = hrefs.filter(([item]) => /[&,'’/+]|pty limited/i.test(item.label));
  const sample = [...awkward, ...hrefs.filter((_, i) => i % 40 === 0)];
  assert.ok(awkward.length >= 40, 'the published data still has awkward spellings to check');
  console.log(`# ${directory.items.length} directory rows linked; ${sample.length} donor pages fetched (${awkward.length} with awkward spellings)`);
  const {loadWorker, offline} = await import('./worker-harness.mjs');
  const restore = offline();
  try {
    const worker = await loadWorker(new URL('../src/index.ts', import.meta.url).pathname, new URL('../public/', import.meta.url).pathname);
    for (const [item, [href]] of sample) {
      const response = await worker.fetch(href);
      assert.equal(response.status, 200, `${href} answers`);
      const doc = JSDOM.fragment(await response.text());
      assert.ok(doc.querySelector('h1')?.textContent.trim(), `${href} has a title`);
      assert.ok(doc.querySelector('title')?.textContent.trim(), `${href} has a document title`);
      assert.doesNotMatch(doc.querySelector('title').textContent, /not found|unavailable/i, href);
    }
  } finally { restore(); }
});

test('party slugs resolve exactly, never by prefix', () => {
  const labels = ['Liberal', 'Fixture First Party', "Fixture's Voice"];
  assert.equal(resolvePartyLabel('fixture-first-party', labels), 'Fixture First Party');
  assert.equal(resolvePartyLabel('fixtures-voice', labels), "Fixture's Voice");
  assert.equal(resolvePartyLabel('Fixture First Party', labels), 'Fixture First Party');
  assert.equal(resolvePartyLabel('liberal-democratic-party', labels), null, 'not the Liberal Party');
  assert.equal(resolvePartyLabel('', labels), null);
  assert.deepEqual(partyLabels({money: [{nodes: [{kind: 'party', label: 'Liberal'}, {kind: 'donor', label: 'X'}]}], roster: {people: [{party: 'Independent', parties: ['Independent', 'Liberal']}]}, divisions: {parties: {'Fixture First Party': []}}}),
    ['Liberal', 'Independent', 'Fixture First Party']);
});

const roster = {people: [
  // One senator, printed twice: a surname-only committee print and the full name, joined by pid.
  {name: 'Fixture', full: 'Alex Fixture', pid: 'p1', chambers: ['senate_committee'], states: ['federal'], first: 2025, last: 2025},
  {name: 'Alex Fixture', pid: 'p1', party: 'Independent', parties: ['Independent', 'Liberal'], chambers: ['senate'], states: ['federal'], first: 2023, last: 2025},
  {name: 'Sam Example', pid: 'p2', party: 'Labor', party_now: 'Labor', current: true, states: ['federal'], first: 2010, last: 2026},
]};
const divisions = {parties: {'Fixture First Party': [{name: 'Alex Fixture', slug: 'alex-fixture', last: '2025-03-26', divisions: 12}]}};
const helpers = {esc, photoUrlFor: () => null, personUrl: name => name === 'Alex Fixture' ? '/subject/person/alex-fixture' : '/subject/person',
  partyChipHTML: p => `<span class="ui-party">${esc(p)}</span>`, yearSpan: (a, b) => a === b ? String(a) : `${a}–${b}`,
  sourceLineHTML: () => '<p class="source-line">Source</p>', fmtMoney: v => `$${v}`, donorNameHTML: esc, same: (a, b) => a === b,
  stateName: s => s, moneyHref: () => '/money', jurisdictionLabel: j => j, notSummed: ''};

test('a minor party outside the money map: its one member, under the full name, with no empty group', () => {
  const members = partyMembers('Fixture First Party', {roster, divisions, same: helpers.same});
  assert.deepEqual(members.current, []);
  assert.deepEqual(members.former.map(m => [m.name, m.first, m.last, m.divisions]), [['Alex Fixture', 2023, 2025, 12]]);
  const html = partyMembersHTML('Fixture First Party', members, helpers, {speechesHref: '/ask?view=search&q=*&party=Fixture+First+Party'});
  const doc = new JSDOM(html).window.document;
  assert.equal(doc.querySelectorAll('li.dir-row').length, 1);
  assert.equal(doc.querySelector('li.dir-row a').getAttribute('href'), '/subject/person/alex-fixture');
  assert.ok(doc.querySelector('.dir-mono'), 'no portrait: the blank circle, never initials');
  assert.ok([...doc.querySelectorAll('a')].some(a => a.textContent === 'Their speeches'));
  assert.equal(doc.querySelectorAll('h4').length, 0, 'nobody sitting: no subheadings, and no "Sitting members (0)"');
  assert.doesNotMatch(doc.body.textContent, /\(0\)|Not available|not recorded/i);
  // A party with nobody in the record draws no Members block at all, and no state money draws nothing.
  assert.equal(partyMembersHTML('Nobody Party', partyMembers('Nobody Party', {roster, divisions}), helpers), '');
  assert.equal(partyStateMoneyHTML('Fixture First Party', [['qld', {nodes: [], edges: []}]], helpers), '');
});

test('state money on a party page names the commission and links the donors', () => {
  const data = {meta: {commission: 'Fixture Commission', sourceShort: 'FC'}, nodes: [{id: 'party:FF', kind: 'party', label: 'Fixture First Party', total: 500, count: 2, firstYear: 2024, lastYear: 2025}, {id: 'donor:d', kind: 'donor', label: 'Fixture & Co'}], edges: [{source: 'donor:d', target: 'party:FF', total: 500}]};
  const html = partyStateMoneyHTML('Fixture First Party', [['qld', data]], {...helpers, donorNameHTML: n => `<a href="/subject/donor/${encodeURIComponent(n)}">${esc(n)}</a>`});
  const doc = new JSDOM(html).window.document;
  assert.equal(doc.querySelector('section').id, 'party-state-money');
  assert.equal(doc.querySelector('.snippet a').getAttribute('href'), '/subject/donor/Fixture%20%26%20Co');
});

function renderEntry(path, selector) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./helpers/directory-shell.mjs', import.meta.url), {
      execArgv: ['--experimental-vm-modules', '--disable-warning=ExperimentalWarning'], workerData: {kind: 'party', path, selector, html: true, settleMs: 1500},
    });
    let result;
    worker.once('message', message => { result = message; });
    worker.once('error', reject);
    worker.once('exit', () => result?.error ? reject(Error(result.error)) : resolve(result));
  });
}

test('the real app renders a published one-member party outside the money map: its name, its member, no empty or filler sections', {timeout: 120_000}, async () => {
  const money = MONEY_GRAPHS.map(json);
  const onMap = new Set(money.flatMap(g => g.nodes.filter(n => n.kind === 'party').map(n => n.label)));
  const people = json('/parliamentarians.json'), recorded = json('/graph/party-members.json');
  const label = Object.keys(recorded.parties).sort().find(l => !onMap.has(l) && !/^[A-Z]{2,5}$/.test(l)
    && partyMembers(l, {roster: people, divisions: recorded}).former.length + partyMembers(l, {roster: people, divisions: recorded}).current.length === 1);
  assert.ok(label, 'the published data has a one-member party outside the money map');
  const result = await renderEntry(`/subject/party/${partySlug(label)}`, '#party-members li.dir-row');
  assert.deepEqual(result.errors, []);
  assert.equal(result.rows, 1);
  assert.equal(result.location, `/subject/party/${partySlug(label)}`);
  const doc = new JSDOM(result.html).window.document;
  assert.equal(doc.querySelector('#subject-title').textContent, label, 'the party name, not the address');
  assert.doesNotMatch(doc.body.textContent, /Outside the bounded money-map selection|Not available|Party not found/);
  for (const section of doc.querySelectorAll('#subject-sections > section')) {
    const heading = section.querySelector('h3')?.textContent || '';
    assert.ok(section.textContent.replace(heading, '').trim().length > 0, `empty section: ${section.id || heading}`);
  }
  assert.ok(doc.querySelector('a[href*="kind=speech"][href*="party="]'), 'a link to their speeches');
});
