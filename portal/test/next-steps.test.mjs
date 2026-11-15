// "Next in the record" (public/next-steps.js): every row is a fact the page's record holds and
// a real address; rows keep one height so a reserved row never moves the page; no row is model
// text or a ranking; and each template that draws the block draws it from its own record.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { build } from 'esbuild';
import {
  NEXT_STEPS_TITLE, NEXT_STEPS_MAX, nextStepRows, nextStepsHTML, fillNextSteps, docNextSteps, supplierNextSteps,
  recipientNextSteps, billNextSteps, memberNextSteps, memberVoteSteps, electorateNextSteps, vicDistrictNextSteps, seriesNextSteps,
} from '../public/next-steps.js';
import { profileHTML } from '../public/electorates.js';
import { safePath } from '../analytics/privacy.mjs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const json = (path) => JSON.parse(read(path));
const dom = (html) => new JSDOM(`<main>${html}</main>`).window.document;
const compile = async (entry) => {
  const r = await build({ entryPoints: [new URL(entry, import.meta.url).pathname], bundle: true, platform: 'browser', format: 'esm', write: false, external: ['node:*'], logLevel: 'error' });
  return import('data:text/javascript;base64,' + Buffer.from(r.outputFiles[0].text).toString('base64'));
};

test('a row needs a label, words and a site or http(s) address; one row per address; text is escaped', () => {
  const rows = nextStepRows([
    { kind: 'Member', href: '/subject/person/a', text: 'A <b>Person</b>', meta: 'Labor' },
    { kind: 'Member', href: '/subject/person/a', text: 'The same address again' },
    { kind: 'Member', href: 'javascript:alert(1)', text: 'Script' },
    { kind: 'Member', href: '//evil.example/x', text: 'Protocol-relative' },
    { kind: '', href: '/x', text: 'No label' }, { kind: 'Member', href: '/y', text: '' }, null,
    { kind: 'Source', href: 'https://example.org/a', text: 'An original' },
  ]);
  assert.deepEqual(rows.map((r) => r.href), ['/subject/person/a', 'https://example.org/a']);
  const html = nextStepsHTML(rows, { pageType: 'person', id: 'x' });
  assert.match(html, /A &lt;b&gt;Person&lt;\/b&gt;/);
  assert.doesNotMatch(html, /<b>Person/);
  assert.equal(nextStepsHTML([], { pageType: 'doc' }), '', 'nothing to say draws nothing');
});

test('the block is a labelled nav in the page body, counted by template word only, at most six rows', () => {
  const many = Array.from({ length: 9 }, (_, i) => ({ kind: 'Bill', href: `/bill/b${i}`, text: `Bill ${i}` }));
  const doc = dom(nextStepsHTML(many, { pageType: 'bill', id: 'bill-next' }));
  const nav = doc.querySelector('nav.next-steps');
  assert.equal(nav.getAttribute('aria-labelledby'), 'bill-next-title');
  assert.equal(doc.getElementById('bill-next-title').textContent, NEXT_STEPS_TITLE);
  assert.equal(doc.getElementById('bill-next-title').tagName, 'H2');
  assert.deepEqual([nav.dataset.module, nav.dataset.pageType, nav.dataset.modulePosition], ['next', 'bill', '1']);
  assert.equal(nav.querySelectorAll('li').length, NEXT_STEPS_MAX);
  assert.equal(nav.closest('header, footer'), null);
  for (const a of nav.querySelectorAll('a')) assert.equal(a.getAttribute('title'), a.textContent, 'a cut line keeps its whole text');
});

test('reserved rows hold the place of facts still loading, and filling them never changes the row count', () => {
  const html = nextStepsHTML(memberNextSteps({ seats: [{ name: 'Grayndler', href: '/subject/electorate/g', chamber: 'House of Representatives' }], party: { name: 'Labor', href: '/subject/party/labor' } }), { pageType: 'person', id: 'person-next', reserve: 2 });
  for (const votes of [
    [{ title: 'A Bill 2026', date: '2026-10-01', vote: 'Aye', href: '/doc/division-1' }, { title: 'B Bill 2026', date: '2026-11-02', vote: 'No', href: '/bill/au-federal-r1' }, { title: 'C Bill', date: '2026-09-01', vote: 'Aye', href: '/doc/division-3' }],
    [{ title: 'Only Bill 2026', date: '2026-10-01', vote: 'Aye', href: '/doc/division-1' }],
    [],
  ]) {
    const doc = dom(html), nav = doc.querySelector('nav');
    assert.equal(nav.getAttribute('aria-busy'), 'true');
    const before = nav.querySelectorAll('li').length;
    assert.equal(before, 4);
    assert.equal(nav.querySelectorAll('[data-next-pending]').length, 2);
    fillNextSteps(nav, memberVoteSteps(votes), 'No votes on bills in the record for this member.');
    assert.equal(nav.querySelectorAll('li').length, before, 'the block keeps every row it reserved');
    assert.equal(nav.querySelectorAll('[data-next-pending]').length, 0);
    assert.equal(nav.hasAttribute('aria-busy'), false);
    assert.equal(nav.querySelectorAll('a').length, 2 + Math.min(2, votes.length));
    for (const li of nav.querySelectorAll('li')) assert.equal(li.children.length, 3, 'every row has its three lines');
    if (!votes.length) assert.match(nav.textContent, /No votes on bills in the record for this member\./);
    // A second settle (the votes section's own exit) changes nothing.
    const settled = nav.innerHTML;
    fillNextSteps(nav, [], 'No votes on bills in the record for this member.');
    assert.equal(nav.innerHTML, settled);
  }
  // Newest first, by the division's own date; procedural questions and rows without a page are left out.
  const steps = memberVoteSteps([{ title: 'Old', date: '2020-01-01', vote: 'Aye', href: '/doc/division-old' }, { title: 'Closure', date: '2026-11-03', vote: 'No', href: '/doc/division-c', procedural: true },
    { title: 'New', date: '2026-11-02', vote: 'No', href: '/doc/division-new' }, { title: 'Search only', date: '2026-11-04', vote: 'No', href: '/ask?view=search&q=x' }]);
  assert.deepEqual(steps.map((s) => s.text), ['New', 'Old']);
  assert.equal(steps[0].meta, 'No · 2 Nov 2026');
});

test('the stylesheet gives every line of a row a fixed height and one line of text', () => {
  const css = read('../public/style.css');
  assert.match(css, /\.next-steps-row > \* \{[^}]*white-space: nowrap;[^}]*\}/);
  for (const part of ['kind', 'link', 'meta']) assert.match(css, new RegExp(`\\.next-steps-${part} \\{[^}]*height: [\\d.]+em;`), part);
});

test('a document leads to its speaker, their speeches and the same debate on the same day; never to an unattributed name', () => {
  const helpers = { personHref: (n) => `/subject/person/${n.toLowerCase().replace(/ /g, '-')}`, searchHref: (q, f, sort) => `/ask?${new URLSearchParams({ view: 'search', ...(q ? { q } : {}), ...f, sort })}`, subject: 'Housing Bill 2026' };
  const speech = { speaker: 'Jane Citizen', labels: { kind: 'speech', party: 'Labor', chamber: 'senate' }, metadata: { person_id: 12, date: '2026-10-14', electorate: 'Victoria' } };
  const rows = docNextSteps(speech, helpers);
  assert.deepEqual(rows.map((r) => r.kind), ['Speaker', 'Their speeches', 'Same debate']);
  assert.equal(rows[0].href, '/subject/person/jane-citizen');
  assert.equal(rows[0].meta, 'Labor · Victoria');
  const sameDay = new URL(rows[2].href, 'https://opax.com.au').searchParams;
  assert.deepEqual([sameDay.get('q'), sameDay.get('since'), sameDay.get('until')], ['"Housing Bill 2026"', '2026-10-14', '2026-10-14']);
  assert.equal(rows[2].meta, 'Speeches on 14 Oct 2026');
  for (const other of [{ ...speech, speaker_attribution: 'unattributed' }, { ...speech, labels: { ...speech.labels, speaker_type: 'witness' } }, { ...speech, metadata: { ...speech.metadata, person_id: null } }])
    assert.deepEqual(docNextSteps(other, helpers).map((r) => r.kind), ['Same debate']);
  assert.deepEqual(docNextSteps(speech, { ...helpers, attributed: false }).map((r) => r.kind), ['Same debate'], "the page's own attribution rule wins");
  const text = { title: 'Housing Bill 2026', labels: { kind: 'bill_text' }, metadata: { bill_key: 'au-federal-r7000', date: '2026-10-01' } };
  assert.deepEqual(docNextSteps(text, helpers).map((r) => [r.kind, r.href]), [['Bill', '/bill/au-federal-r7000']]);
  assert.deepEqual(docNextSteps({ labels: { kind: 'division' }, metadata: { date: '2026-10-01' } }, helpers), []);
});

test('a supplier leads to its agencies in recorded-value order and to suppliers under the same ABN only', () => {
  const profile = { id: 's1', name: 'Acme Pty Ltd', abn: '12 345 678 901', total: 300,
    agencies: [{ name: 'Small Agency', total: 100, count: 1 }, { name: 'Big Agency', total: 200, count: 2 }],
    contracts: [{ agency: 'Big Agency', amount: 150, title: 'Big thing', start_date: '2025-02-03' }, { agency: 'Small Agency', amount: 100, title: 'Desks', start_date: '2024-01-05' }, { agency: 'Nil Agency', amount: 0, start_date: '1900-01-01' }] };
  const suppliers = [{ id: 's1', name: 'Acme Pty Ltd', abn: '12345678901' }, { id: 's2', name: 'Acme Trading', abn: '12345678901', total: 50 }, { id: 's3', name: 'Other', abn: '99999999999' }, { id: 's4', name: 'No ABN' }];
  const rows = supplierNextSteps(profile, { agencyHref: (n) => `/subject/agency?q=${encodeURIComponent(n)}`, suppliers, contractTitle: (c) => c.title });
  assert.deepEqual(rows.map((r) => [r.kind, r.text]), [['Awarding agency', 'Big Agency'], ['Largest contract elsewhere', 'Small Agency'], ['Same ABN', 'Acme Trading'], ['All suppliers', 'Government suppliers']]);
  assert.equal(rows[0].meta, '$200 in 2 contracts with this supplier');
  assert.match(rows[1].meta, /^\$100 · Desks · 5 Jan 2024$/);
  assert.equal(rows[2].href, '/subject/supplier/s2');
  assert.deepEqual(supplierNextSteps({ id: 'x', name: 'No ABN', agencies: [], contracts: [] }, { suppliers }).map((r) => r.kind), ['All suppliers'], 'no ABN joins nobody');
});

test('a grant recipient leads to a program only where one catalogue program answers to the label', () => {
  const data = { programs: [['Shared Label', 500], ['Medical Research Future Fund', 400], ['Unlisted', 300]], agencies: [['Department of Health', 900]], other: { jur: 'qld', t: 1200, c: 3 } };
  const programs = [{ key: 'a', id: 'go1', n: 'Shared Label' }, { key: 'b', id: 'go2', n: 'Shared Label' }, { key: 'c', id: 'go3', n: 'Medical Research Future Fund' }];
  const rows = recipientNextSteps(data, { jurisdiction: 'federal', programs, money: (n) => `$${n}`, otherHref: (j) => `/money/grants/${j}/recipient/abn%3A1`, jurisdictionName: () => 'Queensland' });
  assert.deepEqual(rows.map((r) => [r.kind, r.text]), [['Program', 'Medical Research Future Fund'], ['Agency', 'Department of Health'], ['Other jurisdiction', 'Queensland records for this recipient'], ['All grants', 'Government grants']]);
  assert.equal(rows[0].href, '/money/grants?jur=federal&program=go3');
  assert.equal(rows[2].meta, '$1200 in 3 records');
});

test('a bill leads to its newest divisions, a known sponsor and the bills the register relates to it', () => {
  const divisions = [{ title: 'Second reading, 1 Oct 2026', date: '2026-10-01', chamber: 'Senate', ayes: '30', noes: '20', outcome: 'Agreed', href: '/doc/division-a' },
    { title: 'Third reading, 3 Oct 2026', date: '2026-10-03', chamber: 'Senate', ayes: '31', noes: '19', outcome: 'Agreed', href: '/doc/division-b' },
    { title: 'Source only', date: '2026-10-04', href: 'https://theyvoteforyou.org.au/x' }];
  const rows = billNextSteps({ related: [{ key: 'au-federal-r1', title: 'Earlier Bill 2025', relation: 'predecessor' }] }, { divisions, sponsor: { name: 'Jane Citizen', href: '/subject/person/jane-citizen', party: 'Labor' } });
  assert.deepEqual(rows.map((r) => [r.kind, r.href]), [['How members voted', '/doc/division-b'], ['How members voted', '/doc/division-a'], ['Sponsor', '/subject/person/jane-citizen'], ['Related bill', '/bill/au-federal-r1'], ['All bills', '/bills']]);
  assert.equal(rows[0].meta, 'Senate · Ayes 31, noes 19 · Agreed');
  assert.deepEqual(billNextSteps({}, {}).map((r) => r.kind), ['All bills']);
});

test('an electorate leads to its member and to a way of finding another seat; postcodes only where they are published', () => {
  const detail = { status: 'current', jurisdiction: 'federal', people: { p1: { name: 'JANE CITIZEN' } }, relations: [{ kind: 'within_upper_house', related: { slug: 'federal-senate-vic', name: 'Victoria' } }] };
  const helpers = { members: [{ person_id: 'p1', party: 'Labor' }], personHref: (p) => `/subject/person/${p.name}`, displayName: (n) => n.toLowerCase() };
  const rows = electorateNextSteps(detail, helpers);
  assert.deepEqual(rows.map((r) => r.kind), ['Member', 'Also represents you', 'Find your own MP']);
  assert.equal(rows[0].text, 'jane citizen');
  assert.equal(rows.at(-1).href, '/subject/electorate');
  assert.ok(!rows.some((r) => /postcode/i.test(r.text)), 'no postcode search is offered for a federal seat');
  const vic = electorateNextSteps({ ...detail, jurisdiction: 'vic' }, helpers);
  assert.deepEqual(vic.filter((r) => r.kind === 'Find your own MP').map((r) => r.href), ['/vic-election-2026#find', '/subject/electorate']);
  assert.equal(electorateNextSteps({ ...detail, status: 'historical' }, helpers)[0].kind, 'Last recorded member');
});

test('the electorate profile draws the block after the member and boundary, before the timeline', () => {
  const manifest = json('../public/electorates/manifest.json');
  const index = json(`../public${manifest.index_url}`);
  const entry = index.electorates.find((e) => e.jurisdiction === 'federal' && e.chamber === 'representatives' && e.representatives?.length === 1 && e.status !== 'historical');
  const detail = json(`../public${entry.detail_url}`);
  const html = profileHTML(detail);
  const doc = dom(html), nav = doc.getElementById('el-next');
  assert.ok(nav, 'the block is on the page');
  assert.equal(nav.dataset.pageType, 'electorate');
  const member = detail.people[detail.representatives[0].person_id] || detail.representatives[0].person;
  assert.ok([...nav.querySelectorAll('a')].some((a) => a.getAttribute('href').startsWith('/subject/person/')), `${member.name} is linked`);
  assert.ok(html.indexOf('id="el-next"') > html.indexOf('id="el-held"'));
  if (html.includes('id="el-elections"')) assert.ok(html.indexOf('id="el-next"') < html.indexOf('id="el-elections"'));
  assert.equal(doc.querySelectorAll('h1').length, 1);
});

test('a Victorian district page and a sitting week carry the block in the server page', async () => {
  const { renderVicElection } = await compile('../src/vic-election.ts');
  const data = json('../public/hubs/vic-election-2026.json');
  const seat = data.seats.find((s) => s.kind === 'district');
  const page = renderVicElection(data, seat, {}, new Date('2026-11-12T10:00:00+11:00'));
  const nav = dom(page.html).getElementById('vic-next');
  assert.ok(nav);
  const hrefs = [...nav.querySelectorAll('a')].map((a) => a.getAttribute('href'));
  assert.ok(hrefs.includes(seat.members[0].href) && hrefs.includes(seat.electorate_url) && hrefs.includes('/vic-election-2026#find'));
  assert.ok(page.html.indexOf('id="vic-next"') > page.html.indexOf('class="vic-facts"'));
  assert.match(page.html, /Authorised by Jake Tracey/, 'the authorisation line stays');
  const region = data.seats.find((s) => s.kind === 'region');
  assert.equal(dom(renderVicElection(data, region, {}, new Date('2026-11-12T10:00:00+11:00')).html).getElementById('vic-next'), null);

  const { renderSittingWeek } = await compile('../src/hubs.ts');
  const hubs = json('../public/hubs/index.json');
  const weeks = [...hubs.weeks].sort((a, b) => a.start.localeCompare(b.start));
  const week = weeks[1];
  const sitting = dom(renderSittingWeek(hubs, week, [], new Map(), '2026-11-16').html).getElementById('sitting-next');
  assert.deepEqual([...sitting.querySelectorAll('a')].map((a) => a.getAttribute('href')), [`/sitting/${weeks[2].start}`, `/sitting/${weeks[0].start}`, '/sitting']);
  assert.deepEqual(seriesNextSteps({}).length, 0);
});

test('the app draws the block on the document, bill and member pages, and waits on nothing new for it', () => {
  const app = read('../public/app.js');
  assert.match(app, /const nextStepsReady = lazyReady\(\(\) => import\("\/next-steps\.js"\)/);
  // Requested beside what each page already awaits, never before it.
  assert.match(app, /Promise\.all\(\[api\(`\/api\/resource\/\$\{encodeURIComponent\(slug\)\}`\), nextStepsReady\]\)/);
  assert.match(app, /Promise\.all\(\[growthModulesReady,voteTablesReady,nextStepsReady\]\)/);
  assert.match(app, /Promise\.allSettled\(\[growthModulesReady,voteTablesReady,nextStepsReady\]\)/);
  for (const [builder, pageType] of [['docNextSteps', 'doc'], ['billNextSteps', 'bill'], ['memberNextSteps', 'person']])
    assert.match(app, new RegExp(`nextSteps\\.${builder}\\([\\s\\S]{0,900}?pageType: "${pageType}"`), builder);
  assert.match(app, /reserve: 2/);
  assert.match(read('../public/index.html'), /<div id="doc-next" hidden><\/div>/);
  // The document's place is inside the panel body, between its head and its text.
  const shell = read('../public/index.html');
  assert.ok(shell.indexOf('id="doc-next"') > shell.indexOf('id="doc-actions"') && shell.indexOf('id="doc-next"') < shell.indexOf('id="doc-text"'));
});

test('no row is written with ranking or persuasive words, an em dash, or American spelling', () => {
  const source = read('../public/next-steps.js');
  const strings = [...source.matchAll(/(?:kind|text|meta): (?:'([^']*)'|`([^`]*)`)/g)].map((m) => m[1] ?? m[2]);
  assert.ok(strings.length > 25);
  for (const written of strings) {
    const s = written.replace(/\$\{[^}]*\}/g, ''); // the words, not the code inside a template
    assert.doesNotMatch(s, /—/, s);
    assert.doesNotMatch(s, /\b(?:top|best|worst|biggest|most important|key|must|should|controversial|popular|trending|recommended)\b/i, s);
    assert.doesNotMatch(s, /\b(?:center|organization|favor|color)\b/, s);
  }
});

test('money pages are counted by the four money views only; a typed second segment is /other', () => {
  for (const view of ['receipts', 'grants', 'contracts', 'explain']) assert.equal(safePath(`/money/${view}`), `/money/${view}`);
  assert.equal(safePath('/money/receipts/private-receipt'), '/money/receipts/[id]');
  assert.equal(safePath('/money/grants/federal/recipient/abn:1'), '/money/grants/[jurisdiction]/recipient/[id]');
  for (const path of ['/money/some-donor-name', '/money/jane-citizen', '/money/x/y']) assert.equal(safePath(path), '/other', path);
});
