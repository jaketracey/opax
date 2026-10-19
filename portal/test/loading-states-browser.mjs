// Loading, empty and refetch states on real pages, in headless Chrome (web/loading-states, 19 Oct 2026).
// Every table request is held back by the test and answered from an invented fixture, so the
// moment between request and answer can be checked: the loader and aria-busy, never "No results".
//
//   LS_BASE=http://127.0.0.1:8963 PLAYWRIGHT_CORE=/path/to/playwright-core/index.mjs \
//     node test/loading-states-browser.mjs [--before] [--shots]
//
// LS_BASE is a local `wrangler dev` of this portal. --before serves main's table modules in place of
// the branch's (for the before screenshots; the assertions are expected to fail there).
// --shots writes screenshots to private/loading-states/. Nothing here reaches production.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const base = process.env.LS_BASE || 'http://127.0.0.1:8963';
const {chromium} = await import(process.env.PLAYWRIGHT_CORE || 'playwright-core');
const before = process.argv.includes('--before'), shots = process.argv.includes('--shots');
const outDir = fileURLToPath(new URL('../private/loading-states/', import.meta.url));
if (shots) mkdirSync(outDir, {recursive: true});
const EMPTY = /No results/;

// Invented rows only: no real recipients, suppliers or people.
const grantRows = n => Array.from({length: n}, (_, i) => ({recipient: `Fixture Community Group ${i + 1}`, program: 'Fixture Program', agency: 'Department of Fixtures',
  amount: 900000 - i * 1000, start_date: '2025-07-01', electorate: 'Fixtureton', jurisdiction: 'federal', recipientId: `name:fixture-${i + 1}`, recipientAvailable: 0}));
const contractRows = n => Array.from({length: n}, (_, i) => ({id: `CN90000${i}`, title: `Fixture services contract ${i + 1}`, agency: 'Department of Fixtures',
  amount: 500000 - i * 1000, start_date: '2025-08-01', supplier_id: null, url: null, link_scope: null}));
const supplierRows = n => Array.from({length: n}, (_, i) => ({id: `s-${String(i).padStart(20, '0')}`, name: `Fixture Supplies ${i + 1}`, total: 700000 - i * 1000,
  count: 3, agency_count: 1, jurisdiction: 'federal', abn: null}));
const page = (rows, total = rows.length) => ({rows, total, page: 1, pageSize: 50, facets: {}});

const mainFiles = ['datatable.js', 'datatable.css', 'grants-table.js', 'contracts-table.js', 'suppliers-table.js'];
const mainSource = Object.fromEntries(before ? mainFiles.map(file => [file, execFileSync('git', ['show', `origin/main:portal/public/${file}`], {encoding: 'utf8'})]) : []);

const browser = await chromium.launch({channel: 'chrome', headless: true, args: ['--mute-audio']});
const results = [];
try {
  const context = await browser.newContext({viewport: {width: 1280, height: 900}, reducedMotion: 'no-preference'});
  // Production is never reached: anything off the local origin is refused.
  await context.route('**/*', route => new URL(route.request().url()).origin === base ? route.fallback() : route.abort());
  if (before) await context.route(/\/(datatable|grants-table|contracts-table|suppliers-table)\.(js|css)(\?|$)/, route => {
    const file = new URL(route.request().url()).pathname.slice(1);
    return route.fulfill({contentType: file.endsWith('.css') ? 'text/css' : 'text/javascript', body: mainSource[file]});
  });

  /** Hold every request to `pattern` until the test answers it. */
  async function holdTable(pg, pattern) {
    const held = [];
    let waiter;
    await pg.route(pattern, route => { held.push(route); waiter?.(); });
    return {
      held,
      async next() { while (!held.length) await new Promise(done => { waiter = done; }); return held.shift(); },
    };
  }
  const shot = async (pg, name) => { if (shots) await pg.screenshot({path: `${outDir}${before ? 'before' : 'after'}-${name}.png`, fullPage: false}); };
  const tableState = (pg, root) => pg.evaluate(selector => {
    const el = document.querySelector(selector);
    const host = el?.closest('[data-datatable]') || el;
    return {body: host?.querySelector('tbody')?.textContent || '', busy: host?.getAttribute('aria-busy') || host?.querySelector('[aria-busy]')?.getAttribute('aria-busy') || null,
      loader: Boolean(host?.querySelector('[data-dt-loader] .wb-wrap')), status: host?.querySelector('.dt-count')?.textContent || '',
      stale: host?.hasAttribute('data-dt-stale') || false, rows: host?.querySelectorAll('tbody tr:not(.dt-loading-row)').length || 0};
  }, root);
  async function check(name, fn) {
    try { await fn(); results.push([name, 'pass']); } catch (error) { results.push([name, `FAIL ${error.message.split('\n')[0]}`]); }
  }

  async function pendingThenAnswer({name, url, pattern, root, answer, label, empty}) {
    const pg = await context.newPage();
    const table = await holdTable(pg, pattern);
    await pg.goto(base + url);
    const first = await table.next();
    // The request is out and unanswered: the loader, aria-busy and the loading status, never the empty copy.
    await pg.waitForSelector(`${root} [data-dt-loader] .wb-wrap`, {timeout: 4000}).catch(() => {});
    await pg.waitForTimeout(300);
    const pending = await tableState(pg, root);
    await shot(pg, `${name}-loading`);
    await check(`${name}: no empty copy while pending`, () => assert.doesNotMatch(pending.body, EMPTY));
    await check(`${name}: animal loader while pending`, () => assert.ok(pending.loader));
    await check(`${name}: aria-busy while pending`, () => assert.equal(pending.busy, 'true'));
    await check(`${name}: status names the wait`, () => assert.equal(pending.status, label));
    await first.fulfill({json: answer});
    // A view that fetches before it mounts (the contracts hub) re-checks the page once mounted; answer that too.
    await pg.waitForTimeout(400);
    while (table.held.length) await table.held.shift().fulfill({json: answer});
    await pg.waitForFunction(selector => !document.querySelector(selector)?.closest('[data-datatable]')?.hasAttribute('aria-busy'), root);
    const loaded = await tableState(pg, root);
    await shot(pg, `${name}-loaded`);
    await check(`${name}: rows after the answer`, () => assert.ok(loaded.rows > 0 && !loaded.loader && !EMPTY.test(loaded.body)));
    // A refetch keeps the rows (dimmed) and still never shows the empty copy before its answer.
    await pg.locator(`${root} [data-search]`).fill('zz-fixture-none');
    await pg.locator(`${root} [data-search]`).press('Enter');
    const refetch = await table.next();
    await pg.waitForTimeout(250);
    const refetching = await tableState(pg, root);
    await shot(pg, `${name}-refetch`);
    await check(`${name}: refetch keeps rows dimmed`, () => { assert.equal(refetching.rows, loaded.rows); assert.equal(refetching.stale, true); assert.equal(refetching.busy, 'true'); });
    await check(`${name}: no empty copy while refetching`, () => assert.doesNotMatch(refetching.body, EMPTY));
    await refetch.fulfill({json: empty});
    await pg.waitForFunction(selector => !document.querySelector(selector)?.closest('[data-datatable]')?.hasAttribute('aria-busy'), root);
    const done = await tableState(pg, root);
    await shot(pg, `${name}-empty`);
    await check(`${name}: empty copy only for a genuinely empty answer`, () => { assert.match(done.body, EMPTY); assert.equal(done.loader, false); });
    await pg.close();
  }

  await pendingThenAnswer({name: 'grants-awards', url: '/money/grants', pattern: /\/api\/table\/grants\?/, root: '#money-records-body [data-grants-table]',
    answer: page(grantRows(50), 1240), empty: page([], 0), label: 'Loading grants'});
  await pendingThenAnswer({name: 'contracts', url: '/money/contracts', pattern: /\/api\/table\/contracts\?/, root: '#contracts-hub-table [data-datatable]',
    answer: page(contractRows(50), 860), empty: page([], 0), label: 'Loading contracts'});
  await pendingThenAnswer({name: 'suppliers-directory', url: '/subject/supplier', pattern: /\/api\/table\/suppliers\?/, root: '[data-suppliers-table]:not(#prerender *) [data-datatable]',
    answer: page(supplierRows(50), 420), empty: page([], 0), label: 'Loading suppliers'});

  // A register: the server draws its first rows, so only the refetch can wait. The real local
  // answer is held for a beat; a search that matches nothing is the genuinely empty answer.
  {
    const pg = await context.newPage(), name = 'vic-gifts-register', root = '[data-register-table] [data-datatable], [data-register-table].dt-root';
    const table = await holdTable(pg, /\/api\/register\/vic-gifts\?/);
    await pg.goto(base + '/register/vic-gifts');
    // Hydration re-checks the server rows; let that answer through untouched.
    const hydrate = await table.next(); await hydrate.continue();
    await pg.waitForFunction(() => !document.querySelector('[data-register-table]:not(#prerender *)')?.hasAttribute('aria-busy'));
    const loaded = await tableState(pg, '[data-register-table]:not(#prerender *)');
    await shot(pg, `${name}-loaded`);
    await check(`${name}: server rows on load`, () => assert.ok(loaded.rows > 0));
    await pg.locator('[data-register-table] [data-search]').fill('zz-fixture-none');
    await pg.locator('[data-register-table] [data-search]').press('Enter');
    const refetch = await table.next();
    await pg.waitForTimeout(250);
    const refetching = await tableState(pg, '[data-register-table]:not(#prerender *)');
    await shot(pg, `${name}-refetch`);
    await check(`${name}: refetch keeps rows dimmed`, () => { assert.equal(refetching.rows, loaded.rows); assert.equal(refetching.stale, true); assert.equal(refetching.busy, 'true'); });
    await check(`${name}: no empty copy while refetching`, () => assert.doesNotMatch(refetching.body, EMPTY));
    await refetch.continue();
    await pg.waitForFunction(() => !document.querySelector('[data-register-table]:not(#prerender *)')?.hasAttribute('aria-busy'));
    const done = await tableState(pg, '[data-register-table]:not(#prerender *)');
    await shot(pg, `${name}-empty`);
    await check(`${name}: empty copy after an empty answer`, () => assert.match(done.body, EMPTY));
    void root;
    await pg.close();
  }

  // Reduced motion: the animal stands still (a static frame, no walk).
  {
    const pg = await (await browser.newContext({viewport: {width: 390, height: 844}, reducedMotion: 'reduce'})).newPage();
    await pg.route('**/*', route => new URL(route.request().url()).origin === base ? route.fallback() : route.abort());
    const table = await holdTable(pg, /\/api\/table\/grants\?/);
    await pg.goto(base + '/money/grants');
    await table.next();
    await pg.waitForSelector('[data-dt-loader] .wb-wrap', {timeout: 4000}).catch(() => {});
    const motion = await pg.evaluate(() => {
      const trundle = document.querySelector('[data-dt-loader] .wb-trundle');
      return trundle ? getComputedStyle(trundle).animationName : 'missing';
    });
    await shot(pg, 'grants-awards-loading-390-reduced');
    await check('reduced motion: the loader does not walk', () => assert.equal(motion, 'none'));
    await pg.close();
  }
} finally {
  await browser.close();
}
for (const [name, outcome] of results) console.log(`${outcome === 'pass' ? '✔' : '✖'} ${name}${outcome === 'pass' ? '' : ` — ${outcome}`}`);
const failed = results.filter(([, outcome]) => outcome !== 'pass').length;
console.log(`${results.length - failed}/${results.length} passed`);
process.exitCode = before ? 0 : failed ? 1 : 0;
