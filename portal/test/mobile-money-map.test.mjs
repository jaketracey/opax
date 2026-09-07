import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

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
const windowBlock=adapter.slice(adapter.indexOf('export function windowFigures'),adapter.indexOf('export function buildGraph',adapter.indexOf('export function windowFigures')));
const fallback=read('connection-fallback').replace(/^import .*\n/gm,'').replaceAll('export function','function');
const {connectionRows,mountConnectionFallback}=runInNewContext(`${transpile(windowBlock.replace('export ',''))}\n${transpile(fallback)}; ({connectionRows,mountConnectionFallback})`,{formatMoney:n=>`$${n}`,document:{createElement:tag=>element(tag)}});
function element(tag='div') { return {tagName:tag,children:[],style:{},classList:{remove(){}},append(...items){this.children.push(...items)},replaceChildren(){this.children=[]},setAttribute(){},addEventListener(name,fn){this[name]=fn},remove(){this.removed=true}}; }
const data={nodes:[{id:'hub',label:'Contracts'},{id:'a',label:'Recipient A'},{id:'p',label:'Party'}],edges:[
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
