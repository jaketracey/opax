// Browser harness for the research-loop Ask UI: the live step rows (round
// rules, counts and times, an error row), "How this was researched" under the
// answer, and the research's records merged into the sources block, on /ask
// and in the docked chat. Dev-only and offline: a local static server holds
// public/, every other origin is blocked, and /api/ask?stream=1 is answered
// in-page by a stream fed event by event (test/fixtures/research-loop-streams.mjs).
//
//   OPAX_PLAYWRIGHT_MODULE=/path/to/playwright-core \
//   OPAX_BROWSER_EXECUTABLE="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
//   node test/research-ui-browser.mjs
//
// WIDTHS (default 390,820,1440,1920), SCHEMES (default light,dark) and PORT
// (default 8964) narrow or move a run. Shots and proof.json land in
// portal/private/research-ui/.
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, extname } from 'node:path';
import assert from 'node:assert/strict';
import { STREAMS } from './fixtures/research-loop-streams.mjs';

const publicDir = fileURLToPath(new URL('../public/', import.meta.url));
const output = fileURLToPath(new URL('../private/research-ui/', import.meta.url));
await mkdir(output, { recursive: true });
const types = { '.html': 'text/html', '.js': 'application/javascript', '.mjs': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.woff': 'font/woff' };
const server = createServer(async (req, res) => {
  try {
    const path = new URL(req.url, 'http://127.0.0.1').pathname;
    const file = resolve(publicDir, extname(path) ? '.' + path : 'index.html');
    if (!file.startsWith(publicDir)) { res.writeHead(403); res.end(); return; }
    const bytes = await readFile(file);
    res.writeHead(200, { 'content-type': types[extname(file)] || 'application/octet-stream' });
    res.end(bytes);
  } catch { res.writeHead(404); res.end('Missing local fixture asset'); }
});
await new Promise((ok, fail) => server.once('error', fail).listen(Number(process.env.PORT || 8964), '127.0.0.1', ok));
const origin = 'http://127.0.0.1:' + server.address().port;

// The in-page stream, and layout shifts summed as they come.
const INIT = () => {
  const realFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const url = typeof input === 'string' ? input : input.url;
    if (/\/api\/ask\?stream=1/.test(url)) {
      let ctrl;
      const enc = new TextEncoder();
      const body = new ReadableStream({ start(c) { ctrl = c; } });
      window.__ask = {
        emit(event, data) { ctrl.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)); },
        close() { ctrl.close(); },
      };
      return Promise.resolve(new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } }));
    }
    return realFetch(input, init);
  };
};

const { chromium } = await import(process.env.OPAX_PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ headless: true, executablePath: process.env.OPAX_BROWSER_EXECUTABLE || undefined, args: ['--no-sandbox'] });
const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));
const proof = [];
const HEIGHT = { 390: 844, 820: 1180, 1440: 960, 1920: 1080 };

async function open(width, scheme, { reduced = false, path = '/ask' } = {}) {
  const page = await browser.newPage({ viewport: { width, height: HEIGHT[width] || 960 }, colorScheme: scheme, reducedMotion: reduced ? 'reduce' : 'no-preference' });
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.addInitScript(INIT);
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) return route.abort('blockedbyclient');
    if (url.pathname === '/api/ask') return route.fulfill({ status: 500, json: { error: 'unexpected synchronous ask' } });
    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/community/')) return route.fulfill({ status: 200, json: { account: null, user: null, enabled: false, items: [], chats: [], questions: [] } });
    return route.continue();
  });
  await page.goto(origin + path, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  return { page, errors };
}

/** Ask on /ask or in the chat, then play the stream; `pause(i)` runs before event i. */
async function play(page, name, { input = '#ask-input', pause } = {}) {
  const { question, events } = STREAMS[name];
  await page.fill(input, question);
  await page.press(input, 'Enter');
  await page.waitForFunction(() => window.__ask);
  await sleep(1600);
  for (const [i, [event, data, wait]] of events.entries()) {
    await sleep(wait);
    if (pause) await pause(i, event, data);
    await page.evaluate(([e, d]) => window.__ask.emit(e, d), [event, data]);
  }
  await page.evaluate(() => window.__ask.close());
  await sleep(900);
}

const rowRects = (page, scope) => page.evaluate((s) => [...document.querySelectorAll(`${s} .as-live > li`)].map((r) => {
  const b = r.getBoundingClientRect();
  return { top: Math.round(b.top), left: Math.round(b.left), height: Math.round(b.height) };
}), scope);
const liveRows = (page, scope) => page.evaluate((s) => [...document.querySelectorAll(`${s} .as-live > li`)].map((r) => r.classList.contains('as-round') ? ['rule', r.textContent] : [r.querySelector('.as-text').textContent, r.dataset.state, r.querySelector('.as-meta').textContent]), scope);
const scrollTo = (page, selector, offset = 80) => page.evaluate(([sel, off]) => { const el = document.querySelector(sel); scrollTo(0, el.getBoundingClientRect().top + scrollY - off); }, [selector, offset]);
const shot = (page, name) => page.screenshot({ path: resolve(output, `${name}.png`) });
/** Rows already on screen never move while later ones arrive or finish. */
function watchRows(page, scope) {
  const moved = [];
  let before = null;
  return {
    moved,
    async check(i) {
      const now = await rowRects(page, scope);
      if (before) now.slice(0, before.length).forEach((r, k) => { if (r.top !== before[k].top || r.left !== before[k].left || r.height !== before[k].height) moved.push({ i, k, was: before[k], now: r }); });
      before = now;
    },
  };
}
async function openTrail(page, scope) {
  await page.click(`${scope} .as-trail > summary`);
  await sleep(400); // the chevron settles
  return page.evaluate((s) => {
    const d = document.querySelector(`${s} .as-trail`);
    return {
      open: d.open,
      summary: d.querySelector('summary').textContent,
      mode: d.querySelector('.as-trail-mode').textContent,
      rows: [...d.querySelectorAll('.as-list > li')].map((r) => r.classList.contains('as-round') ? ['rule', r.textContent] : [r.querySelector('.as-text').textContent, r.dataset.state, r.querySelector('.as-meta').textContent]),
    };
  }, scope);
}
/** Every record address in a sources block, once. */
const sourceHrefs = (page, scope) => page.evaluate((s) => [...document.querySelectorAll(`${s} a.source-title, ${s} a.ask-research-source-title`)].map((a) => new URL(a.href).pathname + new URL(a.href).search), scope);

try {
  for (const scheme of (process.env.SCHEMES || 'light,dark').split(',')) {
    for (const width of (process.env.WIDTHS || '390,820,1440,1920').split(',').map(Number)) {
      const tag = `${width}-${scheme}`;
      // The research loop, two rounds.
      {
        const { page, errors } = await open(width, scheme);
        const watch = watchRows(page, '#ask-steps-live');
        await play(page, 'loop', {
          async pause(i, event, data) {
            if (event === 'status' && data.phase === 'step') await watch.check(i);
            if (event === 'status' && data.phase === 'step' && data.step.id === 5 && data.step.state === 'done') {
              const rows = await liveRows(page, '#ask-steps-live');
              assert.deepEqual(rows.map((r) => r[0] === 'rule' ? r[1] : r[1]), ['done', 'done', 'done', 'Round 2', 'done', 'running']);
              assert.equal(rows[0][2], ', 128 passages·1.2 s, 1.2 seconds');
              await shot(page, `loop-midrun-${tag}`);
            }
          },
        });
        assert.deepEqual(watch.moved, [], 'live rows never move');
        const state = await page.evaluate(() => ({ line: document.getElementById('ask-steps').hidden, trail: !!document.querySelector('#ask-research .as-trail'), open: document.querySelector('#ask-research .as-trail')?.open }));
        assert.deepEqual(state, { line: true, trail: true, open: false }, 'a researched answer has no line above it and a folded trail under it');
        await scrollTo(page, '#ask-result');
        await shot(page, `loop-done-${tag}`);
        const trail = await openTrail(page, '#ask-research');
        assert.match(trail.summary, /^How this was researched, 6 steps·2 rounds·14\u00a0s/u);
        assert.match(trail.mode, /^Researched in two rounds/);
        assert.deepEqual(trail.rows.filter((r) => r[0] === 'rule').map((r) => r[1]), ['Round 1', 'Round 2']);
        await scrollTo(page, '#ask-research', 120);
        await shot(page, `loop-trail-open-${tag}`);
        await page.click('#ask-sources > summary');
        const hrefs = await sourceHrefs(page, '#ask-sources');
        assert.equal(new Set(hrefs).size, hrefs.length, 'no record listed twice');
        assert.equal(await page.locator('#ask-research-sources .ask-research-source').count(), 3);
        assert.match(await page.textContent('#ask-sources-sum'), /^Sources \(5\)$/);
        await scrollTo(page, '#ask-sources', 40);
        await shot(page, `loop-sources-${tag}`);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no sideways scroll');
        assert.deepEqual(errors, []);
        proof.push({ width, scheme, case: 'loop', trail, hrefs });
        await page.close();
      }
      // An error step.
      {
        const { page, errors } = await open(width, scheme);
        await play(page, 'error', {
          async pause(i, event, data) {
            if (event === 'status' && data.phase === 'step' && data.step.id === 3 && data.step.state === 'running') {
              const rows = await liveRows(page, '#ask-steps-live');
              assert.deepEqual(rows[1].slice(1), ['failed', ', Failed·5.0 s, 5.0 seconds']);
              await shot(page, `error-midrun-${tag}`);
            }
          },
        });
        const trail = await openTrail(page, '#ask-research');
        assert.equal(trail.rows.filter((r) => r[0] === 'rule').length, 0, 'one round, no rules');
        assert.equal(trail.rows[1][1], 'failed');
        await scrollTo(page, '#ask-research', 120);
        await shot(page, `error-trail-open-${tag}`);
        assert.deepEqual(errors, []);
        proof.push({ width, scheme, case: 'error', trail });
        await page.close();
      }
      // The planner's run: its live rows as today, its trail under the answer.
      {
        const { page, errors } = await open(width, scheme);
        await play(page, 'planner', {
          async pause(i, event, data) {
            if (event === 'status' && data.phase === 'step' && data.step.id === 3 && data.step.state === 'done') {
              const rows = await liveRows(page, '#ask-steps-live');
              assert.ok(rows.every((r) => r[2] === ''), 'planner rows carry no count or time');
              await shot(page, `planner-midrun-${tag}`);
            }
          },
        });
        const trail = await openTrail(page, '#ask-research');
        assert.match(trail.mode, /^Planned from your question/);
        assert.equal(trail.rows.length, 4);
        await scrollTo(page, '#ask-research', 120);
        await shot(page, `planner-trail-open-${tag}`);
        assert.deepEqual(errors, []);
        proof.push({ width, scheme, case: 'planner', trail });
        await page.close();
      }
      // The docked chat: the same rows, trail and merged sources.
      {
        const { page, errors } = await open(width, scheme);
        await page.click('#chat-launcher');
        await page.waitForSelector('#chat-input', { state: 'visible' });
        await play(page, 'loop', {
          input: '#chat-input',
          async pause(i, event, data) {
            if (event === 'status' && data.phase === 'step' && data.step.id === 5 && data.step.state === 'done') {
              assert.equal(await page.locator('#panel-chat .chat-pending .as-round').count(), 1);
              await shot(page, `dock-midrun-${tag}`);
            }
          },
        });
        await page.evaluate(() => [...document.querySelectorAll('#panel-chat .chat-turn-answer')].at(-1).setAttribute('data-harness', 'last'));
        const turn = '#panel-chat .chat-turn-answer[data-harness="last"]';
        assert.equal(await page.locator(`${turn} .as-done`).count(), 0, 'no line above a researched answer');
        await page.click(`${turn} .chat-sources:not(.as-trail) > summary`);
        const hrefs = await sourceHrefs(page, `${turn} .chat-sources:not(.as-trail)`);
        assert.equal(new Set(hrefs).size, hrefs.length);
        const trail = await openTrail(page, turn);
        assert.equal(trail.rows.filter((r) => r[0] === 'rule').length, 2);
        await page.evaluate((t) => document.querySelector(`${t} .as-trail`).scrollIntoView({ block: 'center' }), turn);
        await shot(page, `dock-trail-open-${tag}`);
        await page.evaluate((t) => document.querySelector(`${t} .ask-research-sources`).scrollIntoView({ block: 'center' }), turn);
        await shot(page, `dock-sources-${tag}`);
        assert.deepEqual(errors, []);
        proof.push({ width, scheme, case: 'dock', hrefs });
        await page.close();
      }
    }
  }
  // Reduced motion: nothing turns or fades; the states and counts still show.
  for (const width of [390, 1440]) {
    const { page, errors } = await open(width, 'light', { reduced: true });
    await play(page, 'loop', {
      async pause(i, event, data) {
        if (event === 'status' && data.phase === 'step' && data.step.id === 5 && data.step.state === 'done') {
          await sleep(400);
          const anim = await page.evaluate(() => [...document.querySelectorAll('#ask-steps-live *')].map((el) => getComputedStyle(el).animationName).filter((n) => n !== 'none'));
          assert.deepEqual(anim, [], 'no motion under reduced motion');
          await shot(page, `reduced-midrun-${width}-light`);
        }
      },
    });
    await openTrail(page, '#ask-research');
    await scrollTo(page, '#ask-research', 120);
    await shot(page, `reduced-trail-open-${width}-light`);
    assert.deepEqual(errors, []);
    proof.push({ width, case: 'reduced' });
    await page.close();
  }
  await writeFile(resolve(output, 'proof.json'), JSON.stringify(proof, null, 2));
  console.log(`research-ui browser harness: ${proof.length} checks passed`);
} finally {
  await browser.close();
  await new Promise((ok) => server.close(ok));
}
