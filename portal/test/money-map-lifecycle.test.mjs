import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {build} from 'esbuild';
import ts from 'typescript';
import {readMoneyFilters} from '../public/money-records.js';

const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const start=app.indexOf('let moneyMapGeneration =');
const end=app.indexOf('// --- breadcrumb',start);
assert.ok(start>=0 && end>start);
// Execute the production lifecycle and research module; replace only lazy
// module loading and the WebGL/DOM boundaries, as other map tests do.
const lifecycle=app.slice(start,end).replace(/import\((['"])([^'"]+)\1\)/g,(_match,_quote,path)=>`loadModule(${JSON.stringify(path)})`);
const research=await build({entryPoints:[new URL('../public/map-research.js',import.meta.url).pathname],bundle:true,write:false,format:'cjs',platform:'browser'});
const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done});return {promise,resolve};};

class Element extends EventTarget {
  constructor(){super();this.children=[];this.dataset={};this.attributes={};this.selectors=new Map();this.classes=new Set();this.writes=0;
    this.classList={add:value=>this.classes.add(value),remove:value=>this.classes.delete(value),contains:value=>this.classes.has(value),toggle:(value,on)=>on?this.classes.add(value):this.classes.delete(value)};
  }
  set innerHTML(value){this.html=value;this.writes++;this.children=[];this.selectors.clear();}
  get innerHTML(){return this.html||'';}
  set textContent(value){this.text=value;this.writes++;this.children=[];}
  get textContent(){return this.text||'';}
  querySelector(selector){
    if(selector==='.mm-legend')return null;
    if(!this.selectors.has(selector)){
      const child=new Element();child.parentNode=this;this.selectors.set(selector,child);this.children.push(child);
      if(selector==='form')child.elements=Object.fromEntries(['query','type','industry','party','min'].map(key=>[key,{value:''}]));
    }
    return this.selectors.get(selector);
  }
  querySelectorAll(){return [];}
  contains(node){return this===node || this.children.some(child=>child.contains?.(node));}
  replaceChildren(...children){this.writes++;this.children=children;for(const child of children)child.parentNode=this;}
  append(...children){this.children.push(...children);for(const child of children)child.parentNode=this;}
  remove(){if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(child=>child!==this);this.parentNode=null;}
  setAttribute(name,value){this.attributes[name]=value;}
}

function harness({withoutSignal=false,delayedResearch=false,delayedData=false}={}) {
  const elements=new Map(),element=id=>{if(!elements.has(id))elements.set(id,new Element());return elements.get(id);};
  const pending=deferred(),started=deferred(),writes=[],mounts=[],graphs={federal:{nodes:[],edges:[]},qld:{nodes:[],edges:[]}};
  let url=new URL('http://localhost/money?q=federal+fixture');
  const location={get href(){return url.href},get pathname(){return url.pathname},get search(){return url.search}};
  const document=Object.assign(new EventTarget(),{head:new Element(),activeElement:null,querySelector:()=>null,querySelectorAll:()=>[],createElement:()=>new Element()});
  const context={module:{exports:{}},document,location,URL,URLSearchParams,AbortController,DOMException,Response,setTimeout,clearTimeout,CustomEvent,
    history:{state:null,replaceState(_state,_title,next){url=new URL(next,url);writes.push(url.href);}},
    fetch:async()=>{throw Error('Unexpected privacy validation request');},
    $:element,moneyMapHandle:null,moneyResearch:null,readMoneyFilters,
    MONEY_JURISDICTIONS:{federal:{file:'/graph/money.json'},qld:{file:'/graph/money.qld.json'}},
    renderMoneySwitch:jur=>element('money-jur').textContent=jur,
    loadMoneyFile:async jur=>{if(delayedData && jur==='federal'){started.resolve();await pending.promise;}return graphs[jur];},moneyFineprintHTML:jur=>jur,askHash:()=>'',replaceRoute(){},matchMedia:()=>({matches:false}),
  };
  runInNewContext(research.outputFiles[0].text,context);
  context.exports=context.module.exports;
  const mountMapResearch=context.exports.mountMapResearch;
  const researchModule={mountMapResearch:async(container,data,options)=>{
    if(delayedResearch && data===graphs.federal){started.resolve();await pending.promise;return {destroy(){context.oldHandleDestroyed=true;}};}
    return mountMapResearch(container,data,withoutSignal?{...options,signal:undefined}:options);
  }};
  context.loadModule=async path=>{
    if(path.startsWith('/map-research.js'))return researchModule;
    if(path.startsWith('/money-records.js'))return {readMoneyFilters};
    if(path.startsWith('/money-journeys.js'))return {mountMoneyJourneys:()=>({destroy(){},setRoute(){}})};
    assert.ok(path.startsWith('/money-map.js'));
    return {mountMoneyMap:async(root,file)=>{
      mounts.push(file);root.classList.add('mm-root');root.textContent=file;
      return {destroy(){root.classList.remove('mm-root');},setPaused(){},setFilters(){}};
    }};
  };
  runInNewContext(lifecycle,context);
  return {context,element,pending,started,writes,mounts,eval:code=>runInNewContext(code,context),navigate:next=>{url=new URL(next,url);}};
}

for(const withoutSignal of [false,true]) {
  test(`a delayed jurisdiction cannot change the newer URL, map or research controls${withoutSignal?' using the generation guard':''}`,async()=>{
    const h=harness({withoutSignal,delayedData:true}),old=h.context.mountMoney('federal',null,new URLSearchParams('q=federal+fixture'));
    await h.started.promise;
    h.navigate('/money?jur=qld&q=queensland+fixture');
    await h.context.mountMoney('qld',null,new URLSearchParams('jur=qld&q=queensland+fixture'));
    const newer={url:h.context.location.href,writes:h.writes.length,rootWrites:h.element('money-map-root').writes,controls:h.element('money-research').innerHTML,results:h.element('money-research-results').children[0],handle:h.context.moneyResearch};
    h.pending.resolve();await old;
    assert.equal(h.context.location.href,newer.url);
    assert.equal(h.writes.length,newer.writes,'no stale history write');
    assert.equal(h.element('money-map-root').writes,newer.rootWrites,'no stale DOM write');
    assert.equal(h.element('money-map-root').classList.contains('mm-root'),true);
    assert.equal(h.element('money-map-root').textContent,'/graph/money.qld.json');
    assert.equal(h.element('money-fineprint').innerHTML,'qld');
    assert.equal(h.element('money-research').innerHTML,newer.controls);
    assert.equal(h.element('money-research-results').children[0],newer.results);
    assert.equal(h.context.moneyResearch,newer.handle);
    assert.equal(h.eval('moneyMapJur'),'qld');
    assert.deepEqual(h.mounts,['/graph/money.qld.json']);
    h.context.moneyResearch.destroy();
  });
}

test('cancelled research setup has no history or DOM effects without a generation callback',async()=>{
  const h=harness(),controller=new AbortController(),host=h.element('money-research');
  controller.abort();h.navigate('/money?jur=qld');host.innerHTML='Current controls';
  assert.equal(await h.context.exports.mountMapResearch(host,{nodes:[],edges:[]},{signal:controller.signal}),null);
  assert.equal(h.context.location.search,'?jur=qld');assert.deepEqual(h.writes,[]);
  assert.equal(host.innerHTML,'Current controls');
});

test('a returned stale research handle is disposed before assignment or map mounting',async()=>{
  const h=harness({delayedResearch:true}),old=h.context.mountMoney('federal');
  await h.started.promise;h.navigate('/money?jur=qld&q=queensland+fixture');await h.context.mountMoney('qld');
  const current=h.context.moneyResearch;h.pending.resolve();await old;
  assert.equal(h.context.oldHandleDestroyed,true);assert.equal(h.context.moneyResearch,current);
  assert.deepEqual(h.mounts,['/graph/money.qld.json']);assert.equal(h.element('money-map-root').classList.contains('mm-root'),true);
  current.destroy();
});

const graph=readFileSync(new URL('../graph/index.ts',import.meta.url),'utf8');
const mountPrefix=graph.slice(graph.indexOf('export async function mountMoneyMap('),graph.indexOf('  const graph = buildGraph(raw)',graph.indexOf('export async function mountMoneyMap(')));
const mapSetup=ts.transpileModule(mountPrefix.replace('export ','')+'}',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
for(const useSignal of [false,true]) {
  test(`map data loading checks ${useSignal?'cancellation':'generation'} before adding active styling or mounting`,async()=>{
    const source=deferred(),started=deferred(),root=new Element(),controller=new AbortController();let current=true,paint=0;
    const mount=runInNewContext(mapSetup+';mountMoneyMap',{DOMException,fetch:async()=>({ok:true,json:async()=>{started.resolve();await source.promise;return {nodes:[],edges:[]};}}),
      injectStyles:()=>paint++,
      webglAvailable:()=>false,mountConnectionFallback:()=>paint++,
    });
    const pending=mount(root,'/graph/fixture.json',useSignal?{signal:controller.signal}:{isCurrent:()=>current});
    await started.promise;
    if(useSignal)controller.abort();else current=false;
    root.classList.add('mm-root');root.textContent='Newer map';source.resolve({});
    await assert.rejects(pending,{name:'AbortError'});
    assert.equal(paint,0);assert.equal(root.textContent,'Newer map');assert.equal(root.classList.contains('mm-root'),true);
  });
}
