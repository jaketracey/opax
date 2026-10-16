import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Worker } from 'node:worker_threads';
import ts from 'typescript';

// Discover routes from the app, so registering another kind adds a render check.
// Only inspect the registry here; the worker executes the complete shell/scripts.
const source = ts.createSourceFile('app.js', readFileSync(new URL('../public/app.js', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
const registry = source.statements.filter(ts.isVariableStatement).flatMap(node => [...node.declarationList.declarations])
  .find(node => node.name.getText(source) === 'DIRECTORY_KINDS').initializer;
const opener = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'openDirectory');
const builders = opener.body.statements.filter(ts.isVariableStatement).flatMap(node => [...node.declarationList.declarations])
  .find(node => node.name.getText(source) === 'build').initializer.expression;
const kinds = [...new Set([...registry.properties, ...builders.properties].map(node => node.name.text))];
assert.ok(kinds.length > 0, 'No directory kinds found in the app registry');

function render(kind, options = {}) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./helpers/directory-shell.mjs', import.meta.url), {
      execArgv: ['--experimental-vm-modules', '--disable-warning=ExperimentalWarning'], workerData: { kind, ...options },
    });
    const timer = setTimeout(() => {
      worker.terminate();
      reject(Error(`${kind}: directory shell exceeded 15 seconds`));
    }, 15000);
    let result;
    worker.once('message', message => { result = message; });
    worker.once('error', reject);
    worker.once('exit', code => {
      clearTimeout(timer);
      if (code !== 0) reject(Error(`${kind}: directory shell exited with ${code}`));
      else if (!result) reject(Error(`${kind}: directory shell returned no result`));
      else if (result.error) reject(Error(result.error));
      else resolve(result);
    });
  });
}

test('a caught directory builder error logs its kind and keeps the honest failure message', { timeout: 20000 }, async () => {
  const result = await render('electorate', { brokenElectorateIndex: true });
  assert.equal(result.rows, 0);
  assert.equal(result.failed, true);
  assert.equal(result.honestFailure, true);
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /^console\.error: \[directory\] electorate TypeError:/);
});

for (const kind of kinds) {
  test(`directory ${kind} renders rows with the real shell and no browser errors`, { timeout: 20000 }, async () => {
    const result = await render(kind);
    assert.deepEqual(result.errors, [], `${kind}: console.error, page errors or unexpected requests`);
    assert.equal(result.failed, false, `${kind}: directory displayed its failure message`);
    assert.equal(result.visible, true, `${kind}: subject panel is hidden`);
    assert.ok(result.rows > 0, `${kind}: directory rendered no rows`);
    assert.ok(result.scripts.includes('/app.js'), 'The real app entry script must run');
    assert.ok(result.imports.length > 0, 'The real browser module imports must run');
  });
}

// Jake, 16 Oct: the Parliamentarians bar keeps search, Party, Parliament, Chamber
// and the sort; the "Voting record" and "Portrait" checkboxes are gone. An old
// link that still carries their params lists everyone and drops them from the URL.
test('the parliamentarians bar has no checkboxes and old votes/photo links load the full list', { timeout: 40000 }, async () => {
  const count = html => html.match(/id="dir-count"[^>]*>([^<]*)</)[1];
  const clean = await render('person', { html: true });
  assert.deepEqual(clean.errors, []);
  assert.doesNotMatch(clean.html, /type="checkbox"|Voting record<\/label>|Portrait<\/label>/);
  for (const key of ['party', 'state', 'chamber']) assert.match(clean.html, new RegExp(`<select data-filter="${key}"`));
  assert.match(clean.html, /id="dir-q"/);
  assert.match(clean.html, /<option value="speeches" selected(="")?>Most speeches<\/option>/);
  assert.match(count(clean.html), /^[\d,]+ parliamentarians$/);

  const old = await render('person', { html: true, path: '/subject/person?votes=1&photo=1' });
  assert.deepEqual(old.errors, []);
  assert.equal(old.failed, false);
  assert.equal(count(old.html), count(clean.html), 'old params do not narrow the list');
  assert.equal(old.location, '/subject/person');
  assert.equal(old.search, '', 'old params are not written back');

  const mixed = await render('person', { html: true, path: '/subject/person?votes=1&sort=name&photo=1' });
  assert.equal(mixed.search, '?sort=name', 'live params survive, retired ones drop');
});
