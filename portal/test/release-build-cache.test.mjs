import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, readFile, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {buildCacheKey, cachedBuild} from '../../scripts/cached_release_build.mjs';
import {buildIndependent, INDEPENDENT_BUILDS} from '../../scripts/build_parallel.mjs';

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'opax-build-cache-test-'));
  t.after(() => rm(root, {recursive: true, force: true}));
  const put = async (path, bytes) => {await mkdir(join(root, path, '..'), {recursive: true}); await writeFile(join(root, path), bytes);};
  await put('scripts/build_passage_names.mjs', '// fixture builder\n');
  await put('portal/public/parliamentarians.json', '{"people":[]}\n');
  await put('portal/package-lock.json', '{}\n');
  return {root, put};
}

test('cached output is byte-identical and a damaged or incomplete cache rebuilds', async t => {
  const {root, put} = await fixture(t);
  let runs = 0;
  const bytes = '{"full_names":["Fixture Person"]}\n';
  const options = {root, cacheRoot: '.cache/release-build', run: async () => {runs++; await put('portal/src/passage-names.json', bytes);}};
  assert.equal((await cachedBuild('passage-names', options)).hit, false);
  await put('portal/src/passage-names.json', 'stale');
  assert.equal((await cachedBuild('passage-names', options)).hit, true);
  assert.equal(await readFile(join(root, 'portal/src/passage-names.json'), 'utf8'), bytes);
  assert.equal(runs, 1);
  const payload = '.cache/release-build/passage-names/files/portal/src/passage-names.json';
  await put(payload, 'corrupted');
  assert.equal((await cachedBuild('passage-names', options)).hit, false);
  await rm(join(root, payload));
  assert.equal((await cachedBuild('passage-names', options)).hit, false);
  assert.equal(runs, 3);
});

test('cache keys include source exports, builder code, lockfile and crawl transitive/generated inputs', async t => {
  const {root, put} = await fixture(t);
  for (const path of ['portal/public/parliamentarians.json', 'scripts/build_passage_names.mjs', 'portal/package-lock.json']) {
    const before = await buildCacheKey('passage-names', root);
    await put(path, 'changed ' + path);
    assert.notEqual(await buildCacheKey('passage-names', root), before);
  }
  for (const path of ['portal/src/seo-content.ts', 'portal/public/hubs/index.json', 'portal/public/suppliers/shard-00.json', 'scripts/hubs/sitting-2026.json']) {
    const before = await buildCacheKey('crawl', root);
    await put(path, 'changed ' + path);
    assert.notEqual(await buildCacheKey('crawl', root), before);
  }
  const before = await buildCacheKey('crawl', root);
  await put('portal/public/crawl/indexnow.json', 'own output');
  await put('portal/public/person-paths.js', 'own output');
  assert.equal(await buildCacheKey('crawl', root), before);
});

test('independent builders start together and all finish before returning', async () => {
  const started = [], finish = [];
  const pending = buildIndependent(args => new Promise(resolve => {started.push(args); finish.push(resolve);}));
  assert.deepEqual(started, Object.values(INDEPENDENT_BUILDS));
  let completed = false;
  pending.then(() => {completed = true;});
  for (const resolve of finish.slice(0, -1)) resolve();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(completed, false);
  finish.at(-1)();
  await pending;
});

test('a failed independent builder aborts the release after the other children settle', async () => {
  const finish = [];
  const pending = buildIndependent(args => args === INDEPENDENT_BUILDS.social ? Promise.reject(new Error('fixture failure')) : new Promise(resolve => finish.push(resolve)));
  let settled = false;
  pending.catch(() => {settled = true;});
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(settled, false);
  for (const resolve of finish) resolve();
  await assert.rejects(pending, /release stopped/);
});
