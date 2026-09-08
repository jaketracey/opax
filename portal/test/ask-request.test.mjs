import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const code=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const body=runInNewContext(code.slice(code.indexOf('function askRequestBody('),code.indexOf('async function runAsk('))+';askRequestBody');

test('browser-recognised speakers search speeches even when the default is all records',()=>{
 const out=body('What did Kate Chaney say about housing affordability?','all',{},'Kate Chaney');
 assert.equal(out.speaker,'Kate Chaney');assert.equal(out.kind,'speech');
 assert.equal(body('What did Wilkie say about poker machines?','all',{},'Andrew Wilkie').kind,'speech');
});
test('explicit person and record controls take precedence over automatic names',()=>{
 const out=body('What did Kate Chaney say?','all',{speaker:'Andrew Wilkie',from:'2020'},'Kate Chaney');
 assert.equal(out.speaker,'Andrew Wilkie');assert.equal(out.kind,'all');assert.equal(out.from,'2020');
 assert.equal(body('What was said?','all',{},null).speaker,undefined);
});
