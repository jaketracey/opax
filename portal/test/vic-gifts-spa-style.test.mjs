// A Victorian member reached inside the app (15 Nov 2026, from PR #404's review).
// The Worker links vic-gifts.css only on a page it serves, so a member page the
// app drew after in-app navigation kept the default green on the "Victorian
// gifts and hospitality" section: green bars and filters, green table links.
// app.js now links the stamped stylesheet when it draws the section, and draws
// it once the sheet has loaded (a second at most). This runs the real
// renderPersonVicGifts and vicGiftsStyles in a document opened as another page
// (index.html's own stylesheets, no vic-gifts.css), then reads the cascade
// from the sheets that document links. jsdom loads no stylesheets and hands a
// var() back as written, so each linked sheet is inlined from public/ and a
// custom property is followed by hand, as quiet-links.test.mjs does.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { JSDOM } from 'jsdom';
import ts from 'typescript';
import { clearedGiftRegisters, vicGiftsPersonBlock } from '../src/vic-gifts.ts';

const publicDir = new URL('../public/', import.meta.url);
const read = (name) => readFileSync(new URL(name, publicDir), 'utf8');
const app = read('app.js');
const parsed = ts.createSourceFile('app.js', app, ts.ScriptTarget.Latest, true);
const fn = (name) => parsed.statements.find((n) => ts.isFunctionDeclaration(n) && n.name?.text === name)?.getText(parsed);
const hashOf = (name) => createHash('sha256').update(readFileSync(new URL(name, publicDir))).digest('hex').slice(0, 10);

// The document the reader opened: index.html's stylesheet links, as the browser has them.
const index = read('index.html');
const shellSheets = [...index.slice(0, index.indexOf('</head>')).matchAll(/<link rel="stylesheet" href="[^"]+"[^>]*>/g)].map((m) => m[0]).join('');
// The tag the Worker writes on a person page it serves (src/index.ts).
const workerTag = /<link rel="stylesheet" href="\/vic-gifts\.css"[^>]*>/.exec(readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8'))?.[0];

const staged = JSON.parse(readFileSync(new URL('../../data/staged/vic-gifts/hub.json', import.meta.url), 'utf8'));
const href = clearedGiftRegisters(staged)[0].rows[0].official.href;
const block = await vicGiftsPersonBlock(href, async () => staged, new URL('https://opax.test' + href));

/** A document opened as another page, running app.js's own renderPersonVicGifts and vicGiftsStyles.
 *  fetch answers with the Worker's person block; jsdom fetches no stylesheet, so by default the
 *  sheet's load event fires while the register answers (sheetLoads: false leaves it pending). */
function openPage({ head = shellSheets, sheetLoads = true } = {}) {
  const dom = new JSDOM(`<!doctype html><html><head>${head}</head><body></body></html>`,
    { url: 'https://opax.com.au' + href, runScripts: 'outside-only' });
  const { window } = dom, requested = [];
  let linkedBeforeFetch = null;
  const sheets = () => [...window.document.querySelectorAll('link[href^="/vic-gifts.css"]')];
  window.fetch = async (url) => {
    requested.push(String(url));
    linkedBeforeFetch ??= sheets().length > 0;
    if (sheetLoads) for (const link of sheets()) link.dispatchEvent(new window.Event('load'));
    return { ok: true, json: async () => ({ html: block }) };
  };
  for (const name of ['renderPersonVicGifts', 'vicGiftsStyles']) assert.ok(fn(name), `app.js still has ${name}`);
  window.eval(`(() => {
    let currentSubjectKey = 'person:fixture';
    const personUrlsReady = Promise.resolve(), registerTablesReady = Promise.resolve();
    const personUrl = () => ${JSON.stringify(href)};
    const registerTables = { hydrateRegisterTables() {} };
    ${fn('renderPersonVicGifts')}
    ${fn('vicGiftsStyles')}
    window.__draw = renderPersonVicGifts;
    window.__leave = () => { currentSubjectKey = 'person:elsewhere'; };
  })()`);
  /** Open a member page: a new sections list replaces the last one, as the app's subject render does. */
  const draw = (representation = [{ jurisdiction: 'vic' }]) => {
    window.document.getElementById('subject-sections')?.remove();
    const sections = Object.assign(window.document.createElement('div'), { id: 'subject-sections' });
    window.document.body.append(sections);
    return window.__draw('Fixture Member', sections, { representation });
  };
  const drawn = () => window.document.querySelectorAll('#subject-sections #subject-vic-gifts').length;
  return { dom, window, requested, sheets, draw, drawn, linkedBeforeFetch: () => linkedBeforeFetch };
}

/** One member page drawn to the end. */
async function drawMember(options = {}) {
  const page = openPage(options);
  await page.draw(options.representation);
  return { ...page, sheets: page.sheets(), linkedBeforeFetch: page.linkedBeforeFetch() };
}

// Lets the register's answer and any awaits behind it run (a macrotask in the test's own realm).
const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

/** The drawn sections under every stylesheet the document links, with var() followed by hand. */
function cascade(drawn) {
  const { document } = drawn.dom.window;
  const css = [...document.querySelectorAll('link[rel="stylesheet"]')]
    .map((link) => `<style>${read(link.getAttribute('href').replace(/^\//, '').replace(/\?.*$/, '')).replace(/@import[^;]+;/g, '')}</style>`).join('');
  const dom = new JSDOM(`<!doctype html><html><head>${css}</head><body>${document.body.innerHTML}</body></html>`);
  const custom = (el, name) => { for (let n = el; n && n.nodeType === 1; n = n.parentElement) { const v = dom.window.getComputedStyle(n).getPropertyValue(name).trim(); if (v) return v; } return ''; };
  const resolve = (el, value) => {
    let out = value;
    for (let i = 0; i < 6 && /^var\(/.test(out); i++) {
      const [, name, fallback] = /^var\((--[\w-]+)(?:,\s*(.+))?\)$/.exec(out);
      out = custom(el, name) || fallback || name;
      if (out === name) return name;
    }
    return out;
  };
  const root = dom.window.document.documentElement, token = (name) => resolve(root, `var(${name})`);
  return { dom, resolve, token, at: (selector) => dom.window.document.querySelector(selector) };
}

test('a Victorian member reached inside the app links the stamped vic-gifts.css once, before the fetch', async () => {
  assert.doesNotMatch(shellSheets, /vic-gifts\.css/, 'the page the reader opened does not link the sheet');
  const drawn = await drawMember();
  assert.equal(drawn.drawn(), 1, 'the section is drawn');
  assert.ok(drawn.requested.some((url) => new URLSearchParams(url.split('?')[1]).get('view') === 'person'));
  assert.equal(drawn.sheets.length, 1, 'one link to vic-gifts.css');
  assert.equal(drawn.sheets[0].getAttribute('href'), `/vic-gifts.css?v=${hashOf('vic-gifts.css')}`, 'the URL carries the current content stamp');
  assert.equal(drawn.sheets[0].rel, 'stylesheet');
  assert.equal(drawn.sheets[0].hasAttribute('data-vic-gifts-style'), true);
  assert.equal(drawn.linkedBeforeFetch, true, 'linked before the register answers, so the rules are in when the table draws');
});

test('the section drawn inside the app has the plum accent and ink links, not the money green', async () => {
  const { resolve, token, at, dom } = cascade(await drawMember());
  const style = (el) => dom.window.getComputedStyle(el);
  const PLUM = token('--interests-ink'), GREEN = token('--money-ink'), INK = token('--ink');
  assert.ok(PLUM && GREEN && INK && new Set([PLUM, GREEN, INK]).size === 3, 'three different tokens');
  const section = at('#subject-vic-gifts'), link = at('#subject-vic-gifts table.dt a'), filters = at('#subject-vic-gifts .dt-filters'), choice = at('#subject-vic-gifts .dt-choice input');
  assert.ok(link && filters && choice, 'the table has a link, its filters and a filter choice');
  // The bars (.dt-bar) and pressed buttons read the same two variables.
  for (const [el, what] of [[section, 'the section'], [filters, 'the filters'], [choice, 'a filter choice']]) {
    assert.equal(resolve(el, 'var(--money-ink)'), PLUM, `${what}: the accent is plum`);
    assert.equal(resolve(el, 'var(--money-wash)'), token('--interests-wash'), `${what}: the wash is plum`);
  }
  assert.equal(resolve(link, style(link).color), INK, 'a table link is ink');
  assert.equal(resolve(link, style(link).textDecorationColor), token('--bronze-rule'), 'on the bronze rule');
});

test('a page the Worker served keeps its one link; a member outside Victoria links nothing', async () => {
  assert.match(workerTag ?? '', /\sdata-vic-gifts-style[\s>]/, 'the Worker marks its link with the same attribute');
  const cold = await drawMember({ head: shellSheets + workerTag });
  assert.equal(cold.sheets.length, 1, 'the app does not link the sheet a second time');
  assert.equal(cold.sheets[0].getAttribute('href'), '/vic-gifts.css');
  const federal = await drawMember({ representation: [{ jurisdiction: 'federal' }] });
  assert.equal(federal.sheets.length, 0);
  assert.deepEqual(federal.requested, []);
});

test('drawing the section twice in one document links the sheet once', async () => {
  const page = openPage();
  await page.draw();
  assert.equal(page.drawn(), 1);
  await page.draw(); // the reader goes on to another page and comes back to the member
  assert.equal(page.drawn(), 1, 'drawn again on the second visit');
  await Promise.all([page.draw(), page.draw()]);
  assert.equal(page.requested.length, 4);
  assert.equal(page.sheets().length, 1, 'one link to vic-gifts.css');
  assert.equal(page.window.document.querySelectorAll('link[data-vic-gifts-style]').length, 1);
});

test('the section is drawn once its sheet has loaded or failed, or after a second at most', async () => {
  for (const event of ['load', 'error']) {
    const page = openPage({ sheetLoads: false }), drawing = page.draw();
    await settle();
    assert.equal(page.requested.length, 1, 'the register has answered');
    assert.equal(page.drawn(), 0, `nothing is drawn before the sheet's ${event}`);
    page.sheets()[0].dispatchEvent(new page.window.Event(event));
    await drawing;
    assert.equal(page.drawn(), 1, `drawn after the sheet's ${event}`);
  }
  // A sheet that never answers: the cap draws the section.
  const page = openPage({ sheetLoads: false }), caps = [];
  page.window.setTimeout = (callback, ms) => { caps.push({ callback, ms }); return caps.length; };
  page.window.clearTimeout = () => {};
  const drawing = page.draw();
  await settle();
  assert.equal(page.drawn(), 0, 'still waiting on the sheet');
  assert.deepEqual(caps.map((c) => c.ms), [1000], 'one cap of a second');
  caps[0].callback();
  await drawing;
  assert.equal(page.drawn(), 1, 'drawn at the cap');
});

test('a reader who leaves while the sheet loads gets no section on the next page', async () => {
  const page = openPage({ sheetLoads: false }), drawing = page.draw();
  await settle();
  page.window.__leave();
  page.sheets()[0].dispatchEvent(new page.window.Event('load'));
  await drawing;
  assert.equal(page.drawn(), 0);
  assert.equal(page.window.document.querySelector('#subject-sections').children.length, 0, 'its placeholder is gone');
});
