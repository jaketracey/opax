// The deep-link boot frame (spa-entry.js + the boot rules in style.css): while
// the app boots, a compact route shows the start of the server answer instead
// of the Ask hero; if the app never boots, the whole server answer must show.
// Rules are read from style.css itself, so this tests what ships.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const css = readFileSync(new URL('../public/style.css', import.meta.url), 'utf8');
const entry = readFileSync(new URL('../public/spa-entry.js', import.meta.url), 'utf8');
// The boot block: from the rule hiding the server answer to the one padding it.
const start = css.indexOf('.spa-ready #prerender, .spa-booting #prerender');
const end = css.indexOf('#prerender { padding-bottom');
assert.ok(start > 0 && end > start, 'boot rules found in style.css');
const bootCss = '[hidden] { display: none !important; }\n' + css.slice(start, end);

function boot(path) {
  const dom = new JSDOM(`<!doctype html><html><head><style>${bootCss}</style></head><body>
    <nav id="crumbs" hidden><ol></ol></nav>
    <main id="main" data-server-rendered>
      <section id="prerender"><h1>Server title</h1><p>Server summary.</p><h2>More</h2><ul><li>Record</li></ul><p>Notes.</p></section>
      <div class="wrap"><section id="hero-intro"><h1>Ask &amp; search the record</h1></section><section id="panel-subject" class="panel"></section></div>
    </main></body></html>`, { url: `https://opax.com.au${path}`, runScripts: 'outside-only' });
  const timers = [];
  dom.window.setTimeout = (fn, ms) => { timers.push({ fn, ms }); return timers.length; };
  dom.window.eval(entry);
  const { document } = dom.window;
  const shown = (el) => { for (let n = el; n && n.nodeType === 1; n = n.parentElement) if (dom.window.getComputedStyle(n).display === 'none') return false; return true; };
  const answer = () => [...document.querySelectorAll('#prerender > *')].map((el) => `${el.tagName.toLowerCase()}:${shown(el) ? 'shown' : 'hidden'}`);
  return { dom, document, timers, shown, answer, root: document.documentElement };
}

test('while a compact deep link boots: the server title and summary show, the rest of the answer and the hero do not', () => {
  const { document, shown, answer, root } = boot('/subject/person/someone');
  assert.ok(root.classList.contains('spa-booting') && root.classList.contains('spa-boot-compact'));
  assert.deepEqual(answer(), ['h1:shown', 'p:shown', 'h2:hidden', 'ul:hidden', 'p:hidden']);
  assert.equal(shown(document.getElementById('hero-intro')), false);
  // The crumb strip is held open (invisible) so route() does not push the page down.
  assert.notEqual(getComputedStyleOf(document, 'crumbs').display, 'none');
});

test('a failed boot (app.js never runs) shows the whole server answer once the timeout fires', () => {
  const { timers, answer, root, document, shown } = boot('/bill/some-bill');
  assert.equal(timers.length, 1);
  assert.equal(timers[0].ms, 10000);
  timers[0].fn();
  assert.ok(root.classList.contains('spa-failed'));
  for (const name of ['spa-booting', 'spa-boot-compact', 'spa-boot-search']) assert.ok(!root.classList.contains(name), name);
  assert.deepEqual(answer(), ['h1:shown', 'p:shown', 'h2:shown', 'ul:shown', 'p:shown']);
  assert.equal(shown(document.getElementById('panel-subject')), false);
  assert.equal(getComputedStyleOf(document, 'crumbs').display, 'none');
});

test('once the app has routed the server answer gives way to the app, and the timeout changes nothing', () => {
  const { timers, answer, root } = boot('/subject/party');
  root.classList.add('spa-ready', 'spa-routed');
  assert.ok(answer().every((s) => s.endsWith(':hidden')));
  timers[0].fn();
  assert.ok(!root.classList.contains('spa-failed'));
  assert.ok(answer().every((s) => s.endsWith(':hidden')));
});

test('Ask keeps its hero and no server-answer frame; Search keeps the hero', () => {
  const ask = boot('/ask');
  assert.ok(!ask.root.classList.contains('spa-boot-compact'));
  assert.equal(ask.shown(ask.document.getElementById('hero-intro')), true);
  assert.ok(ask.answer().every((s) => s.endsWith(':hidden')));
  const search = boot('/ask?q=housing&view=search');
  assert.ok(search.root.classList.contains('spa-boot-search'));
  assert.equal(search.shown(search.document.getElementById('hero-intro')), true);
  assert.ok(search.answer().every((s) => s.endsWith(':hidden')));
});

function getComputedStyleOf(document, id) {
  return document.defaultView.getComputedStyle(document.getElementById(id));
}
