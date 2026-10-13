// Typing on /ask before the app has drawn the box (13 Oct report: an early
// question and Enter came to nothing). spa-entry.js keeps the keys typed on the
// page; app.js's takeEarlyAsk puts them into the box when route() draws it and
// asks if an Enter was among them. Without the app the form submits natively
// to /ask?q=…, which the app asks on load.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import ts from 'typescript';

const entry = readFileSync(new URL('../public/spa-entry.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const parsed = ts.createSourceFile('app.js', app, ts.ScriptTarget.Latest, true);
const fn = (name) => parsed.statements.find((n) => ts.isFunctionDeclaration(n) && n.name?.text === name).getText(parsed);
const askForm = html.match(/<form id="ask-form"[\s\S]*?<\/form>/)[0];

function page(path) {
  const dom = new JSDOM(`<!doctype html><html><head></head><body>
    <input id="mast-q" type="text">
    <main id="main" data-server-rendered><section id="prerender"><h1>Ask &amp; search the record</h1></section></main>
    </body></html>`, { url: `https://opax.com.au${path}`, runScripts: 'outside-only' });
  const { window } = dom;
  const timers = [];
  window.setTimeout = (f, ms) => { timers.push({ f, ms }); return timers.length; };
  window.eval(entry);
  const type = (keys, target = window.document.body) => keys.map((key) => {
    const event = new window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
    target.dispatchEvent(event);
    return event.defaultPrevented;
  });
  // What route() does when the app is ready: draw the panel (spa-shell.js
  // writes index.html's markup), mark the route, then take the early keys.
  const boot = () => {
    window.document.getElementById('main').innerHTML = askForm;
    window.document.documentElement.classList.add('spa-ready', 'spa-routed');
    const asked = [];
    window.document.getElementById('ask-form').addEventListener('submit', (e) => { e.preventDefault(); asked.push(window.document.getElementById('ask-input').value); });
    window.eval(`(() => { const $ = (id) => document.getElementById(id); const setQueryValue = (id, value) => { $(id).value = value; }; ${fn('takeEarlyAsk')}; window.__took = takeEarlyAsk(); })()`);
    return { took: window.__took, asked, field: window.document.getElementById('ask-input') };
  };
  const run = () => { for (const t of timers.splice(0).filter((t) => t.ms === 0)) t.f(); };
  return { window, type, boot, run };
}

test('a question typed on /ask before the box is drawn lands in it, and its Enter asks it once', () => {
  const p = page('/ask');
  const prevented = p.type([...'housing costs', 'Backspace', 's', 'Enter']);
  assert.ok(prevented.every(Boolean), 'kept keys do not scroll or open find');
  const { took, asked, field } = p.boot();
  assert.equal(took, true);
  assert.equal(field.value, 'housing costs');
  assert.equal(p.window.document.activeElement, field);
  assert.equal(field.selectionStart, field.value.length);
  assert.deepEqual(asked, [], 'the ask waits until route() has finished');
  p.run();
  assert.deepEqual(asked, ['housing costs']);
  p.run();
  assert.deepEqual(asked, ['housing costs'], 'asked once');
});

test('early typing without Enter fills the box and waits for the reader', () => {
  const p = page('/ask');
  p.type([' ', ' ', ...'what did']);
  const { took, asked, field } = p.boot();
  assert.equal(took, true);
  assert.equal(field.value, 'what did');
  p.run();
  assert.deepEqual(asked, []);
});

test('nothing is kept from focused controls, shortcuts, an Enter on its own, or after the app routed', () => {
  const p = page('/ask');
  const mast = p.window.document.getElementById('mast-q');
  assert.deepEqual(p.type(['a', 'b'], mast), [false, false]);
  assert.equal(p.type(['Enter'])[0], false, 'an Enter with nothing typed is left alone');
  const ctrl = new p.window.KeyboardEvent('keydown', { key: 'c', metaKey: true, bubbles: true, cancelable: true });
  p.window.document.body.dispatchEvent(ctrl);
  assert.equal(ctrl.defaultPrevented, false);
  const { took, field } = p.boot();
  assert.equal(took, false);
  assert.equal(field.value, '');
  assert.deepEqual(p.type(['x']), [false], 'the keys belong to the page once it has routed');
});

test('keys are kept only on the Ask view: not for a shared question, Search or other pages', () => {
  for (const path of ['/ask?q=housing', '/ask?view=search', '/subject/person/someone', '/money']) {
    const p = page(path);
    assert.deepEqual(p.type(['a']), [false], path);
    assert.equal(p.window.OpaxEarlyAsk, undefined, path);
  }
});

test('route() hands the early keys to the box before focusing it', () => {
  assert.match(fn('route'), /if \(!takeEarlyAsk\(\)\) focusEntry\("ask-input"\);/);
});

test('without the app, the Ask form submits natively to /ask?q=…', () => {
  const { window } = new JSDOM(`<!doctype html><body>${askForm}</body>`, { url: 'https://opax.com.au/ask' });
  const form = window.document.getElementById('ask-form');
  window.document.getElementById('ask-input').value = 'What has David Pocock said about housing?';
  assert.equal(form.method, 'get');
  assert.equal(new URL(form.action).pathname, '/ask');
  // The question is the only named control, so the address is exactly the
  // one the app asks on load (route(): view "ask" with q).
  assert.equal(new URLSearchParams(new window.FormData(form)).toString(), 'q=What+has+David+Pocock+said+about+housing%3F');
  const shell = readFileSync(new URL('../public/spa-shell.js', import.meta.url), 'utf8');
  assert.ok(shell.includes('action=\\"/ask\\" method=\\"get\\"') && shell.includes('id=\\"ask-input\\" name=\\"q\\"'), 'the shell carries the same form');
});
