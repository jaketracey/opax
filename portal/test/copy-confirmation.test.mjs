// The copy-link confirmation (Jake, 13 Oct): after a copy the button says
// "Copied" and nothing more, keeps its icon and its resting width and height
// (no layout shift), reverts, and a polite live region announces "Copied".
// app.js's own copyText runs here, against a jsdom page.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');

/** copyText through copyStatus: the confirmation's whole source in app.js. */
function confirmationSource() {
  const start = app.indexOf('async function copyText(');
  const last = app.indexOf('function copyStatus() {');
  assert.ok(start >= 0 && last > start, 'app.js keeps copyText and its helpers together');
  let depth = 0;
  for (let i = app.indexOf('{', last); i < app.length; i++) {
    if (app[i] === '{') depth++;
    else if (app[i] === '}' && --depth === 0) return app.slice(start, i + 1);
  }
  throw new Error('unbalanced copyStatus');
}

function page() {
  const dom = new JSDOM(`<!doctype html><body>
    <div class="action-row">
      <button type="button" class="ui-button" id="ask-copylink"><svg class="btn-icon" aria-hidden="true"></svg><span>Copy link</span></button>
      <button type="button" class="ui-button" id="after">Export</button>
    </div>
    <ul role="menu"><li role="none"><button type="button" class="page-menu-item" role="menuitem" data-more-action="copy-section">Copy link to this section</button></li></ul>
  </body>`, { runScripts: 'outside-only', pretendToBeVisual: true });
  const { window } = dom;
  const copied = [];
  Object.defineProperty(window.navigator, 'clipboard', { value: { writeText: async (t) => { copied.push(t); } }, configurable: true });
  window.prompt = () => { throw new Error('the fallback prompt is not expected'); };
  window.eval(`${confirmationSource()}\nwindow.copyText = copyText;`);
  const doc = window.document;
  // Resting sizes as a layout would give them (jsdom has none).
  const sizes = { 'ask-copylink': { width: 132, height: 44 }, after: { width: 96, height: 44 } };
  for (const [id, size] of Object.entries(sizes)) doc.getElementById(id).getBoundingClientRect = () => ({ ...size, top: 0, left: 0, right: size.width, bottom: size.height });
  doc.querySelector('.page-menu-item').getBoundingClientRect = () => ({ width: 256, height: 44, top: 0, left: 0, right: 256, bottom: 44 });
  return { window, doc, copied };
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test('the confirmation is exactly "Copied": the icon stays, the size holds, then it reverts', async () => {
  const { window, doc, copied } = page();
  const button = doc.getElementById('ask-copylink');
  const label = button.querySelector('span');
  await window.copyText('https://opax.com.au/ask?q=housing', label);
  assert.deepEqual(copied, ['https://opax.com.au/ask?q=housing']);
  assert.equal(label.textContent, 'Copied');
  assert.equal(button.textContent.trim(), 'Copied', 'no other words anywhere in the button');
  assert.ok(button.querySelector('svg.btn-icon'), 'the icon stays');
  // Its resting border box, held while the shorter word shows.
  assert.equal(button.style.width, '132px');
  assert.equal(button.style.minWidth, '132px');
  assert.equal(button.style.maxWidth, '132px');
  assert.equal(button.style.flex, '0 0 132px', 'a flex row cannot resize it by basis or min-content');
  assert.equal(button.style.height, '44px');
  assert.equal(button.style.minHeight, '44px');
  assert.equal(button.style.maxHeight, '44px');
  assert.equal(button.style.boxSizing, 'border-box');
  assert.equal(doc.getElementById('after').style.width, '', 'nothing else is touched');

  await sleep(1700);
  assert.equal(label.textContent, 'Copy link');
  assert.equal(button.getAttribute('style') || '', '', 'the inline size goes when the label comes back');
});

test('a polite live region announces "Copied", and announces a second copy again', async () => {
  const { window, doc } = page();
  const label = doc.querySelector('#ask-copylink span');
  await window.copyText('https://opax.com.au/a', label);
  const status = doc.getElementById('copy-status');
  assert.equal(status.getAttribute('role'), 'status');
  assert.equal(status.getAttribute('aria-live'), 'polite');
  assert.ok(status.classList.contains('visually-hidden'));
  await sleep(80);
  assert.equal(status.textContent, 'Copied');
  await window.copyText('https://opax.com.au/a', label);
  assert.equal(status.textContent, '', 'emptied first, so the repeat is spoken');
  await sleep(80);
  assert.equal(status.textContent, 'Copied');
  assert.equal(doc.querySelectorAll('#copy-status').length, 1, 'one region for the page');
});

test('a second press while "Copied" shows still reverts to the real label and the resting size', async () => {
  const { window, doc } = page();
  const button = doc.getElementById('ask-copylink');
  const label = button.querySelector('span');
  await window.copyText('https://opax.com.au/a', label);
  await sleep(900);
  await window.copyText('https://opax.com.au/a', label);
  assert.equal(button.style.width, '132px', 'measured once, at rest, not while it says Copied');
  await sleep(900);
  assert.equal(label.textContent, 'Copied', 'the second press restarts the moment');
  await sleep(800);
  assert.equal(label.textContent, 'Copy link');
  assert.equal(button.getAttribute('style') || '', '');
});

test('a ⋯ copy row says "Copied" in place and keeps its row size', async () => {
  const { window, doc } = page();
  const item = doc.querySelector('.page-menu-item');
  await window.copyText('https://opax.com.au/reports/housing/s/2', item);
  assert.equal(item.textContent, 'Copied');
  assert.equal(item.style.width, '256px');
  assert.equal(item.style.height, '44px');
  await sleep(1700);
  assert.equal(item.textContent, 'Copy link to this section');
});

test('no caller adds words to the confirmation', () => {
  assert.doesNotMatch(app, /wording may vary|re-asks the question/);
  for (const [, args] of app.matchAll(/\bcopyText\(([^;]*?)\);/g)) {
    // Two arguments at most: the text and the label. A third was the old custom wording.
    let depth = 0, commas = 0;
    for (const c of args) { if ('([{'.includes(c)) depth++; else if (')]}'.includes(c)) depth--; else if (c === ',' && depth === 0) commas++; }
    assert.ok(commas <= 1, `copyText(${args})`);
  }
  assert.match(app, /const COPIED = "Copied";/);
});
