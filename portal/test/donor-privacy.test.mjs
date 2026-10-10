// Donor privacy regression (October 2026 hotfix): no donor failing the
// organisation test (public/donor-entity.js) may be named by any server output.
// The real Worker and crawl build run over the export plus fictional fixture
// donors; the known-individual set is derived from the export, never typed in.
// Failure messages carry paths and counts only, never a donor's name.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync, mkdtempSync, mkdirSync, symlinkSync, writeFileSync, rmSync, existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {build} from 'esbuild';
import {offline, loadWorker, outbound, rendered} from './worker-harness.mjs';
import {WITHHELD_DONOR_REPLY} from '../src/donor-index.ts';
import {MONEY_GRAPHS, isOrganisationDonor, donorPrivacyIndex, donorNameWithheld, foldDonorName, withholdIndividualDonors} from '../public/donor-entity.js';
import {partyUrl} from '../public/canonical-urls.js';
import {personIndex} from '../src/person-slug.ts';
import {buildCrawl} from '../../scripts/build_crawl_catalog.mjs';

const pub = new URL('../public/', import.meta.url).pathname;
const real = path => JSON.parse(readFileSync(join(pub, path), 'utf8'));

// --- fixtures: fictional donors to the party with the most receipts --------------
const federal = real('graph/money.json');
const inbound = new Map();
for (const e of federal.edges) if (!e.flow && !e.grant) inbound.set(e.target, (inbound.get(e.target) || 0) + e.total);
const topParty = federal.nodes.find(n => n.id === [...inbound].sort((a, b) => b[1] - a[1])[0][0]);
// Sector-tagged, titled, inverted and individual-tagged people; the reviews' ABN-only alias,
// unions-tagged personal name and acronym aliases ("ABN", initials); an all-capitals name.
const FIXTURE_INDIVIDUALS = [['Quillon Fixturewright', 'media', ['Q. Fixturewright']], ['Mrs Verity Fixturemoor AO', 'finance', []], ['Fixturemoor, Ottoline', 'unions', []], ['Bertram Fixturebay', 'individual', []],
  ['Alexandra Fixturely', 'other', ['ABN 12 345 678 901']], ['Morgan Fixtureton', 'unions', []], ['JUNIPER FIXTUREHAM', 'unions', ['ACN 123 456 789']],
  ['Ines Fixturegate', 'other', ['ABN']], ['Rowan Fixturepeak', 'media', ['RF']], ['Hollis Fixtureford', 'finance', ['HFX']]];
const FIXTURE_ORGANISATION = 'Fixtureworks Holdings Pty Ltd';
const big = Math.max(...federal.edges.map(e => e.total)) * 2;
const fixtureNodes = [...FIXTURE_INDIVIDUALS, [FIXTURE_ORGANISATION, 'property', []]].map(([label, industry, aliases], i) => ({
  id: `donor:${label.toLowerCase()}`, label, kind: 'donor', industry, group: industry, total: big + i, count: 1, firstYear: 2020, lastYear: 2020, byYear: {2020: [big + i, 1]}, aliases,
}));
const fixtureGraph = {...federal, nodes: [...federal.nodes, ...fixtureNodes],
  edges: [...federal.edges, ...fixtureNodes.map(n => ({source: n.id, target: topParty.id, total: n.total, count: 1, firstYear: 2020, lastYear: 2020, byYear: {2020: [n.total, 1]}}))]};

// A member's declared interests gain one fictional entry naming a fixture individual,
// first in its bucket so the page would show it.
const rosterPeople = real('parliamentarians.json').people;
const interestIndex = real('interests/index.json');
const interestMember = rosterPeople.find(p => p.pid && !p.speech_scope && interestIndex.people[p.pid] && existsSync(join(pub, `interests/${p.pid}.json`)));
const interestRegister = real(`interests/${interestMember.pid}.json`);
const [interestBucket] = Object.keys(interestRegister.buckets);
const keptEntry = interestRegister.buckets[interestBucket].items[0];
interestRegister.buckets[interestBucket].items.unshift({description: `Gift of a framed print from ${FIXTURE_INDIVIDUALS[0][0]}`, holder: 'Self'});

/** The export with these money graphs in place: every other entry is a symlink. */
function exportRoot(money) {
  const dir = mkdtempSync(join(tmpdir(), 'opax-donor-privacy-'));
  for (const entry of readdirSync(pub)) if (!['crawl', 'person-paths.js', 'graph', 'interests'].includes(entry)) symlinkSync(join(pub, entry), join(dir, entry));
  mkdirSync(join(dir, 'graph'));
  for (const entry of readdirSync(join(pub, 'graph'))) if (entry !== 'money.json') symlinkSync(join(pub, 'graph', entry), join(dir, 'graph', entry));
  writeFileSync(join(dir, 'graph', 'money.json'), JSON.stringify(money));
  mkdirSync(join(dir, 'interests'));
  for (const entry of readdirSync(join(pub, 'interests'))) if (entry !== `${interestMember.pid}.json`) symlinkSync(join(pub, 'interests', entry), join(dir, 'interests', entry));
  writeFileSync(join(dir, 'interests', `${interestMember.pid}.json`), JSON.stringify(interestRegister));
  return dir;
}
const root = exportRoot(fixtureGraph);
await buildCrawl(root);
test.after(() => rmSync(root, {recursive: true, force: true}));
const at = path => join(root, path.replace(/^\//, ''));

// --- what may not be named -------------------------------------------------------
const graphs = MONEY_GRAPHS.map(path => JSON.parse(readFileSync(at(path), 'utf8')));
const index = donorPrivacyIndex(graphs);
const donorNodes = graphs.flatMap(g => g.nodes.filter(n => n.kind === 'donor'));
const fixtureLabels = new Set(FIXTURE_INDIVIDUALS.map(([label]) => label));
// Organisations the export may name, some of which carry a person's name.
const organisationNames = new Set([
  ...donorNodes.filter(isOrganisationDonor).flatMap(n => [n.label, ...(n.aliases || [])]),
  ...real('graph/campaigners.json').entities.map(e => e.name).filter(name => !index.withheld.has(foldDonorName(name))),
  ...real('suppliers.json').suppliers.map(s => s.name), ...real('agencies.json').agencies.map(a => a.name),
  ...['federal', 'qld'].flatMap(jur => real(`graph/grants.${jur}.json`).recipients.filter(r => !['individual', 'person', 'undisclosed'].includes(r.k)).flatMap(r => [r.n, String(r.id)])),
  ...graphs.flatMap(g => g.nodes.filter(n => n.kind === 'party').map(n => n.label)),
  ...real('evidence/index.json').entities.filter(e => e.kind === 'organisation').map(e => e.name),
]);
// With and without a trailing legal form: "Example One" is "Example One Limited".
const legalForm = /(?:[\s,]+(?:pty\.?|ltd\.?|limited|proprietary|inc\.?|incorporated|corp\.?|corporation|company|co\.?|llp|plc))+$/i;
const organisationFolds = new Set([...organisationNames].flatMap(name => [foldDonorName(name), foldDonorName(String(name).replace(legalForm, ''))]));
// The complete withheld set: every label failing the organisation test, sector-tagged
// people included, plus the fixtures. Three kinds of label are not scanned for as
// text, and stay covered by the link, id and own-page checks: a single word (no
// person's full name is one word; these are bare company names withheld for want of
// a legal form, and appear in other registers' longer names), a label another
// register records as an organisation of that exact name (a supplier, agency, grant
// company, campaigner or connection), and a parliamentarian's or minister's name
// (office holders who gave to their party are named as office holders).
const withheldLabels = [...new Set(donorNodes.filter(n => donorNameWithheld(index, n.label)).map(n => n.label))];
const known = withheldLabels.filter(label => fixtureLabels.has(label) || (/\S\s+\S/.test(label.trim()) && !organisationFolds.has(foldDonorName(label))));
const roster = real('parliamentarians.json').people;
const access = real('access.json');
const rosterNames = new Set([...roster.flatMap(p => [p.name, p.full]), ...Object.values(access.ministers).map(m => m.name)].filter(Boolean).map(foldDonorName));
const checked = known.filter(label => !rosterNames.has(foldDonorName(label)));
const donorIds = new Map(donorNodes.map(n => [n.id, n.label]));

const entities = s => String(s).replace(/\\u003c/g, '<').replace(/&#39;|&#x27;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const decode = s => entities(s).replace(/%([0-9a-f]{2})/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
const words = s => decode(s).normalize('NFKC').toLowerCase().replace(/[‘’ʼ`]/g, "'").split(/[^a-z0-9']+/).filter(Boolean);
const phrase = s => ` ${words(s).join(' ')} `;
/** Names found in a text, by word sequence: one pass over the words, then a confirming substring check.
 * A name inside a longer organisation name in `allowed` ("<name> Family Trust") is the organisation's. */
function nameMatcher(names, allowed = new Map()) {
  const byStart = new Map();
  for (const name of names) {
    const w = words(name);
    if (!w.length) continue;
    const key = w.length > 1 ? `${w[0]} ${w[1]}` : w[0];
    if (!byStart.has(key)) byStart.set(key, []);
    byStart.get(key).push({name, phrase: phrase(name), length: w.length});
  }
  return text => {
    const w = words(text), joined = ` ${w.join(' ')} `, hits = new Set();
    for (let i = 0; i < w.length; i++) for (const key of [`${w[i]} ${w[i + 1]}`, w[i]]) for (const c of byStart.get(key) || []) {
      if (hits.has(c.name) || !joined.includes(c.phrase)) continue;
      let rest = joined;
      // Repeat: back-to-back copies of a name share the space between them.
      for (const longer of allowed.get(c.name) || []) while (rest.includes(longer)) rest = rest.replaceAll(longer, ' ');
      // An occurrence followed by organisation evidence ("<name> Pty Limited",
      // "<name> Family Trust") is an organisation's name, not the person's.
      const rw = rest.trim().split(' ');
      for (let j = 0; j < rw.length; j++) {
        if (` ${rw.slice(j, j + c.length).join(' ')} ` !== c.phrase) continue;
        if (isOrganisationDonor({label: rw.slice(j, j + c.length + 4).join(' ')}) && !isOrganisationDonor({label: rw.slice(j, j + c.length).join(' ')})) continue;
        hits.add(c.name);
        break;
      }
    }
    return [...hits];
  };
}
const within = nameMatcher(checked), allowed = new Map();
for (const org of organisationNames) for (const name of within(org)) if (phrase(org) !== phrase(name)) {
  if (!allowed.has(name)) allowed.set(name, []);
  allowed.get(name).push(phrase(org));
}
const namesIn = nameMatcher(checked, allowed);
// DONOR_PRIVACY_DEBUG=1 adds the surrounding text to a failure, for a local run only.
const debug = process.env.DONOR_PRIVACY_DEBUG === '1';
// Graphs share ids ("donor:x" can be an organisation in one state and a bare label in
// another, where it is re-keyed); an id is withheld when no organisation node carries it.
const organisationIds = new Set(donorNodes.filter(n => !donorNameWithheld(index, n.label)).map(n => n.id));
const withheldIds = [...new Set(donorNodes.filter(n => donorNameWithheld(index, n.label) && !organisationIds.has(n.id)).map(n => n.id))];
/** A path segment, then the same without trailing markdown or sentence punctuation. */
function segmentLabels(seg) {
  const out = [];
  for (let s = seg, k = 0; k < 4; k++) {
    try { out.push(decodeURIComponent(decode(s))); } catch { out.push(decode(s)); }
    const trimmed = s.replace(/\.(?:png|jpg)$|[).,;:]+$/, '');
    if (trimmed === s) break;
    s = trimmed;
  }
  return out;
}
/** Links and ids that would open or identify a withheld donor or campaigner. */
function withheldLinks(text) {
  const bad = [];
  const raw = entities(text);
  for (const [, seg] of raw.matchAll(/\/subject\/donor\/([^"<>\s?#\]{}`]+)/g))
    if (segmentLabels(seg).every(label => donorNameWithheld(index, label))) bad.push('donor link');
  for (const [, seg] of raw.matchAll(/\/subject\/campaigner\/([^"<>\s?#\]{}`]+)/g))
    if (segmentLabels(seg).every(label => index.withheld.has(foldDonorName(label)))) bad.push('campaigner link');
  const decoded = decode(text).replace(/\+/g, ' ');
  if (decoded.includes('donor:')) for (const id of withheldIds) {
    // An id ends where no id character follows: "donor:a b" inside "donor:a b pty ltd" is another id.
    for (let at = decoded.indexOf(id); at >= 0; at = decoded.indexOf(id, at + 1)) if (!/[a-z0-9 .'()-]/.test(decoded[at + id.length] || '')) { bad.push(debug ? `donor id ${id} at ${decoded.slice(Math.max(0, at - 80), at + id.length + 20)}` : 'donor id'); break; }
  }
  return bad;
}
function context(text, named) {
  const plain = decode(text).replace(/\s+/g, ' ');
  return named.flatMap(name => { const w = words(name); const re = new RegExp(w.map(x => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[^a-z0-9]+'), 'i'); const m = re.exec(plain); return m ? [plain.slice(Math.max(0, m.index - 120), m.index + 120)] : []; });
}
function assertClean(where, text) {
  const named = namesIn(text), links = withheldLinks(text);
  const detail = debug ? `\n${[...named.map(n => `matched: ${n}`), ...context(text, named), ...[...entities(text).matchAll(/\/subject\/(?:donor|campaigner)\/[^"<>\s?#\]]+/g)].map(m => m[0])].join('\n')}` : '';
  assert.equal(named.length + links.length, 0, `${where}: ${named.length} withheld donor name(s), ${links.join(', ') || 'no withheld links'}${detail}`);
}

// --- the Worker over the fixture export, with no network -------------------------
// Any model or knowledge-box call is recorded and refused: no production calls, and
// what would have been sent to a model is checked like any other output.
test.after(offline());
const {env, fetch: fetchWorker} = await loadWorker(new URL('../src/index.ts', import.meta.url).pathname, root);
const ownUrl = (html, path) => entities(html).replaceAll(path, '');

test('the fixture individuals are withheld and the fixture organisation is not', () => {
  for (const label of fixtureLabels) assert.ok(donorNameWithheld(index, label) && known.includes(label) && checked.includes(label), `fixture ${[...fixtureLabels].indexOf(label)}`);
  assert.equal(donorNameWithheld(index, FIXTURE_ORGANISATION), false);
});

test('anonymising keeps every donor group and its totals: duplicated source ids never merge', () => {
  for (const [i, g] of graphs.entries()) {
    const out = withholdIndividualDonors(g);
    const groups = graph => new Set(graph.nodes.filter(n => n.kind === 'donor').map(n => n.id)).size;
    const totals = graph => { const m = new Map(); for (const e of graph.edges) m.set(e.source, (m.get(e.source) || 0) + e.total); return [...m.values()].sort((a, b) => a - b).join(); };
    assert.equal(groups(out), groups(g), `graph ${i}: donor groups`);
    assert.equal(totals(out), totals(g), `graph ${i}: per-group totals`);
  }
  assert.equal(new Set(graphs[3].nodes.filter(n => n.kind === 'donor').map(n => withholdIndividualDonors(graphs[3]).nodes[graphs[3].nodes.indexOf(n)].id)).size, 170, 'Tasmania');
});

test('a campaigner route never repeats a requested name it cannot show', async () => {
  const register = new Set(real('graph/campaigners.json').entities.map(e => foldDonorName(e.name)));
  const names = [...checked.filter(label => !register.has(foldDonorName(label))).slice(0, 80), 'Quinella Fixturestone'];
  for (const name of names) {
    const path = `/subject/campaigner/${encodeURIComponent(name)}`;
    const response = await fetchWorker(path);
    const html = rendered(ownUrl(await response.text(), path));
    assert.equal(response.status, 404);
    assert.equal(nameMatcher([name])(html).length, 0, `campaigner 404 ${names.indexOf(name)} repeats the name`);
  }
});

// --- 1. server-rendered HTML -----------------------------------------------------
const locs = name => [...readFileSync(at(`crawl/sitemaps/${name}`), 'utf8').matchAll(/<loc>https:\/\/opax\.com\.au([^<]+)<\/loc>/g)].map(m => decode(m[1]));
const sitemapFiles = readdirSync(at('crawl/sitemaps'));

test('every server-rendered person, party, money, hub, campaigner and supplier page names no withheld donor', async t => {
  let interestNotes = 0;
  const people = sitemapFiles.filter(f => f.startsWith('people-')).flatMap(locs);
  assert.ok(people.length > 1000);
  const parties = new Set([...sitemapFiles.filter(f => f.startsWith('parties-')).flatMap(locs), ...graphs.flatMap(g => g.nodes.filter(n => n.kind === 'party').map(n => partyUrl(n.label)))]);
  const money = ['/', '/money', '/money/receipts', '/money/grants', '/map', '/connections', '/explore', '/subject/party', '/subject/supplier', '/subject/agency'];
  for (const dir of ['donor', 'campaigner']) for (let page = 1, next = true; next; page++) {
    const path = `/subject/${dir}${page > 1 ? `?page=${page}` : ''}`;
    money.push(path);
    next = (await (await fetchWorker(path)).text()).includes(`<link rel="next" href="/subject/${dir}?page=${page + 1}"`);
  }
  const suppliers = real('suppliers.json').suppliers.map(s => `/subject/supplier/${s.id}`);
  // Sitting-week and estimates hubs, when the export carries them.
  money.push(...sitemapFiles.filter(f => f.startsWith('hubs-')).flatMap(locs));
  let personDonorBlocks = 0;
  for (const path of [...people, ...parties, ...money, ...suppliers]) {
    const response = await fetchWorker(path);
    const html = await response.text();
    if (response.status === 200 && people.includes(path) && /<h3>(?:AEC|ECQ|VEC) disclosed receipts<\/h3>/.test(html)) personDonorBlocks++;
    // Declared interests included: an entry naming a withheld donor is left out whole.
    if (html.includes('data-register-omitted')) interestNotes++;
    assertClean(path, rendered(html));
  }
  assert.ok(personDonorBlocks > 500, `${personDonorBlocks} person pages still list organisational donors`);
  t.diagnostic(`${personDonorBlocks} person pages list organisational donors; ${interestNotes} leave a declared-interest entry to the official register`);
  t.diagnostic(`scanned for ${checked.length} names: ${withheldLabels.length} withheld labels (${fixtureLabels.size} fixtures), less ${withheldLabels.length - known.length} single-word or other-register organisation names and ${known.length - checked.length} office holders`);
});

test('a withheld donor or campaigner page is reachable, noindex and unnamed; its share card is never drawn', async () => {
  const donorLabels = [...new Set(donorNodes.map(n => n.label))];
  let withheld = 0, organisations = 0;
  for (const label of donorLabels) {
    const path = `/subject/donor/${encodeURIComponent(label)}`;
    const response = await fetchWorker(path);
    const html = await response.text();
    assert.equal(response.status, 200, path);
    if (donorNameWithheld(index, label)) {
      withheld++;
      assert.equal(response.headers.get('x-robots-tag'), 'noindex', `withheld donor page ${withheld}: robots header`);
      assert.match(html, /<meta name="robots" content="noindex">/);
      const rest = rendered(ownUrl(html, path));
      assert.equal(nameMatcher([label])(rest).length, 0, `withheld donor page ${withheld} names its donor${debug ? `\n${context(rest, [label]).join('\n')}` : ''}`);
      assertClean(`withheld donor page ${withheld}`, rest);
      for (const ext of ['png', 'jpg']) {
        const card = await fetchWorker(`/og${path}.${ext}`);
        assert.equal(card.headers.get('x-opax-og'), null, `withheld donor card ${withheld}`);
        assert.ok(ext === 'png' ? card.headers.get('x-opax-cache') === 'BYPASS' : card.status === 404, `withheld donor card ${withheld}: ${card.status}`);
      }
    } else {
      organisations++;
      assert.equal(response.headers.get('x-robots-tag'), 'all', path);
      assertClean(path, rendered(html));
    }
  }
  assert.ok(withheld > 400 && organisations > 400, `${withheld} withheld, ${organisations} organisations`);
  const campaigners = real('graph/campaigners.json').entities;
  let withheldCampaigners = 0;
  for (const c of campaigners) {
    const path = `/subject/campaigner/${encodeURIComponent(c.name)}`;
    const response = await fetchWorker(path);
    const html = await response.text();
    if (index.withheld.has(foldDonorName(c.name))) {
      withheldCampaigners++;
      assert.equal(response.headers.get('x-robots-tag'), 'noindex', `withheld campaigner ${withheldCampaigners}`);
      assert.equal(nameMatcher([c.name])(rendered(ownUrl(html, path))).length, 0, `withheld campaigner ${withheldCampaigners} is named`);
      assert.equal((await fetchWorker(`/og${path}.jpg`)).status, 404);
    } else assertClean(path, rendered(html));
  }
  assert.ok(withheldCampaigners > 0);
});

test('a declared-interest entry naming a withheld donor is left out whole, with a note and the official register', async () => {
  const html = rendered(await (await fetchWorker(`/subject/person/${personIndex(rosterPeople).slugOf.get(interestMember.name)}`)).text());
  assert.ok(html.includes('<h2>Declared interests</h2>'));
  assert.equal(namesIn(html).length, 0, 'the fixture entry is not shown');
  assert.match(html, /<p data-register-omitted="">Some register entries are shown only on the <a [^>]*href="https?:[^"]+"[^>]*>official register<\/a>\.<\/p>/);
  const escaped = keptEntry.description.replace(/&/g, '&amp;').replace(/'/g, '&#39;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  assert.ok(html.includes(escaped), 'the next entry is shown as written');
});

// --- 2. crawl outputs --------------------------------------------------------------
test('no sitemap, llms.txt or IndexNow entry names or links a withheld donor', () => {
  for (const name of sitemapFiles) assertClean(`sitemap ${name}`, readFileSync(at(`crawl/sitemaps/${name}`), 'utf8'));
  assertClean('sitemap index', readFileSync(at('crawl/sitemap.xml'), 'utf8'));
  assertClean('llms.txt', readFileSync(at('crawl/llms.txt'), 'utf8'));
  const {entries} = JSON.parse(readFileSync(at('crawl/indexnow.json'), 'utf8'));
  assert.ok(entries.length > 1000);
  assertClean('indexnow.json', entries.map(([path]) => path).join('\n'));
  const donors = sitemapFiles.filter(f => f.startsWith('donors-')).flatMap(locs);
  assert.ok(donors.includes(`/subject/donor/${FIXTURE_ORGANISATION}`), 'the fixture organisation is listed');
  for (const label of fixtureLabels) assert.ok(!donors.includes(`/subject/donor/${label}`), 'a fixture individual is listed');
});

test('IndexNow fingerprints a person page by the donors it names', () => {
  const {entries} = JSON.parse(readFileSync(at('crawl/indexnow.json'), 'utf8'));
  const real = new Map(JSON.parse(readFileSync(join(pub, 'crawl/indexnow.json'), 'utf8')).entries);
  // The fixture donors change only the donor block of the top party's members' pages.
  const people = entries.filter(([path]) => path.startsWith('/subject/person/') && real.has(path));
  const changed = people.filter(([path, hash]) => real.get(path) !== hash).length;
  // Roster members of that party, plus seat-only rows the crawl adds from the electorate export.
  const members = roster.filter(p => foldDonorName(p.party_now || p.party || '') === foldDonorName(topParty.label)).length;
  assert.ok(changed > 0 && changed <= members * 1.1 && changed < people.length / 2, `${changed} of ${people.length} person fingerprints changed for ${members} members`);
});

test('a person page re-pings when the donor names it shows change, and for nothing else in that block', async () => {
  const fingerprints = async money => {
    const dir = exportRoot(money);
    try { await buildCrawl(dir); return new Map(JSON.parse(readFileSync(join(dir, 'crawl/indexnow.json'), 'utf8')).entries); }
    finally { rmSync(dir, {recursive: true, force: true}); }
  };
  const base = new Map(JSON.parse(readFileSync(at('crawl/indexnow.json'), 'utf8')).entries);
  const moved = entries => [...entries].filter(([path, hash]) => path.startsWith('/subject/person/') && base.get(path) !== hash).map(([path]) => path);
  // Amounts change, for a named organisation and for an unnamed (withheld) donor: no name shown changes.
  const organisationId = `donor:${FIXTURE_ORGANISATION.toLowerCase()}`;
  const amounts = {...fixtureGraph, edges: fixtureGraph.edges.map(e => e.source === organisationId || e.source === fixtureNodes[0].id ? {...e, total: e.total + 1, byYear: {2020: [e.total + 1, 1]}} : e)};
  assert.deepEqual(moved(await fingerprints(amounts)), [], 'an amount re-pinged a page');
  // A fictional organisation renamed: exactly the pages showing it re-ping.
  const renamed = {...fixtureGraph, nodes: fixtureGraph.nodes.map(n => n.id === organisationId ? {...n, label: 'Fixtureworks Renamed Holdings Pty Ltd'} : n)};
  const changed = moved(await fingerprints(renamed));
  const showing = [];
  for (const path of base.keys()) if (path.startsWith('/subject/person/') && (await (await fetchWorker(path)).text()).includes(FIXTURE_ORGANISATION)) showing.push(path);
  assert.ok(showing.length > 50, `${showing.length} pages show the fixture organisation`);
  assert.deepEqual(changed.sort(), showing.sort());
});

// --- 3. API responses ----------------------------------------------------------------
const regions = {federal: '', qld: ' in Queensland', vic: ' in Victoria', tas: ' in Tasmania'};
const ask = async (question, extra = {}) => { const r = await fetchWorker('/api/ask', {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({question, ...extra})}); return {status: r.status, text: await r.text()}; };
/** The fixed reply, and nothing from the question in it: no withheld name in the answer text. */
function assertWithheldReply(where, out) {
  assert.equal(out.answer, WITHHELD_DONOR_REPLY, `${where}: not the fixed reply`);
  assert.equal(namesIn(out.answer).length, 0, `${where}: the answer names a withheld donor`);
}

test('money rankings from /api/ask and the voice tools withhold individual donors', async () => {
  const graphsByJur = {federal: graphs[0], qld: graphs[1], vic: graphs[2], tas: graphs[3]};
  let calculated = 0;
  for (const [jur, region] of Object.entries(regions)) {
    const parties = graphsByJur[jur].nodes.filter(n => n.kind === 'party').map(n => n.label);
    for (const question of [`Who donates the most to whom${region}?`, `Who are the biggest political donors${region}?`, ...parties.map(p => `Who donates the most to ${p}${region}?`), ...parties.map(p => `How much did individual donors give to ${p}${region}?`)]) {
      const {status, text} = await ask(question);
      if (status === 200 && JSON.parse(text).answer_status === 'calculated') calculated++;
      assertClean(`ask (${jur})`, text);
    }
  }
  assert.ok(calculated > 20, `${calculated} calculated rankings`);
  const top = JSON.parse((await ask(`Who donates the most to ${topParty.label}?`)).text);
  assert.equal(top.answer_status, 'calculated');
  // The fixture organisation has the largest total and the fixture individuals the next four: a five-row table.
  assert.ok(top.answer.includes(FIXTURE_ORGANISATION), 'the fixture organisation is named');
  assert.equal((top.answer.match(/\| Donor \d+ \(name withheld\) \|/g) || []).length, 4, 'the fixture individuals rank as withheld donors');
});

test('a question naming a withheld donor gets one fixed reply from /api/ask, with no model call', async t => {
  const party = topParty.label;
  outbound.length = 0;
  for (const label of checked) {
    for (const question of [`How much did ${label} donate?`, `Who donates the most to ${party} from ${label}?`, `What has ${label} given to ${party} since 2020?`]) {
      const {status, text} = await ask(question);
      assert.equal(status, 200);
      const out = JSON.parse(text);
      assertWithheldReply('ask by name', out);
      assert.equal(out.answer_status, 'withheld');
      assert.deepEqual(out.sources, []);
      assert.equal(withheldLinks(text).length, 0);
    }
    // A follow-up inherits the name from the reader's earlier turn.
    const follow = JSON.parse((await ask('And in 2021?', {context: [{author: 'user', text: `How much did ${label} donate to ${party}?`}]})).text);
    assertWithheldReply('follow-up', follow);
  }
  assert.equal(outbound.length, 0, 'a named question reached a model');
  assert.ok(checked.length > 300, `${checked.length} withheld names asked`);
  // Organisations are unaffected, including one whose name holds a withheld donor's.
  const organisations = graphs[0].nodes.filter(n => n.kind === 'donor' && !donorNameWithheld(index, n.label)).slice(0, 25);
  let answered = 0;
  for (const n of organisations) {
    const out = JSON.parse((await ask(`Who receives the most funding from ${n.label}?`)).text);
    assert.notEqual(out.answer_status, 'withheld', `organisation ${organisations.indexOf(n)} was withheld`);
    if (out.answer_status === 'calculated') answered++;
  }
  assert.equal(answered, organisations.length, `${answered} of ${organisations.length} organisation questions calculated`);
  t.diagnostic(`${checked.length} withheld names asked four ways; ${answered} of ${organisations.length} organisation questions calculated`);
});

test('a one-word withheld label is refused only in donor context', async t => {
  const single = withheldLabels.filter(label => !/\S\s+\S/.test(label.trim()) && !rosterNames.has(foldDonorName(label)));
  assert.ok(single.length > 5, `${single.length} one-word labels`);
  for (const word of single) {
    for (const question of [`What has parliament said about ${word} outages?`, `Which ministers met ${word} staff last year?`]) {
      const out = JSON.parse((await ask(question)).text);
      assert.notEqual(out.answer, WITHHELD_DONOR_REPLY, `ordinary question ${single.indexOf(word)} was refused`);
    }
    for (const question of [`How much did ${word} donate?`, `donations from ${word}`, `Who is the donor ${word}?`, `"${word}"`, `${word} donated to Labor`, `Who receives the most funding from ${word}?`])
      assertWithheldReply(`donor-intent question ${single.indexOf(word)}`, JSON.parse((await ask(question)).text));
  }
  t.diagnostic(`${single.length} one-word withheld labels: ordinary questions pass, donor-intent questions refused`);
});

test('a question or search is never echoed into page metadata or a share card', async () => {
  const marker = 'Zebracorn quarterly fixture question';
  const questions = [marker, ...checked.slice(0, 60).map(label => `How much did ${label} donate?`)];
  for (const [i, q] of questions.entries()) {
    for (const path of [`/ask?${new URLSearchParams({q})}`, `/ask?${new URLSearchParams({view: 'search', q})}`, `/search?${new URLSearchParams({q})}`]) {
      const response = await fetchWorker(path);
      const html = rendered(await response.text());
      assert.ok(!decode(html).toLowerCase().includes('zebracorn'), `question ${i} echoed into ${path.split('?')[0]}`);
      assertClean(`question ${i} on ${path.split('?')[0]}`, html);
    }
    for (const card of ['/og/ask.png', '/og/ask.jpg', '/og/search.png']) {
      const response = await fetchWorker(`${card}?${new URLSearchParams({q})}`);
      const text = await response.text();
      assert.equal(response.status, 200, `${card} is drawn`);
      assert.ok(response.headers.get('x-opax-og') && text.startsWith('{'), `${card} is a card`);
      assert.ok(!text.toLowerCase().includes('zebracorn'), `question ${i} drawn on ${card}`);
      assertClean(`question ${i} on ${card}`, text);
    }
  }
});

test('follow-up suggestions, the search overview, voice tools and the money overview never take a withheld name', async () => {
  const party = topParty.label;
  outbound.length = 0;
  for (const label of checked.slice(0, 120)) {
    const followups = await fetchWorker('/api/followups', {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({question: `How much did ${label} donate to ${party}?`, answer: 'An answer.', passages: [{title: 'x', text: 'y '.repeat(200)}]})});
    assert.deepEqual(await followups.json(), {questions: []});
    const summary = await fetchWorker(`/api/search-summary?${new URLSearchParams({q: `${label} donations`})}`);
    if (summary.status === 200) { const out = await summary.json(); assert.deepEqual(out.points ?? [], []); }
  }
  assert.equal(outbound.length, 0, 'a named follow-up or overview reached a model');
  const voice = await build({entryPoints: [new URL('../src/voice-tools.ts', import.meta.url).pathname], bundle: true, write: false, platform: 'node', format: 'esm'});
  const {runVoiceTool} = await import('data:text/javascript;base64,' + Buffer.from(voice.outputFiles[0].text).toString('base64'));
  const read = async () => { throw new Error('No retrieval for a withheld name'); };
  for (const label of checked) for (const [tool, args] of [['search_records', {query: `How much did ${label} donate to ${party}?`, kind: 'receipt'}], ['search_records', {query: `${label} donations`}], ['find_connections', {query: label}]]) {
    const out = await runVoiceTool(tool, args, env, read);
    assertWithheldReply(`voice ${tool}`, out.data);
    assert.deepEqual(out.sources, []);
  }
});

test('/api/search-all, the journey story and the connection tools never return a withheld donor', async () => {
  for (const label of checked) for (const kind of ['all', 'donor', 'receipt', 'access', 'campaigner']) {
    const response = await fetchWorker(`/api/search-all?${new URLSearchParams({q: label, kind})}`);
    if (response.status !== 200) continue;
    const {results} = await response.json();
    assertClean(`search-all ${kind}`, JSON.stringify(results.filter(r => ['donor', 'receipt', 'access', 'campaigner'].includes(r.kind))));
    assert.equal(withheldLinks(JSON.stringify(results)).length, 0, `search-all ${kind}: withheld link`);
  }
  // Narration: what would be sent to the model names nobody withheld.
  for (const jurisdiction of ['federal', 'qld', 'vic', 'tas']) {
    const g = graphs[['federal', 'qld', 'vic', 'tas'].indexOf(jurisdiction)];
    const industries = [...new Set(g.nodes.filter(n => n.kind === 'donor' && n.industry).map(n => n.industry))];
    for (const industry of industries) {
      outbound.length = 0;
      await fetchWorker('/api/journey-story', {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({jurisdiction, lens: 'industry', focus: industry})});
      for (const body of outbound) assertClean(`journey story ${jurisdiction}/${industry}`, body);
    }
    for (const n of g.nodes.filter(n => n.kind === 'donor' && donorNameWithheld(index, n.label)).slice(0, 40)) for (const lens of ['multiple-parties', 'over-time']) {
      outbound.length = 0;
      const response = await fetchWorker('/api/journey-story', {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({jurisdiction, lens, focus: n.id})});
      assert.equal(response.status, 404, `journey story focused on a withheld donor (${jurisdiction})`);
      assert.equal(outbound.length, 0);
    }
  }
  const voice = await build({entryPoints: [new URL('../src/voice-tools.ts', import.meta.url).pathname], bundle: true, write: false, platform: 'node', format: 'esm'});
  const {runVoiceTool} = await import('data:text/javascript;base64,' + Buffer.from(voice.outputFiles[0].text).toString('base64'));
  const read = async () => { throw new Error('No speech retrieval in this test'); };
  for (const label of checked) {
    const out = await runVoiceTool('find_connections', {query: label}, env, read).catch(() => null);
    if (out) assertClean('voice find_connections', JSON.stringify(out));
  }
  for (const [jur, region] of Object.entries(regions)) {
    const g = graphs[Object.keys(regions).indexOf(jur)], received = new Map();
    for (const e of g.edges) if (!e.flow && !e.grant) received.set(e.target, (received.get(e.target) || 0) + e.total);
    const party = g.nodes.find(n => n.id === [...received].sort((a, b) => b[1] - a[1])[0][0]).label;
    const out = await runVoiceTool('search_records', {query: `Who donates the most to ${party}${region}?`, kind: 'receipt'}, env, read).catch(() => null);
    assert.ok(out, `voice receipts ${jur}`);
    assertClean(`voice receipts ${jur}`, JSON.stringify(out));
  }
});

test('the published search catalogue holds no donor, receipt, meeting or campaigner record for a withheld donor', () => {
  const realIndex = donorPrivacyIndex(MONEY_GRAPHS.map(path => real(path.slice(1))));
  const {version} = real('search-catalog/manifest.json');
  let records = 0;
  for (const name of readdirSync(join(pub, 'search-catalog', version)).filter(f => f.startsWith('records-'))) {
    for (const r of real(`search-catalog/${version}/${name}`)) {
      records++;
      const subject = r.kind === 'receipt' ? r.title.split(' → ')[0] : r.kind === 'access' ? r.title.split(' — ')[0] : r.title;
      if (r.kind === 'donor') assert.ok(!donorNameWithheld(realIndex, subject), `search donor ${r.slug}`);
      if (r.kind === 'receipt') assert.ok(!donorNameWithheld(realIndex, subject), `search receipt ${r.slug}`);
      if (r.kind === 'campaigner') assert.ok(!realIndex.withheld.has(foldDonorName(subject)), `search campaigner ${r.slug}`);
      if (r.kind === 'access') for (const part of r.title.split(' — ')) assert.ok(!realIndex.withheld.has(foldDonorName(part)), `search access ${r.slug}`);
    }
  }
  assert.ok(records > 100000);
});
