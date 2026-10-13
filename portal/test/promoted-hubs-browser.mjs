/** Offline browser receipts from the actual Worker and promoted public assets. */
import {readFile, mkdir, mkdtemp, rm, writeFile} from 'node:fs/promises';
import {resolve, dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(resolve(root, 'portal/package.json'));
const {build} = require('esbuild'), {Miniflare, convertV4MiniflareOptions} = require('miniflare');
const {chromium} = createRequire(resolve(process.env.OPAX_HUB_BROWSER_TOOLS || '/tmp/opax-dt-tools', 'package.json'))('playwright-core');
const code = await build({entryPoints:[resolve(root, 'portal/src/index.ts')], bundle:true, platform:'browser', format:'esm', write:false, external:['node:*'], plugins:[{name:'no-images', setup(b) {
  b.onResolve({filter:/^\.\/og-render$/}, () => ({path:'images', namespace:'preview'}));
  b.onLoad({filter:/.*/, namespace:'preview'}, () => ({contents:'export const renderOgPng=async()=>null;export const renderOgJpeg=renderOgPng;export const renderStoryJpeg=renderOgPng;', loader:'js'}));
}}]});
const scratch = await mkdtemp(resolve(tmpdir(), 'opax-promoted-hubs-'));
const previous = process.cwd();
process.chdir(scratch);
const mime = p => p.endsWith('.css') ? 'text/css' : p.endsWith('.js') ? 'text/javascript' : p.endsWith('.json') ? 'application/json' : p.endsWith('.woff2') ? 'font/woff2' : 'text/html';
const mf = new Miniflare(convertV4MiniflareOptions({host:'::1', modules:true, compatibilityDate:'2026-09-01', compatibilityFlags:['nodejs_compat'], script:code.outputFiles[0].text,
  outboundService:async () => {throw Error('External network disabled');},
  serviceBindings:{ASSETS:async req => {
    const path = new URL(req.url).pathname, file = resolve(root, 'portal/public', path === '/' ? 'index.html' : '.' + path);
    if (!file.startsWith(resolve(root, 'portal/public') + '/')) return new Response('', {status:404});
    try {return new Response(await readFile(file), {headers:{'content-type':mime(path)}});} catch {return new Response('', {status:404});}
  }}, bindings:{INDEXNOW_ENABLED:'false', INDEXNOW_DRY_RUN:'true'}}));
const server = createServer(async (req, res) => {
  try {
    if (req.url.startsWith('/api/') && !req.url.startsWith('/api/register/vic-gifts')) {res.writeHead(404);res.end('{}');return;}
    const response = await mf.dispatchFetch('https://opax.com.au' + req.url);
    res.writeHead(response.status, Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
  } catch {res.writeHead(500);res.end('Preview unavailable');}
});
let browser;
try {
  await new Promise(done => server.listen(0, '::1', done));
  const base = `http://[::1]:${server.address().port}`;
  browser = await chromium.launch({executablePath:'/usr/bin/google-chrome', headless:true, args:['--no-sandbox', '--disable-dev-shm-usage']});
  const context = await browser.newContext();
  await context.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
  const page = await context.newPage(), errors = [], results = [];
  page.on('pageerror', error => errors.push(error.message));
  const out = resolve(root, 'docs/coverage/promote-hubs');
  await mkdir(out, {recursive:true});
  for (const [hub, route] of [['budget', '/budget'], ['vic-gifts', '/register/vic-gifts']]) {
    for (const width of [390, 1440]) {
      await page.setViewportSize({width, height:1000});
      const response = await page.goto(base + route);
      assert.equal(response.status(), 200);
      await page.waitForSelector('[data-datatable]');
      await page.waitForTimeout(300);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
      assert.equal(overflow, false);
      await page.screenshot({path:resolve(out, `${hub}-${width}.png`)});
      await page.screenshot({path:resolve(out, `${hub}-${width}-full.png`), fullPage:true});
      results.push({route, width, status:response.status(), horizontalOverflow:overflow});
    }
  }
  const staticContext = await browser.newContext({javaScriptEnabled:false});
  await staticContext.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
  const staticPage = await staticContext.newPage();
  for (const route of ['/budget', '/register/vic-gifts']) {
    assert.equal((await staticPage.goto(base + route)).status(), 200);
    assert.ok(await staticPage.locator('[data-datatable] tbody tr').count() > 0);
  }
  assert.equal((await staticPage.goto(base + '/subject/person/jacinta-allan')).status(), 200);
  assert.match(await staticPage.locator('#subject-vic-gifts').textContent(), /32 published entries/);
  assert.deepEqual(errors, []);
  const assets = {};
  for (const name of ['budget', 'vic-gifts']) {
    const bytes = await readFile(resolve(root, `portal/public/${name}/data.json`));
    assets[name] = {bytes:bytes.length, sha256:createHash('sha256').update(bytes).digest('hex'), promotion:JSON.parse(bytes).promotion};
  }
  await writeFile(resolve(out, 'browser-results.json'), JSON.stringify({preview:'Local Miniflare Worker; disk-backed promoted public assets; external network disabled', results, assets, javaScriptDisabled:true, victorianPersonSection:true, pageErrors:errors}, null, 2) + '\n');
  console.log(JSON.stringify({results, javaScriptDisabled:true, victorianPersonSection:true, pageErrors:errors}));
} finally {
  await browser?.close();
  await new Promise(done => server.close(done));
  await mf.dispose();
  process.chdir(previous);
  await rm(scratch, {recursive:true, force:true});
}
