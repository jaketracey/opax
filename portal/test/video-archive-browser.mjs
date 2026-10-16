/** Local browser receipts for /video/senate (not part of `npm test`).
 *
 *   node test/video-archive-browser.mjs        # writes portal/private/video-archive/*.png
 *
 * The actual Worker runs in Miniflare with assets from disk and outbound network
 * disabled; /api is answered 404 except the person slug table. Headless Chrome is
 * driven over CDP with audio muted, and every request off the local origin is failed
 * and recorded: the page must ask for nothing from YouTube before a press.
 * Ports: 9008 (preview), 9009 (Chrome DevTools). Chrome is stopped by its own PID. */
import {readFile, mkdir, mkdtemp, rm, writeFile} from 'node:fs/promises';
import {resolve, dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {build} from 'esbuild';
import {Miniflare, convertV4MiniflareOptions} from 'miniflare';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9008, DEVTOOLS = 9009;
const out = resolve(root, 'portal/private/video-archive');
const code = await build({entryPoints: [resolve(root, 'portal/src/index.ts')], bundle: true, platform: 'browser', format: 'esm', write: false, external: ['node:*'], plugins: [{name: 'no-images', setup(b) {
  b.onResolve({filter: /^\.\/og-render$/}, () => ({path: 'images', namespace: 'preview'}));
  b.onLoad({filter: /.*/, namespace: 'preview'}, () => ({contents: 'export const renderOgPng=async()=>null;export const renderOgJpeg=renderOgPng;export const renderStoryJpeg=renderOgPng;', loader: 'js'}));
}}]});
const scratch = await mkdtemp(resolve(tmpdir(), 'opax-video-archive-'));
const mime = p => p.endsWith('.css') ? 'text/css' : /\.m?js$/.test(p) ? 'text/javascript' : p.endsWith('.json') ? 'application/json' : p.endsWith('.woff2') ? 'font/woff2' : p.endsWith('.svg') ? 'image/svg+xml' : p.endsWith('.webp') ? 'image/webp' : 'text/html';
const mf = new Miniflare(convertV4MiniflareOptions({host: '127.0.0.1', modules: true, compatibilityDate: '2026-09-01', compatibilityFlags: ['nodejs_compat'], script: code.outputFiles[0].text,
  outboundService: async () => { throw Error('External network disabled'); },
  serviceBindings: {ASSETS: async req => {
    const path = decodeURIComponent(new URL(req.url).pathname), file = resolve(root, 'portal/public', path === '/' ? 'index.html' : '.' + path);
    if (!file.startsWith(resolve(root, 'portal/public') + '/')) return new Response('', {status: 404});
    try { return new Response(await readFile(file), {headers: {'content-type': mime(path)}}); } catch { return new Response('', {status: 404}); }
  }}, bindings: {INDEXNOW_ENABLED: 'false', INDEXNOW_DRY_RUN: 'true'}}));
const server = createServer(async (req, res) => {
  try {
    if (req.url.startsWith('/api/') && !req.url.startsWith('/api/person-slugs')) { res.writeHead(404, {'content-type': 'application/json'}); res.end('{}'); return; }
    const response = await mf.dispatchFetch('https://opax.com.au' + req.url);
    const headers = Object.fromEntries(response.headers);
    delete headers['strict-transport-security'];
    res.writeHead(response.status, headers); res.end(Buffer.from(await response.arrayBuffer()));
  } catch (e) { res.writeHead(500); res.end('Preview unavailable: ' + e.message); }
});
await new Promise(done => server.listen(PORT, '127.0.0.1', done));
const base = `http://127.0.0.1:${PORT}`;
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${DEVTOOLS}`, `--user-data-dir=${scratch}/chrome`, '--mute-audio', '--no-first-run', '--no-default-browser-check',
  '--autoplay-policy=no-user-gesture-required', 'about:blank'], {stdio: 'ignore'});
const results = [];
try {
  let target;
  for (let i = 0; i < 50 && !target; i++) {
    await new Promise(r => setTimeout(r, 200));
    target = await fetch(`http://127.0.0.1:${DEVTOOLS}/json/list`).then(r => r.json()).then(list => list.find(t => t.type === 'page')).catch(() => null);
  }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise(r => ws.addEventListener('open', r, {once: true}));
  let id = 0; const pending = new Map(), listeners = [];
  ws.addEventListener('message', ({data}) => {
    const msg = JSON.parse(data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); } else listeners.forEach(fn => fn(msg));
  });
  const send = (method, params = {}) => new Promise((ok, fail) => { const n = ++id; pending.set(n, m => m.error ? fail(Error(method + ': ' + m.error.message)) : ok(m.result)); ws.send(JSON.stringify({id: n, method, params})); });
  let allowYouTube = false;
  const external = new Set();
  listeners.push(msg => {
    if (msg.method !== 'Fetch.requestPaused') return;
    const url = msg.params.request.url, local = url.startsWith(base);
    const youtube = /^https:\/\/([a-z0-9-]+\.)*(youtube-nocookie\.com|ytimg\.com|googlevideo\.com|youtube\.com|ggpht\.com|gstatic\.com|google\.com|doubleclick\.net)\//.test(url);
    if (!local) external.add(new URL(url).host);
    if (local || (allowYouTube && youtube)) send('Fetch.continueRequest', {requestId: msg.params.requestId}).catch(() => {});
    else send('Fetch.failRequest', {requestId: msg.params.requestId, errorReason: 'BlockedByClient'}).catch(() => {});
  });
  await send('Fetch.enable', {patterns: [{urlPattern: '*'}]});
  await send('Page.enable'); await send('Runtime.enable');
  const evaluate = async (expression) => (await send('Runtime.evaluate', {expression, awaitPromise: true, returnByValue: true})).result.value;
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const until = async (expression, ms = 15000) => { for (let t = 0; t < ms; t += 200) { if (await evaluate(expression)) return true; await wait(200); } return false; };
  const viewport = (width) => send('Emulation.setDeviceMetricsOverride', {width, height: width < 600 ? 844 : 1000, deviceScaleFactor: width < 600 ? 2 : 1, mobile: width < 600});
  const shot = async (name, {full = false, clip = null} = {}) => {
    let params = {format: 'png'};
    if (full) {
      const {cssContentSize} = await send('Page.getLayoutMetrics');
      params = {...params, captureBeyondViewport: true, clip: {x: 0, y: 0, width: cssContentSize.width, height: Math.min(cssContentSize.height, 12000), scale: 1}};
    } else if (clip) params = {...params, captureBeyondViewport: true, clip: {...clip, scale: 1}};
    const {data} = await send('Page.captureScreenshot', params);
    await writeFile(resolve(out, name + '.png'), Buffer.from(data, 'base64'));
  };
  const go = async (path) => { await send('Page.navigate', {url: base + path}); await wait(400); await until('document.readyState === "complete"'); };
  await mkdir(out, {recursive: true});
  const facts = `({cards: document.querySelectorAll("[data-video-card]").length, iframes: document.querySelectorAll("iframe:not([src*=googletagmanager])").length,
    overflow: document.documentElement.scrollWidth > innerWidth, years: [...document.querySelectorAll(".video-year")].map(s => s.id),
    chips: [...document.querySelectorAll(".video-kinds a")].map(a => a.textContent + (a.getAttribute("aria-current") ? " (current)" : "")),
    others: document.querySelectorAll(".video-others li").length, height: document.documentElement.scrollHeight})`;
  for (const width of [1440, 390]) {
    await viewport(width);
    await go('/video/senate');
    await until('!!document.querySelector("[data-video-card]") && !!document.querySelector("link[href=\\"/video-card.css\\"]")');
    await wait(500);
    const all = await evaluate(facts);
    await shot(`video-senate-${width}`);
    await shot(`video-senate-${width}-full`, {full: true});
    // A year jump lands on its section (content-visibility must not break the anchor).
    await evaluate(`document.querySelector('.hub-jump a[href="#y2022"]').click()`);
    await wait(600);
    const jump = await evaluate(`({hash: location.hash, top: Math.round(document.getElementById("y2022").getBoundingClientRect().top)})`);
    await shot(`video-senate-${width}-jump-2022`);
    await go('/video/senate?kind=first-speech');
    await until('!!document.querySelector("[data-video-card]")');
    await wait(500);
    const firstSpeeches = await evaluate(facts);
    await shot(`video-senate-first-speeches-${width}`);
    await shot(`video-senate-first-speeches-${width}-full`, {full: true});
    await go('/video/senate?kind=other');
    await wait(500);
    const other = await evaluate(facts);
    await shot(`video-senate-other-${width}`);
    results.push({width, all, jump, firstSpeeches, other});
  }
  await viewport(1440);
  await go('/sitting');
  await wait(400);
  results.push({sittingIndexLink: await evaluate(`document.querySelector('.hub-more a')?.getAttribute('href')`)});
  await shot('sitting-index-1440');
  await go('/sitting/2026-10-12');
  await until('!!document.querySelector("#senate-video")');
  await evaluate(`document.querySelector("#senate-video").scrollIntoView({block: "start"}); scrollBy(0, -80)`);
  await wait(300);
  results.push({sittingWeekLink: await evaluate(`document.querySelector('#senate-video .video-more a')?.getAttribute('href')`)});
  await shot('sitting-week-1440-more-link');
  results.push({externalHostsRequested: [...external].sort()});
  await writeFile(resolve(out, 'browser-results.json'), JSON.stringify(results, null, 2) + '\n');
  console.log(JSON.stringify(results, null, 2));
  ws.close();
} finally {
  chrome.kill('SIGTERM');
  server.close();
  await mf.dispose();
  await new Promise(r => setTimeout(r, 500));
  await rm(scratch, {recursive: true, force: true});
}
