// The files that say who is who must reach a returning reader the next time a page loads, even when the
// browser kept last release's copy under the old one-hour-plus-a-day headers: every loader fetches them
// with { cache: "no-cache" } (revalidation: a 304 with no body when nothing changed), and _headers
// serves them max-age=0, must-revalidate (docs/PHOTOS.md, "Caches").
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile, readdir} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {MODULE_STAMPS} from '../../scripts/stamp_assets.mjs';

const pub = new URL('../public/', import.meta.url);
const IDENTITY = ['/photos/people.json', '/parliamentarians.json', '/pay.json', '/votes.json', '/expenses.json', '/interests/index.json'];
const app = await readFile(new URL('app.js', pub), 'utf8');

test('the app.js loaders revalidate every identity file', async () => {
  const calls = [];
  const fetch = async (url, init) => { calls.push({url, cache: init?.cache}); return {ok: true, json: async () => ({people: []})}; };
  const loaders = ['loadPhotoMap', 'loadVotes', 'loadExpenses', 'loadPay', 'loadParliamentarians'];
  const source = loaders.map((name) => {
    const m = app.match(new RegExp(`let \\w+Promise = null;\\nfunction ${name}\\(\\) \\{[\\s\\S]*?\\n\\}`));
    assert.ok(m, `${name} is where the test expects it`);
    return m[0];
  }).join('\n');
  const ctx = {fetch, loadElectorateModule: async () => ({loadPeople: async () => ({people: []})})};
  runInNewContext(`let photoMap, votesData, expensesData;\n${source}\nthis.run = () => Promise.all([${loaders.map((l) => `${l}()`).join(', ')}]);`, ctx);
  await ctx.run();
  assert.deepEqual(calls.map((c) => c.url).sort(), ['/expenses.json', '/parliamentarians.json', '/pay.json', '/photos/people.json', '/votes.json']);
  for (const c of calls) assert.equal(c.cache, 'no-cache', c.url);
  assert.match(app, /renderPersonInterests\.index \?\?= getJSON\("\/interests\/index\.json", \{ cache: "no-cache" \}\)/);
});

test('every fetch of an identity file in any page module revalidates', async () => {
  const files = (await readdir(pub)).filter((f) => f.endsWith('.js'));
  const call = /\b(?:fetch|read|getJSON|fetchJson)\(\s*["'`]([^"'`]+)["'`]([^)]*)\)/g;
  let seen = 0;
  for (const file of files) {
    const src = await readFile(new URL(file, pub), 'utf8');
    for (const [whole, url, args] of src.matchAll(call)) {
      if (!IDENTITY.includes(url)) continue;
      seen++;
      const named = /\bIDENTITY\b/.test(args) && /const IDENTITY = \{ cache: 'no-cache' \}/.test(src);
      assert.ok(/no-cache/.test(args) || named, `${file}: ${whole}`);
    }
  }
  assert.ok(seen >= 10, `found ${seen} identity fetches`);
});

test('_headers serves each identity file for revalidation, replacing the hourly JSON rule', async () => {
  const headers = await readFile(new URL('_headers', pub), 'utf8');
  for (const path of IDENTITY) {
    const block = headers.split(/\n(?=\S)/).find((b) => b.split('\n')[0].trim() === path);
    assert.ok(block, `${path} has its own rule`);
    assert.match(block, /! Cache-Control\n\s+Cache-Control: public, max-age=0, must-revalidate/, path);
  }
});

// A module that fetches these files itself is only as fresh as the copy of the module the browser runs: a
// cached old quiz.js once kept showing Rex Patrick's face on Patrick Conaghan. Such modules are imported by
// a URL carrying their content hash (scripts/stamp_assets.mjs MODULE_STAMPS), so a changed module is a URL
// no cache holds.
test('every module that loads identity files itself is content-stamped where it is imported', async () => {
  const files = (await readdir(pub)).filter((f) => f.endsWith('.js'));
  const stamped = new Set(MODULE_STAMPS.map(([, mod]) => mod));
  const fetching = [];
  for (const file of files) {
    const src = await readFile(new URL(file, pub), 'utf8');
    if (IDENTITY.some((path) => new RegExp(`\\b(?:fetch|read|getJSON|fetchJson)\\(\\s*["'\`]${path.replace(/[./]/g, '\\$&')}`).test(src))) fetching.push(file);
  }
  assert.deepEqual(fetching.filter((f) => f !== 'app.js' && !stamped.has(f)), [], 'stamp them in MODULE_STAMPS');
  for (const [importer, mod] of MODULE_STAMPS) {
    const hash = createHash('sha256').update(await readFile(new URL(mod, pub))).digest('hex').slice(0, 10);
    let refs = 0;
    for (const file of files.filter((f) => f !== mod)) {  // its own usage example is not an import
      const src = await readFile(new URL(file, pub), 'utf8');
      // an import: import("/m.js"), from '/m.js', or the explore registry's module: "/m.js" (not a doc comment)
      for (const [, url] of src.matchAll(new RegExp(`(?:import\\(\\s*|from\\s+|module:\\s*)["'\`](/${mod.replace('.', '\\.')}[^"'\`]*)["'\`]`, 'g'))) {
        refs++;
        assert.equal(url, `/${mod}?v=${hash}`, `${file} imports ${mod} without its current stamp: run node scripts/stamp_assets.mjs`);
      }
    }
    assert.ok(refs >= 1, `${importer} imports /${mod}`);
  }
});

