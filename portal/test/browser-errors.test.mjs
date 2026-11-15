// Three errors readers' browsers reported between 11 and 16 November 2026.
//
// 1. "Invalid regular expression: invalid group specifier name": a lookbehind
//    in app.js. Safari before 16.4 cannot parse one, and a script holding a
//    regex it cannot parse does not run at all, so the page never left its
//    server copy. No file a browser loads may hold a lookbehind or a named
//    group.
// 2. "Importing a module script failed": a release replaced a module the open
//    page was built against. spa-entry.js loads the page again, once a build.
// 3. "p.getBBox is not a function": the masthead's stars were measured without
//    checking that each node can be measured.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { JSDOM } from 'jsdom';

const portal = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, portal), 'utf8');
const root = fileURLToPath(portal);

// --- 1. no lookbehind, no named group, in anything a browser loads ----------

// Bundles and vendored files: built from the sources scanned below, or not
// ours. They are checked by what they are built from.
const GENERATED = new Set([
  'public/spa-shell.js', 'public/analytics.js', 'public/events.js', 'public/ga.js',
  'public/grants-map.js', 'public/money-map.js', 'public/explain.js', 'public/voice.js',
]);
const GENERATED_FOLDERS = ['public/chunks/', 'public/voice-assets/'];
// The hand-written files a browser runs, and the sources of the bundles.
const SOURCE_FOLDERS = ['public', 'analytics', 'graph', 'voice', 'grants-map'];
const SCRIPT = /\.(?:js|mjs|ts|html)$/;
function browserSources() {
  const out = [];
  for (const folder of SOURCE_FOLDERS) {
    for (const entry of readdirSync(join(root, folder), { recursive: true, withFileTypes: true })) {
      if (!entry.isFile() || !SCRIPT.test(entry.name) || entry.name.endsWith('.d.ts')) continue;
      const path = relative(root, join(entry.parentPath ?? entry.path, entry.name)).split(sep).join('/');
      if (path.includes('node_modules/') || GENERATED.has(path) || GENERATED_FOLDERS.some((f) => path.startsWith(f))) continue;
      // A bundle's build script runs in Node, never in a browser.
      if (/^(?:analytics|graph|voice|grants-map)\/(?:build|agent-sync)\.mjs$/.test(path)) continue;
      out.push(path);
    }
  }
  return out.sort();
}
// "(?<=", "(?<!" and "(?<name>", in a regex literal or in a string given to
// RegExp. Plain text search: a comment that spells one out fails too, which
// keeps the rule simple to hold.
const UNPARSEABLE = /\(\?<(?:[=!]|[A-Za-z_$][\w$]*>)/;

test('no file a browser loads holds a lookbehind or a named group', () => {
  const files = browserSources();
  assert.ok(files.includes('public/app.js') && files.includes('public/division-markdown.js') && files.includes('public/spa-entry.js'), 'the scan reaches the app');
  assert.ok(files.length > 80, `the scan reaches the modules (${files.length} files)`);
  const found = [];
  for (const file of files) {
    read(file).split('\n').forEach((line, i) => { if (UNPARSEABLE.test(line)) found.push(`${file}:${i + 1}`); });
  }
  assert.deepEqual(found, [], 'Safari before 16.4 cannot parse these; write them without a lookbehind or a named group');
});

test('the scan would catch each construct', () => {
  for (const text of ['x.split(/(?<=[.!?])\\s/)', '/(?<!a)b/', '/(?<year>\\d{4})/', "new RegExp('(?<= )word')"]) assert.ok(UNPARSEABLE.test(text), text);
  for (const text of ['/(?=a)b/', '/(?!a)b/', '/(?:a)b/', 'a ?<b> c']) assert.ok(!UNPARSEABLE.test(text), text);
});

test('the rewritten patterns read as the lookbehind ones did', async () => {
  const app = read('public/app.js');
  const firstSentence = runInNewContext(`(${app.match(/function firstSentence\(text\) \{[\s\S]*?\n\}/)[0]})`);
  const cases = [
    'That the bill be read a second time. Further words follow.',
    'Is the motion agreed to? It is.',
    'No sentence end here',
    'Ends with a stop.',
    'Clause 3.2 stands. Then more.',
    'Stop.\nNew line follows.',
    '',
  ];
  // What the lookbehind split gave, worked out without one: up to and
  // including the first ".", "!" or "?" that white space follows.
  const expected = (text) => {
    for (let i = 0; i + 1 < text.length; i++) if ('.!?'.includes(text[i]) && /\s/.test(text[i + 1])) return text.slice(0, i + 1);
    return text;
  };
  for (const text of cases) assert.equal(firstSentence(text), expected(text), JSON.stringify(text));
  assert.equal(firstSentence('That the bill be read a second time. Further words follow.'), 'That the bill be read a second time.');
  assert.equal(firstSentence(null), '');

  const { divisionPlain } = await import(new URL('public/division-markdown.js', portal));
  assert.equal(divisionPlain('That the **bill** be _now_ read a ***second*** time'), 'That the bill be now read a second time');
  // Markers around a space-edged run are not emphasis, as before.
  assert.equal(divisionPlain('2 * 3 * 4'), '2 * 3 * 4');
  assert.equal(divisionPlain('a *b* c'), 'a b c');
});

// --- 2. a module that will not load reloads the page once a build -----------

function entryPage({ stamp = '/app.js?v=build-a', stored = {}, online = true, storage = true } = {}) {
  const listeners = {};
  const kept = { ...stored };
  let reloads = 0;
  const context = {
    location: { pathname: '/', search: '', reload: () => { reloads += 1; } },
    navigator: { onLine: online },
    document: {
      querySelector: (selector) => (selector === 'script[src^="/app.js"]' && stamp ? { getAttribute: () => stamp } : null),
      documentElement: { classList: { add() {}, remove() {}, contains: () => true } },
      addEventListener() {}, removeEventListener() {},
    },
    sessionStorage: storage
      ? { getItem: (k) => (k in kept ? kept[k] : null), setItem: (k, v) => { kept[k] = String(v); } }
      : { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } },
    URLSearchParams,
    setTimeout: () => 0,
  };
  context.window = context;
  context.addEventListener = (type, fn) => { (listeners[type] ??= []).push(fn); };
  runInNewContext(read('public/spa-entry.js'), context);
  const fire = (type, event) => { for (const fn of listeners[type] ?? []) fn(event); };
  return {
    kept,
    reloads: () => reloads,
    reject: (reason) => fire('unhandledrejection', { reason }),
    error: (message) => fire('error', { message }),
  };
}
const SAFARI = new TypeError('Importing a module script failed.');

test('a module that fails to load reloads the page once', () => {
  const page = entryPage();
  page.reject(SAFARI);
  assert.equal(page.reloads(), 1);
  assert.equal(page.kept['opax-module-reload'], '/app.js?v=build-a');
  // A second failure before the reload lands does not ask again.
  page.reject(SAFARI);
  assert.equal(page.reloads(), 1);
});

test('the same build failing after its reload is left alone: no loop', () => {
  const page = entryPage({ stored: { 'opax-module-reload': '/app.js?v=build-a' } });
  page.reject(SAFARI);
  page.error('TypeError: Importing a module script failed.');
  assert.equal(page.reloads(), 0);
});

test('a later release in the same tab may reload once more', () => {
  const page = entryPage({ stamp: '/app.js?v=build-b', stored: { 'opax-module-reload': '/app.js?v=build-a' } });
  page.reject(SAFARI);
  page.reject(SAFARI);
  assert.equal(page.reloads(), 1);
  assert.equal(page.kept['opax-module-reload'], '/app.js?v=build-b');
});

test('every browser’s wording is read, from a rejection or an error event', () => {
  for (const message of [
    'Importing a module script failed.',
    'Failed to fetch dynamically imported module: https://opax.com.au/suppliers.js',
    'error loading dynamically imported module: https://opax.com.au/suppliers.js',
  ]) {
    const rejected = entryPage();
    rejected.reject(new TypeError(message));
    assert.equal(rejected.reloads(), 1, message);
    const thrown = entryPage();
    thrown.error(message);
    assert.equal(thrown.reloads(), 1, message);
    // A rejection with a plain string, as some loaders give.
    const plain = entryPage();
    plain.reject(message);
    assert.equal(plain.reloads(), 1, message);
  }
});

test('other errors, no network and no storage never reload', () => {
  const other = entryPage();
  other.reject(new TypeError('p.getBBox is not a function'));
  other.reject(undefined);
  other.error('Script error.');
  other.error(undefined);
  assert.equal(other.reloads(), 0);
  const offline = entryPage({ online: false });
  offline.reject(SAFARI);
  assert.equal(offline.reloads(), 0);
  assert.deepEqual(offline.kept, {}, 'an offline failure does not spend the one reload');
  // Without storage there is no guard against a loop, so there is no reload.
  const sealed = entryPage({ storage: false });
  sealed.reject(SAFARI);
  assert.equal(sealed.reloads(), 0);
});

// --- 3. the masthead's stars are measured only where they can be ------------

function masthead({ measurable }) {
  const app = read('public/app.js');
  const start = app.indexOf('// --- the masthead constellation');
  const end = app.indexOf("// A file under a route's own prefix", start);
  assert.ok(start > 0 && end > start, 'the constellation block is found in app.js');
  const dom = new JSDOM(`<!doctype html><html><body>
    <svg class="logo-mark" xmlns="http://www.w3.org/2000/svg">
      <path class="logo-star" d="M0 0"/><path class="logo-star" d="M4 4"/><path class="logo-star" d="M8 8"/>
    </svg></body></html>`, { runScripts: 'outside-only' });
  const { window } = dom;
  const timers = [];
  window.setTimeout = (fn) => { timers.push(fn); return timers.length; };
  window.matchMedia = () => ({ matches: false });
  // jsdom, like the browser in the report, gives these nodes no getBBox.
  for (const star of window.document.querySelectorAll('.logo-star')) assert.equal(typeof star.getBBox, 'undefined');
  if (measurable) {
    // Two of the three can be measured; the third stays as the report had it.
    for (const [i, star] of [...window.document.querySelectorAll('.logo-star')].slice(0, 2).entries())
      star.getBBox = () => ({ x: i * 10, y: i * 10, width: 2, height: 2 });
    window.Element.prototype.animate = () => ({});
  }
  window.eval(app.slice(start, end));
  return { window, timers, threads: () => window.document.querySelectorAll('.logo-thread').length };
}

test('stars that cannot be measured are skipped, without an error', () => {
  const page = masthead({ measurable: false });
  assert.equal(page.timers.length, 1, 'the first glint is scheduled');
  assert.doesNotThrow(() => page.timers[0]());
  assert.equal(page.threads(), 0);
  // With nothing to join, it does not keep waking up.
  assert.equal(page.timers.length, 1);
});

test('stars that can be measured are still joined, the unmeasurable one left out', () => {
  const page = masthead({ measurable: true });
  assert.doesNotThrow(() => page.timers[0]());
  assert.equal(page.threads(), 1, 'two stars, one thread');
  assert.equal(page.timers.length, 2, 'and the next glint is scheduled');
});
