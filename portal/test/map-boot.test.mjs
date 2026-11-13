import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {ForceSim3D, clusterCentres3D} from '../graph/force3d.ts';
// The renderer has TypeScript parameter properties, so use the release compiler
// rather than Node's strip-only loader. No WebGL instance is created here.
const compiled = await build({entryPoints:[new URL('../graph/map3d-engine.ts',import.meta.url).pathname],bundle:true,write:false,platform:'node',format:'esm',target:'es2022'});
const {KnowledgeMapEngine, settleTicks} = await import('data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].text + '\n//# sourceURL=opax-map-boot-fixture.mjs').toString('base64'));

test('batched initial layout has exactly the same final positions as 300 synchronous ticks', () => {
  const create = () => new ForceSim3D({
    nodes: Array.from({length:24}, (_, i) => ({id:`fixture-${i}`, group:i < 3 ? 'parties' : 'industry', radius:i < 3 ? 10 : 4})),
    links: Array.from({length:21}, (_, i) => ({source:`fixture-${i + 3}`, target:`fixture-${i % 3}`})),
    centres:clusterCentres3D(new Map([['parties',3],['industry',21]]),1.5,'parties'), layout:'grouped',
  });
  const synchronous = create(), batched = create();
  synchronous.tick(300);
  for (const _ of settleTicks(batched)) { /* Consume every batch. */ }
  assert.deepEqual(batched.nodes, synchronous.nodes);
  assert.equal(batched.alpha(), synchronous.alpha());
});

test('initial physics yields within a frame budget without dropping ticks', () => {
  let clock = 0, ticks = 0, previous = 0, batches = 0;
  const steps = settleTicks({tick() { clock += 4; ticks++; }},300,() => clock);
  for (;;) {
    const step = steps.next();
    assert.ok(clock - previous <= 16, 'no batch consumes more than one 16 ms frame');
    previous = clock;
    if (step.done) break;
    batches++;
  }
  assert.equal(ticks,300);
  assert.ok(batches > 1);
});

function fixture() {
  const engine = Object.create(KnowledgeMapEngine.prototype);
  Object.assign(engine,{dataGeneration:0,preparingData:false,disposed:false});
  const events = [];
  engine.setDataSteps = function* (name) {
    for (let i = 0; i < 3; i++) { events.push(`${name}:${i}`); yield; }
    events.push(`${name}:done`);
  };
  return {engine,events};
}

test('first scene remains held while preparation yields and finishes before the mount continues', async () => {
  const {engine,events} = fixture();
  const ready = engine.setDataCooperatively('initial');
  assert.deepEqual(events,['initial:0']);
  assert.equal(engine.preparingData,true);
  assert.equal(await ready,true);
  assert.deepEqual(events,['initial:0','initial:1','initial:2','initial:done']);
  assert.equal(engine.preparingData,false);
});

test('a newer synchronous update cancels a pending initial layout without overwriting it', async () => {
  const {engine,events} = fixture();
  const ready = engine.setDataCooperatively('old');
  engine.setData('new');
  assert.equal(await ready,false);
  assert.deepEqual(events,['old:0','new:0','new:1','new:2','new:done']);
  assert.equal(engine.preparingData,false);
});

test('a departed or disposed map stops preparation at the next yield', async () => {
  for (const reason of ['departed','disposed']) {
    const {engine,events} = fixture();
    let current = true;
    const ready = engine.setDataCooperatively('old',() => current);
    if (reason === 'departed') current = false;
    else engine.disposed = true;
    assert.equal(await ready,false);
    assert.deepEqual(events,['old:0']);
    assert.equal(engine.preparingData,false);
  }
});
