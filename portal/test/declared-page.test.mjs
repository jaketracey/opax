import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
const source = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const declaredPage = runInNewContext(source.slice(source.indexOf('function declaredPage('), source.indexOf('async function renderDeclaredPage(')) + ';declaredPage', { DECLARED_BUCKET_LABELS: { gifts: 'Gift', travel: 'Sponsored travel or hospitality' } });
const parties = new Map([['jane doe', 'Labor'], ['john smith', 'Liberal']]);
const rows = Array.from({length: 45}, (_, id) => ({id, name: id % 2 ? 'Jane Doe' : 'John Smith', bucket: id % 2 ? 'gifts' : 'travel', description: 'Café event', ties: [{organisation: 'Example Company'}]}));
test('declaration pages cover the matching set once, with safe bounds', () => {
 assert.equal(declaredPage(rows, parties).items.length, 20);
 assert.equal(declaredPage(rows, parties, {page: 2}).items[0].id, 20);
 assert.equal(declaredPage(rows, parties, {page: 999}).items.length, 5);
 assert.equal(declaredPage(rows, parties, {page: 'invalid'}).page, 1);
 assert.equal(declaredPage(rows, parties, {page: -3}).page, 1);
});
test('declaration search and filters combine before pagination', () => {
 const result = declaredPage(rows, parties, {q: 'JANE cafe example', party: 'Labor', category: 'gifts', person: 'Jane Doe', page: 2});
 assert.equal(result.pages, 2);
 assert.equal(result.items.length, 2);
 assert.ok(result.items.every(item => item.name === 'Jane Doe'));
 assert.equal(declaredPage(rows, parties, {q: 'hospitality'}).pages, 2);
});
test('unmatched declaration search returns an empty first page', () => {
 const result = declaredPage(rows, parties, {q: 'missing', page: 10});
 assert.equal(result.items.length, 0);
 assert.equal(result.page, 1);
 assert.equal(result.pages, 1);
});
