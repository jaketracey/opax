import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
const source=readFileSync(new URL('../src/index.ts',import.meta.url),'utf8');
const parsed=ts.createSourceFile('index.ts',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
const names=new Set(['billMeta','BILL_STATUS']);
const statements=parsed.statements.filter(n=>ts.isFunctionDeclaration(n)?names.has(n.name?.text):ts.isVariableStatement(n)&&n.declarationList.declarations.some(d=>names.has(d.name.getText(parsed))));
const code=ts.transpileModule(statements.map(n=>n.getText(parsed)).join('\n'),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
test('bill preview image names the bill and preserves draft status',async()=>{
 const c={SITE_ORIGIN:'https://opax.com.au',CHAMBER_NAMES:{},loadBills:async()=>({byKey:new Map([['draft',{title:'Public Records Bill',status:'exposure_draft',introduced:'2026-09-01'}]])}),longDate:x=>x,num:String,andList:x=>x.join(', '),withTail:(a,b)=>a+' '+b,clip:x=>x,publisher:{},prerenderBlock:()=>''};runInNewContext(code,c);
 const meta=await c.billMeta('draft',{});assert.equal(meta.card.title,'Public Records Bill');assert.match(meta.card.lines[0],/not yet introduced/);assert.equal(meta.canonical,'https://opax.com.au/bill/draft');
 const missing=await c.billMeta('missing',{});assert.equal(missing.status,404);assert.equal(missing.card,undefined);
});
