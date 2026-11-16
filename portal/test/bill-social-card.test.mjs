import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import {billTitle} from '../src/seo-titles.ts';
const source=readFileSync(new URL('../src/index.ts',import.meta.url),'utf8');
const parsed=ts.createSourceFile('index.ts',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
const names=new Set(['billMeta','BILL_STATUS']);
const statements=parsed.statements.filter(n=>ts.isFunctionDeclaration(n)?names.has(n.name?.text):ts.isVariableStatement(n)&&n.declarationList.declarations.some(d=>names.has(d.name.getText(parsed))));
const code=ts.transpileModule(statements.map(n=>n.getText(parsed)).join('\n'),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
test('bill preview image names the bill and preserves draft status',async()=>{
 const c={SITE_ORIGIN:'https://opax.com.au',CHAMBER_NAMES:{},loadBills:async()=>({byKey:new Map([['draft',{title:'Public Records Bill',status:'exposure_draft',introduced:'2026-09-01'}],['unvoted',{title:'Example Bill',speeches:4}]])}),longDate:x=>x,num:String,andList:x=>x.join(', '),withTail:(a,b)=>a+' '+b,clip:x=>x,publisher:{},prerenderBlock:()=>'',billTitle};runInNewContext(code,c);
 const meta=await c.billMeta('draft',{});assert.equal(meta.card.title,'Public Records Bill');assert.match(meta.card.lines[0],/not yet introduced/);assert.equal(meta.canonical,'https://opax.com.au/bill/draft');assert.equal(meta.title,'Public Records Bill · OPAX');assert.match(meta.description,/consultation/);
 const missing=await c.billMeta('missing',{});assert.equal(missing.status,404);assert.equal(missing.card,undefined);
 const unvoted=await c.billMeta('unvoted',{});assert.match(unvoted.description,/4 speeches: who argued for and against it\./);
});
test('a bill preview image whose headline is a summary sentence says "Machine-written summary." in the image; one with no summary does not',async()=>{
 const {MACHINE_SUMMARY_WORDS}=await import('../public/machine-notice.js');
 assert.equal(MACHINE_SUMMARY_WORDS,'Machine-written summary.');
 const sentence='It would move the annual reporting date to 1 July.';
 const c={SITE_ORIGIN:'https://opax.com.au',CHAMBER_NAMES:{},MACHINE_SUMMARY_WORDS,PROCEDURAL_TITLES_PATH:'/x.json',billDivisionGroups:()=>({substantive:[],procedural:[]}),
  sharedAssetJson:async(_env,path)=>path==='/bills/summarised.json'?{summary:{sentences:[sentence,'A second sentence.']}}:path==='/bills/bare.json'?{summary:{sentences:[]}}:null,
  loadBills:async()=>({byKey:new Map([['summarised',{title:'Example Reporting Amendment Bill 2026',status:'before_parliament',introduced:'2026-03-01',has_summary:true}],['bare',{title:'Example Customs Bill 2026',status:'before_parliament',introduced:'2026-03-02',has_summary:true}]])}),
  longDate:x=>x,num:String,andList:x=>x.join(', '),withTail:(a,b)=>a+' '+b,clip:x=>x,publisher:{},prerenderBlock:()=>'',billTitle};runInNewContext(code,c);
 const card=(await c.billMeta('summarised',{})).card;
 // The words are drawn in the image, above the sentence they are about; the bill's own name and dates follow.
 assert.equal(card.kicker,'Bill · Machine-written summary.');
 assert.equal(card.title,sentence);
 assert.equal(card.lines[0],'Example Reporting Amendment Bill 2026');
 assert.match(card.lines[1],/Introduced/);
 // No summary sentence in the image: no such words.
 const plain=(await c.billMeta('bare',{})).card;
 assert.equal(plain.kicker,'Bill · Federal parliament');assert.equal(plain.title,'Example Customs Bill 2026');
 assert.ok(!JSON.stringify(plain).includes('Machine-written'));
 // Page metadata is as it was: the description is the record's facts, never the summary.
 const meta=await c.billMeta('summarised',{});
 assert.ok(!meta.description.includes(sentence)&&!meta.description.includes('Machine-written'));
 assert.ok(!source.includes("'Bill summary'"),'the old kicker is gone');
});
