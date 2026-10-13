import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const built = await build({ stdin: { contents: "export * from './src/party-labels';", resolveDir: new URL('../', import.meta.url).pathname }, bundle: true, write: false, platform: 'browser', format: 'esm' });
const { searchPartyLabels } = await import('data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].text).toString('base64'));
test('party names map to the KB speech labels; Coalition is its member parties; unknown names are refused', () => {
  assert.deepEqual(searchPartyLabels('Australian Labor Party'), ['Labor']);
  assert.deepEqual(searchPartyLabels('ALP'), ['Labor']);
  assert.deepEqual(searchPartyLabels('The Nationals'), ['Nationals']);
  assert.deepEqual(searchPartyLabels('Australian Greens'), ['Greens']);
  assert.deepEqual(searchPartyLabels('the Coalition').sort(), ['Country Liberal Party', 'LNP', 'Liberal', 'Nationals']);
  assert.deepEqual(searchPartyLabels('Jacqui Lambie Network'), ['Jacqui Lambie Network', 'JLN']);
  assert.equal(searchPartyLabels('Invented Party'), null);
});
