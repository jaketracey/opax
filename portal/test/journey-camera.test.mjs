import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
const source = readFileSync(new URL('../graph/index.ts', import.meta.url), 'utf8');
const block = source.slice(source.indexOf('  const presentScene ='), source.indexOf('  const pauseScene ='));
const compiled = ts.transpileModule(block, {compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
function setup(reducedMotion=false) {
  const moves=[];
  const edges=[{source:'a',target:'p'}];
  const context={destroyed:false,byId:new Map([['a',{}],['p',{}]]),visibleSceneIds:new Set(['a','p']),visibleSceneEdges:edges,
    resetSceneWindow:()=>{},applyEmphasis:()=>{},engine:{reducedMotion,viewAngles:{phi:1},swingTheta:()=>0.5,frameOn:(ids,options)=>moves.push({ids:Array.from(ids),options})}};
  const present=runInNewContext(`let selectedId, guidedScene, spotlightFor, spotlightEdges; ${compiled}; presentScene`,context);
  return {present,moves,edges};
}
test('guided steps make a single eased camera move, with no opening close-up snap',()=>{
  const {present,moves,edges}=setup();
  assert.equal(present({focusId:'a',withIds:['p'],edges}),true);
  assert.equal(moves.length,1);
  assert.deepEqual(moves[0].ids,['a','p']);
  assert.equal(moves[0].options.duration,1200);
  assert.equal(moves[0].options.ease(0),0);
  assert.equal(moves[0].options.ease(1),1);
  assert.ok(moves[0].options.ease(.25)>0 && moves[0].options.ease(.25)<.25);
});
test('reduced motion is immediate and invalid scenes do not move the camera',()=>{
  const {present,moves,edges}=setup(true);
  assert.equal(present({focusId:'missing',withIds:[],edges:[]}),false);
  assert.equal(moves.length,0);
  present({focusId:'a',withIds:['p'],edges});
  assert.equal(moves[0].options.duration,0);
});
