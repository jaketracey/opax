// Browser check: a question asked from lower on the Ask page (a suggestion
// under an answer, a next-step link, the builder) brings the question box and
// the waiting state into view at once and puts focus on the question heading,
// instead of leaving the reader at the foot of the page. Nothing leaves the
// machine: a local static server holds the app, every other origin is blocked,
// and /api/ask?stream=1 is answered in-page by a stream the test feeds, so the
// 300 ms check runs while the new answer has not yet said a word.
//
//   OPAX_PLAYWRIGHT_MODULE=/path/to/playwright-core/index.mjs \
//   OPAX_BROWSER_EXECUTABLE="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
//   node test/ask-scroll-browser.mjs
//
// OPAX_PUBLIC_DIR points the server at another copy of public/ (a revert check).
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, extname } from 'node:path';
import assert from 'node:assert/strict';

const publicDir = process.env.OPAX_PUBLIC_DIR ? resolve(process.env.OPAX_PUBLIC_DIR) + '/' : fileURLToPath(new URL('../public/', import.meta.url));
const types = { '.html': 'text/html', '.js': 'application/javascript', '.mjs': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
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
// test writes to through window.__ask, so an ask stays pending until fed.
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
};

const PARA = 'Fixture answer text for a local browser check, long enough that the foot of the page sits well below its top. ';
const longAnswer = Array.from({ length: 14 }, () => PARA + PARA).join('\n\n');
const source = (i) => ({ resource: 'fx' + i, slug: 'speech-fixture-' + i, title: 'Fixture debate ' + i, speaker: 'Fixture Speaker', date: '2026-05-2' + i, kind: 'speech', snippet: PARA, cited: true });
const plain = { answer: longAnswer, answered: true, citations: {}, sources: [1, 2, 3].map(source), followups: [] };
// A calculated money answer: its table names the leading donor, which the
// page turns into the "Ask what parliament said about ..." next step.
const money = {
  answer: '| Donor | Total |\n| --- | --- |\n| Fixture Holdings | $1,000 |\n\n' + longAnswer,
  answered: true, answer_status: 'calculated', money_ranking: { rows: [] }, citations: {}, sources: [1, 2].map(source), followups: [],
};

const { chromium } = await import(process.env.OPAX_PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ headless: true, executablePath: process.env.OPAX_BROWSER_EXECUTABLE || undefined, args: ['--no-sandbox', '--mute-audio'] });
const proof = [];
const WITHIN_MS = 300;

/** Where the page is, 300 ms after a new ask was started from below. */
const state = (page) => page.evaluate(() => {
  const box = (el) => { const r = el.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom) }; };
  const heading = document.getElementById('ask-question');
  const header = document.querySelector('header')?.getBoundingClientRect().bottom || 0;
  return {
    heading: heading && !heading.hidden ? { ...box(heading), text: heading.textContent } : null,
    form: box(document.getElementById('ask-form')),
    header: Math.round(header), viewport: innerHeight, scrollY: Math.round(scrollY),
    focus: document.activeElement?.id || document.activeElement?.tagName,
    url: location.pathname + location.search, entries: history.length,
    asked: document.getElementById('ask-input').value,
  };
});

/** The 300 ms state `s`: heading in view, focused, named. A smooth glide may
 *  still be bringing the question box down, so the box is checked once the
 *  page has come to rest. */
async function assertBroughtIntoView(page, s, question, label) {
  assert.ok(s.heading, `${label}: the question heading is on the page`);
  assert.equal(s.heading.text, question, `${label}: the heading names the question asked`);
  assert.ok(s.heading.top >= s.header && s.heading.bottom <= s.viewport, `${label}: the question heading is in the viewport within ${WITHIN_MS} ms (top ${s.heading.top}, viewport ${s.header}-${s.viewport}, scrollY ${s.scrollY})`);
  await page.waitForTimeout(900);
  const rest = await state(page);
  assert.ok(rest.form.top >= rest.header - 1 && rest.form.bottom <= rest.viewport, `${label}: the question box is in the viewport at rest (top ${rest.form.top})`);
  assert.ok(rest.heading.top >= rest.header && rest.heading.bottom <= rest.viewport, `${label}: the question heading stays in the viewport at rest (top ${rest.heading.top})`);
  assert.equal(s.focus, 'ask-question', `${label}: focus is on the question heading`);
  assert.equal(s.asked, question, `${label}: the box shows the question`);
}

try {
  for (const [width, height] of [[1280, 800], [390, 844]]) {
    for (const reducedMotion of ['reduce', 'no-preference']) {
      const label = `${width}px ${reducedMotion}`;
      const page = await browser.newPage({ viewport: { width, height }, reducedMotion });
      const errors = [];
      page.on('pageerror', (err) => errors.push(err.message));
      await page.addInitScript(INIT);
      await page.route('**/*', async (route) => {
        const url = new URL(route.request().url());
        if (url.origin !== origin) return route.abort('blockedbyclient');
        if (url.pathname === '/api/followups') return route.fulfill({ json: { questions: [] } });
        if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/community/')) return route.fulfill({ status: 200, json: { account: null, user: null, enabled: false, items: [], chats: [] } });
        return route.continue();
      });
      let asks = 0;
      /** Feed the pending ask its answer and wait for the page to settle on it. */
      const answer = async (payload) => {
        asks += 1;
        await page.waitForFunction((n) => window.__asks === n, asks);
        await page.evaluate((p) => { window.__ask.emit('delta', { text: p.answer.slice(0, 200) }); window.__ask.emit('done', p); window.__ask.close(); }, payload);
        await page.waitForFunction(() => !document.getElementById('ask-keep').hidden && !document.getElementById('ask-submit').disabled);
        await page.waitForTimeout(1600); // the hero has folded and the reveal glide is over
      };
      const toFoot = async () => {
        await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
        await page.waitForTimeout(100);
        assert.ok((await state(page)).form.bottom < 0, `${label}: the check starts with the question box out of view`);
      };

      const first = 'What has parliament said about housing?';
      await page.goto(`${origin}/ask?q=${encodeURIComponent(first)}`, { waitUntil: 'domcontentloaded' });
      await answer(plain);

      // 1. A suggestion under the answer ("Ask something else").
      await page.locator('#ask-again-row a.ask-sample').first().waitFor();
      await toFoot();
      const before = await state(page);
      const chip = page.locator('#ask-again-row a.ask-sample').first();
      const suggested = await chip.textContent();
      await chip.click();
      await page.waitForTimeout(WITHIN_MS);
      const afterChip = await state(page);
      await assertBroughtIntoView(page, afterChip, suggested, `${label} suggestion`);
      // The address and the history behave as they did: replaced, not pushed.
      assert.equal(afterChip.entries, before.entries, `${label}: a suggestion adds no history entry`);
      assert.equal(new URLSearchParams(afterChip.url.split('?')[1]).get('q'), suggested, `${label}: the address carries the suggestion`);
      assert.equal(await page.evaluate(() => window.__asks), asks + 1, `${label}: the suggestion was asked once`);

      // 2. A next-step link under a calculated money answer.
      await answer(money);
      const step = page.locator('.answer-money-next a', { hasText: 'Ask what parliament said about Fixture Holdings' });
      await step.waitFor();
      await toFoot();
      await step.scrollIntoViewIfNeeded();
      const entries = (await state(page)).entries;
      await step.click();
      await page.waitForTimeout(WITHIN_MS);
      const afterStep = await state(page);
      await assertBroughtIntoView(page, afterStep, 'What has parliament said about Fixture Holdings?', `${label} next step`);
      assert.equal(afterStep.entries, entries + 1, `${label}: a next-step link is still a navigation with its own history entry`);

      // 3. The question builder, asked from below the fold.
      await answer(plain);
      await page.evaluate(() => { resetAsk(); document.getElementById('ask-guided').open = true; });
      await page.locator('#ask-builder-form').waitFor();
      const built = await page.evaluate(() => {
        // Fill every blank the current shape has, the way a reader would.
        for (const field of document.querySelectorAll('#ask-builder-sentence input')) { field.value = 'housing'; field.dispatchEvent(new Event('input', { bubbles: true })); field.dispatchEvent(new Event('change', { bubbles: true })); }
        document.querySelector('main').style.paddingTop = '1400px'; // the builder below the fold, as on a long idle page
        document.getElementById('ask-builder-submit').scrollIntoView({ block: 'end', behavior: 'instant' });
        return askBuilderQuestion();
      });
      assert.ok(built, `${label}: the builder has a question to ask`);
      await page.locator('#ask-builder-submit').click();
      await page.waitForTimeout(WITHIN_MS);
      await assertBroughtIntoView(page, await state(page), built, `${label} builder`);
      await page.evaluate(() => { document.querySelector('main').style.paddingTop = ''; });

      // 4. The follow-up box hands over to the conversation, which lands on the
      // new question at the end of its thread (its own, older behaviour).
      await answer(plain);
      await toFoot();
      const follow = 'And what about renters?';
      await page.locator('#ask-keep-input').fill(follow);
      await page.locator('#ask-keep-form button[type="submit"]').click();
      await page.waitForFunction(() => location.pathname === '/chat');
      await page.waitForTimeout(WITHIN_MS);
      const turn = await page.evaluate((q) => {
        const el = [...document.querySelectorAll('#panel-chat .chat-turn-question, #panel-chat [class*="chat-turn"]')].filter((t) => t.textContent.includes(q)).pop();
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { top: Math.round(r.top), bottom: Math.round(r.bottom), viewport: innerHeight };
      }, follow);
      assert.ok(turn, `${label}: the follow-up is in the conversation`);
      assert.ok(turn.bottom > 0 && turn.top < turn.viewport, `${label}: the follow-up question is in the viewport (top ${turn.top})`);

      assert.deepEqual(errors, [], `${label}: no page errors`);
      proof.push({ label, suggestion: { scrollY: afterChip.scrollY, headingTop: afterChip.heading.top, formTop: afterChip.form.top, focus: afterChip.focus }, nextStep: { headingTop: afterStep.heading.top }, followUpTop: turn.top });
      await page.close();
    }
  }
  console.log(JSON.stringify(proof));
  console.log(`ask-scroll-browser: ${proof.length} runs passed`);
} finally {
  await browser.close();
  await new Promise((ok) => server.close(ok));
}
