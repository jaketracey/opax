#!/usr/bin/env node
// Which person and donor pages the October 2026 donor privacy hotfix changes, for
// IndexNow and search-console follow-up. Every person page and every donor URL in the
// pre-hotfix sitemap is rendered by the pre-hotfix Worker and by the working tree's,
// over the same export, offline. The changed URLs go to the ignored
// portal/private/donor-privacy/changed-urls.txt, and the noindexed donor paths to
// indexnow-extra-paths.txt beside it (the INDEXNOW_EXTRA_PATHS secret, see
// docs/SEO-CRAWL.md); stdout carries counts only.
//
//   node scripts/donor_privacy_changed_urls.mjs [pre-hotfix ref, default 6998b79e]
import {execFileSync} from 'node:child_process';
import {mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {offline, loadWorker, rendered} from '../portal/test/worker-harness.mjs';
import {buildCrawl} from './build_crawl_catalog.mjs';
import {MONEY_GRAPHS, foldDonorName} from '../portal/public/donor-entity.js';

const ref = process.argv[2] || '6998b79e';
const repo = fileURLToPath(new URL('..', import.meta.url));
const pub = join(repo, 'portal/public');
const work = join(repo, 'portal/private/donor-privacy');
const ORIGIN = 'https://opax.com.au';

// The pre-hotfix code sits under portal/ so its bare imports resolve to portal/node_modules.
const old = join(work, `pre-hotfix-${ref}`);
rmSync(old, {recursive: true, force: true});
mkdirSync(old, {recursive: true});
const tar = join(work, `pre-hotfix-${ref}.tar`);
execFileSync('git', ['-C', repo, 'archive', '--format=tar', '-o', tar, ref, 'portal/src', 'scripts/build_crawl_catalog.mjs', ':(glob)portal/public/*.js']);
execFileSync('tar', ['-xf', tar, '-C', old]);
rmSync(tar);

/** A crawl build over the export, in a scratch root: the export is linked, never written. */
async function crawl(build) {
  const root = mkdtempSync(join(tmpdir(), 'opax-donor-urls-'));
  for (const entry of readdirSync(pub)) if (!['crawl', 'person-paths.js'].includes(entry)) symlinkSync(join(pub, entry), join(root, entry));
  await build(root);
  const locs = prefix => readdirSync(join(root, 'crawl/sitemaps')).filter(f => f.startsWith(prefix)).flatMap(f =>
    [...readFileSync(join(root, 'crawl/sitemaps', f), 'utf8').matchAll(/<loc>https:\/\/opax\.com\.au([^<]+)<\/loc>/g)].map(m => m[1].replace(/&amp;/g, '&').replace(/&apos;/g, "'")));
  const out = {people: locs('people-'), donors: locs('donors-'), indexnow: new Map(JSON.parse(readFileSync(join(root, 'crawl/indexnow.json'), 'utf8')).entries)};
  rmSync(root, {recursive: true, force: true});
  return out;
}
const before = await crawl((await import(join(old, 'scripts/build_crawl_catalog.mjs'))).buildCrawl);
const after = await crawl(buildCrawl);

const restore = offline();
const oldWorker = await loadWorker(join(old, 'portal/src/index.ts'), pub);
const newWorker = await loadWorker(join(repo, 'portal/src/index.ts'), pub);
const render = async (worker, path) => { const r = await worker.fetch(path); return {robots: r.headers.get('x-robots-tag'), html: rendered(await r.text())}; };
const differs = async path => { const [a, b] = await Promise.all([render(oldWorker, path), render(newWorker, path)]); return {changed: a.robots !== b.robots || a.html !== b.html, robots: b.robots}; };

const people = [];
for (const path of [...new Set([...before.people, ...after.people])]) if ((await differs(path)).changed) people.push(path);
const tags = new Map();
for (const path of MONEY_GRAPHS) for (const n of JSON.parse(readFileSync(join(pub, path), 'utf8')).nodes) if (n.kind === 'donor') {
  const key = foldDonorName(n.label);
  tags.set(key, [...(tags.get(key) || []), n.industry]);
}
const noindex = {individual: [], other: []}, reindexed = [];
for (const path of before.donors) {
  const {changed, robots} = await differs(path);
  if (!changed) continue;
  if (robots === 'noindex') (tags.get(foldDonorName(decodeURIComponent(path.split('/').at(-1))))?.includes('individual') ? noindex.individual : noindex.other).push(path);
  else reindexed.push(path);
}
const kept = new Set(after.donors);
const removed = before.donors.filter(path => !kept.has(path));
const added = after.donors.filter(path => !before.donors.includes(path));
restore();

// IndexNow pings a person page when its fingerprint differs from the last completed epoch's.
const fingerprinted = new Set([...after.indexnow].filter(([path, hash]) => path.startsWith('/subject/person/') && before.indexnow.get(path) !== hash).map(([path]) => path));
const uncovered = people.filter(path => !fingerprinted.has(path)).length;
const unchangedPings = [...fingerprinted].filter(path => !people.includes(path)).length;
const head = commit => execFileSync('git', ['-C', repo, 'rev-parse', '--short', commit]).toString().trim();
const counts = {
  person_pages_changed: people.length,
  person_fingerprints_changed: fingerprinted.size,
  changed_person_pages_without_new_fingerprint: uncovered,
  fingerprint_changes_without_page_change: unchangedPings,
  old_sitemap_donor_urls: before.donors.length,
  new_sitemap_donor_urls: after.donors.length,
  donor_urls_removed_from_sitemap: removed.length,
  donor_urls_added_to_sitemap: added.length,
  donor_pages_now_noindex_individual_tag: noindex.individual.length,
  donor_pages_now_noindex_other_tags: noindex.other.length,
  donor_pages_changed_still_indexed: reindexed.length,
};
const section = (title, paths) => [`## ${title} (${paths.length})`, ...paths.map(path => ORIGIN + path)];
mkdirSync(work, {recursive: true});
writeFileSync(join(work, 'changed-urls.txt'), [
  `# Donor privacy hotfix: pages whose server-rendered output changes, pre-hotfix ${ref} vs working tree on ${head('HEAD')}.`,
  '# Private: donor URLs carry names. Never commit or paste this file.',
  ...Object.entries(counts).map(([key, value]) => `# ${key}: ${value}`),
  ...section('person pages changed (re-pinged by IndexNow: new fingerprint)', people),
  ...section('donor pages now noindex: individual-tagged', noindex.individual),
  ...section('donor pages now noindex: other tags (sector-tagged people and organisations without a legal form)', noindex.other),
  ...section('donor pages changed, still indexed', reindexed),
  ...section('donor URLs removed from the sitemap', removed),
  ...section('donor URLs added to the sitemap', added),
  '',
].join('\n'));
// The one-off IndexNow list (portal/src/indexnow.ts extraUrls): every donor page now noindex.
writeFileSync(join(work, 'indexnow-extra-paths.txt'), [...new Set([...noindex.individual, ...noindex.other, ...removed])].join('\n') + '\n');
rmSync(old, {recursive: true, force: true});
console.log(JSON.stringify(counts, null, 2));
