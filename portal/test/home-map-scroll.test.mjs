import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
const source=ts.createSourceFile('engine.ts',readFileSync(new URL('../graph/map3d-engine.ts',import.meta.url),'utf8'),ts.ScriptTarget.Latest,true);
const engine=source.statements.find(node=>ts.isClassDeclaration(node)&&node.name?.text==='KnowledgeMapEngine');
const names=['bindPointerHandlers','onPointerDown','onPointerMove','onPointerUp','onWheel'];
const methods=engine.members.filter(node=>names.includes(node.name?.getText(source))).map(node=>node.getText(source)).join('\n');
const code=ts.transpileModule(`class Probe { ${methods} }`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const Probe=runInNewContext(`${code}; Probe`,{});
function probe(pageScroll=true){
 const state=new Probe(); const calls=[];
 Object.assign(state,{pageScroll,pointers:new Map(),canvas:{addEventListener:(type)=>calls.push(type),style:{}},
  localPoint:event=>({x:event.clientX,y:event.clientY}),pick:()=>{},pickedHub:null,releasePointer:()=>{},
  capturePointer:()=>{throw new Error('Native page touches must not be captured')},
  onSelect:id=>calls.push(id),raycastNode:()=>({node:{id:'chosen'}}),onViewClaimed:()=>{},
  claimView:()=>calls.push('claim'),releaseDives:()=>{},minDist:()=>1,maxDist:()=>1000,distGoal:100});
 return {state,calls};
}
const pointer=(type,x=10,y=10)=>({type,pointerType:'touch',pointerId:1,clientX:x,clientY:y,button:0});
test('homepage omits wheel capture; dedicated map keeps wheel zoom',()=>{
 for(const pageScroll of [true,false]){const {state,calls}=probe(pageScroll);state.bindPointerHandlers();assert.equal(calls.includes('wheel'),!pageScroll)}
 const {state,calls}=probe(false);let prevented=false;state.onWheel({deltaY:-10,preventDefault:()=>{prevented=true}});
 assert.equal(prevented,true);assert.ok(state.distGoal<100);assert.ok(calls.includes('claim'));
});
test('homepage touch tap selects a node without pointer capture',()=>{
 const {state,calls}=probe();state.onPointerDown(pointer('pointerdown'));state.onPointerUp(pointer('pointerup'));assert.deepEqual(calls,['chosen']);
});
test('homepage swipe lets the browser scroll without moving the map or selecting a node',()=>{
 const {state,calls}=probe();state.onPointerDown(pointer('pointerdown'));state.onPointerMove(pointer('pointermove',10,90));state.onPointerUp(pointer('pointerup',10,90));
 assert.deepEqual(calls,[]);assert.equal(state.distGoal,100);
});
test('native scrolling pointer cancellation never opens a card',()=>{
 const {state,calls}=probe();state.onPointerDown(pointer('pointerdown'));state.onPointerUp(pointer('pointercancel'));
 assert.deepEqual(calls,[]);assert.equal(state.orbit,null);assert.equal(state.pointers.size,0);
});
test('pinch is owned by the browser and never becomes a map selection',()=>{
 const {state,calls}=probe();state.onPointerDown(pointer('pointerdown'));state.onPointerDown({...pointer('pointerdown',20,20),pointerId:2});
 state.onPointerMove(pointer('pointermove',40,40));state.onPointerUp(pointer('pointerup',40,40));state.onPointerUp({...pointer('pointerup',20,20),pointerId:2});
 assert.deepEqual(calls,[]);assert.equal(state.distGoal,100);
});
