import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {loadWorker} from './worker-harness.mjs';

test('Worker harness keeps execution contexts and identity options in either argument order', async () => {
  const root = await mkdtemp(join(tmpdir(), 'opax-worker-harness-'));
  try {
    const entry = join(root, 'worker.mjs');
    const identityModule = new URL('../src/table-identity-prefilter.generated.mjs', import.meta.url).pathname;
    await writeFile(join(root, 'index.html'), '<main></main>');
    await writeFile(entry, `import {binding} from ${JSON.stringify(identityModule)};
      export default {fetch(request, env, ctx) {
        ctx.waitUntil(Promise.resolve());
        return Response.json({fingerprint:binding.registryFingerprint});
      }};`);
    const options = {identityBundle:{binding:{registryFingerprint:'fixture-binding'}, prefilter:{}, fingerprint:'fixture-binding'}};
    for (const order of ['context first', 'options first', 'options only']) {
      let calls = 0;
      const ctx = {waitUntil() { calls++; }, passThroughOnException() {}};
      const args = order === 'context first' ? [ctx, options] : order === 'options first' ? [options, ctx] : [options];
      const worker = await loadWorker(entry, root, ...args);
      assert.deepEqual(await (await worker.fetch('/fixture')).json(), {fingerprint:'fixture-binding'}, order);
      assert.equal(calls, order === 'options only' ? 0 : 1, order);
    }
    let calls = 0;
    const worker = await loadWorker(entry, root, {waitUntil() { calls++; }});
    assert.notEqual((await (await worker.fetch('/fixture')).json()).fingerprint, 'fixture-binding');
    assert.equal(calls, 1, 'context-only callers keep their context');
  } finally {
    await rm(root, {recursive:true, force:true});
  }
});
