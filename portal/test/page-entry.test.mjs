import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { pageEntry } from '../src/page-entry.ts';
const origin = 'http://localhost:8787';
test('homepage resolves its own document while research and profiles use normal routing', async () => {
  const calls = [];
  const assets = { async fetch(req) { calls.push(req.url); return new Response('homepage'); } };
  assert.equal(await (await pageEntry(new Request(origin + '/?utm_source=test'), assets)).text(), 'homepage');
  assert.deepEqual(calls, [origin + '/home']);
  for (const path of ['/ask', '/ask?view=search&q=housing', '/subject/person/andrew-wilkie']) assert.equal(await pageEntry(new Request(origin + path), assets), null);
  assert.equal(await (await pageEntry(new Request(origin, { method:'HEAD' }), assets)).text(), '');
});
test('legacy search and question links preserve queries and filters', async () => {
  const assets = { fetch() { throw Error('unexpected asset read'); } };
  for (const method of ['GET', 'HEAD']) for (const path of ['/search', '/search/']) {
    const result = await pageEntry(new Request(origin + path + '?q=housing&state=vic&mode=keyword&kind=speech&page=3&sort=newest', {method}), assets);
    assert.equal(result.status, 302);
    const url = new URL(result.headers.get('location'), origin);
    assert.equal(url.pathname, '/ask');
    assert.deepEqual(Object.fromEntries(url.searchParams), {q:'housing',state:'vic',mode:'keyword',kind:'speech',page:'3',sort:'newest',view:'search'});
  }
  for (const key of ['q','ask']) {
    const result = await pageEntry(new Request(origin + '/?' + key + '=housing&kind=speech'), assets);
    const url = new URL(result.headers.get('location'), origin);
    assert.equal(url.pathname,'/ask');
    assert.equal(url.searchParams.get('q'),'housing');
    assert.equal(url.searchParams.get('kind'),'speech');
  }
});
test('client search links use the shared route and preserve keyword mode', () => {
  const source = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  const pathCode = source.slice(source.indexOf('function pathFor('), source.indexOf('/** Rewrite the address'));
  const searchCode = source.slice(source.indexOf('function searchHash('), source.indexOf('const SEARCH_PER_PAGE'));
  const {pathFor,searchHash} = runInNewContext(pathCode + searchCode + ';({pathFor,searchHash})', {URL,URLSearchParams,location:{origin}});
  const url = new URL(searchHash('housing', {mode:'keyword',state:'vic'}, 2, 'newest'), origin);
  assert.equal(url.pathname,'/ask');
  assert.deepEqual(Object.fromEntries(url.searchParams), {view:'search',q:'housing',state:'vic',mode:'keyword',sort:'newest',page:'2'});
  assert.equal(pathFor('/search?q=housing&mode=keyword'), '/ask?q=housing&mode=keyword&view=search');
});
