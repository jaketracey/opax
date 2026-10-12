// Browser QA for the stepped Ask UI (public/ask-steps.js) on fixture SSE
// streams. Nothing leaves the machine: a local static server holds the app,
// every other origin is blocked, and /api/ask?stream=1 is answered in-page by
// a stream the test feeds event by event, so a mid-run frame is a real one.
//
//   OPAX_PLAYWRIGHT_MODULE=/path/to/playwright-core \
//   OPAX_BROWSER_EXECUTABLE="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
//   node test/ask-steps-browser.mjs
//
// Shots and browser-proof.json land in portal/private/ask-steps/.
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, extname } from 'node:path';
import assert from 'node:assert/strict';
import { STREAMS } from './fixtures/ask-steps-streams.mjs';

const publicDir = fileURLToPath(new URL('../public/', import.meta.url));
const output = fileURLToPath(new URL('../private/ask-steps/', import.meta.url));
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
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const origin = 'http://127.0.0.1:' + server.address().port;

// The in-page stream: fetch("/api/ask?stream=1") resolves with a body the
// test writes to through window.__ask. Layout shifts are summed as they come.
const INIT = () => {
  const realFetch = window.fetch.bind(window);
  window.__asks = 0;
  window.fetch = (input, init) => {
    const url = typeof input === 'string' ? input : input.url;
    if (/\/api\/ask\?stream=1/.test(url)) {
      let ctrl;
      const enc = new TextEncoder();
      const body = new ReadableStream({ start(c) { ctrl = c; } });
      window.__asks += 1;
      window.__ask = {
        emit(event, data) { ctrl.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)); },
        close() { ctrl.close(); },
      };
      return Promise.resolve(new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } }));
    }
    return realFetch(input, init);
  };
  window.__shift = 0;
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) if (!e.hadRecentInput) window.__shift += e.value;
  }).observe({ type: 'layout-shift', buffered: true });
};

const { chromium } = await import(process.env.OPAX_PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ headless: true, executablePath: process.env.OPAX_BROWSER_EXECUTABLE || undefined, args: ['--no-sandbox'] });
const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));
const proof = [];

async function open(width, { reduced = false, path = '/ask' } = {}) {
  const page = await browser.newPage({ viewport: { width, height: width === 390 ? 844 : width === 820 ? 1180 : 960 }, reducedMotion: reduced ? 'reduce' : 'no-preference' });
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
async function play(page, name, { chat = false, pause } = {}) {
  const { question, events } = STREAMS[name];
  const input = chat ? '#chat-input' : '#ask-input';
  await page.fill(input, question);
  await page.press(input, 'Enter');
  await page.waitForFunction(() => window.__ask);
  await sleep(1600); // the hero folds first; steps begin after the planner
  for (const [i, [event, data, wait]] of events.entries()) {
    await sleep(wait);
    if (pause) await pause(i, event, data);
    await page.evaluate(([e, d]) => window.__ask.emit(e, d), [event, data]);
  }
  await page.evaluate(() => window.__ask.close());
  await sleep(900);
}

const rowRects = (page, scope) => page.evaluate((s) => [...document.querySelectorAll(`${s} .as-live .as-row`)].map((r) => {
  const b = r.getBoundingClientRect();
  return { top: Math.round(b.top), left: Math.round(b.left), height: Math.round(b.height) };
}), scope);

try {
  for (const width of (process.env.WIDTHS || '390,820,1440').split(',').map(Number)) {
    // Jake's question: mid-run, finished (collapsed and open).
    {
      const { page, errors } = await open(width);
      const moved = [];
      let before = null;
      await play(page, 'gambling', {
        async pause(i, event, data) {
          if (event === 'status' && data.phase === 'step') {
            const now = await rowRects(page, '#ask-steps-live');
            if (before) now.slice(0, before.length).forEach((r, k) => { if (r.top !== before[k].top || r.left !== before[k].left || r.height !== before[k].height) moved.push({ i, k, was: before[k], now: r }); });
            before = now;
          }
          if (event === 'status' && data.phase === 'step' && data.step.id === 4 && data.step.state === 'done') {
            const live = await page.evaluate(() => {
              const list = document.querySelector('#ask-steps-live .as-live');
              return { rows: list.querySelectorAll('.as-row').length, live: list.getAttribute('aria-live'), relevant: list.getAttribute('aria-relevant'), emu: !document.getElementById('ask-wombat').hidden, label: document.querySelector('#ask-wombat .wb-label')?.textContent || '' };
            });
            assert.equal(live.rows, 4);
            assert.equal(live.live, 'polite');
            assert.equal(live.relevant, 'additions');
            assert.ok(live.emu, 'the emu runs above the steps');
            await page.screenshot({ path: resolve(output, `gambling-midrun-${width}.png`) });
          }
          if (event === 'delta' && i === STREAMS.gambling.events.findIndex(([e]) => e === 'delta')) {
            const last = await page.evaluate(() => [...document.querySelectorAll('#ask-steps-live .as-row')].map((r) => [r.querySelector('.as-text').textContent, r.dataset.state]));
            assert.equal(last.length, 6);
            assert.deepEqual(last[5], ['Writing the answer', 'running']);
            await page.screenshot({ path: resolve(output, `gambling-writing-${width}.png`) });
          }
        },
      });
      assert.deepEqual(moved, [], 'rows already on screen never move as rows arrive');
      const line = await page.evaluate(() => {
        const b = document.querySelector('#ask-steps .as-toggle');
        const r = b.getBoundingClientRect();
        return { text: b.textContent, name: b.innerText, expanded: b.getAttribute('aria-expanded'), height: r.height, width: r.width, live: document.getElementById('ask-steps-live').hidden, listHidden: document.getElementById(b.getAttribute('aria-controls')).hidden };
      });
      assert.equal(line.expanded, 'false');
      assert.ok(line.height >= 44, `toggle is ${line.height}px tall`);
      assert.ok(line.live, 'the live list has gone');
      assert.ok(line.listHidden);
      assert.match(line.text, /^5 steps·11 s, 11 seconds$/);
      await page.locator('#ask-result').scrollIntoViewIfNeeded();
      await page.evaluate(() => scrollTo(0, document.getElementById('ask-result').getBoundingClientRect().top + scrollY - 80));
      await page.screenshot({ path: resolve(output, `gambling-done-${width}.png`) });
      await page.click('#ask-steps .as-toggle');
      const opened = await page.evaluate(() => {
        const b = document.querySelector('#ask-steps .as-toggle');
        const list = document.getElementById(b.getAttribute('aria-controls'));
        return { expanded: b.getAttribute('aria-expanded'), hidden: list.hidden, rows: [...list.querySelectorAll('.as-row')].map((r) => [r.querySelector('.as-text').textContent, r.dataset.state]) };
      });
      assert.equal(opened.expanded, 'true');
      assert.equal(opened.hidden, false);
      assert.equal(opened.rows.length, 5);
      assert.ok(opened.rows.every(([, s]) => s === 'done'));
      await page.screenshot({ path: resolve(output, `gambling-open-${width}.png`) });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no sideways scroll');
      assert.deepEqual(errors, []);
      proof.push({ width, case: 'gambling', line, open: opened.rows, moved, shift: await page.evaluate(() => window.__shift) });
      await page.close();
    }
    // A failed lookup, an answer anyway.
    {
      const { page, errors } = await open(width);
      await play(page, 'failed', {
        async pause(i, event, data) {
          if (event === 'status' && data.phase === 'writing') await page.screenshot({ path: resolve(output, `failed-midrun-${width}.png`) });
        },
      });
      await page.click('#ask-steps .as-toggle');
      const rows = await page.evaluate(() => [...document.querySelectorAll('#ask-steps .as-row')].map((r) => [r.querySelector('.as-text').textContent, r.dataset.state, r.querySelector('.as-mark').getAttribute('aria-label')]));
      assert.deepEqual(rows.map(([, s]) => s), ['done', 'done', 'failed', 'done']);
      assert.equal(rows[2][2], 'failed');
      assert.match(await page.textContent('#ask-answer'), /David Pocock/);
      await page.evaluate(() => scrollTo(0, document.getElementById('ask-result').getBoundingClientRect().top + scrollY - 80));
      await page.screenshot({ path: resolve(output, `failed-open-${width}.png`) });
      assert.deepEqual(errors, []);
      proof.push({ width, case: 'failed', rows });
      await page.close();
    }
    // A decline: the line, then the page's own no-answer state.
    {
      const { page, errors } = await open(width);
      await play(page, 'decline');
      const state = await page.evaluate(() => ({ line: document.querySelector('#ask-steps .as-toggle')?.textContent, live: document.getElementById('ask-steps-live').hidden, answer: document.getElementById('ask-answer').textContent }));
      assert.match(state.line, /^2 steps/);
      assert.ok(state.live);
      await page.evaluate(() => scrollTo(0, document.getElementById('ask-result').getBoundingClientRect().top + scrollY - 80));
      await page.screenshot({ path: resolve(output, `decline-${width}.png`) });
      assert.deepEqual(errors, []);
      proof.push({ width, case: 'decline', state });
      await page.close();
    }
    // A cached answer: no live list at any point, the line from done.agentic.
    {
      const { page, errors } = await open(width);
      let sawLive = false;
      await play(page, 'cached', { async pause() { sawLive ||= await page.evaluate(() => !!document.querySelector('#ask-steps-live .as-row')); } });
      sawLive ||= await page.evaluate(() => !!document.querySelector('#ask-steps-live .as-row'));
      assert.equal(sawLive, false);
      assert.match(await page.textContent('#ask-steps .as-toggle'), /^5 steps/);
      await page.evaluate(() => scrollTo(0, document.getElementById('ask-result').getBoundingClientRect().top + scrollY - 80));
      await page.screenshot({ path: resolve(output, `cached-${width}.png`) });
      assert.deepEqual(errors, []);
      proof.push({ width, case: 'cached' });
      await page.close();
    }
    // Normal Ask: the emu and its words, nothing new.
    {
      const { page, errors } = await open(width);
      let label = '';
      await play(page, 'normal', {
        async pause(i, event) {
          if (event === 'delta') {
            label = await page.evaluate(() => document.querySelector('#ask-wombat .wb-label')?.textContent || '');
            assert.equal(await page.locator('.as-list').count(), 0);
            await page.screenshot({ path: resolve(output, `normal-midrun-${width}.png`) });
          }
        },
      });
      assert.match(label, /^Checking the record\. This can take up to a minute\./); // the emu's own words, its dots after
      assert.equal(await page.locator('.as-list, .as-done').count(), 0);
      assert.ok(await page.evaluate(() => document.getElementById('ask-steps').hidden && document.getElementById('ask-steps-live').hidden));
      assert.deepEqual(errors, []);
      proof.push({ width, case: 'normal', label });
      await page.close();
    }
    // Reduced motion: nothing turns; the states still show.
    {
      const { page, errors } = await open(width, { reduced: true });
      await play(page, 'gambling', {
        async pause(i, event, data) {
          if (event === 'status' && data.phase === 'step' && data.step.id === 4 && data.step.state === 'done') {
            await sleep(400);
            const anim = await page.evaluate(() => [...document.querySelectorAll('#ask-steps-live .as-arc, #ask-steps-live .as-row')].map((el) => getComputedStyle(el).animationName).filter((n) => n !== 'none'));
            assert.deepEqual(anim, [], 'no motion under reduced motion');
            await page.screenshot({ path: resolve(output, `reduced-midrun-${width}.png`) });
          }
        },
      });
      await page.click('#ask-steps .as-toggle');
      await page.evaluate(() => scrollTo(0, document.getElementById('ask-result').getBoundingClientRect().top + scrollY - 80));
      await page.screenshot({ path: resolve(output, `reduced-open-${width}.png`) });
      assert.deepEqual(errors, []);
      proof.push({ width, case: 'reduced' });
      await page.close();
    }
    // The conversation: the same run in the chat panel.
    {
      const { page, errors } = await open(width, { path: '/chat' });
      await play(page, 'gambling', {
        chat: true,
        async pause(i, event, data) {
          if (event === 'status' && data.phase === 'step' && data.step.id === 4 && data.step.state === 'done') {
            assert.equal(await page.locator('.chat-pending .st-wrap').count(), 0, 'the fixed steps make way');
            assert.equal(await page.locator('.chat-pending .as-row').count(), 4);
            await page.screenshot({ path: resolve(output, `chat-midrun-${width}.png`) });
          }
        },
      });
      const toggle = page.locator('.chat-turn-answer .as-toggle').last();
      assert.match(await toggle.textContent(), /^5 steps/);
      await toggle.click();
      await page.screenshot({ path: resolve(output, `chat-open-${width}.png`) });
      // A reload keeps the line on the saved turn.
      await page.reload({ waitUntil: 'networkidle' });
      await page.locator('.chat-turn-answer .as-toggle').last().waitFor();
      assert.deepEqual(errors, []);
      proof.push({ width, case: 'chat' });
      await page.close();
    }
  }
  await writeFile(resolve(output, 'browser-proof.json'), JSON.stringify(proof, null, 2));
  console.log(`ask-steps browser QA: ${proof.length} checks passed`);
} finally {
  await browser.close();
  await new Promise((ok) => server.close(ok));
}
