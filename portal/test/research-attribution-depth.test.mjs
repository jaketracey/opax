import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const built = await build({ stdin: { contents: "export * from './src/research-evidence';export * from './src/ask-attribution';export * from './src/position-evidence';", resolveDir: new URL('../', import.meta.url).pathname }, bundle: true, write: false, platform: 'browser', format: 'esm', external: ['node:*'] });
const api = await import('data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].text).toString('base64'));
// Invented roster: a member whose surname is also an ordinary word.
const roster = { people: [{ name: 'Robin Example' }, { name: 'Ben Small' }, { name: 'Casey Young' }] };

test('a lowercase common word is not a surname mention; a capitalised surname still binds to its member', () => {
  assert.equal(api.claimMatchesSpeaker('In 2023, Robin Example said small modular reactors are safe for young people.', 'Robin Example', roster), true);
  assert.equal(api.claimMatchesSpeaker('In 2023, Robin Example said Small was wrong about reactors.', 'Robin Example', roster), false);
  assert.equal(api.claimMatchesSpeaker('Mr SMALL said the plan was costed.', 'Robin Example', roster), false);
  assert.equal(api.claimMatchesSpeaker('Ben Small said the plan was costed.', 'Ben Small', roster), true);
});

test('a party descriptor for the speaker must match their party on the day; content about a party does not', () => {
  assert.equal(api.claimMatchesParty('A Labor member set out the platform.', 'Australian Democrats'), false);
  assert.equal(api.claimMatchesParty('A Labor member set out the platform.', 'Australian Labor Party'), true);
  assert.equal(api.claimMatchesParty('Another Coalition senator backed nuclear power.', 'Nationals'), true);
  assert.equal(api.claimMatchesParty('Another Coalition senator backed nuclear power.', 'Australian Greens'), false);
  assert.equal(api.claimMatchesParty('A Liberal MP backed nuclear power.', undefined), false);
  assert.equal(api.claimMatchesParty('In 1993, Robin Example said Labor\'s platform prohibited nuclear power plants.', 'Australian Democrats'), true);
  assert.equal(api.claimMatchesParty('Robin Example criticised Labor members for the delay.', 'Liberal'), true);
});

test('the passage year in parentheses is a date phrase, like "in 2011"; any other year is still unsupported', () => {
  const quote = 'mandatory precommitment will reduce the harm of poker machines';
  for (const claim of ['Robin Example (2011) said mandatory precommitment will reduce harm.', 'Robin Example (Independent, 2011) said mandatory precommitment will reduce harm.', 'In 2011, Robin Example said mandatory precommitment will reduce harm.'])
    assert.equal(api.positionPointSupported(claim, quote, 'What has Robin Example said about poker machines?', '2011-05-10', quote), true, claim);
  assert.equal(api.positionPointSupported('Robin Example (2012) said mandatory precommitment will reduce harm.', quote, 'What has Robin Example said about poker machines?', '2011-05-10', quote), false);
  assert.equal(api.positionPointSupported('Robin Example (2011) said 40 per cent of losses come from problem gamblers.', quote, 'What has Robin Example said about poker machines?', '2011-05-10', quote), false);
});
