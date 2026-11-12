import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {readPartyPages, canonicalPartyPages, resolvePartyPage} from '../public/party-page.js';
import {renderDirectory} from '../src/seo-content.ts';
import {officialReportCrawlEntries} from '../../scripts/official_report_crawl.mjs';
import {sitemapFiles, latestDate, exportDate} from '../../scripts/build_crawl_catalog.mjs';

const root = new URL('../public/', import.meta.url);
const read = async path => JSON.parse(await readFile(new URL(path.replace(/^\//, ''), root), 'utf8'));
const paths = xml => [...xml.matchAll(/<loc>https:\/\/opax.com.au([^<]+)<\/loc>/g)].map(m => m[1]);
// Finding 13's seven labels outside both the live directory and sitemap.
const missing = ["Australia's Voice", 'Australian Conservatives', 'Australian Motoring Enthusiast Party',
  "Derryn Hinch's Justice Party", 'Gerard Rennick People First', 'Jacqui Lambie Network', 'Liberal Democratic Party'];

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
