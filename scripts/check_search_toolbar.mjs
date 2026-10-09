import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { extname, resolve, sep } from 'node:path';

// A static preview with browser-intercepted fixtures. No Worker or remote API
// is used. Set OPAX_PLAYWRIGHT_MODULE when Playwright is installed elsewhere.
const { chromium, webkit } = await import(process.env.OPAX_PLAYWRIGHT_MODULE || 'playwright');
const phase = process.env.OPAX_TOOLBAR_PHASE || 'after';
assert.ok(['before', 'after'].includes(phase));
const output = resolve(process.env.OPAX_TOOLBAR_SCREENSHOTS || fileURLToPath(new URL('../results/search-segment/', import.meta.url)), phase);
await mkdir(output, { recursive: true });
const publicDir = resolve(fileURLToPath(new URL('../portal/public/', import.meta.url)));
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png', '.webp': 'image/webp' };
// All requests to this local origin are fulfilled from files or fixtures.
const base = 'http://127.0.0.1:8803';
const results = Array.from({ length: 20 }, (_, i) => ({
  slug: `fixture-speech-${i + 1}`, resource: (i + 1).toString(16).padStart(32, '0'),
  title: `Housing supply and local infrastructure ${i + 1}`, kind: 'speech',
  date: '2025-06-12', speaker: 'Example Member', party: 'Labor', chamber: 'house', state: 'federal',
  snippet: 'The parliamentary record discusses housing supply, local infrastructure and services for growing communities.',
}));
const briefs = Object.fromEntries(results.map(r => [r.resource, 'The member discusses housing supply and infrastructure for growing communities.']));
const selectors = ['#search-readbar .ui-segmented', '#search-sort-picker > button', '#search-copylink', '#search-export'];
const measurements = [];
const engines = process.env.OPAX_TOOLBAR_WEBKIT === '1' ? [['chromium', chromium], ['webkit', webkit]] : [['chromium', chromium]];

async function fixturePage(browser, viewport) {
  const page = await browser.newPage({ viewport, reducedMotion: 'reduce', serviceWorkers: 'block' });
  // External scripts and every API request are intercepted before navigation.
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== base) return route.abort();
    if (!url.pathname.startsWith('/api/') && !url.pathname.startsWith('/ingest/')) {
      const pathname = decodeURIComponent(url.pathname);
      const filename = resolve(publicDir, `.${extname(pathname) ? pathname : pathname === '/' ? '/home.html' : '/index.html'}`);
      assert.ok(filename.startsWith(publicDir + sep));
      try { return route.fulfill({ body: await readFile(filename), contentType: mime[extname(filename)] || 'application/octet-stream' }); }
      catch { return route.fulfill({ status: 404, body: '' }); }
    }
    if (url.pathname === '/api/search-all') return route.fulfill({ json: {
      count: 20, total: 156, page: 1, per_page: 20, page_count: 8, truncated: true,
      years: { '2025': 156 }, results,
    } });
    if (url.pathname === '/api/brief') return route.fulfill({ json: { briefs } });
    if (url.pathname === '/api/search-summary') return route.fulfill({ json: { status: 'ready', reviewed_count: 20, points: [{ text: 'The matching records discuss housing supply and local infrastructure.', source_ids: ['s1'] }], sources: [{ id: 's1', title: results[0].title, href: `/doc/${results[0].slug}`, evidence: [results[0].snippet] }] } });
    if (url.pathname === '/api/voice/status') return route.fulfill({ json: { enabled: false, signed_in: false } });
    return route.fulfill({ json: {} });
  });
  return page;
}

async function boxes(page) {
  return Promise.all(selectors.map(selector => page.locator(selector).boundingBox()));
}

try {
  for (const [engine, type] of engines) {
    // Keep launch errors out of logs: Playwright includes process arguments.
    let browser;
    try { browser = await type.launch({ headless: true, executablePath: engine === 'chromium' ? process.env.OPAX_CHROMIUM_PATH : process.env.OPAX_WEBKIT_PATH }); }
    catch { throw new Error(`Could not launch ${engine}; check the local Playwright installation.`); }
    try {
      for (const [width, zoom] of [[1440, 1], [1180, 1], [1024, 1], [820, 1], [390, 1], [1024, 2]]) {
        const label = `${width}${zoom === 2 ? '-text-200' : ''}`;
        const page = await fixturePage(browser, { width, height: 1000 });
        await page.goto(`${base}/search?q=housing`, { waitUntil: 'domcontentloaded' });
        await page.locator('#search-results > li').first().waitFor();
        await page.waitForFunction(() => !lastSearch.briefsLoading);
        await page.evaluate(zoom => { document.documentElement.style.fontSize = `${zoom * 100}%`; }, zoom);
        await page.evaluate(() => document.fonts.ready);
        await page.locator('#results-bar').scrollIntoViewIfNeeded();
        const initial = await boxes(page);
        for (const mode of ['passages', 'briefs', 'passages', 'briefs']) {
          await page.locator(`#search-read-${mode}`).click();
          await page.locator(`#search-read-${mode}[aria-pressed="true"]`).waitFor();
          const controls = await boxes(page);
          const styles = await page.locator('#search-read-passages').evaluate(button => {
            const css = getComputedStyle(button);
            return { whiteSpace: css.whiteSpace, overflowWrap: css.overflowWrap, wordBreak: css.wordBreak, paddingLeft: css.paddingLeft, paddingRight: css.paddingRight, height: button.getBoundingClientRect().height };
          });
          if (phase === 'after') {
            assert.deepEqual(controls, initial, `${engine} ${label}: controls moved in ${mode}`);
            assert.equal(styles.whiteSpace, 'nowrap');
            assert.equal(styles.overflowWrap, 'normal');
            assert.equal(styles.wordBreak, 'normal');
            assert.equal(controls[0].height, controls[1].height, 'Toggle and sort heights');
            assert.equal(styles.height, controls[1].height, 'Segment button and sort heights');
            assert.equal(controls[1].height, controls[2].height, 'Sort and Copy link heights');
            assert.equal(controls[2].height, controls[3].height, 'Copy link and Export heights');
            for (const button of await page.locator('.results-actions .ui-button').all()) {
              const label = await button.evaluate(b => {
                const css = getComputedStyle(b);
                return { whiteSpace: css.whiteSpace, paddingLeft: css.paddingLeft, paddingRight: css.paddingRight, height: b.getBoundingClientRect().height, fits: b.scrollWidth <= b.clientWidth };
              });
              assert.equal(label.whiteSpace, 'nowrap');
              assert.equal(label.paddingLeft, '16px', 'Toolbar buttons share generous horizontal padding');
              assert.equal(label.paddingRight, '16px', 'Toolbar buttons share generous horizontal padding');
              assert.equal(label.height, controls[1].height);
              assert.equal(label.fits, true, 'Toolbar label fits without clipping');
            }
            if (width > 700) assert.ok(controls.every(box => box.y === controls[0].y), 'Controls stay together on one row');
            const toolbar = await page.locator('#results-bar').boundingBox();
            assert.ok(controls.every(box => box.x >= toolbar.x && box.x + box.width <= toolbar.x + toolbar.width + 1), 'Controls fit inside the toolbar');
            if (width === 1024 || width === 820) {
              const summary = await page.locator('.results-lead').boundingBox();
              assert.ok(summary.y + summary.height <= controls[0].y, 'Summary takes its own row above the intact controls');
            }
            assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'No page overflow');
          }
          const path = `${output}/${engine}-search-${label}-${mode}.png`;
          await page.locator('#results-bar').screenshot({ path });
          measurements.push({ engine, width, zoom, mode, controls, styles, path });
        }
        await page.close();
        console.log(`${engine} ${label}: ${phase} captured in both modes${phase === 'after' ? '; layout checks passed' : ''}`);
      }
      if (phase === 'after') {
        for (const [name, pathname, target] of [
          ['ask', '/ask', '#ask-builder'],
          ['home', '/', '#hp-builder'],
          ['ui-workbench', '/ui-workbench.html', '#choices'],
        ]) {
          for (const width of [1024, 390]) {
            const page = await fixturePage(browser, { width, height: 1000 });
            await page.goto(base + pathname);
            if (name.startsWith('home')) await page.locator('.hp-guided > summary').click();
            await page.locator(target).first().waitFor();
            await page.evaluate(() => document.fonts.ready);
            for (const button of await page.locator(`${target} .ui-segmented > button, ${target}.ui-segmented > button`).all()) {
              if (await button.isVisible()) assert.equal(await button.evaluate(b => getComputedStyle(b).whiteSpace), 'nowrap');
            }
            await page.locator(target).first().screenshot({ path: `${output}/${engine}-${name}-${width}.png` });
            await page.close();
            console.log(`${engine} ${name} ${width}: shared segmented control checked and captured`);
          }
        }
      }
    } finally { await browser.close(); }
  }
} finally {
  await writeFile(`${output}/measurements.json`, JSON.stringify(measurements, null, 2) + '\n');
}
