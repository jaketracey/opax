// The reports (the six standing reports and "Where community funding goes",
// grants-allocation) are off the site behind one switch, REPORTS_ENABLED
// (src/reports-gate.ts). Off: every report address is a noindexed not-found
// page, the data files are gone for the web (the installed apps still read them
// while REPORTS_APP_DATA is on), and no menu, footer, page, search row, sitemap
// entry or social post names them. On: today's site.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';
import { readFileSync, readdirSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { JSDOM } from 'jsdom';
import { build } from 'esbuild';
import { workerFetch } from './helpers/worker-fetch.mjs';
import { reportsEnabled, reportsPath, EMPTY_REPORTS_INDEX } from '../src/reports-gate.ts';
import { reportsPublished } from '../../scripts/reports_flag.mjs';
import { llmsText, buildCrawl } from '../../scripts/build_crawl_catalog.mjs';

const read = name => readFileSync(new URL('../public/' + name, import.meta.url), 'utf8');
const SIX = ['climate', 'gambling', 'housing', 'immigration', 'indigenous', 'media'];
const SEVEN = [...SIX, 'grants-allocation'];
const ON = { REPORTS_ENABLED: 'true' };
// Any link to the reports, grants-allocation included.
const REPORT_LINK = /href="\/reports[^"]*"/;
const withheldLinks = html => [...html.matchAll(/href="(\/reports[^"]*)"/g)].map(m => m[1]);

/** The navigation list as a page draws it, with these gates marked on <html>. */
function navigationIn(gates) {
  const dom = new JSDOM(`<!doctype html><html${gates ? ` data-nav-gates="${gates}"` : ''}><body><nav id="primary-nav"><ul class="nav-list"></ul></nav><dialog id="nav-drawer"><div class="sheet-nav"></div></dialog><nav id="footer-index"></nav><script src="/app.js"></script></body></html>`, { url: 'https://opax.test/about', runScripts: 'outside-only' });
  dom.window.fetch = () => new Promise(() => {});
  dom.window.eval(read('navigation.js'));
  return dom.window;
}

function probe(path, env) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./helpers/header-search-shell.mjs', import.meta.url), {
      execArgv: ['--experimental-vm-modules', '--disable-warning=ExperimentalWarning'], workerData: { path, probe: 'reports', env },
    });
    worker.once('message', message => message.error ? reject(Error(message.error)) : resolve(message.result));
    worker.once('error', reject);
    worker.once('exit', code => { if (code !== 0) reject(Error('Shell worker exited with ' + code)); });
  });
}

test('the switch: only an exact "true" publishes, and wrangler.jsonc ships it off', () => {
  for (const value of [undefined, '', 'false', 'TRUE', '1', true]) assert.equal(reportsEnabled(value), value === true, String(value));
  assert.equal(reportsEnabled('true'), true);
  assert.equal(reportsPublished(), false);
  const config = read('../wrangler.jsonc');
  assert.match(config, /\n {4}"REPORTS_ENABLED": "false",/, 'production');
  assert.match(config, /\n {8}"REPORTS_ENABLED": "false",/, 'staging');
  for (const path of ['/reports', '/reports/', '/reports/climate', '/reports/climate/s/2', '/reports/index.json', '/reports/media.json',
    '/reports/grants-allocation', '/reports/grants-allocation/', '/reports/grants-allocation.json', '/reports/grants-allocation/s/1'])
    assert.equal(reportsPath(path), true, path);
  for (const path of ['/reportsx', '/subject/topic/housing', '/research/mlci.json'])
    assert.equal(reportsPath(path), false, path);
});

test('off: every report address is the noindexed not-found page, with no way back to the reports', async () => {
  for (const path of ['/reports', '/reports/', ...SEVEN.map(s => `/reports/${s}`), '/reports/grants-allocation/', '/reports/grants-allocation?collection=history', '/reports/housing/s/2', '/reports/no-such-report']) {
    const res = await workerFetch(path);
    assert.equal(res.status, 404, path);
    assert.equal(res.headers.get('x-robots-tag'), 'noindex', path);
    assert.equal(res.headers.get('cache-control'), 'no-store', path);
    const html = await res.text();
    const doc = new JSDOM(html).window.document;
    assert.equal(doc.querySelector('meta[name="robots"]')?.getAttribute('content'), 'noindex', path);
    assert.equal(doc.title, 'Page not found · OPAX', path);
    assert.match(doc.querySelector('#prerender').textContent, /Nothing is published at this address/, path);
    assert.equal(doc.querySelector('link[rel="canonical"]'), null, path);
    assert.deepEqual(withheldLinks(html), [], path);
    assert.equal(doc.documentElement.getAttribute('data-nav-gates'), 'vic-election', path);
  }
  const head = await workerFetch('/reports/climate', {}, { method: 'HEAD' });
  assert.equal(head.status, 404);
  assert.equal(await head.text(), '');
});

test('off: report data files are gone for the web, never read from the assets; the index is empty', async () => {
  for (const slug of SEVEN) {
    const res = await workerFetch(`/reports/${slug}.json`);
    assert.equal(res.status, 404, slug);
    assert.equal(res.headers.get('x-robots-tag'), 'noindex');
    assert.equal(await res.text(), 'Not found');
  }
  const planted = await workerFetch('/reports/climate.json', {}, {}, { assets: { '/reports/climate.json': { planted: true } } });
  assert.equal(planted.status, 404, 'an asset at the address is never served');
  assert.doesNotMatch(await planted.text(), /planted/);
  const index = await workerFetch('/reports/index.json');
  assert.equal(index.status, 200);
  assert.match(index.headers.get('content-type'), /^application\/json/);
  const body = await index.text();
  assert.equal(body, '{"reports":[]}', 'the index in its own shape, empty');
  assert.deepEqual(JSON.parse(body), EMPTY_REPORTS_INDEX);
  // The same keys as the published index, so a strict decoder of { reports: [...] } accepts it.
  assert.deepEqual(Object.keys(JSON.parse(read('reports/index.json'))), Object.keys(JSON.parse(body)));
  const head = await workerFetch('/reports/index.json', {}, { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
});

// The apps' catalog User-Agent (mobile/src/api/user-agent.ts on ios/app).
const IOS = { 'user-agent': 'OPAX-iOS/1.0.0 (34)' };
const ANDROID = { 'user-agent': 'OPAX-Android/1.0.0 (12)' };
const BROWSER = { 'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15' };
const CRAWLER = { 'user-agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)' };
const APP_DATA = { REPORTS_APP_DATA: 'true' };
/** Neither variant is stored by any cache, and both vary by client. */
function assertUnshared(res, label) {
  assert.equal(res.headers.get('cache-control'), 'no-store', label);
  assert.match(res.headers.get('vary') || '', /(?:^|,\s*)User-Agent(?:\s*,|$)/i, label);
  assert.equal(res.headers.get('x-robots-tag'), 'noindex', label);
}

test('off, REPORTS_APP_DATA on: the installed apps still read the report data exactly as before', async () => {
  const config = read('../wrangler.jsonc');
  assert.match(config, /\n {4}"REPORTS_APP_DATA": "true",/, 'production');
  assert.match(config, /\n {8}"REPORTS_APP_DATA": "true",/, 'staging');
  for (const headers of [IOS, ANDROID]) {
    const index = await workerFetch('/reports/index.json', APP_DATA, { headers });
    assert.equal(index.status, 200);
    assertUnshared(index, 'index');
    const body = await index.text();
    assert.equal(body, await (await workerFetch('/reports/index.json', ON)).text(), 'the full index, as served with the reports on');
    assert.equal(JSON.parse(body).reports.length, 7);
    assert.ok(JSON.parse(body).reports.some(r => r.slug === 'grants-allocation'), 'the app index keeps listing grants-allocation');
    for (const slug of SEVEN) {
      const res = await workerFetch(`/reports/${slug}.json`, APP_DATA, { headers });
      assert.equal(res.status, 200, slug);
      assertUnshared(res, slug);
      assert.equal(await res.text(), await (await workerFetch(`/reports/${slug}.json`, ON)).text(), `${slug}: the original bytes`);
    }
    const head = await workerFetch('/reports/climate.json', APP_DATA, { method: 'HEAD', headers });
    assert.equal(head.status, 200);
    assert.equal(await head.text(), '');
  }
  // The apps never load the pages: those stay the not-found page for them too.
  for (const path of ['/reports', '/reports/climate', '/reports/climate/s/1', '/reports/grants-allocation', '/reports/grants-allocation/']) {
    const res = await workerFetch(path, APP_DATA, { headers: IOS });
    assert.equal(res.status, 404, path);
    assert.equal(res.headers.get('x-robots-tag'), 'noindex', path);
  }
});

test('off, REPORTS_APP_DATA on: browsers and crawlers still get the empty index and 404s, never stored', async () => {
  for (const [label, headers] of [['browser', BROWSER], ['crawler', CRAWLER], ['no user agent', {}], ['lookalike', { 'user-agent': 'Mozilla/5.0 OPAX-iOS/1.0.0' }]]) {
    const index = await workerFetch('/reports/index.json', APP_DATA, { headers });
    assert.equal(index.status, 200, label);
    assertUnshared(index, `${label} index`);
    assert.equal(await index.text(), '{"reports":[]}', label);
    for (const slug of SEVEN) {
      const res = await workerFetch(`/reports/${slug}.json`, APP_DATA, { headers });
      assert.equal(res.status, 404, `${label} ${slug}`);
      assertUnshared(res, `${label} ${slug}`);
      assert.equal(await res.text(), 'Not found');
    }
    for (const path of ['/reports', '/reports/climate', '/reports/grants-allocation']) {
      const page = await workerFetch(path, APP_DATA, { headers });
      assert.equal(page.status, 404, `${label} ${path}`);
      assert.equal(page.headers.get('x-robots-tag'), 'noindex', `${label} ${path}`);
      assert.equal(page.headers.get('cache-control'), 'no-store', `${label} ${path}`);
    }
  }
});

test('off, REPORTS_APP_DATA "false" (or unset): the apps get the same withheld responses as everyone', async () => {
  for (const env of [{ REPORTS_APP_DATA: 'false' }, {}]) {
    const index = await workerFetch('/reports/index.json', env, { headers: IOS });
    assertUnshared(index, 'index');
    assert.equal(await index.text(), '{"reports":[]}');
    const res = await workerFetch('/reports/housing.json', env, { headers: ANDROID });
    assert.equal(res.status, 404);
    assertUnshared(res, 'housing');
  }
  // The switch matters only while the reports are off.
  const on = await workerFetch('/reports/housing.json', { ...ON, REPORTS_APP_DATA: 'false' }, { headers: BROWSER });
  assert.equal(on.status, 200);
});

test('off: the grants research data stays served to everyone (the apps\' money screen reads it), out of search results', async () => {
  for (const file of ['mlci.json', 'grants-history.json', 'grant-locations.json']) {
    for (const headers of [IOS, BROWSER, CRAWLER]) {
      const res = await workerFetch(`/research/${file}`, {}, { headers });
      assert.equal(res.status, 200, file);
      assert.equal(await res.text(), read(`research/${file}`), `${file}: unchanged`);
    }
  }
  // Static assets: the noindex comes from _headers, not the Worker.
  assert.match(read('_headers'), /\n\/research\/\*\.json\n {2}X-Robots-Tag: noindex\n/);
});

test('off: a withheld report has no share card, drawn or replayed from the cache', async () => {
  for (const path of ['/og/reports/climate.jpg', '/og/reports/grants-allocation.jpg', '/og/reports.jpg']) {
    const res = await workerFetch(path);
    assert.equal(res.status, 404, path);
    assert.equal(await res.text(), 'No card available', path);
  }
});

test('off: no page the Worker serves links a withheld report', async () => {
  for (const path of ['/', '/about', '/methods', '/explore', '/subject/topic', '/subject/topic/housing', '/sitting', '/subject/person/anthony-albanese', '/money/grants', '/ask', '/no-such-page']) {
    const res = await workerFetch(path);
    const html = await res.text();
    assert.doesNotMatch(html, REPORT_LINK, path);
    assert.equal(new JSDOM(html).window.document.documentElement.getAttribute('data-nav-gates'), 'vic-election', path);
  }
  const home = new JSDOM(await (await workerFetch('/')).text()).window.document;
  assert.equal(home.querySelector('.hp-reports'), null, 'the home page drops its Reports block');
  assert.equal(home.querySelector('[data-reports-only]'), null);
});

test('off: the static menu bar and footer index carry no withheld report, and the trails do not name them', async () => {
  const context = { URLSearchParams };
  runInNewContext(read('navigation.js'), context);
  const nav = context.OpaxNavigation;
  assert.doesNotMatch(nav.barHTML(), /\/reports/);
  assert.doesNotMatch(nav.footerHTML(() => true, { slot: false }), REPORT_LINK);
  for (const file of ['index.html', 'home.html', 'community.html']) {
    const html = read(file);
    for (const part of ['bar', 'index']) {
      const block = html.slice(html.indexOf(`<!-- nav:${part}:start -->`), html.indexOf(`<!-- nav:${part}:end -->`));
      assert.doesNotMatch(block, REPORT_LINK, `${file} nav:${part}`);
    }
  }
  // The menus a page draws: closed, the reports and "All reports" are absent; open, today's menus.
  const off = navigationIn('vic-election');
  for (const id of ['primary-nav', 'nav-drawer', 'footer-index']) assert.doesNotMatch(off.document.getElementById(id).innerHTML, REPORT_LINK, id);
  assert.equal(off.OpaxNavigation.published('reports'), false);
  // (jsdom's arrays belong to its own realm: compare plain copies.)
  const steps = (win, ...args) => JSON.parse(JSON.stringify(win.OpaxNavigation.trail(...args)));
  assert.deepEqual(steps(off, '/reports/climate'), [{ label: 'Page not found' }]);
  assert.deepEqual(steps(off, '/reports'), [{ label: 'Page not found' }]);
  assert.deepEqual(steps(off, '/reports/grants-allocation'), [{ label: 'Page not found' }]);
  const on = navigationIn('vic-election reports');
  const menu = on.document.getElementById('primary-nav').innerHTML;
  for (const slug of SEVEN) assert.match(menu, new RegExp(`href="/reports/${slug}"`), slug);
  assert.match(menu, /<a class="nav-all" href="\/reports">All reports/);
  assert.match(on.document.getElementById('nav-drawer').innerHTML, /sheet-link-all" href="\/reports"/);
  assert.equal(on.OpaxNavigation.published('reports'), true);
  assert.deepEqual(steps(on, '/reports/climate'), [{ label: 'Reports', href: '/reports' }]);
  assert.deepEqual(steps(on, '/reports/grants-allocation', 'Where community funding goes'), [{ label: 'Reports', href: '/reports' }, { label: 'Where community funding goes' }]);
});

test('off: the app shell and the home page drop the reports-only copy and draw no report link', async () => {
  const app = await probe('/about');
  assert.equal(app.published, false);
  assert.deepEqual(app.links, [], 'menus, sheet, footer and the restored panels');
  assert.equal(app.reportsOnly, 0, 'About copy and the Research reports search filter');
  assert.equal(app.researchOption, false, 'no catalogue row has the report kind any more');
  assert.equal(app.trail, 'Page not found');
  assert.equal(app.grants, 'Page not found');
  const home = await probe('/');
  assert.deepEqual(home.links, []);
  assert.equal(home.reportsOnly, 0);
  // On, the same pages draw today's links.
  const on = await probe('/about', ON);
  assert.equal(on.gates, 'vic-election reports');
  assert.deepEqual(on.links, ['/reports', ...SEVEN.map(s => `/reports/${s}`)].sort());
  assert.equal(on.reportsOnly, 3);
  assert.equal(on.researchOption, true);
  assert.equal(on.grants, 'Reports › Where community funding goes');
  const homeOn = await probe('/', ON);
  assert.ok(SEVEN.every(slug => homeOn.links.includes(`/reports/${slug}`)) && homeOn.links.includes('/reports'));
});

test('off: search catalogue, sitemap, llms.txt and IndexNow carry no withheld report', async () => {
  const manifest = JSON.parse(read('search-catalog/manifest.json'));
  const dir = new URL(`../public/search-catalog/${manifest.version}/`, import.meta.url);
  for (const file of readdirSync(dir)) assert.doesNotMatch(readFileSync(new URL(file, dir), 'utf8'), /"\/reports/, file);
  assert.equal(manifest.counts.report, undefined, 'no row of the report kind');
  const crawl = new URL('../public/crawl/', import.meta.url);
  for (const file of ['sitemap.xml', ...readdirSync(new URL('sitemaps/', crawl)).map(f => 'sitemaps/' + f)]) {
    const xml = readFileSync(new URL(file, crawl), 'utf8');
    assert.doesNotMatch(xml, /<loc>[^<]*\/reports/, file);
  }
  assert.doesNotMatch(readFileSync(new URL('llms.txt', crawl), 'utf8'), /\/reports/);
  assert.doesNotMatch(readFileSync(new URL('indexnow.json', crawl), 'utf8'), /\/reports/);
  const sitemap = await (await workerFetch('/sitemaps/topics-reports-1.xml')).text();
  assert.doesNotMatch(sitemap, /<loc>[^<]*\/reports/);
  assert.doesNotMatch(await (await workerFetch('/llms.txt')).text(), /\/reports/);
  // The builder publishes them again when the switch is on.
  const corpus = JSON.parse(read('corpus.json'));
  const grants = { federal: { meta: { generated: 'x', coverage: 'x' } }, qld: { meta: { generated: 'x', coverage: 'x' } } };
  assert.doesNotMatch(llmsText(corpus, grants, null, null, false), /\/reports/);
  assert.match(llmsText(corpus, grants, null, null, true), /- \[Reports\]\(https:\/\/opax\.com\.au\/reports\): `\/reports\/\{report-slug\}`; source-backed investigations\.\n- \[Sitemap index\]/);
  assert.equal(typeof buildCrawl, 'function');
});

test('off: the daily edition reads no report from its sources, so a topic day falls through to the next kind', async () => {
  const built = await build({ entryPoints: [new URL('../src/daily-post.ts', import.meta.url).pathname], bundle: true, write: false, platform: 'node', format: 'esm' });
  const { envSources } = await import('data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].text).toString('base64'));
  const asked = [];
  const ASSETS = { async fetch(request) { const path = new URL(request.url).pathname; asked.push(path); return new Response(read(path.slice(1))); } };
  const env = { ASSETS, GENERATION_CACHE: { get: async () => null } };
  const off = envSources(env, async () => new Response('{}'));
  assert.equal(await off.asset('/reports/index.json'), null);
  assert.equal(await off.asset('/reports/housing.json'), null);
  assert.deepEqual(asked, []);
  assert.ok(await off.asset('/bills/index.json'));
  const on = envSources({ ...env, ...ON }, async () => new Response('{}'));
  assert.deepEqual(await on.asset('/reports/index.json'), JSON.parse(read('reports/index.json')));
});

test('on: today\'s report pages, data, menus and gates', async () => {
  for (const slug of SIX) {
    const res = await workerFetch(`/reports/${slug}`, ON);
    assert.equal(res.status, 200, slug);
    assert.equal(res.headers.get('x-robots-tag'), 'all');
    const doc = new JSDOM(await res.text()).window.document;
    const title = JSON.parse(read('reports/index.json')).reports.find(r => r.slug === slug).title;
    assert.equal(doc.title, `${title} · Reports · OPAX`);
    assert.equal(doc.querySelector('link[rel="canonical"]').getAttribute('href'), `https://opax.com.au/reports/${slug}`);
    assert.equal(doc.documentElement.getAttribute('data-nav-gates'), 'vic-election reports');
    const data = await workerFetch(`/reports/${slug}.json`, ON);
    assert.equal(data.status, 200);
    assert.equal(JSON.parse(await data.text()).slug, slug, 'served from the assets (through the display policy, as before)');
  }
  assert.equal((await workerFetch('/reports', ON)).status, 200);
  assert.equal((await workerFetch('/reports/housing/s/2', ON)).status, 200);
  assert.equal(await (await workerFetch('/reports/index.json', ON)).text(), read('reports/index.json'));
  const grants = await workerFetch('/reports/grants-allocation', ON);
  assert.equal(grants.status, 200);
  assert.equal(new JSDOM(await grants.text()).window.document.title, 'Where community funding goes · Reports · OPAX');
  assert.equal((await workerFetch('/reports/grants-allocation.json', ON, { headers: BROWSER })).status, 200);
  const home = new JSDOM(await (await workerFetch('/', ON)).text()).window.document;
  assert.ok(home.querySelector('.hp-reports'), 'the home page keeps its Reports block');
  for (const slug of SEVEN) assert.ok(home.querySelector(`.hp-reports a[href="/reports/${slug}"]`), slug);
});
