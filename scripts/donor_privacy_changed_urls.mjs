#!/usr/bin/env node
// Which person and donor pages the October 2026 donor privacy hotfix changes, for
// IndexNow and search-console follow-up. Every person page and donor URL is rendered
// by the Worker of current main and of the working tree, over the same export,
// offline; the pre-hotfix build (what crawlers were last pinged and sitemapped) is
// the baseline for noindexed donor pages. The changed URLs go to the ignored
// portal/private/donor-privacy/changed-urls.txt, and the noindexed donor paths to
// indexnow-extra-paths.txt beside it (the INDEXNOW_EXTRA_PATHS secret, see
// docs/SEO-CRAWL.md); stdout carries counts only.
//
//   node scripts/donor_privacy_changed_urls.mjs [main ref, default origin/main] [pre-hotfix ref, default 6998b79e]
import {execFileSync} from 'node:child_process';
import {mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {offline, loadWorker, rendered} from '../portal/test/worker-harness.mjs';
import {buildCrawl, namedDonors} from './build_crawl_catalog.mjs';
import {MONEY_GRAPHS, foldDonorName, donorPrivacyIndex, donorNameWithheld} from '../portal/public/donor-entity.js';
import {donorPath} from '../portal/src/indexnow.ts';

const [mainRef = 'origin/main', preRef = '6998b79e'] = process.argv.slice(2);
const repo = fileURLToPath(new URL('..', import.meta.url));
const pub = join(repo, 'portal/public');
const work = join(repo, 'portal/private/donor-privacy');
const ORIGIN = 'https://opax.com.au';
const sha = ref => execFileSync('git', ['-C', repo, 'rev-parse', '--short', ref]).toString().trim();

/** A ref's Worker and crawl script, under portal/ so bare imports resolve to portal/node_modules. */
function extract(ref) {
  const dir = join(work, `ref-${sha(ref)}`);
  rmSync(dir, {recursive: true, force: true});
  mkdirSync(dir, {recursive: true});
  const tar = `${dir}.tar`;
  execFileSync('git', ['-C', repo, 'archive', '--format=tar', '-o', tar, ref, 'portal/src', 'scripts/build_crawl_catalog.mjs', ':(glob)portal/public/*.js']);
  execFileSync('tar', ['-xf', tar, '-C', dir]);
  rmSync(tar);
  return dir;
}
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
const preDir = extract(preRef), mainDir = extract(mainRef);
const pre = await crawl((await import(join(preDir, 'scripts/build_crawl_catalog.mjs'))).buildCrawl);
const main = await crawl((await import(join(mainDir, 'scripts/build_crawl_catalog.mjs'))).buildCrawl);
const now = await crawl(buildCrawl);

const restore = offline();
const workers = {pre: await loadWorker(join(preDir, 'portal/src/index.ts'), pub), main: await loadWorker(join(mainDir, 'portal/src/index.ts'), pub), now: await loadWorker(join(repo, 'portal/src/index.ts'), pub)};
const render = async (worker, path) => { const r = await worker.fetch(path); const html = await r.text(); return {robots: r.headers.get('x-robots-tag'), html: rendered(html), named: namedDonors(html)}; };
const graphs = MONEY_GRAPHS.map(path => JSON.parse(readFileSync(join(pub, path), 'utf8')));
const index = donorPrivacyIndex(graphs);

// Person pages: IndexNow pings one whose fingerprint differs from the last completed
// epoch's, and that baseline is main's fingerprint for the page.
const repinged = {changed: [], sameAsMain: []}, notPinged = [];
const namedWithheldBefore = {changed: 0, sameAsMain: 0};
for (const path of [...new Set([...main.people, ...now.people])]) {
  const [was, is] = await Promise.all([render(workers.main, path), render(workers.now, path)]);
  const htmlChanged = was.robots !== is.robots || was.html !== is.html;
  const fingerprinted = main.indexnow.get(path) !== now.indexnow.get(path);
  if (fingerprinted) {
    const bucket = htmlChanged ? 'changed' : 'sameAsMain';
    repinged[bucket].push(path);
    // Before the hotfix the page named a donor now withheld (a person, or an organisation without a legal form).
    if ((await render(workers.pre, path)).named.some(name => donorNameWithheld(index, name))) namedWithheldBefore[bucket]++;
  } else if (htmlChanged) notPinged.push(path);
}
// Donor pages: against main for what this branch changes, against the pre-hotfix sitemap
// for what crawlers were last told (round 1 noindexed pages without a ping).
const tags = new Map();
for (const g of graphs) for (const n of g.nodes) if (n.kind === 'donor') tags.set(foldDonorName(n.label), [...(tags.get(foldDonorName(n.label)) || []), n.industry]);
const tagOf = path => tags.get(foldDonorName(decodeURIComponent(path.split('/').at(-1))))?.includes('individual') ? 'individual' : 'other';
const donorChangedVsMain = [], noindexSincePre = {individual: [], other: []};
for (const path of [...new Set([...pre.donors, ...main.donors, ...now.donors])]) {
  const [was, is] = await Promise.all([render(workers.main, path), render(workers.now, path)]);
  if (was.robots !== is.robots || was.html !== is.html) donorChangedVsMain.push(path);
  if (pre.donors.includes(path) && is.robots === 'noindex') noindexSincePre[tagOf(path)].push(path);
}
restore();
const minus = (a, b) => { const set = new Set(b); return a.filter(path => !set.has(path)); };
const counts = {
  main: sha(mainRef), pre_hotfix: sha(preRef), working_tree: sha('HEAD'),
  person_pages_repinged: repinged.changed.length + repinged.sameAsMain.length,
  person_pages_repinged_html_changed_vs_main: repinged.changed.length,
  person_pages_repinged_html_same_as_main: repinged.sameAsMain.length,
  person_pages_repinged_that_named_a_now_withheld_donor_before_the_hotfix: namedWithheldBefore,
  person_pages_html_changed_vs_main_not_repinged: notPinged.length,
  donor_pages_changed_vs_main: donorChangedVsMain.length,
  sitemap_donor_urls: {pre_hotfix: pre.donors.length, main: main.donors.length, now: now.donors.length},
  donor_urls_removed_vs_main: minus(main.donors, now.donors).length, donor_urls_added_vs_main: minus(now.donors, main.donors).length,
  donor_urls_removed_vs_pre_hotfix: minus(pre.donors, now.donors).length, donor_urls_added_vs_pre_hotfix: minus(now.donors, pre.donors).length,
  pre_hotfix_sitemap_donor_pages_now_noindex: {individual_tag: noindexSincePre.individual.length, other_tags: noindexSincePre.other.length},
};
// The one-off IndexNow list (portal/src/indexnow.ts extraUrls): every donor page from the
// pre-hotfix sitemap now noindex that donorPath accepts as is; a name decoding to a slash
// is not one segment and is not pinged.
const noindexed = [...new Set([...noindexSincePre.individual, ...noindexSincePre.other, ...minus(pre.donors, now.donors)])];
const pingable = noindexed.filter(path => donorPath(path) === path);
writeFileSync(join(work, 'indexnow-extra-paths.txt'), pingable.join('\n') + '\n');
counts.noindexed_donor_pages_pingable = pingable.length;
counts.noindexed_donor_pages_not_pingable = noindexed.length - pingable.length;
const section = (title, paths) => [`## ${title} (${paths.length})`, ...paths.map(path => ORIGIN + path)];
writeFileSync(join(work, 'changed-urls.txt'), [
  `# Donor privacy hotfix: pages whose output or IndexNow fingerprint changes, current main ${counts.main} vs working tree ${counts.working_tree}; pre-hotfix ${counts.pre_hotfix} for sitemap and noindex.`,
  '# Private: donor URLs carry names. Never commit or paste this file.',
  `# ${JSON.stringify(counts)}`,
  ...section('person pages re-pinged: HTML changed against main', repinged.changed),
  ...section('person pages re-pinged: HTML as on main (changed by round 1, which never re-pinged)', repinged.sameAsMain),
  ...section('person pages changed against main, not re-pinged (no change in the donors named)', notPinged),
  ...section('donor pages changed against main', donorChangedVsMain),
  ...section('donor pages from the pre-hotfix sitemap now noindex: individual-tagged', noindexSincePre.individual),
  ...section('donor pages from the pre-hotfix sitemap now noindex: other tags', noindexSincePre.other),
  ...section('donor URLs removed from the sitemap against main', minus(main.donors, now.donors)),
  ...section('donor URLs added to the sitemap against main', minus(now.donors, main.donors)),
  ...section('donor URLs removed from the sitemap against the pre-hotfix sitemap', minus(pre.donors, now.donors)),
  '',
].join('\n'));
for (const dir of [preDir, mainDir]) rmSync(dir, {recursive: true, force: true});
console.log(JSON.stringify(counts, null, 2));
