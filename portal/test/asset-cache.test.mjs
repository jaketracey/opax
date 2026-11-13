// Browser cache policy for the static files (public/_headers). A file may be
// served immutable only while every URL that loads it changes with its bytes,
// and no path may collect two Cache-Control values from overlapping rules
// (Workers Assets joins them: "max-age=300, …, max-age=31536000, immutable").
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {mkdtempSync, mkdirSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {moduleReferences, immutableModules} from '../../scripts/stamp_assets.mjs';

const pub = new URL('../public/', import.meta.url);
const headers = await readFile(new URL('_headers', pub), 'utf8');
const hash = async (f) => createHash('sha256').update(await readFile(new URL(f, pub))).digest('hex').slice(0, 10);

/** [{pattern, lines}] in file order. */
const rules = headers.split('\n').reduce((out, line) => {
  if (/^\//.test(line)) out.push({pattern: line.trim(), lines: []});
  else if (out.length && /^\s+\S/.test(line)) out.at(-1).lines.push(line.trim());
  return out;
}, []);
const matches = (pattern, path) => new RegExp(`^${pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace('*', '.*')}$`).test(path);
const setsCache = (rule) => rule.lines.some((l) => /^Cache-Control:/i.test(l));

test('_headers stays under the Workers Assets limit of 100 rules', () => {
  assert.ok(rules.length <= 100, `${rules.length} rules`);
});

test('grant seat pages use the existing grants JSON cache policy and assets route', async () => {
  const config = await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
  const runFirst = JSON.parse(config.match(/"run_worker_first": (\[[^\]]*\])/)[1]);
  for (const path of ['/graph/grants.federal.json', '/grants/federal/shard-00.json',
    '/grants/federal/programs/go3141.json', '/grants/federal/seats/maribyrnong.json',
    '/grants/federal/seats/melbourne-2.json']) {
    assert.ok(!runFirst.some(pattern => matches(pattern, path)), `${path} is served by the assets binding`);
    const cache = rules.filter(rule => matches(rule.pattern, path)).flatMap(rule => rule.lines)
      .filter(line => /^(?:! )?Cache-Control/i.test(line));
    assert.deepEqual(cache, ['Cache-Control: public, max-age=0, must-revalidate'], path);
  }
});

/** The Cache-Control a path ends with: rules apply in file order, "! Cache-Control" drops what came before. */
const cacheFor = (path) => rules.filter((rule) => matches(rule.pattern, path)).reduce((out, rule) => {
  for (const line of rule.lines) {
    if (/^! Cache-Control$/i.test(line)) out = [];
    else if (/^Cache-Control:/i.test(line)) out.push(line.replace(/^Cache-Control:\s*/i, ''));
  }
  return out;
}, []).join(', ');

test('the bill index the app reads on every profile open is fresh for 15 minutes; bill files still revalidate', async () => {
  const config = await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
  const runFirst = JSON.parse(config.match(/"run_worker_first": (\[[^\]]*\])/)[1]);
  for (const path of ['/bills/index.json', '/bills/au-federal-r7537.json', '/bills/au-federal-alrc-2326.json'])
    assert.ok(!runFirst.some((pattern) => matches(pattern, path)), `${path} is served by the assets binding, not the Worker`);
  assert.equal(cacheFor('/bills/index.json'), 'public, max-age=900, stale-while-revalidate=3600');
  for (const path of ['/bills/au-federal-r7537.json', '/bills/au-federal-s1234.json', '/bills/au-federal-alrc-2326.json'])
    assert.equal(cacheFor(path), 'public, max-age=0, must-revalidate', path);
  // The other catalogs the app reads keep their revalidation.
  for (const path of ['/parliamentarians.json', '/votes.json', '/photos/people.json', '/pay.json', '/expenses.json',
    '/interests/index.json', '/corpus.json', '/reports/index.json'])
    assert.equal(cacheFor(path), 'public, max-age=0, must-revalidate', path);
  assert.equal(cacheFor('/electorates/manifest.json'), 'public, max-age=300, must-revalidate');
});

test('no path collects Cache-Control from two rules without detaching one', () => {
  for (const rule of rules.filter((r) => setsCache(r) && !r.pattern.includes('*'))) {
    const others = rules.filter((r) => r !== rule && setsCache(r) && matches(r.pattern, rule.pattern));
    if (others.length) assert.ok(rule.lines.includes('! Cache-Control'), `${rule.pattern} also matches ${others.map((r) => r.pattern).join(', ')}`);
  }
});

test('every generated immutable module is referenced only by its content stamp', async () => {
  const start = headers.indexOf('# --- stamped modules');
  const block = rules.filter((r) => headers.indexOf(`\n${r.pattern}\n`, start) > start);
  assert.ok(block.length >= 20, `${block.length} generated rules`);
  const refs = moduleReferences(fileURLToPath(pub), fileURLToPath(new URL('../src/', import.meta.url)));
  for (const rule of block) {
    const file = rule.pattern.slice(1);
    assert.deepEqual(rule.lines, ['! Cache-Control', 'Cache-Control: public, max-age=31536000, immutable'], file);
    const h = await hash(file);
    assert.ok(refs.get(file)?.length, `${file} is loaded somewhere`);
    for (const r of refs.get(file)) assert.equal(r.stamp, h, `${r.from} loads /${file} without ?v=${h}`);
  }
  // A module referenced bare stays on the 300-second module default.
  assert.ok(!immutableModules(fileURLToPath(pub), fileURLToPath(new URL('../src/', import.meta.url)), {references: refs}).includes('format.js'));
});

test('one reference inventory hashes each module once, including modules with multiple importers', () => {
  const references = new Map([
    ['fixture.js', [{from: 'a.html', stamp: 'fixture-hash'}, {from: 'b.js', stamp: 'fixture-hash'}]],
    ['bare.js', [{from: 'a.html', stamp: null}]],
    ['unused.js', []],
  ]);
  const calls = [];
  const modules = immutableModules('', '', {references, hashFile: file => {calls.push(file); return 'fixture-hash';}});
  assert.deepEqual(modules, ['fixture.js']);
  assert.deepEqual(calls, ['fixture.js', 'bare.js']);
});

test('new inventories reject changed bytes and newly added bare references', t => {
  const root = mkdtempSync(join(tmpdir(), 'opax-module-inventory-'));
  t.after(() => rmSync(root, {recursive: true, force: true}));
  const publicRoot = join(root, 'public'), srcRoot = join(root, 'src');
  mkdirSync(publicRoot); mkdirSync(srcRoot);
  const bytes = 'export const fixture=1;';
  const stamp = createHash('sha256').update(bytes).digest('hex').slice(0, 10);
  writeFileSync(join(publicRoot, 'fixture.js'), bytes);
  writeFileSync(join(publicRoot, 'index.html'), `<script src="/fixture.js?v=${stamp}"></script>`);
  assert.deepEqual(immutableModules(publicRoot, srcRoot), ['fixture.js']);
  writeFileSync(join(publicRoot, 'fixture.js'), 'export const fixture=2;');
  assert.deepEqual(immutableModules(publicRoot, srcRoot), []);
  writeFileSync(join(publicRoot, 'fixture.js'), bytes);
  assert.deepEqual(immutableModules(publicRoot, srcRoot), ['fixture.js']);
  writeFileSync(join(srcRoot, 'fixture.ts'), "const fixture='/fixture.js';");
  assert.deepEqual(immutableModules(publicRoot, srcRoot), []);
});

test('the money map page loads its shared stylesheet by content stamp', async () => {
  const map = await readFile(new URL('map.html', pub), 'utf8');
  assert.match(map, new RegExp(`/ui-controls\\.css\\?v=${await hash('ui-controls.css')}"`));
});
