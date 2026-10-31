import {guardAnswerAttribution} from './fixtures/ask-attribution.mjs';
import {speechPresentation, joinMixedSpeakers} from '../src/mixed-speakers.ts';
const runInNewContext = (code, context = {}, options) => { context.speechPresentation ??= speechPresentation; context.joinMixedSpeakers ??= joinMixedSpeakers; context.guardAnswerAttribution ??= guardAnswerAttribution; return baseVM(code, context, options); };
import * as passageText from '../src/passage-text.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext as baseVM} from 'node:vm';
import {build} from 'esbuild';
import ts from 'typescript';
import { isWitness } from '../public/speech-attribution.js';

const bundle=await build({entryPoints:[new URL('../src/ask-records.ts',import.meta.url).pathname],bundle:true,write:false,format:'esm',platform:'node'});
const records=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const parsed=ts.createSourceFile('index.ts',await readFile(new URL('../src/index.ts',import.meta.url),'utf8'),ts.ScriptTarget.Latest,true);
const names=new Set(['buildAskBody','askCacheInput','filterExpression','canonicalSpeaker','TOPIC_SLUGS','label','calibrate']);
const code=parsed.statements.filter(n=>ts.isFunctionDeclaration(n)?names.has(n.name?.text):ts.isVariableStatement(n)&&n.declarationList.declarations.some(d=>names.has(d.name.getText(parsed)))).map(n=>n.getText(parsed)).join('\n');
const evidenceBundle=await build({entryPoints:[new URL('../src/ask-evidence.ts',import.meta.url).pathname],bundle:true,write:false,format:'esm',platform:'node'});
const evidenceHelpers=await import('data:text/javascript;base64,'+Buffer.from(evidenceBundle.outputFiles[0].text).toString('base64'));
const scopeBundle=await build({entryPoints:[new URL('../src/ask-scope.ts',import.meta.url).pathname],bundle:true,write:false,format:'esm',platform:'node'});
const scopeHelpers=await import('data:text/javascript;base64,'+Buffer.from(scopeBundle.outputFiles[0].text).toString('base64'));
const payBundle=await build({entryPoints:[new URL('../src/ask-pay.ts',import.meta.url).pathname],bundle:true,write:false,format:'esm',platform:'node'});
const payHelpers=await import('data:text/javascript;base64,'+Buffer.from(payBundle.outputFiles[0].text).toString('base64'));
const worker={...passageText,isWitness,...records,...evidenceHelpers,...scopeHelpers,mentionsPay:payHelpers.mentionsPay};
runInNewContext(ts.transpile(code),worker);
const plain=value=>JSON.parse(JSON.stringify(value));


const window={question:'gambling',kind:'all',from:'2023',to:'2024',since:'2023-07-01',until:'2024-06-30'};
const fixtures=[
 ['before','2023-06-30'],['start','2023-07-01'],['end','2024-06-30'],['after','2024-07-01'],
 ['unknown',null],['year',null,'2023'],['span',null,'2023–2024'],['bad', '2024-02-31']
].map(([slug,date,dateLabel])=>({slug,date,dateLabel,kind:'receipt',resource:slug,title:'gambling '+slug,href:'/fixture/'+slug,snippet:'Evidence '+slug}));
const assets={fetch:async req=>{
 const path=new URL(req.url).pathname;
 const out=path.endsWith('manifest.json')?{version:'1234567890abcdef',count:fixtures.length,recordShardSize:100,coverage:'Fixture corpus only',counts:{receipt:fixtures.length}}:
 path.endsWith('meta.json')?fixtures.map(()=>['receipt',2023,2024,'','','','']):
 path.includes('terms-')?{gambling:fixtures.flatMap((_,i)=>[i,1])}:fixtures;
 return Response.json(out);
}};
test('ordinary fallback platform retrieval retains exact fiscal boundaries',()=>{
 const body=plain(worker.buildAskBody(window));
 const created=body.filter_expression.field.and.find(x=>x.prop==='created');
 assert.deepEqual(created,{prop:'created',since:'2023-07-01T00:00:00Z',until:'2024-06-30T23:59:59Z'});
});
test('exact date windows cannot collide in the answer cache',()=>{
 const key=worker.askCacheInput(window,'fixture');
 assert.notEqual(key,worker.askCacheInput({...window,since:'2023-08-01',until:'2024-05-31'},'fixture'));
 assert.notEqual(key,worker.askCacheInput({...window,since:undefined,until:undefined},'fixture'));
});
test('bounded catalogue candidates retain boundary days but exclude outside, unknown, invalid dates and overlapping aggregates',async()=>{
 const out=await records.retrieveAskRecords(window,assets);
 assert.deepEqual(out.records.map(r=>r.slug).sort(),['end','start']);
 assert.match(out.coverage,/bounded/i);
 assert.match(out.coverage,/not.*complete/i);
});
test('year-only and unconstrained catalogue requests retain existing behavior',async()=>{
 for(const input of [{question:'gambling'}, {...window,since:undefined,until:undefined}]){
  const out=await records.retrieveAskRecords(input,assets);
  assert.ok(out.records.some(r=>r.slug==='span'));
  assert.ok(out.records.some(r=>r.slug==='before'));
 }
});

test('one-sided exact windows remain exact and do not admit undated rows',async()=>{
 const lower={...window,from:undefined,to:undefined,until:undefined};
 const upper={...window,from:undefined,to:undefined,since:undefined};
 for(const [input,expected] of [[lower,['after','end','start']], [upper,['before','end','start','year']]]){
  const out=await records.retrieveAskRecords(input,assets);
  assert.deepEqual(out.records.map(r=>r.slug).sort(),expected);
  const created=plain(worker.buildAskBody(input)).filter_expression.field.and.find(x=>x.prop==='created');
  assert.equal(created.since,input.since?input.since+'T00:00:00Z':undefined);
  assert.equal(created.until,input.until?input.until+'T23:59:59Z':undefined);
 }
});
test('fully-contained year spans retain their own period, not a fiscal subtotal',async()=>{
 const out=await records.retrieveAskRecords({...window,since:'2023-01-01',until:'2024-12-31'},assets);
 assert.ok(out.records.some(r=>r.slug==='span' && r.dateLabel==='2023–2024'));
 assert.ok(!out.records.some(r=>['bad','unknown'].includes(r.slug)));
 assert.match(out.coverage,/not.*recalculated period subtotal/);
 assert.equal(out.total,out.records.length);
});

test('no eligible candidate is reported as no bounded evidence, not a complete negative',async()=>{
 const out=await records.retrieveAskRecords({...window,since:'2024-05-01',until:'2024-05-31'},assets);
 assert.deepEqual(out.records,[]);
 assert.equal(out.total,0);
 assert.match(out.coverage,/bounded/);
 assert.match(out.coverage,/not a complete inventory/);
});
test('unconstrained cache key shape remains backwards compatible',()=>{
 const key=JSON.parse(worker.askCacheInput({question:'gambling'},'fixture'));
 assert.ok(!Object.hasOwn(key,'since'));
 assert.ok(!Object.hasOwn(key,'until'));
 assert.equal(worker.askCacheInput({question:'gambling'},'fixture'),worker.askCacheInput({question:'gambling',since:undefined,until:undefined},'fixture'));
});
