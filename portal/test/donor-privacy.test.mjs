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
import {MONEY_GRAPHS, isOrganisationDonor, donorPrivacyIndex, donorNameWithheld, foldDonorName} from '../public/donor-entity.js';
import {partyUrl} from '../public/canonical-urls.js';
import {buildCrawl} from '../../scripts/build_crawl_catalog.mjs';

const pub = new URL('../public/', import.meta.url).pathname;
const real = path => JSON.parse(readFileSync(join(pub, path), 'utf8'));

// --- fixtures: fictional donors to the party with the most receipts --------------
const federal = real('graph/money.json');
const inbound = new Map();
for (const e of federal.edges) if (!e.flow && !e.grant) inbound.set(e.target, (inbound.get(e.target) || 0) + e.total);
const topParty = federal.nodes.find(n => n.id === [...inbound].sort((a, b) => b[1] - a[1])[0][0]);
const FIXTURE_INDIVIDUALS = [['Quillon Fixturewright', 'media', ['Q. Fixturewright']], ['Mrs Verity Fixturemoor AO', 'finance', []], ['Fixturemoor, Ottoline', 'unions', []], ['Bertram Fixturebay', 'individual', []]];
const FIXTURE_ORGANISATION = 'Fixtureworks Holdings Pty Ltd';
const big = Math.max(...federal.edges.map(e => e.total)) * 2;
const fixtureNodes = [...FIXTURE_INDIVIDUALS, [FIXTURE_ORGANISATION, 'property', []]].map(([label, industry, aliases], i) => ({
  id: `donor:${label.toLowerCase()}`, label, kind: 'donor', industry, group: industry, total: big + i, count: 1, firstYear: 2020, lastYear: 2020, byYear: {2020: [big + i, 1]}, aliases,
}));
const fixtureGraph = {...federal, nodes: [...federal.nodes, ...fixtureNodes],
  edges: [...federal.edges, ...fixtureNodes.map(n => ({source: n.id, target: topParty.id, total: n.total, count: 1, firstYear: 2020, lastYear: 2020, byYear: {2020: [n.total, 1]}}))]};

// The export with the fixture graph in place: every other entry is a symlink.
const root = mkdtempSync(join(tmpdir(), 'opax-donor-privacy-'));
for (const entry of readdirSync(pub)) if (!['crawl', 'person-paths.js', 'graph'].includes(entry)) symlinkSync(join(pub, entry), join(root, entry));
mkdirSync(join(root, 'graph'));
for (const entry of readdirSync(join(pub, 'graph'))) if (entry !== 'money.json') symlinkSync(join(pub, 'graph', entry), join(root, 'graph', entry));
writeFileSync(join(root, 'graph', 'money.json'), JSON.stringify(fixtureGraph));
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
// The export's own individual-tagged donors without organisation evidence, plus the
// fixtures. An individual-tagged label another register records as an organisation
// (a supplier, agency, grant company or campaigner of that exact name), or one
// naming Australia, is a mis-tagged organisation: still withheld everywhere, and
// still covered by the link and own-page checks, but not a person's name to scan for.
const known = [...new Set(donorNodes.filter(n => (n.industry === 'individual' || fixtureLabels.has(n.label)) && donorNameWithheld(index, n.label)).map(n => n.label))]
  .filter(label => fixtureLabels.has(label) || (!/\baustralian?\b/i.test(label) && !organisationFolds.has(foldDonorName(label))));
// A parliamentarian or minister who also gave to a party is named as an office
// holder; their donor record is still covered by the link checks.
const roster = real('parliamentarians.json').people;
const access = real('access.json');
const rosterNames = new Set([...roster.flatMap(p => [p.name, p.full]), ...Object.values(access.ministers).map(m => m.name)].filter(Boolean).map(foldDonorName));
const checked = known.filter(label => !rosterNames.has(foldDonorName(label)));
const individualTagged = new Set(donorNodes.filter(n => n.industry === 'individual' && donorNameWithheld(index, n.label)).map(n => n.label)).size;
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
    byStart.get(key).push({name, phrase: phrase(name)});
  }
  return text => {
    const w = words(text), joined = ` ${w.join(' ')} `, hits = new Set();
    for (let i = 0; i < w.length; i++) for (const key of [`${w[i]} ${w[i + 1]}`, w[i]]) for (const c of byStart.get(key) || []) {
      if (hits.has(c.name) || !joined.includes(c.phrase)) continue;
      let rest = joined;
      // Repeat: back-to-back copies of a name share the space between them.
      for (const longer of allowed.get(c.name) || []) while (rest.includes(longer)) rest = rest.replaceAll(longer, ' ');
      if (rest.includes(c.phrase)) hits.add(c.name);
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

// --- 1. server-rendered HTML -----------------------------------------------------
const locs = name => [...readFileSync(at(`crawl/sitemaps/${name}`), 'utf8').matchAll(/<loc>https:\/\/opax\.com\.au([^<]+)<\/loc>/g)].map(m => decode(m[1]));
const sitemapFiles = readdirSync(at('crawl/sitemaps'));

test('every server-rendered person, party, money, hub, campaigner and supplier page names no withheld donor', async t => {
  let interestMentions = 0;
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
    // A member's declared interests are the parliamentary register's own words
    // (CC BY-NC-ND: no derivatives), so a gift giver there is counted, not failed.
    const [before, interests = '', after = ''] = html.split(/(<h2>Declared interests<\/h2>[\s\S]*?)(?=<h2>)/);
    if (interests && namesIn(interests).length) interestMentions++;
    assert.equal(withheldLinks(interests).length, 0, `${path}: withheld link in declared interests`);
    assertClean(path, rendered(before + after));
  }
  assert.ok(personDonorBlocks > 500, `${personDonorBlocks} person pages still list organisational donors`);
  t.diagnostic(`${personDonorBlocks} person pages list organisational donors; ${interestMentions} carry a withheld donor's name in the member's own declared interests`);
  t.diagnostic(`scanned for ${checked.length} names: ${individualTagged} withheld individual-tagged labels, less ${individualTagged + fixtureLabels.size - known.length} mis-tagged organisations and ${known.length - checked.length} office holders, plus ${fixtureLabels.size} fixtures`);
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

// --- 3. API responses ----------------------------------------------------------------
const regions = {federal: '', qld: ' in Queensland', vic: ' in Victoria', tas: ' in Tasmania'};
const ask = async question => { const r = await fetchWorker('/api/ask', {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({question})}); return {status: r.status, text: await r.text()}; };

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
  assert.equal((top.answer.match(/\| Donor \d+ \(name withheld\) \|/g) || []).length, FIXTURE_INDIVIDUALS.length, 'the fixture individuals rank as withheld donors');
  assert.ok(top.answer.includes(FIXTURE_ORGANISATION), 'the fixture organisation is named');
  // Asked by name, a withheld donor is never matched, totalled or linked.
  for (const label of checked) {
    const {text} = await ask(`How much did ${label} donate?`);
    const out = JSON.parse(text);
    assert.notEqual(out.answer_status, 'calculated', 'a withheld donor asked by name was calculated');
    assert.equal(withheldLinks(text).length, 0, 'a withheld donor asked by name was linked');
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
