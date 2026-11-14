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

test('the browser party directory uses every canonical page and explains parliamentary-only coverage', { timeout: 20000 }, async () => {
  const {readPartyPages} = await import('../public/party-page.js');
  const pages = await readPartyPages(async path => JSON.parse(readFileSync(new URL('../public' + path, import.meta.url), 'utf8')));
  const result = await render('party', { html: true, path: '/subject/party?sort=name' });
  assert.deepEqual(result.errors, []);
  const listed = [...result.html.matchAll(/class="source-title dir-name"[^>]*href="(\/subject\/party\/[^"?]+)"/g)].map(m => m[1]);
  assert.deepEqual(listed.sort(), pages.map(p => p.href).sort());
  const {JSDOM} = await import('jsdom');
  const doc = new JSDOM(result.html).window.document;
  for (const slug of ['australian-conservatives', 'australian-motoring-enthusiast-party', 'gerard-rennick-people-first']) {
    const row = doc.querySelector(`a[href="/subject/party/${slug}"]`).closest('li');
    assert.equal(row.querySelector('.result-meta').textContent, 'Recorded divisions. No party-level disclosure file held by OPAX.');
  }
  assert.equal(doc.querySelector('a[href="/subject/party/derryn-hinchs-justice-party"]').closest('li').querySelector('.result-meta').textContent, 'Parliamentary roster and recorded divisions. No party-level disclosure file held by OPAX.');
  assert.equal(doc.querySelector('a[href="/subject/party/independent"]').closest('li').querySelector('.result-meta').textContent, 'Parliamentarians who sat without a party. Not a party organisation.');
  assert.equal(doc.querySelector('a[href="/subject/party/dlp"]').textContent.trim(), 'Democratic Labour Party');
});

test('directory membership includes previous affiliations and division-only people once each', { timeout: 20000 }, async () => {
  const manifest = JSON.parse(readFileSync(new URL('../public/electorates/manifest.json', import.meta.url), 'utf8'));
  const result = await render('party', {html: true, files: {
    '/parliamentarians.json': {people: [
      {name: 'Alex Example', pid: 'fixture-1', party: 'JLN', party_now: 'Independent', current: true, speeches: 0},
      {name: 'Example', pid: 'fixture-1', party: 'Jacqui Lambie Network', speeches: 0},
    ]},
    [manifest.people_url]: {people: []},
    '/graph/party-members.json': {parties: {'Jacqui Lambie Network': [{name: 'Alex Example'}, {name: 'Casey Fixture'}]}},
  }});
  assert.deepEqual(result.errors, []);
  const {JSDOM} = await import('jsdom');
  const doc = new JSDOM(result.html).window.document;
  for (const [slug, expected] of [['jacqui-lambie-network', '2parliamentarians in the record'], ['independent', '1parliamentarian in the record']]) {
    const row = doc.querySelector(`a[href="/subject/party/${slug}"]`).closest('li');
    const count = [...row.querySelectorAll('.dir-fig')].find(n => n.textContent.includes('parliamentarian'));
    assert.equal(count.textContent, expected);
  }
});

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
