// The shared table's loading, empty, error and refetch states (web/loading-states, 19 Oct 2026).
// A table that is still waiting for rows shows the loader, never "No results".
import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {dataTableHTML,mountDataTable,pendingPage} from '../public/datatable.js';
import {workbenchConfig,workbenchRows as rows} from '../public/datatable-workbench-data.js';

const EMPTY = /No results/;
const server = {...workbenchConfig,rows:undefined,source:{endpoint:'/__fixtures/table/receipts'},loadingLabel:'Loading receipts'};
const pageOf = (list,total = list.length) => ({rows:list,total,page:1,pageSize:5,facets:{}});

/** A real DOM whose fetches wait until the test answers them, in any order. */
function mount(html = dataTableHTML(server,pendingPage(server)),{ignoreAbort = false} = {}) {
  const dom = new JSDOM(`<!doctype html><main><div id="host">${html}</div></main>`,{url:'http://localhost/table'});
  const requests = [];
  dom.window.fetch = (input,{signal} = {}) => new Promise((resolve,reject) => {
    const request = {url:new URL(input),answer:body => resolve(Response.json(body)),fail:() => resolve(new Response('',{status:503}))};
    if (!ignoreAbort) signal?.addEventListener('abort',() => reject(Object.assign(new Error('aborted'),{name:'AbortError'})));
    requests.push(request);
  });
  const host = dom.window.document.getElementById('host');
  const handle = mountDataTable(host,server);
  const settle = async () => { for (let i = 0; i < 6; i++) await new Promise(setImmediate); };
  const body = () => host.querySelector('tbody').textContent;
  const status = () => host.querySelector('.dt-count').textContent;
  return {dom,host,handle,requests,settle,body,status,busy:() => host.getAttribute('aria-busy') === 'true'};
}

test('server HTML for a pending page shows the loader slot and a loading status, not the empty copy',() => {
  const html = dataTableHTML(server,pendingPage(server));
  assert.doesNotMatch(html,EMPTY);
  assert.match(html,/data-dt-loader aria-hidden="true"/);
  assert.match(html,/aria-busy="true"/);
  assert.match(html,/role="status"[^>]*>Loading receipts</);
  assert.match(html,/data-export disabled/);
  // The caption names the wait when no label is given.
  assert.match(dataTableHTML({...server,loadingLabel:undefined,caption:'Awards'},pendingPage(server)),/>Loading awards</);
  // A finished page with no rows is the empty state.
  assert.match(dataTableHTML(server,pageOf([],0)),EMPTY);
});

test('loading never renders the empty copy, and empty appears only after the request completes',async () => {
  const t = mount();
  await t.settle();
  assert.equal(t.requests.length,1);
  assert.doesNotMatch(t.body(),EMPTY);
  assert.ok(t.host.querySelector('[data-dt-loader]'));
  assert.ok(t.busy());
  assert.equal(t.status(),'Loading receipts');
  t.requests[0].answer(pageOf([],0));
  await t.settle();
  assert.match(t.body(),EMPTY);
  assert.equal(t.host.querySelector('[data-dt-loader]'),null);
  assert.equal(t.busy(),false);
  assert.equal(t.status(),'Showing 0–0 of 0');
  t.handle.destroy();
});

test('a container mounted with no server page at all starts pending',async () => {
  const dom = new JSDOM('<!doctype html><div id="host"></div>',{url:'http://localhost/table'});
  dom.window.fetch = () => new Promise(() => {});
  const host = dom.window.document.getElementById('host');
  const handle = mountDataTable(host,server);
  await new Promise(setImmediate);
  assert.ok(host.querySelector('[data-dt-loader]'));
  assert.doesNotMatch(host.textContent,EMPTY);
  handle.destroy();
});

test('an error has its own copy and a retry, and the retry waits on the loader',async () => {
  const t = mount();
  await t.settle();
  t.requests[0].fail();
  await t.settle();
  assert.match(t.body(),/Could not load this table\./);
  assert.doesNotMatch(t.body(),EMPTY);
  assert.equal(t.status(),'Table unavailable');
  assert.ok(t.host.querySelector('[role="alert"] [data-retry]'));
  t.host.querySelector('[data-retry]').click();
  await t.settle();
  assert.equal(t.requests.length,2);
  assert.ok(t.host.querySelector('[data-dt-loader]'));
  assert.doesNotMatch(t.body(),/Could not load|No results/);
  t.requests[1].answer(pageOf(rows.slice(0,2),2));
  await t.settle();
  assert.equal(t.host.querySelectorAll('tbody tr').length,2);
  t.handle.destroy();
});

test('a refetch keeps the rows it has, marked busy and stale, until the new page answers',async () => {
  const t = mount();
  await t.settle();
  t.requests[0].answer(pageOf(rows.slice(0,5),9));
  await t.settle();
  const before = t.body();
  t.host.querySelector('[data-sort="name"]').click();
  await t.settle();
  assert.equal(t.requests.length,2);
  assert.equal(t.body(),before,'the old rows stay in place');
  assert.ok(t.busy());
  assert.ok(t.host.hasAttribute('data-dt-stale'),'the old rows are dimmed');
  assert.equal(t.status(),'Loading receipts');
  t.requests[1].answer(pageOf(rows.slice(4,9),9));
  await t.settle();
  assert.equal(t.busy(),false);
  assert.equal(t.host.hasAttribute('data-dt-stale'),false);
  assert.equal(t.status(),'Showing 1–5 of 9');
  t.handle.destroy();
});

test('a refetch from an empty answer waits on the loader rather than the old empty copy',async () => {
  const t = mount();
  await t.settle();
  t.requests[0].answer(pageOf([],0));
  await t.settle();
  assert.match(t.body(),EMPTY);
  const search = t.host.querySelector('[data-search]');
  search.value = 'works';
  search.closest('form').dispatchEvent(new t.dom.window.Event('submit',{bubbles:true,cancelable:true}));
  await t.settle();
  assert.equal(t.requests.length,2);
  assert.doesNotMatch(t.body(),EMPTY);
  assert.ok(t.host.querySelector('[data-dt-loader]'));
  t.handle.destroy();
});

test('a slow earlier response cannot overwrite a newer one',async () => {
  // This fetch ignores aborts, so the late answer really arrives and only the revision guard stops it.
  const t = mount(undefined,{ignoreAbort:true});
  await t.settle();
  t.requests[0].answer(pageOf(rows.slice(0,5),9));
  await t.settle();
  t.host.querySelector('[data-sort="name"]').click();
  await t.settle();
  t.host.querySelector('[data-sort="amount"]').click();
  await t.settle();
  assert.equal(t.requests.length,3);
  const newest = [{...rows[8],name:'Newest fixture page'}];
  t.requests[2].answer(pageOf(newest,1));
  await t.settle();
  t.requests[1].answer(pageOf([{...rows[0],name:'Stale fixture page'}],1));
  await t.settle();
  assert.match(t.body(),/Newest fixture page/);
  assert.doesNotMatch(t.body(),/Stale fixture page/);
  assert.equal(t.busy(),false);
  t.handle.destroy();
});

test('server rows on first paint are not dimmed while hydration re-checks them',async () => {
  const t = mount(dataTableHTML(server,pageOf(rows.slice(0,5),9)));
  await t.settle();
  assert.ok(t.busy());
  assert.equal(t.host.hasAttribute('data-dt-stale'),false);
  assert.equal(t.host.querySelector('[data-dt-loader]'),null);
  assert.equal(t.host.querySelectorAll('tbody tr').length,5);
  t.handle.destroy();
});

test('a failed hydration check keeps the server rows; a failed refetch after that shows the error',async () => {
  const t = mount(dataTableHTML(server,pageOf(rows.slice(0,5),9)));
  await t.settle();
  t.requests[0].fail();
  await t.settle();
  assert.equal(t.host.querySelectorAll('tbody tr').length,5);
  assert.doesNotMatch(t.body(),/Could not load/);
  assert.equal(t.busy(),false);
  t.host.querySelector('[data-sort="name"]').click();
  await t.settle();
  t.requests[1].answer(pageOf(rows.slice(0,5),9));
  await t.settle();
  t.host.querySelector('[data-sort="amount"]').click();
  await t.settle();
  t.requests[2].fail();
  await t.settle();
  assert.match(t.body(),/Could not load this table\./);
  t.handle.destroy();
});

test('Grants → Awards: the Worker’s first page shows at once on a cold load, otherwise the loader',async () => {
  const {grantsTableHTML,mountGrantsTable} = await import('../public/grants-table.js');
  const served = {rows:[{recipient:'Fixture Community Group',program:'Fixture Program',agency:'Department of Fixtures',amount:5000,start_date:'2025-07-01',electorate:'Fixtureton',jurisdiction:'federal',recipientId:'name:fixture',recipientAvailable:0}],total:1,page:1,pageSize:50,facets:{}};
  for (const cold of [true,false]) {
    const dom = new JSDOM(`<!doctype html><div id="prerender">${cold ? grantsTableHTML(served) : ''}</div><div id="body"></div>`,{url:'http://localhost/money/grants'});
    dom.window.fetch = () => new Promise(() => {});
    const body = dom.window.document.getElementById('body');
    const handle = await mountGrantsTable(body);
    await new Promise(setImmediate);
    assert.doesNotMatch(body.textContent,EMPTY);
    if (cold) {
      assert.match(body.querySelector('tbody').textContent,/Fixture Community Group/);
      assert.equal(dom.window.document.querySelector('#prerender [data-grants-table]'),null,'the served page is used once');
    } else {
      assert.ok(body.querySelector('[data-dt-loader]'));
      assert.equal(body.querySelector('.dt-count').textContent,'Loading grants');
    }
    handle.destroy();
  }
});
