// Build your ballot came off the web on 19 Oct 2026 (Jake: "Let's remove the
// build a ballot tool"). Its old address, which the apps' share button also
// writes, forwards to Interactive tools; no page, menu, footer, search row or
// sitemap names it; and the electorate files the apps read (their Ballot
// screen included, until the next app build) keep serving byte for byte.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { JSDOM } from 'jsdom';
import { workerFetch } from './helpers/worker-fetch.mjs';

const read = name => readFileSync(new URL('../public/' + name, import.meta.url), 'utf8');
// Anything that names or loads the tool. The Victorian hub's real ballot paper
// ("In ballot paper order") is not the tool and does not match.
const TOOL = /game=ballot|build your ballot|practice ballot|explore-ballot|dialog-ballot|ballot\.(?:js|css)|mountBallot/i;
const IOS = { 'user-agent': 'OPAX-iOS/1.0.0 (34)' };
const ANDROID = { 'user-agent': 'OPAX-Android/1.0.0 (12)' };
const BROWSER = { 'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15' };

function navigation() {
  const context = { URLSearchParams };
  runInNewContext(read('navigation.js'), context);
  return context.OpaxNavigation;
}

test('the module, its styles, its stamp entries and its immutable rule are gone', () => {
  assert.equal(existsSync(new URL('../public/ballot.js', import.meta.url)), false);
  assert.equal(existsSync(new URL('../public/ballot.css', import.meta.url)), false);
  assert.doesNotMatch(read('_headers'), /\/ballot\./);
  assert.doesNotMatch(readFileSync(new URL('../../scripts/stamp_assets.mjs', import.meta.url), 'utf8'), /ballot\.js/);
  const app = read('app.js');
  assert.doesNotMatch(app, TOOL);
  assert.doesNotMatch(app, /\bballot: \{|ballot: null/);
  assert.doesNotMatch(read('style.css'), /\.ballot-/);
});

test('no shell, menu, sheet, footer or trail links the tool', () => {
  for (const file of ['index.html', 'home.html', 'community.html', 'ui-workbench.html', 'spa-shell.js', 'navigation.js', 'app.js', 'home.js'])
    assert.doesNotMatch(read(file), TOOL, file);
  const nav = navigation();
  assert.equal(Object.hasOwn(nav.tools, 'ballot'), false);
  assert.doesNotMatch(nav.barHTML(), TOOL);
  assert.doesNotMatch(nav.footerHTML(() => true, { slot: false }), TOOL);
  // Reached in the shell without the Worker (a client-side route), the old key is an unknown one: Interactive tools.
  const steps = path => JSON.parse(JSON.stringify(nav.trail(path)));
  assert.deepEqual(steps('/explore?game=ballot'), steps('/explore?game=unknown'));
  assert.deepEqual(steps('/explore?game=ballot'), [{ label: 'Interactive tools', href: '/explore' }]);
  // Interactive tools lists exactly the tools the trail knows, and the ballot is not one of them.
  const doc = new JSDOM(read('index.html')).window.document;
  const cards = [...doc.querySelectorAll('#panel-explore .game-card')].map(card => card.id);
  assert.deepEqual(cards, Object.keys(nav.tools).map(key => `explore-${key}-btn`));
  assert.equal(doc.querySelector('#panel-explore dialog#dialog-ballot'), null);
});

test('the Worker\'s pages carry no link to the tool', async () => {
  for (const path of ['/', '/explore', '/explore?game=tm', '/about', '/methods', '/subject/electorate', '/money', '/no-such-page']) {
    const res = await workerFetch(path);
    assert.ok([200, 404].includes(res.status), path);
    assert.doesNotMatch(await res.text(), TOOL, path);
  }
});

test('the old address, from a bookmark or the apps\' share link, 301s to Interactive tools', async () => {
  for (const path of ['/explore?game=ballot', '/explore/?game=ballot', '/explore?game=ballot&utm_source=app'])
    for (const [method, headers] of [['GET', BROWSER], ['HEAD', BROWSER], ['GET', IOS], ['GET', ANDROID]]) {
      const res = await workerFetch(path, {}, { method, headers, redirect: 'manual' });
      assert.equal(res.status, 301, `${method} ${path}`);
      assert.equal(res.headers.get('location'), 'https://opax.com.au/explore', `${method} ${path}`);
    }
  // The tools still open by their own key, and Interactive tools is served itself.
  for (const path of ['/explore', '/explore?game=tm', '/explore?game=quiz']) {
    const res = await workerFetch(path, {}, { redirect: 'manual' });
    assert.equal(res.status, 200, path);
  }
});

test('search catalogue, sitemap, crawl catalogue, llms.txt and IndexNow do not name the tool', async () => {
  const manifest = JSON.parse(read('search-catalog/manifest.json'));
  const dir = new URL(`../public/search-catalog/${manifest.version}/`, import.meta.url);
  for (const file of readdirSync(dir)) assert.doesNotMatch(readFileSync(new URL(file, dir), 'utf8'), TOOL, file);
  const crawl = new URL('../public/crawl/', import.meta.url);
  for (const file of ['sitemap.xml', 'llms.txt', 'indexnow.json', ...readdirSync(new URL('sitemaps/', crawl)).map(f => 'sitemaps/' + f)])
    assert.doesNotMatch(readFileSync(new URL(file, crawl), 'utf8'), TOOL, file);
  for (const path of ['/sitemap.xml', '/llms.txt']) assert.doesNotMatch(await (await workerFetch(path)).text(), TOOL, path);
});

test('the electorate files the apps read keep serving unchanged, to the apps and to browsers', async () => {
  // The apps' Ballot screen (ios/app mobile/src/features/explore/Ballot.tsx) reads the
  // electorate directory, then one electorate's detail_url; the Your MP and electorate
  // screens read the same files. None of them is ballot-only, so none is withheld.
  const manifest = JSON.parse(read('electorates/manifest.json'));
  const index = JSON.parse(read(manifest.index_url.slice(1)));
  const detail = index.electorates
    .map(seat => seat.detail_url)
    .find(url => JSON.parse(read(url.slice(1))).elections?.some(c => c.election?.poll_date === '2025-05-03' && c.election?.kind === 'general' && c.candidates?.length));
  assert.ok(detail, 'an electorate with a 2025 House contest');
  // The fields the app's decodeBallot needs are still there.
  const contest = JSON.parse(read(detail.slice(1))).elections.find(c => c.election.poll_date === '2025-05-03');
  assert.ok(contest.candidates.every(c => c.candidate_id && c.name && Number.isInteger(c.ballot_position)));
  for (const path of ['/electorates/manifest.json', manifest.index_url, manifest.people_url, detail])
    for (const headers of [IOS, ANDROID, BROWSER]) {
      const res = await workerFetch(path, {}, { headers });
      assert.equal(res.status, 200, path);
      assert.equal(await res.text(), read(path.slice(1)), `${path}: the file's own bytes`);
    }
  // In production these are plain static assets: the Worker never runs first for them.
  const runFirst = JSON.parse(read('../wrangler.jsonc').match(/"run_worker_first": (\[[^\]]*\])/)[1]);
  assert.ok(!runFirst.some(rule => rule.startsWith('/electorates')), 'electorate files bypass the Worker');
});
