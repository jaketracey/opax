import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {JSDOM} from 'jsdom';

test('P2 delayed step-module import cannot paint a previous run after the slot is cleared',async()=>{
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 const start=app.indexOf('async function renderAskStepsLine'),end=app.indexOf('// The same menagerie',start);
 assert.ok(start>=0);const dom=new JSDOM('<div id="slot"></div>'),slot=dom.window.document.getElementById('slot');
 let release;const module=new Promise(resolve=>release=resolve);
 const context={askStepsRenderOwners:new WeakMap(),loadModule:()=>module};vm.createContext(context);
 vm.runInContext(app.slice(start,end).replace('import(ASK_STEPS_JS)','loadModule()'),context);
 const old=context.renderAskStepsLine(slot,{steps:[{id:1,label:'Old run'}]});
 await context.renderAskStepsLine(slot,null);
 release({renderStepsLine(el){el.textContent='stale steps';el.hidden=false}});await old;
 assert.equal(slot.textContent,'');assert.equal(slot.hidden,true);
});
