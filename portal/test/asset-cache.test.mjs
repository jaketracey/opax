// Browser cache policy for the static files (public/_headers). A file may be
// served immutable only while every URL that loads it changes with its bytes,
// and no path may collect two Cache-Control values from overlapping rules
// (Workers Assets joins them: "max-age=300, …, max-age=31536000, immutable").
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
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
  assert.ok(!immutableModules(fileURLToPath(pub), fileURLToPath(new URL('../src/', import.meta.url))).includes('format.js'));
});

test('the money map page loads its shared stylesheet by content stamp', async () => {
  const map = await readFile(new URL('map.html', pub), 'utf8');
  assert.match(map, new RegExp(`/ui-controls\\.css\\?v=${await hash('ui-controls.css')}"`));
});
