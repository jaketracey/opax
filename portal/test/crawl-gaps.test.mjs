import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, stat} from 'node:fs/promises';
import {readPartyPages, canonicalPartyPages, resolvePartyPage, partyPageCoverage, partyMembers, partyBills} from '../public/party-page.js';
import {renderDirectory} from '../src/seo-content.ts';
import {officialReportCrawlEntries} from '../../scripts/official_report_crawl.mjs';
import {sitemapFiles, latestDate, exportDate, personPaths} from '../../scripts/build_crawl_catalog.mjs';

const root = new URL('../public/', import.meta.url);
const read = async path => JSON.parse(await readFile(new URL(path.replace(/^\//, ''), root), 'utf8'));
const paths = xml => [...xml.matchAll(/<loc>https:\/\/opax.com.au([^<]+)<\/loc>/g)].map(m => m[1]);
// Finding 13's seven labels outside both the live directory and sitemap. The Liberal Democratic Party's page
// is the Libertarian Party's since the rename (labels.js PARTY_RENAMES): one page, at the current name.
const missing = ["Australia's Voice", 'Australian Conservatives', 'Australian Motoring Enthusiast Party',
  "Derryn Hinch's Justice Party", 'Gerard Rennick People First', 'Jacqui Lambie Network', 'Libertarian Party'];

test('party directory and sitemap use the same canonical inventory, including the seven audit gaps', async () => {
  const pages = await readPartyPages(read);
  const directory = await renderDirectory('party', new URL('https://opax.test/subject/party'), read, [], new Map(), {});
  const manifest = await read('/crawl/manifest.json');
  const xml = (await Promise.all(manifest.files.filter(f => /^\/sitemaps\/parties-/.test(f.path)).map(f => readFile(new URL('crawl' + f.path, root), 'utf8')))).join('');
  assert.deepEqual(paths(xml).sort(), pages.map(p => p.href).sort());
  assert.deepEqual([...directory.html.matchAll(/href="(\/subject\/party\/[^"?]+)"/g)].map(m => m[1]).sort(), pages.map(p => p.href).sort());
  for (const label of missing) {
    const page = pages.find(p => p.label === label);
    assert.ok(page, label);
    assert.ok(directory.html.includes(page.href), label);
    assert.ok(directory.html.includes('No party-level disclosure file held by OPAX.'));
    assert.ok(page.roster || page.divisions);
  }
  assert.equal(pages.filter(p => p.aliases.includes('JLN') || p.aliases.includes('Jacqui Lambie Network')).length, 1);
  assert.equal(resolvePartyPage('jln', pages).href, '/subject/party/jacqui-lambie-network');
  assert.ok(!paths(xml).includes('/subject/party/jln'));
  // A renamed party: one entry at its current address, none at the old one.
  assert.equal(pages.filter(p => p.aliases.includes('Liberal Democratic Party') || p.aliases.includes('Libertarian Party')).length, 1);
  assert.ok(paths(xml).includes('/subject/party/libertarian-party'));
  assert.ok(!paths(xml).includes('/subject/party/liberal-democratic-party'));
  assert.ok(!directory.html.includes('/subject/party/liberal-democratic-party'));
});

test('party_now, recorded roster labels and division parties survive without money or live counts', () => {
  const pages = canonicalPartyPages({
    money: [{nodes: [{kind: 'party', label: 'One Nation'}]}],
    roster: {people: [{party: 'JLN', party_now: "Australia's Voice", recorded_parties: [{party: 'DLP'}]}]},
    divisions: {parties: ['Jacqui Lambie Network', "Pauline Hanson's One Nation Party", 'Gerard Rennick People First']},
  });
  assert.deepEqual(pages.map(p => p.label), ["Australia's Voice", 'DLP', 'Gerard Rennick People First', 'Jacqui Lambie Network', 'One Nation']);
  assert.equal(resolvePartyPage('pauline-hansons-one-nation-party', pages).label, 'One Nation');
});

test('directory discovery uses the small party-member export and tolerates its absence', async () => {
  const requested = [];
  const assets = {
    '/parliamentarians.json': {people: [{name: 'Fixture Member', party: 'Labor', party_now: 'Independent'}]},
    '/graph/party-members.json': {parties: {'Fixture Parliamentary Party': [{name: 'Fixture Person'}]}},
  };
  const reader = async path => {
    requested.push(path);
    if (path.startsWith('/graph/money')) return {nodes: []};
    if (assets[path]) return assets[path];
    throw Error('Unavailable fixture');
  };
  const pages = await readPartyPages(reader);
  assert.ok(pages.some(p => p.label === 'Fixture Parliamentary Party'));
  assert.ok(!requested.includes('/divisions/index.json'));
  delete assets['/graph/party-members.json'];
  assert.deepEqual((await readPartyPages(reader)).map(p => p.label), ['Independent', 'Labor']);
});

test('directory coverage is exact, capitalised, and distinguishes independents from organisations', async () => {
  const pages = await readPartyPages(read);
  for (const label of ['Australian Conservatives', 'Australian Motoring Enthusiast Party', "Derryn Hinch's Justice Party", 'Gerard Rennick People First']) {
    assert.equal(partyPageCoverage(pages.find(p => p.label === label)), 'Recorded divisions. No party-level disclosure file held by OPAX.');
  }
  // The Libertarian Party's page holds the roster (its current name), the divisions (its former one) and,
  // since its money-map node (export rule 10), its receipts under both names.
  assert.equal(partyPageCoverage(pages.find(p => p.label === 'Libertarian Party')), 'Published political receipts; federal and state returns remain separate.');
  assert.equal(partyPageCoverage(pages.find(p => p.label === 'Independent')), 'Parliamentarians who sat without a party. Not a party organisation.');
  assert.equal(pages.find(p => p.label === 'DLP').name, 'Democratic Labour Party');
  const directory = await renderDirectory('party', new URL('https://opax.test/subject/party'), read, [], new Map(), {});
  assert.ok(directory.html.includes('Parliamentarians who sat without a party. Not a party organisation.'));
  assert.ok(directory.html.includes('>Democratic Labour Party</a>'));
  assert.ok(!directory.html.includes('—'));
});

test('one membership rule preserves previous affiliations and joins aliases by person ID', () => {
  const roster = {people: [
    {name: 'Alex Example', pid: 'fixture-1', party: 'JLN', party_now: 'Independent', current: true},
    {name: 'Example', pid: 'fixture-1', party: 'Jacqui Lambie Network'},
  ]};
  const divisions = {parties: {'Jacqui Lambie Network': [{name: 'Alex Example'}, {name: 'Casey Fixture'}]}};
  const previous = partyMembers('Jacqui Lambie Network', {roster, divisions});
  assert.equal(previous.current.length, 0);
  assert.deepEqual(previous.former.map(p => p.name).sort(), ['Alex Example', 'Casey Fixture']);
  const now = partyMembers('Independent', {roster, divisions});
  assert.deepEqual(now.current.map(p => p.name), ['Alex Example']);
});

test('person addresses add vote aliases only through recorded or reviewed IDs, preserving existing identities', () => {
  const people = [
    {name: 'Alexander Example', pid: 'fixture-1', speeches: 10},
    {name: 'C.F. Fixture', speeches: 5},
    {name: 'Alex Example', pid: 'fixture-3', speeches: 2},
  ];
  const paths = personPaths(people, {
    'fixture-1': {name: 'Alex Example'},
    'fixture-2': {name: 'Casey Fixture'},
    'fixture-4': {name: 'Unlinked Example'},
  }, {'c.f. fixture': {key: 'fixture-2'}});
  assert.equal(paths.folded['alex example'], paths.exact['Alex Example'], 'a printed identity is never overwritten by a vote alias');
  assert.equal(paths.folded['casey fixture'], paths.exact['C.F. Fixture']);
  assert.ok(!paths.folded['unlinked example']);
  const ordinary = personPaths(people.slice(0, 1), {'fixture-1': {name: 'Alex Example'}});
  assert.equal(ordinary.folded['alex example'], ordinary.exact['Alexander Example']);
});

test('a supplied division slug is authoritative; only rows without one join on the printed name', () => {
  const roster = {people: [{name: 'Alex Example', pid: 'fixture-1', party: 'Fixture Party'}]};
  const divisions = {parties: {'Fixture Party': [
    {name: 'Alex Example', slug: 'different-person', divisions: 2},
    {name: 'Alex Example', slug: null, divisions: 3},
    {name: 'Another print', slug: 'different-person', divisions: 4},
  ]}};
  const {former} = partyMembers('Fixture Party', {roster, divisions});
  assert.equal(former.length, 2);
  assert.equal(former.find(p => p.pid === 'fixture-1').divisions, 3);
  assert.equal(former.find(p => !p.pid).divisions, 6, 'an unknown slug still identifies one division person');
});

test('real division name variants join the roster person addresses once per affiliation', async () => {
  const {personUrl} = await import('../public/party-page.js');
  const roster = await read('/parliamentarians.json'), divisions = await read('/graph/party-members.json');
  const votes = await read('/votes.json');
  for (const pid of ['10511', '10212', '10633', '10842']) {
    const print = roster.people.find(p => p.pid === pid) || roster.people.find(p => personUrl(p.name) === personUrl(votes[pid].name));
    assert.ok(print, pid);
    const division = divisions.parties[votes[pid].party].find(m => m.name === votes[pid].name);
    assert.ok(division?.slug, pid);
    assert.notEqual(print.name, division.name, 'this regression covers different printed names');
    assert.equal(personUrl(division.name), personUrl(print.name));
    const members = partyMembers(votes[pid].party, {roster, divisions});
    const matches = [...members.current, ...members.former].filter(m => personUrl(m.name) === personUrl(print.name));
    assert.equal(matches.length, 1, pid);
    assert.equal(matches[0].roster, print);
    assert.ok(matches[0].divisions >= division.divisions);
  }
});

test('official report discovery uses public indexed records and their dates, with bounded indexed sitemap files', async () => {
  const type = 'agency_report';
  const slug = suffix => 'agency-report-fixture-' + suffix;
  const row = (suffix, flags = {}) => ({slug: slug(suffix), ...flags});
  const record = (suffix, flags = {}) => ({schema: 1, kind: 'report', report_type: type, slug: slug(suffix), date: '2026-09-10', snapshot_at: '20261010', record: {}, ...flags});
  const assets = {
    '/report-records/index.json': {schema: 1, collections: [{type}]},
    [`/report-records/index-${type}.json`]: {schema: 1, type, rows: [row('dated'), row('undated'), row('updated'), row('withdrawn'), row('private'), row('draft'), row('source-withdrawn'), row('hidden', {public: false})]},
    ...Object.fromEntries([record('dated'), record('undated', {date: null}), record('updated', {updated_at: '2026-09-12'}),
      record('withdrawn', {withdrawn: true}), record('private', {visibility: 'private'}), record('draft', {published: false}),
      record('source-withdrawn', {record: {status: 'withdrawn'}}), record('orphan')].map(r => [`/report-records/${r.slug}.json`, r])),
    '/reports/index.json': {reports: [{slug: 'investigation'}]},
  };
  const entries = await officialReportCrawlEntries(async path => { assert.ok(Object.hasOwn(assets, path), path); return assets[path]; });
  const rows = entries.map(r => ({path: r.path, lastmod: latestDate([r.updated, r.date], r.snapshot) || exportDate(r.snapshot)}));
  assert.deepEqual(rows, [
    {path: '/report/' + slug('dated'), lastmod: '2026-09-10'},
    {path: '/report/' + slug('undated'), lastmod: '2026-10-10'},
    {path: '/report/' + slug('updated'), lastmod: '2026-09-12'},
  ]);
  const {files, index, counts} = sitemapFiles({'official-reports': rows}, 2);
  assert.deepEqual(files.map(f => f.count), [2, 1]);
  assert.equal(counts['official-reports'], 3);
  for (const file of files) {
    assert.ok(index.includes(file.path));
    assert.ok(Buffer.byteLength(file.body) < 50 * 1024 * 1024);
    assert.ok(paths(file.body).every(path => path.startsWith('/report/')));
    assert.doesNotMatch(file.body, /\/reports\//);
  }
});

test('built official report sitemap lists every public record from all four collections and leaves investigations off', async () => {
  const entries = await officialReportCrawlEntries(read);
  const manifest = await read('/crawl/manifest.json');
  assert.ok(entries.length > 0);
  assert.equal(manifest.counts['official-reports'], entries.length);
  const files = manifest.files.filter(f => /^\/sitemaps\/official-reports-/.test(f.path));
  assert.ok(files.length > 0);
  const index = await readFile(new URL('crawl/sitemap.xml', root), 'utf8');
  const listed = [];
  for (const file of files) {
    assert.ok(index.includes(file.path));
    const xml = await readFile(new URL('crawl' + file.path, root), 'utf8');
    listed.push(...paths(xml));
    for (const path of paths(xml)) {
      const entry = entries.find(r => r.path === path);
      assert.ok(entry);
      const lastmod = latestDate([entry.updated, entry.date], entry.snapshot) || exportDate(entry.snapshot);
      assert.ok(xml.includes(`<loc>https://opax.com.au${path}</loc><lastmod>${lastmod}</lastmod>`));
    }
  }
  assert.deepEqual(listed.sort(), entries.map(e => e.path).sort());
  assert.deepEqual(new Set(entries.map(e => e.path.split('/')[2].split('-').slice(0, 2).join('-'))), new Set(['royal-commission', 'integrity-report', 'annual-report', 'agency-report']));
  for (const file of manifest.files) assert.doesNotMatch(await readFile(new URL('crawl' + file.path, root), 'utf8'), /<loc>[^<]*\/reports(?:\/|<)/);
});

// Portal audit 12 Nov 2026, F12 and F13: the built crawl files, read as a crawler reads them.
const sitemapPaths = async group => {
  const manifest = await read('/crawl/manifest.json');
  const files = manifest.files.filter(f => f.path.startsWith(`/sitemaps/${group}-`));
  return {files, paths: (await Promise.all(files.map(f => readFile(new URL('crawl' + f.path, root), 'utf8')))).flatMap(paths)};
};

test('F13: the sitemap index lists the official report group, with the audit examples and no investigations', async () => {
  const {reportsPublished} = await import('../../scripts/reports_flag.mjs');
  assert.equal(reportsPublished(), false, 'REPORTS_ENABLED stays false');
  const index = await readFile(new URL('crawl/sitemap.xml', root), 'utf8');
  const {files, paths: listed} = await sitemapPaths('official-reports');
  assert.ok(files.length >= 1);
  for (const f of files) {
    assert.ok(index.includes(`<loc>https://opax.com.au${f.path}</loc>`), f.path);
    assert.ok(f.count <= 49_999, f.path);
    assert.ok((await stat(new URL('crawl' + f.path, root))).size < 50 * 1024 * 1024, f.path);
  }
  for (const slug of ['annual-report-royal-australian-air-force-welfare-trust-fund-2024-25', 'agency-report-vic-ballarat-general-cemeteries-trust-2025-26-annual-report']) {
    assert.ok(listed.includes('/report/' + slug), slug);
  }
  assert.ok(listed.every(p => p.startsWith('/report/')));
  for (const group of Object.keys((await read('/crawl/manifest.json')).counts)) {
    assert.ok(!(await sitemapPaths(group)).paths.some(p => p === '/reports' || p.startsWith('/reports/')), group);
  }
});

test('F12: every party in the sitemap is one identity with a non-empty page; the parliamentary-only parties are in', async () => {
  const pages = await readPartyPages(read);
  const {paths: listed} = await sitemapPaths('parties');
  assert.equal(new Set(listed).size, listed.length, 'no duplicate party URLs');
  const resolved = listed.map(path => resolvePartyPage(path.split('/').at(-1), pages));
  assert.ok(resolved.every(Boolean));
  assert.equal(new Set(resolved).size, listed.length, 'no two URLs resolve to the same party');
  // A page is empty without disclosed money, a member or a sponsored bill; such a page stays out of the sitemap.
  const roster = await read('/parliamentarians.json'), divisions = await read('/graph/party-members.json');
  for (const page of resolved) {
    const m = partyMembers(page.label, {roster, divisions});
    assert.ok(page.money || page.bills || m.current.length + m.former.length > 0, page.label);
  }
  for (const label of [...missing, 'Libertarian Party']) assert.ok(listed.includes(pages.find(p => p.label === label)?.href), label);
  // The sponsor-only parties (Nick Xenophon Team, Palmer United Party, Rex Patrick Team) are listed: see the A4b tests.
});

// Backlog A4b: three parties the record names only as a bill sponsor's party. Their pages list those bills, so
// they are no longer empty and the party sitemap lists each once (im/crawl-discovery recorded them as excluded).
test('A4b: sponsor-only parties have one page each, with their bills, and are in the party sitemap', async () => {
  const pages = await readPartyPages(read);
  const manifest = await read('/crawl/manifest.json');
  const xml = (await Promise.all(manifest.files.filter(f => /^\/sitemaps\/parties-/.test(f.path)).map(f => readFile(new URL('crawl' + f.path, root), 'utf8')))).join('');
  const listed = paths(xml);
  assert.equal(new Set(listed).size, listed.length, 'no duplicate party URLs');
  const roster = await read('/parliamentarians.json'), divisions = await read('/graph/party-members.json');
  for (const [label, slug, first] of [['Nick Xenophon Team', 'nick-xenophon-team', 'au-federal-s1127'], ['Palmer United Party', 'palmer-united-party', 'au-federal-s1019'],
    ['Rex Patrick Team', 'rex-patrick-team', 'au-federal-s1321']]) {
    const matches = pages.filter(p => p.aliases.includes(label));
    assert.equal(matches.length, 1, label);
    const [page] = matches;
    assert.equal(page.href, '/subject/party/' + slug);
    assert.equal(resolvePartyPage(slug, pages), page);
    assert.ok(page.bills && !page.money && !page.roster && !page.divisions, label);
    assert.equal(partyPageCoverage(page), 'Bill sponsor records. No party-level disclosure file held by OPAX.');
    const m = partyMembers(page.label, {roster, divisions});
    assert.equal(m.current.length + m.former.length, 0, 'the bills, not members, make the page');
    assert.equal(partyBills(page.label, divisions)[0].key, first);
    assert.ok(listed.includes(page.href), label);
    assert.equal(listed.filter(p => resolvePartyPage(p.split('/').at(-1), pages) === page).length, 1, label);
  }
  // A bill sponsor spelling of a party that already has a page adds no page: Centre Alliance stays one.
  assert.equal(pages.filter(p => p.aliases.includes('Centre Alliance')).length, 1);
  assert.equal(pages.filter(p => p.href === '/subject/party/labor').length, 1);
});

test('A4b: a sponsor party joins its page through the existing aliases, never a second page', () => {
  const pages = canonicalPartyPages({
    money: [{nodes: [{kind: 'party', label: 'One Nation'}]}],
    divisions: {parties: {}, bills: {"Pauline Hanson's One Nation Party": [{key: 'k1', title: 'A Bill', introduced: '2020-01-01'}],
      JLN: [{key: 'k2', title: 'B Bill', introduced: '2021-01-01'}], 'Fixture Sponsor Party': [{key: 'k3', title: 'C Bill', introduced: '2019-05-01'}]}},
  });
  assert.deepEqual(pages.map(p => p.label), ['Fixture Sponsor Party', 'JLN', 'One Nation']);
  const fixture = pages.find(p => p.label === 'Fixture Sponsor Party');
  assert.equal(fixture.lastmod, '2019-05-01');
  assert.deepEqual(partyBills('One Nation', {bills: {"Pauline Hanson's One Nation Party": [{key: 'k1'}], 'One Nation': [{key: 'k1'}, {key: 'k4'}]}}).map(b => b.key).sort(), ['k1', 'k4']);
});
