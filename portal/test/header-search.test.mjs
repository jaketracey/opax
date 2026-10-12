import test from 'node:test';
import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const read = name => JSON.parse(readFileSync(new URL('../public/' + name, import.meta.url)));
const instrument = read('instruments/index.json').records[0][0];
const audit = read('audit/index.json').records[0].id;
const paths = [
  ['instrument list', '/instruments', 'research-app', false],
  ['instrument detail', '/instrument/' + instrument, 'research-app', false],
  ['audit detail', '/audit/' + audit, 'research-app', false],
  ['sitting hub', '/sitting', 'research-app', false],
  ['SPA person', '/subject/person/david-pocock', 'research-app', true],
  ['home', '/', 'hp-page', false],
];

function execute(path, repeat = false, probe = null) {
  return new Promise((resolve, reject) => {
    // vm modules let jsdom execute the complete browser scripts and their real
    // imports, including home.js's module entry point, without slicing handlers.
    const worker = new Worker(new URL('./helpers/header-search-shell.mjs', import.meta.url), {
      execArgv: ['--experimental-vm-modules', '--disable-warning=ExperimentalWarning'], workerData: { path, repeat, probe },
    });
    worker.once('message', message => message.error ? reject(Error(message.error)) : resolve(message.result));
    worker.once('error', reject);
    worker.once('exit', code => { if (code !== 0) reject(Error('Shell worker exited with ' + code)); });
  });
}

for (const [label, path, body, app] of paths) {
  test('header search opens, closes and restores focus with the real ' + label + ' scripts', async () => {
    const result = await execute(path);
    assert.equal(result.body, body);
    assert.equal(result.scripts.includes('/app.js'), app);
    assert.deepEqual(result.first, { expanded: 'true', hidden: false, focus: 'mast-q' });
    assert.deepEqual(result.second, { expanded: 'false', hidden: true, focus: 'header-search-open' });
    assert.deepEqual(result.escape, result.second);
    assert.deepEqual(result.escapeWithSuggestions, result.second);
    assert.equal(result.outside.hidden, true);
    assert.equal(result.focusOutside.hidden, true);
    assert.equal(result.initialBindings, 1);
    assert.equal(result.initialEscapeBindings, 1);
  });
}

for (const [label, path] of paths.filter(([label]) => ['instrument list', 'SPA person', 'home'].includes(label))) {
  test('header search binds once when both shared scripts run repeatedly on ' + label, async () => {
    const result = await execute(path, true);
    assert.equal(result.initialBindings, 1);
    assert.equal(result.finalBindings, 1);
    assert.equal(result.finalEscapeBindings, 1);
    assert.equal(result.sameController, true);
    assert.equal(result.first.expanded, 'true');
    assert.equal(result.first.hidden, false);
    assert.equal(result.second.expanded, 'false');
    assert.equal(result.second.hidden, true);
    assert.deepEqual(result.escape, result.second);
  });
}

test('header search initializes once after parsing when the shared script loads early twice', async () => {
  const code = readFileSync(new URL('../public/quick-search.js', import.meta.url), 'utf8');
  let clickBindings = 0;
  const dom = new JSDOM(readFileSync(new URL('../public/index.html', import.meta.url), 'utf8'), {
    runScripts: 'outside-only', beforeParse(window) {
      const add = window.EventTarget.prototype.addEventListener;
      window.EventTarget.prototype.addEventListener = function (type, listener, options) {
        if (this.id === 'header-search-open' && type === 'click') clickBindings++;
        return add.call(this, type, listener, options);
      };
      window.eval(code);
      window.eval(code);
    },
  });
  try {
    await new Promise(resolve => dom.window.document.addEventListener('DOMContentLoaded', resolve, { once: true }));
    const toggle = dom.window.document.getElementById('header-search-open');
    const panel = dom.window.document.getElementById('header-search-panel');
    assert.equal(clickBindings, 1);
    assert.ok(dom.window.OpaxQuickSearch.header);
    toggle.click();
    assert.equal(toggle.getAttribute('aria-expanded'), 'true');
    assert.equal(panel.hidden, false);
    toggle.click();
    assert.equal(toggle.getAttribute('aria-expanded'), 'false');
    assert.equal(panel.hidden, true);
  } finally { dom.window.close(); }
});

// Server-only pages lose app.js, so navigation.js wires their band itself.
for (const [label, path] of [['sitting hub', '/sitting'], ['Victorian election hub', '/vic-election-2026'], ['instrument list', '/instruments'], ['audit detail', '/audit/' + audit]]) {
  test('the menus, drawer and header search work on the ' + label + ' without app.js', async () => {
    const result = await execute(path, false, 'menus');
    assert.equal(result.scripts.includes('/app.js'), false);
    assert.deepEqual(result.drawerOpen, { open: true, expanded: 'true' });
    assert.deepEqual(result.menuOpen, { expanded: 'true', hidden: false });
    assert.deepEqual(result.menuEscape, { expanded: 'false', hidden: true });
    assert.equal(result.suggestion, 'Search the record for “housing”Search');
  });
}
