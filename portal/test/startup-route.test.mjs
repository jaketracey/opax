import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {JSDOM} from 'jsdom';
import {pageMenuHTML} from '../public/page-actions-menu.js';
const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const code=app.slice(app.indexOf('function routePrerequisites('),app.indexOf('async function route()'));
test('irrelevant pending helpers do not block money, tables or Ask; records retain identity and attribution',async()=>{
  const optional=new Promise(()=>{}),ready=Promise.resolve(),context={uiLabelsReady:ready,attributionReady:ready,personUrlsReady:ready,donorViewReady:ready,growthModulesReady:optional,pageMenusReady:optional,voteTablesReady:optional,saDisplayReady:optional};
  const prerequisites=runInNewContext(code+';routePrerequisites',context);
  for(const route of [['money'],['money','receipts'],['ask'],['subject','person'],['bill','example']]) {
    const deps=prerequisites(route);assert.ok(!deps.includes(optional));await Promise.allSettled(deps);
  }
  for(const view of ['subject','bill','doc','ask','search']) {
    const identity={},attribution={};const get=runInNewContext(code+';routePrerequisites',{...context,personUrlsReady:identity,attributionReady:attribution});
    assert.ok(get([view]).includes(identity));assert.ok(get([view]).includes(attribution));
  }
  assert.ok(prerequisites(['chat']).includes(optional),'historical chat must await the applicable SA display policy');
});
test('page menus mount after import without rerouting or losing the active form',()=>{
  const code=app.slice(app.indexOf('function moreMenuHTML('),app.indexOf('function mountPendingPageMenus('));
  const render=runInNewContext(code+';moreMenuHTML',{pageMenus:undefined,esc:s=>s.replaceAll('"','&quot;')});
  assert.match(render([{label:'Source',href:'/methods'}],'Actions',{}),/data-pending-page-menu=/);
});
test('late menus preserve default arguments, input state and accessible controls',()=>{
  const start=app.indexOf('function mountPendingPageMenus(');
  const mountCode=app.slice(start,app.indexOf('\n}',start)+2);
  const dom=new JSDOM('<input value="Unsubmitted question"><main></main>');
  const context={pageMenus:undefined,document:dom.window.document,esc:s=>s.replaceAll('"','&quot;')};
  const code=app.slice(app.indexOf('function moreMenuHTML('),start);
  const render=runInNewContext(code+';moreMenuHTML',context);
  dom.window.document.querySelector('main').innerHTML=render([{label:'Source',href:'/methods'}],'Actions');
  context.pageMenus={pageMenuHTML};runInNewContext(mountCode+';mountPendingPageMenus()',context);
  assert.equal(dom.window.document.querySelector('input').value,'Unsubmitted question');
  assert.ok(dom.window.document.querySelector('button[aria-haspopup="menu"]'));
  assert.equal(dom.window.document.querySelector('a').getAttribute('href'),'/methods');
  assert.equal(dom.window.document.querySelector('[data-pending-page-menu]'),null);
});
