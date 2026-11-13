import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const built = await build({ stdin: { contents: "export * from './src/research-evidence';export * from './src/ask-attribution';export * from './src/position-evidence';", resolveDir: new URL('../', import.meta.url).pathname }, bundle: true, write: false, platform: 'browser', format: 'esm', external: ['node:*'] });
const api = await import('data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].text).toString('base64'));
test('the passage year in parentheses is a date phrase, like "in 2011"; any other year is still unsupported', () => {
  const quote = 'mandatory precommitment will reduce the harm of poker machines';
  for (const claim of ['Robin Example (2011) said mandatory precommitment will reduce harm.', 'Robin Example (Independent, 2011) said mandatory precommitment will reduce harm.', 'In 2011, Robin Example said mandatory precommitment will reduce harm.'])
    assert.equal(api.positionPointSupported(claim, quote, 'What has Robin Example said about poker machines?', '2011-05-10', quote), true, claim);
  assert.equal(api.positionPointSupported('Robin Example (2012) said mandatory precommitment will reduce harm.', quote, 'What has Robin Example said about poker machines?', '2011-05-10', quote), false);
  assert.equal(api.positionPointSupported('Robin Example (2011) said 40 per cent of losses come from problem gamblers.', quote, 'What has Robin Example said about poker machines?', '2011-05-10', quote), false);
});
