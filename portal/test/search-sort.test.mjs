import test from 'node:test';
import assert from 'node:assert/strict';
import { compareSearchResults, SEARCH_SORTS } from '../src/search-sort.ts';
const records = [
 {slug:'3',title:'Bill 10',kind:'speech',date:null,score:3},
 {slug:'2',title:'bill 2',kind:'contract',date:'2025-01-01',score:2},
 {slug:'1',title:'Alpha',kind:'donor',date:'2001-05-06',score:1},
];
const order = sort => [...records].sort((a,b)=>compareSearchResults(a,b,sort)).map(r=>r.slug);
test('date sorting works both ways with undated records last',()=>{
 assert.deepEqual(order('newest'),['2','1','3']);
 assert.deepEqual(order('oldest'),['1','2','3']);
});
test('title sorting ignores case and handles numbers naturally',()=>{
 assert.deepEqual(order('title_asc'),['1','2','3']);
 assert.deepEqual(order('title_desc'),['3','2','1']);
});
test('record type follows displayed dataset labels, relevance keeps ranking',()=>{
 assert.deepEqual(order('type'),['1','2','3']);
 assert.deepEqual(order('relevance'),['3','2','1']);
 assert.equal(SEARCH_SORTS.size,6);
});
test('equal values break ties consistently and aggregate years are sortable',()=>{
 assert.ok(compareSearchResults({date:'2020',score:1,slug:'a'},{sort_date:'2020',score:1,slug:'b'},'oldest')<0);
 assert.ok(compareSearchResults({sort_date:'2019'},{date:'2025-01-01'},'oldest')<0);
});
