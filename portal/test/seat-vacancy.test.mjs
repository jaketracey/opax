// A seat vacant when the Assembly expired (Brunswick, 2026): the seat pages say so, its last member is
// never shown as current, the finder returns no member for it, and no other Victorian seat changes.
import './helpers/vic-election-clock.mjs';
import test, {after, beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import {build} from 'esbuild';
import {seatVacancy, vacatedSeat, vacancyText, lastMemberText, servedText} from '../public/seat-vacancy.js';
import {profileHTML, personElectorateLinksHTML, personRepresentationRows, directorySpec} from '../public/electorates.js';
import {VIC_ELECTION_ASSET, VIC_ELECTION_PLACES} from '../public/vic-election.js';
import {loadWorker, offline} from './worker-harness.mjs';

beforeEach(t => t.mock.timers.enable({apis: ['Date'], now: Date.parse('2026-11-16T10:00:00+11:00')}));
const publicRoot = new URL('../public/', import.meta.url);
const json = path => JSON.parse(readFileSync(new URL(path.replace(/^\//, ''), publicRoot), 'utf8'));
const compile = async entry => {
  const r = await build({entryPoints: [new URL(entry, import.meta.url).pathname], bundle: true, platform: 'browser', format: 'esm', write: false, external: ['node:*'],
    plugins: [{name: 'omit-og', setup(b) { b.onResolve({filter: /^\.\/og-render$/}, () => ({path: 'renderer', namespace: 'vacancy-test'})); b.onLoad({filter: /.*/, namespace: 'vacancy-test'}, () => ({contents: 'export const renderOgPng=async()=>null; export const cardSpec=x=>x;'})); }}]});
  return import('data:text/javascript;base64,' + Buffer.from(r.outputFiles[0].text).toString('base64'));
};
const {renderVicElection, findSeats, recorded, rosterDate} = await compile('../src/vic-election.ts');
const {validateVicElection} = await compile('../src/vic-election-data.ts');

const manifest = json('electorates/manifest.json');
const index = json(manifest.index_url);
const people = json(manifest.people_url).people;
const hub = json(VIC_ELECTION_ASSET);
const places = json(VIC_ELECTION_PLACES);
const row = index.electorates.find(e => e.jurisdiction === 'vic' && e.chamber === 'vic_la' && e.name === 'Brunswick');
const detail = json(row.detail_url);
const seat = hub.seats.find(s => s.kind === 'district' && s.name === 'Brunswick');
const VACANT = 'Vacant when the Assembly expired on 3 November.';
const LAST = 'Last member: Tim Read, to 19 September 2026.';
const SERVED = 'Member for Brunswick, 2018 to 19 September 2026';
const text = html => new JSDOM(html).window.document.body.textContent.replace(/\s+/g, ' ');
// Wording this change must never add: a cause, a tribute, or a claim that he holds the seat.
const FORBIDDEN = /the late|died|death|deceased|passed away|tribute|condolence|vale\b/i;

test('the wording is one sentence each, in Australian date order, with no em dash', () => {
  assert.equal(vacancyText({as_of: '2026-11-03', chamber: 'vic_la'}), VACANT);
  assert.equal(vacancyText({as_of: '2026-11-03', chamber: 'vic_la'}, 'Brunswick'), 'Brunswick was vacant when the Assembly expired on 3 November.');
  assert.equal(lastMemberText('Tim Read', '2026-09-19'), LAST);
  assert.equal(servedText('Brunswick', '2018-11-24', '2026-09-19'), SERVED);
  for (const s of [VACANT, LAST, SERVED]) assert.doesNotMatch(s, /—/);
});

test('the release records the vacancy and its last member through the existing fields', () => {
  assert.deepEqual(row.representatives, []);
  assert.equal(row.representation_status, 'verified');
  assert.equal(row.representation_as_of, '2026-11-03');
  assert.equal(row.dissolved_for, '2026-11-28');
  const vacancy = seatVacancy(detail);
  assert.equal(vacancy.as_of, '2026-11-03');
  assert.deepEqual({name: vacancy.last.name, party: vacancy.last.party, start: vacancy.last.start, end: vacancy.last.end},
    {name: 'Tim Read', party: 'Greens', start: '2018-11-24', end: '2026-09-19'});
  // Every other seat in every parliament reads as no vacancy.
  const vacant = index.electorates.filter(e => e.representation_status === 'verified' && !e.representatives.length);
  assert.deepEqual(vacant.map(e => e.name), ['Brunswick']);
});

test('the Brunswick election page says vacant and names nobody as holding the seat', () => {
  assert.deepEqual(seat.members, []);
  const page = renderVicElection(hub, seat, {}, new Date());
  const body = text(page.html);
  assert.ok(body.includes(`Member${VACANT} ${LAST}`), body.slice(0, 600));
  assert.match(page.html, /Last member: <a href="\/subject\/person\/tim-read">Tim Read<\/a>, to 19 September 2026\./);
  assert.doesNotMatch(body, /Held by|Who holds|Tim Read MP|Member for Brunswick(?!,)/);
  // He is named once, as the last member; the page has no record section for a member of the seat.
  assert.equal(page.html.split('Tim Read').length - 1, 1);
  assert.equal(new JSDOM(page.html).window.document.querySelector('#record'), null);
  // The meta description, the share card and the structured data name no holder.
  assert.ok(page.description.startsWith('Brunswick was vacant when the Assembly expired on 3 November. See the 2022 election result and winning margin.'));
  for (const outward of [page.description, JSON.stringify(page.card), JSON.stringify(page.jsonLd), page.title]) assert.doesNotMatch(outward, /Tim Read/);
  assert.equal(page.jsonLd['@graph'].find(n => n['@type'] === 'ItemList').numberOfItems, 0);
  assert.doesNotMatch(page.html, FORBIDDEN);
  // After the polls close the wording is the same: no "Member in published roster" line for this seat.
  const closed = renderVicElection(hub, seat, {}, new Date('2026-11-28T19:00:00+11:00'));
  assert.ok(text(closed.html).includes(`Member${VACANT} ${LAST}`));
  assert.doesNotMatch(text(closed.html), /Member in published roster dated/);
});

test('the finder returns no member for Brunswick, by district, suburb, postcode or his name', () => {
  for (const q of ['Tim Read', 'tim read', 'Read', 'read']) {
    const hits = findSeats(q, hub, places);
    assert.equal(hits.filter(h => h.kind === 'Member' && h.seats.some(x => x.seat.name === 'Brunswick')).length, 0, q);
    assert.ok(!hits.some(h => h.name === 'Tim Read'), q);
  }
  assert.deepEqual(findSeats('Tim Read', hub, places), []);
  for (const q of ['Brunswick', 'Brunswick East', '3056']) {
    const hits = findSeats(q, hub, places);
    const found = hits.flatMap(h => h.seats).filter(x => x.seat.name === 'Brunswick');
    assert.ok(found.length, q);
    assert.ok(found.every(x => x.seat.members.length === 0), q);
    const html = renderVicElection(hub, null, {}, new Date(), {place: q, hits}).html;
    const results = new JSDOM(html).window.document.querySelector('.vic-hits');
    const rowText = [...results.querySelectorAll('a.vic-seat')].find(a => a.querySelector('.vic-seat-name').textContent === 'Brunswick').textContent;
    assert.match(rowText, /Vacant/, q);
    assert.doesNotMatch(results.textContent, /Tim Read/, q);
  }
});

test('no other Victorian seat changes: 87 districts and 8 regions keep their members and their pages', () => {
  const districts = hub.seats.filter(s => s.kind === 'district'), regions = hub.seats.filter(s => s.kind === 'region');
  assert.equal(districts.length, 88); assert.equal(regions.length, 8);
  assert.deepEqual(hub.seats.filter(s => s.vacancy).map(s => s.name), ['Brunswick']);
  assert.equal(districts.filter(s => s.members.length === 1).length, 87);
  assert.ok(regions.every(s => s.members.length === 5));
  // Each seat's members are its release row's representatives, in order.
  for (const s of hub.seats) {
    const reps = index.electorates.find(e => e.url === s.electorate_url).representatives;
    assert.deepEqual(s.members.map(m => m.name), reps.map(r => r.person.name), s.name);
  }
  // The roster date the pages and the app quote is still the roster's, not the vacancy's.
  assert.equal(rosterDate(hub), '2026-09-09');
  // Snapshot: with Brunswick given back its former member (the hub as built before the vacancy record),
  // every other seat's page is byte-identical, before and after the polls close.
  const before = structuredClone(hub);
  const old = before.seats.find(s => s.name === 'Brunswick');
  old.members = [old.vacancy.last]; old.roster_date = '2026-09-09'; delete old.vacancy;
  validateVicElection(before);
  for (const now of [new Date(), new Date('2026-11-28T19:00:00+11:00')]) {
    let same = 0;
    for (const s of hub.seats) {
      if (s.name === 'Brunswick' || s.name === seat.region) continue;
      const a = renderVicElection(hub, s, {}, now), b = renderVicElection(before, before.seats.find(x => x.path === s.path), {}, now);
      assert.deepEqual({html: a.html, title: a.title, description: a.description, jsonLd: a.jsonLd, card: a.card},
        {html: b.html, title: b.title, description: b.description, jsonLd: b.jsonLd, card: b.card}, s.name);
      same++;
    }
    assert.equal(same, 94);
    // The hub page and Brunswick's region differ only in Brunswick's own row.
    const rows = html => [...new JSDOM(html).window.document.querySelectorAll('a.vic-seat')].map(a => a.textContent);
    for (const path of [null, hub.seats.find(s => s.kind === 'region' && s.name === seat.region).path]) {
      const pick = d => path ? d.seats.find(s => s.path === path) : null;
      const a = rows(renderVicElection(hub, pick(hub), {}, now).html), b = rows(renderVicElection(before, pick(before), {}, now).html);
      assert.equal(a.length, b.length);
      // Brunswick's row reads Vacant either way (the page rule already said so); no row names him.
      assert.deepEqual(a, b);
      assert.match(a.find(t => t.startsWith('Brunswick')), /^Brunswick.*Vacant/);
      assert.ok(!a.some(t => t.includes('Tim Read')));
    }
  }
});

test('the electorate page says vacant with the last member, and the directory row says Vacant', async () => {
  const html = profileHTML(detail);
  const held = new JSDOM(html).window.document.querySelector('#el-held');
  assert.equal(held.querySelector('h2').textContent, 'Member');
  assert.equal(held.querySelector('.ui-empty').textContent, `${VACANT} ${LAST}`);
  assert.ok(held.querySelector('.ui-empty a').getAttribute('href').endsWith('/subject/person/tim-read'));
  assert.doesNotMatch(held.textContent, /Current member|Held by/);
  assert.doesNotMatch(new JSDOM(html).window.document.querySelector('.el-head').textContent, /Held by/);
  assert.doesNotMatch(html, FORBIDDEN);
  // Any other seat keeps its heading and member.
  const other = index.electorates.find(e => e.chamber === 'vic_la' && e.name === 'Northcote');
  const otherHeld = new JSDOM(profileHTML(json(other.detail_url))).window.document.querySelector('#el-held');
  assert.equal(otherHeld.querySelector('h2').textContent, 'Member until the Assembly expired on 3 November');
  assert.ok(otherHeld.textContent.includes(other.representatives[0].person.name));
  // The directory: one Vacant row, no member named on it.
  const realFetch = globalThis.fetch;
  globalThis.fetch = async url => Response.json(json(String(url)));
  try {
    const spec = await directorySpec();
    const rows = spec.items.filter(e => e.jurisdiction === 'vic').map(e => [e.name, e.chamber, new JSDOM(spec.row(e)).window.document.querySelector('.el-holders').textContent]);
    assert.deepEqual(rows.filter(([, , holders]) => /Vacant/.test(holders)).map(([name]) => name), ['Brunswick']);
    assert.match(rows.find(([name, chamber]) => name === 'Brunswick' && chamber === 'vic_la')[2], /^VacantVerified 3 Nov 2026$/);
    assert.ok(!rows.some(([, , holders]) => /Tim Read|not yet verified/.test(holders)));
    assert.ok(!spec.text(spec.items.find(e => e.electorate_id === row.electorate_id)).includes('Tim Read'));
  } finally { globalThis.fetch = realFetch; }
});

test('his person page gives the seat with the dates of his service and never reads as current', () => {
  const matches = people.filter(p => p.name === 'Tim Read');
  assert.equal(matches.length, 1);
  const person = matches[0];
  assert.ok(person.electorates.every(e => e.current === false));
  assert.deepEqual(vacatedSeat(person, index.electorates), {electorate_id: row.electorate_id, name: 'Brunswick', url: row.url, start: '2018-11-24', end: '2026-09-19'});
  const links = personElectorateLinksHTML(person, [], index.electorates);
  assert.equal(links, `Member for <a href="${row.url}">Brunswick</a>, 2018 to 19 September 2026`);
  const rows = personRepresentationRows(person, [], index.electorates);
  assert.deepEqual(rows.map(r => r[0]), ['Representation history']);
  assert.doesNotMatch(JSON.stringify(rows), /Verified|Electorate"/);
  // Nobody else in the release is the last member of a vacant seat, so every other person page is as it was.
  assert.deepEqual(people.filter(p => vacatedSeat(p, index.electorates)).map(p => p.name), ['Tim Read']);
  // No roster row calls him current, and no current list holds him.
  const roster = json('parliamentarians.json').people.filter(p => p.name === 'Tim Read');
  assert.equal(roster.length, 1);
  assert.ok(!roster[0].current && !roster[0].party_now);
  assert.ok(!index.electorates.some(e => e.representatives.some(r => r.person.name === 'Tim Read')));
});

const restore = offline();
after(restore);
const worker = await loadWorker(new URL('../src/index.ts', import.meta.url).pathname, publicRoot.pathname);
Object.assign(worker.env, {VIC_ELECTION_HUB_ENABLED: 'true', VIC_ELECTION_APP_ENABLED: 'true'});
const page = async path => {
  const response = await worker.fetch(path);
  assert.equal(response.status, 200, path);
  return new JSDOM(await response.text()).window.document;
};
const outward = doc => [doc.title, ...['meta[name="description"]', 'meta[property="og:description"]', 'meta[property="og:title"]', 'meta[name="twitter:description"]']
  .map(q => doc.querySelector(q)?.content || ''), doc.querySelector('#ld-page')?.textContent || ''].join('\n');

test('the Worker: his page title and header give the dated service, with no MP and no current seat', async () => {
  const doc = await page('/subject/person/tim-read');
  assert.ok(doc.title.startsWith(`Tim Read, ${SERVED}`), doc.title);
  assert.ok(doc.querySelector('.subject-head .subject-tag').textContent.includes(SERVED));
  assert.ok(doc.querySelector('meta[name="description"]').content.startsWith('Tim Read'));
  const all = outward(doc) + doc.querySelector('.subject-head').textContent;
  assert.doesNotMatch(all, /Tim Read MP|Sitting|Verified|former /);
  assert.doesNotMatch(all, FORBIDDEN);
  // A sitting member of the same house is untouched by the rule.
  const other = await page('/subject/person/kat-theophanous');
  assert.doesNotMatch(other.title, /\d{4} to \d/);
});

test('the Worker: the Brunswick electorate and election pages name no holder in metadata or cards', async () => {
  const electorate = await page(row.url);
  assert.ok(electorate.querySelector('meta[name="description"]').content.includes(VACANT));
  assert.doesNotMatch(outward(electorate), /Tim Read|No verified representative/);
  // The share cards (the harness returns each card's spec): the vacancy, and no holder.
  for (const [path, line] of [[row.url, VACANT], [seat.path, 'Brunswick was vacant when the Assembly expired on 3 November.']]) {
    const response = await worker.fetch(`/og${path}.png`);
    assert.equal(response.status, 200, path);
    const card = JSON.stringify(await response.json());
    assert.ok(card.includes(line), card);
    assert.doesNotMatch(card, /Tim Read/);
  }
  const personCard = JSON.stringify(await (await worker.fetch('/og/subject/person/tim-read.png')).json());
  assert.doesNotMatch(personCard, /Tim Read MP|Sitting|Member for Brunswick(?!,)/);
  const election = await page(seat.path);
  assert.ok(election.querySelector('meta[name="description"]').content.startsWith('Brunswick was vacant when the Assembly expired on 3 November.'));
  assert.doesNotMatch(outward(election), /Tim Read/);
  assert.ok(election.querySelector('main').textContent.replace(/\s+/g, ' ').includes(`${VACANT} ${LAST}`));
  // Another seat still names its member.
  const northcote = index.electorates.find(e => e.chamber === 'vic_la' && e.name === 'Northcote');
  assert.ok((await page(northcote.url)).querySelector('meta[name="description"]').content.includes(northcote.representatives[0].person.name));
});

test('the app endpoint keeps its shape: the row the apps word "Last held by", and no member search hit', async () => {
  const api = async path => { const r = await worker.fetch('/api/app/v1/vic-election' + path); assert.equal(r.status, 200, path); return r.json(); };
  const overview = await api('');
  assert.equal(overview.districts.length, 88);
  // The shipped decoders require a named member on every district row and at least one on a seat; for a
  // vacant seat it is the last member, which the apps print under "Last held by".
  assert.deepEqual(overview.districts.find(d => d.name === 'Brunswick').member, {name: 'Tim Read', party: 'Greens'});
  assert.ok(overview.districts.every(d => d.member.name));
  assert.equal(overview.roster_date, '2026-09-09');
  const detailRow = await api('/seat/brunswick');
  assert.deepEqual(detailRow.members.map(m => m.name), ['Tim Read']);
  assert.deepEqual(recorded(seat).map(m => m.name), ['Tim Read']);
  for (const q of ['tim%20read', 'read']) {
    const found = await api('/find?q=' + q);
    assert.ok(!found.hits.some(h => h.kind === 'Member' && (h.name === 'Tim Read' || h.seats.some(s => s.name === 'Brunswick'))), q);
  }
  assert.deepEqual((await api('/find?q=tim%20read')).hits, []);
  const byName = await api('/find?q=brunswick');
  assert.deepEqual(byName.hits.filter(h => h.seats.some(s => s.name === 'Brunswick')).map(h => h.kind), ['District', 'Suburb']);
});
