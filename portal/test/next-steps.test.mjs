// "Next in the record" (public/next-steps.js): every row is a fact the page's record holds and
// a real address; rows keep one height so a reserved row never moves the page; no row is model
// text or a ranking; and each template that draws the block draws it from its own record.
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { build } from 'esbuild';
import {
  NEXT_STEPS_TITLE, NEXT_STEPS_MAX, nextStepRows, nextStepsHTML, fillNextSteps, docNextSteps, supplierNextSteps,
  recipientNextSteps, billNextSteps, memberNextSteps, memberVoteSteps, electorateNextSteps, vicDistrictNextSteps, seriesNextSteps,
} from '../public/next-steps.js';
import { profileHTML, nextStepsReady, nextStepsMembers } from '../public/electorates.js';
await nextStepsReady;
import { safePath } from '../analytics/privacy.mjs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const json = (path) => JSON.parse(read(path));
const dom = (html) => new JSDOM(`<main>${html}</main>`).window.document;
const blockKinds = (html) => [...dom(html).querySelectorAll('#el-next .next-steps-kind')].map((k) => k.textContent);
const blockPeople = (html) => [...dom(html).querySelectorAll('#el-next a')].filter((a) => a.getAttribute('href').startsWith('/subject/person/')).length;
const compile = async (entry) => {
  const r = await build({ entryPoints: [new URL(entry, import.meta.url).pathname], bundle: true, platform: 'browser', format: 'esm', write: false, external: ['node:*'], logLevel: 'error' });
  return import('data:text/javascript;base64,' + Buffer.from(r.outputFiles[0].text).toString('base64'));
};

test('a row drawn with its fact is drawn as it is: only a reserved place is held to two lines', () => {
  const items = [
    { kind: 'Electorate', href: '/subject/electorate/a', text: 'A seat', meta: 'House of Representatives' },
    { kind: 'Party', href: '/subject/party/b', text: 'A party', meta: 'Members and disclosed receipts' },
    { kind: 'All bills', href: '/bills', text: 'Bills before the parliaments', meta: 'Search by title, status and sponsor' },
  ];
  const drawn = [...dom(nextStepsHTML(items)).querySelectorAll('li')];
  assert.equal(drawn.length, 3);
  // Array.map passes each row's index: rows after the first used to arrive as held.
  for (const li of drawn) assert.equal(li.classList.contains('next-steps-held'), false, 'a known row keeps its natural height');
  const reserved = [...dom(nextStepsHTML(items.slice(0, 2), { reserve: 2 })).querySelectorAll('li')];
  assert.deepEqual(reserved.map((li) => li.classList.contains('next-steps-held')), [false, false, true, true]);
});

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
    for (const li of [...nav.querySelectorAll('li')].slice(2)) assert.ok(li.classList.contains('next-steps-held'), 'a held row keeps its reserved room once filled');
    if (!votes.length) assert.match(nav.textContent, /No votes on bills in the record for this member\./);
    if (!votes.length) assert.equal(nav.querySelector('.next-steps-spare .next-steps-link').textContent, 'No votes on bills in the record for this member.', 'the sentence sits where two lines are held');
    for (const a of nav.querySelectorAll('.next-steps-held a')) assert.equal(a.getAttribute('title'), a.textContent, 'a title drawn on two lines keeps its whole text');
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

test('the stylesheet wraps every line; only a held row is fixed, with its link on at most two lines', () => {
  const css = read('../public/style.css');
  const rules = css.slice(css.indexOf('/* "Next in the record"'), css.indexOf('.growth-ask :is(input, textarea, button)'));
  assert.ok(rules.length > 500);
  const open = rules.split('\n').filter((line) => /^\.next-steps/.test(line) && !/next-steps-held|next-steps-spare/.test(line)).join('\n');
  assert.doesNotMatch(open, /nowrap|text-overflow|line-clamp|overflow: hidden|[^-]height: [\d.]+em/, 'ordinary rows wrap and are never cut');
  assert.match(rules, /\.next-steps-row > \* \{[^}]*overflow-wrap: anywhere/);
  // A held row has one fixed height before and after it is filled: 1.45em + 3.1em + 1.45em.
  assert.match(rules, /\.next-steps-held \.next-steps-kind, \.next-steps-held \.next-steps-meta \{ height: 1\.45em; overflow: hidden;/);
  assert.match(rules, /\.next-steps-held \.next-steps-link \{[^}]*-webkit-line-clamp: 2;[^}]*overflow: hidden; height: 3\.1em; \}/);
  assert.doesNotMatch(rules, /\.next-steps-held[^{]*\{[^}]*min-height: (?!0)/, 'no held line can grow');
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

test('a supplier leads to its agencies and to suppliers under the same ABN only; another contract is chosen by most recent start', () => {
  const profile = { id: 's1', name: 'Acme Pty Ltd', abn: '12 345 678 901', total: 300,
    agencies: [{ name: 'Small Agency', total: 100, count: 1 }, { name: 'Big Agency', total: 200, count: 2 }, { name: 'Old Agency', total: 900, count: 1 }],
    contracts: [{ agency: 'Big Agency', amount: 150, title: 'Big thing', start_date: '2025-02-03' }, { agency: 'Old Agency', amount: 900, title: 'Old and large', start_date: '2019-03-01' },
      { agency: 'Small Agency', amount: 100, title: 'Desks', start_date: '2024-01-05' }, { agency: 'Small Agency', amount: 500, title: 'Earlier desks', start_date: '2021-01-05' },
      { agency: 'Undated Agency', amount: 700, title: 'No date', start_date: '1900-01-01' }, { agency: 'Nil Agency', amount: 0, start_date: '2026-01-01' }] };
  const suppliers = [{ id: 's1', name: 'Acme Pty Ltd', abn: '12345678901' }, { id: 's2', name: 'Acme Trading', abn: '12345678901', total: 50 }, { id: 's3', name: 'Other', abn: '99999999999' }, { id: 's4', name: 'No ABN' }];
  const rows = supplierNextSteps(profile, { agencyHref: (n) => `/subject/agency?q=${encodeURIComponent(n)}`, suppliers, contractTitle: (c) => c.title });
  assert.deepEqual(rows.map((r) => [r.kind, r.text]), [['Awarding agency', 'Old Agency'], ['Another contract', 'Big thing'], ['Another contract', 'Desks'], ['Same ABN', 'Acme Trading'], ['All suppliers', 'Government suppliers']]);
  assert.equal(rows[0].meta, '$900 in 1 contract with this supplier');
  // Most recent start date first, one per agency, whatever the amounts; undated and $0 rows are not offered.
  assert.equal(rows[1].meta, '$150 · Big Agency · started 3 Feb 2025');
  assert.equal(rows[2].meta, '$100 · Small Agency · started 5 Jan 2024');
  assert.equal(rows[3].href, '/subject/supplier/s2');
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

test('a recipient page carries the block in the server record core, above its awards list, and not on a program page', async () => {
  const { grantCoreBody } = await import('../src/seo-record-content.ts');
  const detail = { id: 'abn:12345678901', n: 'Example Institute', k: 'company', t: 900, c: 2, programs: [['Medical Research Future Fund', 400]], agencies: [['Department of Health', 900]],
    grants: [{ id: 'GA1', v: 500, n: 'First', pr: 'Medical Research Future Fund' }, { id: 'GA2', v: 400, n: 'Second' }] };
  const html = grantCoreBody(detail, 'federal', 'https://opax.com.au/money/grants/federal/recipient/abn%3A12345678901', false, undefined, undefined, [{ key: 'c', id: 'go3', n: 'Medical Research Future Fund' }]);
  const nav = dom(html).getElementById('recipient-next');
  assert.deepEqual([...nav.querySelectorAll('.next-steps-kind')].map((k) => k.textContent), ['Program', 'Agency', 'All grants']);
  assert.ok(html.indexOf('id="recipient-next"') > html.indexOf('record-core-figures') && html.indexOf('id="recipient-next"') < html.indexOf('<table'));
  assert.doesNotMatch(grantCoreBody({ ...detail, r: 3 }, 'federal', 'https://opax.com.au/money/grants?jur=federal&program=go3', true), /next-steps/);
  // The page's own script leaves the server's block alone and draws its own only without a record core.
  assert.match(read('../public/grant-recipient.js'), /if \(!coreActive && nextSteps\) root\.insertAdjacentHTML\('beforeend', nextSteps\.nextStepsHTML\(nextSteps\.recipientNextSteps/);
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
  // Where the page cannot say who represents the seat today, nobody is named and no seat "represents you".
  const idle = electorateNextSteps({ ...detail, relations: [...detail.relations, { kind: 'adjacent', related: { slug: 'x', name: 'Elsewhere' } }] }, { ...helpers, sitting: false });
  assert.deepEqual(idle.map((r) => r.kind), ['Related electorate', 'Find your own MP']);
});

test('the electorate profile names a member only of today: not at a past date or for a dissolved house', () => {
  const manifest = json('../public/electorates/manifest.json');
  const index = json(`../public${manifest.index_url}`);
  const federal = json(`../public${index.electorates.find((e) => e.jurisdiction === 'federal' && e.chamber === 'representatives' && e.representatives?.length === 1 && e.status !== 'historical').detail_url}`);
  assert.equal(blockPeople(profileHTML(federal)), 1);
  assert.ok(blockKinds(profileHTML(federal)).includes('Member'));
  assert.equal(blockPeople(profileHTML(federal, '2026-09-04')), 0, 'a past date names nobody in the block');
  assert.ok(!blockKinds(profileHTML(federal, '2026-09-04')).some((k) => /Member|represents/.test(k)));
  assert.equal(blockPeople(profileHTML({ ...federal, dissolved_for: '2027-05-01' })), 0, 'a dissolved house names nobody');
  assert.deepEqual(nextStepsMembers(federal, '', federal.representatives), federal.representatives, 'outside Victoria the roster stands');
});

test('a Victorian electorate names a member only when that member\'s own service is recorded from after the 2026 poll, in either house', () => {
  const manifest = json('../public/electorates/manifest.json');
  const index = json(`../public${manifest.index_url}`);
  const silent = (html, why) => {
    assert.equal(blockPeople(html), 0, why);
    assert.ok(!blockKinds(html).some((k) => /Member|represents/.test(k)), why);
    assert.ok(blockKinds(html).includes('Find your own MP'), why);
  };
  for (const chamber of ['vic_la', 'vic_lc']) {
    const row = index.electorates.find((e) => e.chamber === chamber && e.representatives?.length);
    const detail = json(`../public${row.detail_url}`);
    assert.ok(detail.representation_as_of < '2026-11-28', 'the published roster is the old parliament\'s');
    // The old roster, as published today (the Council carries no dissolved_for at all).
    silent(profileHTML(detail), `${chamber}: old roster`);
    // The rule reads the record, not the clock: the same old roster is silent before and after 6 pm on 28 November.
    for (const now of ['2026-11-28T17:59:59+11:00', '2026-11-28T18:00:00+11:00', '2026-12-20T09:00:00+11:00']) {
      mock.timers.enable({ apis: ['Date'], now: Date.parse(now) });
      try { silent(profileHTML(detail), `${chamber}: old roster at ${now}`); silent(profileHTML({ ...detail, dissolved_for: null }), `${chamber}: dissolved_for cleared, old roster, at ${now}`); }
      finally { mock.timers.reset(); }
    }
    // A roster dated on polling day itself is still the old parliament's; unverified or historical records never name anyone.
    // A refresh dated 5 December that still returns the outgoing members names nobody: a fetch date is not a term date.
    const refreshed = { ...detail, dissolved_for: null, representation_as_of: '2026-12-05', rosters: detail.rosters.map((r) => ({ ...r, as_of: '2026-12-05' })) };
    silent(profileHTML(refreshed), `${chamber}: 5 December refresh, outgoing members`);
    // Nor does one whose members' recorded service began before, or on, polling day.
    const term = (m, start, extra = {}) => ({ person_id: m.person_id, start, start_precision: 'day', end: null, end_precision: 'open', party_periods: [], ...extra });
    const reps = detail.representatives;
    silent(profileHTML({ ...refreshed, terms: reps.map((m) => term(m, '2022-11-26')) }), `${chamber}: service from 2022`);
    silent(profileHTML({ ...refreshed, terms: reps.map((m) => term(m, '2026-11-28')) }), `${chamber}: service dated polling day`);
    silent(profileHTML({ ...refreshed, representatives: reps.map((m) => ({ ...m, seated_on: '2026-09-01' })) }), `${chamber}: seated before the poll`);
    silent(profileHTML({ ...refreshed, terms: reps.map((m) => term(m, '2026-12-15', { start_precision: 'year' })) }), `${chamber}: an undated start proves nothing`);
    silent(profileHTML({ ...refreshed, terms: reps.map((m) => term(m, '2026-12-15', { end: '2026-12-20', end_precision: 'day' })) }), `${chamber}: an ended term is not current`);
    // An old open term beside a new one still holds the member back: service that began before the poll is never named.
    silent(profileHTML({ ...refreshed, terms: reps.flatMap((m) => [term(m, '2022-11-26'), term(m, '2026-12-15')]) }), `${chamber}: old and new open terms`);
    // The new parliament: each member's own service is recorded from after polling day (a term start, or a reviewed seated_on).
    for (const fresh of [{ ...refreshed, terms: reps.map((m) => term(m, '2026-12-15')) }, { ...refreshed, representatives: reps.map((m) => ({ ...m, seated_on: '2026-12-15' })) }]) {
      const html = profileHTML(fresh);
      assert.equal(blockPeople(html), Math.min(3, reps.length), `${chamber}: new parliament`);
      assert.ok(blockKinds(html).includes('Member'));
      silent(profileHTML({ ...fresh, dissolved_for: '2026-11-28' }), `${chamber}: still published as dissolved`);
      silent(profileHTML({ ...fresh, representation_status: 'partial' }), `${chamber}: unverified`);
      silent(profileHTML(fresh, '2026-12-16'), `${chamber}: a past date`);
    }
    // Member by member: only the one whose service is recorded from after the poll is named.
    if (reps.length > 1) {
      const mixed = profileHTML({ ...refreshed, terms: [term(reps[0], '2026-12-15'), term(reps[1], '2022-11-26')] });
      assert.equal(blockPeople(mixed), 1, `${chamber}: one new member among the old`);
    }
  }
});

test('the electorate profile draws the block after the member and boundary, before the timeline', () => {
  const manifest = json('../public/electorates/manifest.json');
  const index = json(`../public${manifest.index_url}`);
  const entry = index.electorates.find((e) => e.jurisdiction === 'federal' && e.chamber === 'representatives' && e.representatives?.length === 1 && e.status !== 'historical');
  const html = profileHTML(json(`../public${entry.detail_url}`));
  const doc = dom(html), nav = doc.getElementById('el-next');
  assert.ok(nav, 'the block is on the page');
  assert.equal(nav.dataset.pageType, 'electorate');
  assert.ok(html.indexOf('id="el-next"') > html.indexOf('id="el-held"'));
  if (html.includes('id="el-elections"')) assert.ok(html.indexOf('id="el-next"') < html.indexOf('id="el-elections"'));
  assert.equal(doc.querySelectorAll('h1').length, 1);
});

test('a Victorian district page names no person, party or vote in the block until polls close at 6 pm on 28 November 2026', async () => {
  const { renderVicElection } = await compile('../src/vic-election.ts');
  const data = json('../public/hubs/vic-election-2026.json');
  const seats = data.seats.filter((s) => s.kind === 'district');
  const parties = [...new Set(data.seats.flatMap((s) => [...s.members.map((m) => m.party), ...(s.candidates?.list || []).map((c) => c.party), s.result?.general.party, s.result?.general.against]).filter(Boolean))];
  const names = [...new Set(data.seats.flatMap((s) => [...s.members.map((m) => m.name), ...(s.candidates?.list || []).map((c) => c.name)]))];
  assert.ok(parties.length > 3 && names.length > 100);
  const block = (seat, now) => dom(renderVicElection(data, seat, {}, new Date(now)).html).getElementById('vic-next');
  const BEFORE = '2026-11-28T17:59:59+11:00', AFTER = '2026-11-28T18:00:00+11:00';
  for (const seat of seats) {
    for (const now of ['2026-11-16T09:00:00+11:00', BEFORE]) {
      const nav = block(seat, now);
      assert.deepEqual([...nav.querySelectorAll('.next-steps-kind')].map((k) => k.textContent),
        [...(seat.result ? ['Previous result'] : []), 'Voting', 'Upper house region', 'Districts', 'Another seat'], seat.name);
      const words = nav.textContent;
      for (const name of names) assert.ok(!words.includes(name), `${seat.name}: no person is named (${name})`);
      for (const party of parties) assert.ok(!new RegExp(`\\b${party.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}\\b`).test(words) || seat.name.includes(party) || party.length < 4, `${seat.name}: no party is named (${party})`);
      assert.doesNotMatch(words, /\bmembers?\b|\bvotes?\b|\bvoted\b|\bMP\b|candidate/i, seat.name);
      for (const a of nav.querySelectorAll('a')) assert.doesNotMatch(a.getAttribute('href'), /^\/subject\/(?:person|party)\//, 'no link to a person or a party');
    }
  }
  const seat = seats.find((s) => s.result), region = data.seats.find((r) => r.kind === 'region' && r.name === seat.region);
  const early = block(seat, BEFORE), late = block(seat, AFTER);
  const hrefs = (nav) => [...nav.querySelectorAll('a')].map((a) => a.getAttribute('href'));
  assert.deepEqual(hrefs(early), [seat.result.general.url, '#voting', region.path, '/vic-election-2026#districts', '/vic-election-2026#find']);
  // After the close: the standing electorate record; still no roster member by name, and no count of the old roster's members.
  assert.deepEqual([...late.querySelectorAll('.next-steps-kind')].map((k) => k.textContent), ['Previous result', 'Electorate record', 'Upper house region', 'Districts', 'Another seat']);
  assert.ok(hrefs(late).includes(seat.electorate_url) && !hrefs(late).includes('#voting') && !hrefs(late).includes(seat.members[0].href));
  assert.ok(!late.textContent.includes(seat.members[0].name));
  assert.ok(region.roster_date < '2026-11-28', 'the published roster is the old parliament\'s');
  for (const nav of [late, block(seat, '2026-12-20T09:00:00+11:00')]) {
    assert.doesNotMatch(nav.textContent, /\bmembers?\b/i, 'the old roster is not counted after the close');
    assert.match(nav.textContent, /11 districts/);
  }
  // Members are never counted, whatever the roster's date says: it is a fetch date, not a term date.
  const meta = (r, options) => vicDistrictNextSteps(seat, r, options).find((row) => row.kind === 'Upper house region').meta;
  for (const roster_date of ['2026-09-09', '2026-12-05', '2027-02-01']) for (const closed of [false, true]) assert.equal(meta({ ...region, roster_date }, { closed }), '11 districts');
  assert.deepEqual(vicDistrictNextSteps(seat, region).map((r) => r.kind), vicDistrictNextSteps(seat, region, { closed: false }).map((r) => r.kind), 'the neutral block is the default');
  const page = renderVicElection(data, seat, {}, new Date(BEFORE));
  assert.ok(page.html.indexOf('id="vic-next"') > page.html.indexOf('class="vic-facts"'));
  assert.match(page.html, /Authorised by Jake Tracey/, 'the authorisation line stays');
  assert.match(page.html, /id="voting"/, 'the voting link has its section');
  assert.equal(dom(renderVicElection(data, data.seats.find((s) => s.kind === 'region'), {}, new Date(BEFORE)).html).getElementById('vic-next'), null, 'region pages carry no block');
});

test('a sitting week carries the weeks either side in the server page', async () => {
  const { renderSittingWeek } = await compile('../src/hubs.ts');
  const hubs = json('../public/hubs/index.json');
  const weeks = [...hubs.weeks].sort((a, b) => a.start.localeCompare(b.start));
  const week = weeks[1];
  const sitting = dom(renderSittingWeek(hubs, week, [], new Map(), '2026-11-16').html).getElementById('sitting-next');
  assert.deepEqual([...sitting.querySelectorAll('a')].map((a) => a.getAttribute('href')), [`/sitting/${weeks[2].start}`, `/sitting/${weeks[0].start}`, '/sitting']);
  assert.deepEqual(seriesNextSteps({}).length, 0);
});

test('no page script needs the module to run: it is asked for at load and a failed load leaves the page whole', () => {
  for (const file of ['suppliers.js', 'electorates.js', 'grant-recipient.js', 'record-core-content.js', 'record-core.js', 'app.js']) {
    const source = read(`../public/${file}`);
    assert.doesNotMatch(source, /^import [^;]*next-steps\.js/m, `${file} has no static import of next-steps.js`);
    if (/next-steps\.js/.test(source)) assert.match(source, /import\(["']\.?\/next-steps\.js["']\)\.then\(\(?module\)? => \{ nextSteps = module; \}, \(\) => \{\}\)/, `${file} survives a failed load`);
  }
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
    assert.doesNotMatch(s, /\b(?:top|best|worst|largest|biggest|most|highest|leading|key|must|should|controversial|popular|trending|recommended)\b/i, s);
    assert.doesNotMatch(s, /\b(?:center|organization|favor|color)\b/, s);
  }
});

test('money pages are counted by the four money views only; a typed second segment is /other', () => {
  for (const view of ['receipts', 'grants', 'contracts', 'explain']) assert.equal(safePath(`/money/${view}`), `/money/${view}`);
  assert.equal(safePath('/money/receipts/private-receipt'), '/money/receipts/[id]');
  assert.equal(safePath('/money/grants/federal/recipient/abn:1'), '/money/grants/[jurisdiction]/recipient/[id]');
  for (const path of ['/money/some-donor-name', '/money/jane-citizen', '/money/x/y']) assert.equal(safePath(path), '/other', path);
});
