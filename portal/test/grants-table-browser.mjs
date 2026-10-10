// Run inside unshare -rn with loopback enabled. Stop only this runner's children.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFile, mkdir, writeFile, appendFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {tablePrivacyIndex, assertTablePrivacy} from './datatable-privacy.mjs';
import {grantFixtureRows} from '../src/grants-table-fixture.ts';
import {grantPrivacyFixture} from './grants-table-privacy-fixture.mjs';
const {chromium} = createRequire(resolve(process.env.DT_BROWSER_TOOLS || '/tmp/opax-dt-tools', 'package.json'))('playwright-core');
const folder = fileURLToPath(new URL('../private/dt-grants/', import.meta.url));
await mkdir(folder, {recursive: true});
const base = 'http://127.0.0.1:8795', hostSelector = '#money-records-body [data-grants-table]';
const pause = ms => new Promise(done => setTimeout(done, ms));
const disk = async path => JSON.parse(await readFile(new URL('../public' + path, import.meta.url), 'utf8'));
const fixture = await grantPrivacyFixture(disk), donorIndex = await tablePrivacyIndex();
const {withheld} = await grantFixtureRows(fixture.read);
const index = {...donorIndex, safe: value => donorIndex.safe(value) && !withheld(value)};
let browser, server, stage = 'start';
async function start(fixtureMode) {
  server = spawn(process.execPath, ['test/grants-table-browser-server.mjs'], {cwd: fileURLToPath(new URL('../', import.meta.url)), env: {...process.env, DT_GRANTS_PRIVACY_FIXTURE: fixtureMode ? '1' : ''}, stdio: ['ignore', 'pipe', 'pipe']});
  server.stdout.on('data', value => {void appendFile(resolve(folder, 'revision-browser-server.log'), value);});
  server.stderr.on('data', value => {void appendFile(resolve(folder, 'revision-browser-server.log'), value);});
  await writeFile(resolve(folder, 'revision-browser-server.pid'), String(server.pid));
  for (let i = 0; i < 240; i++) {
    if (server.exitCode != null || server.signalCode != null) throw Error('Local server stopped');
    try {if ((await fetch(base + '/datatable.css')).ok) return;} catch {}
    await pause(250);
  }
  throw Error('Local server did not start');
}
async function stop() {
  if (server) {
    const owned = server; server = undefined;
    if (owned.exitCode != null || owned.signalCode != null) return;
    const exit = new Promise(done => owned.once('exit', done)); owned.kill('SIGINT');
    const closed = await Promise.race([exit.then(() => true), pause(5000).then(() => false)]);
    if (!closed) {owned.kill('SIGTERM'); await exit;}
  }
}
try {
  await start(true);
  browser = await chromium.launch({executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-background-networking', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1']});
  const context = await browser.newContext({viewport: {width: 1280, height: 1000}, acceptDownloads: true});
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    return url.origin === base && !/^\/api\/(ask|search-summary|followups|journey-story|voice|auth|community)/.test(url.pathname) ? route.continue() : route.abort();
  });
  const page = await context.newPage(), responses = [], errors = [];
  page.on('pageerror', () => errors.push('runtime error'));
  page.on('response', async response => {if (new URL(response.url()).pathname === '/api/table/grants') responses.push(await response.text().catch(() => ''));});
  const host = page.locator(hostSelector);
  const settled = () => page.waitForFunction(selector => document.querySelector(selector)?.querySelector('.dt-count') && !document.querySelector(selector).hasAttribute('aria-busy'), hostSelector);
  const total = () => host.locator('[data-dt-page]').evaluate(el => JSON.parse(el.textContent).total);
  const load = async params => {await page.goto(base + '/money/grants?' + new URLSearchParams({...params, campaign: 'fixture'})); await settled();};
  const download = async name => {const pending = page.waitForEvent('download'); await host.locator('[data-export]').click(); const result = await pending; const path = resolve(folder, name); await result.saveAs(path); return path;};
  stage = 'organisation control'; await load({});
  assert.equal(await total(), 2);
  assert.ok((await host.innerText()).includes('fixture-public Council Pty Ltd'));
  let csvPath = await download('revision-public.csv');
  assert.ok((await readFile(csvPath, 'utf8')).includes('25000'));
  const clientInput = await page.evaluate(selector => JSON.parse(document.querySelector(selector).querySelector('[data-dt-page]').textContent), hostSelector);
  const cases = [...fixture.names.filter((_, i) => i % 10 === 0), ...fixture.overrides.map(g => g.rn), donorIndex.values.find(value => value.includes(' '))].filter(Boolean);
  for (const [i, value] of cases.entries()) {
    for (const kind of ['q', 'f.program']) {
      stage = `initial privacy case ${i} ${kind}`;
      await load({['t.' + kind]: kind === 'q' ? value : JSON.stringify([value])});
      assert.equal(await total(), 0, stage);
      assert.equal(new URL(page.url()).searchParams.get('campaign'), 'fixture');
      assert.equal(new URL(page.url()).searchParams.has('t.' + kind), false);
      assert.equal(await host.locator('[data-search]').inputValue(), '');
      await page.evaluate(() => {window.privacyEvents = []; addEventListener('opax:analytics', event => window.privacyEvents.push(event.detail));});
      csvPath = await download('revision-rejected.csv');
      assert.equal((await readFile(csvPath, 'utf8')).trim().split(/\r?\n/).length, 1, 'rejected download stays empty');
      await assertTablePrivacy({clientInput, serverResponses: responses, csvPath, url: decodeURIComponent(page.url()), renderedText: await host.innerHTML(), accessibleText: await host.ariaSnapshot(), analytics: await page.evaluate(() => window.privacyEvents)}, index);
    }
  }
  stage = 'positive name search'; await load({'t.q': 'fixture-public'});
  assert.equal(await total(), 1); assert.equal(await host.locator('[data-search]').inputValue(), 'fixture-public');
  assert.equal(new URL(page.url()).searchParams.get('t.q'), 'fixture-public');
  stage = 'submitted withheld search';
  await host.locator('[data-search]').fill(fixture.names[0]);
  await host.locator('form').evaluate(el => el.requestSubmit()); await settled();
  assert.equal(await total(), 0);
  assert.equal(await host.locator('[data-search]').inputValue(), '');
  assert.equal(new URL(page.url()).searchParams.has('t.q'), false);
  csvPath = await download('revision-rejected.csv');
  assert.equal((await readFile(csvPath, 'utf8')).trim().split(/\r?\n/).length, 1);
  await assertTablePrivacy({clientInput, serverResponses: responses, csvPath, url: decodeURIComponent(page.url()), renderedText: await host.innerHTML(), accessibleText: await host.ariaSnapshot(), analytics: await page.evaluate(() => window.privacyEvents)}, index);
  stage = 'real grants'; await stop(); await start(false); await page.goto(base + '/money/grants'); await settled();
  assert.ok(await total() > 50);
  for (const width of [390, 1280]) {
    await page.setViewportSize({width, height: 1000}); await page.evaluate(() => document.fonts.ready);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({path: resolve(folder, `revision-after-${width}.png`)});
  }
  stage = 'multi-select alternatives';
  const filters = host.locator('[data-panel="filters"]');
  if (await filters.count()) await filters.locator(':scope > summary').click();
  const programs = host.locator('[data-panel="facet-program"]'); await programs.locator(':scope > summary').click();
  const alternatives = await programs.locator('input').count(); assert.ok(alternatives > 1);
  await programs.locator('input').first().click(); await settled();
  assert.equal(await host.locator('[data-panel="facet-program"] input').count(), alternatives);
  assert.equal(errors.length, 0);
  await writeFile(resolve(folder, 'revision-browser-results.json'), JSON.stringify({initialCases: cases.length * 2, submittedQueries: 1, surfaces: 7, downloadedCSV: true, widths: [390, 1280], runtimeErrors: errors.length}, null, 2));
  console.log(`Grants browser privacy passed ${cases.length * 2} initial URL cases, real CSV downloads and seven surfaces; screenshots at 390 and 1280.`);
} catch (error) {
  await writeFile(resolve(folder, 'revision-browser-error.log'), String(error.stack));
  throw Error('Grants browser gate failed at ' + stage);
} finally {if (browser) await browser.close(); await stop();}
