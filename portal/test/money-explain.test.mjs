// /money/explain (public/money-explain.js): the address guard, the arithmetic,
// the words and the page, over invented fixtures, then over the served files.
// Every name below is invented; real-data checks derive their sets at run time.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import {shortMoney} from '../public/format.js';
import {
  parseExplainParams, explainPath, explainHrefFor, explainJurisdiction, resolveFlow, narrative, flowTitle,
  comparableFlows, federalThreshold, timelineRows, candidateBills, partyOnBill, billWordsFor, pageHTML,
  receiptTypeNote, mountMoneyExplain, pctText, fyLabel, yearPhrase, AGGREGATE_FLOOR,
} from '../public/money-explain.js';

/** A view reduced by the floor: total and count only, with no year, share, split or chart. */
function assertReduced(flow, index) {
  assert.equal(flow.coarse, true);
  assert.deepEqual([flow.dated.length, flow.years.size, flow.peak, flow.latest, flow.recipientShare, flow.parties.length, flow.industries.length],
    [0, 0, null, null, null, 0, 0]);
  const words = narrative(flow).join(' ');
  assert.ok(!/\d{4}–\d{2}/.test(words), 'no year in the words');
  assert.ok(!/went to/.test(words), 'no party split in the words');
  assert.match(words, /For a group of fewer than 5 donors this page gives the total and the count only\./);
  const html = pageHTML(flow, {index});
  assert.ok(!/mx-trend|mx-timeline|mx-share|Largest year|Years with money|By industry|went to/.test(html));
  assert.ok(!/no one donor|can’t be read|cannot be read/i.test(html), 'the floor is not presented as a safeguard');
}

// --- fixtures ---------------------------------------------------------------------
// An organisation (legal form), a union, a sector-tagged person the classifier
// withholds, and an already-anonymised node as the served files carry them.
const ORG = {id: 'donor:quarry example', label: 'Quarry Example Pty Ltd', kind: 'donor', industry: 'mining', group: 'mining & energy', total: 0};
const UNION = {id: 'donor:sample workers union', label: 'Sample Workers Union', kind: 'donor', industry: 'unions', group: 'unions'};
const UNION2 = {id: 'donor:other trades union', label: 'Other Trades Union', kind: 'donor', industry: 'unions', group: 'unions'};
const PERSON = {id: 'donor:wren halloway', label: 'Wren Halloway', kind: 'donor', industry: 'mining', group: 'mining & energy'};
const ANON = {id: 'donor:fixture-alex', label: 'EXAMPLE, ALEX', kind: 'donor', industry: 'individual', group: 'individuals', aliases: []};
const LABOR = {id: 'party:Labor', label: 'Labor', kind: 'party', byYear: {2018: [900000, 50], 2019: [800000, 40]}};
const LIBERAL = {id: 'party:Liberal', label: 'Liberal', kind: 'party', byYear: {2018: [700000, 30]}};
const edge = (source, target, byYear, undated) => {
  const cells = Object.values(byYear);
  return {source, target, byYear, ...(undated ? {undated} : {}),
    total: cells.reduce((s, c) => s + c[0], 0) + (undated?.[0] || 0), count: cells.reduce((s, c) => s + c[1], 0) + (undated?.[1] || 0),
    firstYear: Math.min(...Object.keys(byYear).map(Number)), lastYear: Math.max(...Object.keys(byYear).map(Number))};
};
const GRAPH = {
  meta: {generated: '2026-10-03', coverage: 'financial years 1998-99 to 2025-26'},
  nodes: [LABOR, LIBERAL, ORG, UNION, UNION2, PERSON, ANON, {id: 'grantor:grants', label: 'Grants', kind: 'grantor'}],
  edges: [
    edge(ORG.id, LABOR.id, {2018: [120000, 3], 2019: [30000, 1]}, [5000, 1]),
    edge(ORG.id, LIBERAL.id, {2018: [50000, 2]}),
    edge(UNION.id, LABOR.id, {2018: [200000, 10], 2019: [100000, 5]}),
    edge(UNION2.id, LABOR.id, {2019: [90000, 4]}),
    edge(PERSON.id, LABOR.id, {2019: [40000, 2]}),
    edge(ANON.id, LABOR.id, {2018: [25000, 1]}),
    edge(ANON.id, LIBERAL.id, {2018: [15000, 1]}),
    {source: 'grantor:grants', target: ORG.id, total: 9e6, count: 1, byYear: {2019: [9e6, 1]}, grant: true},
  ],
};
const INDEX = new Map();
const AEC = {meta: {latest_year: '2024-25'}, parties: {Labor: {returns: [['2018-19', 5000000, 0, 0, 9, 1000000, 2000000, null], ['2019-20', 4000000, 0, 0, 9, 800000, 1500000, null]]}}};
const PRIVATE_NAMES = [PERSON.label, 'Wren', 'Halloway'];

const parse = (query, graph = GRAPH) => parseExplainParams(new URLSearchParams(query), graph, INDEX);

// --- the address --------------------------------------------------------------------

test('a named organisation and a party resolve to IDs and one canonical address', () => {
  const p = parse(`from=${encodeURIComponent(ORG.id)}&to=party%3ALabor&utm_source=x&q=anything`);
  assert.equal(p.ok, true);
  assert.deepEqual(p.state, {jur: 'federal', to: 'party:Labor', from: ORG.id});
  assert.equal(explainPath(p.state), '/money/explain?from=donor%3Aquarry+example&to=party%3ALabor');
  assert.equal(explainPath({jur:'qld',to:'party:LNP'}),'/money/explain?jur=qld&to=party%3ALNP');
});

test('unknown IDs, repeated keys, mixed subjects and bad values fail closed without echoing the input', () => {
  const probe = 'donor:Marlow Fennick';
  for (const query of [`from=${encodeURIComponent(probe)}`, 'to=party%3ANope', 'industry=nope', 'donors=everyone', 'jur=nsw',
    'jur=constructor', `from=${encodeURIComponent(ORG.id)}&from=${encodeURIComponent(UNION.id)}`, 'to=party%3ALabor&to=party%3ALiberal',
    `from=${encodeURIComponent(ORG.id)}&industry=mining`, 'industry=mining&donors=unnamed', 'jur=federal&jur=qld']) {
    const p = parse(query);
    assert.equal(p.ok, false, query);
    assert.ok(!/marlow|fennick/i.test(p.error), query);
  }
  assert.equal(explainJurisdiction(new URLSearchParams('jur=qld')), 'qld');
  assert.equal(explainJurisdiction(new URLSearchParams('jur=wa')), null);
  assert.equal(parse('').empty, true);
});

// --- the arithmetic and the words ------------------------------------------------
test('a pair flow re-sums its year cells, finds its largest year and its two shares', () => {
  const flow = resolveFlow(parse(`from=${encodeURIComponent(ORG.id)}&to=party%3ALabor`).state, GRAPH, INDEX, {aec: AEC, electionYears: [2019]});
  assert.equal(flow.kind, 'pair');
  assert.equal(flow.total, 155000); assert.equal(flow.count, 5);
  assert.deepEqual(flow.undated, [5000, 1]);
  assert.deepEqual(flow.peak, {year: 2018, amount: 120000, count: 3});
  assert.equal(flow.firstYear, 2018); assert.equal(flow.lastYear, 2019);
  // Recipient share: the dated flow over the party's own return receipts for the same years.
  assert.deepEqual([flow.recipientShare.amount, flow.recipientShare.whole, flow.recipientShare.branches], [150000, 9000000, 9]);
  // Donor share: this party's part of the organisation's donations (grants never counted).
  assert.deepEqual([flow.donorShare.amount, flow.donorShare.whole, flow.donorShare.parties], [155000, 205000, 2]);
  const words = narrative(flow).join(' ');
  for (const figure of [shortMoney(155000), '5 receipts', '2018–19 to 2019–20', shortMoney(120000), '3 receipts', pctText(120000, 155000), '1 receipt', shortMoney(5000)]) assert.ok(words.includes(figure), figure);
  assert.match(words, /latest year with money is 2019–20 \(with the 2019 election returns\)/);
  assert.equal(flowTitle(flow), 'Quarry Example Pty Ltd → Labor');
  assert.match(receiptTypeNote(flow), /Other Receipt/);
});

test('federal thresholds and timeline rows follow the AEC table, election years marked', () => {
  assert.equal(federalThreshold(1999), '$1,500');
  assert.equal(federalThreshold(2005), '$1,500 to 7 December 2005, then more than $10,000');
  assert.equal(federalThreshold(2018), 'more than $13,800');
  assert.equal(federalThreshold(2024), 'more than $16,900');
  assert.match(federalThreshold(2026), /\$5,000 from 1 January 2027/);
  const flow = resolveFlow(parse(`from=${encodeURIComponent(ORG.id)}&to=party%3ALabor`).state, GRAPH, INDEX, {electionYears: [2019]});
  assert.deepEqual(timelineRows(flow).map((r) => [r.label, r.amount, r.election, r.threshold, r.lodged]), [
    ['2019–20', 30000, true, 'more than $14,000', 'Annual returns due by 20 Oct 2020'],
    ['2018–19', 120000, false, 'more than $13,800', 'Annual returns due by 20 Oct 2019'],
  ]);
  assert.equal(fyLabel(1999), '1999–00');
  assert.equal(yearPhrase(2022, 'qld', [2022]), '2022–23');
});

// --- parliament, for context ---------------------------------------------------------
const BILLS = {bills: [
  {key: 'au-federal-r1', title: 'Mining Royalties Amendment Bill 2019', jurisdiction: 'federal', divisions: 3},
  {key: 'au-federal-r2', title: 'Gasket Standards Bill 2019', jurisdiction: 'federal', divisions: 2},
  {key: 'au-federal-r3', title: 'Mining Levy Bill 2019', jurisdiction: 'federal', divisions: 0},
  {key: 'au-nsw-1', title: 'Mining Bill 2019', jurisdiction: 'nsw', divisions: 4},
]};
const BILL = {key: 'au-federal-r1', title: 'Mining Royalties Amendment Bill 2019', divisions: [
  {date: '2019-08-01', stage: 'Business motion', party_splits: {Labor: {ayes: 40, noes: 0}}, url: 'https://theyvoteforyou.org.au/divisions/x/1'},
  {date: '2019-09-01', stage: 'Second reading', outcome: 'affirmative', party_splits: {Labor: {ayes: 10, noes: 0}}, url: 'https://theyvoteforyou.org.au/divisions/x/2'},
  {date: '2019-10-01', stage: 'Third reading', outcome: 'affirmative', party_splits: {Labor: {ayes: 12, noes: 1}}, url: 'https://theyvoteforyou.org.au/divisions/x/3'},
  {date: '2031-10-01', stage: 'Third reading', outcome: 'negative', party_splits: {Labor: {ayes: 0, noes: 30}}, url: 'https://theyvoteforyou.org.au/divisions/x/4'},
], speeches: [{slug: 'speech-1', speaker: 'Member One', party: 'Labor', date: '2019-09-01'}, {slug: 'speech-2', speaker: 'Member Two', party: 'Liberal', date: '2019-09-01'}]};

test('bills match on whole title words, federal and divided only; procedural votes and other years are left out', () => {
  assert.deepEqual(billWordsFor('mining & energy'), ['mining', 'minerals resource rent tax', 'minerals exploration', 'coal', 'offshore petroleum', 'petroleum and other fuels']);
  assert.deepEqual(billWordsFor('legal'), []);
  assert.deepEqual(candidateBills(BILLS, 'mining').map((b) => b.key), ['au-federal-r1']);
  assert.deepEqual(candidateBills(BILLS, 'mining & energy').map((b) => b.key), ['au-federal-r1']);
  const row = partyOnBill(BILL, 'Labor', 2018, 2019);
  assert.equal(row.divisions, 2);
  assert.deepEqual(row.deciding, {date: '2019-10-01', stage: 'Third reading', ayes: 12, noes: 1, outcome: 'affirmative', url: 'https://theyvoteforyou.org.au/divisions/x/3'});
  assert.deepEqual(row.speeches, [{slug: 'speech-1', speaker: 'Member One', date: '2019-09-01'}]);
  assert.equal(partyOnBill(BILL, 'Greens', 2018, 2019), null);
  assert.equal(partyOnBill(BILL, 'Labor', 2001, 2005), null);
});

// --- the page in a document ------------------------------------------------------------
const ACCESS = {donors: {'Quarry Example Pty Ltd': {meetings_total: 3, lobbyists_total: 1}, 'EXAMPLE, ALEX': {meetings_total: 9}}};
const FITS = {meta: {source_url: 'https://foreigninfluence.ag.gov.au/'}, by_entity: {'quarry example': [{status: 'current'}]}};
const registerReads = [];
function mount(query, {wide = false, ...extra} = {}) {
  registerReads.length = 0;
  const dom = new JSDOM('<!doctype html><html><head></head><body><div id="root"></div></body></html>');
  if (wide) dom.window.matchMedia = (q) => ({matches: q === '(min-width: 701px)'});
  const root = dom.window.document.getElementById('root');
  const addresses = [], titles = [], fetched = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => { fetched.push(String(url)); throw new Error('no network in this test'); };
  let snapshotAtAddress = null;
  const handle = mountMoneyExplain(root, {
    params: new URLSearchParams(query), loadMoney: async () => GRAPH, loadDonorIndex: async () => INDEX,
    loadAecExtras: async () => AEC, electionYears: [2019],
    loadBillsIndex: async () => BILLS, loadBill: async (key) => (key === BILL.key ? BILL : null),
    loadAccess: async () => { registerReads.push('access'); return ACCESS; }, loadFits: async () => { registerReads.push('fits'); return FITS; },
    onAddress: (path) => { addresses.push(path); snapshotAtAddress ??= root.textContent; },
    onTitle: (t) => titles.push(t), ...extra,
  });
  return {dom, root, handle, addresses, titles, fetched, snapshot: () => snapshotAtAddress, restore: () => { globalThis.fetch = realFetch; }};
}

test('an unknown donor ID fails closed: the address drops it and the page does not repeat it', async () => {
  const m = mount('from=donor%3AMarlow%20Fennick&to=party%3ALabor');
  await m.handle.ready; m.restore();
  assert.deepEqual(m.addresses, ['/money/explain']);
  assert.match(m.root.textContent, /This flow can’t be explained/);
  assert.ok(!/marlow|fennick/i.test(m.root.innerHTML));
});

test('a named flow draws every section, the parliament context with its no-causation line, and calls no model', async () => {
  const m = mount(`from=${encodeURIComponent(ORG.id)}&to=party%3ALabor`, {partyName: (l) => (l === 'Labor' ? 'the Labor Party' : l)});
  await m.handle.ready; m.restore();
  const doc = m.dom.window.document;
  assert.deepEqual([...m.root.querySelectorAll('h2')].map((h) => h.textContent), [
    'What the record shows', 'Scale and context', 'Timeline', 'What the record does and doesn’t show', 'In parliament, for context', 'Keep going']);
  assert.equal(doc.querySelector('link[data-money-explain]')?.getAttribute('href').startsWith('/money-explain.css'), true);
  // The chart has a text alternative and a table fallback holding every year.
  const chart = m.root.querySelector('.mx-trend-chart');
  assert.equal(chart.getAttribute('role'), 'img');
  assert.ok(m.root.querySelector(`#${chart.getAttribute('aria-labelledby')}`).textContent.includes(shortMoney(120000)));
  assert.equal(m.root.querySelectorAll('.mx-table tbody tr').length, 2);
  const parliament = m.root.querySelector('#mx-parliament');
  assert.equal(parliament.hidden, false);
  assert.match(parliament.textContent, /These are listed for context\. A donation does not show that a vote or speech was influenced\./);
  assert.match(parliament.textContent, /Labor: 12 ayes, 1 no · Third reading agreed to · 1 Oct 2019/);
  assert.equal(parliament.querySelector('a[href="/doc/speech-1"]')?.textContent, 'Member One');
  assert.ok(!parliament.textContent.includes('Member Two'));
  // Every outside source opens the original; the share sentence names its basis.
  assert.match(m.root.textContent, /of the Labor Party’s total receipts on its own AEC returns for 2018–19 to 2019–20/);
  assert.ok(m.root.querySelector('a[href="https://www.aec.gov.au/Parties_and_Representatives/public_funding/threshold.htm"]'));
  assert.ok(m.root.querySelector('a[href="https://aec.gov.au/FADReform/faqs.htm"]'));
  assert.match(m.root.textContent, /Nothing here is written by a model\./);
  assert.match(m.root.textContent, /Quarry Example Pty Ltd matches 3 ministerial diary meetings, 1 registered lobbying firm, 1 Foreign Influence Transparency Scheme registration\. These are register matches, not evidence that a donation bought access\./);
  assert.ok(!m.root.querySelector('.ui-machine, .ui-machine-inline, .ui-machine-pill'), 'no machine-written prose to label');
  assert.deepEqual(m.fetched, []);
});

test('a flow whose industry has no title words gets no parliament section', async () => {
  const graph = structuredClone(GRAPH);
  graph.nodes.find((n) => n.id === ORG.id).industry = 'legal';
  const m = mount(`from=${encodeURIComponent(ORG.id)}&to=party%3ALabor`, {loadMoney: async () => graph});
  await m.handle.ready; m.restore();
  assert.equal(m.root.querySelector('#mx-parliament').hidden, true);
});

// --- the floor follows who is in the view (review P1) ------------------------------------
test('bill matching takes the industry’s own phrases and drops loose hits', () => {
  const titles = {
    property: ['Treasury Laws Amendment (Housing Measures No. 1) Bill 2023', 'Defence Housing Australia Amendment Bill 2025'],
    media: ['News Media Bargaining Charge Bill 2026', 'Online Safety Amendment (Social Media Minimum Age) Bill 2024', 'Australian Broadcasting Corporation Amendment (Fair and Balanced) Bill 2017'],
    finance: ['Major Bank Levy Bill 2017', 'Asian Infrastructure Investment Bank Bill 2015', 'Treasury Laws Amendment (Payday Superannuation) Bill 2025'],
    telecom: ['Telecommunications Amendment (Enhancing Consumer Safeguards) Bill 2025', 'Telecommunications (Interception and Access) Amendment Bill 2023'],
    fossil_fuels: ['Offshore Petroleum and Greenhouse Gas Storage Amendment Bill 2020', 'Gas Supply Assurance Bill 2026'],
    waste_management: ['Recycling and Waste Reduction Bill 2020', 'Asset Recycling Fund Bill 2014'],
  };
  for (const [key, [keep, ...drop]] of Object.entries(titles)) {
    const index = {bills: [keep, ...drop].map((title, i) => ({key: `k${i}`, title, jurisdiction: 'federal', divisions: 1}))};
    assert.deepEqual(candidateBills(index, key).map((b) => b.title), [keep], key);
  }
});

test('a federal year from 2026 says returns move to calendar years, not a 20 October date', () => {
  const graph = structuredClone(GRAPH);
  graph.edges.push(edge(UNION.id, LIBERAL.id, {2025: [1000, 1], 2026: [2000, 1]}));
  const flow = resolveFlow({jur: 'federal', from: UNION.id, to: 'party:Liberal'}, graph, INDEX, {});
  assert.deepEqual(timelineRows(flow).map((r) => [r.label, r.lodged]), [
    ['2026–27', 'Returns move to calendar years from 1 Jan 2027'], ['2025–26', 'Annual returns due by 20 Oct 2026']]);
});

test('the record notes show three and fold the rest, opened on wide screens', async () => {
  for (const wide of [false, true]) {
    const m = mount(`from=${encodeURIComponent(ORG.id)}&to=party%3ALabor`, {wide});
    await m.handle.ready; m.restore();
    const more = m.root.querySelector('.mx-limits-more');
    assert.equal(m.root.querySelectorAll('section[aria-labelledby="mx-limits-h"] > .mx-limits > li').length, 3);
    assert.match(more.querySelector('summary').textContent, /^\d+ more notes on this record$/);
    assert.equal(more.hasAttribute('open'), wide);
  }
});

// --- the served files ----------------------------------------------------------------------
const served = Object.fromEntries(['', '.qld', '.vic', '.tas'].map((s) => [s ? s.slice(1) : 'federal', JSON.parse(readFileSync(new URL(`../public/graph/money${s}.json`, import.meta.url)))]));
const servedIndex = new Map();
const servedAec = JSON.parse(readFileSync(new URL('../public/graph/aec-extras.json', import.meta.url)));

test('served files: the largest named federal flow reads back its own edge exactly', () => {
  const graph = served.federal;
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const e = graph.edges.filter((x) => !x.grant && !x.flow && byId.get(x.source)?.kind === 'donor')
    .filter(x=>parseExplainParams(new URLSearchParams({from:x.source,to:x.target}),graph,servedIndex).ok)
    .sort((a, b) => b.total - a.total)[0];
  const flow = resolveFlow({jur: 'federal', from: e.source, to: e.target}, graph, servedIndex, {aec: servedAec});
  assert.equal(flow.total, e.total); assert.equal(flow.count, e.count);
  const cells = Object.values(e.byYear);
  assert.equal(cells.reduce((s, c) => s + c[0], 0) + (e.undated?.[0] || 0), e.total);
  const words = narrative(flow).join(' ');
  assert.ok(words.includes(shortMoney(e.total)) && words.includes(`${e.count.toLocaleString('en-AU')} receipts`));
  assert.ok(flow.recipientShare === null || flow.recipientShare.amount <= flow.recipientShare.whole);
});
