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

// The patterns as they were, lookbehinds and all. Node can parse them, and
// this file is never sent to a browser. Each is run beside its rewrite over a
// table of edge cases and a few thousand built strings: the rewrite must read
// every one of them exactly as the old pattern did.
const OLD_SENTENCE_SPLIT = new RegExp('(?<=[.!?])\\s');
const OLD_EMPHASIS = new RegExp('[*_]{1,3}(?=\\S)([^*_]+?)(?<=\\S)[*_]{1,3}', 'g');
const OLD_CALLS = new RegExp("(?:^|(?<=[.!?])[ \\t]+)((?:(?:The )?(?:(?:ACTING |DEPUTY )?(?:PRESIDENT|SPEAKER)|CHAIR)|(?:Mr|Mrs|Ms|Dr|Senator|The Hon\\.) [A-Z][A-Z’'\\-]+(?: [A-Z][A-Z’'\\-]+){0,4}):[ \\t]+)", 'g');

// A fixed-seed generator (mulberry32), so a failure can be run again.
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** `count` strings, each up to `most` pieces drawn from `pieces`. */
function built(pieces, count, most, seed) {
  const next = seeded(seed);
  return Array.from({ length: count }, () => {
    const length = Math.floor(next() * (most + 1));
    return Array.from({ length }, () => pieces[Math.floor(next() * pieces.length)]).join('');
  });
}

test('firstSentence reads as the lookbehind split did', () => {
  const app = read('public/app.js');
  const firstSentence = runInNewContext(`(${app.match(/function firstSentence\(text\) \{[\s\S]*?\n\}/)[0]})`);
  const old = (text) => text.split(OLD_SENTENCE_SPLIT)[0];
  const table = [
    ['That the bill be read a second time. Further words follow.', 'That the bill be read a second time.'],
    ['Is the motion agreed to? It is.', 'Is the motion agreed to?'],
    ['Order! The member will resume.', 'Order!'],
    ['No sentence end here', 'No sentence end here'],
    ['Ends with a stop.', 'Ends with a stop.'],
    ['Ends with a stop and a space. ', 'Ends with a stop and a space.'],
    // A stop with no white space after it is not a sentence end.
    ['Clause 3.2 stands. Then more.', 'Clause 3.2 stands.'],
    ['Schedule 1.Item 2 agreed to', 'Schedule 1.Item 2 agreed to'],
    ['Stop.\nNew line follows.', 'Stop.'],
    ['Stop.\tTab follows.', 'Stop.'],
    ['Stop. No-break space follows.', 'Stop.'],
    ['Stop. Line separator follows.', 'Stop.'],
    ['Really?! Yes.', 'Really?!'],
    ['Wait... what. Next', 'Wait...'],
    ['Two  spaces.  After.', 'Two  spaces.'],
    ['The Hon. member moved. That.', 'The Hon.'],
    ['. Leading stop', '.'],
    [' . Leading space', ' .'],
    ['.', '.'],
    ['. ', '.'],
    [' ', ' '],
    ['\n', '\n'],
    ['', ''],
  ];
  for (const [text, expected] of table) {
    assert.equal(old(text), expected, `the old pattern, on ${JSON.stringify(text)}`);
    assert.equal(firstSentence(text), expected, JSON.stringify(text));
  }
  const pieces = ['.', '!', '?', ' ', '  ', '\n', '\t', ' ', 'a', 'Bill', '3', '2', ',', ')', '"', '*'];
  for (const text of built(pieces, 4000, 12, 1901)) assert.equal(firstSentence(text), old(text), JSON.stringify(text));
  // Nothing to read is nothing, where the old split threw.
  assert.equal(firstSentence(null), '');
  assert.equal(firstSentence(undefined), '');
});

test('the emphasis pattern in divisionPlain reads as the lookbehind one did', async () => {
  const source = read('public/division-markdown.js');
  const literal = source.match(/\.replace\((\/\[\*_\]\{1,3\}[^\n]*?\/g), '\$1'\)/);
  assert.ok(literal, 'the emphasis pattern is found in division-markdown.js');
  const now = runInNewContext(literal[1]);
  const old = (text) => text.replace(OLD_EMPHASIS, '$1');
  const table = [
    ['a *b* c', 'a b c'],
    ['**bold**', 'bold'],
    ['***both***', 'both'],
    ['_under_ and __double__', 'under and double'],
    ['*a*', 'a'],
    ['*two words*', 'two words'],
    ['*a  b*', 'a  b'],
    ['**mixed_', 'mixed'],
    ['*a* *b*', 'a b'],
    // The first pair closes on the first marker; the last marker is left over.
    ['*a**b*', 'ab*'],
    // At most three markers a side are taken.
    ['****four****', '*four*'],
    ['snake_case_name', 'snakecasename'],
    // Markers around a run with a space at either edge are not emphasis.
    ['2 * 3 * 4', '2 * 3 * 4'],
    ['* a*', '* a*'],
    ['*a *', '*a *'],
    ['* *', '* *'],
    ['*\ta*', '*\ta*'],
    ['*a\n*', '*a\n*'],
    ['*a *', '*a *'],
    // A run that crosses a line is still one run.
    ['*a\nb*', 'a\nb'],
    // Nothing between the markers, or no closing marker.
    ['**', '**'],
    ['****', '****'],
    ['*_*', '*_*'],
    ['*a', '*a'],
    ['a*', 'a*'],
    ['', ''],
  ];
  for (const [text, expected] of table) {
    assert.equal(old(text), expected, `the old pattern, on ${JSON.stringify(text)}`);
    assert.equal(text.replace(now, '$1'), expected, JSON.stringify(text));
  }
  const pieces = ['*', '*', '_', '**', '__', '***', ' ', '  ', '\n', '\t', ' ', 'a', 'b', 'bill', '2', '.', '('];
  for (const text of built(pieces, 6000, 12, 1902)) assert.equal(text.replace(now, '$1'), old(text), JSON.stringify(text));

  // And the whole function, on a division's question.
  const { divisionPlain } = await import(new URL('public/division-markdown.js', portal));
  assert.equal(divisionPlain('That the **bill** be _now_ read a ***second*** time'), 'That the bill be now read a second time');
  assert.equal(divisionPlain('2 * 3 * 4'), '2 * 3 * 4');
  assert.equal(divisionPlain('a *b* c'), 'a b c');
});

test('the speaker-call pattern finds the calls the lookbehind one did', () => {
  const app = read('public/app.js');
  const literal = app.match(/\n\s*const calls = (\/[^\n]+\/g);\n/);
  assert.ok(literal, 'the call pattern is found in app.js');
  const now = runInNewContext(literal[1]);
  // Where each call starts and what it says: all renderDocText takes from a match.
  const old = (line) => [...line.matchAll(OLD_CALLS)].map((m) => [m.index + m[0].length - m[1].length, m[1]]);
  const found = (line) => [...line.matchAll(now)].map((m) => [m.index + m[0].length - m[2].length, m[2]]);
  const table = [
    ['Mr SMITH: I move the motion.', [[0, 'Mr SMITH: ']]],
    ['The SPEAKER: Order!', [[0, 'The SPEAKER: ']]],
    ['The DEPUTY SPEAKER: Order! The ACTING PRESIDENT: Order!', [[0, 'The DEPUTY SPEAKER: '], [27, 'The ACTING PRESIDENT: ']]],
    ['PRESIDENT: Order. CHAIR: Yes.', [[0, 'PRESIDENT: '], [18, 'CHAIR: ']]],
    ['I thank the member. Mr SMITH: Why? Ms O’NEIL-JONES: Because.', [[20, 'Mr SMITH: '], [35, 'Ms O’NEIL-JONES: ']]],
    ['Withdraw!  \t Senator McKENZIE-O\'BRIEN:\tNo.', []],
    ['Withdraw!  \t Senator WONG:\tNo.', [[13, 'Senator WONG:\t']]],
    ['Agreed. The Hon. JOHN SMITH: Thank you.', [[8, 'The Hon. JOHN SMITH: ']]],
    ['The Hon. JOHN SMITH: Thank you.', [[0, 'The Hon. JOHN SMITH: ']]],
    // Up to five names in capitals, each of two letters or more.
    ['Dr AA BB CC DD EE: Five names. Dr AA BB CC DD EE FF: Six.', [[0, 'Dr AA BB CC DD EE: ']]],
    ['Dr A B: One letter each.', []],
    // One call ends where the next sentence end stands.
    ['Mr SMITH: . Mr JONES: Yes.', [[0, 'Mr SMITH: '], [12, 'Mr JONES: ']]],
    ['Mr SMITH: Mr JONES: Yes.', [[0, 'Mr SMITH: ']]],
    ['Mr SMITH: ? Mr JONES: ! Mr BROWN: x', [[0, 'Mr SMITH: '], [12, 'Mr JONES: '], [24, 'Mr BROWN: ']]],
    ['. Mr SMITH: A stop opens the line.', [[2, 'Mr SMITH: ']]],
    // Not a call: mid-sentence, no space after the stop, no space after the
    // colon, a new line between, or a name not in capitals.
    ['He said Mr SMITH: was there.', []],
    ['Order.Mr SMITH: No space.', []],
    ['Order. Mr SMITH:No space.', []],
    ['Order. Mr SMITH:', []],
    ['Order.\nMr SMITH: Next line.', []],
    ['Order. Mr Smith: Not capitals.', []],
    ['Order. Mr SMITH : Space before the colon.', []],
    [' Mr SMITH: A space opens the line.', []],
    ['Order, Mr SMITH: After a comma.', []],
    ['', []],
  ];
  for (const [line, expected] of table) {
    assert.deepEqual(old(line), expected, `the old pattern, on ${JSON.stringify(line)}`);
    assert.deepEqual(found(line), expected, JSON.stringify(line));
  }
  const pieces = ['Mr SMITH', 'Ms O’NEIL', 'Senator WONG', 'The Hon. JOHN SMITH', 'The SPEAKER', 'DEPUTY PRESIDENT', 'CHAIR',
    'Mr SMITH: ', 'The SPEAKER: ', 'Senator WONG:\t', 'The Hon. JOHN SMITH: ', 'CHAIR: ', 'Order. ', 'Why? ', 'Shame! ',
    ': ', ':', '. ', '.', '! ', '? ', ' ', '  ', '\t', 'Order', 'I move', ' JONES', ',', 'The ', 'Dr '];
  let calls = 0;
  let later = 0;
  for (const line of built(pieces, 8000, 14, 1903)) {
    const expected = old(line);
    calls += expected.length;
    later += expected.filter(([start]) => start > 0).length;
    assert.deepEqual(found(line), expected, JSON.stringify(line));
  }
  assert.ok(calls > 2000 && later > 1000, `the built lines hold calls to compare (${calls}, ${later} of them after a sentence end)`);
});

// --- 2. a module that will not load reloads the page once a build -----------

function entryPage({ stamp = '/app.js?v=build-a', stored = {}, online = true, storage = 'kept' } = {}) {
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
    URLSearchParams,
    setTimeout: () => 0,
  };
  const stores = {
    kept: { getItem: (k) => (k in kept ? kept[k] : null), setItem: (k, v) => { kept[k] = String(v); } },
    // Every use throws: storage turned off for the site.
    denied: { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } },
    // Reads, and throws on a write: a full store, or an old private window.
    full: { getItem: () => null, setItem() { throw new Error('QuotaExceededError'); } },
    // Takes a write and keeps nothing.
    forgetful: { getItem: () => null, setItem() {} },
  };
  if (storage === 'absent') {
    // Reading the property itself throws, as in a sandboxed frame.
    Object.defineProperty(context, 'sessionStorage', { get() { throw new Error('SecurityError'); } });
  } else if (storage !== 'undefined') {
    context.sessionStorage = stores[storage];
  }
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
  assert.equal(page.kept['opax-module-reload'], '/app.js?v=build-a\n/app.js?v=build-b');
});

test('a release that serves the old page and the new in turn reloads once for each', () => {
  // The store outlives each load, as sessionStorage does a reload. Every load
  // fails; the page that comes back is build a, then b, then a again, and on.
  const stored = {};
  let reloads = 0;
  for (const stamp of ['a', 'b', 'a', 'b', 'a', 'a', 'b']) {
    const page = entryPage({ stamp: `/app.js?v=build-${stamp}`, stored });
    page.reject(SAFARI);
    page.error('Importing a module script failed.');
    reloads += page.reloads();
    Object.assign(stored, page.kept);
  }
  assert.equal(reloads, 2, 'one reload for build a and one for build b');
});

test('a page with no stamp reloads once for the tab', () => {
  const stored = {};
  let reloads = 0;
  for (let load = 0; load < 4; load++) {
    const page = entryPage({ stamp: '', stored });
    page.reject(SAFARI);
    reloads += page.reloads();
    Object.assign(stored, page.kept);
  }
  assert.equal(reloads, 1);
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
  // Without storage that keeps the guard there is no guard against a loop, so
  // there is no reload: storage that throws on any use, on a write only, or
  // on being read at all; storage that is missing; storage that forgets.
  for (const storage of ['denied', 'full', 'absent', 'undefined', 'forgetful']) {
    const sealed = entryPage({ storage });
    sealed.reject(SAFARI);
    sealed.error('Importing a module script failed.');
    sealed.reject(SAFARI);
    assert.equal(sealed.reloads(), 0, storage);
  }
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
