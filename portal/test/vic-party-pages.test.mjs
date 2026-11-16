// Victorian candidates' parties and the register view (im-vic-parties; hub ruling on pull request 455).
// Until polls close, a party name on a candidate list links to one page, the same for every party on the
// VEC's register: its registered name, registration dates, abbreviated name and candidates by seat, with
// the VEC source line. It never links to a party page, and a party page never carries election material:
// whether a registered Victorian party and a party in the parliamentary or money record are one
// organisation is not sourced. A candidate with no party has no party line and no link.
import './helpers/vic-election-clock.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import {PARTY_ALIASES, PARTY_MAP, PARTY_NAMES, PARTY_RENAMES, partyLabelHTML} from '../public/labels.js';
import {canonicalPartyPages, resolvePartyPage, PARTY_MONEY_PATHS} from '../public/party-page.js';
import {loadWorker, offline} from './worker-harness.mjs';

const json = async url => JSON.parse(await readFile(new URL(url, import.meta.url), 'utf8'));
const publicJson = path => json(`../public/${path.replace(/^\//, '')}`);
const register = await json('../../scripts/hubs/vic-registered-parties-2026.json');
const lists = await json('../../scripts/hubs/vic-candidates-2026.json');
const data = await publicJson('hubs/vic-election-2026.json');
const pages = canonicalPartyPages({money: await Promise.all(PARTY_MONEY_PATHS.map(path => publicJson(path).catch(() => null))),
  roster: await publicJson('parliamentarians.json'), divisions: await publicJson('graph/party-members.json')});
const compile = async entry => {
  const built = await build({entryPoints: [new URL(entry, import.meta.url).pathname], bundle: true, platform: 'browser', format: 'esm', write: false, external: ['node:*'],
    plugins: [{name: 'omit-og', setup(b) { b.onResolve({filter: /^\.\/og-render$/}, () => ({path: 'renderer', namespace: 'vic-test'})); b.onLoad({filter: /.*/, namespace: 'vic-test'}, () => ({contents: 'export const renderOg=()=>null'})); }}]});
  return import('data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].text).toString('base64'));
};
const {VIC_REGISTER, registeredParty, registeredPartyPath, candidatePartyPath, registerView, registerViewHTML, registeredCandidates, linkPartyLabels} = await compile('../src/vic-election-parties.ts');
const {renderVicElection} = await compile('../src/vic-election.ts');
/** Every candidate row on the VEC's lists: 88 districts, then 8 regions. */
const rows = [['district', lists.districts], ['region', lists.regions]]
  .flatMap(([kind, seats]) => Object.entries(seats).flatMap(([seat, list]) => list.map(c => ({...c, seat, kind}))));
const hasParty = c => Boolean(c.party) && c.party.toLowerCase() !== 'independent';
const code = name => PARTY_MAP[String(name).toLowerCase()]?.[1];
/** A register spelling and a candidate-list spelling of one name differ only in their dashes. */
const dashless = name => String(name).replace(/[‐-―]/g, '-').toLowerCase();
const viewId = p => registeredPartyPath(p).split('/').at(-1);

test('the register snapshot cites the VEC and holds each registered party once', () => {
  assert.equal(register.url, 'https://www.vec.vic.gov.au/candidates-and-parties/registered-political-parties/currently-registered-parties');
  assert.match(register.retrieved, /^2026-\d{2}-\d{2}$/);
  assert.equal(register.parties.length, 24);
  assert.equal(new Set(register.parties.map(p => dashless(p.name))).size, 24);
  // Names, dates and abbreviations only: no registered officer or address is kept.
  for (const p of register.parties) assert.deepEqual(Object.keys(p), ['name', 'first_registered', 're_registered', 'abbreviation', 'acronym']);
  assert.deepEqual(VIC_REGISTER, register, 'the Worker bundles the snapshot itself');
});

test('the label map: every registered name has its own code, and every Victorian entry is the register\'s', () => {
  const codes = new Map();
  for (const p of register.parties) {
    assert.ok(Object.hasOwn(PARTY_ALIASES, p.name), `no label for the registered name ${p.name}`);
    const c = code(p.name);
    assert.ok(PARTY_NAMES[c], p.name);
    assert.ok(!codes.has(c), `${p.name} and ${codes.get(c)} share ${c}: the register lists them as two parties`);
    codes.set(c, p.name);
  }
  assert.equal(codes.size, 24);
  // A party's former names join its code from labels.js PARTY_RENAMES, where each carries the electoral
  // commission's own notice of the change (the AEC's deregistration and registration notices for the
  // Liberal Democratic Party and the Libertarian Party). They are not Victorian entries and are not checked here.
  const renamed = new Set(PARTY_RENAMES.flatMap(r => r.former.flatMap(f => [f.name, ...(f.aliases || [])])).map(dashless));
  const own = new Map(register.parties.map(p => [code(p.name), new Set([p.name, p.abbreviation].filter(Boolean).map(dashless))]));
  for (const [name, c] of Object.entries(PARTY_ALIASES)) {
    if (renamed.has(dashless(name)) || !own.has(c) || own.get(c).has(dashless(name))) continue;
    assert.ok(PARTY_NAMES[c].some(known => dashless(known) === dashless(name)), `${name} -> ${c} is not on the register`);
  }
});

test('Family First Victoria and the Victorian registration of the Australian Democrats are never joined to the federal party pages', () => {
  // Registered with the VEC on 6 October 2022 and 15 October 2026. The pages "Family First" and "Australian
  // Democrats" hold earlier federal records (2003-04 receipts, former senators); no source ties them together.
  const dates = Object.fromEntries(register.parties.map(p => [p.name, p.first_registered]));
  assert.equal(dates['Family First Victoria'], '2022-10-06');
  assert.equal(dates['Australian Democrats'], '2026-10-15');
  // Family First Victoria has its own code: an alias to FF would put it on the federal party's page.
  assert.equal(code('Family First Victoria'), 'FFV');
  assert.equal(code('Family First'), 'FF');
  assert.equal(resolvePartyPage('Family First Victoria', pages), null);
  const federal = pages.find(page => page.href === '/subject/party/family-first');
  assert.ok(federal && !federal.aliases.some(label => /victoria/i.test(label)), 'the Family First page holds no Victorian name');
  // The Victorian registration has the federal party's exact name, so no label can tell them apart. What keeps
  // them apart is that election material never reaches a party page: the register view is the only link.
  for (const name of ['Family First Victoria', 'Australian Democrats']) {
    const p = registeredParty(name);
    assert.equal(candidatePartyPath(name), registeredPartyPath(p));
    assert.match(registeredPartyPath(p), /^\/vic-election-2026\/party-/);
    assert.doesNotMatch(registerViewHTML(data, p), /\/subject\/party/);
  }
});

test('all 1,037 candidate rows: a party links to its register view, which lists the candidate; no party, no link', () => {
  assert.equal(rows.length, 1037);
  let linked = 0, unlinked = 0;
  for (const c of rows) {
    if (!hasParty(c)) { unlinked++; assert.equal(candidatePartyPath(c.party), null, c.name); continue; }
    linked++;
    const p = registeredParty(c.party);
    assert.ok(p, `${c.party} is not on the register (${c.name}, ${c.seat})`);
    assert.equal(dashless(p.name), dashless(c.party));
    assert.equal(candidatePartyPath(c.party), registeredPartyPath(p));
    const view = registerView(viewId(p), data);
    assert.equal(view.party, p);
    assert.ok(registeredCandidates(data, p).some(row => row.seat.name === c.seat && row.seat.kind === c.kind && row.names.includes(c.name)), `${c.name} (${c.seat}) is not on ${p.name}'s register view`);
  }
  assert.deepEqual([linked, unlinked], [925, 112]);
  assert.equal(new Set(rows.filter(hasParty).map(c => candidatePartyPath(c.party))).size, 23);
});

/** A page with its own words, addresses and candidate rows taken out: what is left is its shape. */
function shape(html) {
  const doc = JSDOM.fragment(html);
  for (const list of doc.querySelectorAll('.vic-register-seats')) list.innerHTML = list.children.length ? '<li></li>' : '';
  const walk = el => `<${el.tagName.toLowerCase()}${el.className ? `.${el.className}` : ''}${el.id ? `#${el.id}` : ''}>${[...el.children].map(walk).join('')}`;
  return [...doc.children].map(walk).join('');
}

test('one register view, one shape, for all 24 registered parties, with the VEC source line and nothing else', () => {
  const shapes = new Map();
  for (const p of register.parties) {
    const view = registerView(viewId(p), data), doc = JSDOM.fragment(view.body), text = doc.textContent;
    assert.equal(view.body, registerViewHTML(data, p), 'one function draws every view');
    assert.equal(doc.querySelector('h1').textContent, p.name);
    const facts = [...doc.querySelectorAll('#registration .vic-facts > div')].map(row => [row.querySelector('dt').textContent, row.querySelector('dd').textContent]);
    assert.deepEqual(facts.map(f => f[0]), ['Registered name', 'First registered', 'Re-registered', 'Registered abbreviated name'], p.name);
    assert.equal(facts[0][1], p.name);
    assert.equal(facts[2][1] === 'Not recorded on the register', p.re_registered === null, p.name);
    assert.equal(facts[3][1], p.abbreviation || 'None on the register', p.name);
    // Its candidates by seat, in the VEC's order: districts, then regions; ballot paper order within a seat.
    const expected = rows.filter(c => hasParty(c) && dashless(c.party) === dashless(p.name));
    const drawn = [...doc.querySelectorAll('.vic-register-seats > li')].flatMap(li => [...li.querySelectorAll('li')].map(row => [li.querySelector('a').textContent, row.textContent]));
    assert.deepEqual(drawn, expected.map(c => [`${c.seat} ${c.kind === 'region' ? 'Region' : 'District'}`, c.name]), p.name);
    for (const a of doc.querySelectorAll('.vic-register-seats a')) assert.match(a.getAttribute('href'), /^\/vic-election-2026\/[a-z0-9-]+#candidates$/);
    // The VEC source line, with the register's own address.
    const source = doc.querySelector('#candidates .ui-source');
    assert.ok(source && source.textContent.includes('Victorian Electoral Commission'), p.name);
    assert.ok([...source.querySelectorAll('a')].some(a => a.getAttribute('href') === register.url), p.name);
    // Nothing else: no colour or party dot, portrait, money, members, bills or party page.
    assert.equal(doc.querySelectorAll('.ui-party, .party, img, svg:not(.ui-source svg), table, [style]').length, 0, p.name);
    assert.doesNotMatch(view.body, /\/subject\/|\/money|\/bill|\$\d|receipt|donor|member/i, p.name);
    assert.equal([...doc.querySelectorAll('a')].filter(a => !a.closest('.ui-source')).every(a => a.getAttribute('href').startsWith('/vic-election-2026')), true, p.name);
    assert.ok(text.length > 0);
    shapes.set(shape(view.body), [...(shapes.get(shape(view.body)) || []), p.name]);
  }
  // Two shapes at most, differing only in whether the candidate list has rows (one registered party has none).
  const without = register.parties.filter(p => !rows.some(c => hasParty(c) && dashless(c.party) === dashless(p.name))).map(p => p.name);
  assert.deepEqual(without, ['Put Australia First, Save the Environment']);
  assert.equal(shapes.size, 2);
  assert.deepEqual([...shapes.values()].map(names => names.length).sort((a, b) => a - b), [1, 23]);
  assert.equal(registerView('party-not-a-registered-party', data), null);
  assert.equal(registerView('albert-park', data), null);
});

test('linkPartyLabels links each label in order, leaves its markup alone, and links every label or none', () => {
  const a = partyLabelHTML('Australian Labor Party - Victorian Branch'), b = partyLabelHTML('Victorian Socialists');
  const html = `<li><span>ONE</span>${a}</li><li><span>TWO</span></li><li><span>THREE</span>${b}</li>`;
  assert.equal(linkPartyLabels(html, ['/x/one', '/x/two']),
    `<li><span>ONE</span><a class="party-link" href="/x/one">${a}</a></li><li><span>TWO</span></li><li><span>THREE</span><a class="party-link" href="/x/two">${b}</a></li>`);
  // A count that does not match, or one address missing, links nothing: no row is treated differently.
  assert.equal(linkPartyLabels(html, ['/x/one']), html);
  assert.equal(linkPartyLabels(html, ['/x/one', null]), html);
  assert.equal(linkPartyLabels('<p>No labels</p>', []), '<p>No labels</p>');
});

test('every seat page: each candidate\'s party label is unchanged and links to its register view; no party, no link', () => {
  let seats = 0, links = 0, plain = 0;
  for (const seat of data.seats) {
    if (!seat.candidates) continue;
    seats++;
    const doc = JSDOM.fragment(renderVicElection(data, seat).html);
    const section = doc.querySelector('#candidates'), items = [...section.querySelectorAll('.vic-candidates > li')];
    assert.equal(items.length, seat.candidates.list.length, seat.name);
    // Loud, not silent: linkPartyLabels links nothing when the labels drawn and the parties named differ in
    // number (for example, were a label ever drawn for "Independent"). That must fail here, naming the seat.
    const labels = section.querySelectorAll('.vic-candidates .ui-party').length, parties = seat.candidates.list.filter(hasParty).length;
    assert.equal(labels, parties, `${seat.name}: ${labels} party labels drawn for ${parties} candidates with a party; every party link in this seat would be dropped`);
    assert.equal(section.querySelectorAll('.vic-candidates a.party-link').length, parties, `${seat.name}: the party links were dropped`);
    for (const [i, li] of items.entries()) {
      const c = seat.candidates.list[i], label = li.querySelector('.ui-party'), link = li.querySelector('a.party-link');
      assert.equal(li.querySelector('.vic-candidate-name').textContent, c.name);
      if (!hasParty(c)) { plain++; assert.equal(label, null, c.name); assert.equal(link, null, c.name); continue; }
      links++;
      assert.equal(link.getAttribute('href'), candidatePartyPath(c.party), `${c.name} (${seat.name})`);
      assert.match(link.getAttribute('href'), /^\/vic-election-2026\/party-[a-z0-9-]+$/);
      assert.equal(label.parentElement, link);
      assert.equal(label.textContent, JSDOM.fragment(partyLabelHTML(c.party)).textContent, c.name);
    }
    // No election page links to a party page.
    assert.equal(doc.querySelectorAll('a[href^="/subject/party"]').length, 0, seat.name);
  }
  assert.deepEqual([seats, links, plain], [96, 925, 112]);
  assert.equal(JSDOM.fragment(renderVicElection(data, null).html).querySelectorAll('a[href^="/subject/party"]').length, 0, 'the hub');
});

test('the Worker serves all 24 register views behind the election flag, and party pages carry no election material', async () => {
  offline();
  const worker = await loadWorker(new URL('../src/index.ts', import.meta.url).pathname, new URL('../public/', import.meta.url).pathname);
  const closed = await worker.fetch(registeredPartyPath(register.parties[0]));
  assert.equal(closed.status, 404, 'not published while the election pages are off');
  worker.env.VIC_ELECTION_HUB_ENABLED = 'true';
  for (const p of register.parties) {
    const response = await worker.fetch(registeredPartyPath(p));
    assert.equal(response.status, 200, p.name);
    const html = await response.text(), main = /<main\b[\s\S]*?<\/main>/.exec(html)[0];
    assert.ok(main.includes('Registered political party, Victoria.'), p.name);
    // The prerendered page carries the source line too.
    assert.match(main, /class="ui-pop ui-source"[\s\S]*Victorian Electoral Commission/, p.name);
    assert.doesNotMatch(main, /href="\/subject\/party/, p.name);
  }
  assert.equal((await worker.fetch('/vic-election-2026/party-not-a-registered-party')).status, 404);
  // The full party pages stay as they were: no registration block, no link to election material.
  for (const path of ['/subject/party/labor', '/subject/party/liberal', '/subject/party/greens', '/subject/party/family-first', '/subject/party/australian-democrats', '/subject/party/animal-justice-party']) {
    const response = await worker.fetch(path);
    assert.equal(response.status, 200, path);
    const main = /<main\b[\s\S]*?<\/main>/.exec(await response.text())[0];
    assert.doesNotMatch(main, /vic-election-2026\/party-|Registered with the Victorian Electoral Commission|2026 Victorian state election/, path);
  }
  // A registered party the record holds nowhere else has a register view only, never a party page.
  for (const name of ['Victorian Socialists', 'The West Party', 'Family First Victoria'])
    assert.equal(resolvePartyPage(name, pages), null, name);
});

// The app data guard draws these answers with each app build still in use (scripts/ci/app-data-guard.sh,
// scripts/ci/app-endpoint-guard). They are generated from the built hub data; here their candidates are
// held to the committed VEC lists, so a fixture cannot drift from what the endpoint sends.
test('the app guard\'s endpoint fixtures carry the VEC lists as the endpoint sends them', async () => {
  const {readdir} = await import('node:fs/promises');
  const dir = new URL('../../scripts/ci/app-endpoint-guard/fixtures/', import.meta.url);
  const files = (await readdir(dir)).filter(f => /^seat-.+\.json$/.test(f)).sort();
  assert.ok(files.length >= 2);
  const names = new Set(); let unendorsed = 0;
  for (const file of files) {
    const seat = JSON.parse(await readFile(new URL(file, dir), 'utf8'));
    const list = lists[seat.kind === 'region' ? 'regions' : 'districts'][seat.name];
    assert.ok(list, seat.name);
    assert.deepEqual(seat.candidates.list.map(c => [c.name, c.party, c.candidate_name, c.party_name, c.party_path]),
      list.map(c => [hasParty(c) ? `${c.name}\n${c.party}` : c.name, null, c.name, c.party || null, candidatePartyPath(c.party)]), seat.name);
    for (const c of list) { if (hasParty(c)) names.add(c.party); else unendorsed++; }
  }
  assert.ok(names.size >= 10 && unendorsed >= 2, 'many parties, and candidates nominated without one');
  assert.equal(JSON.parse(await readFile(new URL('overview.json', dir), 'utf8')).schema_version, 1);
});
