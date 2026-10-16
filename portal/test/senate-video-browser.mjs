/** Local browser receipts for the Senate video cards (not part of `npm test`).
 *
 *   node test/senate-video-browser.mjs        # writes portal/private/senate-video/*.png
 *
 * The actual Worker runs in Miniflare with assets from disk and outbound network
 * disabled; /api is answered 404 except the person slug table. Headless Chrome is
 * driven over CDP with audio muted. Every request off the local origin is failed,
 * except the "after" shot, which lets the Senate's nocookie player load (local dev only).
 * Ports: 9000 (preview), 9001 (Chrome DevTools). Chrome is stopped by its own PID. */
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
const PORT = 9000, DEVTOOLS = 9001;
const out = resolve(root, 'portal/private/senate-video');
const code = await build({entryPoints: [resolve(root, 'portal/src/index.ts')], bundle: true, platform: 'browser', format: 'esm', write: false, external: ['node:*'], plugins: [{name: 'no-images', setup(b) {
  b.onResolve({filter: /^\.\/og-render$/}, () => ({path: 'images', namespace: 'preview'}));
  b.onLoad({filter: /.*/, namespace: 'preview'}, () => ({contents: 'export const renderOgPng=async()=>null;export const renderOgJpeg=renderOgPng;export const renderStoryJpeg=renderOgPng;', loader: 'js'}));
}}]});
const scratch = await mkdtemp(resolve(tmpdir(), 'opax-senate-video-'));
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
  const cardBox = `(() => { const c = document.querySelector('[data-video-card]'); c.scrollIntoView({block: 'center'}); const r = c.getBoundingClientRect(); return {x: Math.max(0, r.x - 12), y: r.y + scrollY - 12, width: r.width + 24, height: r.height + 24}; })()`;
  await mkdir(out, {recursive: true});
  for (const width of [390, 1440]) {
    await viewport(width);
    allowYouTube = false;
    // The sitting index with its Video marker.
    await go('/sitting');
    await until('!!document.querySelector(".hub-weeks")');
    await shot(`sitting-index-${width}`);
    // The 12 Oct sitting week: four Question Time cards.
    await go('/sitting/2026-10-12');
    await until('!!document.querySelector("[data-video-card]") && !!document.querySelector("link[href=\\"/video-card.css\\"]")');
    await wait(300);
    const week = await evaluate(`({cards: document.querySelectorAll("[data-video-card]").length, iframes: document.querySelectorAll("iframe").length, overflow: document.documentElement.scrollWidth > innerWidth, facadeHeight: document.querySelector(".video-facade").getBoundingClientRect().height})`);
    await evaluate(`document.querySelector("#senate-video").scrollIntoView({block: "start"})`);
    await wait(200);
    await shot(`sitting-week-${width}`);
    await shot(`sitting-week-${width}-full`, {full: true});
    const box = await evaluate(cardBox);
    await shot(`facade-before-${width}`, {clip: box});
    // Keyboard press: focus the button, Enter.
    allowYouTube = true;
    await evaluate(`document.querySelector(".video-facade").focus()`);
    await send('Input.dispatchKeyEvent', {type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r'});
    await send('Input.dispatchKeyEvent', {type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13});
    await until('!!document.querySelector("[data-video-card] iframe")');
    await wait(4000);
    const after = await evaluate(`({src: document.querySelector("[data-video-card] iframe").src, title: document.querySelector("[data-video-card] iframe").title, focused: document.activeElement?.tagName})`);
    await shot(`facade-after-${width}`, {clip: await evaluate(cardBox)});
    allowYouTube = false;
    // A senator's first-speech card on the app's person page.
    await go('/subject/person/gatenby');
    const person = await until('!!document.querySelector("#person-first-speech [data-video-card]")', 20000);
    await wait(500);
    if (person) await evaluate(`document.querySelector("#person-first-speech").scrollIntoView({block: "start"}); scrollBy(0, -120)`);
    await wait(300);
    await shot(`person-first-speech-${width}`);
    const personFacts = await evaluate(`({parent: document.querySelector("#person-first-speech")?.parentElement?.id, top: Math.round(document.querySelector("#person-first-speech")?.getBoundingClientRect().top), scrollY, card: !!document.querySelector("#person-first-speech [data-video-card]"), iframes: document.querySelectorAll("iframe").length, overflow: document.documentElement.scrollWidth > innerWidth, rail: [...document.querySelectorAll(".entry-rail-list a")].map(a => a.textContent.trim())})`);
    results.push({width, week, after, person: personFacts});
  }
  // The server answer (what a crawler or a reader without scripts gets) for both of the senator's addresses.
  results.push({serverFirstSpeech: Object.fromEntries(await Promise.all(['/subject/person/gatenby', '/subject/person/chris-gatenby'].map(async path =>
    [path, await fetch(base + path).then(r => r.text()).then(t => /id="ssr-first-speech"[\s\S]*?data-video-id="L9IsSWZEO0Y"/.test(t) && /href="\/video-card\.css"/.test(t))])))});
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
