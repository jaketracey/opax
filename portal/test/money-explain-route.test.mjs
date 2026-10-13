// /money/explain on the server: the shell with a fixed title, description and
// canonical, whatever the query names. The flow is drawn client-side
// (test/money-explain.test.mjs); the Worker never echoes the address. Names are invented.
import test from 'node:test';
import assert from 'node:assert/strict';
import {offline, loadWorker, rendered, outbound} from './worker-harness.mjs';

test.after(offline());
const {fetch} = await loadWorker(new URL('../src/index.ts', import.meta.url).pathname, new URL('../public/', import.meta.url).pathname);

test('the explainer route serves the shell with a fixed title and a query-free canonical', async () => {
  for (const path of ['/money/explain', '/money/explain?from=donor%3Aquarry+example&to=party%3ALabor', '/money/explain?jur=qld&to=party%3ALNP']) {
    const response = await fetch(path);
    assert.equal(response.status, 200, path);
    const head = rendered(await response.text());
    assert.match(head, /<title>Explain a money flow · OPAX<\/title>/, path);
    assert.match(head, /<link rel="canonical" href="https:\/\/opax\.com\.au\/money\/explain">/, path);
  }
});

test('a crafted donor name in the address never reaches the server-rendered page or its card', async () => {
  const path = `/money/explain?${new URLSearchParams({from: 'donor:marlow fennick', to: 'party:Liberal', q: 'Marlow Fennick donations'})}`;
  const html = await (await fetch(path)).text();
  assert.ok(!/marlow|fennick/i.test(rendered(html)));
  assert.deepEqual(outbound, [], 'no model or knowledge-box call');
});

test('paths under /money/explain that are not the route stay unmatched', async () => {
  assert.equal((await fetch('/money/explain/donor:quarry')).status, 404);
});
