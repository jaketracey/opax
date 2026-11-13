// A party that changed its name is one party: one page, one address, one directory and sitemap entry,
// with every record still labelled with the name it was made under (labels.js PARTY_RENAMES).
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {build} from 'esbuild';
import {Worker} from 'node:worker_threads';
import {JSDOM} from 'jsdom';
import {PARTY_RENAMES, PARTY_MAP, partyLabelHTML, partyShortName, partyNames, partyFormerName} from '../public/labels.js';
import {PARTY_URL_RENAMES, partyUrl} from '../public/canonical-urls.js';
import {canonicalPartyPages, resolvePartyPage, partyMembers, partyMembersHTML, partyBills, partyBillsHTML,
  partyHistory, partyHistoryHTML, recordedAsText, partyReturns, partyStateMoneyHTML, readPartyPages, partyLodgedAsText} from '../public/party-page.js';
import {partyReturnFigures, partyReturnScopeLabel} from '../public/register-tables.js';

const publicDir = new URL('../public/', import.meta.url);
const readJson = path => JSON.parse(readFileSync(new URL(path.replace(/^\//, ''), publicDir), 'utf8'));
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const tagText = html => html.split(/<[^>]*>/).join(' ').replace(/\s+/g, ' ');
const LDP = PARTY_RENAMES.find(r => r.code === 'LDP');

// An invented pair, so the rule is not tied to the one real rename.
const INVENTED = [{code: 'FIX', name: 'Fixture Freedom Party', since: '2030-03-01',
  former: [{name: 'Fixture Liberty Party', aliases: ['Fixture Liberty'], until: '2029-12-31'}],
  history: 'Fixture Liberty Party, renamed Fixture Freedom Party.', sources: [{label: 'Fixture register notice', href: 'https://example.org/notice'}]}];

test('the rename record: current name, former name with its end date, and the registers\' notices', () => {
  assert.ok(LDP);
  assert.equal(LDP.name, 'Libertarian Party');
  assert.equal(LDP.since, '2024-01-12');
  assert.deepEqual(LDP.former.map(f => [f.name, f.until]), [['Liberal Democratic Party', '2022-07-19']]);
  assert.ok(LDP.sources.length === 2 && LDP.sources.every(s => s.href.startsWith('https://www.aec.gov.au/')));
  assert.match(LDP.history, /^Liberal Democratic Party \(Liberal Democrats\), renamed Libertarian Party\./);
  assert.match(LDP.history, /19 July 2022/);
  assert.match(LDP.history, /12 January 2024/);
  assert.doesNotMatch(LDP.history, /[–—]/, 'no dashes in the copy');
  // canonical-urls.js keeps its own copy (it must not load the label tables): every name agrees.
  for (const f of LDP.former) for (const name of [f.name, ...(f.aliases || [])])
    assert.equal(PARTY_URL_RENAMES[name.toLowerCase()], LDP.name, name);
  for (const [name, current] of Object.entries(PARTY_URL_RENAMES)) assert.equal(PARTY_MAP[name]?.[1], PARTY_RENAMES.find(r => r.name === current).code, name);
});

test('one identity, but a record under the former name keeps that name wherever it is shown', () => {
  for (const name of ['Liberal Democratic Party', 'Liberal Democrats', 'Libertarian Party', 'Libertarian', 'Libertarian Party (formerly Liberal Democrats)'])
    assert.equal(PARTY_MAP[name.toLowerCase()]?.[1], 'LDP', name);
  assert.deepEqual(partyNames('Liberal Democratic Party'), ['Liberal Democratic Party', 'Liberal Democratic Party']);
  assert.equal(partyShortName('Liberal Democratic Party'), 'Liberal Democratic Party');
  assert.equal(partyShortName('Liberal Democrats'), 'Liberal Democrats');
  assert.equal(tagText(partyLabelHTML('Liberal Democratic Party')).trim(), 'Liberal Democratic Party');
  assert.doesNotMatch(partyLabelHTML('Liberal Democratic Party', {full: true}), /Libertarian/);
  // The current name and the VEC's registered name still read as the party's current name.
  assert.equal(partyShortName('Libertarian Party (formerly Liberal Democrats)'), 'Libertarian');
  assert.equal(partyShortName('Libertarian Party'), 'Libertarian');
  assert.equal(partyFormerName('Libertarian Party'), null);
  assert.equal(partyFormerName('liberal democrats')?.name, 'Liberal Democratic Party');
  // Not the Liberal Party.
  assert.notEqual(PARTY_MAP['liberal democratic party'][1], PARTY_MAP['liberal'][1]);
});

test('every name of a renamed party links to the one current address', () => {
  for (const name of ['Liberal Democratic Party', 'Liberal Democrats', 'Libertarian Party', 'Libertarian Party (formerly Liberal Democrats)'])
    assert.equal(partyUrl(name), '/subject/party/libertarian-party', name);
  assert.equal(partyUrl('Liberal'), '/subject/party/liberal');
  assert.equal(partyUrl('Fixture Liberty Party'), '/subject/party/fixture-liberty-party', 'a party not renamed keeps its own slug');
});

test('directory index: an invented renamed pair is one entry, with the former name as an alias carrying its date range', () => {
  const pages = canonicalPartyPages({
    roster: {meta: {generated: '2031-01-01'}, people: [{name: 'Alex Example', party: 'Fixture Freedom Party'}, {name: 'Sam Sample', party: 'Labor'}]},
    divisions: {parties: {'Fixture Liberty Party': [{name: 'Jo Fixture', divisions: 3, last: '2028-05-01'}]}, bills: {'Fixture Liberty': [{key: 'b1', title: 'A Bill', introduced: '2028-02-01'}]}},
    renames: INVENTED,
  });
  const fixture = pages.filter(p => /Fixture/.test(p.label));
  assert.equal(fixture.length, 1, 'one directory entry for the pair');
  const [page] = fixture;
  assert.equal(page.label, 'Fixture Freedom Party');
  assert.equal(page.href, '/subject/party/fixture-freedom-party');
  assert.equal(page.since, '2030-03-01');
  assert.deepEqual(page.formerNames, [{name: 'Fixture Liberty Party', until: '2029-12-31', recorded: ['Fixture Liberty Party', 'Fixture Liberty']}]);
  assert.deepEqual(page.aliases.sort(), ['Fixture Freedom Party', 'Fixture Liberty', 'Fixture Liberty Party']);
  assert.ok(page.roster && page.divisions && page.bills);
  for (const segment of ['fixture-liberty-party', 'Fixture Liberty Party', 'fixture-liberty', 'fixture-freedom-party'])
    assert.equal(resolvePartyPage(segment, pages)?.href, '/subject/party/fixture-freedom-party', segment);
  // A party whose current name alone is held still gets its current-name page.
  const only = canonicalPartyPages({divisions: {parties: {'Fixture Liberty Party': []}}, renames: INVENTED});
  assert.deepEqual(only.map(p => [p.label, p.href]), [['Fixture Freedom Party', '/subject/party/fixture-freedom-party']]);
});

test('directory index over the published data: one Libertarian Party entry, none for the Liberal Democratic Party', async () => {
  const pages = await readPartyPages(async path => readJson(path));
  const ldp = pages.filter(p => /libertarian|liberal democrat/i.test(p.aliases.join('|')));
  assert.equal(ldp.length, 1, ldp.map(p => p.label).join(', '));
  const [page] = ldp;
  assert.equal(page.label, 'Libertarian Party');
  assert.equal(page.href, '/subject/party/libertarian-party');
  assert.deepEqual(page.formerNames.map(f => [f.name, f.until]), [['Liberal Democratic Party', '2022-07-19']]);
  assert.ok(page.aliases.includes('Liberal Democratic Party'));
  assert.ok(!pages.some(p => p.href === '/subject/party/liberal-democratic-party'), 'no page at the old address');
  assert.ok(pages.some(p => p.href === '/subject/party/liberal'), 'the Liberal Party keeps its page');
  assert.equal(resolvePartyPage('liberal-democratic-party', pages)?.href, '/subject/party/libertarian-party');
  assert.equal(resolvePartyPage('liberal', pages)?.href, '/subject/party/liberal');
});

const helpers = {esc, photoUrlFor: () => '', personUrl: () => '/subject/person', partyChipHTML: l => `<span>${esc(l)}</span>`,
  yearSpan: (a, b) => a === b ? String(a) : `${a} to ${b}`, sourceLineHTML: () => '', same: (a, b) => PARTY_MAP[a.toLowerCase()]?.[1] === PARTY_MAP[b.toLowerCase()]?.[1],
  stateName: s => s, fmtMoney: n => `$${Math.round(n).toLocaleString('en-AU')}`, donorNameHTML: esc, moneyHref: j => `/money?jur=${j}`,
  jurisdictionLabel: j => j, notSummed: 'Not summed.'};

test('party page: the history line, and members, bills and votes under both names, each with the name it had', () => {
  const roster = readJson('/parliamentarians.json'), divisions = readJson('/graph/party-members.json');
  const members = partyMembers('Libertarian Party', {roster, divisions});
  const everyone = [...members.current, ...members.former];
  const byName = Object.fromEntries(everyone.map(m => [m.name, m]));
  // Under the former name (the division records) and under the current one (the roster and a seat roster).
  assert.deepEqual(byName['David Leyonhjelm'].labels, ['Liberal Democratic Party']);
  assert.deepEqual(byName['Duncan Spender'].labels, ['Liberal Democratic Party']);
  assert.deepEqual(byName['John Ruddick'].labels, ['Libertarian Party']);
  assert.deepEqual(byName['David Limbrick'].labels, ['Libertarian Party']);
  assert.ok(byName['David Leyonhjelm'].divisions > 1000);
  const html = tagText(partyMembersHTML('Libertarian Party', members, helpers));
  assert.match(html, /David Leyonhjelm .*Recorded as Liberal Democratic Party/);
  assert.doesNotMatch(html, /John Ruddick[^·]*Recorded as/, 'a member under the current name carries no note');
  // The same members from either name's page.
  assert.deepEqual(partyMembers('Liberal Democratic Party', {roster, divisions}).former.map(m => m.name).sort(), members.former.map(m => m.name).sort());
  const bills = partyBills('Libertarian Party', divisions);
  assert.ok(bills.length >= 10 && bills.every(b => b.party === 'Liberal Democratic Party'));
  assert.match(tagText(partyBillsHTML('Libertarian Party', bills, helpers)), /Sponsor recorded as Liberal Democratic Party/);
  // The name history, with both notices.
  const history = partyHistoryHTML('Liberal Democrats', helpers);
  assert.match(history, /id="party-history"/);
  assert.match(tagText(history), /Liberal Democratic Party \(Liberal Democrats\), renamed Libertarian Party/);
  assert.equal((history.match(/href="https:\/\/www\.aec\.gov\.au\//g) || []).length, 2);
  assert.equal(partyHistory('Labor'), null);
  assert.equal(partyHistoryHTML('Labor', helpers), '');
  assert.equal(recordedAsText('Labor', ['Australian Labor Party']), '', 'a party never renamed has no "recorded as"');
  assert.equal(recordedAsText('Libertarian Party', ['Libertarian Party']), '');
  assert.equal(recordedAsText('Libertarian Party', ['Liberal Democratic Party', 'Libertarian Party']), 'Recorded as Liberal Democratic Party');
});

test('money on the page: both names combined, saying which name each part was lodged under', () => {
  const returns = partyReturns('Libertarian Party', {
    'Liberal Democrats': {returns: [['2020-21', 100, 50, 0, 1, 20, 10, null], ['2021-22', 200, 60, 0, 1, 30, 10, null]]},
    'Libertarian Party': {returns: [['2023-24', 300, 70, 0, 1, 40, 10, null]]},
    Labor: {returns: [['2023-24', 9999, 1, 0, 1, 1, 1, null]]},
  });
  assert.deepEqual(returns.names, ['Liberal Democrats', 'Libertarian Party']);
  assert.deepEqual(returns.rows.map(r => [r[0], r[1]]), [['2020-21', 100], ['2021-22', 200], ['2023-24', 300]]);
  assert.equal(returns.note, 'Returns lodged as Liberal Democrats (2020-21 to 2021-22) and as Libertarian Party (2023-24), combined here.');
  assert.equal(partyReturns('Labor', {Labor: {returns: [['2023-24', 1]]}}).note, '', 'one name, no note');
  const state = partyStateMoneyHTML('Libertarian Party', [['vic', {meta: {jurisdictionLabel: 'Victoria'}, nodes: [
    {id: 'p1', kind: 'party', label: 'Liberal Democrats', total: 1000, count: 2, firstYear: 2019, lastYear: 2021},
    {id: 'p2', kind: 'party', label: 'Libertarian Party', total: 2000, count: 3, firstYear: 2024, lastYear: 2025},
    {id: 'd1', kind: 'donor', label: 'Fixture Donor Pty Ltd'}], edges: [{source: 'd1', target: 'p1', total: 500}, {source: 'd1', target: 'p2', total: 700}]}]], helpers);
  const text = tagText(state);
  assert.match(text, /\$3,000 across 5 disclosed gifts/);
  assert.match(text, /2019–2025/);
  assert.match(text, /Lodged as Liberal Democrats \$1,000; as Libertarian Party \$2,000/);
  assert.equal((state.match(/<li>/g) || []).length, 1, 'one row for the commission');
});

test('Ask: either name resolves to the one party; answers keep the labels the records carry', async () => {
  const bundle = async contents => {
    const built = await build({stdin: {contents, resolveDir: new URL('../', import.meta.url).pathname, loader: 'ts'}, bundle: true, write: false, platform: 'browser', format: 'esm'});
    return import('data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].text).toString('base64'));
  };
  const {searchPartyLabels, resolveDivisionParty, partyNamed, resolvedRankingScope} = await bundle(
    "export {searchPartyLabels} from './src/party-labels'; export {resolveDivisionParty} from './src/tools/division-aggregates'; export {partyNamed, resolvedRankingScope} from './src/research-ranking-scope.mjs';");
  for (const name of ['Liberal Democrats', 'Liberal Democratic Party', 'LDP', 'Libertarian Party', 'Libertarian', 'the Libertarians'])
    assert.deepEqual(searchPartyLabels(name), ['Libertarian Party', 'Liberal Democratic Party'], name);
  assert.deepEqual(searchPartyLabels('Liberal Party'), ['Liberal'], 'the Liberal Party is untouched');
  // Divisions: the tallies carry the name the party voted under, and the answer keeps it.
  const divisions = [{party_tallies: [{party: 'Labor', votes: {aye: 1}}, {party: 'Liberal Democratic Party', votes: {no: 1}}]}];
  assert.equal(resolveDivisionParty('Libertarian Party', divisions), 'Liberal Democratic Party');
  assert.equal(resolveDivisionParty('Liberal Democrats', divisions), 'Liberal Democratic Party');
  assert.equal(resolveDivisionParty('Libertarian', [{party_tallies: [{party: 'Libertarian Party', votes: {aye: 1}}]}]), 'Libertarian Party');
  assert.equal(resolveDivisionParty('Liberal Party', [{party_tallies: [{party: 'Liberal', votes: {aye: 1}}]}]), 'Liberal');
  // Answer scope: "Liberal Democrats" is not the Liberal Party.
  assert.equal(partyNamed('Who gave the most to the Liberal Democrats?'), 'Libertarian Party');
  assert.equal(partyNamed('Who gave the most to the Libertarian Party?'), 'Libertarian Party');
  assert.equal(partyNamed('Who gave the most to the Liberal Party?'), 'Liberal');
  assert.equal(partyNamed('Liberal Democratic Party'), 'Libertarian Party');
  assert.equal(resolvedRankingScope('Largest donors to the Liberal Democrats in 2019').party, 'Libertarian Party');
});

test('Worker: the old address answers once with a 301 to the current one, query kept; the page shows the history', async () => {
  const {loadWorker, offline} = await import('./worker-harness.mjs');
  const restore = offline();
  try {
    const worker = await loadWorker(new URL('../src/index.ts', import.meta.url).pathname, publicDir.pathname);
    for (const path of ['/subject/party/liberal-democratic-party?tab=members&x=1', '/subject/party/liberal-democrats?tab=members&x=1', '/party/liberal-democratic-party?tab=members&x=1']) {
      const moved = await worker.fetch(path, {redirect: 'manual'});
      assert.equal(moved.status, 301, path);
      assert.equal(moved.headers.get('location'), 'https://opax.com.au/subject/party/libertarian-party?tab=members&x=1', path);
      // One hop: the destination answers itself.
      const landed = await worker.fetch(new URL(moved.headers.get('location')).pathname + '?tab=members&x=1', {redirect: 'manual'});
      assert.equal(landed.status, 200, `${path} lands in one hop`);
    }
    const page = await worker.fetch('/subject/party/libertarian-party');
    assert.equal(page.status, 200);
    const html = await page.text();
    assert.match(html, /<link[^>]*rel="canonical"[^>]*href="https:\/\/opax\.com\.au\/subject\/party\/libertarian-party"/);
    assert.match(html, /Liberal Democratic Party \(Liberal Democrats\), renamed Libertarian Party\./);
    assert.match(html, /David Leyonhjelm<\/a> \(recorded as Liberal Democratic Party\)|David Leyonhjelm \(recorded as Liberal Democratic Party\)/);
    assert.match(html, /John Ruddick/);
    assert.match(html, /sponsor recorded as Liberal Democratic Party/);
    assert.doesNotMatch(tagText(html), /[—]/, 'no em dashes in the page copy');
  } finally { restore(); }
});

test('search catalog: one party entry for the renamed party, found by its former names', async () => {
  const {renamedPartyRecords} = await import('../../scripts/build_search_catalog.mjs');
  const records = renamedPartyRecords();
  const ldp = records.filter(r => r.key === 'party-rename:LDP');
  assert.equal(ldp.length, 1);
  assert.equal(ldp[0].title, 'Libertarian Party');
  assert.equal(ldp[0].href, '/subject/party/libertarian-party');
  assert.match(ldp[0].extra.aliases, /Liberal Democratic Party/);
  assert.match(ldp[0].extra.aliases, /Liberal Democrats/);
  const invented = renamedPartyRecords(INVENTED);
  assert.deepEqual(invented.map(r => [r.key, r.href, r.extra.aliases]), [['party-rename:FIX', '/subject/party/fixture-freedom-party', 'Fixture Liberty Party Fixture Liberty']]);
});

test('money map node: an invented renamed party\'s own-return total, said under each name it was lodged as', () => {
  const fmt = n => `$${Math.round(n).toLocaleString('en-AU')}`;
  const node = {label: 'Fixture Freedom Party', return_by_name: {
    'Fixture Freedom Party': [300, 1, '2023-24', '2023-24'], 'Fixture Liberty Party': [1050, 2, '2019-20', '2020-21']}};
  assert.equal(partyLodgedAsText(node, fmt), 'Fixture Liberty Party $1,050 in 2 receipts, 2019-20 to 2020-21; Fixture Freedom Party $300 in 1 receipt, 2023-24');
  assert.equal(partyLodgedAsText({return_by_name: {'Fixture Freedom Party': [300, 1, '2023-24', '2023-24']}}, fmt), '', 'one name, no line');
  assert.equal(partyLodgedAsText({label: 'Labor'}, fmt), '');
});

// The released money graph: one Libertarian Party node, its former names as aliases, its own returns under both.
const money = readJson('/graph/money.json');
const LIB = money.nodes.find(n => n.id === 'party:Libertarian Party');

test('money.json: one Libertarian Party node, answering to its former names, its own returns under both', () => {
  assert.ok(LIB, 'the party has a federal money node');
  assert.ok(!money.nodes.some(n => n.kind === 'party' && /liberal democrat/i.test(n.label)), 'no node under the former name');
  assert.deepEqual(LIB.aliases, ['Liberal Democratic Party', 'Liberal Democrats']);
  const own = partyReturnFigures(LIB);
  assert.equal(own.typed, true);
  assert.equal(Math.round(own.total), 2184694);
  assert.equal(own.count, 44);
  assert.deepEqual([own.firstYear, own.lastYear], [2013, 2024]);
  assert.deepEqual(LIB.return_by_name, {'Liberal Democratic Party': [1787862, 34, '2013-14', '2022-23'], 'Libertarian Party': [396832, 10, '2023-24', '2024-25']});
  assert.equal(Object.values(LIB.return_by_name).reduce((a, [d]) => a + d, 0), own.total, 'the names\' parts add to the headline');
  // The donor side is held back, so no donor total moved and no flow reaches the node.
  assert.deepEqual(money.meta.donor_side_held, ['Libertarian Party']);
  assert.ok(!money.edges.some(e => e.target === LIB.id));
  assert.ok(!money.nodes.some(n => n !== LIB && (n.return_by_name || (n.kind === 'party' && n.aliases))), 'no other node carries the new fields');
  for (const jur of ['qld', 'vic']) {
    const state = readJson(`/graph/money.${jur}.json`);
    const node = state.nodes.find(n => n.id === 'party:Libertarian Party');
    assert.ok(node && node.total > 0, jur);
    assert.ok(!state.edges.some(e => e.target === node.id), `${jur}: no flow while the donor side is held`);
  }
});

function renderParty(path) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./helpers/directory-shell.mjs', import.meta.url), {
      execArgv: ['--experimental-vm-modules', '--disable-warning=ExperimentalWarning'],
      workerData: {kind: 'party', path, selector: '#entry-flows', html: true, settleMs: 1500},
    });
    let result;
    worker.once('message', message => { result = message; });
    worker.once('error', reject);
    worker.once('exit', () => result?.error ? reject(Error(result.error)) : resolve(result));
  });
}

test('the merged Libertarian Party page shows its money: the headline, the scope line and each name\'s part', {timeout: 120_000}, async () => {
  const result = await renderParty('/subject/party/libertarian-party');
  // JSDOM has no canvas, so the page's map cannot draw; nothing else may fail.
  assert.deepEqual(result.errors.filter(e => !/getContext\(\) method/.test(e)), []);
  const doc = new JSDOM(result.html).window.document;
  assert.equal(doc.querySelector('#subject-title').textContent.trim(), 'Libertarian Party');
  const flows = doc.querySelector('#entry-flows');
  assert.ok(flows, 'a money section');
  assert.equal(flows.getAttribute('data-rail-figure'), '$2.2m');
  const text = flows.textContent.replace(/\s+/g, ' ');
  assert.match(text, /Received \(disclosed\)\s*\$2\.2m/);
  assert.match(text, /Receipts counted\s*44/);
  const scope = partyReturnScopeLabel(partyReturnFigures(LIB));
  assert.ok(scope.startsWith('Itemised receipts in the party\'s own federal returns, 2013-14 to 2024-25, each counted once.'));
  assert.ok(text.replace(/Measured as\s*/, 'Measured as ').includes(`Measured as ${scope}`), 'the standard scope line');
  assert.match(text, /Lodged as\s*Liberal Democratic Party \$1\.8m in 34 receipts, 2013-14 to 2022-23; Libertarian Party \S+ in 10 receipts, 2023-24 to 2024-25/);
  assert.match(text, /The money map draws no donor to this party/);
  // The name history stays on the page now that it takes the money path.
  assert.match(doc.querySelector('.party-history')?.textContent || '', /renamed Libertarian Party\. The AEC deregistered the Liberal Democratic Party on 19 July 2022/);
  assert.doesNotMatch(text, /—/, 'no em dashes');
});
