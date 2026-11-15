// Victorian candidates' parties and their party pages (im-vic-parties).
// A candidate's party, as the ballot paper prints it, links to one party page that is never empty:
// the page the party already has ("Australian Labor Party - Victorian Branch" is Labor's), or a page
// made from the VEC's register for a party the record holds nowhere else. A candidate with no party
// has no party line and no link. The alias map is checked against the register snapshot.
import './helpers/vic-election-clock.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import {PARTY_ALIASES, PARTY_MAP, PARTY_NAMES, partyLabelHTML} from '../public/labels.js';
import {canonicalPartyPages, resolvePartyPage, partyRegistration, partyRegistrationHTML, partyRegistrationText,
  registerOnlyParty, registeredPartyUrl, linkPartyLabels, partyPageCoverage, PARTY_MONEY_PATHS} from '../public/party-page.js';
import {registeredParties} from '../../scripts/build_party_index.mjs';

const json = async url => JSON.parse(await readFile(new URL(url, import.meta.url), 'utf8'));
const publicJson = path => json(`../public/${path.replace(/^\//, '')}`);
const register = await json('../../scripts/hubs/vic-registered-parties-2026.json');
const lists = await json('../../scripts/hubs/vic-candidates-2026.json');
const index = await publicJson('graph/party-members.json');
const pages = canonicalPartyPages({money: await Promise.all(PARTY_MONEY_PATHS.map(path => publicJson(path).catch(() => null))),
  roster: await publicJson('parliamentarians.json'), divisions: index});
/** Every candidate row on the VEC's lists: 88 districts, then 8 regions. */
const rows = [['district', lists.districts], ['region', lists.regions]]
  .flatMap(([kind, seats]) => Object.entries(seats).flatMap(([seat, list]) => list.map(c => ({...c, seat, kind}))));
const hasParty = c => Boolean(c.party) && c.party.toLowerCase() !== 'independent';
const code = name => PARTY_MAP[String(name).toLowerCase()]?.[1];
/** A register spelling and a candidate-list spelling of one name differ only in their dashes. */
const dashless = name => String(name).replace(/[‐-―]/g, '-').toLowerCase();
const h = {esc: s => String(s ?? '').replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`), sourceLineHTML: () => ''};

test('the register snapshot cites the VEC and holds each registered party once', () => {
  assert.equal(register.url, 'https://www.vec.vic.gov.au/candidates-and-parties/registered-political-parties/currently-registered-parties');
  assert.match(register.retrieved, /^2026-\d{2}-\d{2}$/);
  assert.equal(register.parties.length, 24);
  assert.equal(new Set(register.parties.map(p => dashless(p.name))).size, 24);
  // Names, dates and abbreviations only: no registered officer or address is kept.
  for (const p of register.parties) assert.deepEqual(Object.keys(p), ['name', 'first_registered', 're_registered', 'abbreviation', 'acronym']);
});

test('the alias map: every registered name has one code, no two registered parties share a code, and every entry is the register\'s', () => {
  const codes = new Map();
  for (const p of register.parties) {
    assert.ok(Object.hasOwn(PARTY_ALIASES, p.name), `no alias for the registered name ${p.name}`);
    const c = code(p.name);
    assert.ok(PARTY_NAMES[c], p.name);
    assert.ok(!codes.has(c), `${p.name} and ${codes.get(c)} share ${c}: the register lists them as two parties`);
    codes.set(c, p.name);
    // A registered abbreviated name or acronym the map knows names the same party, never another.
    for (const short of [p.abbreviation, p.acronym].filter(Boolean)) if (code(short)) assert.equal(code(short), c, `${short} (${p.name})`);
  }
  assert.equal(codes.size, 24);
  // Every party name on a candidate row is a registered name (its dashes aside) with that party's code.
  const registered = new Map(register.parties.map(p => [dashless(p.name), p]));
  const listed = [...new Set(rows.filter(hasParty).map(c => c.party))];
  assert.equal(listed.length, 23);
  for (const name of listed) {
    const party = registered.get(dashless(name));
    assert.ok(party, `${name} is not on the register`);
    assert.equal(code(name), code(party.name), name);
  }
  // No Victorian alias is inferred: an entry carrying a registered party's code is that party's registered
  // name, its registered abbreviated name, or a name the party map already gave that code.
  const own = new Map(register.parties.map(p => [code(p.name), new Set([p.name, p.abbreviation].filter(Boolean).map(dashless))]));
  for (const [name, c] of Object.entries(PARTY_ALIASES)) {
    if (!own.has(c) || own.get(c).has(dashless(name))) continue;
    assert.ok(PARTY_NAMES[c].some(known => dashless(known) === dashless(name)) || c === 'LDP', `${name} -> ${c} is not on the register`);
  }
});

test('all 1,037 candidate rows: a party resolves to one non-empty party page, a blank party to no link', () => {
  assert.equal(rows.length, 1037);
  let linked = 0, unlinked = 0;
  for (const c of rows) {
    if (!hasParty(c)) { unlinked++; assert.equal(partyLabelHTML(c.party === 'Independent' ? '' : c.party), '', c.name); continue; }
    linked++;
    const page = resolvePartyPage(c.party, pages);
    assert.ok(page, `${c.party} has no party page (${c.name}, ${c.seat})`);
    // The link is the page's own address, not an alias the Worker would redirect.
    assert.equal(registeredPartyUrl(c.party), page.href, c.party);
    const found = partyRegistration(page.label, index);
    assert.ok(found, c.party);
    assert.ok(found.party.candidates.some(x => x.name === c.name && x.seat === c.seat), `${c.name} (${c.seat}) is not on ${page.name}'s page`);
  }
  assert.deepEqual([linked, unlinked], [925, 112]);
});

test('equal treatment: every registered party has one page carrying its registration and its candidates', () => {
  const made = [];
  for (const p of register.parties) {
    const mine = pages.filter(page => page.aliases.some(label => dashless(label) === dashless(p.name)));
    assert.equal(mine.length, 1, p.name);
    const [page] = mine;
    assert.equal(page.register, true, p.name);
    const html = partyRegistrationHTML(page.label, index, h), doc = JSDOM.fragment(html);
    const found = partyRegistration(page.label, index), text = partyRegistrationText(found);
    assert.equal(found.party.name, p.name);
    // The index gives the page too, so a reader of the file needs no alias table of its own.
    assert.equal(found.party.page, page.href, p.name);
    assert.equal(doc.querySelector('h2').textContent, '2026 Victorian state election');
    assert.ok(doc.textContent.includes(`Registered with the Victorian Electoral Commission as ${p.name}.`), p.name);
    assert.ok(doc.textContent.includes(text.candidates), p.name);
    const items = [...doc.querySelectorAll('.party-candidates > li')];
    const expected = rows.filter(c => hasParty(c) && code(c.party) === code(p.name));
    assert.deepEqual(items.map(li => li.querySelector('.party-candidate-name').textContent), expected.map(c => c.name), p.name);
    for (const [i, li] of items.entries()) {
      const a = li.querySelector('a');
      assert.equal(a.textContent, `${expected[i].seat} ${expected[i].kind === 'region' ? 'Region' : 'District'}`);
      assert.match(a.getAttribute('href'), /^\/vic-election-2026\/[a-z0-9-]+$/);
    }
    if (registerOnlyParty(page)) {
      made.push(p.name);
      // Made from the register alone: the registered name is the page's, and the directory says where it is from.
      assert.equal(page.label, p.name);
      assert.equal(page.href, registeredPartyUrl(p.name));
      assert.match(partyPageCoverage(page), /^Electoral commission register of political parties/);
    }
  }
  assert.deepEqual(made.sort(), ['Affordable Housing Now – Sustainable Australia Party', 'Australian Citizens Party (Victorian Division)',
    'Christian Alliance Party - Reform AU', 'Climate Action Now', 'Free Palestine', "I'm Voting to Avoid the Fine",
    'Put Australia First, Save the Environment', 'Safety Victoria - Violent Crime Prevention', 'Socialist Alliance',
    'The Republican Make Australia Great Again', 'The West Party', 'Victorian Socialists']);
  // A party on no register has no block.
  assert.equal(partyRegistrationHTML('Centre Alliance', index, h), '');
});

test('no Victorian-branch party page: a registered name is an alias of its party\'s page, and no page is empty', () => {
  for (const [name, href] of [['Australian Labor Party - Victorian Branch', '/subject/party/labor'],
    ['Liberal Party of Australia - Victorian Division', '/subject/party/liberal'], ['Liberal Party of Australia – Victorian Division', '/subject/party/liberal'],
    ['Australian Greens Victoria', '/subject/party/greens'], ['One Nation Victoria', '/subject/party/one-nation'],
    ['National Party of Australia - Victoria', '/subject/party/nationals'], ['Family First Victoria', '/subject/party/family-first'],
    ['Legalise Cannabis Victoria', '/subject/party/legalise-cannabis'], ['Animal Justice Party', '/subject/party/animal-justice-party'],
    ['Shooters, Fishers and Farmers Party Victoria', '/subject/party/shooters-fishers-and-farmers'],
    ['Democratic Labour Party (DLP)', '/subject/party/dlp'], ['Libertarian Party (formerly Liberal Democrats)', '/subject/party/libertarian-party'],
    ['Australian Democrats', '/subject/party/australian-democrats']]) {
    assert.equal(resolvePartyPage(name, pages)?.href, href, name);
    assert.equal(registeredPartyUrl(name), href, name);
    // Its own slug is not a page: it resolves to the party's page, which the Worker redirects to.
    assert.equal(pages.filter(page => page.label === name && page.href !== href).length, 0, name);
  }
  assert.equal(new Set(pages.map(page => page.href)).size, pages.length);
  for (const page of pages) {
    const recorded = page.money || page.roster || page.divisions || page.bills;
    assert.ok(recorded || partyRegistrationHTML(page.label, index, h).includes('Registered with'), `${page.label} would render an empty page`);
  }
});

test('the committed party index carries what the build writes from the register and the candidate lists', () => {
  assert.deepEqual(index.registered, registeredParties());
  const {vic} = index.registered;
  assert.equal(vic.parties.reduce((n, p) => n + p.candidates.length, 0), 925);
  assert.equal(Object.keys(vic.seats).length, 96);
});

test('linkPartyLabels links each label in order, leaves its markup alone, and links nothing on a count that does not match', () => {
  const a = partyLabelHTML('Australian Labor Party - Victorian Branch'), b = partyLabelHTML('Victorian Socialists');
  const html = `<li><span>ONE</span>${a}</li><li><span>TWO</span></li><li><span>THREE</span>${b}</li>`;
  assert.equal(linkPartyLabels(html, ['/subject/party/labor', '/subject/party/victorian-socialists']),
    `<li><span>ONE</span><a class="party-link" href="/subject/party/labor">${a}</a></li><li><span>TWO</span></li><li><span>THREE</span><a class="party-link" href="/subject/party/victorian-socialists">${b}</a></li>`);
  assert.equal(linkPartyLabels(html, ['/subject/party/labor']), html);
  assert.equal(linkPartyLabels('<p>No labels</p>', []), '<p>No labels</p>');
});

test('every seat page: each candidate\'s party label is unchanged and links to its party page; no party, no link', async () => {
  const built = await build({entryPoints: [new URL('../src/vic-election.ts', import.meta.url).pathname], bundle: true, platform: 'browser', format: 'esm', write: false, external: ['node:*'],
    plugins: [{name: 'omit-og', setup(b) { b.onResolve({filter: /^\.\/og-render$/}, () => ({path: 'renderer', namespace: 'vic-test'})); b.onLoad({filter: /.*/, namespace: 'vic-test'}, () => ({contents: 'export const renderOg=()=>null'})); }}]});
  const {renderVicElection} = await import('data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].text).toString('base64'));
  const data = await publicJson('hubs/vic-election-2026.json');
  let seats = 0, links = 0, plain = 0;
  for (const seat of data.seats) {
    if (!seat.candidates) continue;
    seats++;
    const doc = JSDOM.fragment(renderVicElection(data, seat).html);
    const items = [...doc.querySelectorAll('#candidates .vic-candidates > li')];
    assert.equal(items.length, seat.candidates.list.length, seat.name);
    for (const [i, li] of items.entries()) {
      const c = seat.candidates.list[i], label = li.querySelector('.ui-party'), link = li.querySelector('a.party-link');
      assert.equal(li.querySelector('.vic-candidate-name').textContent, c.name);
      if (!hasParty(c)) { plain++; assert.equal(label, null, c.name); assert.equal(link, null, c.name); continue; }
      links++;
      assert.equal(link.getAttribute('href'), resolvePartyPage(c.party, pages).href, `${c.name} (${seat.name})`);
      assert.equal(label.parentElement, link);
      assert.equal(label.textContent, JSDOM.fragment(partyLabelHTML(c.party)).textContent, c.name);
      assert.equal(li.querySelectorAll('a.party-link').length, 1);
    }
  }
  assert.deepEqual([seats, links, plain], [96, 925, 112]);
});

// The shipped apps (to 1.1.5) derive a party from its printed name with their own table, which holds none of
// the registered names, so most of these open the app's "This party isn't in OPAX's records yet" screen. Its
// one action opens /subject/party/<the printed name, percent-encoded> on the website. That address must reach
// the party's page for every name on a candidate row, the same for every party.
test('the address the shipped apps open for a printed party name reaches that party\'s page, for every party', async () => {
  const {loadWorker, offline} = await import('./worker-harness.mjs');
  offline();
  const worker = await loadWorker(new URL('../src/index.ts', import.meta.url).pathname, new URL('../public/', import.meta.url).pathname);
  const printed = [...new Set(rows.filter(hasParty).map(c => c.party))];
  assert.equal(printed.length, 23);
  for (const name of printed) {
    const page = resolvePartyPage(name, pages);
    const first = await worker.fetch(`/subject/party/${encodeURIComponent(name)}`);
    assert.ok([301, 308].includes(first.status), `${name}: ${first.status}`);
    assert.equal(new URL(first.headers.get('location'), 'https://opax.com.au').pathname, page.href, name);
    const landed = await worker.fetch(page.href);
    assert.equal(landed.status, 200, name);
    const html = await landed.text();
    assert.ok(html.includes('Registered with the Victorian Electoral Commission as'), name);
    assert.doesNotMatch(html, /<title>(?:Party not found|Page not found)/, name);
  }
});
