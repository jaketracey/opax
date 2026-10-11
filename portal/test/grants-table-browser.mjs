// Run inside unshare -rn with loopback enabled. Only this runner's child is stopped.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {assertTablePrivacy} from './datatable-privacy.mjs';
import {grantsPrivateInputs} from './grants-table-inputs.mjs';
import {tableIdentityIndex} from '../../scripts/load_tables.mjs';
const {chromium} = createRequire(resolve(process.env.DT_BROWSER_TOOLS || '/tmp/opax-dt-tools', 'package.json'))('playwright-core');
const folder = fileURLToPath(new URL('../private/dt-grants/', import.meta.url));
await mkdir(folder, {recursive: true});
const base = 'http://127.0.0.1:8795', selector = '#money-records-body [data-grants-table]';
const inputs = await grantsPrivateInputs(), policy = await tableIdentityIndex();
const index = {safe: value => !policy.check(value)};
const server = spawn(process.execPath, ['test/grants-table-browser-server.mjs'], {cwd: fileURLToPath(new URL('../', import.meta.url)), stdio: 'ignore'});
let browser, stage = 'local D1 startup';
try {
  let ready = false;
  for (let i = 0; i < 360; i++) {
    try {if ((await fetch(base + '/api/table/grants?pageSize=1')).ok) {ready = true; break;}} catch {}
    await new Promise(done => setTimeout(done, 500));
  }
  assert.ok(ready, 'local D1 server ready');
  browser = await chromium.launch({executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1']});
  const context = await browser.newContext({acceptDownloads: true, viewport: {width: 1280, height: 1000}});
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (!['127.0.0.1', 'localhost'].includes(url.hostname) || /\/(?:api\/(?:ask|voice|auth)|generate)(?:\/|$)/.test(url.pathname)) return route.abort();
    return route.continue();
  });
  const page = await context.newPage(), responses = [], errors = [];
  page.on('pageerror', () => errors.push('runtime error'));
  page.on('response', async response => {if (new URL(response.url()).pathname === '/api/table/grants') responses.push(await response.text().catch(() => ''));});
  const host = page.locator(selector);
  const settled = async () => {
    await page.waitForFunction(selector => {
      const el = document.querySelector(selector);
      return el?.querySelector('.dt-count') && !el.hasAttribute('aria-busy');
    }, selector);
  };
  const load = async params => {await page.goto(base + '/money/grants?' + new URLSearchParams(params)); await settled();};
  const total = () => host.locator('[data-dt-page]').evaluate(el => JSON.parse(el.textContent).total);
  stage = 'public organisation controls'; await load({}); assert.ok(await total() > 50);
  const control = await host.locator('[data-dt-page]').evaluate(el => JSON.parse(el.textContent).rows.find(r => !r.aggregate));
  assert.ok(control, 'organisation control in browser hydration');
  assert.ok((await host.innerText()).includes(control.recipient), 'organisation visible in rendered table');
  assert.ok(index.safe(await host.innerHTML()), 'public browser rows and facets');
  for (const width of [390, 1280]) {
    await page.setViewportSize({width, height: 1000}); await page.evaluate(() => document.fonts.ready);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({path: resolve(folder, `round3-after-${width}.png`)});
  }
  await page.setViewportSize({width: 1280, height: 1000});
  stage = 'actual D1 CSV download'; await load({'t.q': control.recipient}); assert.ok(await total() > 0);
  const pending = page.waitForEvent('download'); await host.locator('[data-export]').click();
  const download = await pending, csvPath = resolve(folder, 'round3-public.csv'); await download.saveAs(csvPath);
  const csv = await readFile(csvPath, 'utf8'); assert.ok(csv.includes(control.id), 'organisation survives actual downloaded CSV');
  assert.ok(csv.includes(control.recipient.replaceAll('"', '""')), 'organisation name in actual downloaded CSV');
  const clientInput = await host.locator('[data-dt-page]').evaluate(el => JSON.parse(el.textContent));
  const probeCases = [...inputs.recipients.filter((_, i) => i % 20 === 0), inputs.labels[0], inputs.identifiers[0]];
  await page.evaluate(() => {window.privacyEvents = []; addEventListener('opax:analytics', e => window.privacyEvents.push(e.detail));});
  for (const [i, value] of probeCases.entries()) for (const key of ['q', 'f.program']) {
    stage = `initial privacy probe ${i} ${key}`;
    await load({['t.' + key]: key === 'q' ? value : JSON.stringify([value])}); assert.equal(await total(), 0);
    assert.equal(await host.locator('[data-search]').inputValue(), ''); assert.equal(new URL(page.url()).searchParams.has('t.' + key), false);
    assert.ok(await host.locator('[data-export]').isDisabled());
    await assertTablePrivacy({clientInput, serverResponses: responses, csvPath, url: decodeURIComponent(page.url()), renderedText: await host.innerHTML(), accessibleText: await host.ariaSnapshot(), analytics: await page.evaluate(() => window.privacyEvents || [])}, index);
  }
  stage = 'organisation positive query after rejection'; await load({'t.q': control.recipient}); assert.ok(await total() > 0);
  assert.equal(await host.locator('[data-search]').inputValue(), control.recipient);
  assert.equal(errors.length, 0);
  const result = {initialURLProbes: probeCases.length * 2, actualD1CSV: true, organisationControls: true, withheldHits: 0, runtimeErrors: 0, screenshots: [390, 1280]};
  await writeFile(resolve(folder, 'round3-browser-results.json'), JSON.stringify(result, null, 2)); console.log(JSON.stringify(result));
} catch (error) {
  console.error('Grants browser gate failed at ' + stage + ': ' + error.name);
  const location = String(error.stack).match(/grants-table-browser\.mjs:\d+:\d+/)?.[0];
  if (location) console.error(location); process.exitCode = 1;
} finally {
  await browser?.close(); server.kill('SIGTERM');
  await Promise.race([once(server, 'exit'), new Promise(done => setTimeout(done, 5000))]);
}
