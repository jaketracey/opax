import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const source=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const href=runInNewContext(source.slice(source.indexOf('function recordTypeHref'),source.indexOf('function recordTypeLink'))+';recordTypeHref',{URLSearchParams});
test('result type links lead to dataset roots or typed search entry points',()=>{
 for(const [kind,path] of Object.entries({division:'/search?kind=division',speech:'/search?kind=speech',press_release:'/search?kind=press_release',contract:'/discover',receipt:'/money/receipts',grant:'/money/grants',agency:'/subject/agency',donor:'/subject/donor',bill:'/bills',interest:'/declared',report:'/reports'})) assert.equal(href(kind),path);
});
