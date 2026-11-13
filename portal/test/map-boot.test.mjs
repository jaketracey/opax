import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import ts from 'typescript';
import {runInNewContext} from 'node:vm';
import {ForceSim3D, clusterCentres3D} from '../graph/force3d.ts';
// The renderer has TypeScript parameter properties, so use the release compiler
// rather than Node's strip-only loader. No WebGL instance is created here.
const compiled = await build({entryPoints:[new URL('../graph/map3d-engine.ts',import.meta.url).pathname],bundle:true,write:false,platform:'node',format:'esm',target:'es2022'});
const {KnowledgeMapEngine, settleTicks} = await import('data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].text + '\n//# sourceURL=opax-map-boot-fixture.mjs').toString('base64'));
// Exercise the actual frame body with a counted renderer and simulation.
// It is an instance field, so Object.create alone cannot initialise it.
const source = ts.createSourceFile('map3d-engine.ts', await (await import('node:fs/promises')).readFile(new URL('../graph/map3d-engine.ts',import.meta.url),'utf8'),ts.ScriptTarget.Latest,true);
const engineClass = source.statements.find(node=>ts.isClassDeclaration(node)&&node.name?.text==='KnowledgeMapEngine');
const frame = engineClass.members.find(node=>node.name?.getText(source)==='frame').initializer;
const frameCode = ts.transpileModule(`(function(now) ${frame.body.getText(source)})`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;

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
  let renders = 0, physics = 0, scheduled = 0;
  Object.assign(engine,{
    paused:false,contextLost:false,lastFrame:100,frameCount:0,renderDirty:true,
    sim:{alpha:()=>1,tick:()=>physics++},drag:null,tween:null,distGoal:100,
    view:{dist:100},idleSpin:false,hoverDirty:false,orbit:null,pinch:null,
    reduced:true,edgeVisuals:[],flowVisuals:[],
    stepFades:()=>false,updateLod:()=>false,
    updateCamera(){},updateTerritories(){},updateNodeMeshes(){},updateHubMeshes(){},
    updateEdgeMeshes(){},updateRings(){},projectLabels(){},
    renderer:{render(){renders++;}},scene:{},camera:{},
  });
  engine.frame = runInNewContext(frameCode,{requestAnimationFrame(){scheduled++;return scheduled;}}).bind(engine);
  const ready = engine.setDataCooperatively('initial');
  assert.deepEqual(events,['initial:0']);
  assert.equal(engine.preparingData,true);
  for (const time of [116,132,148]) engine.frame(time);
  assert.deepEqual({physics,renders},{physics:0,renders:0},'preparation frames must not advance physics or render');
  assert.equal(engine.frameCount,0);
  assert.equal(engine.lastFrame,148,'held frames reset the elapsed-time clock');
  assert.equal(scheduled,3,'the animation loop remains scheduled');
  assert.equal(await ready,true);
  assert.deepEqual(events,['initial:0','initial:1','initial:2','initial:done']);
  assert.equal(engine.preparingData,false);
  engine.frame(164);
  assert.equal(physics,1,'normal frames advance physics after preparation');
  assert.equal(renders,1,'the first settled frame is drawn');
  assert.equal(engine.frameCount,1);
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
