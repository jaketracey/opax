import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { filterMoneyEdges, readMoneyFilters } from '../public/money-records.js';

const read = name => readFileSync(new URL(`../graph/${name}.ts`, import.meta.url), 'utf8');
const transpile = source => ts.transpileModule(source, {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const engine = read('map3d-engine');
const probe = engine.slice(engine.indexOf('export function webglAvailable'), engine.indexOf('/**', engine.indexOf('export function webglAvailable'))).replace('export ', '');
test('capability checks require WebGL 2 and release every temporary context', () => {
  const kinds=[]; let released=0;
  const context={getExtension:name=>{assert.equal(name,'WEBGL_lose_context');return {loseContext:()=>released++}}};
  const available=runInNewContext(`${transpile(probe)}; webglAvailable`,{document:{createElement:()=>({getContext:kind=>{kinds.push(kind);return context}})}});
  assert.equal(available(),true); assert.equal(available(),true);
  assert.deepEqual(kinds,['webgl2','webgl2']); assert.equal(released,2);
  const unavailable=runInNewContext(`${transpile(probe)}; webglAvailable`,{document:{createElement:()=>({getContext:kind=>kind==='webgl2'?null:context})}});
  assert.equal(unavailable(),false);
});
test('a graphics interruption retains the canvas and restores a fresh frame', () => {
  const start=engine.indexOf('    this.onContextLost = (event: Event) =>');
  const end=engine.indexOf('    this.edgeMaterial =',start);
  const listeners=new Map(); let lost=0,restored=0,resized=0,prevented=0;
  const canvas={addEventListener:(name,fn)=>listeners.set(name,fn)};
  const state={handleResize:()=>resized++};
  const install=runInNewContext(`(function(){${transpile(engine.slice(start,end))}})`,{canvas,performance:{now:()=>123},onContextLost:()=>lost++,onContextRestored:()=>restored++});
  install.call(state);
  listeners.get('webglcontextlost')({preventDefault:()=>prevented++});
  assert.equal(state.contextLost,true); assert.equal(lost,1); assert.equal(prevented,1);
  listeners.get('webglcontextrestored')();
  assert.equal(state.contextLost,false); assert.equal(resized,1); assert.equal(restored,1);
  assert.equal(state.lastFrame,123); assert.equal(state.renderDirty,true);
});
const adapter=read('index');
test('phone opening zoom remains part of automatic fit instead of claiming the camera',()=>{
  const start=adapter.indexOf('engine.fit(!firstFit, overviewScale())');
  const block=adapter.slice(start,adapter.indexOf('// The open card follows',start));
  assert.match(block,/engine\.fit\(!firstFit, overviewScale\(\)\)/);
  assert.doesNotMatch(block,/engine\.zoomBy/);
  assert.match(engine,/fit\(animate = true, scale = 1\)/);
  assert.match(engine,/this\.fitDistance\(\) \/ this\.fitScale/);
});
test('automatic fit scale follows the current width after rotation',()=>{
  const start=engine.indexOf('  private handleResize()');
  const block=engine.slice(start,engine.indexOf('  private stepFades',start));
  assert.match(block,/rect\.width <= 540 \? 1\.3 : 1/);
  const resize=adapter.slice(adapter.indexOf('const resizeObserver ='),adapter.indexOf('resizeObserver.observe'));
  assert.match(resize,/engine\.fit\(false, overviewScale\(\)\)/);
});

const focusStart=adapter.indexOf('  const focusSelection =');
const focusEnd=adapter.indexOf('  /**\n   * Re-draw the open card',focusStart);
const focusBlock=adapter.slice(focusStart,focusEnd);
function selectedFocus(width,coarse=true) {
  const calls=[];
  const context={window:{matchMedia:()=>({matches:coarse})},container:{getBoundingClientRect:()=>({width})},visibleSceneEdges:[
    {source:'a',target:'p1',total:20,weight:20},
    {source:'hub',target:'a',total:100,weight:100},
    {source:'a',target:'p2',total:60,weight:60},
  ],engine:{reducedMotion:false,focusOn:(...args)=>calls.push(['focusOn',...args]),frameOn:(...args)=>calls.push(['frameOn',...args])}};
  const focus=runInNewContext(`${transpile(focusBlock)}; focusSelection`,context);
  focus('a');
  return calls;
}
test('phone selection frames the subject with its strongest visible connections',()=>{
  const calls=selectedFocus(390);
  assert.equal(calls[0][0],'frameOn');
  assert.deepEqual(Array.from(calls[0][1]),['a','hub','p2','p1']);
  assert.equal(calls[0][2].duration,700);
});
test('desktop selection keeps the quiet focus nudge',()=>{
  assert.deepEqual(selectedFocus(1200,false),[['focusOn','a',null]]);
});

const windowBlock=adapter.slice(adapter.indexOf('export function windowFigures'),adapter.indexOf('export function buildGraph',adapter.indexOf('export function windowFigures')));
const fallback=read('connection-fallback').replace(/^import .*\n/gm,'').replaceAll('export function','function');
const {connectionRows,mountConnectionFallback}=runInNewContext(`${transpile(windowBlock.replace('export ',''))}\n${transpile(fallback)}; ({connectionRows,mountConnectionFallback})`,{URLSearchParams,filterMoneyEdges,readMoneyFilters,formatMoney:n=>`$${n}`,document:{createElement:tag=>element(tag)}});
function element(tag='div') { return {tagName:tag,children:[],style:{},classList:{remove(){}},append(...items){this.children.push(...items)},replaceChildren(){this.children=[]},setAttribute(){},addEventListener(name,fn){this[name]=fn},remove(){this.removed=true}}; }
const data={nodes:[{id:'hub',kind:'grantor',flow:'contracts',label:'Contracts'},{id:'a',kind:'donor',label:'Recipient A'},{id:'p',kind:'party',label:'Party'}],edges:[
  {source:'hub',target:'a',total:100,count:2,byYear:{2022:[40,1],2023:[60,1]}},
  {source:'a',target:'p',total:20,count:1,byYear:{2023:[20,1]}},
]};
test('fallback charts preserve direction, requested edges and year-window amounts',()=>{
  const rows=connectionRows(data,{focusId:'a',edges:[{source:'hub',target:'a'}],from:2023,to:2023});
  assert.equal(rows.length,1); assert.equal(rows[0].total,60); assert.equal(rows[0].source,'hub');
  assert.equal(connectionRows(data,{focusId:'a',edges:[]}).length,0);
  assert.equal(connectionRows(data,{focusId:'a',edges:[{source:'a',target:'hub'}]}).length,0);
});
test('fallback responds to journey selection and cleans up on unmount',()=>{
  const host=element();const handle=mountConnectionFallback(host,data);
  const text=node=>[node.textContent||'',...(node.children||[]).map(text)].join(' ');
  assert.match(text(host),/Recipient A/);
  assert.equal(handle.presentScene({focusId:'a',edges:[{source:'a',target:'p'}]}),true);
  assert.match(text(host),/\$20/);assert.doesNotMatch(text(host),/Contracts/);
  assert.equal(handle.presentScene({focusId:'missing'}),false);
  handle.clearScene();assert.match(text(host),/Contracts/);
  handle.destroy();assert.equal(host.children[0].removed,true);
  assert.equal(handle.presentScene({focusId:'a'}),false);
});
